import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";
import { Jimp } from "jimp";

// Initialize the Express router
const app = express();
const PORT = Number(process.env.PORT || 3000);

// Enable CORS middleware to support cross-origin requests from the PWA
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-requested-with");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// Increase request size limits to support passing high-definition images if needed
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ limit: "25mb", extended: true }));

// ---------------------------------------------------------------------------
// Security: optional shared-secret authentication + in-memory rate limiting.
// When API_SHARED_SECRET is set, mutating/costly endpoints require the same
// value in the "x-api-key" header (the control panel reads it from the
// localStorage key "car_ia_api_secret"; the PWA must be configured likewise).
// When it is not set, behaviour is unchanged (open API) so nothing breaks
// until you opt in.
// ---------------------------------------------------------------------------
const API_SHARED_SECRET = process.env.API_SHARED_SECRET || "";

if (!API_SHARED_SECRET) {
  console.warn("⚠️ API_SHARED_SECRET non défini : l'API est ouverte. Définissez-le (et configurez la PWA/le panneau) pour protéger les endpoints.");
}

function isValidApiSecret(req: express.Request): boolean {
  if (!API_SHARED_SECRET) return true; // auth disabled until a secret is configured
  const provided = req.headers["x-api-key"];
  if (typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(API_SHARED_SECRET);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireApiSecret(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (isValidApiSecret(req)) return next();
  res.status(401).json({ success: false, error: "Clé API invalide ou absente (header x-api-key requis)." });
}

// Minimal per-IP/per-route rate limiter (fixed 1-minute window, no dependency)
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(maxPerMinute: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const now = Date.now();
    if (rateBuckets.size > 10000) {
      for (const [key, bucket] of rateBuckets) {
        if (bucket.resetAt < now) rateBuckets.delete(key);
      }
    }
    // Bucket on the route prefix (not the full path) so /api/jobs/<id> variants
    // share one counter instead of each getting a fresh bucket
    const routePrefix = req.path.split("/").slice(0, 3).join("/");
    const key = `${req.ip}|${req.method} ${routePrefix}`;
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
      return next();
    }
    if (bucket.count >= maxPerMinute) {
      res.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000).toString());
      return res.status(429).json({ success: false, error: "Trop de requêtes, réessayez dans une minute." });
    }
    bucket.count++;
    next();
  };
}

// Helper function to save uploaded file locally
function saveUploadedFile(targetPath: string, content: any): string | null {
  try {
    // Prevent directory traversal attacks
    const cleanPath = targetPath.replace(/\.\./g, "").replace(/^\/+/, "");
    const localPath = path.join(process.cwd(), "uploads", cleanPath);
    const localDir = path.dirname(localPath);

    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }

    let bufferToSave: Buffer;

    if (typeof content === "string" && content.startsWith("data:")) {
      const matches = content.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches[2]) {
        bufferToSave = Buffer.from(matches[2], "base64");
      } else {
        bufferToSave = Buffer.from(content, "utf-8");
      }
    } else if (typeof content === "string") {
      const ext = path.extname(cleanPath).toLowerCase();
      const isImgExt = [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext);
      if (isImgExt) {
        try {
          const cleanContent = content.replace(/[\s\r\n]+/g, "");
          bufferToSave = Buffer.from(cleanContent, "base64");
        } catch {
          bufferToSave = Buffer.from(content, "utf-8");
        }
      } else {
        try {
          bufferToSave = Buffer.from(content, "base64");
          if (bufferToSave.toString("base64") !== content) {
            bufferToSave = Buffer.from(content, "utf-8");
          }
        } catch {
          bufferToSave = Buffer.from(content, "utf-8");
        }
      }
    } else if (Buffer.isBuffer(content)) {
      bufferToSave = content;
    } else {
      return null;
    }

    fs.writeFileSync(localPath, bufferToSave);
    console.log(`💾 File saved locally: uploads/${cleanPath} (${bufferToSave.length} bytes)`);
    return `/uploads/${cleanPath}`;
  } catch (err) {
    console.error("Local file save error:", err);
    return null;
  }
}

// Serve uploaded directories statically first
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use("/users", express.static(path.join(process.cwd(), "uploads", "users")));
app.use("/local_test_images", express.static(path.join(process.cwd(), "src", "local_test_images")));

// Catch-all POST/PUT handler for direct storage simulation (e.g. /users/guest/references/...)
const usersUploadLimiter = rateLimit(30);
app.all("/users/*", (req, res, next) => {
  if (req.method !== "POST" && req.method !== "PUT") {
    return next();
  }
  if (!isValidApiSecret(req)) {
    return res.status(401).json({ success: false, error: "Clé API invalide ou absente (header x-api-key requis)." });
  }
  usersUploadLimiter(req, res, next);
}, (req, res, next) => {
  if (req.method !== "POST" && req.method !== "PUT") {
    return next();
  }

  const targetPath = req.path; // e.g. /users/guest/references/filename.jpg
  
  const processUploadedContent = (content: any) => {
    const savedUrl = saveUploadedFile(targetPath, content);
    if (savedUrl) {
      return res.json({
        success: true,
        url: targetPath,
        localUrl: savedUrl,
        msg: `Uploaded locally at ${savedUrl}`
      });
    } else {
      return res.status(500).json({ success: false, error: "Failed to save file locally" });
    }
  };

  // If the body parser already consumed and parsed the request
  if (req.body && (typeof req.body !== "object" || Object.keys(req.body).length > 0)) {
    let contentToSave = req.body;
    if (req.body.dataUrl || req.body.image || req.body.file || req.body.data) {
      contentToSave = req.body.dataUrl || req.body.image || req.body.file || req.body.data;
    } else if (typeof req.body === "object") {
      try {
        contentToSave = JSON.stringify(req.body);
      } catch {
        contentToSave = req.body;
      }
    }
    return processUploadedContent(contentToSave);
  }

  // Fallback if the stream is unconsumed
  let rawBody = "";
  let streamClosed = false;

  req.on("data", (chunk) => {
    rawBody += chunk.toString();
  });

  req.on("end", () => {
    if (streamClosed) return;
    streamClosed = true;
    let contentToSave: any = rawBody;
    try {
      const parsed = JSON.parse(rawBody);
      contentToSave = parsed.dataUrl || parsed.image || parsed.file || parsed.data || rawBody;
    } catch {
      // Keep rawBody
    }
    return processUploadedContent(contentToSave);
  });

  // Safety timeout: if stream is already consumed but req.body is empty/unpopulated,
  // do not let the client hang. Call processUploadedContent after 200ms.
  setTimeout(() => {
    if (!streamClosed) {
      streamClosed = true;
      console.warn(`⚠️ Warning: Stream read timeout for ${targetPath}. Falling back.`);
      return processUploadedContent(rawBody || req.body || "");
    }
  }, 200);
});

// JSON fallback upload endpoint
app.post("/api/upload", requireApiSecret, rateLimit(30), (req, res) => {
  const { path: targetPath, dataUrl, image, file, data, filename } = req.body;
  const pathSpec = targetPath || filename || `file_${Date.now()}.png`;
  const content = dataUrl || image || file || data;

  if (!content) {
    return res.status(400).json({ success: false, error: "Missing file content" });
  }

  const savedUrl = saveUploadedFile(pathSpec, content);
  if (savedUrl) {
    res.json({ success: true, url: savedUrl, localUrl: savedUrl });
  } else {
    res.status(500).json({ success: false, error: "Failed to save file" });
  }
});

// CORS proxy endpoint for PWA image download and loading.
// Restricted to Google Cloud Storage hosts to prevent SSRF abuse
// (fetching internal endpoints like the GCP metadata server through this proxy).
const PROXY_ALLOWED_HOSTS = new Set([
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
]);

app.get("/api/proxy", rateLimit(60), async (req, res) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl) {
    return res.status(400).send("Missing url query parameter");
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return res.status(400).send("Invalid url query parameter");
  }
  if (parsedUrl.protocol !== "https:" || !PROXY_ALLOWED_HOSTS.has(parsedUrl.hostname)) {
    return res.status(403).send("Proxy restricted to Firebase/Google Cloud Storage URLs");
  }
  try {
    const response = await fetch(parsedUrl);
    if (!response.ok) {
      return res.status(response.status).send(`Failed to fetch image: ${response.statusText}`);
    }
    const contentType = response.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (err: any) {
    console.error("CORS proxy error:", err);
    res.status(500).send(`CORS proxy failed: ${err.message}`);
  }
});

// Helper to parse Firebase Storage URLs into bucket and object parts
function parseFirebaseStorageUrl(urlStr: string) {
  try {
    const parsed = new URL(urlStr);
    if (parsed.hostname === "firebasestorage.googleapis.com") {
      const parts = parsed.pathname.split("/o/");
      if (parts.length === 2) {
        const bucketPart = parts[0].replace("/v0/b/", "");
        const objectPart = parts[1]; // e.g., backgrounds%2Fdesert_road_hd.jpg
        return {
          bucket: bucketPart,
          objectEncoded: objectPart,
          objectDecoded: decodeURIComponent(objectPart)
        };
      }
    }
  } catch (err) {
    console.warn("Failed to parse Firebase Storage URL:", err);
  }
  return null;
}

// Global cached token for Service Account
let cachedToken: string | null = null;
let tokenExpiry = 0;
let tokenUnavailableUntil = 0; // negative cache: avoid re-probing the metadata server on every call when running locally

async function getServiceAccountToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }
  if (now < tokenUnavailableUntil) {
    return null;
  }
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1200); // 1.2s timeout for metadata server

    const res = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-account/default/token", {
      headers: { "Metadata-Flavor": "Google" },
      signal: controller.signal
    });
    clearTimeout(id);

    if (res.ok) {
      const data: any = await res.json();
      if (data.access_token) {
        cachedToken = data.access_token;
        tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
        console.log("🔑 Successfully retrieved service account token from metadata server.");
        return cachedToken;
      }
    }
  } catch (err) {
    // Graceful error, means we are likely running locally or metadata server is not reachable
    console.log("ℹ️ Metadata server not available. Falling back to unauthenticated download.");
  }
  tokenUnavailableUntil = Date.now() + 60_000;
  return null;
}

