import path from 'node:path'
import { fileURLToPath } from 'node:url'
import spawn from 'cross-spawn'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { app, BrowserWindow, ipcMain, dialog, clipboard, shell } = require('electron')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PY_SCRIPT = path.resolve(__dirname, '../../python_backend/render_tree.py')
const PY_CMD = process.env.PYTHON || 'python'

let mainWindow = null

const isDev = !!process.env.VITE_DEV_SERVER_URL

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    backgroundColor: '#050914',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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

  // Optionnel : ouvrir les liens externes dans le navigateur
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
  clipboard.writeText(htmlContent)
})

app.whenReady().then(() => {
  createWindow()

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
