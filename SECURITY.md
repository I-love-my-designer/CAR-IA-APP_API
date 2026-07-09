# Sécurité & durcissement

Ce document résume les protections en place et les étapes d'activation.

## Secrets

- `GEMINI_API_KEY` : uniquement côté serveur (variable d'environnement). Jamais exposée au client.
- La config Firebase web (apiKey, projectId…) dans `firebase-applet-config.json` est **publique par conception** — le contrôle d'accès repose sur les règles Firestore/Storage, pas sur cette clé.

## Authentification API (opt-in)

1. Définir `API_SHARED_SECRET` dans l'environnement du serveur (Secrets AI Studio / Cloud Run).
2. Côté panneau de contrôle : `localStorage.setItem("car_ia_api_secret", "<même valeur>")` dans la console du navigateur.
3. Côté PWA : envoyer le header `x-api-key: <même valeur>` sur ses appels API (uploads `/users/*`, `/api/jobs`…).

Tant que `API_SHARED_SECRET` n'est pas défini, l'API reste ouverte (comportement historique) — un avertissement est loggé au démarrage.

Endpoints protégés quand le secret est actif : `/api/gemini/generate`, `/api/gemini/history`, `/api/gemini/reset`, `/api/upload`, `/api/upload-local`, `/api/save-local`, `POST /api/jobs/:id`, uploads `POST|PUT /users/*`.
Endpoints laissés ouverts (lecture seule/peu coûteux) : `GET /api/jobs/:id`, `/api/gemini/health`, `/api/proxy` (restreint aux hôtes Google Storage).

## Rate limiting

Limiteur en mémoire par IP et par route (fenêtre 1 min) : 6/min sur la génération, 10–30/min sur les uploads et resets, 60–120/min sur les lectures. Répond `429` avec header `Retry-After`.

## Règles Firestore (`firestore.rules`)

- `exports` : lecture publique, écritures validées par `isValidExportJob` (schéma + enum de statuts + 40 clés max).
- `prompts_ia` : lecture publique, écritures bornées (30 clés max).
- `entries` / `Entries` : la règle `delete` corrigée — une entrée appartenant à un utilisateur (`userId`) n'est supprimable que par son propriétaire ; les entrées anonymes restent supprimables (flux sans authentification de la PWA).

Déploiement : `firebase deploy --only firestore:rules,storage`
⚠️ Testez d'abord le parcours PWA complet (création de job) : si la PWA crée des documents `exports` avec des champs/statuts hors schéma, assouplissez `isValidExportJob` en conséquence.

## Règles Storage (`storage.rules`, nouveau)

Lecture publique, écriture client interdite sauf `users/**` (images < 20 Mo). Le serveur écrit via son Service Account (non soumis aux règles) : la génération n'est pas impactée.

## Orchestration serveur (opt-in)

`SERVER_ORCHESTRATION=true` fait traiter les jobs `exports` (statuts `pending`/`ready_to_generate`) par le serveur lui-même : plus besoin d'un onglet navigateur ouvert. Réclamation atomique par précondition `updateTime` (pas de double traitement entre instances).
⚠️ Ne pas activer en même temps que le déclenchement automatique du panneau, sinon les jobs seraient générés deux fois (double coût Gemini).

## Autres protections serveur

- `/api/proxy` restreint à `firebasestorage.googleapis.com` / `storage.googleapis.com` (anti-SSRF).
- Lectures de fichiers locaux confinées au répertoire du projet (anti path traversal).
- Tokens de téléchargement Firebase générés via `crypto.randomUUID()`.
- Stores en mémoire plafonnés (200 jobs, 500 entrées d'historique) ; historique persisté dans la collection Firestore `generations_history` quand le Service Account est disponible.
