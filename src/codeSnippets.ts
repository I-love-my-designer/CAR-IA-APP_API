import { FirestoreJobPayload } from "./types";

export function generatePythonSnippet(payload: FirestoreJobPayload, jobId: string = "job_dev_01"): string {
  return `import firebase_admin
from firebase_admin import credentials, firestore

# Initialiser Firebase
if not firebase_admin._apps:
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred)

db = firestore.client()

# Données brutes de la recette de composition
job_data = {
    "imageA": "${payload.imageA}",
    "presetsFond": {
        "logoAutorise": ${payload.presetsFond.logoAutorise ? "True" : "False"},
        "texteAutorise": ${payload.presetsFond.texteAutorise ? "True" : "False"},
        "logoPlaceholderCoords": {
            "x": ${payload.presetsFond.logoPlaceholderCoords.x},
            "y": ${payload.presetsFond.logoPlaceholderCoords.y},
            "w": ${payload.presetsFond.logoPlaceholderCoords.w},
            "h": ${payload.presetsFond.logoPlaceholderCoords.h}
        },
        "texteStylePreset": {
            "font": "${payload.presetsFond.texteStylePreset.font}",
            "color": "${payload.presetsFond.texteStylePreset.color}",
            "size": "${payload.presetsFond.texteStylePreset.size}"
        },
        "logoSize": "${payload.presetsFond.logoSize}",
        "logoColorFill": "${payload.presetsFond.logoColorFill}",
        "logoColorFillEnabled": ${payload.presetsFond.logoColorFillEnabled ? "True" : "False"},
        "logoExtra": "${payload.presetsFond.logoExtra}",
        "textperspective": "${payload.presetsFond.textperspective}",
        "textExtra": "${payload.presetsFond.textExtra}",
        "logoPrompt": "${payload.presetsFond.logoPrompt || 'en béton extrudé'}",
        "logoPromptActive": ${payload.presetsFond.logoPromptActive ? "True" : "False"},
        "textPrompt": "${payload.presetsFond.textPrompt || 'lumineux fluo'}",
        "textPromptActive": ${payload.presetsFond.textPromptActive ? "True" : "False"}
    },
    "imageB": "${payload.imageB}",
    "imageC": "${payload.imageC}",
    "logo": "${payload.logo}",
    "metadataUtilisateur": {
        "texte": "${payload.metadataUtilisateur.texte.replace(/"/g, '\\"')}",
        "transformVehicule": {
            "x": ${payload.metadataUtilisateur.transformVehicule.x},
            "y": ${payload.metadataUtilisateur.transformVehicule.y},
            "scale": ${payload.metadataUtilisateur.transformVehicule.scale},
            "rotation": ${payload.metadataUtilisateur.transformVehicule.rotation}
        },
        "boundingBoxVehicule": {
            "left": ${payload.metadataUtilisateur.boundingBoxVehicule?.left ?? 120},
            "right": ${payload.metadataUtilisateur.boundingBoxVehicule?.right ?? 1480},
            "top": ${payload.metadataUtilisateur.boundingBoxVehicule?.top ?? 210},
            "bottom": ${payload.metadataUtilisateur.boundingBoxVehicule?.bottom ?? 780}
        }
    },
    "status": "ready_to_generate" # Déclencheur du Moteur IA
}

# Publier la tâche sur Firestore
db.collection("exports").document("${jobId}").set(job_data)
print(f"Job ${jobId} envoyé avec succès en statut 'ready_to_generate'.")
`;
}

export function generateNodeSnippet(payload: FirestoreJobPayload, jobId: string = "job_dev_01"): string {
  return `import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialiser l'administration Firestore
initializeApp();
const db = getFirestore();

const jobPayload = ${JSON.stringify(payload, null, 2)};

// Définir la tâche en mode prêt-à-générer (Gatekeeper validé !)
async function triggerIAJob() {
  await db.collection('exports').doc('${jobId}').set({
    ...jobPayload,
    status: 'ready_to_generate',
    updatedAt: new Date().toISOString()
  });
  console.log('✅ Pipeline de synthèse déclenché sur Firestore.');
}

triggerIAJob();
`;
}

export function generateCurlSnippet(payload: FirestoreJobPayload, projectId: string = "my-gcp-project", databaseId: string = "(default)", jobId: string = "job_dev_01"): string {
  const dbId = databaseId || "(default)";
  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/exports/${jobId}`;
  
  // Minimal representation for raw REST API format
  return `curl -X PATCH "${firestoreUrl}?updateMask.fieldPaths=imageA&updateMask.fieldPaths=status&updateMask.fieldPaths=metadataUtilisateur" \\
  -H "Authorization: Bearer \$(gcloud auth print-access-token)" \\
  -H "Content-Type: application/json" \\
  -d '{
    "fields": {
      "imageA": { "stringValue": "${payload.imageA}" },
      "status": { "stringValue": "ready_to_generate" },
      "metadataUtilisateur": {
        "mapValue": {
          "fields": {
            "texte": { "stringValue": "${payload.metadataUtilisateur.texte}" }
          }
        }
      }
    }
  }'
`;
}