// ---------------------------------------------------------------------------
// Firestore REST helpers — used for server-side history persistence and the
// optional job orchestrator. They authenticate with the service-account token
// from the metadata server, so they are only active when running on Google
// Cloud (locally every call gracefully returns null).
// ---------------------------------------------------------------------------
function loadFirebaseAppletConfig(): { projectId: string; databaseId: string } {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf-8");
    const cfg = JSON.parse(raw);
    return {
      projectId: process.env.FIREBASE_PROJECT_ID || cfg.projectId,
      databaseId: process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || "(default)",
    };
  } catch {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID || "gen-lang-client-0870404092",
      databaseId: process.env.FIRESTORE_DATABASE_ID || "(default)",
    };
  }
}
const firestoreConfig = loadFirebaseAppletConfig();

function firestoreBaseUrl(): string {
  return `https://firestore.googleapis.com/v1/projects/${firestoreConfig.projectId}/databases/${encodeURIComponent(firestoreConfig.databaseId)}/documents`;
}

function toFirestoreValue(value: any): any {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === "object") {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) fields[k] = toFirestoreValue(v);
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function fromFirestoreValue(value: any): any {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("mapValue" in value) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries((value.mapValue && value.mapValue.fields) || {})) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  if ("arrayValue" in value) {
    return ((value.arrayValue && value.arrayValue.values) || []).map(fromFirestoreValue);
  }
  return null;
}

function decodeFirestoreDoc(docObj: any): { id: string; updateTime: string; data: Record<string, any> } {
  const data: Record<string, any> = {};
  for (const [k, v] of Object.entries(docObj.fields || {})) {
    data[k] = fromFirestoreValue(v);
  }
  return {
    id: (docObj.name || "").split("/").pop() || "",
    updateTime: docObj.updateTime || "",
    data,
  };
}

// Returns the parsed JSON response, or null when no service-account token is
// available (i.e. running locally). Throws on HTTP errors.
async function firestoreRequest(method: string, url: string, body?: any): Promise<any | null> {
  const token = await getServiceAccountToken();
  if (!token) return null;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Firestore REST ${method} ${res.status}: ${errText.slice(0, 200)}`);
  }
  return res.json();
}

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-image";

function getGeminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "MY_GEMINI_API_KEY" || key.includes("YOUR_GEMINI")) {
    return null;
  }
  return key;
}

function buildFirebasePublicUrl(bucket: string, objectPath: string, tokenString?: string): string {
  const encodedPath = encodeURIComponent(objectPath);
  let url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media`;
  if (tokenString) {
    url += `&token=${tokenString}`;
  }
  return url;
}

async function uploadGeneratedImageToStorage(
  dataUrl: string,
  bucket: string,
  objectPath: string,
  stepsLogs: string[],
  baseUrl?: string
): Promise<{ storagePath: string; publicUrl: string }> {
  const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches?.[2]) {
    throw new Error("Format data URL invalide pour l'upload Storage.");
  }

  const mimeType = matches[1];
  const buffer = Buffer.from(matches[2], "base64");
  if (buffer.length === 0) {
    throw new Error("Le binaire de l'image générée est vide.");
  }

  const token = await getServiceAccountToken();
  stepsLogs.push(`☁️ [FIREBASE-STORAGE] Téléversement vers gs://${bucket}/${objectPath}...`);

  if (token) {
    const encodedObject = encodeURIComponent(objectPath);
    const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodedObject}`;
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": mimeType,
      },
      body: buffer,
    });

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      throw new Error(
        `Échec upload Firebase Storage (${uploadResponse.status}): ${errText.slice(0, 200)}`
      );
    }

    // Generate a unique Firebase download token (cryptographically random UUID v4 —
    // this token is the only access control on the uploaded image, so it must be unguessable)
    const downloadToken = crypto.randomUUID();

    // Update GCS metadata so Firebase recognises it as publicly accessible via token query param
    stepsLogs.push(`☁️ [FIREBASE-STORAGE] Association du token de téléchargement public Firebase...`);
    const patchUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodedObject}`;
    const patchResponse = await fetch(patchUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        metadata: {
          firebaseStorageDownloadTokens: downloadToken
        }
      }),
    });

    if (!patchResponse.ok) {
      const patchErr = await patchResponse.text();
      stepsLogs.push(`⚠️ [FIREBASE-STORAGE] Échec de l'association du token (${patchResponse.status}): ${patchErr.slice(0, 100)}...`);
    } else {
      stepsLogs.push(`✔️ [FIREBASE-STORAGE] Token de téléchargement associé avec succès !`);
    }

    const publicUrl = buildFirebasePublicUrl(bucket, objectPath, downloadToken);
    stepsLogs.push(`✔️ [FIREBASE-STORAGE] Upload réussi : ${publicUrl.slice(0, 80)}...`);
    return {
      storagePath: `gs://${bucket}/${objectPath}`,
      publicUrl,
    };
  }

  const localUrl = saveUploadedFile(objectPath, dataUrl);
  if (!localUrl) {
    throw new Error("Échec sauvegarde locale — token Service Account indisponible.");
  }

  let finalPublicUrl = localUrl;
  if (baseUrl) {
    finalPublicUrl = `${baseUrl.replace(/\/$/, "")}${localUrl}`;
  } else if (process.env.APP_URL) {
    finalPublicUrl = `${process.env.APP_URL.replace(/\/$/, "")}${localUrl}`;
  }

  stepsLogs.push(`⚠️ [FIREBASE-STORAGE] Token SA indisponible — sauvegarde locale : ${finalPublicUrl}`);
  return {
    storagePath: `local://${objectPath}`,
    publicUrl: finalPublicUrl,
  };
}

