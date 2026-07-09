<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/8fb3bd91-cee8-46c0-a2c1-ba6f3f5df7aa

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## ⚠️ Règles Firebase — source de vérité

Ce projet partage son projet Firebase (Firestore + Storage) avec la PWA
[CAR-IA](https://github.com/I-love-my-designer/CAR-IA).

Les fichiers `firestore.rules` et `storage.rules` sont **unifiés et identiques dans les deux dépôts**,
et **ce dépôt est la source de vérité** : c'est d'ici qu'on déploie
(`firebase deploy --only firestore:rules,storage`). Après toute modification, recopiez les fichiers
dans le dépôt CAR-IA pour garder les deux synchronisés. Voir aussi [SECURITY.md](SECURITY.md).
