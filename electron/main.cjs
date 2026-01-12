const electron = require('electron')
const { app, BrowserWindow, ipcMain, dialog, clipboard, shell, screen, Menu, globalShortcut } = electron
const path = require('path')
const { spawn } = require('cross-spawn')
const { autoUpdater } = require('electron-updater')
const safeZipHandler = require('./safezip-handler.cjs')
const gofileHandler = require('./gofile-handler.cjs')

if (!ipcMain) {
  console.error('ipcMain indisponible. Lancer via "npm run electron" (et vérifier ELECTRON_RUN_AS_NODE vide).')
  process.exit(1)
}

const APP_ROOT = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..')
const PY_SCRIPT = app.isPackaged
  ? path.join(process.resourcesPath, 'python_backend', 'render_tree.py')
  : path.resolve(__dirname, '../python_backend/render_tree.py')
const PY_EMBED = app.isPackaged
  ? path.join(process.resourcesPath, 'python_runtime', 'python.exe')
  : path.resolve(__dirname, '../python_runtime/python.exe')
const PY_CMD = process.env.PYTHON || (app.isPackaged ? PY_EMBED : 'python')
let mainWindow = null
const isDev = !!process.env.VITE_DEV_SERVER_URL

function buildHtmlClipboardBuffer(htmlContent) {
  const fragment = `<!--StartFragment-->${htmlContent}<!--EndFragment-->`
  const html = `<!DOCTYPE html><html><body>${fragment}</body></html>`
  const header =
    'Version:0.9\r\nStartHTML:00000000\r\nEndHTML:00000000\r\nStartFragment:00000000\r\nEndFragment:00000000\r\n'

  const startHTML = header.length
  const startFragment = startHTML + html.indexOf('<!--StartFragment-->')
  const endFragment = startHTML + html.indexOf('<!--EndFragment-->') + '<!--EndFragment-->'.length
  const endHTML = startHTML + html.length

  const headerFinal =
    `Version:0.9\r\n` +
    `StartHTML:${startHTML.toString().padStart(8, '0')}\r\n` +
    `EndHTML:${endHTML.toString().padStart(8, '0')}\r\n` +
    `StartFragment:${startFragment.toString().padStart(8, '0')}\r\n` +
    `EndFragment:${endFragment.toString().padStart(8, '0')}\r\n`

  const full = headerFinal + html
  return Buffer.from(full, 'utf8')
}

function createWindow() {
  const { width: displayW, height: displayH } = screen.getPrimaryDisplay().workAreaSize
  const targetW = Math.max(1100, Math.min(1400, Math.round(displayW * 0.9)))
  const targetH = Math.max(800, Math.min(1200, Math.round(displayH * 0.8)))

  mainWindow = new BrowserWindow({
    width: targetW,
    height: targetH,
    minWidth: 1100,
    minHeight: 800,
    backgroundColor: '#050914',
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'electron', 'rendexpress.ico')
      : path.join(__dirname, 'rendexpress.ico'),
    title: 'Rendexpress',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html')
    mainWindow.loadFile(indexPath)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

function wireAutoUpdater() {
  if (isDev) return
  autoUpdater.autoDownload = false

  autoUpdater.on('update-available', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-event', { type: 'available', info })
  })
  autoUpdater.on('update-not-available', () => {
    if (mainWindow) mainWindow.webContents.send('update-event', { type: 'not-available' })
  })
  autoUpdater.on('error', (error) => {
    if (mainWindow) mainWindow.webContents.send('update-event', { type: 'error', message: error.message })
  })
  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow) mainWindow.webContents.send('update-event', { type: 'progress', progress })
  })
  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-event', { type: 'downloaded', info })
  })
}

ipcMain.handle('pick-folder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Sélectionner un dossier',
  })
  if (res.canceled || res.filePaths.length === 0) return null
  return res.filePaths[0]
})