// Download and save images as local test files
app.post("/api/save-local", requireApiSecret, rateLimit(10), async (req, res) => {
  const { imageA, imageB, imageC } = req.body;
  const dirPath = path.join(process.cwd(), "src", "local_test_images");
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  const saved: string[] = [];
  const errors: string[] = [];

  const downloadAndSave = async (url: string, targetName: string) => {
    if (!url) return;
    if (!url.startsWith("http")) {
      console.log(`Skipping relative or local URL for download: ${url}`);
      return;
    }
    try {
      console.log(`Downloading ${url} for ${targetName}...`);
      
      const parsed = parseFirebaseStorageUrl(url);
      const token = await getServiceAccountToken();
      
      let fetchUrl = url;
      const headers: Record<string, string> = {};
      
      if (parsed && token) {
        fetchUrl = `https://storage.googleapis.com/download/storage/v1/b/${parsed.bucket}/o/${parsed.objectEncoded}?alt=media`;
        headers["Authorization"] = `Bearer ${token}`;
        console.log(`Using GCS Authorized download for ${targetName}: ${fetchUrl}`);
      }

      let response = await fetch(fetchUrl, { headers });
      if (!response.ok && headers["Authorization"]) {
        console.log(`GCS Authorized download failed with ${response.status} for ${targetName}. Retrying publicly...`);
        const publicHeaders = { ...headers };
        delete publicHeaders["Authorization"];
        response = await fetch(url, { headers: publicHeaders });
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(path.join(dirPath, targetName), buffer);
      saved.push(targetName);
      console.log(`Successfully saved ${targetName}`);
    } catch (err: any) {
      console.error(`Failed to download ${url}:`, err);
      errors.push(`${targetName}: ${err.message || err}`);
    }
  };

  await Promise.all([
    downloadAndSave(imageA, "imageA_local.jpg"),
    downloadAndSave(imageB, "imageB_local.png"),
    downloadAndSave(imageC, "imageC_local.jpg")
  ]);

  if (saved.length > 0) {
    res.json({ success: true, saved, errors });
  } else {
    res.status(500).json({ success: false, errors });
  }
});

// Endpoint to upload a file directly to the local test images directory
app.post("/api/upload-local", requireApiSecret, rateLimit(20), (req, res) => {
  const { filename, base64Data } = req.body;
  if (!filename || !base64Data) {
    return res.status(400).json({ success: false, error: "Filename and base64Data are required" });
  }

  // Validate filename to prevent directory traversal
  if (!["imageA_local.jpg", "imageB_local.png", "imageC_local.jpg"].includes(filename)) {
    return res.status(400).json({ success: false, error: "Invalid local filename" });
  }

  try {
    const dirPath = path.join(process.cwd(), "src", "local_test_images");
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Clean up base64 prefix if present (e.g., "data:image/png;base64,")
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    
    fs.writeFileSync(path.join(dirPath, filename), buffer);
    console.log(`📁 Uploaded and saved local file: ${filename} (size: ${buffer.length} bytes)`);
    return res.json({ success: true, filename, size: buffer.length });
  } catch (err: any) {
    console.error("Failed to upload local file:", err);
    return res.status(500).json({ success: false, error: err.message || err });
  }
});

const GEMINI_API_KEY = getGeminiApiKey();

// Active memory store for user isolated generations history
interface GenerationHistoryItem {
  id: string;
  userId: string;
  timestamp: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  imageSize: string;
  storagePath: string; // gs://bucket/users/userId/generations/...
  imageUrl: string;    // https://firebasestorage.googleapis.com/...
  tokens: {
    total: number;
    prompt: number;
    image: number;
  };
  costEuros: number;
  geometryGuidanceMode?: string;
  coordinatePromptMode?: "COORD_LONG" | "COORD_LIGHT";
  outputFilename?: string;
}

const userGenerationsHistory: GenerationHistoryItem[] = [];

// Firestore collection where the generation history is persisted (the
// in-memory array above survives only until the Cloud Run instance restarts)
const HISTORY_COLLECTION = "generations_history";

async function persistHistoryItemToFirestore(item: GenerationHistoryItem): Promise<void> {
  try {
    const url = `${firestoreBaseUrl()}/${HISTORY_COLLECTION}?documentId=${encodeURIComponent(item.id)}`;
    const encoded = toFirestoreValue(item);
    const result = await firestoreRequest("POST", url, { fields: encoded.mapValue.fields });
    if (result) {
      console.log(`🗃️ Historique persisté dans Firestore : ${HISTORY_COLLECTION}/${item.id}`);
    }
  } catch (err) {
    console.warn("⚠️ Échec de la persistance Firestore de l'historique :", err);
  }
}

async function fetchHistoryFromFirestore(userId: string): Promise<GenerationHistoryItem[] | null> {
  try {
    const rows = await firestoreRequest("POST", `${firestoreBaseUrl()}:runQuery`, {
      structuredQuery: {
        from: [{ collectionId: HISTORY_COLLECTION }],
        where: {
          fieldFilter: {
            field: { fieldPath: "userId" },
            op: "EQUAL",
            value: { stringValue: userId },
          },
        },
        limit: 200,
      },
    });
    if (!rows) return null;
    return rows
      .filter((row: any) => row.document)
      .map((row: any) => decodeFirestoreDoc(row.document).data as GenerationHistoryItem);
  } catch (err) {
    console.warn("⚠️ Lecture Firestore de l'historique impossible :", err);
    return null;
  }
}

// Store the last API health status globally in memory
let lastApiHealthStatus: {
  status: "unknown" | "healthy" | "unhealthy";
  lastChecked: string;
  errorMessage?: string;
} = {
  status: "unknown",
  lastChecked: new Date().toISOString()
};

// Active in-memory jobs store for real-time and polling fallback sync
interface JobState {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  imageUrl?: string;
  imageFinal?: string;
  error?: string;
}
const jobsStore: Record<string, JobState> = {};
const MAX_JOBS_IN_STORE = 200;

// Prevent unbounded memory growth: evict the oldest jobs beyond the cap
function pruneJobsStore() {
  const keys = Object.keys(jobsStore);
  if (keys.length > MAX_JOBS_IN_STORE) {
    for (const key of keys.slice(0, keys.length - MAX_JOBS_IN_STORE)) {
      delete jobsStore[key];
    }
  }
}

// GET /api/jobs/:jobId -> retrieve job status for local polling
app.get("/api/jobs/:jobId", rateLimit(120), (req, res) => {
  const { jobId } = req.params;
  const job = jobsStore[jobId];
  if (!job) {
    return res.json({
      id: jobId,
      status: "queued",
      progress: 0
    });
  }
  res.json(job);
});

// POST /api/jobs/:jobId -> update/sync job status from React app
app.post("/api/jobs/:jobId", requireApiSecret, rateLimit(60), (req, res) => {
  const { jobId } = req.params;
  const { status, progress, imageUrl, imageFinal, error } = req.body;
  
  jobsStore[jobId] = {
    id: jobId,
    status: status || "processing",
    progress: progress !== undefined ? Number(progress) : (jobsStore[jobId]?.progress || 0),
    imageUrl: imageUrl || jobsStore[jobId]?.imageUrl,
    imageFinal: imageFinal || jobsStore[jobId]?.imageFinal,
    error: error || jobsStore[jobId]?.error
  };
  pruneJobsStore();

  res.json({ success: true, job: jobsStore[jobId] });
});

// GET endpoint to retrieve the API health status
app.get("/api/gemini/health", (req, res) => {
  res.json({ success: true, ...lastApiHealthStatus });
});

// API Route to list generations history for any User ID.
// Reads from Firestore when service-account credentials are available (data
// survives restarts), merged with the in-memory items of the current instance.
app.get("/api/gemini/history", requireApiSecret, rateLimit(30), async (req, res) => {
  const userId = (req.query.userId as string) || "user_test_99";
  const memoryHistory = userGenerationsHistory.filter(item => item.userId === userId);

  const remoteHistory = await fetchHistoryFromFirestore(userId);
  if (remoteHistory) {
    const byId = new Map<string, GenerationHistoryItem>();
    for (const item of remoteHistory) byId.set(item.id, item);
    for (const item of memoryHistory) if (!byId.has(item.id)) byId.set(item.id, item);
    // ids are "gen_<timestamp>" so a lexical sort gives chronological order
    const merged = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
    return res.json({ success: true, history: merged, source: "firestore" });
  }

  res.json({ success: true, history: memoryHistory, source: "memory" });
});

// API Route to reset / clear all generations for an isolated User ID
app.delete("/api/gemini/reset", requireApiSecret, rateLimit(10), async (req, res) => {
  const userId = (req.query.userId as string) || "user_test_99";

  // Find indexes to delete
  let countDeleted = 0;
  for (let i = userGenerationsHistory.length - 1; i >= 0; i--) {
    if (userGenerationsHistory[i].userId === userId) {
      userGenerationsHistory.splice(i, 1);
      countDeleted++;
    }
  }

  // Also delete the persisted Firestore history entries when credentials allow
  let firestoreDeleted = 0;
  try {
    const rows = await firestoreRequest("POST", `${firestoreBaseUrl()}:runQuery`, {
      structuredQuery: {
        from: [{ collectionId: HISTORY_COLLECTION }],
        where: {
          fieldFilter: {
            field: { fieldPath: "userId" },
            op: "EQUAL",
            value: { stringValue: userId },
          },
        },
        limit: 300,
      },
    });
    if (rows) {
      for (const row of rows) {
        if (!row.document?.name) continue;
        await firestoreRequest("DELETE", `https://firestore.googleapis.com/v1/${row.document.name}`);
        firestoreDeleted++;
      }
    }
  } catch (err) {
    console.warn("⚠️ Purge Firestore de l'historique impossible :", err);
  }

  res.json({
    success: true,
    userId: userId,
    countDeleted: countDeleted,
    firestoreDeleted: firestoreDeleted,
    msg: `🧹 Historique purgé pour '${userId}' : ${countDeleted} en mémoire, ${firestoreDeleted} dans Firestore. Les fichiers images dans Firebase Storage ne sont pas supprimés.`
  });
});

// Helper function to dynamically detect the true MIME type from magic numbers/bytes
function detectMimeType(buffer: Buffer): string | null {
  if (buffer && buffer.length >= 4) {
    // PNG signature: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return "image/png";
    }
    // JPEG signature: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return "image/jpeg";
    }
    // WEBP signature: RIFF (offset 0) and WEBP (offset 8)
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
      return "image/webp";
    }
    // GIF signature: GIF8 (47 49 46 38)
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
      return "image/gif";
    }
  }
  return null;
}

// Helper to strip non-essential PNG metadata chunks to prevent parsing failures caused by exotic color profiles or Photoshop/Canva metadata
function stripNonEssentialPngChunks(buffer: Buffer): Buffer {
  try {
    // Check PNG signature
    if (buffer.length < 8 || buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4E || buffer[3] !== 0x47 || buffer[4] !== 0x0D || buffer[5] !== 0x0A || buffer[6] !== 0x1A || buffer[7] !== 0x0A) {
      return buffer; // Not a valid PNG, return unmodified
    }

    const chunksToKeep = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS"]);
    const cleanChunks: Buffer[] = [];
    
    // Add PNG 8-byte signature
    cleanChunks.push(buffer.subarray(0, 8));

    let offset = 8;
    while (offset < buffer.length) {
      if (offset + 8 > buffer.length) break;
      const length = buffer.readUInt32BE(offset);
      const type = buffer.toString("ascii", offset + 4, offset + 8);
      
      if (offset + 12 + length > buffer.length) {
        break; // Malformed chunk, break to avoid corrupt buffer reads
      }

      if (chunksToKeep.has(type)) {
        // Keep this chunk (Length + Type + Data + CRC)
        cleanChunks.push(buffer.subarray(offset, offset + 12 + length));
      }
      
      offset += 12 + length;
    }

    return Buffer.concat(cleanChunks);
  } catch (e) {
    return buffer; // Fallback to original buffer if parsing fails
  }
}

// Helper function to thoroughly strip newlines, spaces, and any inline data URI headers (e.g. data:image/png;base64,) from base64 strings
function cleanBase64Data(raw: string): string {
  if (!raw) return "";
  let base64 = raw.trim();
  const commaIdx = base64.indexOf(",");
  if (commaIdx !== -1 && base64.substring(0, commaIdx).includes("base64")) {
    base64 = base64.substring(commaIdx + 1);
  }
  return base64.replace(/[\r\n\s]+/g, "");
}

