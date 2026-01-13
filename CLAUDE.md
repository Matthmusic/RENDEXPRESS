# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rendexpress is an Electron + React + Python application for preparing and packaging large render outputs for email distribution. It generates formatted directory trees (HTML + text) and creates "safe" ZIP archives that avoid Windows long path issues, with integrated Gofile upload support.

**Key Features:**
- Directory tree generation (HTML for Outlook, plain text)
- SafeZip: Analyzes and packages folders to avoid Windows 260-character path limits
- Gofile integration for cloud file sharing
- Auto-update support via electron-updater
- Custom frameless window with custom titlebar

## Development Commands

### Setup
```bash
npm install
```

### Development
```bash
npm run electron:dev    # Run app with hot reload (starts Vite dev server + Electron)
npm run dev            # Start Vite dev server only (for testing React UI in browser)
npm run electron       # Start Electron only (requires dev server running)
```

### Building
```bash
npm run build                # Build React app with TypeScript + Vite
npm run build:electron       # Build React app + package Electron installer (.exe)
```

### Linting
```bash
npm run lint
```

### Release Process
The app uses GitHub Actions for releases. To create a new release:
```bash
git tag v0.1.X
git push origin main --tags
```
This triggers the `.github/workflows/release.yml` workflow which builds the Windows installer and creates a GitHub release.

## Architecture

### Tech Stack
- **Frontend:** React 19 + TypeScript + Vite
- **Desktop:** Electron 39 with custom frameless window
- **Backend:** Python 3.x for tree generation (spawned as subprocess)
- **Packaging:** electron-builder with NSIS installer
- **Auto-updates:** electron-updater with GitHub releases

### Three-Layer IPC Architecture

The app follows Electron's recommended security model with strict context isolation:

```
┌─────────────────────────────────────────────────────────────┐
│  Renderer Process (React/TypeScript)                        │
│  - src/App.tsx: Main app shell, updates, tree generator UI  │
│  - src/SafeZip.tsx: SafeZip workflow component              │
│  - Uses window.api.* (exposed via contextBridge)            │
└────────────────────────┬────────────────────────────────────┘
                         │ IPC invoke/send
┌────────────────────────▼────────────────────────────────────┐
│  Preload Script (electron/preload.cjs)                      │
│  - contextBridge.exposeInMainWorld('api', {...})            │
│  - Bridges renderer ↔ main process (security boundary)      │
│  - Handles IPC event listeners + cleanup                    │
└────────────────────────┬────────────────────────────────────┘
                         │ ipcRenderer.invoke
┌────────────────────────▼────────────────────────────────────┐
│  Main Process (electron/main.cjs)                           │
│  - ipcMain.handle() for all IPC endpoints                   │
│  - Spawns Python subprocess for tree generation             │
│  - Delegates to specialized handlers:                       │
│    • safezip-handler.cjs: SafeZip operations                │
│    • gofile-handler.cjs: Gofile upload                      │
│  - Manages window lifecycle, auto-updates, menus            │
└─────────────────────────────────────────────────────────────┘
```

**Security Notes:**
- `contextIsolation: true` (renderer cannot access Node.js/Electron APIs directly)
- `nodeIntegration: false` (no Node.js in renderer)
- All filesystem/system operations go through Main process via IPC

### Python Backend Integration

**Location:** `python_backend/render_tree.py`

The Python script generates formatted directory trees:
- Spawned as subprocess via `cross-spawn`
- Receives `--path` and `--format json` arguments
- Returns JSON with `{html: string, text: string}`
- UTF-8 encoded output (handles international characters)

**Bundling Strategy:**
- Development: Uses system Python (or `python_runtime/python.exe` if present)
- Production: Embeds `python_runtime/python.exe` + dependencies via `extraResources`
- Note: `asar: false` in package.json to allow Python runtime access

### SafeZip Architecture

SafeZip solves Windows long path issues when sharing large render folders:

**Problem:** Windows has a 260-character path limit that causes extraction failures.

**Solution:**
1. Analyze source folder for path lengths
2. Copy to staging directory with short path: `%APPDATA%/rendexpress/staging/YYMMDD_FolderName/`
3. Create ZIP with "Smart Root" strategy (shortest internal paths)
4. Show risk indicator (OK/Warning/Danger) based on internal path analysis
5. Allow save to final destination

**Key Files:**
- `electron/safezip-handler.cjs`: Core logic (500+ lines)
- `src/SafeZip.tsx`: UI component with drag-drop, progress bars
- `src/types/safezip.d.ts`: TypeScript definitions

**Job Management:**
- Staging directory: `app.getPath('userData')/staging/`
- Automatic cleanup: Keeps 3 most recent jobs
- Jobs tracked with `job.json` metadata files

### Gofile Integration

Uploads ZIP files to gofile.io for sharing:
- `electron/gofile-handler.cjs`: Upload logic with progress tracking
- Fetches best server from Gofile API
- Sends multipart/form-data upload with progress events
- Returns download link

### Type System

**Global Window API:** `src/global.d.ts` extends `Window` interface with the `window.api` object exposed by preload script.

