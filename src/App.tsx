import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  FileJson,
  Code,
  Copy,
  Database,
  Terminal,
  Layers,
  Sliders,
  Eye,
  RefreshCw,
  Info,
  Link,
  Settings,
  HelpCircle,
  ArrowRight,
  Server,
  CloudLightning,
  Check,
  Cpu,
  ChevronDown,
  Wifi,
  WifiOff,
  Image,
  FolderSync,
  Sparkles,
  Coins,
  BookOpen,
  Download,
  Lock,
  Upload
} from "lucide-react";
import { initializeApp, getApps, getApp, deleteApp } from "firebase/app";
import { getFirestore, collection, onSnapshot, query, orderBy, limit, doc, updateDoc, getDoc, where } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from "firebase/storage";
import { FirestoreJobPayload, PresetsFond } from "./types";
import { generatePythonSnippet, generateNodeSnippet, generateCurlSnippet } from "./codeSnippets";
import { apiFetch } from "./api";
import {
  FIREBASE_DEFAULTS,
  GLOBAL_ENTRIES_DATABASE_ID,
  DEFAULT_BUCKET_GS,
  DEFAULT_IMAGE_A,
  DEFAULT_IMAGE_B,
  DEFAULT_IMAGE_C,
  DEFAULT_LOGO,
} from "./constants";
import pwaConfig from "../firebase-applet-config.json";

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, appInstance?: any) {
  let currentUser: any = null;
  try {
    if (appInstance) {
      const authInstance = getAuth(appInstance);
      currentUser = authInstance?.currentUser;
    } else if (getApps().length > 0) {
      const authInstance = getAuth(getApps()[0]);
      currentUser = authInstance?.currentUser;
    }
  } catch (e) {
    // Safely ignore auth initialization errors if auth is disabled/dormant
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid || null,
      email: currentUser?.email || null,
      emailVerified: currentUser?.emailVerified || null,
      isAnonymous: currentUser?.isAnonymous || null,
      tenantId: currentUser?.tenantId || null,
      providerInfo: currentUser?.providerData?.map((provider: any) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.warn("Firestore Warning: ", JSON.stringify(errInfo));
  // Ne pas jeter d'exception brute pour éviter de faire planter l'application entière en cas de dépassement de quota Firestore.
  // L'erreur sera affichée proprement dans l'interface utilisateur gérée par syncStatus/syncError.
}

export default function App() {
  // Collapsible sections state
  const [isSec1Expanded, setIsSec1Expanded] = useState<boolean>(false);
  const [isSec2Expanded, setIsSec2Expanded] = useState<boolean>(true);
  const [isSec3Expanded, setIsSec3Expanded] = useState<boolean>(true);
  const [isSec4Expanded, setIsSec4Expanded] = useState<boolean>(false);
  const [isSec5Expanded, setIsSec5Expanded] = useState<boolean>(false);
  const [isSec6Expanded, setIsSec6Expanded] = useState<boolean>(true);

  const [apiHealth, setApiHealth] = useState<{
    status: "unknown" | "healthy" | "unhealthy";
    lastChecked: string;
    errorMessage?: string;
  }>({ status: "unknown", lastChecked: "" });

  const fetchApiHealth = async () => {
    try {
      const res = await apiFetch("/api/gemini/health");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setApiHealth({
            status: data.status,
            lastChecked: data.lastChecked,
            errorMessage: data.errorMessage
          });
        }
      }
    } catch (err) {
      console.warn("Failed to fetch API Health:", err);
    }
  };

  // Config variables representing the project settings
  const [firebaseProjectId, setFirebaseProjectId] = useState<string>(pwaConfig?.projectId || FIREBASE_DEFAULTS.projectId);
  const [firebaseAppId, setFirebaseAppId] = useState<string>(pwaConfig?.appId || FIREBASE_DEFAULTS.appId);
  const [firebaseApiKey, setFirebaseApiKey] = useState<string>(pwaConfig?.apiKey || FIREBASE_DEFAULTS.apiKey);
  const [firebaseAuthDomain, setFirebaseAuthDomain] = useState<string>(pwaConfig?.authDomain || FIREBASE_DEFAULTS.authDomain);
  const [firestoreDatabaseId, setFirestoreDatabaseId] = useState<string>(pwaConfig?.firestoreDatabaseId || FIREBASE_DEFAULTS.firestoreDatabaseId);
  const [firebaseBucketName, setFirebaseBucketName] = useState<string>(pwaConfig?.storageBucket ? `gs://${pwaConfig.storageBucket}` : DEFAULT_BUCKET_GS);
  const [firebaseStorageBucket, setFirebaseStorageBucket] = useState<string>(pwaConfig?.storageBucket || FIREBASE_DEFAULTS.storageBucket);
  const [messagingSenderId, setMessagingSenderId] = useState<string>(pwaConfig?.messagingSenderId || FIREBASE_DEFAULTS.messagingSenderId);
  const [measurementId, setMeasurementId] = useState<string>(pwaConfig?.measurementId || "");
  const [firestoreCollection, setFirestoreCollection] = useState<string>("exports");
  const [userId, setUserId] = useState<string>("user_test_99");
  const [previewMode, setPreviewMode] = useState<"interactive" | "reference" | "overlay">("interactive");

  // Raw Address Inputs for the PWA payload - No standard lists/menus of Mojave, Porsche, etc.
  const [imageA, setImageA] = useState<string>(
    DEFAULT_IMAGE_A
  );
  const [imageB, setImageB] = useState<string>(
    DEFAULT_IMAGE_B
  );
  const [imageC, setImageC] = useState<string>(
    DEFAULT_IMAGE_C
  );
  const [logo, setLogo] = useState<string>(
    DEFAULT_LOGO
  );

  // --- LOCAL TEST MODE TOGGLE STATES & HANDLERS ---
  const [isLocalMode, setIsLocalMode] = useState<boolean>(false);
  const [lastFirebaseImageA, setLastFirebaseImageA] = useState<string>(
    DEFAULT_IMAGE_A
  );
  const [lastFirebaseImageB, setLastFirebaseImageB] = useState<string>(
    DEFAULT_IMAGE_B
  );
  const [lastFirebaseImageC, setLastFirebaseImageC] = useState<string>(
    DEFAULT_IMAGE_C
  );
  const [localCacheBuster, setLocalCacheBuster] = useState<string>(String(Date.now()));
  const [isSavingLocal, setIsSavingLocal] = useState<boolean>(false);
  const [saveLocalStatus, setSaveLocalStatus] = useState<string>("");
  const [uploadStatus, setUploadStatus] = useState<Record<string, string>>({});

  const handleUploadLocalFile = async (filename: string, file: File) => {
    setUploadStatus(prev => ({ ...prev, [filename]: "Lecture du fichier..." }));
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      try {
        setUploadStatus(prev => ({ ...prev, [filename]: "Envoi au serveur..." }));
        const res = await apiFetch("/api/upload-local", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename, base64Data }),
        });
        const data = await res.json();
        if (data.success) {
          setUploadStatus(prev => ({ ...prev, [filename]: "✅ Enregistré avec succès !" }));
          // Force refresh of the cache buster
          setLocalCacheBuster(String(Date.now()));
          // If in local mode, make sure the input reflects this
          if (isLocalMode) {
            if (filename === "imageA_local.jpg") setImageA(`/local_test_images/imageA_local.jpg`);
            if (filename === "imageB_local.png") setImageB(`/local_test_images/imageB_local.png`);
            if (filename === "imageC_local.jpg") setImageC(`/local_test_images/imageC_local.jpg`);
          }
          setTimeout(() => {
            setUploadStatus(prev => {
              const next = { ...prev };
              delete next[filename];
              return next;
            });
          }, 4000);
        } else {
          setUploadStatus(prev => ({ ...prev, [filename]: `❌ Erreur : ${data.error}` }));
        }
      } catch (err: any) {
        setUploadStatus(prev => ({ ...prev, [filename]: `❌ Échec : ${err.message || err}` }));
      }
    };
    reader.onerror = () => {
      setUploadStatus(prev => ({ ...prev, [filename]: "❌ Erreur de lecture locale" }));
    };
    reader.readAsDataURL(file);
  };

  const handleToggleLocalMode = (enabled: boolean) => {
    setIsLocalMode(enabled);
    if (enabled) {
      setLastFirebaseImageA(imageA);
      setLastFirebaseImageB(imageB);
      setLastFirebaseImageC(imageC);
      setImageA("/local_test_images/imageA_local.jpg");
      setImageB("/local_test_images/imageB_local.png");
      setImageC("/local_test_images/imageC_local.jpg");
    } else {
      setImageA(lastFirebaseImageA);
      setImageB(lastFirebaseImageB);
      setImageC(lastFirebaseImageC);
    }
  };

  const handleSaveCurrentImagesLocally = async () => {
    setIsSavingLocal(true);
    setSaveLocalStatus("Téléchargement et écriture locale des fichiers...");
    try {
      const payload = {
        imageA: isLocalMode ? lastFirebaseImageA : imageA,
        imageB: isLocalMode ? lastFirebaseImageB : imageB,
        imageC: isLocalMode ? lastFirebaseImageC : imageC,
      };

      const res = await apiFetch("/api/save-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setSaveLocalStatus(`✅ Réussite ! Images sauvegardées sous /src/local_test_images/`);
        setLocalCacheBuster(String(Date.now()));
        if (isLocalMode) {
          // Force state update to refresh visual displays
          setImageA("/local_test_images/imageA_local.jpg");
          setImageB("/local_test_images/imageB_local.png");
          setImageC("/local_test_images/imageC_local.jpg");
        }
      } else {
        setSaveLocalStatus(`❌ Erreur d'écriture : ${data.errors ? data.errors.join(", ") : "Inconnue"}`);
      }
    } catch (err: any) {
      setSaveLocalStatus(`❌ Erreur réseau : ${err.message || err}`);
    } finally {
      setIsSavingLocal(false);
      setTimeout(() => setSaveLocalStatus(""), 8000);
    }
  };

  // --- AUTOMATIC HIGH-FIDELITY FALLBACK SYSTEM FOR SANDBOX VISUALIZATION ---
  const FALLBACK_IMAGE_A = DEFAULT_IMAGE_A;
  const FALLBACK_IMAGE_B = DEFAULT_IMAGE_B;
  const FALLBACK_IMAGE_C = DEFAULT_IMAGE_C;
  const FALLBACK_LOGO = DEFAULT_LOGO;

  const [imageALoadError, setImageALoadError] = useState<boolean>(false);
  const [imageBLoadError, setImageBLoadError] = useState<boolean>(false);
  const [imageCLoadError, setImageCLoadError] = useState<boolean>(false);
  const [logoLoadError, setLogoLoadError] = useState<boolean>(false);

  // Independent thumbnail-specific loading states for received channel inspector
  const [thumbImageALoadError, setThumbImageALoadError] = useState<boolean>(false);
  const [thumbImageBLoadError, setThumbImageBLoadError] = useState<boolean>(false);
  const [thumbImageCLoadError, setThumbImageCLoadError] = useState<boolean>(false);
  const [thumbLogoLoadError, setThumbLogoLoadError] = useState<boolean>(false);

  // Table Configuration (JSON / table file specifying the properties)
  const [logoAutorise, setLogoAutorise] = useState<boolean>(true);
  const [texteAutorise, setTexteAutorise] = useState<boolean>(true);
  
  // Table coords & Slogan properties
  const [logoX, setLogoX] = useState<number>(12);
  const [logoY, setLogoY] = useState<number>(80);
  const [logoW, setLogoW] = useState<number>(200);
  const [logoH, setLogoH] = useState<number>(50);
  
  const [fontFamily, setFontFamily] = useState<string>("Inter");
  const [textColor, setTextColor] = useState<string>("rgba(255,255,255,0.95)");
  const [textSize, setTextSize] = useState<string>("normal"); // small | normal | large

  const [sloganText, setSloganText] = useState<string>("Électrifiez vos horizons.");

  // New Harmonized API & Mask States
  const [logoSize, setLogoSize] = useState<string>("150");
  const [logoColorFill, setLogoColorFill] = useState<string>("#FF0000");
  const [logoColorFillEnabled, setLogoColorFillEnabled] = useState<boolean>(false);
  const [logoExtra, setLogoExtra] = useState<string>("");
  const [textperspective, setTextperspective] = useState<string>("");
  const [textExtra, setTextExtra] = useState<string>("");
  const [textAlign, setTextAlign] = useState<string>("CENTRE");
  const [textX, setTextX] = useState<string>("640");
  const [textY, setTextY] = useState<string>("1000");

  // Dynamic Gemini Prompts Toggles (from SCSS specification blueprint V2)
  const [logoPrompt, setLogoPrompt] = useState<string>("");
  const [logoPromptActive, setLogoPromptActive] = useState<boolean>(false);
  const [textPrompt, setTextPrompt] = useState<string>("");
  const [textPromptActive, setTextPromptActive] = useState<boolean>(false);

  // Matrix physical coordinates coordinates
  const [transformX, setTransformX] = useState<number>(-2.5);
  const [transformY, setTransformY] = useState<number>(14.2);
  const [transformScale, setTransformScale] = useState<number>(1.15);
  const [transformRotation, setTransformRotation] = useState<number>(-1.2);

  // Vehicle bounding box useful crop coordinates inside original imageB
  const [boundingBoxLeft, setBoundingBoxLeft] = useState<number>(120);
  const [boundingBoxRight, setBoundingBoxRight] = useState<number>(1480);
  const [boundingBoxTop, setBoundingBoxTop] = useState<number>(210);
  const [boundingBoxBottom, setBoundingBoxBottom] = useState<number>(780);

  // Snippets & UI layout
  const [activeTab, setActiveTab] = useState<"json" | "python" | "node" | "curl">("json");
  const [copied, setCopied] = useState<boolean>(false);
  const [sec3Tab, setSec3Tab] = useState<"table" | "json">("json");

  // Engine simulation logs
  const [isRunningPipeline, setIsRunningPipeline] = useState<boolean>(false);
  const isRunningPipelineRef = useRef<boolean>(false);
  useEffect(() => {
    isRunningPipelineRef.current = isRunningPipeline;
  }, [isRunningPipeline]);

  useEffect(() => {
    fetchApiHealth();
    const interval = setInterval(fetchApiHealth, 10000);
    return () => clearInterval(interval);
  }, []);
  const [pipelineLogEvents, setPipelineLogEvents] = useState<string[]>([]);
  const [simulationStep, setSimulationStep] = useState<number>(0);
  const [isSuccessState, setIsSuccessState] = useState<boolean>(false);

  // Section 6: Unified Gemini Multimodal Generation API States
  const [geminiModel, setGeminiModel] = useState<string>("gemini-3.1-flash-image");
  const [coordinatePromptMode, setCoordinatePromptMode] = useState<"COORD_LONG" | "COORD_LIGHT">("COORD_LONG");
  const [geminiPrompt, setGeminiPrompt] = useState<string>(`Photorealistic premium automotive photography.
Real vehicle.
Real environment.
Natural lighting.
Production-quality realism.`);
  const [geminiAspectRatio, setGeminiAspectRatio] = useState<string>("1:1");
  const [geminiImageSize, setGeminiImageSize] = useState<string>("2K");
  const [geminiLogs, setGeminiLogs] = useState<string[]>([]);
  const [geminiResultUrl, setGeminiResultUrl] = useState<string>("");
  const [geminiIsLoading, setGeminiIsLoading] = useState<boolean>(false);
  const [geminiMetrics, setGeminiMetrics] = useState<{ inputTokens: number, promptTokens: number, imageTokens: number, costEuros: number }>({
    inputTokens: 0,
    promptTokens: 0,
    imageTokens: 0,
    costEuros: 0.03
  });

  // Custom instruction text parameters for total transparency and control
  const [geminiUnifiedInstruction, setGeminiUnifiedInstruction] = useState<string>(`Create one photorealistic automotive image from the three input images.
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
low quality`);
  const [geminiDescA, setGeminiDescA] = useState<string>("");
  const [geminiDescB, setGeminiDescB] = useState<string>("");
  const [geminiDescC, setGeminiDescC] = useState<string>("");

  // --- CAPTEUR DE FLUX REEL FIRESTORE STATES ---
  const [isSyncActive, setIsSyncActive] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  const [syncError, setSyncError] = useState<string>("");
  const [receivedJobs, setReceivedJobs] = useState<any[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJobStatus, setActiveJobStatus] = useState<string | null>(null);
  const [activeDb, setActiveDb] = useState<any>(null);
  const activeAppRef = useRef<any>(null);
  const [isAutoGenerateActive, setIsAutoGenerateActive] = useState<boolean>(true);
  const isAutoGenerateActiveRef = useRef<boolean>(true);
  useEffect(() => {
    isAutoGenerateActiveRef.current = isAutoGenerateActive;
  }, [isAutoGenerateActive]);

  const handleLocalFirestoreError = (err: any, op: OperationType, path: string | null) => {
    handleFirestoreError(err, op, path, activeAppRef.current);
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.toLowerCase().includes("quota") || errMsg.toLowerCase().includes("exhausted") || errMsg.toLowerCase().includes("limit") || errMsg.toLowerCase().includes("resource-exhausted")) {
      setSyncStatus("error");
      setSyncError(errMsg);
      setIsSyncActive(false);
      setPipelineLogEvents(prev => [...prev, "⚠️ [SYS] Désactivation automatique de Firestore Sync car le quota Firestore a été dépassé."]);
    }
  };

  const syncLocalJobState = (jobId: string, updates: {
    status?: string;
    progress?: number;
    imageUrl?: string;
    imageFinal?: string;
    error?: string;
  }) => {
    if (!jobId) return;
    apiFetch(`/api/jobs/${jobId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    }).catch(err => {
      console.warn("Failed to sync local job state with Express:", err);
    });
  };

  const triggeredJobsRef = useRef<Record<string, boolean>>({});
  const step5TriggeredJobsRef = useRef<Record<string, boolean>>({});
  
  // High-fidelity lightbox preview for Image A, B, C & Logo
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxTitle, setLightboxTitle] = useState<string>("");

  // Construct presetsFond object representation
  const presetsFond: PresetsFond = {
    logoAutorise,
    texteAutorise,
    logoPlaceholderCoords: {
      x: logoX,
      y: logoY,
      w: logoW,
      h: logoH
    },
    texteStylePreset: {
      font: fontFamily,
      color: textColor,
      size: textSize
    },
    // Adding harmonized / new schema properties inside presetsFond
    logoSize,
    logoColorFill,
    logoColorFillEnabled,
    logoExtra,
    textperspective,
    textExtra,
    // Add V2 Blueprint fields
    logoPrompt,
    logoPromptActive,
    textPrompt,
    textPromptActive,
    // Add Firestore prompt_ai table synchronised descriptions
    descImageA: geminiDescA,
    descImageB: geminiDescB,
    descImageC: geminiDescC,
    generalPrompt: geminiUnifiedInstruction
  };

  // Compile full firestore document
  const firestorePayload: FirestoreJobPayload = {
    imageA,
    presetsFond,
    imageB,
    imageC,
    logo: logoAutorise ? logo : "",
    metadataUtilisateur: {
      texte: texteAutorise ? sloganText : "",
      transformVehicule: {
        x: transformX,
        y: transformY,
        scale: transformScale,
        rotation: transformRotation
      },
      boundingBoxVehicule: {
        left: boundingBoxLeft,
        right: boundingBoxRight,
        top: boundingBoxTop,
        bottom: boundingBoxBottom
      }
    },
    // Supporting the flat harmonized schema properties directly at root level as well
    logoX: String(logoX * 10),
    logoY: String(logoY * 10),
    logoSize,
    logoColorFill,
    logoColorFillEnabled,
    logoExtra,
    text: texteAutorise,
    textContent: sloganText,
    textFont: fontFamily,
    textSize: textSize === "large" ? "64" : textSize === "small" ? "32" : "48",
    textAlign,
    textColorFill: textColor,
    textperspective,
    textExtra,
    textX,
    textY,
    logoPrompt,
    logoPromptActive,
    textPrompt,
    textPromptActive
  };

  // --- URL RESOLVER FOR PLAYHOLDERS & STORAGE PATHS ---
  const getResolvedUrl = (url: string) => {
    if (!url) return "";
    const idToUse = activeJobId || "SIM_ACTIVE_JOB";
    let resolved = url
      .replaceAll("{jobId}", idToUse)
      .replaceAll("%7BjobId%7D", idToUse)
      .replaceAll("{userId}", userId)
      .replaceAll("%7BuserId%7D", userId);

    // Convert Firestore Storage paths (gs://) to browser-loadable HTTPS URLs dynamically
    if (resolved.startsWith("gs://")) {
      try {
        const sansScheme = resolved.slice(5); // remove "gs://"
        const slashIdx = sansScheme.indexOf("/");
        if (slashIdx !== -1) {
          const bucket = sansScheme.slice(0, slashIdx);
          const path = sansScheme.slice(slashIdx + 1);
          const encodedPath = encodeURIComponent(path);
          return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media`;
        }
      } catch (err) {
        console.error("Error converting gs:// URL:", err);
      }
    }

    if (resolved.startsWith("/local_test_images/") && localCacheBuster) {
      return `${resolved}?cb=${localCacheBuster}`;
    }
    return resolved;
  };

  const isRenderableImageSource = (url: string) => {
    if (!url) return false;
    return (
      url.startsWith("data:image/") ||
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("gs://") ||
      url.startsWith("/") ||
      url.includes("local")
    );
  };

  const isPublishableFirestoreImageUrl = (url: string) => {
    if (!url) return false;
    return (
      url.startsWith("https://firebasestorage.googleapis.com/") ||
      url.startsWith("https://storage.googleapis.com/") ||
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("/")
    );
  };

  // Convert absolute coords on the 1280px grid (> 100) or pure percentages (0-100) dynamically
  const getPercentStyleX = (val: number) => {
    if (val > 100) {
      return (val / 1280) * 100;
    }
    return val;
  };

  const getPercentStyleY = (val: number) => {
    if (val > 100) {
      return (val / 1280) * 100;
    }
    return val;
  };

  const resolvedImageA = getResolvedUrl(imageA);
  const resolvedImageB = getResolvedUrl(imageB);
  const resolvedImageC = getResolvedUrl(imageC);
  const resolvedLogo = getResolvedUrl(logo);

  // Reset errors automatically when URLs change so we don't hold sticky mock/fallback states
  useEffect(() => {
    setImageALoadError(false);
    setThumbImageALoadError(false);
  }, [resolvedImageA, activeJobId]);

  useEffect(() => {
    setImageBLoadError(false);
    setThumbImageBLoadError(false);
  }, [resolvedImageB, activeJobId]);

  useEffect(() => {
    setImageCLoadError(false);
    setThumbImageCLoadError(false);
  }, [resolvedImageC, activeJobId]);

  useEffect(() => {
    setLogoLoadError(false);
    setThumbLogoLoadError(false);
  }, [resolvedLogo, activeJobId]);

  // --- GATEKEEPER VALIDATION VERIFICATION ---
  const isImageAValid = isRenderableImageSource(resolvedImageA);
  const isImageBValid = isRenderableImageSource(resolvedImageB);
  const isImageCValid = isRenderableImageSource(resolvedImageC);
  
  // Pilier 1: Validation Chimique
  const validationChimiquePassed = isImageAValid && isImageBValid && isImageCValid;

  // Pilier 2: Conformité de la table des Presets
  const logoConformityPassed = !logoAutorise || (!!resolvedLogo && (resolvedLogo.startsWith("http://") || resolvedLogo.startsWith("https://") || resolvedLogo.startsWith("gs://")));
  const textConformityPassed = !texteAutorise || (!!sloganText && sloganText.trim().length > 0);
  const presetsPassed = logoConformityPassed && textConformityPassed;

  // Pilier 3: Convergence géométrique
  const geomPassed = 
    typeof transformX === "number" && !isNaN(transformX) &&
    typeof transformY === "number" && !isNaN(transformY) &&
    typeof transformScale === "number" && !isNaN(transformScale) &&
    typeof transformRotation === "number" && !isNaN(transformRotation);

  const isGatekeeperClear = validationChimiquePassed && presetsPassed && geomPassed;
  const currentStatus = isGatekeeperClear ? "ready_to_generate" : "waiting_inputs";

  useEffect(() => {
    const isPendingStatus = activeJobStatus !== "completed" && activeJobStatus !== "failed";
    if (isAutoGenerateActive && isGatekeeperClear && !geminiIsLoading && !isRunningPipeline && activeJobId && isPendingStatus) {
      if (!triggeredJobsRef.current[activeJobId]) {
        triggeredJobsRef.current[activeJobId] = true;
        setPipelineLogEvents([
          `⚡ [AUTO-ENGINE] Déclenchement automatique de la génération pour la tâche : ${activeJobId}`
        ]);
        setGeminiLogs([
          `⚡ [AUTO-ENGINE] Déclenchement automatique de la génération pour la tâche : ${activeJobId}`
        ]);
        triggerGeminiGeneration();
      }
    }
  }, [isAutoGenerateActive, isGatekeeperClear, geminiIsLoading, isRunningPipeline, activeJobId, activeJobStatus]);

  // Gatekeeper reporting listener to log precise blocking causes (for developer reference only, keeps user console empty)
  useEffect(() => {
    if (activeJobId && !activeJobId.startsWith("job_sim") && !isGatekeeperClear && !isRunningPipeline) {
      const issues: string[] = [];
      if (!validationChimiquePassed) {
        issues.push("Pilier 1 (Canaux d'image manquants ou invalides)");
      }
      if (!presetsPassed) {
        const logoIssue = logoAutorise && (!resolvedLogo || (!resolvedLogo.startsWith("http") && !resolvedLogo.startsWith("gs")));
        const textIssue = texteAutorise && (!sloganText || sloganText.trim().length === 0);
        const subIssues: string[] = [];
        if (logoIssue) subIssues.push("Logo requis mais URL manquante");
        if (textIssue) subIssues.push("Slogan requis mais texte vide");
        issues.push(`Pilier 2 (Conformité graphique : ${subIssues.join(", ") || "Presets non respectés"})`);
      }
      if (!geomPassed) {
        issues.push("Pilier 3 (Matrice de transformation du véhicule corrompue)");
      }
      
      const msg = `⏳ [GATEKEEPER ACCÈS] Évaluation du Job '${activeJobId}' : Le moteur est en attente. Bloqué par : ${issues.join(" | ")}`;
      console.info(msg);
    }
  }, [activeJobId, isGatekeeperClear, isRunningPipeline, validationChimiquePassed, presetsPassed, geomPassed, logoAutorise, resolvedLogo, texteAutorise, sloganText]);

  // Simulate execution logs from backend listener
  const triggerSimulation = () => {
    if (!isGatekeeperClear) return;
    setIsRunningPipeline(true);
    setSimulationStep(1);
    setIsSuccessState(false);
    
    const isRealJob = activeJobId && !activeJobId.startsWith("job_sim");
    setPipelineLogEvents([
      "📡 [FIRESTORE LISTENER] Détection d'un nouveau document Job...",
      `📦 ID de tâche : ${activeJobId || "job_sim_" + Math.floor(Math.random() * 89999 + 10000)}`,
      `⚙️ Statut actuel détecté : ${currentStatus}`,
      isRealJob ? "⚡ [SYNC ACTIVÉE] Le Moteur NodeGen synchronise la génération en temps réel avec Firebase Firestore." : "💻 [MOCK LOCAL] Simulation locale uniquement, d'un Job simulé hors connexion."
    ]);

    if (activeJobId) {
      syncLocalJobState(activeJobId, { status: "processing", progress: 15 });
    }

    // Fast-track initial state update in Firestore to show the PWA we are processing!
    if (isRealJob && activeDb) {
      try {
        const docRef = doc(activeDb, firestoreCollection || "exports", activeJobId!);
        updateDoc(docRef, { status: "processing", progress: 15 }).then(() => {
          setPipelineLogEvents(prev => [...prev, "✔️ [FIRESTORE] Statut mis à jour sur Firebase: 'processing' (15%)"]);
        }).catch(err => {
          console.error("Firestore write initial error:", err);
          setPipelineLogEvents(prev => [...prev, `❌ [FIRESTORE ERROR] Échec de la mise à jour: ${err.message}`]);
          handleLocalFirestoreError(err, OperationType.WRITE, `${firestoreCollection || "exports"}/${activeJobId!}`);
        });
      } catch (err: any) {
        console.error("Exception during direct updateDoc:", err);
        handleLocalFirestoreError(err, OperationType.WRITE, `${firestoreCollection || "exports"}/${activeJobId!}`);
      }
    }
  };

  useEffect(() => {
    if (!isRunningPipeline) return;

    let timer: number;
    const isRealJob = activeJobId && !activeJobId.startsWith("job_sim");
    
    if (simulationStep === 1) {
      timer = window.setTimeout(() => {
        setPipelineLogEvents(prev => [
          ...prev,
          "🛡️ [GATEKEEPER] Lancement de l'audit de sûreté du payload...",
          "🧪 [PILIER 1] Validation Chimique : Analyse des formats des URLs d'images...",
          `   ↳ imageA (Fond HD) : OK ✔️ (${imageA ? imageA.substring(0, 48) : ""}...)`,
          `   ↳ imageB (Véhicule détouré stable) : OK ✔️ (${imageB ? imageB.substring(0, 48) : ""}...)`,
          `   ↳ imageC (Composition de référence PWA JPEG-0.75) : OK ✔️`
        ]);
        setSimulationStep(2);
      }, 950);
    } else if (simulationStep === 2) {
      timer = window.setTimeout(() => {
        setPipelineLogEvents(prev => [
          ...prev,
          "📐 [PILIER 2] Vérification des règles de la table Presets...",
          logoAutorise 
            ? `   ↳ Configuration Logo autorisée. URL logo détectée et validée : ✔️ (${logo ? logo.substring(0, 32) : ""}...)`
            : "   ↳ Configuration Logo : Non requis par la table d'intent.",
          texteAutorise
            ? `   ↳ Slogan text requis. Valeur détectée : "${sloganText}" ✔️`
            : "   ↳ Slogan text : Interdit ou non requis par cet arrière-plan.",
          "🧬 [PILIER 2 COMPLIANCE] Statut : OK ✔️"
        ]);
        
        if (activeJobId) {
          syncLocalJobState(activeJobId, { progress: 40 });
        }
        // Push intermediate progress to Firestore
        if (isRealJob && activeDb) {
          try {
            const docRef = doc(activeDb, firestoreCollection || "exports", activeJobId!);
            updateDoc(docRef, { progress: 40 }).catch((err) => {
              handleLocalFirestoreError(err, OperationType.WRITE, `${firestoreCollection || "exports"}/${activeJobId!}`);
            });
          } catch (err: any) {
            handleLocalFirestoreError(err, OperationType.WRITE, `${firestoreCollection || "exports"}/${activeJobId!}`);
          }
        }

        setSimulationStep(3);
      }, 850);
    } else if (simulationStep === 3) {
      timer = window.setTimeout(() => {
        setPipelineLogEvents(prev => [
          ...prev,
          "🦾 [PILIER 3] Analyse de la matrice de transition et convergence géométrique...",
          `   ↳ Coordonnées relatives extraites : Translation X: ${transformX}%, Translation Y: ${transformY}%`,
          `   ↳ Facteurs : Scale: ${transformScale}x, Rotation: ${transformRotation}°`,
          `   ↳ Bounding box du logo : X:${logoX}%, Y:${logoY}%, Lorg-w:${logoW}px, Larg-h:${logoH}px`,
          "✨ [GATEKEEPER VERDICT] Autorisation accordée. Transition du statut vers 'ready_to_generate' effectuée."
        ]);

        if (activeJobId) {
          syncLocalJobState(activeJobId, { progress: 70 });
        }
        // Push progress increase to Firestore
        if (isRealJob && activeDb) {
          try {
            const docRef = doc(activeDb, firestoreCollection || "exports", activeJobId!);
            updateDoc(docRef, { progress: 70 }).catch((err) => {
              handleLocalFirestoreError(err, OperationType.WRITE, `${firestoreCollection || "exports"}/${activeJobId!}`);
            });
          } catch (err: any) {
            handleLocalFirestoreError(err, OperationType.WRITE, `${firestoreCollection || "exports"}/${activeJobId!}`);
          }
        }

        setSimulationStep(4);
      }, 900);
    } else if (simulationStep === 4) {
      timer = window.setTimeout(() => {
        setPipelineLogEvents(prev => [
          ...prev,
          "🧠 [ENGINE COGNITION] Connexion au pipeline d'Inpainting structurel...",
          "🖼️ Téléchargement des matrices brutes et ré-échantillonnage de imageC...",
          "🎨 Harmonisation chromatique bidirectionnelle (Match-Light ambiant)...",
          "✍️ Incrustation du calque de texte typographique formaté..."
        ]);

        if (activeJobId) {
          syncLocalJobState(activeJobId, { progress: 90 });
        }
        // Push pre-completion progress to Firestore
        if (isRealJob && activeDb) {
          try {
            const docRef = doc(activeDb, firestoreCollection || "exports", activeJobId!);
            updateDoc(docRef, { progress: 90 }).catch((err) => {
              handleLocalFirestoreError(err, OperationType.WRITE, `${firestoreCollection || "exports"}/${activeJobId!}`);
            });
          } catch (err: any) {
            handleLocalFirestoreError(err, OperationType.WRITE, `${firestoreCollection || "exports"}/${activeJobId!}`);
          }
        }

        setSimulationStep(5);
      }, 1100);
    } else if (simulationStep === 5) {
      const jobToken = activeJobId || "simulated_local";
      if (step5TriggeredJobsRef.current[jobToken]) {
        return;
      }
      step5TriggeredJobsRef.current[jobToken] = true;

      const generateAndComplete = async () => {
        setPipelineLogEvents(prev => [
          ...prev,
          "🧠 [ENGINE COGNITION] Lancement de la génération d'image réelle via l'API Gemini...",
        ]);

        let finalImgUrl = "";
        let finalStatus = "completed";
        let finalProgress = 100;
        let errorMessage = "";
        let resolvedModelUsed = geminiModel;
        let resolvedCoordinatePromptMode = coordinatePromptMode;
        let resolvedOutputFilename = "";

        try {
          const activePrompt = geminiPrompt || `Photorealistic premium automotive photography.
Real vehicle.
Real environment.
Natural lighting.
Production-quality realism.`;
          const res = await apiFetch("/api/gemini/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: activePrompt,
              model: geminiModel,
              aspectRatio: geminiAspectRatio,
              imageSize: geminiImageSize,
              imageA: resolvedImageA,
              imageB: resolvedImageB,
              imageC: resolvedImageC,
              userId: userId,
              firebaseStorageBucket: firebaseStorageBucket,
              unifiedInstruction: geminiUnifiedInstruction,
              descImageA: geminiDescA,
              descImageB: geminiDescB,
              descImageC: geminiDescC,
              logo: logoAutorise ? logo : "",
              logoPrompt,
              logoPromptActive,
              text: texteAutorise,
              textContent: sloganText,
              textPrompt,
              textPromptActive,
              presetsFond,
              metadataUtilisateur: {
                transformVehicule: { x: transformX, y: transformY, scale: transformScale, rotation: transformRotation },
                boundingBoxVehicule: { left: boundingBoxLeft, right: boundingBoxRight, top: boundingBoxTop, bottom: boundingBoxBottom }
              },
              W_B: 1600,
              H_B: 900,
              coordinatePromptMode: coordinatePromptMode,
              jobId: activeJobId
            })
          });

          if (res.ok) {
            const resData = await res.json();
            if (resData.success && !resData.isSimulated) {
              resolvedModelUsed = resData.modelUsed || geminiModel;
              resolvedCoordinatePromptMode = resData.coordinatePromptMode || coordinatePromptMode;
              resolvedOutputFilename = resData.outputFilename || "";
            }

            if (!resData.success || resData.isSimulated) {
              errorMessage = resData.apiError || "Génération simulée ou échec API — aucune image Gemini authentique.";
              finalStatus = "failed";
              finalProgress = 0;
              setPipelineLogEvents(prev => [
                ...prev,
                `❌ [ENGINE] ${errorMessage}`,
              ]);
            } else if (resData.imageUrl) {
              let resolvedUrl = resData.imageUrl;
              setGeminiResultUrl(resData.imageUrl);
              
              if (resData.imageUrl.startsWith("data:")) {
                setPipelineLogEvents(prev => [
                  ...prev,
                  "☁️ [FIRESTORE STORAGE] Téléversement de l'image haute définition générée en base64 vers Storage..."
                ]);
                try {
                  if (activeAppRef.current) {
                    const storage = getStorage(activeAppRef.current);
                    const fileRef = storageRef(storage, `users/${userId}/homescreens/homescreen_hd_CONTROL_${Date.now()}.jpg`);
                    const uploadSnap = await uploadString(fileRef, resData.imageUrl, "data_url");
                    const downloadUrl = await getDownloadURL(uploadSnap.ref);
                    resolvedUrl = downloadUrl;
                    setPipelineLogEvents(prev => [
                      ...prev,
                      "✔️ [FIRESTORE STORAGE] Téléversement réussi et URL courte obtenue !"
                    ]);
                  } else {
                    throw new Error("Firebase App non initialisée — impossible de publier l'image pour la PWA.");
                  }
                } catch (storageErr: any) {
                  console.error("Firebase Storage upload failed:", storageErr);
                  errorMessage = storageErr.message || String(storageErr);
                  setPipelineLogEvents(prev => [
                    ...prev,
                    `⚠️ [FIRESTORE STORAGE WARNING] Échec du téléversement (${errorMessage}). Conserve de l'image locale en base64 (Aperçu activé localement !)`,
                  ]);
                  // Conserve the raw base64 data-URL so we don't block the user in case of quota issues.
                  resolvedUrl = resData.imageUrl;
                }
              }

              if (finalStatus !== "failed") {
                if (!isPublishableFirestoreImageUrl(resolvedUrl)) {
                  errorMessage = "URL finale invalide pour la PWA (HTTPS Firebase Storage requis).";
                  finalStatus = "failed";
                  finalProgress = 0;
                  setPipelineLogEvents(prev => [
                    ...prev,
                    `❌ [ENGINE] ${errorMessage}`,
                  ]);
                } else {
                  finalImgUrl = resolvedUrl;
                  setPipelineLogEvents(prev => [
                    ...prev,
                    `🎉 [SUCCESS] Rendu Haute Définition finalisé par l'API avec succès !`,
                  ]);
                }
              }

              if (resData.logs) {
                setGeminiLogs(resData.logs);
              }
              if (resData.metrics) {
                setGeminiMetrics(resData.metrics);
              }
            } else {
              errorMessage = "L'API a répondu sans imageUrl.";
              finalStatus = "failed";
              finalProgress = 0;
              setPipelineLogEvents(prev => [
                ...prev,
                `❌ [ENGINE] ${errorMessage}`,
              ]);
            }
          } else {
            let errorText = "";
            try {
              const errData = await res.json();
              errorText = errData.apiError || errData.message || "";
            } catch (e) {}

            errorMessage = errorText || `HTTP ${res.status}`;
            setPipelineLogEvents(prev => [
              ...prev,
              `❌ [ENGINE] Échec strict de la génération API : "${errorMessage}".`,
            ]);
            finalStatus = "failed";
            finalProgress = 0;
          }
        } catch (apiErr: any) {
          errorMessage = apiErr.message || String(apiErr);
          console.error("API call during simulation step 5 failed:", apiErr);
          setPipelineLogEvents(prev => [
            ...prev,
            `❌ [ENGINE] Échec de l'appel API (${errorMessage}).`,
          ]);
          finalStatus = "failed";
          finalProgress = 0;
        }

        if (finalStatus === "failed") {
          setPipelineLogEvents(prev => [
            ...prev,
            "🛑 [ECHEC] Arrêt du processus. Le document Firestore a été marqué en échec pour éviter l'écrasement par l'image de test.",
          ]);
        } else {
          setPipelineLogEvents(prev => [
            ...prev,
            "💾 Image Gemini uploadée — mise à jour Firestore en cours.",
          ]);
        }

        if (activeJobId) {
          syncLocalJobState(activeJobId, {
            status: finalStatus,
            progress: finalProgress,
            imageFinal: finalStatus === "failed" ? "" : finalImgUrl,
            imageUrl: finalStatus === "failed" ? "" : finalImgUrl,
            error: errorMessage || undefined
          });
        }

        // Write final completed state to Firestore for the PWA
        if (isRealJob && activeDb) {
          try {
            const docRef = doc(activeDb, firestoreCollection || "exports", activeJobId!);
            await updateDoc(docRef, { 
              status: finalStatus, 
              progress: finalProgress,
              imageFinal: finalStatus === "failed" ? "" : finalImgUrl,
              url: finalStatus === "failed" ? "" : finalImgUrl,
              imageUrl: finalStatus === "failed" ? "" : finalImgUrl,
              apiError: errorMessage || null,
              error: errorMessage || null,
              completedAt: new Date().toISOString(),
              modelUsed: resolvedModelUsed,
              geometryGuidanceMode: resolvedCoordinatePromptMode,
              coordinatePromptMode: resolvedCoordinatePromptMode,
              outputFilename: resolvedOutputFilename
            });
            setPipelineLogEvents(prev => [...prev, `✔️ [FIRESTORE] Job marqué comme '${finalStatus}' à ${finalProgress}%.`]);
          } catch (err: any) {
            console.error("Firestore completion write error:", err);
            setPipelineLogEvents(prev => [...prev, `❌ [FIRESTORE ERROR] Échec de la finalisation: ${err.message}`]);
            handleLocalFirestoreError(err, OperationType.WRITE, `${firestoreCollection || "exports"}/${activeJobId!}`);
          }
        }

        setIsRunningPipeline(false);
        setIsSuccessState(finalStatus !== "failed");
        fetchApiHealth();
      };

      timer = window.setTimeout(() => {
        generateAndComplete();
      }, 1000);
    }

    return () => clearTimeout(timer);
  }, [simulationStep, isRunningPipeline, activeDb, activeJobId, firestoreCollection, imageA, imageB, imageC, logo, sloganText, presetsFond]);

  // Loader utility to bind incoming firebase document fields directly onto state
  const loadJobToUI = (job: any, userTriggered: boolean) => {
    setActiveJobId(job.id);
    setActiveJobStatus(job.status || null);
    setImageALoadError(false);
    setImageBLoadError(false);
    setImageCLoadError(false);
    setLogoLoadError(false);
    setPipelineLogEvents([]); // Reset execution console on job load or switch
    
    // Try to extract userId from job fields or storage paths dynamically
    let extractedUserId = job.userId || job.uid;
    if (!extractedUserId) {
      const allUrls = [
        job.imageA, job.fond, job.image_a, job.backgroundImageUrl,
        job.imageB, job.vehicule, job.image_b, job.vehicleImageUrl,
        job.imageC, job.preview, job.image_c, job.compositionImageUrl,
        job.logo, job.logoUrl
      ];
      for (const u of allUrls) {
        if (u && typeof u === "string") {
          const match = u.match(/\/users\/([^/]+)/);
          if (match && match[1] && match[1] !== "{userId}" && match[1] !== "%7BuserId%7D") {
            extractedUserId = match[1];
            break;
          }
        }
      }
    }
    
    let currentUserId = userId;
    if (extractedUserId && extractedUserId !== userId) {
      currentUserId = extractedUserId;
      setUserId(extractedUserId);
    }
    
    const resolve = (val: string) => {
      if (!val) return "";
      return val
        .replaceAll("{jobId}", job.id)
        .replaceAll("%7BjobId%7D", job.id)
        .replaceAll("{userId}", currentUserId)
        .replaceAll("%7BuserId%7D", currentUserId);
    };

    // Extract Image A (Background HD)
    if (job.imageA) setImageA(resolve(job.imageA));
    else if (job.fond) setImageA(resolve(job.fond));
    else if (job.image_a) setImageA(resolve(job.image_a));
    else if (job.backgroundImageUrl) setImageA(resolve(job.backgroundImageUrl));

    // Extract Image B (Transparent PNG stable cutout)
    if (job.imageB) setImageB(resolve(job.imageB));
    else if (job.vehicule) setImageB(resolve(job.vehicule));
    else if (job.image_b) setImageB(resolve(job.image_b));
    else if (job.vehicleImageUrl) setImageB(resolve(job.vehicleImageUrl));

    // Extract Image C (Client side snapshot JPEG compression 0.75 preview)
    if (job.imageC) setImageC(resolve(job.imageC));
    else if (job.preview) setImageC(resolve(job.preview));
    else if (job.image_c) setImageC(resolve(job.image_c));
    else if (job.compositionImageUrl) setImageC(resolve(job.compositionImageUrl));

    // Extract Logo URL
    if (job.logo !== undefined) setLogo(resolve(job.logo));
    else if (job.logoUrl !== undefined) setLogo(resolve(job.logoUrl));

    // Force updates to local status based on incoming document's structural definitions
    if (job.presetsFond) {
      const presets = job.presetsFond;
      if (presets.logoAutorise !== undefined) setLogoAutorise(presets.logoAutorise);
      if (presets.texteAutorise !== undefined) setTexteAutorise(presets.texteAutorise);
      
      const coords = presets.logoPlaceholderCoords;
      if (coords) {
        if (coords.x !== undefined) setLogoX(Number(coords.x));
        if (coords.y !== undefined) setLogoY(Number(coords.y));
        if (coords.w !== undefined) setLogoW(Number(coords.w));
        if (coords.h !== undefined) setLogoH(Number(coords.h));
      }
      
      const style = presets.texteStylePreset;
      if (style) {
        if (style.font) setFontFamily(style.font);
        if (style.color) setTextColor(style.color);
        if (style.size) setTextSize(style.size);
      }

      // V2 Blueprint properties parsing with robust fallbacks
      const presetsLogoActive = presets.G !== undefined ? Boolean(presets.G) :
                               presets.logoPromptActive !== undefined ? Boolean(presets.logoPromptActive) :
                               presets.FA !== undefined ? Boolean(presets.FA) : undefined;
      if (presetsLogoActive !== undefined) setLogoPromptActive(presetsLogoActive);

      const presetsLPrompt = presets.F !== undefined ? presets.F :
                             presets.logoPrompt !== undefined ? presets.logoPrompt : undefined;
      if (presetsLPrompt !== undefined) setLogoPrompt(resolve(presetsLPrompt));

      const presetsTextActive = presets.NA !== undefined ? Boolean(presets.NA) :
                               presets.textPromptActive !== undefined ? Boolean(presets.textPromptActive) : undefined;
      if (presetsTextActive !== undefined) setTextPromptActive(presetsTextActive);

      const presetsTPrompt = presets.N !== undefined ? presets.N :
                             presets.textPrompt !== undefined ? presets.textPrompt : undefined;
      if (presetsTPrompt !== undefined) setTextPrompt(resolve(presetsTPrompt));

      // Dynamic Multimodal image description tags - parsed directly from Firestore
      if (presets.descImageA !== undefined) setGeminiDescA(presets.descImageA);
      else if (presets.descFond !== undefined) setGeminiDescA(presets.descFond);
      else if (presets.descA !== undefined) setGeminiDescA(presets.descA);
      else if (presets.aPrompt !== undefined) setGeminiDescA(presets.aPrompt);
      else if (job.descImageA !== undefined) setGeminiDescA(job.descImageA);
      else if (job.descA !== undefined) setGeminiDescA(job.descA);
      else if (job.aPrompt !== undefined) setGeminiDescA(job.aPrompt);

      if (presets.descImageB !== undefined) setGeminiDescB(presets.descImageB);
      else if (presets.descVehicule !== undefined) setGeminiDescB(presets.descVehicule);
      else if (presets.descB !== undefined) setGeminiDescB(presets.descB);
      else if (presets.bPrompt !== undefined) setGeminiDescB(presets.bPrompt);
      else if (job.descImageB !== undefined) setGeminiDescB(job.descImageB);
      else if (job.descB !== undefined) setGeminiDescB(job.descB);
      else if (job.bPrompt !== undefined) setGeminiDescB(job.bPrompt);

      if (presets.descImageC !== undefined) setGeminiDescC(presets.descImageC);
      else if (presets.descComp !== undefined) setGeminiDescC(presets.descComp);
      else if (presets.descC !== undefined) setGeminiDescC(presets.descC);
      else if (presets.cPrompt !== undefined) setGeminiDescC(presets.cPrompt);
      else if (job.descImageC !== undefined) setGeminiDescC(job.descImageC);
      else if (job.descC !== undefined) setGeminiDescC(job.descC);
      else if (job.cPrompt !== undefined) setGeminiDescC(job.cPrompt);

      // Consignes d'instructions générales [generalPrompt] / [unifiedInstruction]
      // Désactivé : l'API et l'app utilisent uniquement la consigne de référence définie de manière stable et unique dans PROMPT_GEN / PROMPT_STYLE.
    }

    // Extract dynamic aspect ratio from Firestore document
    if (job.aspectRatio) setGeminiAspectRatio(job.aspectRatio);
    else if (job.aspect_ratio) setGeminiAspectRatio(job.aspect_ratio);
    else if (job.presetsFond && job.presetsFond.aspectRatio) setGeminiAspectRatio(job.presetsFond.aspectRatio);
    else if (job.presetsFond && job.presetsFond.aspect_ratio) setGeminiAspectRatio(job.presetsFond.aspect_ratio);

    if (job.metadataUtilisateur) {
      const meta = job.metadataUtilisateur;
      if (meta.texte !== undefined) setSloganText(meta.texte);
      
      const transform = meta.transformVehicule;
      if (transform) {
        if (transform.x !== undefined) setTransformX(Number(transform.x));
        if (transform.y !== undefined) setTransformY(Number(transform.y));
        if (transform.scale !== undefined) setTransformScale(Number(transform.scale));
        if (transform.rotation !== undefined) setTransformRotation(Number(transform.rotation));
      }

      const bbox = meta.boundingBoxVehicule;
      if (bbox) {
        if (bbox.left !== undefined) setBoundingBoxLeft(Number(bbox.left));
        if (bbox.right !== undefined) setBoundingBoxRight(Number(bbox.right));
        if (bbox.top !== undefined) setBoundingBoxTop(Number(bbox.top));
        if (bbox.bottom !== undefined) setBoundingBoxBottom(Number(bbox.bottom));
      }
    } else {
      // Fallback: flat key-value pairs at root
      if (job.texte !== undefined) setSloganText(job.texte);
      else if (job.slogan !== undefined) setSloganText(job.slogan);

      if (job.transformX !== undefined) setTransformX(Number(job.transformX));
      else if (job.x !== undefined) setTransformX(Number(job.x));

      if (job.transformY !== undefined) setTransformY(Number(job.transformY));
      else if (job.y !== undefined) setTransformY(Number(job.y));

      if (job.transformScale !== undefined) setTransformScale(Number(job.transformScale));
      else if (job.scale !== undefined) setTransformScale(Number(job.scale));

      if (job.transformRotation !== undefined) setTransformRotation(Number(job.transformRotation));
      else if (job.rotation !== undefined) setTransformRotation(Number(job.rotation));

      // Root level fallbacks for the V2 fields
      if (job.logoPrompt !== undefined) setLogoPrompt(job.logoPrompt);
      if (job.logoPromptActive !== undefined) setLogoPromptActive(Boolean(job.logoPromptActive));
      if (job.textPrompt !== undefined) setTextPrompt(job.textPrompt);
      if (job.textPromptActive !== undefined) setTextPromptActive(Boolean(job.textPromptActive));
    }

    // Only load database presets/prompts if we are loading a NEW job ID!
    // This prevents infinite/redundant getDoc reads on every single progress step update of the active job.
    if (activeJobId === job.id) {
      console.log(`[OPTIMIZATION] Skipping presets database getDoc lookups for same jobId: ${job.id}`);
      return;
    }

    // Dynamic presets/entries lookups and prompts_ia cascade
    const presetsObj = job.presetsFond || {};
    let dbToUse = activeDb;
    if (!dbToUse) {
      const apps = getApps();
      const targetApp = apps.find(a => a.name === "studio-pwa-bridge") || 
                        apps.find(a => a.name === "pwa-preview") || 
                        apps[0];
      if (targetApp) {
        try {
          dbToUse = getFirestore(targetApp, firestoreDatabaseId || undefined);
        } catch (e) {
          console.error("Failed to load Firestore database context for presets/prompts:", e);
        }
      }
    }

    // Explicitly prepare the preset catalog database connection to prevent missing/insufficient permission issues on activeDb
    let dbGlobal = null;
    const appsList = getApps();
    const targetAppForGlobal = appsList.find(a => a.name === "studio-pwa-bridge") || 
                              appsList.find(a => a.name === "pwa-preview") || 
                              appsList[0];
    if (targetAppForGlobal) {
      try {
        dbGlobal = getFirestore(targetAppForGlobal, GLOBAL_ENTRIES_DATABASE_ID);
      } catch (e) {
        console.error("Failed to load dbGlobal (ai-studio-161890da-59e3-4b8c-988c-4938de8d8e21):", e);
      }
    }

    const imageIdVal = job.imageId || (job.presetsFond && job.presetsFond.imageId) || job.A || (job.presetsFond && job.presetsFond.A);

    const loadPromptsIa = (promptId: string) => {
      if (typeof promptId !== "string" || promptId.trim() === "") return;
      const cleanPromptId = promptId.trim();

      const handlePromptSnap = (snap: any, dbNameUsed: string) => {
        const data = snap.data();
        console.log(`Successfully fetched prompts_ia/${cleanPromptId} from database ${dbNameUsed}:`, data);
        
        if (data.aPrompt !== undefined) setGeminiDescA(resolve(data.aPrompt));
        if (data.bPrompt !== undefined) setGeminiDescB(resolve(data.bPrompt));
        if (data.cPrompt !== undefined) setGeminiDescC(resolve(data.cPrompt));
        // Désactivé : l'instruction générale n'est jamais écrasée par la base de données pour préserver le prompt unique stable.

        setPipelineLogEvents(prev => [
          ...prev,
          `🔍 [PROMPTS_IA] Chargement en temps réel depuis 'prompts_ia/${cleanPromptId}' (${dbNameUsed}) : prompts de composition synchronisés.`
        ]);
        return true;
      };

      // 1. Try global db first
      if (dbGlobal) {
        const promptDocRefGlobal = doc(dbGlobal, "prompts_ia", cleanPromptId);
        getDoc(promptDocRefGlobal).then((snap) => {
          if (snap.exists()) {
            handlePromptSnap(snap, GLOBAL_ENTRIES_DATABASE_ID);
          } else if (dbToUse) {
            // fallback to dbToUse
            const promptDocRefToUse = doc(dbToUse, "prompts_ia", cleanPromptId);
            getDoc(promptDocRefToUse).then((snap2) => {
              if (snap2.exists()) {
                handlePromptSnap(snap2, firestoreDatabaseId || "default");
              } else {
                setPipelineLogEvents(prev => [
                  ...prev,
                  `⚠️ [PROMPTS_IA] Document '${cleanPromptId}' introuvable dans la table 'prompts_ia' (global & local).`
                ]);
              }
            }).catch((err) => {
              console.warn("Firestore warning loading from prompts_ia fallback:", err?.message || err);
            });
          }
        }).catch((err) => {
          console.warn("Firestore warning loading from prompts_ia global, trying local:", err?.message || err);
          if (dbToUse) {
            const promptDocRefToUse = doc(dbToUse, "prompts_ia", cleanPromptId);
            getDoc(promptDocRefToUse).then((snap2) => {
              if (snap2.exists()) {
                handlePromptSnap(snap2, firestoreDatabaseId || "default");
              }
            }).catch((err2) => {
              console.warn("Firestore warning loading from prompts_ia fallback after global failure:", err2?.message || err2);
            });
          }
        });
      } else if (dbToUse) {
        const promptDocRefToUse = doc(dbToUse, "prompts_ia", cleanPromptId);
        getDoc(promptDocRefToUse).then((snap2) => {
          if (snap2.exists()) {
            handlePromptSnap(snap2, firestoreDatabaseId || "default");
          } else {
            setPipelineLogEvents(prev => [
              ...prev,
              `⚠️ [PROMPTS_IA] Document '${cleanPromptId}' introuvable dans la table 'prompts_ia' (local).`
            ]);
          }
        }).catch((err) => {
          console.warn("Firestore warning loading from prompts_ia:", err?.message || err);
        });
      }
    };

    if (typeof imageIdVal === "string" && imageIdVal.trim() !== "") {
      const cleanImageId = imageIdVal.trim();

      const handleEntriesSnap = (snap: any, dbNameUsed: string) => {
        const data = snap.data();
        console.log(`Successfully fetched preset config for ${cleanImageId} from database ${dbNameUsed}:`, data);
        
        setPipelineLogEvents(prev => [
          ...prev,
          `🖼️ [PRESETS_IA] Configuration de premier niveau chargée pour '${cleanImageId}' depuis Firestore (${dbNameUsed}).`
        ]);

        // Set logo prompt and logo prompt active
        const logoActive = data.G !== undefined ? Boolean(data.G) :
                           data.logoPromptActive !== undefined ? Boolean(data.logoPromptActive) :
                           data.promptActifLogo !== undefined ? Boolean(data.promptActifLogo) :
                           data.FA !== undefined ? Boolean(data.FA) : true;
        setLogoPromptActive(logoActive);

        const lPrompt = data.F !== undefined ? data.F :
                        data.logoPrompt !== undefined ? data.logoPrompt :
                        data.promptIaLogo !== undefined ? data.promptIaLogo :
                        data.logo_prompt !== undefined ? data.logo_prompt : "";
        setLogoPrompt(resolve(lPrompt));

        // Set text prompt and text prompt active
        const textActive = data.NA !== undefined ? Boolean(data.NA) :
                           data.textPromptActive !== undefined ? Boolean(data.textPromptActive) :
                           data.promptActifText !== undefined ? Boolean(data.promptActifText) : false;
        setTextPromptActive(textActive);

        const tPrompt = data.N !== undefined ? data.N :
                        data.textPrompt !== undefined ? data.textPrompt :
                        data.promptIaText !== undefined ? data.promptIaText :
                        data.text_prompt !== undefined ? data.text_prompt : "";
        setTextPrompt(resolve(tPrompt));

        // Load promptIA / PA point as specified
        const presetPromptId = data.PA || data.promptIA || data.pa || data.promptIa || data.prompt_ia || data.prompt_IA || data.PromptIA || data.promptId;
        
        setPipelineLogEvents(prev => [
          ...prev,
          `✅ [PRESETS_IA] Table '${cleanImageId}' chargée !`,
          `   ↳ logoPrompt: "${lPrompt}" (Actif: ${logoActive})`,
          `   ↳ textPrompt: "${tPrompt}" (Actif: ${textActive})`,
          `   ↳ PA (Prompt IA Référence): "${presetPromptId || "Non spécifié"}"`
        ]);

        if (presetPromptId && typeof presetPromptId === "string" && presetPromptId.trim() !== "") {
          loadPromptsIa(presetPromptId);
        } else {
          const jobPromptId = presetsObj.promptIA || presetsObj.PA || presetsObj.pa || presetsObj.promptIa || presetsObj.prompt_ia || presetsObj.prompt_IA;
          if (jobPromptId && typeof jobPromptId === "string" && jobPromptId.trim() !== "") {
            loadPromptsIa(jobPromptId);
          }
        }
        return true;
      };

      const tryLocalEntry = () => {
        if (!dbToUse) return;
        const docRefEntriesLocal = doc(dbToUse, "entries", cleanImageId);
        const docRefEntriesCapLocal = doc(dbToUse, "Entries", cleanImageId);

        getDoc(docRefEntriesLocal).then((snap) => {
          if (!snap.exists()) {
            return getDoc(docRefEntriesCapLocal);
          }
          return snap;
        }).then((snap) => {
          if (snap.exists()) {
            handleEntriesSnap(snap, firestoreDatabaseId || "default");
          } else {
            // Check job level fallback
            const promptId = presetsObj.promptIA || presetsObj.PA || presetsObj.pa || presetsObj.promptIa || presetsObj.prompt_ia || presetsObj.prompt_IA ||
                             job.promptIA || job.PA || job.pa || job.promptIa || job.prompt_ia || job.prompt_IA;
            if (promptId && typeof promptId === "string" && promptId.trim() !== "") {
              loadPromptsIa(promptId);
            }
          }
        }).catch((err) => {
          console.warn("Warning fetching local background entry preset document:", err?.message || err);
        });
      };

      // Try global db first
      if (dbGlobal) {
        const docRefEntriesGlobal = doc(dbGlobal, "entries", cleanImageId);
        const docRefEntriesCapGlobal = doc(dbGlobal, "Entries", cleanImageId);

        getDoc(docRefEntriesGlobal).then((snap) => {
          if (!snap.exists()) {
            return getDoc(docRefEntriesCapGlobal);
          }
          return snap;
        }).then((snap) => {
          if (snap.exists()) {
            handleEntriesSnap(snap, GLOBAL_ENTRIES_DATABASE_ID);
          } else {
            tryLocalEntry();
          }
        }).catch((err) => {
          console.warn("Failed to fetch entries globally, falling back to local:", err?.message || err);
          tryLocalEntry();
        });
      } else {
        tryLocalEntry();
      }
    } else {
      const promptId = presetsObj.promptIA || presetsObj.PA || presetsObj.pa || presetsObj.promptIa || presetsObj.prompt_ia || presetsObj.prompt_IA ||
                       job.promptIA || job.PA || job.pa || job.promptIa || job.prompt_ia || job.prompt_IA;
      if (promptId && typeof promptId === "string" && promptId.trim() !== "") {
        loadPromptsIa(promptId);
      }
    }

    setIsSuccessState(false);
    
    // Load final generated image if available to show the rendered output
    if (job.imageFinal) setGeminiResultUrl(resolve(job.imageFinal));
    else if (job.url) setGeminiResultUrl(resolve(job.url));
    else if (job.imageUrl) setGeminiResultUrl(resolve(job.imageUrl));
    else setGeminiResultUrl("");

    setImageALoadError(false);
    setImageBLoadError(false);
    setImageCLoadError(false);
    setLogoLoadError(false);
    
    // Append real-time confirmation to console logger
    setPipelineLogEvents(prev => [
      ...prev,
      `📥 [FIRESTORE RECIPES] Job '${job.id}' chargé avec succès !`,
      `   ↳ imageA : ${job.imageA || job.fond ? "OK" : "Flat / Autre format détecté"}`,
      `   ↳ imageB : ${job.imageB || job.vehicule ? "OK" : "Détecté"}`,
      `   ↳ imageC (réf JPG) : ${job.imageC || job.preview ? "OK" : "Non spécifié"}`
    ]);
  };

  // --- CLEAN UP DEVIANT LOADING ERRORS ON STATE TRANSITIONS ---
  useEffect(() => {
    setImageALoadError(false);
    setThumbImageALoadError(false);
  }, [resolvedImageA, activeJobId]);

  useEffect(() => {
    setImageBLoadError(false);
    setThumbImageBLoadError(false);
  }, [resolvedImageB, activeJobId]);

  useEffect(() => {
    setImageCLoadError(false);
    setThumbImageCLoadError(false);
  }, [resolvedImageC, activeJobId]);

  useEffect(() => {
    setLogoLoadError(false);
    setThumbLogoLoadError(false);
  }, [resolvedLogo, activeJobId]);

  // Reset auto-generation lock if a job is loaded/reset back to waiting_inputs or ready_to_generate status
  useEffect(() => {
    if (activeJobId && (activeJobStatus === "waiting_inputs" || activeJobStatus === "ready_to_generate")) {
      triggeredJobsRef.current[activeJobId] = false;
    }
  }, [activeJobId, activeJobStatus]);

  // Dynamic real-time firestore listener hook
  useEffect(() => {
    if (!isSyncActive) {
      setSyncStatus("disconnected");
      setActiveDb(null);
      activeAppRef.current = null;
      return;
    }

    setSyncStatus("connecting");
    setSyncError("");
    setPipelineLogEvents(prev => [
      ...prev,
      `📡 [FIRESTORE SYNC] Connexion en cours vers le Project id: ${firebaseProjectId}...`
    ]);

    const firebaseConfig = {
      projectId: firebaseProjectId,
      appId: firebaseAppId,
      apiKey: firebaseApiKey,
      authDomain: firebaseAuthDomain,
      storageBucket: firebaseStorageBucket,
      messagingSenderId: messagingSenderId,
    };

    let unsubscribe: () => void = () => {};
    let app: any;

    try {
      const appName = "studio-pwa-bridge";
      // Safe cleanup of existing Firebase app references on toggle triggers
      if (getApps().some(a => a.name === appName)) {
        const existingApp = getApp(appName);
        deleteApp(existingApp);
      }
      
      app = initializeApp(firebaseConfig, appName);
      activeAppRef.current = app;
      const dbInstance = getFirestore(app, firestoreDatabaseId || undefined);
      setActiveDb(dbInstance);

      setPipelineLogEvents(prev => [
        ...prev,
        `✔️ [FIRESTORE SYNC] Initialisation SDK Firebase effectuée avec succès.`
      ]);

      const collRef = collection(dbInstance, firestoreCollection || "exports");

      // Robust listener loop that automatically bypasses missing composite database index issues
      const tryListening = (withOrderBy: boolean) => {
        let q;
        if (withOrderBy) {
          q = query(collRef, orderBy("createdAt", "desc"), limit(6));
        } else {
          // Fallback simple query ordered client side to sidestep firestore index warnings
          q = query(collRef, limit(10));
        }

        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            setSyncStatus("connected");
            setSyncError("");
            const jobs: any[] = [];
            
            snapshot.forEach((docSnap) => {
              jobs.push({
                id: docSnap.id,
                ...docSnap.data()
              });
            });

            if (!withOrderBy) {
              // Client side sorting fallback
              jobs.sort((a, b) => {
                const dateA = a.createdAt?.seconds || a.createdAt?._seconds || a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const dateB = b.createdAt?.seconds || b.createdAt?._seconds || b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return dateB - dateA;
              });
            }

            setReceivedJobs(jobs);

            if (jobs.length > 0) {
              setPipelineLogEvents(prev => [
                ...prev,
                `📡 [FIRESTORE SYNC] ${jobs.length} jobs détectés en temps réel dans '${firestoreCollection}'.`,
              ]);
              // Load latest incoming job immediately
              const newestJob = jobs[0];
              loadJobToUI(newestJob, false);

              // AUTOMATIC PHOTOPHONE / PWA TRIGGER GATEWAY handled natively via state-synchronized useEffect
              // to prevent duplicate trigger clicks, race conditions, or asynchronous React layout rendering lags.
            } else {
              setPipelineLogEvents(prev => [
                ...prev,
                `⚠️ [FIRESTORE SYNC] Aucun document trouvé dans la collection '${firestoreCollection}'.`
              ]);
            }
          },
          (error) => {
            console.warn("Firestore real-time subscription warning:", error?.message || error);
            const isQuotaError = error.message?.toLowerCase().includes("quota") || error.message?.toLowerCase().includes("exhausted") || error.message?.toLowerCase().includes("limit") || error.message?.toLowerCase().includes("resource-exhausted");
            if (withOrderBy && !isQuotaError) {
              setPipelineLogEvents(prev => [
                ...prev,
                `⏳ [FIRESTORE SYNC] Index absent ou restriction d'ordonnancement (${error.message}). Re-tentative en mode simple sans order-by (tri local)...`
              ]);
              tryListening(false);
            } else {
              setSyncStatus("error");
              setSyncError(error.message);
              if (isQuotaError) {
                setIsSyncActive(false);
                setPipelineLogEvents(prev => [...prev, "⚠️ [SYS] Désactivation de la synchronisation Firestore en raison du dépassement de quota."]);
              }
              setPipelineLogEvents(prev => [
                ...prev,
                `❌ [FIRESTORE SYNC] Connexion rejetée : ${error.message}`
              ]);
              handleFirestoreError(error, OperationType.LIST, firestoreCollection || "exports", app);
            }
          }
        );
      };

      tryListening(true);

    } catch (err: any) {
      console.error("Firebase setup failure:", err);
      setSyncStatus("error");
      setSyncError(err.message || String(err));
      setPipelineLogEvents(prev => [
        ...prev,
        `❌ [FIRESTORE SYNC] Échec d'initialisation : ${err.message}`
      ]);
    }

    return () => {
      unsubscribe();
    };
  }, [
    isSyncActive, 
    firebaseProjectId, 
    firestoreDatabaseId, 
    firestoreCollection, 
    firebaseApiKey, 
    firebaseAppId, 
    firebaseAuthDomain, 
    firebaseStorageBucket, 
    messagingSenderId
  ]);

  const copyToClipboard = () => {
    let payloadStr = "";
    if (activeTab === "json") {
      payloadStr = JSON.stringify(firestorePayload, null, 2);
    } else if (activeTab === "python") {
      payloadStr = generatePythonSnippet(firestorePayload);
    } else if (activeTab === "node") {
      payloadStr = generateNodeSnippet(firestorePayload);
    } else if (activeTab === "curl") {
      payloadStr = generateCurlSnippet(firestorePayload, firebaseProjectId, firestoreDatabaseId);
    }

    navigator.clipboard.writeText(payloadStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const [userHistoryItems, setUserHistoryItems] = useState<any[]>([]);

  const fetchUserHistory = async (targetId = userId) => {
    try {
      const response = await apiFetch(`/api/gemini/history?userId=${encodeURIComponent(targetId)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.history) {
          setUserHistoryItems(data.history);
        }
      }
    } catch (err) {
      console.error("Error fetching user history:", err);
    }
  };

  const resetUserHistory = async () => {
    if (!window.confirm(`⚠️ Voulez-vous vraiment vider le dossier Firebase Storage et réinitialiser toutes les générations de l'utilisateur "${userId}" ?`)) {
      return;
    }
    try {
      const response = await apiFetch(`/api/gemini/reset?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE"
      });
      if (response.ok) {
        const data = await response.json();
        alert(data.msg || "Dossier utilisateur réinitialisé avec succès !");
        
        // Immediate visual workspace reset
        setGeminiResultUrl("");
        setImageC(DEFAULT_IMAGE_C);
        setSloganText("");
        setTransformX(-2.5);
        setTransformY(14.2);
        setTransformScale(1.15);
        setTransformRotation(-1.2);
        setLogoPromptActive(false);
        setTextPromptActive(false);
        setReceivedJobs([]);
        setUserHistoryItems([]);
        
        setGeminiLogs(prev => [
          ...prev, 
          `🧹 [ADMIN] Commande de réinitialisation reçue par l'opérateur pour l'ID: '${userId}'`,
          `🔴 ${data.countDeleted} images supprimées du bucket '${firebaseStorageBucket}'`,
          `♻️ Rétablissement des paramètres de composition par défaut.`
        ]);
        fetchUserHistory();
      }
    } catch (err: any) {
      alert(`Erreur lors de la réinitialisation: ${err.message || err}`);
    }
  };

  // CSV Export utility matching exactly 21 columns
  const exportToCSV = () => {
    // CSV Header List matching the required structure exactly
    const headers = [
      "Row", "Image ID", "Resolution Ref",
      "Logo", "Taille", "Logo X", "Logo Y", "Color Fill", "Color Fill Active", "Logo Prompt IA", "Logo Prompt IA Active",
      "Text", "Text Content", "Police", "Text Taille", "Text Alignement", "Text X", "Text Y", "Text Color", "Text Prompt IA Active", "Text Prompt IA"
    ];

    // Map received jobs or just the current state as row 1
    const dataRows = (receivedJobs && receivedJobs.length > 0 ? receivedJobs : []).map((j, index) => {
      const presets = j.presetsFond || {};
      const meta = j.metadataUtilisateur || {};
      
      const logoXVal = presets.logoPlaceholderCoords?.x !== undefined ? presets.logoPlaceholderCoords.x : (j.logoX ? parseInt(j.logoX) / 10 : 12);
      const logoYVal = presets.logoPlaceholderCoords?.y !== undefined ? presets.logoPlaceholderCoords.y : (j.logoY ? parseInt(j.logoY) / 10 : 80);
      
      const textV = presets.texteStylePreset || {};
      
      return [
        index + 1,                                                   // Row
        j.id || `SPORT_${index + 1}`,                               // Image ID
        presets.resolutionRef || "1280",                             // Resolution Ref
        presets.logoAutorise !== undefined ? (presets.logoAutorise ? "true" : "false") : (j.logo ? "true" : "false"), // Logo
        presets.logoSize || j.logoSize || "150",                    // Taille
        String(logoXVal),                                            // Logo X
        String(logoYVal),                                            // Logo Y
        presets.logoColorFill || j.logoColorFill || "#FF0000",       // Color Fill
        presets.logoColorFillEnabled !== undefined ? (presets.logoColorFillEnabled ? "true" : "false") : (j.logoColorFillEnabled ? "true" : "false"), // Color Fill Active
        presets.logoPrompt || j.logoPrompt || "en béton extrudé",    // Logo Prompt IA
        presets.logoPromptActive !== undefined ? (presets.logoPromptActive ? "true" : "false") : (j.logoPromptActive ? "true" : "false"), // Logo Prompt IA Active
        presets.texteAutorise !== undefined ? (presets.texteAutorise ? "true" : "false") : (j.text !== undefined ? (j.text ? "true" : "false") : "true"), // Text
        (meta.texte || j.textContent || j.texte || sloganText || "").replace(/"/g, '""'), // Text Content
        textV.font || j.textFont || fontFamily || "Inter",           // Police
        textV.size || j.textSize || "normal",                        // Text Taille
        j.textAlign || textAlign || "CENTRE",                        // Text Alignement
        j.textX || textX || "640",                                   // Text X
        j.textY || textY || "1000",                                  // Text Y
        textV.color || j.textColorFill || textColor || "#FFFFFF",    // Text Color
        presets.textPromptActive !== undefined ? (presets.textPromptActive ? "true" : "false") : (j.textPromptActive ? "true" : "false"), // Text Prompt IA Active
        presets.textPrompt || j.textPrompt || "lumineux fluo"        // Text Prompt IA
      ];
    });

    // If no received jobs, output the current editing state as a single row 1 entry so there is always data
    if (dataRows.length === 0) {
      dataRows.push([
        1,
        "SPORT 01",
        "1280",
        logoAutorise ? "true" : "false",
        logoSize,
        String(logoX),
        String(logoY),
        logoColorFill,
        logoColorFillEnabled ? "true" : "false",
        logoPrompt,
        logoPromptActive ? "true" : "false",
        texteAutorise ? "true" : "false",
        (sloganText || "").replace(/"/g, '""'),
        fontFamily,
        textSize,
        textAlign,
        textX,
        textY,
        textColor,
        textPromptActive ? "true" : "false",
        textPrompt
      ]);
    }

    // Convert array to CSV string
    const csvContent = [
      headers.join(","),
      ...dataRows.map(row => row.map(val => `"${val}"`).join(","))
    ].join("\n");

    // Download file
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `presets_motors_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    fetchUserHistory(userId);
  }, [userId]);

  const triggerGeminiGeneration = async () => {
    setGeminiIsLoading(true);
    setGeminiResultUrl("");
    setGeminiLogs(["🔌 [CLIENT] Envoi de la requête au backend '/api/gemini/generate'..."]);

    // Use the actual geminiPrompt or fallback to unifiedInstruction context style
    const activePrompt = geminiPrompt || `Photorealistic premium automotive photography.
Real vehicle.
Real environment.
Natural lighting.
Production-quality realism.`;

    const isRealJob = activeJobId && !activeJobId.startsWith("job_sim");

    if (activeJobId) {
      syncLocalJobState(activeJobId, { status: "processing", progress: 15 });
    }

    // Fast-track initial state update in Firestore to show the PWA we are processing!
    if (isRealJob && activeDb) {
      try {
        const { doc, updateDoc } = await import("firebase/firestore");
        const docRef = doc(activeDb, firestoreCollection || "exports", activeJobId!);
        await updateDoc(docRef, { 
          status: "processing", 
          progress: 15 
        });
        setGeminiLogs(prev => [...prev, "✔️ [FIRESTORE] Statut mis à jour sur Firebase: 'processing' (15%)"]);
      } catch (err: any) {
        console.error("Firestore write initial error in manual:", err);
        handleLocalFirestoreError(err, OperationType.WRITE, `${firestoreCollection || "exports"}/${activeJobId!}`);
      }
    }

    let resolvedModelUsed = geminiModel;
    let resolvedCoordinatePromptMode = coordinatePromptMode;
    let resolvedOutputFilename = "";

    try {
      const response = await apiFetch("/api/gemini/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: activePrompt,
          model: geminiModel,
          aspectRatio: geminiAspectRatio,
          imageSize: geminiImageSize,
          imageA: resolvedImageA,
          imageB: resolvedImageB,
          imageC: resolvedImageC,
          userId: userId,
          firebaseStorageBucket: firebaseStorageBucket,
          unifiedInstruction: geminiUnifiedInstruction,
          descImageA: geminiDescA,
          descImageB: geminiDescB,
          descImageC: geminiDescC,
          logo: logoAutorise ? logo : "",
          logoPrompt,
          logoPromptActive,
          text: texteAutorise,
          textContent: sloganText,
          textPrompt,
          textPromptActive,
          presetsFond,
          metadataUtilisateur: firestorePayload.metadataUtilisateur,
          W_B: 1600,
          H_B: 900,
          coordinatePromptMode: coordinatePromptMode,
          jobId: activeJobId
        }),
      });

      let data: any = null;
      try {
        data = await response.json();
      } catch (e) {
        console.warn("Failed to parse error body as JSON", e);
      }

      if (response.ok && data) {
        resolvedModelUsed = data.modelUsed || geminiModel;
        resolvedCoordinatePromptMode = data.coordinatePromptMode || coordinatePromptMode;
        resolvedOutputFilename = data.outputFilename || "";
      }

      if (data && data.logs && Array.isArray(data.logs)) {
        setGeminiLogs(data.logs);
      } else {
        setGeminiLogs(prev => [...prev, "✔️ [CLIENT] Requête résolue par le serveur."]);
      }

      if (!response.ok) {
        const errorDesc = data?.apiError || data?.error || `Échec HTTP avec statut: ${response.status}`;
        throw new Error(errorDesc);
      }

      if (!data?.success || data?.isSimulated) {
        throw new Error(data?.apiError || "Génération simulée ou invalide — pas d'image Gemini authentique.");
      }

      let finalImgUrl = "";

      if (data?.imageUrl) {
        setGeminiResultUrl(data.imageUrl);

        if (data.imageUrl.startsWith("data:")) {
          try {
            if (activeAppRef.current) {
              const { getStorage, ref: storageRef, uploadString, getDownloadURL } = await import("firebase/storage");
              const storage = getStorage(activeAppRef.current);
              const fileRef = storageRef(storage, `users/${userId}/homescreens/homescreen_hd_CONTROL_${Date.now()}.jpg`);
              const uploadSnap = await uploadString(fileRef, data.imageUrl, "data_url");
              const downloadUrl = await getDownloadURL(uploadSnap.ref);
              finalImgUrl = downloadUrl;
              setGeminiResultUrl(downloadUrl);
              setGeminiLogs(prev => [...prev, "✔️ [CLIENT STORAGE] Image base64 téléversée sur Firebase Storage."]);
            } else {
              throw new Error("Firebase App non initialisée.");
            }
          } catch (storageErr: any) {
            throw new Error(`Échec upload Storage : ${storageErr.message || storageErr}`);
          }
        } else if (isPublishableFirestoreImageUrl(data.imageUrl)) {
          finalImgUrl = data.imageUrl;
        } else {
          throw new Error("URL d'image finale invalide pour la PWA.");
        }
      } else {
        throw new Error("Réponse API sans imageUrl.");
      }

      if (data && data.metrics) {
        setGeminiMetrics(data.metrics);
      }

      if (activeJobId && finalImgUrl) {
        syncLocalJobState(activeJobId, {
          status: "completed",
          progress: 100,
          imageFinal: finalImgUrl,
          imageUrl: finalImgUrl
        });
      }

      // Update Firestore active job document so the PWA can retrieve it!
      if (isRealJob && activeDb && finalImgUrl) {
        try {
          const { doc, updateDoc } = await import("firebase/firestore");
          const docRef = doc(activeDb, firestoreCollection || "exports", activeJobId!);
          await updateDoc(docRef, {
            status: "completed",
            progress: 100,
            imageFinal: finalImgUrl,
            url: finalImgUrl,
            imageUrl: finalImgUrl,
            error: null,
            completedAt: new Date().toISOString(),
            modelUsed: resolvedModelUsed,
            geometryGuidanceMode: resolvedCoordinatePromptMode,
            coordinatePromptMode: resolvedCoordinatePromptMode,
            outputFilename: resolvedOutputFilename
          });
          setGeminiLogs(prev => [...prev, `✔️ [FIRESTORE] Job Firestore '${activeJobId}' mis à jour avec le statut 'completed' !`]);
        } catch (dbErr: any) {
          console.error("Failed to update active Firestore job for manual generation:", dbErr);
          setGeminiLogs(prev => [...prev, `❌ [FIRESTORE ERROR] Échec de la mise à jour: ${dbErr.message}`]);
          handleLocalFirestoreError(dbErr, OperationType.WRITE, `${firestoreCollection || "exports"}/${activeJobId!}`);
        }
      }

      // Refresh the list immediately!
      fetchUserHistory(userId);
    } catch (error: any) {
      console.log("Gemini Info/Status:", error);
      if (activeJobId) {
        syncLocalJobState(activeJobId, {
          status: "failed",
          progress: 0,
          error: error.message || String(error)
        });
      }
      setGeminiLogs(prev => [
        ...prev,
        `❌ [SYS-ERR] Impossible de joindre l'API en local: "${error.message || error}"`
      ]);
    } finally {
      setGeminiIsLoading(false);
      fetchApiHealth();
    }
  };

  const handlesReset = () => {
    setImageA(DEFAULT_IMAGE_A);
    setImageB(DEFAULT_IMAGE_B);
    setImageC(DEFAULT_IMAGE_C);
    setLogo(DEFAULT_LOGO);
    setFirebaseProjectId(FIREBASE_DEFAULTS.projectId);
    setFirebaseAppId(FIREBASE_DEFAULTS.appId);
    setFirebaseApiKey(FIREBASE_DEFAULTS.apiKey);
    setFirebaseAuthDomain(FIREBASE_DEFAULTS.authDomain);
    setFirestoreDatabaseId(FIREBASE_DEFAULTS.firestoreDatabaseId);
    setFirebaseBucketName(DEFAULT_BUCKET_GS);
    setFirebaseStorageBucket(FIREBASE_DEFAULTS.storageBucket);
    setMessagingSenderId(FIREBASE_DEFAULTS.messagingSenderId);
    setMeasurementId("");
    setFirestoreCollection("exports");
    setUserId("user_test_99");
    setLogoAutorise(true);
    setTexteAutorise(true);
    setTransformX(-2.5);
    setTransformY(14.2);
    setTransformScale(1.15);
    setTransformRotation(-1.2);
    setBoundingBoxLeft(120);
    setBoundingBoxRight(1480);
    setBoundingBoxTop(210);
    setBoundingBoxBottom(780);
    setSloganText("Électrifiez vos horizons.");
    setIsSuccessState(false);
    setPipelineLogEvents([]);
  };

  // --- UNIFIED COORDINATE SYSTEM CALCULATIONS ---
  const activeJob = receivedJobs.find(j => j.id === activeJobId);
  const refRes = Number(activeJob?.presetsFond?.resolutionRef || 1280);
  const canvasSize = refRes;

  const logoCenterX = (Number(logoX || 0) / refRes) * canvasSize;
  const logoCenterY = (Number(logoY || 0) / refRes) * canvasSize;
  const logoSizePx = (Number(logoSize || "150") / refRes) * canvasSize;
  const logoDrawX = logoCenterX - logoSizePx / 2;
  const logoDrawY = logoCenterY - logoSizePx / 2;

  // Percentage values relative to the reference canvas
  const logoLeftPct = (logoDrawX / canvasSize) * 100;
  const logoTopPct = (logoDrawY / canvasSize) * 100;
  const logoSizePct = (logoSizePx / canvasSize) * 100;

  // Text calculations
  let textSizePx = 48;
  if (textSize === "small" || textSize === "32") {
    textSizePx = 32;
  } else if (textSize === "large" || textSize === "64") {
    textSizePx = 64;
  } else if (!isNaN(Number(textSize))) {
    textSizePx = Number(textSize);
  }

  const txPct = (Number(textX || "640") / refRes) * 100;
  const tyPct = (Number(textY || "1000") / refRes) * 100;

  const baselineScale = Number(activeJob?.metadataUtilisateur?.baselineScale || 1.0);
  const effectiveScale = transformScale * baselineScale;

  return (
    <div id="dev-portal" className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">
      
      {/* BACKGROUND DECORATIVE ELEMENTS */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute top-1/2 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* TOP STICKY DEV BAR */}
      <header className="border-b border-slate-900 bg-slate-950/95 backdrop-blur sticky top-0 z-50 px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono tracking-wider text-slate-400 bg-slate-900 px-2 py-0.5 rounded font-bold">
                  DIRECT API COMPLIANCE
                </span>
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-xs text-slate-400 font-mono">Backend Pipeline Viewer</span>
                
                <div className="flex items-center gap-1.5 ml-2 border-l border-slate-800 pl-3">
                  <span className="text-[10px] font-mono text-slate-500">GEMINI API:</span>
                  {apiHealth.status === "healthy" && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20" title={`Last checked: ${apiHealth.lastChecked}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      ALIVE & HEALTHY
                    </span>
                  )}
                  {apiHealth.status === "unhealthy" && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded border border-rose-500/20" title={apiHealth.errorMessage || "Unknown Error"}>
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse"></span>
                      CRITICAL ERROR
                    </span>
                  )}
                  {apiHealth.status === "unknown" && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700/50">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-500"></span>
                      UNTESTED
                    </span>
                  )}
                </div>
              </div>
              <h1 className="text-lg font-display font-bold tracking-tight text-slate-200">
                PWA ⇄ IA Transparence Réseau & Données Brutes
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlesReset}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-xs text-slate-300 font-mono transition flex items-center gap-1.5 cursor-pointer"
              id="btn-reinit"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Réinitialiser les URLs
            </button>
            <a 
              href="https://aistudio.google.com" 
              target="_blank" 
              rel="noreferrer"
              className="px-3 py-1.5 bg-emerald-950 hover:bg-emerald-900 text-emerald-400 border border-emerald-900/30 rounded text-xs font-semibold transition flex items-center gap-1"
            >
              <span>Accéder à Google AI Studio</span>
              <ArrowRight className="w-3 h-3" />
            </a>
          </div>

        </div>
      </header>



      <main className="max-w-7xl mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ================= COLUMN 1: DIRECT RAW DATA & PATH CONTROLLERS (7 of 12) ================= */}
        <section className="col-span-1 lg:col-span-7 flex flex-col gap-6">

          {/* REAL-TIME FIRESTORE CAPTEUR CARD */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-xl overflow-hidden transition-all duration-200">
            <div className="bg-slate-950 p-4 border-b border-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg border transition-all ${
                  syncStatus === "connected" 
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.15)]" 
                    : syncStatus === "connecting"
                    ? "bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse"
                    : syncStatus === "error"
                    ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                    : "bg-slate-900 text-slate-400 border-slate-800"
                }`}>
                  <FolderSync className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-display font-semibold text-slate-250">
                      Capteur de Flux Firestore En Direct
                    </h2>
                    <span className={`h-2.5 w-2.5 rounded-full ${
                      syncStatus === "connected" ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]" : "bg-slate-600"
                    }`} />
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Détectez instantanément les requêtes d'image générées par votre PWA
                  </p>
                </div>
              </div>

              {/* TOGGLE BUTTON */}
              <button
                onClick={() => {
                  const nextVal = !isSyncActive;
                  setIsSyncActive(nextVal);
                  if (nextVal) {
                    setReceivedJobs([]);
                    setPipelineLogEvents(prev => [...prev, "🧹 [SYNC-LAUNCH] Purge automatique de la liste des jobs pour commencer propre."]);
                  }
                }}
                className={`px-3.5 py-1.5 rounded text-xs font-mono font-bold transition flex items-center gap-2 cursor-pointer ${
                  isSyncActive 
                    ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-[0_0_12px_rgba(16,185,129,0.2)] font-black" 
                    : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                }`}
                id="btn-toggle-sync"
              >
                {isSyncActive ? (
                  <>
                    <Wifi className="w-3.5 h-3.5 text-slate-950" />
                    <span>SYNCHRO ACTIVE</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3.5 h-3.5 text-slate-400" />
                    <span>DÉSACTIVÉE</span>
                  </>
                )}
              </button>
            </div>

            <div className="p-4 space-y-3">
              {/* CURRENT CONNECTION SPECS INDICATORS */}
              {isSyncActive && (
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-950/80 p-2.5 rounded border border-slate-900">
                  <div>
                    <span className="text-slate-500 block text-[9px] font-bold">PROJECT ID</span>
                    <span className="text-slate-300 font-bold break-all">{firebaseProjectId || "non défini"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px] font-bold">DATABASE ID</span>
                    <span className="text-slate-300 font-bold break-all">{firestoreDatabaseId || "default"}</span>
                  </div>
                  <div className="col-span-2 pt-1.5 border-t border-slate-900 flex justify-between items-center text-[10.5px]">
                    <span className="text-slate-500">COLLECTION: <strong className="text-blue-400">/{firestoreCollection || "exports"}</strong></span>
                    <span className={`text-[10px] font-bold uppercase tracking-tight ${
                      syncStatus === "connected" ? "text-emerald-400" : "text-blue-400 animate-pulse"
                    }`}>
                      {syncStatus === "connected" && "CONNECTED 📡"}
                      {syncStatus === "connecting" && "CONNECTING ..."}
                      {syncStatus === "error" && "ERROR ❌"}
                    </span>
                  </div>
                </div>
              )}

              {/* AUTOMATIC ENGINE TOGGLE PANEL */}
              {isSyncActive && (
                <div className="flex items-center justify-between p-2.5 rounded bg-slate-950/80 border border-slate-900 text-xs">
                  <div className="flex items-center gap-2 text-left">
                    <div className="relative flex h-2 w-2 shrink-0">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isAutoGenerateActive ? "bg-emerald-400" : "bg-amber-400"}`}></span>
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${isAutoGenerateActive ? "bg-emerald-500" : "bg-amber-500"}`}></span>
                    </div>
                    <div>
                      <span className="font-semibold block text-slate-200">Moteur d'Auto-Génération Automatique</span>
                      <span className="text-[10px] text-slate-400 block">Met à jour et traite instantanément les jobs reçus de la PWA</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsAutoGenerateActive(!isAutoGenerateActive)}
                    className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold transition-all duration-200 cursor-pointer border shrink-0 ${
                      isAutoGenerateActive 
                        ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.1)]" 
                        : "bg-slate-950 text-slate-500 border-slate-800"
                    }`}
                  >
                    {isAutoGenerateActive ? "MOTEUR ACTIF ⚡" : "DÉSACTIVÉ ⏸️"}
                  </button>
                </div>
              )}

              {/* SYNC ERROR NOTICE */}
              {syncStatus === "error" && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded text-xs text-rose-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Une erreur est survenue lors de l'accès à votre Firestore :</p>
                    <p className="font-mono text-[11px] text-rose-400 mt-1 bg-slate-950/45 p-1.5 rounded">{syncError}</p>
                    {(syncError.toLowerCase().includes("quota") || syncError.toLowerCase().includes("exhausted")) ? (
                      <div className="text-[10.5px] text-slate-300 mt-2 leading-relaxed bg-amber-950/20 border border-amber-500/20 p-2.5 rounded text-left">
                        <p className="font-bold text-amber-400">⚠️ QUOTA FIRESTORE DÉPASSÉ (Limite Tier Gratuit) :</p>
                        <p className="mt-1 text-slate-300">
                          Le projet Firebase gratuit connecté a dépassé sa limite quotidienne d'opérations d'écriture ou de lecture (limite gratuite de 50 000 lectures/jour).
                        </p>
                        <p className="mt-2 font-semibold text-emerald-400">
                          ✨ Solution immédiate : Désactivez le commutateur "Synchronisation de la PWA directe (Firestore Sync)" tout en haut à droite ! 
                          Vous pourrez ainsi continuer d'importer manuellement vos compositions locales JPEG, de modifier vos prompts, et de lancer des générations IA autonomes sans dépendre de Firestore !
                        </p>
                      </div>
                    ) : (
                      <p className="text-[10.5px] text-slate-400 mt-2 leading-relaxed">
                        💡 S'il s'agit d'une erreur de permission, vérifiez vos identifiants de liaison ou déployez des règles permissives de tests dans la console Firebase.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* RECEIVED JOBS COLLECTION HEADER AND ROWS */}
              <div>
                <h3 className="text-[10.5px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between flex-wrap gap-2">
                  <span className="flex items-center gap-2 flex-wrap">
                    Derniers Jobs Reçus de la PWA ({receivedJobs.length})
                    <button
                      onClick={exportToCSV}
                      className="px-2 py-0.5 bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/40 border border-emerald-500/30 text-[9px] font-sans font-bold rounded transition cursor-pointer flex items-center gap-1 shrink-0"
                      title="Télécharger la configuration au format CSV 21 colonnes"
                    >
                      <Download className="w-2.5 h-2.5" />
                      Exporter CSV (21 col)
                    </button>
                    {receivedJobs.length > 0 && (
                      <button
                        onClick={() => {
                          setReceivedJobs([]);
                          setPipelineLogEvents(prev => [...prev, "🧹 Purge manuelle de l'affichage local effectuée."]);
                        }}
                        className="px-2 py-0.5 bg-rose-950/40 text-rose-400 hover:bg-rose-900/40 border border-rose-500/30 text-[9px] font-sans font-bold rounded transition cursor-pointer flex items-center gap-1 shrink-0"
                        title="Vider la liste des jobs capturés"
                      >
                        🗑️ Vider
                      </button>
                    )}
                  </span>
                  {isSyncActive && syncStatus === "connected" && (
                    <span className="text-[9.5px] text-emerald-400 lowercase font-normal italic animate-pulse flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                      écoute en direct...
                    </span>
                  )}
                </h3>

                {!isSyncActive ? (
                  <div className="p-4 text-center bg-slate-950/30 rounded-lg border border-slate-900/60 border-dashed space-y-2">
                    <p className="text-xs text-slate-400 leading-relaxed">
                      L'écouteur automatique en temps réel est désactivé.
                      Configurez vos données de liaison, puis activez la synchronisation pour capter instantanément les départs de tâches initiés de votre PWA !
                    </p>
                    <button
                      onClick={() => setIsSyncActive(true)}
                      className="px-3 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-xs text-emerald-400 font-semibold cursor-pointer transition inline-flex items-center gap-1"
                    >
                      <Wifi className="w-3 h-3" />
                      Activer la Synchronisation
                    </button>
                  </div>
                ) : receivedJobs.length === 0 ? (
                  <div className="p-5 text-center bg-slate-950/45 rounded-lg border border-slate-900 border-dashed space-y-3">
                    <RefreshCw className="w-6 h-6 text-slate-600 animate-spin mx-auto" />
                    <p className="text-xs text-slate-400 leading-relaxed">
                      En attente de documents dans la collection <code className="text-slate-300 font-mono">/{firestoreCollection}</code>...
                      Dès que vous initierez un job sur votre PWA (avec le projectId et databaseId correspondants), l'élément s'ajoutera ici instantanément !
                    </p>
                    <div className="pt-2 flex justify-center">
                      <button
                        onClick={() => {
                          loadJobToUI({
                            id: "SIM_JOB_" + Math.random().toString(36).substring(3, 8).toUpperCase(),
                            imageA: DEFAULT_IMAGE_A,
                            imageB: DEFAULT_IMAGE_B,
                            imageC: DEFAULT_IMAGE_C,
                            logo: DEFAULT_LOGO,
                            presetsFond: {
                              logoAutorise: true,
                              texteAutorise: true,
                              logoPlaceholderCoords: { x: 12, y: 80, w: 200, h: 50 },
                              texteStylePreset: { font: "Space Grotesk", color: "#FFFFFF", size: "normal" }
                            },
                            metadataUtilisateur: {
                              texte: "Propulsé par la foudre.",
                              transformVehicule: { x: -2.5, y: 14.2, scale: 1.15, rotation: -1.2 }
                            }
                          }, true);
                        }}
                        className="px-3 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] text-blue-400 rounded transition font-mono flex items-center gap-1 cursor-pointer"
                      >
                        ⚡ Injecter un Job Mock Simulation Locale
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {receivedJobs.map((j) => {
                      const isActive = activeJobId === j.id;
                      const createdAtStr = j.createdAt?.seconds 
                        ? new Date(j.createdAt.seconds * 1000).toLocaleTimeString()
                        : "Écouté en direct";
                      return (
                        <div
                          key={j.id}
                          className={`p-2.5 rounded-lg border transition-all text-left relative overflow-hidden flex items-center justify-between gap-3 cursor-pointer ${
                            isActive 
                              ? "bg-emerald-950/20 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.06)]" 
                              : "bg-slate-950/80 border-slate-900/80 hover:border-slate-800"
                          }`}
                          onClick={() => loadJobToUI(j, true)}
                        >
                          {isActive && (
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-400" />
                          )}
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1 text-[10.5px]">
                              <span className="text-[10px] font-mono text-slate-300 font-bold bg-slate-900 border border-slate-850 px-1.5 py-0.2 rounded truncate">
                                ID: {j.id}
                              </span>
                              <span className="text-slate-500 font-mono text-[9px] truncate">• {createdAtStr}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400 font-mono truncate block">
                                🏠 Fond: <span className="text-emerald-500 font-semibold">{j.imageA ? "OK" : (j.fond ? "Flat" : "Inconnu")}</span> | Véhicule: <span className="text-blue-400 font-semibold">{j.imageB ? "PNG" : "Flat"}</span>
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center shrink-0">
                            <span
                              className={`px-2 py-0.5 text-[9px] rounded font-mono transition-all font-semibold uppercase ${
                                isActive 
                                  ? "bg-emerald-500 text-slate-950 font-bold" 
                                  : "bg-slate-900 text-slate-400"
                              }`}
                            >
                              {isActive ? "SÉLECTIONNÉ" : "CHARGER"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* FIREBASE CONNECTION CONFIG MODULE */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-xl overflow-hidden transition-all duration-200">
            <button
              onClick={() => setIsSec1Expanded(!isSec1Expanded)}
              className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-900/20 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Settings className={`w-4.5 h-4.5 transition-colors duration-200 ${isSec1Expanded ? "text-emerald-400" : "text-slate-400"}`} />
                <h2 className="text-sm font-display font-semibold text-slate-200">
                  1. Variables de Liaison Firebase & Storage (Paramètres Systèmes)
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {!isSec1Expanded && (
                  <span className="hidden sm:inline bg-slate-950/60 border border-slate-850 text-slate-400 px-2 py-0.5 rounded text-[10px] font-mono">
                    ID: {firebaseProjectId || "non défini"}
                  </span>
                )}
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isSec1Expanded ? "rotate-180 text-emerald-400" : ""}`} />
              </div>
            </button>

            {isSec1Expanded && (
              <div className="p-5 border-t border-slate-900/40 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1 font-semibold" htmlFor="input_project_id">
                      ID du Projet Firebase
                    </label>
                    <input
                      type="text"
                      id="input_project_id"
                      value={firebaseProjectId}
                      onChange={(ev) => setFirebaseProjectId(ev.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-300 font-mono outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1 font-semibold" htmlFor="input_bucket_name">
                      Chemin Réseau Storage Bucket (gs://)
                    </label>
                    <input
                      type="text"
                      id="input_bucket_name"
                      value={firebaseBucketName}
                      onChange={(ev) => setFirebaseBucketName(ev.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-300 font-mono outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1 font-semibold" htmlFor="input_col_name">
                      Firestore Collection Nom
                    </label>
                    <input
                      type="text"
                      id="input_col_name"
                      value={firestoreCollection}
                      onChange={(ev) => setFirestoreCollection(ev.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-300 font-mono outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1 font-semibold" htmlFor="input_user_id">
                      ID Utilisateur Simulé (Isolation RGPD)
                    </label>
                    <input
                      type="text"
                      id="input_user_id"
                      value={userId}
                      onChange={(ev) => setUserId(ev.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-300 font-mono outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="mt-3 bg-slate-950/60 p-2.5 rounded border border-slate-900/80 text-[11px] text-slate-400">
                  <p>
                    💡 <strong>Règle de cloisonnement :</strong> Pour le téléversement d'un logo personnalisé, le fichier doit être stocké à l'adresse logique isolée par l'identifiant utilisateur unique : <code className="bg-slate-900 text-blue-400 px-1 py-0.5 rounded text-[10px]">{firebaseBucketName}/users/{userId}/logos/[filename].png</code>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* DYNAMIC RAW URL ADRESSE ENVOYÉES */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-xl overflow-hidden transition-all duration-200">
            <button
              onClick={() => setIsSec2Expanded(!isSec2Expanded)}
              className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-900/20 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Link className={`w-4.5 h-4.5 transition-colors duration-200 ${isSec2Expanded ? "text-emerald-400" : "text-slate-400"}`} />
                <h2 className="text-sm font-display font-semibold text-slate-200">
                  2. Adresses Individuelles Transmises (Payload URLs)
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {!isSec2Expanded && (
                  <span className="hidden sm:inline bg-slate-950/60 border border-slate-850 text-slate-400 px-2 py-0.5 rounded text-[10px] font-mono">
                    4 URLs actives
                  </span>
                )}
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isSec2Expanded ? "rotate-180 text-emerald-400" : ""}`} />
              </div>
            </button>

            {isSec2Expanded && (
              <div className="p-5 border-t border-slate-900/40 space-y-4">
                {/* Local/Firebase Toggle */}
                <div className="bg-slate-950/60 border border-slate-850 rounded-lg p-3 space-y-3 mb-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-semibold text-emerald-400">Mode de Source Image</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Activez le mode Local pour utiliser les images de test du dossier <code>src/local_test_images/</code>.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 self-start sm:self-auto select-none">
                      <span className={`text-[10px] font-medium transition-colors ${!isLocalMode ? 'text-emerald-400 font-semibold' : 'text-slate-500'}`}>
                        Firebase
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggleLocalMode(!isLocalMode)}
                        className={`relative inline-flex h-5.5 w-10.5 shrink-0 cursor-pointer rounded-full border border-slate-800 transition-colors duration-200 ease-in-out outline-none ${
                          isLocalMode ? 'bg-emerald-500' : 'bg-slate-800'
                        }`}
                        id="toggle-local-mode"
                      >
                        <span
                          className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                            isLocalMode ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                      <span className={`text-[10px] font-medium transition-colors ${isLocalMode ? 'text-emerald-400 font-semibold' : 'text-slate-500'}`}>
                        Local (Images de test)
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-slate-900/60 pt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <p className="text-[9px] text-slate-400 max-w-md">
                      💡 <strong>Astuce de synchronisation :</strong> Si vous avez renseigné des URLs Firebase valides ci-dessous, vous pouvez les télécharger et les enregistrer instantanément comme vos 3 fichiers de test locaux.
                    </p>
                    <button
                      type="button"
                      onClick={handleSaveCurrentImagesLocally}
                      disabled={isSavingLocal}
                      className="px-3 py-1.5 rounded text-[10px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
                    >
                      {isSavingLocal ? "Sauvegarde..." : "Enregistrer les images en local"}
                    </button>
                  </div>

                  {saveLocalStatus && (
                    <div className="mt-1 p-2 rounded bg-slate-900 text-[10px] font-mono text-slate-300 border border-slate-850">
                      {saveLocalStatus}
                    </div>
                  )}

                  {/* Local drag-and-drop / upload section */}
                  <div className="border-t border-slate-900/60 pt-3 mt-1.5">
                    <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider block mb-2">
                      📥 Déposer vos fichiers de test locaux (Drag & Drop ou Clic)
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {[
                        { label: "imageA : Arrière-plan", filename: "imageA_local.jpg", accept: ".jpg,.jpeg", desc: "Arrière-plan HD (.jpg)" },
                        { label: "imageB : Véhicule PNG", filename: "imageB_local.png", accept: ".png", desc: "Véhicule détouré (.png)" },
                        { label: "imageC : Composition", filename: "imageC_local.jpg", accept: ".jpg,.jpeg", desc: "Composition (.jpg)" }
                      ].map((item) => (
                        <div
                          key={item.filename}
                          className="border border-dashed border-slate-800 hover:border-emerald-500/50 bg-slate-900/40 hover:bg-slate-900/80 rounded-lg p-2.5 flex flex-col items-center justify-center text-center group transition relative"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const file = e.dataTransfer.files[0];
                            if (file) handleUploadLocalFile(item.filename, file);
                          }}
                        >
                          <span className="text-[9.5px] font-semibold text-emerald-400 font-mono mb-0.5">{item.filename}</span>
                          <span className="text-[7.5px] text-slate-500 mb-2 leading-tight">{item.desc}</span>
                          
                          <label className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-[9px] hover:bg-slate-850 hover:border-slate-700 text-slate-300 cursor-pointer transition flex items-center gap-1 select-none">
                            <Upload className="w-2.5 h-2.5 text-emerald-500" />
                            Choisir
                            <input
                              type="file"
                              accept={item.accept}
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadLocalFile(item.filename, file);
                              }}
                            />
                          </label>

                          {uploadStatus[item.filename] && (
                            <div className="absolute inset-0 bg-slate-950/95 rounded-lg flex items-center justify-center p-2 text-center text-[8.5px] font-mono text-emerald-400">
                              <span className="animate-pulse">{uploadStatus[item.filename]}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* URL Image A */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-300 font-mono font-medium">`imageA` : Adresse de l'Arrière-plan HD</span>
                    <span className="text-slate-500 font-mono">Firebase Storage URL (Background)</span>
                  </div>
                  <input
                    type="text"
                    value={imageA}
                    onChange={(ev) => setImageA(ev.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded px-3 py-2 text-[11px] text-slate-350 font-mono focus:border-emerald-500 outline-none"
                    placeholder="Renseignez l'URL Firebase pour l'image d'arrière-plan..."
                    id="url-imga"
                  />
                </div>

                {/* URL Image B */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-300 font-mono font-medium">`imageB` : Adresse du Véhicule Détouré Stable (PNG)</span>
                    <span className="text-slate-500 font-mono">Firebase Storage URL (Vehicle Out)</span>
                  </div>
                  <input
                    type="text"
                    value={imageB}
                    onChange={(ev) => setImageB(ev.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded px-3 py-2 text-[11px] text-slate-350 font-mono focus:border-emerald-500 outline-none"
                    placeholder="Renseignez l'URL Firebase pour le véhicule transparent..."
                    id="url-imgb"
                  />
                </div>

                {/* URL Image C */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-300 font-mono font-medium">`imageC` : Adresse de Guidage Visuel (Snapshot Canvas)</span>
                    <span className="text-amber-500/90 font-mono text-[10px] bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10">JPEG 0.75 compressé requis</span>
                  </div>
                  <input
                    type="text"
                    value={imageC}
                    onChange={(ev) => setImageC(ev.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded px-3 py-2 text-[11px] text-slate-350 font-mono focus:border-emerald-500 outline-none"
                    placeholder="Renseignez l'url de l'image de guidage compressée..."
                    id="url-imgc"
                  />
                </div>

                {/* URL Logo */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-300 font-mono font-medium">`logo` : Adresse du Logo d'Incrustation</span>
                    <span className="text-slate-500 font-mono">Brand Logo URL</span>
                  </div>
                  <input
                    type="text"
                    value={logo}
                    disabled={!logoAutorise}
                    onChange={(ev) => setLogo(ev.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 disabled:opacity-40 rounded px-3 py-2 text-[11px] text-slate-350 font-mono focus:border-emerald-500 outline-none"
                    placeholder="Adresse du logo choisi..."
                    id="url-logo"
                  />
                </div>
              </div>
            )}
          </div>

          {/* DYNAMIC METADATA TABLE CONFIG EDITOR (PRESETS_FOND REPRESENTATION) */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-xl overflow-hidden transition-all duration-200">
            <button
              onClick={() => setIsSec3Expanded(!isSec3Expanded)}
              className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-900/20 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <FileJson className={`w-4.5 h-4.5 transition-colors duration-200 ${isSec3Expanded ? "text-emerald-400" : "text-slate-400"}`} />
                <h2 className="text-sm font-display font-semibold text-slate-200">
                  3. Structure de la Table de Rules & Intent (`presetsFond` JSON)
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {!isSec3Expanded && (
                  <span className="hidden sm:inline bg-slate-950/60 border border-slate-850 text-slate-450 px-2 py-0.5 rounded text-[10px] font-mono">
                    Logo: {logoAutorise ? "Autorisé" : "Interdit"} | Text: {texteAutorise ? "Autorisé" : "Interdit"}
                  </span>
                )}
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isSec3Expanded ? "rotate-180 text-emerald-400" : ""}`} />
              </div>
            </button>

            {isSec3Expanded && (
              <div className="p-5 border-t border-slate-900/40 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-950 p-2.5 rounded-lg border border-slate-850">
                  <p className="text-[11px] text-slate-400 max-w-lg leading-relaxed">
                    💡 <span className="text-slate-200 font-semibold">Inspecteur de données :</span> Cette section en lecture seule affiche la structure exacte reçue par le moteur de génération IA (LIA) via Firestore. Toute modification doit être effectuée directement dans votre table de configuration externe.
                  </p>
                  
                  {/* Tab Selector */}
                  <div className="flex bg-slate-900 p-0.5 rounded border border-slate-800 text-[10.5px] self-start sm:self-auto shrink-0 font-mono">
                    <button
                      type="button"
                      onClick={() => setSec3Tab("json")}
                      className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                        sec3Tab === "json" 
                          ? "bg-emerald-500 text-slate-950 font-bold" 
                          : "text-slate-450 hover:text-slate-200"
                      }`}
                    >
                      Payload JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => setSec3Tab("table")}
                      className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                        sec3Tab === "table" 
                          ? "bg-emerald-500 text-slate-950 font-bold" 
                          : "text-slate-450 hover:text-slate-200"
                      }`}
                    >
                      Tableau des Paramètres
                    </button>
                  </div>
                </div>

                {sec3Tab === "json" ? (
                  /* Code JSON Block */
                  <div className="relative group">
                    <pre className="w-full max-h-[350px] overflow-y-auto bg-slate-950 text-[10.5px] text-emerald-400 font-mono p-4 rounded-lg border border-slate-850/80 leading-relaxed scrollbar-thin">
                      <code>{JSON.stringify(firestorePayload, null, 2)}</code>
                    </pre>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(firestorePayload, null, 2));
                        alert("Payload JSON copié !");
                      }}
                      className="absolute top-2.5 right-2.5 p-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-emerald-400 transition-all rounded shadow-md cursor-pointer"
                      title="Copier le JSON reçu"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  /* Beautiful tabular inspection view of all loaded parameter categories */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* Presets block */}
                    <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-850/80 space-y-3">
                      <h3 className="text-xs font-mono font-bold text-emerald-400 uppercase flex items-center gap-1.5 border-b border-slate-900 pb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        Pilier : Presets & Réglages
                      </h3>
                      
                      <div className="space-y-2 text-[11px] font-mono">
                        <div className="flex items-center justify-between py-1 border-b border-slate-900/30">
                          <span className="text-slate-400">logoAutorise :</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${logoAutorise ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-slate-900 text-slate-500 border border-slate-850"}`}>
                            {logoAutorise ? "TRUE (Exigé)" : "FALSE (Optionnel)"}
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-between py-1 border-b border-slate-900/30">
                          <span className="text-slate-400">texteAutorise :</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${texteAutorise ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-slate-900 text-slate-500 border border-slate-850"}`}>
                            {texteAutorise ? "TRUE (Autorisé)" : "FALSE (Désactivé)"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between py-1 border-b border-slate-900/30">
                          <span className="text-slate-400">logoSize :</span>
                          <span className="text-slate-200 font-bold">{logoSize || "150 px"}</span>
                        </div>

                        <div className="flex items-center justify-between py-1 border-b border-slate-900/30">
                          <span className="text-slate-400">logoColorFill :</span>
                          <div className="flex items-center gap-1.5">
                            {logoColorFillEnabled && (
                              <span className="w-3 h-3 rounded-full border border-slate-700" style={{ backgroundColor: logoColorFill }} />
                            )}
                            <span className="text-slate-200 font-bold">{logoColorFillEnabled ? logoColorFill : "Désactivé (Brut)"}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between py-1">
                          <span className="text-slate-400">Paramètre logoExtra :</span>
                          <span className="text-slate-350 truncate max-w-[150px]" title={logoExtra || "Aucun"}>{logoExtra || "[Vide]"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Dimensions & Matrices block */}
                    <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-850/80 space-y-3">
                      <h3 className="text-xs font-mono font-bold text-emerald-400 uppercase flex items-center gap-1.5 border-b border-slate-900 pb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        Pilier : Géométrie & Coordonnées (Grille 1280)
                      </h3>

                      <div className="space-y-2 text-[11px] font-mono">
                        <div className="flex items-center justify-between py-1 border-b border-slate-900/30">
                          <span className="text-slate-400">Placeholder Logo (x,y,w,h) :</span>
                          <span className="text-amber-400 font-bold">
                            ({logoX}, {logoY}, {logoW}, {logoH})
                          </span>
                        </div>

                        <div className="flex items-center justify-between py-1 border-b border-slate-900/30">
                          <span className="text-slate-400">Matrice du Véhicule (x,y,scale,rot) :</span>
                          <span className="text-amber-400 font-bold">
                            ({transformX}%, {transformY}%, {transformScale}x, {transformRotation}°)
                          </span>
                        </div>

                        <div className="flex items-center justify-between py-1 border-b border-slate-900/30 font-mono">
                          <span className="text-slate-400">Cropping BoundingBox (L,R,T,B) :</span>
                          <span className="text-emerald-400 font-bold">
                            ({boundingBoxLeft}, {boundingBoxRight}, {boundingBoxTop}, {boundingBoxBottom})
                          </span>
                        </div>

                        <div className="flex items-center justify-between py-1 border-b border-slate-900/30">
                          <span className="text-slate-400">Coordonnées Slogan (X, Y) :</span>
                          <span className="text-slate-200 font-bold">
                            X: {textX || "640"} | Y: {textY || "1000"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between py-1 border-b border-slate-900/30">
                          <span className="text-slate-400">Slogan Style & Police :</span>
                          <span className="text-slate-200 font-bold">
                            {fontFamily} ({textSize === "large" ? "Grande - 64px" : textSize === "small" ? "Petite - 32px" : "Normal - 48px"})
                          </span>
                        </div>

                        <div className="flex items-center justify-between py-1">
                          <span className="text-slate-400">Alignement & Perspective :</span>
                          <span className="text-slate-200 font-bold">
                            {textAlign || "CENTRE"} | {textperspective || "[Aucune]"}
                          </span>
                        </div>
                      </div>
                    </div>

                  </div>
                )}
              </div>
            )}
          </div>

        </section>

        {/* ================= COLUMN 2: VISUAL PREVIEW & WORKFLOW COMPILING (5 of 12) ================= */}
        <section className="col-span-1 lg:col-span-5 flex flex-col gap-6">

          {/* ACTIVE TRANSPARENT GEOMETRIC COMPOSER PREVIEW */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-display font-semibold text-slate-200 flex items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-400" />
                Aperçu Géometrique en Temps Réel
              </h2>
              
              {/* Interactive alignment toggles */}
              <div className="flex bg-slate-950 p-0.5 rounded border border-slate-800 text-[10px] self-start sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setPreviewMode("interactive")}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${previewMode === "interactive" ? "bg-emerald-500 text-slate-950 font-semibold" : "text-slate-400 hover:text-slate-200"}`}
                  title="Afficher la composition interactive dynamique"
                >
                  Interactive
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode("reference")}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${previewMode === "reference" ? "bg-emerald-500 text-slate-950 font-semibold" : "text-slate-400 hover:text-slate-200"}`}
                  title="Afficher la maquette de référence JPG brute"
                >
                  Réf (imageC)
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode("overlay")}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${previewMode === "overlay" ? "bg-emerald-500 text-slate-950 font-semibold" : "text-slate-400 hover:text-slate-200"}`}
                  title="Superposer la référence C à 45% d'opacité"
                >
                  Superposé
                </button>
              </div>
            </div>

            {/* Interactive stage showing composition parameters */}
            <div 
              style={{ containerType: "size" }}
              className="relative w-full aspect-square rounded-lg overflow-hidden bg-slate-800 border border-slate-700 shadow-md flex items-center justify-center"
            >

              {previewMode === "reference" ? (
                /* Pure reference mode */
                <>
                  {isImageCValid && (
                    <img
                      src={resolvedImageC}
                      alt="Composition référence imageC snapshot"
                      referrerPolicy="no-referrer"
                      className={`w-full h-full object-cover select-none pointer-events-none ${imageCLoadError ? 'hidden' : ''}`}
                      onError={() => {
                        setImageCLoadError(true);
                      }}
                      onLoad={() => {
                        setImageCLoadError(false);
                      }}
                    />
                  )}
                  {(!isImageCValid || imageCLoadError) && (
                    <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center text-[11px] text-slate-500 font-mono text-center p-4">
                      <span className="text-rose-500 font-bold">⚠️ Erreur de chargement d'imageC (Référence)</span>
                      <span className="text-[9px] text-slate-404 mt-1 break-all max-w-[90%] font-mono">{resolvedImageC || "[Non spécifiée]"}</span>
                    </div>
                  )}
                </>
              ) : (
                /* Interactive overlay composition mode */
                <>
                  {/* Background A */}
                  {isImageAValid && (
                    <img
                      src={resolvedImageA}
                      alt="Background preview"
                      referrerPolicy="no-referrer"
                      className={`w-full h-full object-cover select-none pointer-events-none ${imageALoadError ? 'hidden' : ''}`}
                      onError={() => {
                        setImageALoadError(true);
                      }}
                      onLoad={() => {
                        setImageALoadError(false);
                      }}
                    />
                  )}
                  {(!isImageAValid || imageALoadError) && (
                    <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center text-[11px] text-slate-500 font-mono text-center p-4">
                      <span className="text-rose-500 font-bold">⚠️ Erreur de chargement d'imageA (Fond)</span>
                      <span className="text-[9px] text-slate-405 mt-1 break-all max-w-[95%] font-mono">{resolvedImageA || "[Non spécifiée]"}</span>
                    </div>
                  )}

                  {/* Reference Image C overlaid with 45% opacity for pixel-perfect adjustments */}
                  {previewMode === "overlay" && isImageCValid && (
                    <img
                      src={resolvedImageC}
                      alt="Composition de référence en superposition"
                      referrerPolicy="no-referrer"
                      className={`absolute inset-0 w-full h-full object-cover opacity-45 pointer-events-none select-none z-10 ${imageCLoadError ? 'hidden' : ''}`}
                      onError={() => {
                        setImageCLoadError(true);
                       }}
                      onLoad={() => {
                        setImageCLoadError(false);
                      }}
                    />
                  )}

                   {/* Logo bounds representation if autorise */}
                   {logoAutorise && resolvedLogo && (
                     <div
                       className="absolute flex items-center justify-center pointer-events-none z-20"
                       style={{
                         left: `${logoLeftPct}%`,
                         top: `${logoTopPct}%`,
                         width: `${logoSizePct}%`,
                         height: `${logoSizePct}%`,
                         maxWidth: "100%",
                         maxHeight: "100%"
                       }}
                     >
                       {logoLoadError ? null : (
                         <>
                           {/* Image to track load issues */}
                           <img
                             src={resolvedLogo}
                             className="hidden"
                             alt="Load tracker"
                             referrerPolicy="no-referrer"
                             onError={() => { setLogoLoadError(true); }}
                             onLoad={() => { setLogoLoadError(false); }}
                           />
                           {logoColorFillEnabled ? (
                             <div 
                               className="absolute inset-0 w-full h-full"
                               style={{
                                 WebkitMaskImage: `url(${resolvedLogo})`,
                                 WebkitMaskSize: "contain",
                                 WebkitMaskRepeat: "no-repeat",
                                 WebkitMaskPosition: "center",
                                 maskImage: `url(${resolvedLogo})`,
                                 maskSize: "contain",
                                 maskRepeat: "no-repeat",
                                 maskPosition: "center",
                                 backgroundColor: logoColorFill,
                               }}
                             />
                           ) : (
                             <img
                               src={resolvedLogo}
                               alt="Logo Overlay"
                               referrerPolicy="no-referrer"
                               className="absolute inset-0 w-full h-full object-contain mx-auto"
                             />
                           )}
                         </>
                       )}
                     </div>
                   )}

                  {/* Text Slogan Display if autorise */}
                  {texteAutorise && sloganText && (
                    <div
                      className="absolute select-none pointer-events-none z-25 whitespace-nowrap"
                      style={{
                        left: `${txPct}%`,
                        top: `${tyPct}%`,
                        transform: `translate(${textAlign === "GAUCHE" ? "0%" : textAlign === "DROITE" ? "-100%" : "-50%"}, -50%)`,
                        textAlign: textAlign === "GAUCHE" ? "left" : textAlign === "DROITE" ? "right" : "center",
                        color: textColor,
                        fontFamily: fontFamily,
                        fontSize: `calc((${textSizePx} / ${refRes}) * 100cqw)`,
                        fontWeight: "bold"
                      }}
                    >
                      {sloganText}
                    </div>
                  )}

                  {/* Vehicle stable image overlayed with absolute matrix */}
                  <div
                    className="absolute pointer-events-none z-15"
                    style={{
                      width: "75%",
                      height: "75%",
                      left: `${12.5 + transformX * 0.75}%`,
                      top: `${12.5 + transformY * 0.75}%`,
                      transform: `rotate(${transformRotation}deg) scale(${effectiveScale})`,
                      transformOrigin: "center center",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "transform 0.1s ease-out"
                    }}
                  >
                    {isImageBValid && (
                      <img
                        src={resolvedImageB}
                        alt="Vehicle overlay"
                        referrerPolicy="no-referrer"
                        className={`w-full h-full object-contain ${imageBLoadError ? 'hidden' : ''}`}
                        onError={() => {
                          setImageBLoadError(true);
                        }}
                        onLoad={() => {
                          setImageBLoadError(false);
                        }}
                      />
                    )}
                    {(!isImageBValid || imageBLoadError) && (
                      <div className="bg-red-950/60 border border-red-500/40 text-red-400 p-2.5 rounded text-[10px] font-mono text-center max-w-[85%]">
                        <span className="font-bold">⚠️ Erreur de chargement imageB (Véhicule)</span>
                        <span className="block text-[8px] text-slate-400 mt-1 break-all truncate">{resolvedImageB || "[Non spécifiée]"}</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="absolute top-2 right-2 bg-slate-950/85 text-[8px] border border-blue-900/40 text-blue-400 px-2 py-0.5 rounded font-mono z-30">
                {previewMode === "reference" ? "imageC : Snapshot" : (previewMode === "overlay" ? "Superposé" : "imageC : JPG d'Intent")}
              </div>
            </div>

            {/* Cartouche d'informations géométriques repositionné en dessous pour ne pas masquer le preview */}
            <div className="mt-2.5 p-3 bg-slate-950/90 border border-slate-800 rounded-lg flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono shadow-md">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Active Matrix</span>
              </div>
              <div className="text-slate-300 bg-slate-900/45 px-2.5 py-1 rounded border border-slate-900">
                X: <span className="text-emerald-400 font-semibold">{typeof transformX === 'number' ? transformX.toFixed(5) : transformX}%</span>
                <span className="text-slate-700 mx-2">|</span>
                Y: <span className="text-emerald-400 font-semibold">{typeof transformY === 'number' ? transformY.toFixed(5) : transformY}%</span>
              </div>
              <div className="text-slate-350 bg-slate-900/45 px-2.5 py-1 rounded border border-slate-900">
                Scale: <span className="text-amber-400 font-semibold">{typeof transformScale === 'number' ? transformScale.toFixed(4) : transformScale}x</span>
                <span className="text-slate-700 mx-2">|</span>
                Rot: <span className="text-amber-400 font-semibold">{transformRotation}°</span>
              </div>
            </div>

            {/* PANNEAU INTERACTIF D'AJUSTEMENTS MATRICIELS & CROP BOUNDS */}
            <div className="mt-4 p-4 bg-slate-950/80 border border-slate-900 rounded-lg space-y-4">
              <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                <h3 className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-blue-400" />
                  Console d'Ajustements & Boîte Bounding Box
                </h3>
                <span className="text-[9px] bg-slate-900 text-slate-500 border border-slate-850 px-2 py-0.5 rounded font-mono font-bold">
                  Matrice 2D + BBox
                </span>
              </div>

              {/* SECTION: TRANSFORMS */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider">
                  ⚡ 1. Transformations Géométriques du Véhicule (Calque)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono mb-1">
                      <span>Décalage X (transformX)</span>
                      <span className="text-emerald-400 font-bold">{transformX}%</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      step="0.1"
                      value={transformX}
                      onChange={(ev) => setTransformX(parseFloat(ev.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer h-1 bg-slate-900 rounded-lg appearance-none"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono mb-1">
                      <span>Décalage Y (transformY)</span>
                      <span className="text-emerald-400 font-bold">{transformY}%</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      step="0.1"
                      value={transformY}
                      onChange={(ev) => setTransformY(parseFloat(ev.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer h-1 bg-slate-900 rounded-lg appearance-none"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono mb-1">
                      <span>Échelle additionnelle (scale)</span>
                      <span className="text-amber-400 font-bold">{transformScale}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="2.5"
                      step="0.01"
                      value={transformScale}
                      onChange={(ev) => setTransformScale(parseFloat(ev.target.value))}
                      className="w-full accent-amber-500 cursor-pointer h-1 bg-slate-900 rounded-lg appearance-none"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono mb-1">
                      <span>Rotation (rotation)</span>
                      <span className="text-amber-400 font-bold">{transformRotation}°</span>
                    </div>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      step="0.5"
                      value={transformRotation}
                      onChange={(ev) => setTransformRotation(parseFloat(ev.target.value))}
                      className="w-full accent-amber-500 cursor-pointer h-1 bg-slate-900 rounded-lg appearance-none"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION: BOUNDING BOX */}
              <div className="space-y-3 pt-2 border-t border-slate-900/40">
                <h4 className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider flex items-center justify-between">
                  <span>📦 2. Boîte Englobante Active du Véhicule (Crop orig.)</span>
                  <span className="text-blue-400 text-[8.5px] lowercase bg-blue-900/10 px-1.5 py-0.5 rounded border border-blue-900/20 font-mono">boundingBoxVehicule</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <label className="block text-[9px] font-mono text-slate-500 mb-0.5" htmlFor="bbox_left">BBox Gauche (Left)</label>
                    <input
                      type="number"
                      id="bbox_left"
                      value={boundingBoxLeft}
                      onChange={(ev) => setBoundingBoxLeft(parseInt(ev.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-350 font-mono focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono text-slate-500 mb-0.5" htmlFor="bbox_right">BBox Droite (Right)</label>
                    <input
                      type="number"
                      id="bbox_right"
                      value={boundingBoxRight}
                      onChange={(ev) => setBoundingBoxRight(parseInt(ev.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-350 font-mono focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono text-slate-500 mb-0.5" htmlFor="bbox_top">BBox Haut (Top)</label>
                    <input
                      type="number"
                      id="bbox_top"
                      value={boundingBoxTop}
                      onChange={(ev) => setBoundingBoxTop(parseInt(ev.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-350 font-mono focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono text-slate-500 mb-0.5" htmlFor="bbox_bottom">BBox Bas (Bottom)</label>
                    <input
                      type="number"
                      id="bbox_bottom"
                      value={boundingBoxBottom}
                      onChange={(ev) => setBoundingBoxBottom(parseInt(ev.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-350 font-mono focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <p className="text-[11px] text-slate-400 leading-relaxed mt-2.5">
              💡 Le canvas de votre application cliente génère ce rendu interactif léger en combinant ces calques. Lorsqu'un utilisateur lance la génération, le document Firestore structure et transmet ces mêmes variables au moteur IA d'inpainting.
            </p>
          </div>

          {/* GALLERY OF INDIVIDUAL SOURCE CHANNELS */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-850 pb-3">
              <div className="flex items-center gap-2">
                <Image className="w-4.5 h-4.5 text-emerald-400" />
                <h2 className="text-sm font-display font-semibold text-slate-200">
                  📁 Inspecteur des Canaux Reçus (Données Images)
                </h2>
              </div>
              <span className="text-[10px] bg-slate-950 text-slate-400 px-2 py-0.5 rounded font-mono border border-slate-850">
                Canaux Source Bruts
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-normal">
              Visualisez et analysez individuellement chacun des fichiers binaires transmis par la PWA. Cliquez sur une image pour l'ouvrir en grand format.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              
              {/* IMAGE A CARD */}
              <div className="bg-slate-950 border border-slate-850 rounded-lg p-2.5 flex flex-col gap-2 hover:border-slate-700 transition relative group">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-emerald-400">imageA</span>
                  <div className="flex items-center gap-1">
                    {imageALoadError && (
                      <span className="text-[7.5px] bg-rose-500/20 text-rose-400 px-1 py-0.5 rounded font-mono font-semibold">ERREUR</span>
                    )}
                    <span className="text-[8px] bg-emerald-950/40 text-emerald-400 px-1 rounded font-mono">Fond HD</span>
                  </div>
                </div>
                
                <div 
                  className="w-full aspect-square rounded bg-slate-800 border border-slate-700 overflow-hidden cursor-zoom-in relative group-hover:scale-[1.02] transition flex items-center justify-center p-1"
                  onClick={() => {
                    setLightboxUrl(resolvedImageA);
                    setLightboxTitle(`imageA : Arrière-plan statique d’Inpainting (HD)`);
                  }}
                >
                  {isImageAValid && resolvedImageA && (
                    <img 
                      key={resolvedImageA}
                      src={resolvedImageA} 
                      alt="Arrière plan" 
                      referrerPolicy="no-referrer"
                      className={`w-full h-full object-contain ${imageALoadError ? 'hidden' : ''}`} 
                      onError={() => setImageALoadError(true)}
                      onLoad={() => setImageALoadError(false)}
                    />
                  )}
                  {(!isImageAValid || !resolvedImageA || imageALoadError) && (
                    <div className="w-full h-full flex flex-col items-center justify-center text-[10px] text-red-400 font-mono text-center p-2.5 bg-red-950/20 absolute inset-0">
                      <span className="font-bold">❌ Erreur</span>
                      <span className="text-[8px] text-slate-500 mt-1 truncate max-w-full">Chargement échoué</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                    <span className="text-[10px] font-mono bg-slate-900/90 text-slate-200 px-2 py-1 rounded border border-slate-800">Zoom 🔍</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-1 mt-1">
                  <input 
                    type="text" 
                    readOnly 
                    value={resolvedImageA} 
                    className="flex-1 bg-slate-900/60 rounded px-1.5 py-0.5 text-[8.5px] font-mono text-slate-400 border border-slate-900 pointer-events-none truncate" 
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(resolvedImageA);
                      alert("URL imageA résolue copiée dans le presse-papiers !");
                    }} 
                    className="p-1 bg-slate-900 border border-slate-800 rounded hover:bg-slate-800 cursor-pointer text-slate-400 hover:text-emerald-400 transition"
                    title="Copier l'URL résolue"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* IMAGE B CARD */}
              <div className="bg-slate-950 border border-slate-850 rounded-lg p-2.5 flex flex-col gap-2 hover:border-slate-700 transition relative group">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-emerald-400">imageB</span>
                  <div className="flex items-center gap-1">
                    {imageBLoadError && (
                      <span className="text-[7.5px] bg-rose-500/20 text-rose-400 px-1 py-0.5 rounded font-mono font-semibold">ERREUR</span>
                    )}
                    <span className="text-[8px] bg-blue-950/40 text-blue-400 px-1 rounded font-mono">Détorage</span>
                  </div>
                </div>

                <div 
                  className="w-full aspect-square rounded bg-[radial-gradient(#475569_1.2px,transparent_1.2px)] [background-size:10px_10px] bg-slate-800 border border-slate-700 overflow-hidden cursor-zoom-in relative group-hover:scale-[1.02] transition flex items-center justify-center p-1"
                  title="Grille de transparence pour détourage stable"
                  onClick={() => {
                    setLightboxUrl(resolvedImageB);
                    setLightboxTitle(`imageB : Véhicule détouré transparent (PNG)`);
                  }}
                >
                  {isImageBValid && resolvedImageB && (
                    <img 
                      key={resolvedImageB}
                      src={resolvedImageB} 
                      alt="Véhicule détouré" 
                      referrerPolicy="no-referrer"
                      className={`w-full h-full object-contain drop-shadow-md ${imageBLoadError ? 'hidden' : ''}`} 
                      onError={() => setImageBLoadError(true)}
                      onLoad={() => setImageBLoadError(false)}
                    />
                  )}
                  {(!isImageBValid || !resolvedImageB || imageBLoadError) && (
                    <div className="w-full h-full flex flex-col items-center justify-center text-[10px] text-red-400 font-mono text-center p-2.5 bg-red-950/20 absolute inset-0">
                      <span className="font-bold">❌ Erreur</span>
                      <span className="text-[8px] text-slate-500 mt-1 truncate max-w-full">Chargement échoué</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                    <span className="text-[10px] font-mono bg-slate-900/90 text-slate-200 px-2 py-1 rounded border border-slate-800">Zoom 🔍</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 mt-1">
                  <input 
                    type="text" 
                    readOnly 
                    value={resolvedImageB} 
                    className="flex-1 bg-slate-900/60 rounded px-1.5 py-0.5 text-[8.5px] font-mono text-slate-400 border border-slate-900 pointer-events-none truncate" 
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(resolvedImageB);
                      alert("URL imageB résolue copiée !");
                    }} 
                    className="p-1 bg-slate-900 border border-slate-800 rounded hover:bg-slate-800 cursor-pointer text-slate-400 hover:text-emerald-400 transition"
                    title="Copier l'URL résolue"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* IMAGE C CARD */}
              <div className="bg-slate-950 border border-slate-850 rounded-lg p-2.5 flex flex-col gap-2 hover:border-slate-700 transition relative group">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-emerald-400">imageC</span>
                  <div className="flex items-center gap-1">
                    {imageCLoadError && (
                      <span className="text-[7.5px] bg-rose-500/20 text-rose-400 px-1 py-0.5 rounded font-mono font-semibold">ERREUR</span>
                    )}
                    <span className="text-[8px] bg-amber-950/40 text-amber-500 px-1 rounded font-mono">Guidage JPG</span>
                  </div>
                </div>

                <div 
                  className="w-full aspect-square rounded bg-slate-800 border border-slate-700 overflow-hidden cursor-zoom-in relative group-hover:scale-[1.02] transition flex items-center justify-center p-1"
                  onClick={() => {
                    setLightboxUrl(resolvedImageC);
                    setLightboxTitle(`imageC : Référence visuelle de mise en page PWA (JPEG)`);
                  }}
                >
                  {isImageCValid && resolvedImageC && (
                    <img 
                      key={resolvedImageC}
                      src={resolvedImageC} 
                      alt="Composition référence" 
                      referrerPolicy="no-referrer"
                      className={`w-full h-full object-contain ${imageCLoadError ? 'hidden' : ''}`} 
                      onError={() => setImageCLoadError(true)}
                      onLoad={() => setImageCLoadError(false)}
                    />
                  )}
                  {(!isImageCValid || !resolvedImageC || imageCLoadError) && (
                    <div className="w-full h-full flex flex-col items-center justify-center text-[10px] text-red-400 font-mono text-center p-2.5 bg-red-950/20 absolute inset-0">
                      <span className="font-bold">❌ Erreur</span>
                      <span className="text-[8px] text-slate-500 mt-1 truncate max-w-full">Chargement échoué</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                    <span className="text-[10px] font-mono bg-slate-900/90 text-slate-200 px-2 py-1 rounded border border-slate-800">Zoom 🔍</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 mt-1">
                  <input 
                    type="text" 
                    readOnly 
                    value={resolvedImageC} 
                    className="flex-1 bg-slate-900/60 rounded px-1.5 py-0.5 text-[8.5px] font-mono text-slate-400 border border-slate-900 pointer-events-none truncate" 
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(resolvedImageC);
                      alert("URL imageC résolue copiée !");
                    }} 
                    className="p-1 bg-slate-900 border border-slate-800 rounded hover:bg-slate-800 cursor-pointer text-slate-400 hover:text-emerald-400 transition"
                    title="Copier l'URL résolue"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* LOGO CARD */}
              <div className="bg-slate-950 border border-slate-850 rounded-lg p-2.5 flex flex-col gap-2 hover:border-slate-700 transition relative group">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-emerald-400">logo</span>
                  <div className="flex items-center gap-1">
                    {logoLoadError && (
                      <span className="text-[7.5px] bg-rose-500/20 text-rose-400 px-1 py-0.5 rounded font-mono font-semibold">ERREUR</span>
                    )}
                    <span className="text-[8px] bg-sky-950/40 text-sky-400 px-1 rounded font-mono">Marque</span>
                  </div>
                </div>

                <div 
                  className="w-full aspect-square rounded bg-slate-800 border border-slate-700 overflow-hidden cursor-zoom-in relative group-hover:scale-[1.02] transition flex items-center justify-center p-1"
                  onClick={() => {
                    setLightboxUrl(resolvedLogo);
                    setLightboxTitle(`logo : fichier de logo de marque`);
                  }}
                >
                  {resolvedLogo && (
                    <img 
                      key={resolvedLogo}
                      src={resolvedLogo} 
                      alt="Logo marque" 
                      referrerPolicy="no-referrer"
                      className={`w-auto h-2/3 max-h-[85%] object-contain ${logoLoadError ? 'hidden' : ''}`} 
                      onError={() => setLogoLoadError(true)}
                      onLoad={() => setLogoLoadError(false)}
                    />
                  )}
                  {(!resolvedLogo || logoLoadError) && (
                    <div className="w-full h-full flex flex-col items-center justify-center text-[10px] text-red-400 font-mono text-center p-2.5 bg-red-950/20 absolute inset-0">
                      <span className="font-bold">❌ Erreur</span>
                      <span className="text-[8px] text-slate-505 mt-1 truncate max-w-full">Chargement échoué</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                    <span className="text-[10px] font-mono bg-slate-900/90 text-slate-200 px-2 py-1 rounded border border-slate-800">Zoom 🔍</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 mt-1">
                  <input 
                    type="text" 
                    readOnly 
                    value={resolvedLogo} 
                    className="flex-1 bg-slate-900/60 rounded px-1.5 py-0.5 text-[8.5px] font-mono text-slate-400 border border-slate-900 pointer-events-none truncate" 
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(resolvedLogo);
                      alert("URL logo résolue copiée !");
                    }} 
                    className="p-1 bg-slate-900 border border-slate-800 rounded hover:bg-slate-800 cursor-pointer text-slate-400 hover:text-emerald-400 transition"
                    title="Copier l'URL résolue"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* GATEKEEPER DECISION MATRIX MODULE */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 space-y-4">
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${isGatekeeperClear ? "bg-emerald-500 animate-ping" : "bg-amber-500 animate-pulse"}`} />
                <h2 className="text-sm font-display font-semibold text-slate-200">
                  Gatekeeper Sûreté du Moteur IA
                </h2>
              </div>
              <span className={`px-2 py-0.5 text-[10px] font-mono rounded border uppercase font-bold tracking-tight ${
                isGatekeeperClear 
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" 
                  : "bg-amber-500/15 text-amber-400 border-amber-500/25"
              }`}>
                {currentStatus}
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              
              {/* Pilier 1 Checklist */}
              <div className="flex items-start justify-between p-2.5 rounded bg-slate-950 border border-slate-900">
                <div className="space-y-0.5">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-slate-500 block font-bold">PILIER 1</span>
                  <span className="font-semibold text-slate-300 block">Canaux Chimiques d'Image</span>
                  <span className="text-[10px] text-slate-400 block">imageA, imageB, imageC doivent exister</span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${validationChimiquePassed ? "text-emerald-400 bg-emerald-950/20" : "text-amber-400 bg-amber-950/20"}`}>
                  {validationChimiquePassed ? "PASSED" : "FAILED / EMPTY"}
                </span>
              </div>

              {/* Pilier 2 Checklist */}
              <div className="flex items-start justify-between p-2.5 rounded bg-slate-950 border border-slate-900">
                <div className="space-y-0.5">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-slate-500 block font-bold">PILIER 2</span>
                  <span className="font-semibold text-slate-300 block">Conformité Graphique</span>
                  <span className="text-[10px] text-slate-400 block">Slogan et logo selon les autorisations de la table</span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${presetsPassed ? "text-emerald-400 bg-emerald-950/20" : "text-amber-400 bg-amber-950/20"}`}>
                  {presetsPassed ? "PASSED" : "WAITING CONFORMITY"}
                </span>
              </div>

              {/* Pilier 3 Checklist */}
              <div className="flex items-start justify-between p-2.5 rounded bg-slate-950 border border-slate-900">
                <div className="space-y-0.5">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-slate-500 block font-bold">PILIER 3</span>
                  <span className="font-semibold text-slate-300 block">Convergence Géométrique</span>
                  <span className="text-[10px] text-slate-400 block">Matrice transform valide et non altérée</span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${geomPassed ? "text-emerald-400 bg-emerald-950/20" : "text-red-400 bg-red-950/20"}`}>
                  {geomPassed ? "STABLE" : "CORRUPT"}
                </span>
              </div>

            </div>

            {/* Trigger simulation control */}
            <button
              onClick={triggerSimulation}
              disabled={!isGatekeeperClear || isRunningPipeline}
              className={`w-full py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition ${
                isGatekeeperClear 
                  ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold" 
                  : "bg-slate-900 text-slate-500 cursor-not-allowed border border-slate-800"
              }`}
              id="sim-action"
            >
              {isRunningPipeline ? (
                <>
                  <RefreshCw className="w-4.5 h-4.5 animate-spin text-slate-950" />
                  Génération active du Moteur...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-slate-950" />
                  Mettre à jour le statut Firestore & simuler la génération
                </>
              )}
            </button>

          </div>

          {/* BACKEND SIMULATOR CONSOLE DISPLAY */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 flex flex-col flex-1">
            <div className="flex items-center gap-2 mb-3">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-display font-semibold text-slate-200">
                Rapport de Console d'Exécution IA
              </h2>
            </div>

            <div className="bg-slate-950 rounded-lg p-3 border border-slate-900 text-xs font-mono text-slate-300 flex-1 h-48 overflow-y-auto space-y-1">
              {pipelineLogEvents.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center py-4">
                  <Cpu className="w-8 h-8 opacity-30 mb-2 animate-pulse" />
                  <span>Aucun log disponible.<br/>Cliquez sur simuler après avoir validé vos paramètres.</span>
                </div>
              ) : (
                pipelineLogEvents.map((log, i) => (
                  <div key={i} className="border-l border-emerald-500/65 pl-2 text-[10px] leading-relaxed">
                    {log}
                  </div>
                ))
              )}
            </div>

            {isSuccessState && (
              <div className="mt-3 p-2.5 bg-emerald-950/20 border border-emerald-500/20 rounded text-emerald-400 font-mono text-[10px] text-center animate-pulse">
                ✔️ COMPOSITION IA HD TERMINÉE AVEC SUCCÈS.
              </div>
            )}
          </div>

        </section>

      </main>

      {/* RAW CODES TRANSMIS & JSON SCHEMAS EXTRAS SECTION */}
      <section className="max-w-7xl mx-auto px-4 lg:px-6 pb-12 grid grid-cols-1 gap-6">

        <div className="bg-slate-900/40 border border-slate-900 rounded-xl overflow-hidden transition-all duration-200">
          <button
            onClick={() => setIsSec4Expanded(!isSec4Expanded)}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-900/20 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Code className={`w-4.5 h-4.5 transition-colors duration-200 ${isSec4Expanded ? "text-emerald-400" : "text-slate-400"}`} />
              <div>
                <h2 className="text-sm font-display font-semibold text-slate-200">
                  4. Recette JSON du Document Firestore & Scripts de Déclenchement Directs
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Payload brut de composition envoyé de façon transparente à Firestore
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isSec4Expanded && (
                <span className="hidden sm:inline bg-slate-950/60 border border-slate-850 text-slate-400 px-2 py-0.5 rounded text-[10px] font-mono">
                  Format: {activeTab.toUpperCase()}
                </span>
              )}
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isSec4Expanded ? "rotate-180 text-emerald-400" : ""}`} />
            </div>
          </button>

          {isSec4Expanded && (
            <div className="p-5 border-t border-slate-900/40 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-850 pb-4 mb-4">
                
                <div>
                  <p className="text-xs text-slate-400">
                    Voici le payload exact généré de façon transparente et envoyé à Firestore lors du changement géométrique ou textuel de la PWA.
                  </p>
                </div>

                {/* TAB CONTROLS */}
                <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-850">
                  <button
                    onClick={() => setActiveTab("json")}
                    className={`px-3 py-1 text-xs font-mono rounded cursor-pointer ${activeTab === "json" ? "bg-emerald-500 text-slate-950 font-bold" : "text-slate-400 hover:text-slate-200"}`}
                    id="tab-json"
                  >
                    JSON Payload (Firestore Doc)
                  </button>
                  <button
                    onClick={() => setActiveTab("python")}
                    className={`px-3 py-1 text-xs font-mono rounded cursor-pointer ${activeTab === "python" ? "bg-emerald-500 text-slate-950 font-bold" : "text-slate-400 hover:text-slate-200"}`}
                    id="tab-py"
                  >
                    Python Admin
                  </button>
                  <button
                    onClick={() => setActiveTab("node")}
                    className={`px-3 py-1 text-xs font-mono rounded cursor-pointer ${activeTab === "node" ? "bg-emerald-500 text-slate-950 font-bold" : "text-slate-400 hover:text-slate-200"}`}
                    id="tab-js"
                  >
                    Node.js Admin
                  </button>
                  <button
                    onClick={() => setActiveTab("curl")}
                    className={`px-3 py-1 text-xs font-mono rounded cursor-pointer ${activeTab === "curl" ? "bg-emerald-500 text-slate-950 font-bold" : "text-slate-400 hover:text-slate-200"}`}
                    id="tab-curl"
                  >
                    REST cURL API
                  </button>
                </div>

              </div>

              {/* CODE SNIPPET CONTAINER */}
              <div className="relative">
                <button
                  onClick={copyToClipboard}
                  className="absolute top-3 right-3 bg-slate-905 hover:bg-slate-800 border border-slate-800 p-2 rounded text-slate-300 font-mono text-[11px] flex items-center gap-1.5 transition cursor-pointer"
                  title="Copy to clipboard"
                  id="copy-to-clip"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copié !</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>Copier</span>
                    </>
                  )}
                </button>

                <pre className="bg-slate-950 rounded-lg p-5 border border-slate-900 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed max-h-96">
                  {activeTab === "json" && JSON.stringify(firestorePayload, null, 2)}
                  {activeTab === "python" && generatePythonSnippet(firestorePayload)}
                  {activeTab === "node" && generateNodeSnippet(firestorePayload)}
                  {activeTab === "curl" && generateCurlSnippet(firestorePayload, firebaseProjectId, firestoreDatabaseId)}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* COMPREHENSIVE QUESTION & INTEGRATION CORRESPONDENCE DESKTOP MANUAL */}
        <div className="bg-slate-900/40 border border-slate-900 rounded-xl overflow-hidden transition-all duration-200">
          <button
            onClick={() => setIsSec5Expanded(!isSec5Expanded)}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-900/20 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Database className={`w-4.5 h-4.5 transition-colors duration-200 ${isSec5Expanded ? "text-emerald-400" : "text-slate-400"}`} />
              <div>
                <h2 className="text-sm font-display font-semibold text-slate-200">
                  5. Configuration PWA & Liaison Active `firebase-applet-config.json`
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Visualisez, personnalisez et copiez la configuration exacte de liaison de votre PWA
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isSec5Expanded && (
                <span className="hidden sm:inline bg-slate-950/60 border border-slate-850 text-slate-400 px-2 py-0.5 rounded text-[10px] font-mono">
                  Fichier complet de liaison
                </span>
              )}
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isSec5Expanded ? "rotate-180 text-emerald-400" : ""}`} />
            </div>
          </button>

          {isSec5Expanded && (
            <div className="p-5 border-t border-slate-900/40 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-850 pb-4">
                <div className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-emerald-400" />
                  <div>
                    <h2 className="text-sm font-display font-semibold text-slate-200">
                      Configuration PWA & Liaison Active `firebase-applet-config.json`
                    </h2>
                    <p className="text-xs text-slate-400">
                      Visualisez, personnalisez et copiez la configuration exacte de votre PWA pour piloter le moteur d'Inpainting en temps réel.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-850 p-1 rounded text-[10px] font-mono text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
                  <span>LIAISON ACTIVE INSTANTANÉE</span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* LEFT COLUMN: EDITABLE INPUTS FOR ALL 8 KEYS */}
                <div className="lg:col-span-7 bg-slate-950/40 border border-slate-900 p-4.5 rounded-lg space-y-4">
                  <h3 className="text-xs font-mono font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-900 pb-2">
                    <Sliders className="w-3.5 h-3.5 text-blue-400" />
                    Éditeur de Configuration Client (PWA)
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[10px] font-mono text-slate-400 mb-0.5" htmlFor="pwa_projectId">projectId</label>
                      <input
                        type="text"
                        id="pwa_projectId"
                        value={firebaseProjectId}
                        onChange={(ev) => {
                          const val = ev.target.value;
                          setFirebaseProjectId(val);
                          setFirebaseAuthDomain(`${val}.firebaseapp.com`);
                          setFirebaseStorageBucket(`${val}.firebasestorage.app`);
                          setFirebaseBucketName(`gs://${val}.firebasestorage.app`);
                        }}
                        className="w-full bg-slate-950 border border-slate-850 rounded px-2.5 py-1.5 text-[11px] text-slate-300 font-mono focus:border-blue-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-slate-400 mb-0.5" htmlFor="pwa_apiKey">apiKey</label>
                      <input
                        type="text"
                        id="pwa_apiKey"
                        value={firebaseApiKey}
                        onChange={(ev) => setFirebaseApiKey(ev.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded px-2.5 py-1.5 text-[11px] text-slate-300 font-mono focus:border-blue-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-slate-400 mb-0.5" htmlFor="pwa_appId">appId</label>
                      <input
                        type="text"
                        id="pwa_appId"
                        value={firebaseAppId}
                        onChange={(ev) => setFirebaseAppId(ev.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded px-2.5 py-1.5 text-[11px] text-slate-300 font-mono focus:border-blue-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-slate-400 mb-0.5" htmlFor="pwa_authDomain">authDomain</label>
                      <input
                        type="text"
                        id="pwa_authDomain"
                        value={firebaseAuthDomain}
                        onChange={(ev) => setFirebaseAuthDomain(ev.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded px-2.5 py-1.5 text-[11px] text-slate-300 font-mono focus:border-blue-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-slate-400 mb-0.5" htmlFor="pwa_firestoreDatabaseId">firestoreDatabaseId</label>
                      <input
                        type="text"
                        id="pwa_firestoreDatabaseId"
                        value={firestoreDatabaseId}
                        onChange={(ev) => setFirestoreDatabaseId(ev.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded px-2.5 py-1.5 text-[11px] text-slate-300 font-mono focus:border-blue-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-slate-400 mb-0.5" htmlFor="pwa_storageBucket">storageBucket</label>
                      <input
                        type="text"
                        id="pwa_storageBucket"
                        value={firebaseStorageBucket}
                        onChange={(ev) => {
                          const val = ev.target.value;
                          setFirebaseStorageBucket(val);
                          setFirebaseBucketName(`gs://${val}`);
                        }}
                        className="w-full bg-slate-950 border border-slate-850 rounded px-2.5 py-1.5 text-[11px] text-slate-300 font-mono focus:border-blue-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-slate-400 mb-0.5" htmlFor="pwa_messagingSenderId">messagingSenderId</label>
                      <input
                        type="text"
                        id="pwa_messagingSenderId"
                        value={messagingSenderId}
                        onChange={(ev) => setMessagingSenderId(ev.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded px-2.5 py-1.5 text-[11px] text-slate-300 font-mono focus:border-blue-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-slate-400 mb-0.5" htmlFor="pwa_measurementId">measurementId</label>
                      <input
                        type="text"
                        id="pwa_measurementId"
                        value={measurementId}
                        onChange={(ev) => setMeasurementId(ev.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded px-2.5 py-1.5 text-[11px] text-slate-300 font-mono focus:border-blue-500 outline-none"
                        placeholder="Facultatif (ex: G-EXAMPLEDATA)"
                      />
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: LIVE RAW JSON AND AUTO-COPY FILE CAPABILITIES */}
                <div className="lg:col-span-5 flex flex-col gap-3">
                  
                  <div className="bg-slate-950 rounded-lg border border-slate-850 flex-1 flex flex-col overflow-hidden">
                    <div className="bg-slate-900 px-3.5 py-2 flex items-center justify-between border-b border-slate-850">
                      <div className="flex items-center gap-1.5 text-[10.5px] font-mono text-slate-300 font-bold">
                        <FileJson className="w-3.5 h-3.5 text-blue-400" />
                        firebase-applet-config.json
                      </div>
                      <button
                        onClick={() => {
                          const configJson = JSON.stringify({
                            projectId: firebaseProjectId,
                            appId: firebaseAppId,
                            apiKey: firebaseApiKey,
                            authDomain: firebaseAuthDomain,
                            firestoreDatabaseId: firestoreDatabaseId,
                            storageBucket: firebaseStorageBucket,
                            messagingSenderId: messagingSenderId,
                            measurementId: measurementId
                          }, null, 2);
                          navigator.clipboard.writeText(configJson);
                          alert("Contenu du fichier copié !");
                        }}
                        className="px-2 py-0.5 bg-slate-950 hover:bg-slate-800 text-[9.5px] font-mono text-emerald-400 border border-slate-800 rounded transition cursor-pointer flex items-center gap-1"
                        id="btn-copy-pwa-config"
                      >
                        <Copy className="w-2.5 h-2.5" />
                        Copier le fichier
                      </button>
                    </div>

                    <pre className="p-4 flex-1 text-[10px] font-mono text-slate-300 overflow-auto bg-slate-950/65 select-all leading-relaxed antialiased">
{`{
  "projectId": "${firebaseProjectId}",
  "appId": "${firebaseAppId}",
  "apiKey": "${firebaseApiKey}",
  "authDomain": "${firebaseAuthDomain}",
  "firestoreDatabaseId": "${firestoreDatabaseId}",
  "storageBucket": "${firebaseStorageBucket}",
  "messagingSenderId": "${messagingSenderId}",
  "measurementId": "${measurementId}"
}`}
                    </pre>
                  </div>

                  <div className="p-3 bg-blue-950/15 border border-blue-900/30 rounded text-[11px] text-slate-400 leading-relaxed">
                    ℹ️ <strong>Synchronisation active :</strong> Les modifications effectuées ici mettent à jour instantanément les scripts d'initialisation Python, Node.js, et la commande REST cURL ci-dessus !
                  </div>

                </div>

              </div>

              {/* SECONDARY INFO BLOCK: SYSTEM SECURITY RULES AND ANSWERS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 text-xs text-slate-300">
                
                <div className="bg-slate-950/80 p-4 rounded-lg border border-slate-900 space-y-2">
                  <h3 className="font-semibold text-emerald-400 flex items-center gap-1.5">
                    <span>🛡️ Règles d'accès (Security Rules) de Firebase Storage</span>
                  </h3>
                  <p className="text-slate-400 text-[11px]">
                    Pour isoler les logos de vos utilisateurs dans le dossier <code className="text-slate-300">users/{"{"}userId{"}"}/logos/</code>, configurez cette règle dans l'onglet de sécurité de votre bucket Firebase Storage :
                  </p>
                  <pre className="bg-slate-900 p-2 rounded text-[10px] font-mono text-slate-350 overflow-auto">
{`rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/logos/{allPaths=**} {
      allow read: if true; // Permettre au moteur IA de lire
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}`}
                  </pre>
                </div>

                <div className="bg-slate-950/80 p-4 rounded-lg border border-slate-900 space-y-3">
                  <h3 className="font-semibold text-emerald-400">📋 Initialisation dans votre PWA Client</h3>
                  <p className="text-slate-400 text-[11px]">
                    Importez et injectez le fichier de configuration directement dans votre code d'initialisation Firebase :
                  </p>
                  <pre className="bg-slate-900 p-2.5 rounded text-[10px] font-mono text-slate-350 overflow-auto">
{`import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import pwaConfig from "./firebase-applet-config.json";

const app = initializeApp(pwaConfig);
// Initialisation résolue avec l'ID de database personnalisé !
const db = getFirestore(app, pwaConfig.firestoreDatabaseId);`}
                  </pre>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Cette architecture permet à votre PWA de communiquer directement avec la même base Firestore que l'Engine IA sans aucune friction ni configuration tierce.
                  </p>
                </div>

              </div>

            </div>
          )}
        </div>

        {/* SECTION 6: INTERACTIVE GEMINI IMAGE GENERATION & INPAINTING PLAYGROUND */}
        <div className="bg-slate-900/40 border border-slate-900 rounded-xl overflow-hidden transition-all duration-200">
          <button
            onClick={() => setIsSec6Expanded(!isSec6Expanded)}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-900/20 transition-colors cursor-pointer"
            id="btn-toggle-sec6"
          >
            <div className="flex items-center gap-2">
              <Sparkles className={`w-4.5 h-4.5 transition-colors duration-200 ${isSec6Expanded ? "text-emerald-400" : "text-slate-400"}`} />
              <div>
                <h2 className="text-sm font-display font-semibold text-slate-200 flex items-center gap-1.5">
                  6. Playground de l'API Gemini Multimodale (Génération d'Image & Inpainting)
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Configurez le prompt, l'image de référence et découvrez la tarification exacte en temps réel
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isSec6Expanded && (
                <span className="hidden sm:inline bg-slate-950/60 border border-slate-850 text-slate-400 px-2 py-0.5 rounded text-[10px] font-mono">
                  Modèle : {geminiModel.replace("-image", "")} | Mode : {coordinatePromptMode.replace("_", " ")}
                </span>
              )}
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isSec6Expanded ? "rotate-180 text-emerald-400" : ""}`} />
            </div>
          </button>

          {isSec6Expanded && (
            <div className="p-5 border-t border-slate-900/40 space-y-6">
              
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* COLUMN LEFT: IMPOSED VARIABLES DICTIONARY & USER ISOLATED STORAGE */}
                <div className="lg:col-span-7 bg-slate-950/40 border border-slate-900 p-4.5 rounded-lg space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
                    <div className="flex items-center gap-1.5">
                      <Sliders className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
                        « CLÉS DE CONFIGURATION : »
                      </h3>
                    </div>
                  </div>

                  {/* IA CATEGORY GRID */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    
                    {/* Divider for IA Category */}
                    <div className="border-b border-slate-900 pb-2 md:col-span-2 flex items-center justify-between">
                      <span className="text-[11px] font-mono font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-amber-500" />
                        « CATÉGORIE : IA »
                      </span>
                      <span className="text-[9px] font-mono bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 font-bold">
                        ÉDITABLE • EFFET EN TEMPS RÉEL
                      </span>
                    </div>

                    {/* Master Composition / Style Ambiance Prompt */}
                    <div className="bg-slate-950/20 border border-slate-900/60 p-3.5 rounded-lg flex flex-col justify-between space-y-2 md:col-span-2 opacity-95">
                      <div className="flex justify-between items-center border-b border-slate-900/40 pb-1.5">
                        <span className="text-[10px] font-mono text-emerald-400 font-bold block uppercase flex items-center gap-1">
                          ✍️ « PROMPT STYLE »
                        </span>
                        <span className="text-[8px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded font-bold">ACTIF ET ÉDITABLE</span>
                      </div>
                      <textarea
                        value={geminiPrompt}
                        onChange={(e) => setGeminiPrompt(e.target.value)}
                        rows={2}
                        className="w-full bg-slate-950/60 border border-slate-900 text-slate-200 rounded px-2.5 py-2 text-xs leading-relaxed outline-none font-sans focus:border-emerald-500 selection:bg-slate-800"
                        placeholder="Ex: Dans une ruelle mouillée scintillante de néons style Cyberpunk, ambiance nocturne photoréaliste de haut standing, reflets réalistes, éclairage volumétrique haut-de-gamme..."
                      />
                      <span className="text-[8px] text-slate-500 font-mono italic leading-none block">
                        Fournit le style visuel et le décor d'ambiance additionnel ciblé par l'IA.
                      </span>
                    </div>

                    {/* Imposed Slogan/Text Content info */}
                    <div className="bg-slate-950/20 border border-slate-900/60 p-3.5 rounded-lg flex flex-col justify-between space-y-3 opacity-90 md:col-span-2">
                      <div className="flex justify-between items-center border-b border-slate-900/40 pb-1.5">
                        <span className="text-[10px] font-mono text-emerald-400 font-bold block uppercase flex items-center gap-1">
                          <span className="text-amber-500">🔒</span> « TEXTE SAISI (SLOGAN) »
                        </span>
                        <span className="text-[8px] font-mono text-slate-500 font-bold">VALEUR Saisie</span>
                      </div>
                      <div className="space-y-1">
                        <div className="bg-slate-950/60 p-2.5 rounded border border-slate-900 text-[11px] text-slate-300 italic font-mono truncate">
                          "{sloganText || "Aucun slogan rédigé"}"
                        </div>
                        <span className="text-[8px] text-slate-550 font-mono italic leading-none block">
                          Slogan synchronisé de la Section 2
                        </span>
                      </div>
                    </div>

                    {/* Logo Prompt (Editable) */}
                    <div className="bg-slate-950/20 border border-slate-900/60 p-3.5 rounded-lg flex flex-col justify-between space-y-3 opacity-90">
                      <div className="flex justify-between items-center border-b border-slate-900/40 pb-1.5">
                        <span className="text-[10px] font-mono text-pink-400 font-bold block uppercase flex items-center gap-1">
                          ✍️ « LOGOPROMPT »
                        </span>
                        <span className={`text-[8px] font-mono px-1.5 py-0.2 rounded ${logoPromptActive ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/30' : 'bg-slate-900 text-slate-500'}`}>
                          {logoPromptActive ? 'ACTIF VIA PRESETS' : 'ÉDITION DIRECTE'}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={logoPrompt}
                          onChange={(e) => {
                            setLogoPrompt(e.target.value);
                            setLogoPromptActive(true);
                          }}
                          className="w-full bg-slate-950/60 border border-slate-900 text-slate-200 rounded px-2.5 py-1.5 text-xs outline-none font-sans focus:border-emerald-500 selection:bg-slate-800"
                          placeholder="Aucun prompt de logo spécifié"
                        />
                        <span className="text-[8px] text-slate-550 font-mono italic leading-none block">
                          Définit l'instruction de fusion pour le logo.
                        </span>
                      </div>
                    </div>

                    {/* Text Prompt (Editable) */}
                    <div className="bg-slate-950/20 border border-slate-900/60 p-3.5 rounded-lg flex flex-col justify-between space-y-3 opacity-90">
                      <div className="flex justify-between items-center border-b border-slate-900/40 pb-1.5">
                        <span className="text-[10px] font-mono text-violet-400 font-bold block uppercase flex items-center gap-1">
                          ✍️ « TEXTPROMPT »
                        </span>
                        <span className={`text-[8px] font-mono px-1.5 py-0.2 rounded ${textPromptActive ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/30' : 'bg-slate-900 text-slate-500'}`}>
                          {textPromptActive ? 'ACTIF VIA PRESETS' : 'ÉDITION DIRECTE'}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={textPrompt}
                          onChange={(e) => {
                            setTextPrompt(e.target.value);
                            setTextPromptActive(true);
                          }}
                          className="w-full bg-slate-950/60 border border-slate-900 text-slate-200 rounded px-2.5 py-1.5 text-xs outline-none font-sans focus:border-emerald-500 selection:bg-slate-800"
                          placeholder="Aucun prompt de texte spécifié"
                        />
                        <span className="text-[8px] text-slate-550 font-mono italic leading-none block">
                          Définit l'instruction d'intégration du texte.
                        </span>
                      </div>
                    </div>

                    {/* Unified Instruction (Editable) */}
                    <div className="bg-slate-950/20 border border-slate-900/60 p-3.5 rounded-lg flex flex-col justify-between space-y-2 md:col-span-2 opacity-90">
                      <div className="flex justify-between items-center border-b border-slate-900/40 pb-1.5">
                        <span className="text-[10px] font-mono text-emerald-400 font-bold block uppercase flex items-center gap-1">
                          ✍️ « PROMPT GENERAL »
                        </span>
                        <span className="text-[8px] font-mono text-slate-400">ÉDITABLE • FIRESTORE SYNCED</span>
                      </div>
                      <textarea
                        value={geminiUnifiedInstruction}
                        onChange={(e) => setGeminiUnifiedInstruction(e.target.value)}
                        rows={3}
                        className="w-full bg-slate-950/60 border border-slate-900 text-slate-200 rounded px-2.5 py-2 text-xs leading-relaxed outline-none font-sans focus:border-emerald-500 selection:bg-slate-800"
                        placeholder="Consigne générale de liaison..."
                      />
                      <span className="text-[8px] text-slate-550 font-mono italic leading-none block">
                        Définit la règle de liaison unifiée globale.
                      </span>
                    </div>

                  </div>

                  {/* SELECTABLE RUN CONFIGURATIONS: MODEL, ASPECT RATIO, IMAGE SIZE, GEOMETRY GUIDANCE */}
                  <div className="bg-slate-950/80 border border-slate-900 p-4 rounded-lg grid grid-cols-1 sm:grid-cols-4 gap-3.5 mt-2">
                    
                    {/* Selectable Model */}
                    <div className="flex flex-col justify-between">
                      <span className="text-[10px] font-mono text-emerald-400 font-bold block mb-1 uppercase">
                        « MODEL »
                      </span>
                      <select
                        value={geminiModel}
                        onChange={(e) => setGeminiModel(e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-slate-300 rounded px-2.5 py-1 text-xs font-mono outline-none focus:border-emerald-500 w-full cursor-pointer h-8"
                      >
                       <option value="gemini-2.5-flash-image">gemini-2.5-flash-image (Image)</option>
                       <option value="gemini-3.1-flash-image">gemini-3.1-flash-image (Image avancé)</option>
                       <option value="gemini-3-pro-image">gemini-3-pro-image (Qualité maximale)</option>
                      </select>
                    </div>

                    {/* Selectable Aspect Ratio */}
                    <div className="flex flex-col justify-between">
                      <span className="text-[10px] font-mono text-emerald-400 font-bold block mb-1 uppercase">
                        « ASPECTRATIO »
                      </span>
                      <select
                        value={geminiAspectRatio}
                        onChange={(e) => setGeminiAspectRatio(e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-slate-300 rounded px-2.5 py-1 text-xs font-mono outline-none focus:border-emerald-500 w-full cursor-pointer h-8"
                      >
                        <option value="4/3">4/3</option>
                        <option value="16:9">16:9</option>
                        <option value="1:1">1:1</option>
                        <option value="9:16">9:16</option>
                      </select>
                    </div>

                    {/* Imposed Image Size */}
                    <div className="flex flex-col justify-between">
                      <span className="text-[10px] font-mono text-emerald-400 font-bold block mb-1 uppercase">
                        « IMAGE SIZE »
                      </span>
                      <select
                        value={geminiImageSize}
                        onChange={(e) => setGeminiImageSize(e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-slate-300 rounded px-2.5 py-1 text-xs font-mono outline-none focus:border-emerald-500 w-full cursor-pointer h-8"
                      >
                        <option value="1K">1K</option>
                        <option value="2K">2K</option>
                        <option value="4K">4K</option>
                      </select>
                    </div>

                    {/* Coordinate Prompt Mode */}
                    <div className="flex flex-col justify-between">
                      <span className="text-[10px] font-mono text-emerald-400 font-bold block mb-1 uppercase">
                        « COORDINATE PROMPT MODE »
                      </span>
                      <div className="flex gap-1 h-8 bg-slate-900 border border-slate-800 rounded p-0.5">
                        <button
                          type="button"
                          onClick={() => setCoordinatePromptMode("COORD_LONG")}
                          className={`flex-1 px-1 rounded text-[9px] font-mono font-bold transition-colors cursor-pointer ${
                            coordinatePromptMode === "COORD_LONG"
                              ? "bg-emerald-500 text-slate-950"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          COORD LONG
                        </button>
                        <button
                          type="button"
                          onClick={() => setCoordinatePromptMode("COORD_LIGHT")}
                          className={`flex-1 px-1 rounded text-[9px] font-mono font-bold transition-colors cursor-pointer ${
                            coordinatePromptMode === "COORD_LIGHT"
                              ? "bg-emerald-500 text-slate-950"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          COORD LIGHT
                        </button>
                      </div>
                    </div>

                  </div>

                  {/* USER INTERACTIVE GEN RUN ACTION */}
                  <div className="pt-1.5">
                    <button
                      onClick={triggerGeminiGeneration}
                      disabled={geminiIsLoading}
                      className={`w-full py-3 px-4 font-mono font-bold text-xs uppercase tracking-wider rounded-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
                        geminiIsLoading
                          ? "bg-slate-850 text-slate-500 border border-slate-800 cursor-not-allowed"
                          : "bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-md shadow-emerald-950/20 active:translate-y-0.5"
                      }`}
                      id="btn-run-gemini"
                    >
                      {geminiIsLoading ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-slate-600 border-t-emerald-400 rounded-full animate-spin"></span>
                          <span>Génération en cours...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-slate-950" />
                          <span>Lancer la génération</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* SECTION USER GENERATIONS STORAGE DIRECTORY */}
                  <div className="border-t border-slate-900 pt-4.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <FolderSync className="w-4 h-4 text-blue-400" />
                        <div>
                          <h4 className="text-[11px] font-mono font-bold text-slate-200 uppercase tracking-tight">
                            Espace de Stockage Utilisateur : `users/{userId}/homescreens/`
                          </h4>
                          <p className="text-[9.5px] text-slate-550 font-sans">
                            Vos fichiers réels stockés dans le bucket `{firebaseStorageBucket}`
                          </p>
                        </div>
                      </div>
                      
                      {/* RESET BUTTON */}
                      {userHistoryItems.length > 0 && (
                        <button
                          onClick={resetUserHistory}
                          className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-slate-950 hover:font-bold rounded text-[10px] font-mono transition cursor-pointer border border-rose-500/20"
                          id="btn-reset-user-folder"
                        >
                          🗑️ Réinitialiser ce Dossier ID
                        </button>
                      )}
                    </div>

                    {userHistoryItems.length === 0 ? (
                      <div className="border border-dashed border-slate-900 rounded p-4 text-center text-[10.5px] text-slate-500 italic bg-slate-950/20 font-sans">
                        Aucun fichier stocké pour la session '{userId}' pour le moment.<br/>
                        Cliquez sur "Simuler" ci-dessus pour téléverser votre premier rendu.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[190px] overflow-auto pr-1">
                        {userHistoryItems.map((item, idx) => (
                          <div key={item.id || idx} className="bg-slate-950 border border-slate-850 p-2 rounded-lg flex items-center justify-between gap-3 font-mono text-[9.5px]">
                            <img
                              src={item.imageUrl}
                              alt="Stored composition"
                              className="w-10 h-10 rounded border border-slate-800 object-cover shrink-0 cursor-pointer hover:opacity-85"
                              onClick={() => {
                                setLightboxUrl(item.imageUrl);
                                setLightboxTitle(`Visualisation Storage HD (${item.aspectRatio})`);
                              }}
                            />
                            <div className="flex-1 truncate space-y-0.5">
                              <div className="text-slate-300 font-bold flex items-center gap-1">
                                <span className="bg-slate-900 px-1 py-0.5 rounded text-[8px] text-slate-400 select-none">FILE Path</span>
                                <span className="truncate text-blue-400">{item.storagePath}</span>
                              </div>
                              <div className="text-slate-500 text-[8.5px] flex items-center gap-2">
                                <span>Rendu: {item.aspectRatio} | ID: {item.id}</span>
                                <span className="text-emerald-400/90 font-bold">{item.costEuros.toFixed(5)} €</span>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(item.storagePath);
                                  alert(`Chemin copié avec succès ! \n\n${item.storagePath}`);
                                }}
                                className="p-1.5 bg-slate-900 hover:bg-slate-800 rounded border border-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
                                title="Copier le chemin de stockage"
                              >
                                📋
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>

                {/* COLUMN RIGHT: INTERACTIVE CALCULATOR BILLING & STREAMS TERMINAL */}
                <div className="lg:col-span-5 flex flex-col gap-4">
                  
                  {/* REAL-TIME TOKEN CALCULATOR & EUR COST */}
                  <div className="bg-slate-950/90 border border-slate-900 rounded-lg p-4 space-y-3.5">
                    <div className="flex items-center justify-between border-b border-slate-900 pb-1.5">
                      <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Coins className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                        Calculateur de Tokens & Rapports Financiers
                      </span>
                      <span className="text-[9px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold">
                        TRILOGIE LIVE
                      </span>
                    </div>

                    <div className="space-y-2 font-mono text-[11px] leading-relaxed">
                      
                      {/* Prompt Tokens row */}
                      <div className="flex justify-between items-center text-slate-400">
                        <span>Tokens Slogan Utilisateur :</span>
                        <span className="text-slate-350 font-semibold font-mono">
                          {(sloganText || "").length} tokens
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-slate-400">
                        <span>Tokens Contexte Unifié Édité :</span>
                        <span className="text-slate-350 font-semibold font-mono">
                          {geminiUnifiedInstruction.length} tokens
                        </span>
                      </div>

                      <div className="text-[9px] text-slate-600 -mt-1 block">
                        (Règle de calcul : 1 token par caractère pour les invites textuelles)
                      </div>

                      {/* Image A row */}
                      <div className="flex justify-between items-center text-slate-400 mt-2 border-t border-slate-900/40 pt-1.5">
                        <span>Tokens Vision IMAGE_A (Fond Décor HD) :</span>
                        <span className="text-blue-400 font-semibold font-mono">
                          258 tokens
                        </span>
                      </div>

                      {/* Image B row */}
                      <div className="flex justify-between items-center text-slate-400">
                        <span>Tokens Vision IMAGE_B (Véhicule détouré) :</span>
                        <span className="text-blue-400 font-semibold font-mono">
                          258 tokens
                        </span>
                      </div>

                      {/* Image C row */}
                      <div className="flex justify-between items-center text-slate-400 pb-1">
                        <span>Tokens Vision IMAGE_C (Guide de layout) :</span>
                        <span className="text-blue-400 font-semibold font-mono">
                          258 tokens
                        </span>
                      </div>
                      <div className="text-[9px] text-slate-600 -mt-1 block mb-2 font-sans leading-snug">
                      (Règle Gemini Vision : estimation de 258 tokens par image de référence)
                      </div>

                      {/* Total Token Sum */}
                      <div className="flex justify-between items-center bg-slate-900/50 p-2 rounded border border-slate-900 text-slate-200 font-bold font-mono">
                        <span>Total Tokens d'entrée :</span>
                        <span className="text-emerald-400 font-bold">
                          {((sloganText || "").length + geminiUnifiedInstruction.length) + 774} tokens
                        </span>
                      </div>

                      {/* Financial billing panel */}
                      <div className="bg-emerald-950/10 border border-emerald-900/30 p-2.5 rounded-lg mt-1 text-center font-mono">
                        <div className="text-[10px] text-emerald-400/90 font-bold uppercase tracking-wide">
                          COÛT ESTIMÉ POUR L'IMAGE
                        </div>
                        <div className="text-lg font-extrabold text-emerald-300 tracking-tight my-0.5 font-mono">
                        {geminiMetrics.costEuros.toFixed(5)} €
                        </div>
                        <div className="text-[9.5px] text-slate-450 leading-normal font-sans">
                         Estimation du coût de génération Gemini calculée à partir des images de référence (A, B et C) et des tokens d'entrée. Les tarifs réels dépendent du modèle utilisé.
                      </div>
                      </div>

                    </div>
                  </div>

                  {/* STREAMS LOGS TERMINAL & RESULT */}
                  <div className="bg-slate-950 border border-slate-900 rounded-lg overflow-hidden flex-1 flex flex-col min-h-[300px]">
                    <div className="bg-slate-900/80 px-3 py-1.5 border-b border-slate-850 flex justify-between items-center text-[10.5px] font-mono text-slate-300 font-bold">
                      <span className="flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                        Sortie de l'API & Événements (Terminal)
                      </span>
                      {geminiIsLoading && (
                        <span className="text-[9.5px] text-amber-400 font-normal animate-pulse font-mono">
                          Traitement...
                        </span>
                      )}
                    </div>

                    <div className="p-4 flex-1 flex flex-col gap-3.5 overflow-auto max-h-[360px] bg-slate-950/60 font-mono text-[10px]">
                      
                      {/* Logs stream list */}
                      <div className="space-y-1.5 border-b border-slate-900 pb-3 flex-1 font-mono">
                        {geminiLogs.length === 0 ? (
                          <div className="text-slate-500 italic text-center py-4 text-[11px] font-sans">
                            Console d'Inpainting en attente...<br/>
                            Sélectionnez vos détails de composition et cliquez sur "Lancer la génération".
                          </div>
                        ) : (
                          geminiLogs.map((log, lIdx) => {
                            let textClass = "text-slate-400";
                            if (log.includes("[SYS-ERR]") || log.includes("[API-ERROR]") || log.includes("[ERR-STRICT]")) textClass = "text-rose-450 font-bold";
                            else if (log.includes("[SUCCESS]") || log.includes("✔️") || log.includes("[API-RESPONSE]")) textClass = "text-emerald-400 font-semibold";
                            else if (log.includes("[CALCULATOR]") || log.includes("[FINANCIAL]")) textClass = "text-amber-400 font-bold";
                            else if (log.includes("[DOWNLOAD]")) textClass = "text-sky-350";
                            else if (log.includes("[API-CALL]")) textClass = "text-emerald-500 animate-pulse font-bold";
                            else if (log.includes("[SYSTEM]")) textClass = "text-slate-200 font-semibold";
                            return (
                              <div key={lIdx} className={`leading-normal border-l border-slate-800 pl-2 font-mono ${textClass}`}>
                                {log}
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Display generated frame */}
                      <div className="mt-1">
                        <span className="text-[9px] text-slate-550 block mb-1 uppercase font-bold tracking-wider font-mono">
                          Résultat du Rendu IA Final
                        </span>
                        {geminiResultUrl ? (
                          <div className="border border-slate-800 rounded p-1.5 bg-slate-950 flex flex-col items-center gap-2">
                            <img
                              src={geminiResultUrl}
                              alt="Generated composited output"
                              className="max-h-52 max-w-full rounded object-contain shadow shadow-emerald-950/20 cursor-pointer hover:opacity-90 duration-150"
                              referrerPolicy="no-referrer"
                              onClick={() => {
                                setLightboxUrl(geminiResultUrl);
                                setLightboxTitle(`Rendu API IA Composed (${geminiAspectRatio})`);
                              }}
                            />
                            <div className="flex gap-2 w-full font-mono text-[10px]">
                              <button
                                onClick={() => {
                                  setLightboxUrl(geminiResultUrl);
                                  setLightboxTitle(`Rendu API IA Composed (${geminiAspectRatio})`);
                                }}
                                className="flex-1 py-1 px-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-350 font-bold rounded cursor-pointer text-center"
                                id="btn-zoom-result"
                              >
                                Zoomer 🔍
                              </button>
                              <button
                                onClick={() => {
                                  // Update imageC with generated composition to close the loop!
                                  setImageC(geminiResultUrl);
                                  alert("L'image générée a été ré-injectée comme image de référence (imageC) ! Le cycle de composition est bouclé.");
                                }}
                                className="flex-1 py-1 & px-2 bg-emerald-950/20 border border-emerald-900/40 hover:bg-emerald-900/30 text-emerald-300 font-bold rounded cursor-pointer text-center"
                                id="btn-inject-c"
                              >
                                Réinjecter imageC ♻&nbsp;Reboucler
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="border border-dashed border-slate-900 rounded h-28 flex flex-col items-center justify-center text-slate-650 bg-slate-950/10 italic text-[11px] font-sans">
                            {geminiIsLoading ? (
                              <div className="flex flex-col items-center gap-2">
                                <span className="w-5 h-5 border-2 border-slate-800 border-t-emerald-400 rounded-full animate-spin"></span>
                                <span>Calcul spatial de l'Inpaint...</span>
                              </div>
                            ) : (
                              "Aucune image générée pour le moment."
                            )}
                          </div>
                        )}
                      </div>

                    </div>
                  </div>

                </div>

              </div>



            </div>
          )}
        </div>

      </section>

      {/* LIGHTBOX MODAL */}
      {lightboxUrl && (
        <div 
          className="fixed inset-0 bg-slate-950/90 z-[100] flex items-center justify-center p-4 backdrop-blur-md animate-fade-in"
          onClick={() => setLightboxUrl(null)}
          id="lightbox-overlay"
        >
          <div 
            className="bg-slate-900 border border-slate-800 rounded-xl max-w-4xl w-full overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-950 px-4 py-3 border-b border-slate-850 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-xs font-mono font-bold text-slate-300">
                  {lightboxTitle || "Visualisation du Canal d'Image"}
                </span>
              </div>
              <button 
                onClick={() => setLightboxUrl(null)}
                className="p-1 hover:bg-slate-900 rounded text-slate-400 hover:text-slate-100 transition font-bold font-mono text-sm cursor-pointer"
                title="Fermer"
              >
                ✕
              </button>
            </div>
            
            <div className="p-4 bg-[radial-gradient(#334155_1.2px,transparent_1.2px)] [background-size:12px_12px] bg-slate-950 flex flex-col items-center justify-center min-h-[300px] max-h-[60vh] overflow-hidden">
              <img 
                src={lightboxUrl} 
                alt="Source zoomée" 
                className="max-h-full max-w-full object-contain rounded shadow-lg drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)]"
              />
            </div>

            <div className="bg-slate-950 p-4 border-t border-slate-850 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>ADRESSE LIEN DE L'ASSET (COPIABLE) :</span>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(lightboxUrl);
                    alert("URL copiée !");
                  }}
                  className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 rounded border border-slate-800 text-emerald-400 cursor-pointer text-[10px]"
                >
                  Copier l'adresse
                </button>
              </div>
              <input 
                type="text" 
                value={lightboxUrl} 
                readOnly 
                className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-blue-400 font-mono select-all outline-none" 
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