// Helper function to optimize, resize, and flatten PNG/WebP/JPEG images to prevent Gemini 400 Unable to process input image errors
async function flattenImageIfNeeded(
  part: { inlineData: { data: string; mimeType: string } } | null,
  name: string,
  stepsLogs: string[],
  preservePng = false
): Promise<{ inlineData: { data: string; mimeType: string } } | null> {
  if (!part) return null;
  try {
    const mime = part.inlineData.mimeType;
    const rawBase64 = part.inlineData.data;

    // 1. Clean base64 input data
    const cleanedBase64 = cleanBase64Data(rawBase64);
    if (!cleanedBase64) {
      throw new Error("Le contenu Base64 de l'image est vide ou inexistant.");
    }

    let buffer = Buffer.from(cleanedBase64, "base64");
    if (buffer.length === 0) {
      throw new Error("Le binaire décodé à partir du Base64 est vide (0 octet).");
    }

    // Print first 50 chars of cleanedBase64 and first 10 bytes of buffer for deep diagnostics
    const first50base64 = cleanedBase64.substring(0, 50);
    const magicBytesHex = Array.from(buffer.subarray(0, 10)).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    const magicBytesText = buffer.subarray(0, 30).toString('utf-8').replace(/[\x00-\x1F\x7F-\x9F]/g, '.');
    console.log(`🔍 [DIAGNOSTIC-BYTES] '${name}' : Base64[0..50]="${first50base64}", DecodedLength=${buffer.length} bytes, MagicBytesHex="${magicBytesHex}", Text="${magicBytesText}"`);
    stepsLogs.push(`🔍 [DIAGNOSTIC-BYTES] '${name}' : Base64[0..30]="${first50base64.substring(0, 30)}", Taille=${buffer.length} octets, MagicHex="${magicBytesHex.substring(0, 20)}...", Text="${magicBytesText.substring(0, 20)}"`);

    // 2. HTML / XML detection inside the buffer (common result of failed URL downloads returning HTML errors)
    const sampleText = buffer.subarray(0, 100).toString("utf-8").trim();
    if (sampleText.startsWith("<!DOCTYPE") || sampleText.startsWith("<html") || sampleText.startsWith("{") || sampleText.startsWith("<svg") || sampleText.startsWith("<?xml")) {
      throw new Error(`Contenu textuel invalide détecté (possible document HTML, JSON ou SVG au lieu d'une image matricielle standard). Extrait : "${sampleText.substring(0, 45)}..."`);
    }

    // Diagnostic logging for transparency
    const sizeBeforeKb = (buffer.length / 1024).toFixed(1);
    const sizeBeforeMb = (buffer.length / 1024 / 1024).toFixed(2);
    console.log({
      name,
      mime,
      sizeMB: sizeBeforeMb,
      base64Length: cleanedBase64.length
    });
    stepsLogs.push(`📝 [DIAGNOSTIC] ${name} : Type=${mime}, Taille=${sizeBeforeMb} Mo (${sizeBeforeKb} Ko), base64=${cleanedBase64.length.toLocaleString()} cars.`);

    let image;
    try {
      image = await Jimp.read(buffer);
    } catch (readErr: any) {
      if (mime === "image/png" || mime === "image/x-png") {
        stepsLogs.push(`⚠️ [PNG-READ-RETRY] Échec initial de lecture du PNG (${readErr.message || readErr}). Tentative avec nettoyage de chunks PNG non essentiels...`);
        const stripped = stripNonEssentialPngChunks(buffer);
        image = await Jimp.read(stripped);
      } else {
        throw readErr;
      }
    }

    let width = image.width;
    let height = image.height;

    // 3. Guard against giant images: resize to max 1600px on the longest side to keep payload light
    const maxDimension = 1600;
    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
      image = image.resize({ w: width, h: height });
      stepsLogs.push(`📏 [OPTIMISATION-RESIZE] '${name}' redimensionné à ${width}x${height}px pour l'API.`);
    }

    const detectedMime = detectMimeType(buffer) || mime;

    // 4a. IMAGE_B : conserver le PNG avec transparence pour Gemini
    if (preservePng && (detectedMime === "image/png" || mime === "image/png" || mime === "image/x-png")) {
      const outputBuffer = await image.getBuffer("image/png");
      const sizeAfterKb = (outputBuffer.length / 1024).toFixed(1);
      stepsLogs.push(`✨ [OPTIMISATION-PNG] '${name}' conservé en PNG avec transparence (${sizeBeforeKb} Ko ➔ ${sizeAfterKb} Ko).`);
      return {
        inlineData: {
          data: outputBuffer.toString("base64"),
          mimeType: "image/png"
        }
      };
    }

    // 4b. IMAGE_A / IMAGE_C : aplatir sur fond blanc et convertir en JPEG
    const flatImage = new Jimp({ width, height, color: 0xFFFFFFFF });
    flatImage.composite(image, 0, 0);
    const outputBuffer = await flatImage.getBuffer("image/jpeg");
    const sizeAfterKb = (outputBuffer.length / 1024).toFixed(1);
    stepsLogs.push(`✨ [OPTIMISATION-COLOR] '${name}' converti en JPEG optimal (${sizeBeforeKb} Ko ➔ ${sizeAfterKb} Ko).`);
    return {
      inlineData: {
        data: outputBuffer.toString("base64"),
        mimeType: "image/jpeg"
      }
    };
  } catch (err: any) {
    const errMsg = err.message || String(err);
  
    stepsLogs.push(
      `❌ [IMAGE INVALIDE] '${name}' n'a pas pu être décodée par Jimp (${errMsg}).`
    );
  
    console.error(`[IMAGE INVALIDE] '${name}':`, err);
  
    throw new Error(
      `L'image '${name}' est invalide ou illisible. Gemini ne peut pas traiter cette image.`
    );
  }
}
// API Route for actual Gemini Generation & Inpainting Simulation
app.post("/api/gemini/generate", requireApiSecret, rateLimit(6), async (req, res) => {
  const stepsLogs: string[] = [];
  let totalInputTokens = 0;
  let promptTokensCount = 0;
  let imageTokensCount = 0;
  let resolvedCost = 0;

  try {
  const { 
    prompt, 
    model, 
    aspectRatio, 
    imageSize, 
    imageA,     imageB, 
    imageC, 
    userId, 
    firebaseStorageBucket,
    unifiedInstruction,
    descImageA,
    descImageB,
    descImageC,
    logo,
    logoPrompt,
    logoPromptActive,
    text,
    textContent,
    textPrompt,
    textPromptActive,
    metadataUtilisateur,
    presetsFond,
    W_B,
    H_B,
    geometryGuidanceMode,
    coordinatePromptMode,
    jobId
  } = req.body;

  if (jobId) {
    jobsStore[jobId] = {
      id: jobId,
      status: "processing",
      progress: 15
    };
  }

  const activeUserId = userId || "user_test_99";
  const activeBucket = firebaseStorageBucket || "gen-lang-client-0870404092.firebasestorage.app";
  const activeModel = model || DEFAULT_GEMINI_MODEL;

stepsLogs.push(`🚀 [SYSTEM] Reçu requête de génération sur le modèle: '${activeModel}'`);
stepsLogs.push(`👤 [IDENTIFIANT] ID Utilisateur Actif: '${activeUserId}'`);
stepsLogs.push(`✏️ [PROMPT DE COMPOSITION Saisie] "${prompt || "Mets le véhicule sport en situation réelle"}"`);
stepsLogs.push(`📏 [FORMAT DE RENDU DE LA TABLE] Ratio: ${aspectRatio || "16:9"} | Taille: ${imageSize || "1K"}`);

stepsLogs.push(`🧬 [MULTIMODAL] Préparation de la trilogie d'images d'entrée :`);
stepsLogs.push(`   -> imageA : Arrière-plan HD sélectionné`);
stepsLogs.push(`   -> imageB : Véhicule détouré HD de référence à préserver`);
stepsLogs.push(`   -> imageC : Guide spatial JPEG de positionnement du canvas`);

const downloadAndEncodeImage = async (
  url: string,
  name: string
): Promise<{ inlineData: { data: string; mimeType: string } } | null> => {
  if (!url) return null;

  let targetUrl = url.trim();

  if (targetUrl.startsWith("data:")) {
    const matches = targetUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches && matches[2]) {
      stepsLogs.push(`📦 [RESOLVE] Direct base64 parsing for '${name}' (Mime: ${matches[1]})`);
      return {
        inlineData: {
          data: matches[2],
          mimeType: matches[1] || "image/jpeg"
        }
      };
    }
    throw new Error(`${name} : data URL invalide.`);
  }

  if (targetUrl.startsWith("gs://")) {
    const sansScheme = targetUrl.slice(5);
    const slashIdx = sansScheme.indexOf("/");
    if (slashIdx !== -1) {
      const bucket = sansScheme.slice(0, slashIdx);
      const filePath = sansScheme.slice(slashIdx + 1);
      const encodedPath = encodeURIComponent(filePath);
      targetUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media`;
      stepsLogs.push(`🔄 [RESOLVE] Conversion de '${url}' en URL HTTPS: '${targetUrl.substring(0, 75)}...'`);
    }
  }

  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    let cleanPath = targetUrl.startsWith("/") ? targetUrl.slice(1) : targetUrl;
    let resolvedPath = path.resolve(process.cwd(), cleanPath);

    // Confine local reads to the project directory (blocks "../" traversal outside cwd)
    if (!resolvedPath.startsWith(process.cwd() + path.sep)) {
      throw new Error(`${name} : chemin local hors du répertoire du projet refusé.`);
    }

    if (!fs.existsSync(resolvedPath)) {
      const srcPath = path.join(process.cwd(), "src", cleanPath);
      if (fs.existsSync(srcPath)) resolvedPath = srcPath;
    }

    if (fs.existsSync(resolvedPath)) {
      stepsLogs.push(`📂 [LOCAL-READ] Lecture locale directe du fichier '${name}' depuis '${resolvedPath}'...`);
      const fileBuffer = fs.readFileSync(resolvedPath);
      const mime = detectMimeType(fileBuffer);

      if (!mime || !mime.startsWith("image/")) {
        throw new Error(`${name} : le fichier local n'est pas une image valide.`);
      }

      return {
        inlineData: {
          data: fileBuffer.toString("base64"),
          mimeType: mime
        }
      };
    }

    targetUrl = `http://127.0.0.1:3000/${cleanPath}`;
    stepsLogs.push(`🔄 [RESOLVE] Conversion relative locale pour '${name}': ${targetUrl}`);
  }

  const parsed = parseFirebaseStorageUrl(targetUrl);
  const token = await getServiceAccountToken();

  let fetchUrl = targetUrl;
  const headers: Record<string, string> = {};

  if (parsed && token) {
    fetchUrl = `https://storage.googleapis.com/download/storage/v1/b/${parsed.bucket}/o/${parsed.objectEncoded}?alt=media`;
    headers["Authorization"] = `Bearer ${token}`;
    stepsLogs.push(`🔑 [AUTH-DOWNLOAD] Utilisation du token Service Account pour '${name}' de '${fetchUrl.substring(0, 75)}...'`);
  } else {
    stepsLogs.push(`📥 [DOWNLOAD] Téléchargement de la ressource '${name}' de '${targetUrl.substring(0, 75)}...'`);
  }

  let imgResponse = await fetch(fetchUrl, { headers });

  if (!imgResponse.ok && headers["Authorization"]) {
    stepsLogs.push(`⚠️ [AUTH-FAILED] Téléchargement authentifié échoué (${imgResponse.status}) pour '${name}'. Tentative publique directe...`);
    imgResponse = await fetch(targetUrl);
  }

  if (!imgResponse.ok) {
    let fallbackFile = "";
    if (targetUrl.includes("desert_road_hd.jpg")) {
      fallbackFile = path.join(process.cwd(), "src", "local_test_images", "imageA_local.jpg");
    } else if (targetUrl.includes("porsche_taycan_detoure.png")) {
      fallbackFile = path.join(process.cwd(), "src", "local_test_images", "imageB_local.png");
    } else if (targetUrl.includes("reference_comp_075.jpg")) {
      fallbackFile = path.join(process.cwd(), "src", "local_test_images", "imageC_local.jpg");
    }

    if (fallbackFile && fs.existsSync(fallbackFile)) {
      stepsLogs.push(`ℹ️ [FALLBACK-LOCAL] Le téléchargement de '${name}' a échoué (${imgResponse.status}). Utilisation du fichier local de secours depuis '${fallbackFile}'...`);
      const fileBuffer = fs.readFileSync(fallbackFile);
      const mime = detectMimeType(fileBuffer) || (fallbackFile.endsWith(".png") ? "image/png" : "image/jpeg");
      return {
        inlineData: {
          data: fileBuffer.toString("base64"),
          mimeType: mime
        }
      };
    }

    throw new Error(`${name} : HTTP ${imgResponse.status}`);
  }

  const responseUrl = imgResponse.url;
  const contentType = imgResponse.headers.get("content-type") || "";
  const contentLength = imgResponse.headers.get("content-length") || "unknown";

  if (!contentType.startsWith("image/")) {
    const textPreview = await imgResponse.text();

    stepsLogs.push(`❌ [DOWNLOAD-INVALID] '${name}' ne renvoie pas une image.`);
    stepsLogs.push(`   -> URL finale : ${responseUrl}`);
    stepsLogs.push(`   -> Content-Type : ${contentType}`);
    stepsLogs.push(`   -> Content-Length : ${contentLength}`);
    stepsLogs.push(`   -> Aperçu : ${textPreview.slice(0, 250).replace(/\s+/g, " ")}`);

    throw new Error(
      `${name} ne renvoie pas une image exploitable. URL finale: ${responseUrl}. Content-Type: ${contentType}.`
    );
  }

  const imgBuffer = await imgResponse.arrayBuffer();
  const nodeBuffer = Buffer.from(imgBuffer);

  const byteSignature = Array.from(nodeBuffer.subarray(0, 12))
    .map(b => b.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");

  const detectedMime = detectMimeType(nodeBuffer);
  const mime = detectedMime || contentType;

  stepsLogs.push(`🔎 [BINARY-CHECK] '${name}' bytes=${nodeBuffer.length}, signature=${byteSignature}, mime=${mime}`);

  if (!mime || !mime.startsWith("image/")) {
    throw new Error(`${name} : le binaire téléchargé n'est pas une image valide.`);
  }

  return {
    inlineData: {
      data: nodeBuffer.toString("base64"),
      mimeType: mime
    }
  };
};

// Process concurrent image downloads
const [rawPartA, rawPartB, rawPartC, rawPartLogo] = await Promise.all([
  downloadAndEncodeImage(imageA, "Image A (Fond HD)"),
  downloadAndEncodeImage(imageB, "Image B (Véhicule détouré)"),
  downloadAndEncodeImage(imageC, "Image C (Guide spatial)"),
  logo ? downloadAndEncodeImage(logo, "Logo de marque") : Promise.resolve(null)
]);

if (!rawPartA) throw new Error("Impossible de télécharger ou d'accéder à l'IMAGE_A.");
if (!rawPartB) throw new Error("Impossible de télécharger ou d'accéder à l'IMAGE_B.");
if (!rawPartC) throw new Error("Impossible de télécharger ou d'accéder à l'IMAGE_C.");

const [partA, partB, partC, partLogo] = await Promise.all([
  flattenImageIfNeeded(rawPartA, "Image A (Fond HD)", stepsLogs),
  flattenImageIfNeeded(rawPartB, "Image B (Véhicule détouré)", stepsLogs, true),
  flattenImageIfNeeded(rawPartC, "Image C (Guide spatial)", stepsLogs),
  rawPartLogo ? flattenImageIfNeeded(rawPartLogo, "Logo de marque", stepsLogs, true) : Promise.resolve(null)
]);

// All 3 images will be utilized, except for gemini-3-pro-image where we only send the spatial guide (IMAGE_C)
const isGemini3ProImage = activeModel && activeModel.includes("3-pro-image");
const imageCountUsed = (isGemini3ProImage ? 1 : 3) + (partLogo ? 1 : 0);
imageTokensCount = imageCountUsed * 258;
promptTokensCount = (prompt || "").length + 250;
totalInputTokens = promptTokensCount + imageTokensCount;

resolvedCost = (isGemini3ProImage ? 0.040 : 0.030) + (totalInputTokens * 0.000000075);

// --- ALGORITHME DE RECONSTITUTION PIXEL À PIXEL (BLUEPRINT MATHEMATIQUE) ---
const metaUtilisateur = metadataUtilisateur || {};
const transform = metaUtilisateur.transformVehicule || {
  x: -2.5,
  y: 14.2,
  scale: 1.15,
  rotation: -1.2
};
const bboxVehicule = metaUtilisateur.boundingBoxVehicule || {
  left: 120,
  right: 1480,
  top: 210,
  bottom: 780
};

const final_W_B = Number(W_B || 1600);
const final_H_B = Number(H_B || 900);
  
  // 1. CONSTANTES DE RÉFÉRENCE DU BLUEPRINT
  const resolution_ref = Number(metaUtilisateur.resolutionRef || 1280);
  const canvasSize = resolution_ref;
  const X_center = canvasSize / 2;
  const Y_center = canvasSize / 2;
  const vehicleBoxSize = canvasSize * 0.75;   // Scale with canvasSize (960px relative to 1280px)
  const target_vehicle_width = vehicleBoxSize * (900 / 960); // Scale target vehicle width (900px relative to 1280px)

  // 2. ÉQUATIONS DE RATIO ET ÉCHELLE DE BASE (BLUEPRINT RECONSTITUTION)
  const aspect_ratio_vehicle = final_W_B / final_H_B;

  /* Dimensions initiales de dessin du calque du véhicule dans le conteneur de vehicleBoxSize px */
  let initial_width_in_960 = vehicleBoxSize;
  let initial_height_in_960 = vehicleBoxSize;
  if (aspect_ratio_vehicle > 1) {
    initial_width_in_960 = vehicleBoxSize;
    initial_height_in_960 = vehicleBoxSize / aspect_ratio_vehicle;
  } else {
    initial_width_in_960 = vehicleBoxSize * aspect_ratio_vehicle;
    initial_height_in_960 = vehicleBoxSize;
  }

  /* Résolution défensive de la bounding box visible du véhicule */
  let bbox_left_ratio = Number(bboxVehicule.left);
  let bbox_right_ratio = Number(bboxVehicule.right);
  
  // Conversion en ratio 0.0 à 1.0 si exprimé en pixels d'origine
  if (bbox_left_ratio > 1) {
    bbox_left_ratio = bbox_left_ratio / final_W_B;
  }
  if (bbox_right_ratio > 1) {
    bbox_right_ratio = bbox_right_ratio / final_W_B;
  }
  
  // bounding-box-width-ratio: bbox.right - bbox.left (Pourcentage 0.0 à 1.0)
  const bounding_box_width_ratio = Math.max(0.01, bbox_right_ratio - bbox_left_ratio);
  
  // active-width-no-scale: initial-width-in-960 * bounding-box-width-ratio
  const active_width_no_scale = initial_width_in_960 * bounding_box_width_ratio;

  // scale-base: 900px / active-width-no-scale
  const scale_base = target_vehicle_width / active_width_no_scale;

  // 3. MATRICE DE TRANSFORMATION FINALE (UNIFIED COORDINATE SYSTEM)
  const scale_user = Number(transform.scale !== undefined ? transform.scale : 1.15);
  const baselineScale = Number(metaUtilisateur.baselineScale || 1.0);
  const x_user = Number(transform.x !== undefined ? transform.x : -2.5);
  const y_user = Number(transform.y !== undefined ? transform.y : 14.2);
  const rot_user = Number(transform.rotation !== undefined ? transform.rotation : -1.2);

  const dx = (x_user / 100) * vehicleBoxSize;
  const dy = (y_user / 100) * vehicleBoxSize;
  const centerX = (canvasSize / 2) + dx;
  const centerY = (canvasSize / 2) + dy;
  const effectiveScale = scale_user * baselineScale;

  const aspect = final_W_B / final_H_B;
  let targetW = vehicleBoxSize;
  let targetH = vehicleBoxSize;
  if (aspect > 1) {
    targetW = vehicleBoxSize;
    targetH = vehicleBoxSize / aspect;
  } else {
    targetW = vehicleBoxSize * aspect;
    targetH = vehicleBoxSize;
  }

  // Append composition calculation logs
  stepsLogs.push(`📐 [ALGORITHME RECONSTITUTION] Initialisation de la composition matricielle pixel à pixel :`);
  stepsLogs.push(`   ↳ Constantes : Résolution Réf: ${resolution_ref}px | Container: ${vehicleBoxSize.toFixed(1)}px`);
  stepsLogs.push(`   ↳ Ratios : Véhicule Origine: ${final_W_B}x${final_H_B} | Aspect-Ratio: ${aspect.toFixed(4)}`);
  stepsLogs.push(`   ↳ Dimensions initiales calque (contain) : ${targetW.toFixed(2)}px x ${targetH.toFixed(2)}px`);
  stepsLogs.push(`   ↳ User Scale: ${scale_user}x | Baseline Scale: ${baselineScale}x | Effective Scale: ${effectiveScale.toFixed(4)}x`);
  stepsLogs.push(`   ↳ Translations : dx=${dx.toFixed(2)}px | dy=${dy.toFixed(2)}px`);
  stepsLogs.push(`   ↳ Centre Absolu de Rotation/Echelle : X=${centerX.toFixed(2)}px | Y=${centerY.toFixed(2)}px`);

  const hasNoValidKey = !GEMINI_API_KEY;
  if (hasNoValidKey) {
    throw new Error("GEMINI_API_KEY non configurée. Définissez-la dans Settings > Secrets.");
  }

  let imageResult = "";

  try {
      stepsLogs.push(`🔗 [SDK] Initialisation du client GoogleGenAI...`);
      const ai = new GoogleGenAI({
        apiKey: GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

const parts: any[] = [];

if (isGemini3ProImage) {
  stepsLogs.push(
    `🎯 [SDK-PREP] Modèle Gemini 3 Pro-image détecté. Passage de l'IMAGE_C (Guide spatial de composition uniquement) pour se conformer au mode d'écoute ciblé.`
  );
  if (partC) {
    parts.push({ text: "IMAGE_C - COMPOSITION / GEOMETRY GUIDE" });
    parts.push(partC);
  }
} else {
  stepsLogs.push(
    `🎯 [SDK-PREP] Modèle Gemini classique détecté ('${activeModel}'). Passage des 3 images d'entrée : IMAGE_A, IMAGE_B, IMAGE_C.`
  );

  if (partA) {
    parts.push({ text: "IMAGE_A - ENVIRONMENT REFERENCE" });
    parts.push(partA);
  }

  if (partB) {
    parts.push({ text: "IMAGE_B - EXACT VEHICLE REFERENCE" });
    parts.push(partB);
  }

  if (partC) {
    parts.push({ text: "IMAGE_C - COMPOSITION / GEOMETRY GUIDE" });
    parts.push(partC);
  }
}

if (partLogo) {
  stepsLogs.push(`🎯 [SDK-PREP] Logo de marque de référence détecté. Passage de LOGO_IMAGE pour incrustation de marque.`);
  parts.push({ text: "LOGO_IMAGE - BRAND LOGO REFERENCE TO PLACE AT COORDINATES" });
  parts.push(partLogo);
}

if (!partA || !partB || !partC) {
  throw new Error(
    `Images manquantes après préparation : A=${!!partA}, B=${!!partB}, C=${!!partC}`
  );
}

      // Compile final prompt text dynamically based on local stable config files
      let basePromptText = "";
      try {
        const fileOptions = ["PROMPT_GEN", "PROMPT_STYLE", "PROMPT_GEN.txt", "PROMPT_STYLE.txt"];
        for (const fileOpt of fileOptions) {
          const filePath = path.join(process.cwd(), fileOpt);
          if (fs.existsSync(filePath)) {
            basePromptText = fs.readFileSync(filePath, "utf-8").trim();
            break;
          }
        }
      } catch (err) {
        console.warn("⚠️ [MOTEUR] Impossible de lire les fichiers de prompt, repli sur le texte codé en dur:", err);
      }

      if (!basePromptText) {
          basePromptText = `Create one photorealistic automotive image from the three input images.
IMAGE_A is the environment reference.
Use IMAGE_A as the final background.
Preserve its architecture, composition, framing, camera angle and perspective.
IMAGE_B is the exact transparent PNG vehicle cutout.
Use the exact vehicle from IMAGE_B.
Do not replace, redesign, redraw, reinterpret or regenerate the vehicle.
IMAGE_C is a geometry guide only.
Use IMAGE_C only to determine vehicle position, scale and rotation.
Do not copy its lighting, shadows, rendering style, logo appearance or text appearance.
PRIORITY
	1	Preserve the exact vehicle from IMAGE_B.
	2	Preserve the environment composition from IMAGE_A.
	3	Match the vehicle placement shown in IMAGE_C.
	4	Improve realism only through integration.
VEHICLE PRESERVATION
Do not modify:
	•	vehicle model
	•	shape
	•	proportions
	•	wheels
	•	paint color
	•	body panels
	•	lights
	•	glass shape
	•	materials
	•	textures
	•	existing reflections
	•	vehicle details
Allowed vehicle adjustments only:
	•	global exposure
	•	global contrast
ENVIRONMENT
Only adjust:
	•	lighting
	•	shadows
	•	exposure
	•	atmosphere
INTEGRATION
Add:
	•	realistic contact shadows under the tires and chassis
	•	subtle ground reflections
	•	physically accurate grounding
	•	coherent light direction
	•	seamless photographic integration
WINDOWS
Update only the scenery visible through the vehicle windows so the environment continues naturally behind the glass.
Preserve realistic transparency, perspective, depth and optical distortion.

NEGATIVE
generic sports car,
different vehicle,
changed vehicle design,
changed wheels,
changed paint color,
changed proportions,
changed vehicle details,
changed textures,
different background composition,
incorrect placement,
fake shadows,
floating vehicle,
ai-generated vehicle,
ai composite look,
low quality


Photorealistic premium automotive photography.
Real vehicle.
Real environment.
Natural lighting.
Production-quality realism.`;
      }

      let promptText = basePromptText;
      if (prompt && prompt.trim() !== "") {
        promptText += `\n\nSTYLE / ENVIRONMENT COMPOSITION STYLE:\n${prompt}`;
      }

      // Resolve logo presets coordinates & details using PWA-aligned exact math
      const presetsLogoX = presetsFond?.logoPlaceholderCoords?.x !== undefined ? Number(presetsFond.logoPlaceholderCoords.x) : (req.body.logoX ? Number(req.body.logoX) / 10 : 12);
      const presetsLogoY = presetsFond?.logoPlaceholderCoords?.y !== undefined ? Number(presetsFond.logoPlaceholderCoords.y) : (req.body.logoY ? Number(req.body.logoY) / 10 : 80);
      const presetsLogoSize = Number(presetsFond?.logoSize || req.body.logoSize || 150);
      const presetsRefRes = Number(presetsFond?.resolutionRef || req.body.resolutionRef || 1280);
      const canvasSize = Number(metaUtilisateur.resolutionRef || 1280);

      const logoCenterX = (presetsLogoX / presetsRefRes) * canvasSize;
      const logoCenterY = (presetsLogoY / presetsRefRes) * canvasSize;
      const logoSizePx = (presetsLogoSize / presetsRefRes) * canvasSize;
      const logoDrawX = logoCenterX - logoSizePx / 2;
      const logoDrawY = logoCenterY - logoSizePx / 2;

      const logo_color_fill = presetsFond?.logoColorFill || req.body.logoColorFill || "#FFFFFF";
      const logo_color_enabled = presetsFond?.logoColorFillEnabled || req.body.logoColorFillEnabled || false;
      const logo_extra_details = presetsFond?.logoExtra || req.body.logoExtra || "";

      // Resolve text/slogan presets
      const textPreset = presetsFond?.texteStylePreset || { font: "Inter", color: "#FFFFFF", size: "normal" };

      const textFont = req.body.textFont || presetsFond?.texteStylePreset?.font || "Inter";
      const textAlignVal = req.body.textAlign || "CENTRE";
      const rawTextX = req.body.textX || presetsFond?.textX || "640";
      const rawTextY = req.body.textY || presetsFond?.textY || "1000";
      const rawTextSize = presetsFond?.texteStylePreset?.size || req.body.textSize || "normal";
      
      let textSizePx = 48;
      if (rawTextSize === "small" || rawTextSize === "32") {
        textSizePx = 32;
      } else if (rawTextSize === "large" || rawTextSize === "64") {
        textSizePx = 64;
      } else if (!isNaN(Number(rawTextSize))) {
        textSizePx = Number(rawTextSize);
      }

      const tx = (Number(rawTextX) / presetsRefRes) * canvasSize;
      const ty = (Number(rawTextY) / presetsRefRes) * canvasSize;
      const fontSize = (Number(textSizePx) / presetsRefRes) * canvasSize;

      let alignedText = "center";
      if (textAlignVal === "GAUCHE") alignedText = "left";
      if (textAlignVal === "DROITE") alignedText = "right";

      const activeCoordMode = (coordinatePromptMode === "COORD_LIGHT" || geometryGuidanceMode === "COORD_LIGHT") ? "COORD_LIGHT" : "COORD_LONG";
      stepsLogs.push(`📐 [GEOMETRY] Mode d'aide géométrique actif : '${activeCoordMode}'`);

      if (activeCoordMode === "COORD_LIGHT") {
        const logoVisible = logo ? "true" : "false";
        const textVisible = (text && textContent && textContent.trim() !== "") ? "true" : "false";
        const safeTextContent = textContent || "";
        const vehicleDrawW = (targetW * effectiveScale).toFixed(1);
        const vehicleDrawH = (targetH * effectiveScale).toFixed(1);

        promptText += `\n\n« GEOMETRY LOCK »

Use IMAGE_C as the visual composition guide.
Use the following coordinates as strict placement reinforcement.

Canvas:
size = ${canvasSize} x ${canvasSize}

Vehicle:
center = (${centerX.toFixed(1)}, ${centerY.toFixed(1)})
drawSize = (${vehicleDrawW} x ${vehicleDrawH})
scale = ${effectiveScale.toFixed(4)}
rotation = ${rot_user.toFixed(2)} deg

Logo:
center = (${logoCenterX.toFixed(1)}, ${logoCenterY.toFixed(1)})
boxSize = ${logoSizePx.toFixed(1)}
fit = contain
mandatory = ${logoVisible}

Text:
content = "${safeTextContent}"
anchor = (${tx.toFixed(1)}, ${ty.toFixed(1)})
font = ${textFont}
fontSize = ${fontSize.toFixed(1)}
align = ${alignedText}
baseline = middle
color = ${textPreset.color || "#FFFFFF"}
mandatory = ${textVisible}

Rules:
- Do not create duplicate logos.
- Do not move the logo.
- Do not omit the logo if mandatory = true.
- Do not omit the text if mandatory = true.
- Do not reinterpret the text.
- Match IMAGE_C composition as closely as possible.`;
      } else {
        // Append Master Vehicle placement directions in the prompt (COORD LONG mode)
        promptText += `\n\n« MASTER VEHICLE PLACEMENT DIRECTIVES »:
The final composited image must position the vehicle from IMAGE_B exactly according to the following mathematical canvas mapping on a ${canvasSize} x ${canvasSize} pixels reference canvas:
- Canvas dimensions: ${canvasSize} x ${canvasSize} px
- Vehicle bounding size before scale: ${targetW.toFixed(1)}px x ${targetH.toFixed(1)}px (Fit inside ${vehicleBoxSize.toFixed(1)}px x ${vehicleBoxSize.toFixed(1)}px using contain)
- Translation / Center coordinates on canvas: X = ${centerX.toFixed(1)}px, Y = ${centerY.toFixed(1)}px
- Rotation: ${rot_user.toFixed(2)} degrees, clockwise
- Scale: ${effectiveScale.toFixed(4)}x
Ensure the vehicle is perfectly positioned and integrated with these exact spatial coordinates.`;

        if (logo) {
          promptText += `\n\n« MASTER LOGO PLACEMENT DIRECTIVES »:
Use the brand logo provided in LOGO_IMAGE.
Place it exactly within a square container box of size ${logoSizePx.toFixed(1)}px x ${logoSizePx.toFixed(1)}px centered at X = ${logoCenterX.toFixed(1)}px, Y = ${logoCenterY.toFixed(1)}px on the ${canvasSize} x ${canvasSize} px reference canvas.
This corresponds to top-left draw coordinates: X = ${logoDrawX.toFixed(1)}px, Y = ${logoDrawY.toFixed(1)}px with a square size of ${logoSizePx.toFixed(1)}px.
Preserve the logo's original aspect ratio using 'contain' fitting inside this box.
${logo_color_enabled ? `Recolor/tint the logo completely with the hex color '${logo_color_fill}' using source-in masking.` : "Preserve the original colors, typography, transparency and graphic elements of LOGO_IMAGE."} ${logo_extra_details ? `| Additional instructions: ${logo_extra_details}` : ""}`;
        }

        if (text && textContent && textContent.trim() !== "") {
          promptText += `\n\n« TEXT / SLOGAN PLACEMENT DIRECTIVES »:
Render the text slogan "${textContent}" as clean flat typography.
Positioning on the ${canvasSize} x ${canvasSize} px reference canvas:
- Anchor coordinates: X = ${tx.toFixed(1)}px, Y = ${ty.toFixed(1)}px
- Font size: ${fontSize.toFixed(1)}px
- Font family: ${textFont}
- Font weight: bold
- Text alignment: ${alignedText} (Do not reinterpret left/right alignment as centered)
- Text baseline: middle
- Color: ${textPreset.color || "#FFFFFF"}
Draw with standard typography rendering: fillText("${textContent}", ${tx.toFixed(1)}, ${ty.toFixed(1)}). No 3D effects, extrusion, shadow, or glow.`;
        }
      }

      stepsLogs.push(`✏️ [PROMPT COMPILÉ FINAL] "${promptText}"`);

      // Add actual prompt text and strict instruction
      parts.push({
        text: promptText
      });

      // Normalize aspect ratio to colon format (e.g. "4/3" -> "4:3", "16/9" -> "16:9")
      let cleanAspectRatio = "16:9";
      if (aspectRatio) {
        const normalized = aspectRatio.replace("/", ":").trim();
        const validRatios = ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"];
        if (validRatios.includes(normalized)) {
          cleanAspectRatio = normalized;
        }
      }
      stepsLogs.push(`📏 [VÉRIFICATION RATIO DE RENDU] Entrée : "${aspectRatio}" ➔ Validé : "${cleanAspectRatio}"`);

      let apiResponse;

stepsLogs.push(`📡 [API-CALL] Envoi de la requête Gemini avec les 3 images de référence (IMAGE_A + IMAGE_B + IMAGE_C)...`);

// Configuration Image
const imageConfigToSend: any = {
  aspectRatio: cleanAspectRatio
};

// Certains modèles Gemini supportent imageSize
const supportsImageSize =
  activeModel.includes("2.5-flash-image") ||
  activeModel.includes("3.1-flash-image") ||
  activeModel.includes("3-pro-image");

if (supportsImageSize) {
  imageConfigToSend.imageSize = imageSize || "1K";
}

// Appel Gemini
apiResponse = await ai.models.generateContent({
  model: activeModel,
  contents: [
    {
      role: "user",
      parts
    }
  ],
  config: {
    imageConfig: imageConfigToSend
  }
});

stepsLogs.push(`📥 [API-RESPONSE] Réponse reçue de Gemini.`);

// Prefer the real token counts returned by the API over the local heuristic
const usage: any = (apiResponse as any).usageMetadata;
if (usage && (usage.totalTokenCount || usage.promptTokenCount)) {
  promptTokensCount = Number(usage.promptTokenCount || promptTokensCount);
  totalInputTokens = Number(usage.totalTokenCount || totalInputTokens);
  imageTokensCount = Math.max(0, totalInputTokens - promptTokensCount);
  resolvedCost = (isGemini3ProImage ? 0.040 : 0.030) + (totalInputTokens * 0.000000075);
  stepsLogs.push(`🧮 [USAGE-METADATA] Tokens réels renvoyés par l'API : prompt=${promptTokensCount}, total=${totalInputTokens}.`);
}

// Recherche de l'image générée
if (apiResponse.candidates?.length) {

  for (const candidate of apiResponse.candidates) {

    if (!candidate.content?.parts) continue;

    for (const part of candidate.content.parts) {

      if (part.inlineData?.data) {

        const mime = part.inlineData.mimeType || "image/png";

        imageResult = `data:${mime};base64,${part.inlineData.data}`;

        stepsLogs.push(
          `🎉 [SUCCESS] Image générée avec succès (${mime}, ${part.inlineData.data.length} caractères Base64).`
        );

        lastApiHealthStatus = {
          status: "healthy",
          lastChecked: new Date().toISOString()
        };

        break;
      }

      if (part.text) {
        stepsLogs.push(`💬 [MODEL] ${part.text}`);
      }
    }

    if (imageResult) break;
  }
}

if (!imageResult) {
  stepsLogs.push(`❌ [API-ERROR] Gemini n'a renvoyé aucune image.`);
  throw new Error("Gemini n'a renvoyé aucune image dans sa réponse.");
}


    } catch (err: any) {
      const errMsg = err.message || String(err);
      console.error("Gemini API Error occurred:", errMsg);
      stepsLogs.push(`❌ [MOTEUR IA] Échec de l'appel API réel de Gemini : "${errMsg}"`);
      lastApiHealthStatus = {
        status: "unhealthy",
        lastChecked: new Date().toISOString(),
        errorMessage: errMsg
      };
      throw err;
    }

  if (!imageResult) {
    throw new Error("Aucune image générée — Gemini n'a renvoyé aucun inlineData.");
  }

  const getModelShortName = (modelName: string): string => {
    const name = modelName.toLowerCase();
    if (name.includes("2.5")) return "2-5";
    if (name.includes("3.1")) return "3-1";
    if (name.includes("3-pro")) return "3-pro";
    const m = name.match(/gemini-([\d.]+)/);
    if (m && m[1]) {
      return m[1].replace(".", "-");
    }
    return "model";
  };

  const activeCoordMode = (coordinatePromptMode === "COORD_LIGHT" || geometryGuidanceMode === "COORD_LIGHT") ? "COORD_LIGHT" : "COORD_LONG";
  const modelShort = getModelShortName(activeModel);
  const geomShort = activeCoordMode === "COORD_LIGHT" ? "coord-light" : "coord-long";
  const timestamp = Date.now();
  const storageFileName = `homescreen_${modelShort}_${geomShort}_${timestamp}.jpg`;
  const objectPath = `users/${activeUserId}/homescreens/${storageFileName}`;

  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host || "127.0.0.1:3000";
  let protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
  if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
    protocol = "https";
  }
  const requestBaseUrl = `${protocol}://${host}`;

  const uploaded = await uploadGeneratedImageToStorage(imageResult, activeBucket, objectPath, stepsLogs, requestBaseUrl);
  const storagePath = uploaded.storagePath;
  const finalPublicUrl = uploaded.publicUrl;

  const newItem: GenerationHistoryItem = {
    id: `gen_${Date.now()}`,
    userId: activeUserId,
    timestamp: new Date().toLocaleTimeString(),
    prompt: prompt || "A pristine photo composition matching the reference layout.",
    model: activeModel,
    aspectRatio: aspectRatio || "16:9",
    imageSize: imageSize || "1K",
    storagePath,
    imageUrl: finalPublicUrl,
    tokens: {
      total: totalInputTokens,
      prompt: promptTokensCount,
      image: imageTokensCount
    },
    costEuros: resolvedCost,
    geometryGuidanceMode: activeCoordMode,
    coordinatePromptMode: activeCoordMode,
    outputFilename: storageFileName
  };

  userGenerationsHistory.push(newItem);
  // Cap the in-memory history to avoid unbounded growth on long-running instances
  if (userGenerationsHistory.length > 500) {
    userGenerationsHistory.splice(0, userGenerationsHistory.length - 500);
  }
  // Persist to Firestore (fire-and-forget; no-op when running without SA credentials)
  void persistHistoryItemToFirestore(newItem);

  if (jobId) {
    jobsStore[jobId] = {
      id: jobId,
      status: "completed",
      progress: 100,
      imageUrl: finalPublicUrl,
      imageFinal: finalPublicUrl
    };
  }

  return res.json({
    success: true,
    isSimulated: false,
    apiError: "",
    imageUrl: finalPublicUrl,
    storagePath: newItem.storagePath,
    outputFilename: storageFileName,
    geometryGuidanceMode: activeCoordMode,
    coordinatePromptMode: activeCoordMode,
    modelUsed: activeModel,
    logs: stepsLogs,
    metrics: {
      inputTokens: totalInputTokens,
      promptTokens: promptTokensCount,
      imageTokens: imageTokensCount,
      costEuros: resolvedCost
    }
  });

  } catch (err: any) {
    const errMsg = err.message || String(err);
    console.error("Generation pipeline error:", errMsg);
    const errorJobId = req.body?.jobId;
    if (errorJobId) {
      jobsStore[errorJobId] = {
        id: errorJobId,
        status: "failed",
        progress: 0,
        error: errMsg
      };
    }
    if (!stepsLogs.some((l) => l.includes(errMsg))) {
      stepsLogs.push(`❌ [ERREUR] ${errMsg}`);
    }
    return res.status(500).json({
      success: false,
      isSimulated: false,
      apiError: errMsg,
      imageUrl: "",
      storagePath: "",
      logs: stepsLogs,
      metrics: {
        inputTokens: totalInputTokens,
        promptTokens: promptTokensCount,
        imageTokens: imageTokensCount,
        costEuros: resolvedCost
      }
    });
  }
});

