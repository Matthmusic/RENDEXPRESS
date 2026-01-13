# Rendexpress

Rendexpress est une application Electron + React avec backend Python pour :
- générer une arborescence (HTML + texte) prête à coller dans un email,
- préparer des ZIP “propres” via SafeZip (analyse, correction, upload Gofile).

## Fonctionnalités
- Analyse des chemins trop longs Windows et préparation SafeZip.
- Upload Gofile avec lien de téléchargement.
- Copie HTML compatible Outlook + texte.
- Interface sombre, workflow en 3 étapes.

## Prérequis (dev)
- Node.js 18+
- Python 3.x accessible dans le PATH

## Installation & démarrage
```bash
git clone https://github.com/Matthmusic/RENDEXPRESS.git
cd RENDEXPRESS
npm install
npm run electron:dev
```

## Build
```bash
npm run build
npm run build:electron
```

## Release GitHub
Le workflow `.github/workflows/release.yml` se déclenche sur un tag `v*` ou manuellement.
Exemple :
```bash
git tag v0.1.9
git push origin main --tags
```

## Structure
- `src/` : UI React (SafeZip + preview)
- `electron/` : Electron main/preload
- `python_backend/` : génération d’arborescence
