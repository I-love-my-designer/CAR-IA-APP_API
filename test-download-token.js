import fetch from "node-fetch";

async function getServiceAccountToken() {
  try {
    const res = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-account/default/token", {
      headers: { "Metadata-Flavor": "Google" }
    });
    if (res.ok) {
      const data = await res.json();
      return data.access_token;
    }
  } catch (err) {
    console.log("Metadata server not reachable:", err.message);
  }
  return null;
}

async function testWithToken() {
  const token = await getServiceAccountToken();
  console.log("Token obtained:", token ? "YES (starts with " + token.substring(0, 10) + "...)" : "NO");

  const bucket = "gen-lang-client-0870404092.firebasestorage.app";
  const object = "vehicles%2Fporsche_taycan_detoure.png";
  const url = `https://storage.googleapis.com/download/storage/v1/b/${bucket}/o/${object}?alt=media`;

  const headers = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    console.log(`Fetching GCS API: ${url}`);
    const res = await fetch(url, { headers });
    console.log(`Status: ${res.status} ${res.statusText}`);
    console.log(`Content-Type: ${res.headers.get("content-type")}`);
    const text = await res.text();
    console.log(`Response length: ${text.length} characters`);
    console.log(`Response starts with: ${text.substring(0, 100)}`);
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

testWithToken();