function ensureLocalTestFilesExist() {
  try {
    const dirPath = path.join(process.cwd(), "src", "local_test_images");
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // 1. Search recursively for input_file_0.png, input_file_1.png, input_file_2.png
    // (limited to temp dirs and the project dir — never scan the filesystem root)
    const dirsToSearch = ["/tmp", process.cwd(), "/var/tmp"];
    const foundFiles: string[] = [];

    const searchDir = (dir: string, depth = 0) => {
      if (depth > 3) return; // avoid deep systems
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          let stat;
          try {
            stat = fs.statSync(fullPath);
          } catch {
            continue;
          }

          if (stat.isDirectory()) {
            if (file === "node_modules" || file === ".git" || file === "proc" || file === "sys" || file === "dev" || file === "lib" || file === "lib64" || file === "usr" || file === "bin" || file === "sbin" || file === "etc" || file === "var" || file === "dist" || file === "uploads") {
              continue;
            }
            searchDir(fullPath, depth + 1);
          } else {
            if (file.includes("input_file_")) {
              foundFiles.push(fullPath);
            }
          }
        }
      } catch (err) {
        // skip errors
      }
    };

    for (const startDir of [...new Set(dirsToSearch)]) {
      searchDir(startDir);
    }

    console.log("🔍 Search finished. Found input files:", foundFiles);

    // Copy with overwrite priority
    for (const fp of foundFiles) {
      const filename = path.basename(fp);
      if (filename.includes("input_file_0")) {
        fs.copyFileSync(fp, path.join(dirPath, "imageA_local.jpg"));
        console.log(`✅ Copied ${fp} -> imageA_local.jpg`);
      } else if (filename.includes("input_file_1")) {
        fs.copyFileSync(fp, path.join(dirPath, "imageB_local.png"));
        console.log(`✅ Copied ${fp} -> imageB_local.png`);
      } else if (filename.includes("input_file_2")) {
        fs.copyFileSync(fp, path.join(dirPath, "imageC_local.jpg"));
        console.log(`✅ Copied ${fp} -> imageC_local.jpg`);
      }
    }

    // Tiny 1x1 base64 values
    const tinyJpgBase64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
    const tinyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const fileA = path.join(dirPath, "imageA_local.jpg");
    const fileB = path.join(dirPath, "imageB_local.png");
    const fileC = path.join(dirPath, "imageC_local.jpg");

    const isCorrupted = (filePath: string) => {
      try {
        if (!fs.existsSync(filePath)) return true;
        const content = fs.readFileSync(filePath);
        if (content.length === 0) return true;
        if (content[0] === 0x3c) return true; // Starts with '<' (HTML)
        return false;
      } catch {
        return true;
      }
    };

    if (isCorrupted(fileA)) {
      fs.writeFileSync(fileA, Buffer.from(tinyJpgBase64, "base64"));
      console.log("📁 Ré-initialisé imageA_local.jpg de secours.");
    }
    if (isCorrupted(fileB)) {
      fs.writeFileSync(fileB, Buffer.from(tinyPngBase64, "base64"));
      console.log("📁 Ré-initialisé imageB_local.png de secours.");
    }
    if (isCorrupted(fileC)) {
      fs.writeFileSync(fileC, Buffer.from(tinyJpgBase64, "base64"));
      console.log("📁 Ré-initialisé imageC_local.jpg de secours.");
    }
  } catch (err) {
    console.warn("⚠️ Erreur d'initialisation des dossiers de secours:", err);
  }
}

