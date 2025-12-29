const electron = require('electron')
const { app, BrowserWindow, ipcMain, dialog, clipboard, shell, screen, Menu, globalShortcut } = electron
const path = require('path')
const { spawn } = require('cross-spawn')

if (!ipcMain) {
  console.error('ipcMain indisponible. Lancer via "npm run electron" (et vérifier ELECTRON_RUN_AS_NODE vide).')
  process.exit(1)
}

const APP_ROOT = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..', '..')
const PY_SCRIPT = app.isPackaged
  ? path.join(process.resourcesPath, 'python_backend', 'render_tree.py')
  : path.resolve(__dirname, '../../python_backend/render_tree.py')
const PY_CMD = process.env.PYTHON || 'python'
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
    const child = spawn(PY_CMD, [PY_SCRIPT, '--path', folderPath, '--format', 'json'])
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    child.stderr.on('data', (data) => {
      stderr += data.toString()
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

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()
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
