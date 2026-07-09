// Central defaults for the Firebase project and the demo assets.
// Everything here is public client-side configuration (a Firebase web apiKey
// is not a secret — access control lives in the Firestore/Storage rules);
// the real secrets (GEMINI_API_KEY, API_SHARED_SECRET) stay server-side.

export const FIREBASE_DEFAULTS = {
  projectId: "gen-lang-client-0870404092",
  appId: "1:172885729212:web:ab072eb63a25c3af0c95b9",
  apiKey: "AIzaSyBVF5JPs_yXKRlrQUK3NlAm97cDntLEz9o",
  authDomain: "gen-lang-client-0870404092.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-20bb72b2-2c7c-4bdc-967b-ecd3e4f27e13",
  storageBucket: "gen-lang-client-0870404092.firebasestorage.app",
  messagingSenderId: "172885729212",
} as const;

// Second database hosting the global 'Entries' presets collection
export const GLOBAL_ENTRIES_DATABASE_ID = "ai-studio-161890da-59e3-4b8c-988c-4938de8d8e21";

export const DEFAULT_BUCKET_GS = `gs://${FIREBASE_DEFAULTS.storageBucket}`;

const STORAGE_BASE = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_DEFAULTS.storageBucket}/o`;

// Demo/fallback assets used across the control panel
export const DEFAULT_IMAGE_A = `${STORAGE_BASE}/backgrounds%2Fdesert_road_hd.jpg?alt=media`;
export const DEFAULT_IMAGE_B = `${STORAGE_BASE}/vehicles%2Fporsche_taycan_detoure.png?alt=media`;
export const DEFAULT_IMAGE_C = `${STORAGE_BASE}/compositions%2Freference_comp_075.jpg?alt=media`;
export const DEFAULT_LOGO = `${STORAGE_BASE}/LOGOS%2Fapex_brand_white.png?alt=media`;