// ---------------------------------------------------------------------------
// Server-side job orchestrator (opt-in via SERVER_ORCHESTRATION=true).
// Polls the Firestore `exports` collection with the service-account token and
// processes pending jobs itself, so generations no longer depend on the
// control-panel browser tab being open. Kept opt-in because running it at the
// same time as the panel's client-side auto-trigger would double-process jobs
// (and double the Gemini spend) — enable one or the other, not both.
// ---------------------------------------------------------------------------
const ORCHESTRATION_ENABLED = process.env.SERVER_ORCHESTRATION === "true";
const ORCHESTRATION_POLL_MS = Math.max(5000, Number(process.env.SERVER_ORCHESTRATION_POLL_MS || 15000));
let orchestratorBusy = false;

async function claimExportJob(docId: string, updateTime: string): Promise<boolean> {
  try {
    // The updateTime precondition makes the claim atomic: if another worker
    // (or the panel) touched the doc since we read it, the PATCH fails.
    const url = `${firestoreBaseUrl()}/exports/${encodeURIComponent(docId)}`
      + `?updateMask.fieldPaths=status&updateMask.fieldPaths=progress`
      + `&currentDocument.updateTime=${encodeURIComponent(updateTime)}`;
    const result = await firestoreRequest("PATCH", url, {
      fields: {
        status: { stringValue: "processing" },
        progress: { integerValue: "15" },
      },
    });
    return !!result;
  } catch {
    return false; // precondition failed -> someone else claimed the job
  }
}

