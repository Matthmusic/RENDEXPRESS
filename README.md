# Rendexpress

Générateur d'arborescence de dossiers (HTML + texte) prêt à coller dans un email. UI moderne en Electron + React, logique de génération en Python.

## Fonctionnalités
- Sélection d’un dossier et aperçu immédiat (HTML stylé + version texte).
- Copie presse-papiers HTML (compatible Outlook/Gmail) et texte.
- Thème sombre, logo intégré, toasts d’état.
- Version affichée en UI : `0.0.2`.

## Prérequis
- Node.js 18+ (npm).
- Python 3.x accessible dans le PATH (`python` ou variable `PYTHON`).
- Dépendances Python (installables via `pip install -r python_backend/requirements.txt`).

## Installation & lancement (Electron)
```bash
git clone https://github.com/Matthmusic/RENDEXPRESS.git
cd RENDEXPRESS/electron-react
npm install
npm run electron:dev    # lance Vite + Electron en dev
```

Vérifier Python :
```bash
python --version
# ou définir PYTHON si nécessaire
# set PYTHON=python3   (PowerShell)
```

## Build (renderer)
```bash
cd RENDEXPRESS/electron-react
npm run build
```

## Release GitHub (workflow)
- Le workflow `.github/workflows/release.yml` s’exécute sur un tag `v*` ou via `workflow_dispatch` :
  - npm ci + build du renderer.
  - Installation des dépendances Python (`pip install -r python_backend/requirements.txt`).
  - Archive `rendexpress-dist.tar.gz` (dist + python_backend) en artifact.
  - Publication automatique sur la Release si un tag est poussé.
- Exemple : `git tag v0.0.1 && git push origin main --tags`.

## Structure
- `electron-react/` : app Electron + React (UI principale).
- `electron-react/electron/main.cjs` : fenêtre, IPC, icône, titre.
- `electron-react/src/` : composants React et styles.
- `python_backend/render_tree.py` : génération HTML/texte de l’arborescence.