**Important:** When adding new IPC handlers:
1. Add handler in `electron/main.cjs`
2. Expose method in `electron/preload.cjs`
3. Add TypeScript definition in `src/global.d.ts`

### Styling

Single CSS file: `src/App.css` contains all styles including:
- Custom window titlebar
- Tree generator interface
- SafeZip UI (250+ lines of styles)
- Dark theme with blue/orange accent colors
- Animated background grid + glow effects

## File Structure

```
rendexpress/
├── electron/                    # Main process
│   ├── main.cjs                 # Main entry, IPC handlers, window management
│   ├── preload.cjs              # Context bridge security layer
│   ├── safezip-handler.cjs      # SafeZip business logic
│   ├── gofile-handler.cjs       # Gofile upload logic
│   └── rendexpress.ico          # App icon
├── python_backend/              # Python subprocess
│   ├── render_tree.py           # Tree generation script
│   └── requirements.txt         # Python dependencies
├── python_runtime/              # Embedded Python (production only)
│   └── python.exe               # Standalone Python
├── src/                         # Renderer process (React)
│   ├── main.tsx                 # React entry point
│   ├── App.tsx                  # Main app component
│   ├── SafeZip.tsx              # SafeZip workflow component
│   ├── App.css                  # All styles
│   ├── global.d.ts              # Window API types
│   └── types/                   # TypeScript type definitions
│       ├── safezip.d.ts
│       ├── gofile.ts
│       └── bitly.d.ts
├── .github/workflows/
│   └── release.yml              # GitHub Actions release workflow
├── package.json                 # Dependencies, scripts, electron-builder config
├── vite.config.ts               # Vite configuration
└── SAFEZIP-IMPLEMENTATION.md    # Detailed SafeZip documentation
```

## Important Patterns

### Adding a New IPC Handler

Example: Adding a new feature called "exportPDF"

1. **Main Process** (`electron/main.cjs`):
```javascript
ipcMain.handle('export-pdf', async (_event, data) => {
  try {
    // Your logic here
    return { success: true, result: data }
  } catch (err) {
    return { success: false, error: err.message }
  }
})
```

2. **Preload** (`electron/preload.cjs`):
```javascript
contextBridge.exposeInMainWorld('api', {
  // ... existing methods
  exportPdf: (data) => ipcRenderer.invoke('export-pdf', data),
})
```

3. **Types** (`src/global.d.ts`):
```typescript
interface Window {
  api: {
    // ... existing methods
    exportPdf: (data: any) => Promise<{ success: boolean; result?: any; error?: string }>
  }
}
```

4. **Use in React** (`src/App.tsx` or component):
```typescript
const result = await window.api.exportPdf(myData)
if (result.success) {
  showToast('PDF exported successfully')
} else {
  showToast(result.error, 'error')
}
```

### Python Script Execution Pattern

When spawning Python scripts:
```javascript
const { spawn } = require('cross-spawn')
const child = spawn(PY_CMD, [scriptPath, ...args], {
  env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
})
// Always set encoding for stdout/stderr
child.stdout.setEncoding('utf8')
child.stderr.setEncoding('utf8')
```

### Progress Events Pattern

For long-running operations, send progress events from Main to Renderer:

**Main Process:**
```javascript
ipcMain.handle('long-operation', async (_event, data) => {
  await someOperation(data, (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('operation-progress', progress)
    }
  })
})
```

**Preload:**
```javascript
onOperationProgress: (callback) => {
  const listener = (_event, data) => callback(data)
  ipcRenderer.on('operation-progress', listener)
  return () => ipcRenderer.removeListener('operation-progress', listener)
}
```

**Renderer:**
```typescript
useEffect(() => {
  const unsubscribe = window.api.onOperationProgress((progress) => {
    setProgress(progress)
  })
  return () => unsubscribe()
}, [])
```

## Common Issues

### Python Subprocess Fails

- Check Python is in PATH or `python_runtime/python.exe` exists
- Verify `PYTHONIOENCODING: 'utf-8'` is set in spawn env
- Check stderr output from child process

### TypeScript Errors with window.api

- Ensure `src/global.d.ts` is included in `tsconfig.json`
- Rebuild TypeScript: `npm run build`

### ASAR Packaging Issues

The app uses `asar: false` in `package.json` because the Python runtime needs direct filesystem access. Do not enable ASAR without refactoring Python bundling.

### Build Errors

- Clean build: `rm -rf dist node_modules && npm install && npm run build:electron`
- Check `electron/main.cjs` paths for dev vs production (`app.isPackaged`)

## Testing

No formal test suite currently. Manual testing workflow:

1. Test tree generation with various folder structures
2. Test SafeZip workflow end-to-end
3. Test Gofile upload with real files
4. Test auto-update flow (requires real GitHub release)
5. Test on different Windows versions

## Notes

- Comments and console logs are in French (code author preference)
- Application is Windows-focused (path handling, installers)
- SafeZip feature is extensively documented in `SAFEZIP-IMPLEMENTATION.md`
- Auto-updates only work in production builds with valid GitHub releases