async function patchExportJob(docId: string, patch: Record<string, any>): Promise<void> {
  const mask = Object.keys(patch)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  const url = `${firestoreBaseUrl()}/exports/${encodeURIComponent(docId)}?${mask}`;
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) {
    fields[k] = toFirestoreValue(v);
  }
  await firestoreRequest("PATCH", url, { fields });
}

async function orchestratorTick(): Promise<void> {
  if (orchestratorBusy) return;
  orchestratorBusy = true;
  try {
    const token = await getServiceAccountToken();
    if (!token) return; // no credentials (local run): stay idle

    const rows = await firestoreRequest("POST", `${firestoreBaseUrl()}:runQuery`, {
      structuredQuery: {
        from: [{ collectionId: "exports" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "status" },
            op: "IN",
            value: {
              arrayValue: {
                values: [{ stringValue: "pending" }, { stringValue: "ready_to_generate" }],
              },
            },
          },
        },
        limit: 3,
      },
    });
    if (!rows) return;

    for (const row of rows) {
      if (!row.document) continue;
      const { id, updateTime, data } = decodeFirestoreDoc(row.document);
      if (!data.imageA || !data.imageB || !data.imageC) continue; // inputs not ready yet
      if (!(await claimExportJob(id, updateTime))) continue;
      console.log(`🤖 [ORCHESTRATOR] Job '${id}' réclamé, génération en cours...`);

      try {
        const meta = data.metadataUtilisateur || {};
        const payload = {
          jobId: id,
          userId: data.userId || "user_test_99",
          prompt: data.prompt || data.unifiedInstruction || "",
          model: data.model,
          aspectRatio: data.aspectRatio,
          imageSize: data.imageSize,
          imageA: data.imageA,
          imageB: data.imageB,
          imageC: data.imageC,
          logo: data.logo || undefined,
          metadataUtilisateur: meta,
          presetsFond: data.presetsFond,
          W_B: data.W_B || meta.W_B,
          H_B: data.H_B || meta.H_B,
          text: !!meta.texte,
          textContent: meta.texte || "",
          geometryGuidanceMode: data.geometryGuidanceMode,
          coordinatePromptMode: data.coordinatePromptMode,
        };

        // Reuse the full generation pipeline by calling our own endpoint locally
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (API_SHARED_SECRET) headers["x-api-key"] = API_SHARED_SECRET;
        const genRes = await fetch(`http://127.0.0.1:${PORT}/api/gemini/generate`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        const genJson: any = await genRes.json();

        if (genRes.ok && genJson.success && genJson.imageUrl) {
          await patchExportJob(id, {
            status: "completed",
            progress: 100,
            imageFinal: genJson.imageUrl,
            url: genJson.imageUrl,
            completedAt: new Date().toISOString(),
          });
          console.log(`✅ [ORCHESTRATOR] Job '${id}' terminé : ${String(genJson.imageUrl).slice(0, 80)}...`);
        } else {
          const reason = String(genJson.apiError || `HTTP ${genRes.status}`);
          await patchExportJob(id, { status: "failed", errorMessage5: reason });
          console.warn(`❌ [ORCHESTRATOR] Job '${id}' en échec : ${reason}`);
        }
      } catch (err: any) {
        console.error(`❌ [ORCHESTRATOR] Erreur sur le job '${id}' :`, err);
        try {
          await patchExportJob(id, { status: "failed", errorMessage5: err.message || String(err) });
        } catch {
          // job left in "processing"; it will need a manual retry
        }
      }
    }
  } catch (err) {
    console.warn("⚠️ [ORCHESTRATOR] Tick en échec :", err);
  } finally {
    orchestratorBusy = false;
  }
}

async function startServer() {
  ensureLocalTestFilesExist();
  // Vite middleware for development (imported lazily so the production bundle never loads Vite)
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve production static assets
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Full-stack Active Server running on port ${PORT}`);
    if (ORCHESTRATION_ENABLED) {
      console.log(`🤖 [ORCHESTRATOR] Orchestration serveur activée (poll toutes les ${ORCHESTRATION_POLL_MS / 1000}s). Désactivez le déclenchement auto du panneau pour éviter les doubles générations.`);
      setInterval(orchestratorTick, ORCHESTRATION_POLL_MS);
    }
  });
}

startServer();