ipcMain.handle('render-tree', async (_event, folderPath) => {
  return new Promise((resolve, reject) => {
    const child = spawn(PY_CMD, [PY_SCRIPT, '--path', folderPath, '--format', 'json'], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    })
    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    child.stdout.on('data', (data) => {
      stdout += data
    })
    child.stderr.on('data', (data) => {
      stderr += data
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Python exited with code ${code}`))
        return
      }
      try {
        const parsed = JSON.parse(stdout)
        resolve(parsed)
      } catch (err) {
        reject(new Error(`Réponse JSON invalide: ${err}`))
      }
    })
  })
})

ipcMain.handle('copy-html', async (_event, htmlContent) => {
  const buffer = buildHtmlClipboardBuffer(htmlContent)
  // Écrit le format CF_HTML attendu par Outlook + fallback texte/HTML standard.
  clipboard.writeBuffer('HTML Format', buffer)
  clipboard.write({ html: htmlContent, text: htmlContent })
})

ipcMain.handle('check-updates', async () => {
  if (isDev) return { status: 'dev' }
  try {
    const result = await autoUpdater.checkForUpdates()
    if (result && result.updateInfo && result.updateInfo.version !== app.getVersion()) {
      return { status: 'available', version: result.updateInfo.version }
    }
    return { status: 'up-to-date', version: app.getVersion() }
  } catch (err) {
    return { status: 'error', message: String(err) }
  }
})

ipcMain.handle('download-update', async () => {
  if (isDev) return
  await autoUpdater.downloadUpdate()
})

ipcMain.handle('install-update', async () => {
  if (isDev) return
  autoUpdater.quitAndInstall()
})

ipcMain.handle('window-close', () => {
  if (mainWindow) {
    mainWindow.close()
  }
})

ipcMain.handle('window-minimize', () => {
  if (mainWindow) {
    mainWindow.minimize()
  }
})

ipcMain.handle('window-toggle-maximize', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow.maximize()
  }
})

// SafeZip IPC Handlers
ipcMain.handle('safezip:create-job', async (_event, sourcePath) => {
  try {
    const job = await safeZipHandler.createJobDirectory(sourcePath)
    return { success: true, job }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('safezip:analyze-source', async (_event, sourcePath) => {
  try {
    const analysis = await safeZipHandler.analyzeSourcePath(sourcePath)
    return { success: true, analysis }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('safezip:copy-files', async (_event, job) => {
  try {
    const result = await safeZipHandler.copySourceToStaging(job, (progress) => {
      if (mainWindow) {
        mainWindow.webContents.send('safezip:copy-progress', progress)
      }
    })
    return { success: true, result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('safezip:create-zip', async (_event, job) => {
  try {
    const result = await safeZipHandler.createZipFromData(job, (progress) => {
      if (mainWindow) {
        mainWindow.webContents.send('safezip:zip-progress', progress)
      }
    })
    return { success: true, result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('safezip:create-direct-zip', async (_event, sourcePath) => {
  try {
    const result = await safeZipHandler.createDirectZipFromSource(sourcePath, (progress) => {
      if (mainWindow) {
        mainWindow.webContents.send('safezip:zip-progress', progress)
      }
    })
    return { success: true, result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('safezip:save-zip', async (_event, job) => {
  try {
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Enregistrer le ZIP',
      defaultPath: job.zipName || 'archive.zip',
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
    })

    if (res.canceled || !res.filePath) {
      return { success: false, error: 'Cancelled' }
    }

    const result = await safeZipHandler.saveZipToDestination(job, res.filePath)
    return { success: true, result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('safezip:list-jobs', async () => {
  try {
    const jobs = await safeZipHandler.listJobs()
    return { success: true, jobs }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('safezip:cleanup', async () => {
  try {
    const result = await safeZipHandler.cleanupOldJobs()
    return { success: true, result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('safezip:open-folder', async (_event, folderPath) => {
  try {
    await shell.openPath(folderPath)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('safezip:open-wetransfer', async (_event, folderPath) => {
  try {
    // Open WeTransfer
    await shell.openExternal('https://wetransfer.com/')

    // If a folder path is provided, open it too
    if (folderPath) {
      await shell.openPath(folderPath)
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Gofile upload handlers
ipcMain.handle('gofile:get-server', async () => {
  try {
    const server = await gofileHandler.getGofileServer()
    return { success: true, server }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('gofile:upload-file', async (_event, filePath) => {
  try {
    console.log('[Gofile] Starting upload for file:', filePath)
    const result = await gofileHandler.uploadToGofile(filePath, (progress) => {
      console.log('[Gofile] Progress:', progress)
      if (mainWindow) {
        mainWindow.webContents.send('gofile:upload-progress', progress)
      }
    })
    console.log('[Gofile] Upload result:', result)
    return result
  } catch (err) {
    console.error('[Gofile] Upload error:', err)
    return { success: false, error: err.message }
  }
})

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()
  wireAutoUpdater()
  if (!isDev) {
    autoUpdater.checkForUpdates()
  }
  // Cleanup old SafeZip jobs on startup
  safeZipHandler.cleanupOldJobs().catch(err => {
    console.error('SafeZip cleanup failed:', err)
  })
  if (isDev) {
    globalShortcut.register('Control+Shift+I', () => {
      const win = BrowserWindow.getFocusedWindow()
      if (win) {
        win.webContents.toggleDevTools({ mode: 'detach' })
      }
    })
    globalShortcut.register('F12', () => {
      const win = BrowserWindow.getFocusedWindow()
      if (win) {
        win.webContents.toggleDevTools({ mode: 'detach' })
      }
    })
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
