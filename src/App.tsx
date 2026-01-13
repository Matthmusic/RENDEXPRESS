import { useEffect, useState } from 'react'
import { Maximize2, Minus, X as Close } from 'lucide-react'
import './App.css'
import logo from '../public/logo.svg'
import SafeZip from './SafeZip'

type RenderResponse = {
  html: string
  text: string
}

const hasApi = () => typeof window !== 'undefined' && typeof (window as any).api !== 'undefined'
const APP_VERSION = '0.1.9'

function App() {
  const [html, setHtml] = useState('')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' } | null>(null)
  const [toastTimeout, setToastTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [safeZipHeader, setSafeZipHeader] = useState({ folder: '', status: 'En attente', loading: false })
  const [updateStatus, setUpdateStatus] = useState<{
    state: 'idle' | 'available' | 'downloading' | 'downloaded' | 'error'
    version?: string
    progress?: number
    message?: string
  }>({ state: 'idle' })

  const showToast = (message: string, type: 'info' | 'error' = 'info') => {
    if (toastTimeout) clearTimeout(toastTimeout)
    setToast({ message, type })
    const t = setTimeout(() => setToast(null), 3200)
    setToastTimeout(t)
  }

  useEffect(() => {
    if (!hasApi()) return
    const unsubscribe = window.api.onUpdateEvent((data: any) => {
      switch (data?.type) {
        case 'available':
          setUpdateStatus({ state: 'available', version: data.info?.version })
          showToast(`Mise à jour disponible (${data.info?.version}).`, 'info')
          break
        case 'downloaded':
          setUpdateStatus({ state: 'downloaded', version: data.info?.version })
          showToast('Mise à jour téléchargée. Clique pour installer.', 'info')
          break
        case 'progress':
          setUpdateStatus((prev) => ({
            state: 'downloading',
            version: prev.version || data.progress?.version,
            progress: Math.round(data.progress?.percent || 0),
          }))
          break
        case 'error':
          setUpdateStatus({ state: 'error', message: data.message })
          showToast('Erreur de mise à jour.', 'error')
          break
        case 'not-available':
          setUpdateStatus({ state: 'idle' })
          break
        default:
          break
      }
    })
    window.api.checkUpdates()
    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [])



  const generate = async (path: string) => {
    if (!hasApi()) {
      showToast("Lance l'app Electron pour générer le rendu.", 'error')
      return
    }
    setLoading(true)
    try {
      const result = await window.api.renderTree(path)
      const payload = result as RenderResponse
      setHtml(payload.html)
      setText(payload.text)
      showToast('Aperçu mis à jour.', 'info')
    } catch (err) {
      console.error(err)
      showToast('Erreur lors de la génération.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const copyHtml = async () => {
    if (!html) return
    if (!hasApi()) {
      showToast("Copie dispo uniquement dans l'app Electron.", 'error')
      return
    }
    try {
      await window.api.copyHtml(html)
      showToast('HTML copié dans le presse-papiers.', 'info')
    } catch (err) {
      console.error(err)
      showToast('Impossible de copier dans le presse-papiers.', 'error')
    }
  }

  const downloadUpdate = async () => {
    if (!hasApi()) return
    try {
      setUpdateStatus((prev) => ({ ...prev, state: 'downloading', progress: 0 }))
      showToast('Début du téléchargement...', 'info')
      await window.api.downloadUpdate()
    } catch (err) {
      console.error('Download error:', err)
      showToast('Erreur lors du téléchargement.', 'error')
      setUpdateStatus((prev) => ({ ...prev, state: 'available' }))
    }
  }

  const installUpdate = async () => {
    if (!hasApi()) return
    try {
      showToast('Installation en cours...', 'info')
      await window.api.installUpdate()
    } catch (err) {
      console.error('Install error:', err)
      showToast('Erreur lors de l\'installation.', 'error')
    }
  }

  const openTreeFromSafeZip = async (path: string) => {
    if (!path) return
    // Don't switch mode, just generate the tree
    await generate(path)
  }

  const clearTreeFromSafeZip = () => {
    setHtml('')
    setText('')
  }

  const headerFolder = safeZipHeader.folder
  const headerStatusValue = safeZipHeader.loading ? 'Génération...' : safeZipHeader.status

  return (
    <div className="app-shell">
      <div className="titlebar">
        <div className="window-title">
          <img src={logo} alt="Rendexpress" className="title-logo" />
          <span className="window-title-text">Rendexpress</span>
        </div>
        <div className="window-controls">
          <button className="btn-icon" aria-label="Minimiser" onClick={() => window.api.windowMinimize()}>
            <Minus size={14} />
          </button>
          <button className="btn-icon" aria-label="Agrandir" onClick={() => window.api.windowToggleMaximize()}>
            <Maximize2 size={14} />
          </button>
          <button className="btn-icon close" aria-label="Fermer" onClick={() => window.api.windowClose()}>
            <Close size={14} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <div className={`toast ${toast ? 'visible' : ''} ${toast?.type === 'error' ? 'error' : ''}`}>
        {toast?.message}
      </div>
      <div className="bg-grid" />
      <div className="bg-glow" />

      <div className="content">
        {/* Shared Header */}
        <header className="hero">
          <div className="hero-left">
            <div className="logo-wrap">
              <img src={logo} alt="Rendexpress" className="logo" />
              <div className="logo-text">
                <p className="eyebrow">Rendexpress</p>
                <p className="subtext">Vérification et préparation de rendus</p>
              </div>
            </div>
            <h1>Package sécurisé pour envoi de gros rendus.</h1>
            <p className="lede">Évite les problèmes de chemins trop longs sous Windows. Prépare un ZIP optimisé pour Gofile.</p>
          </div>
          <div className="right-stack">
            <div className="stats" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <div className="stat">
                <span className="stat-label">Dossier</span>
                <span className="stat-value">{headerFolder ? 'Sélectionné' : 'En attente'}</span>
              </div>
              <div className="stat">
                <span className="stat-label">État</span>
                <span className="stat-value">{headerStatusValue}</span>
              </div>
            </div>
            {updateStatus.state !== 'idle' ? (
              <div className="update-box" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                <div>
                  <p className="label">Mise à jour</p>
                  <p className="tiny">
                    {updateStatus.state === 'available' && `Version ${updateStatus.version} disponible.`}
                    {updateStatus.state === 'downloading' && `Téléchargement... ${updateStatus.progress ?? 0}%`}
                    {updateStatus.state === 'downloaded' && `Version ${updateStatus.version} téléchargée.`}
                    {updateStatus.state === 'error' && updateStatus.message}
                  </p>
                </div>
                {updateStatus.state === 'available' && (
                  <button className="btn secondary small" onClick={downloadUpdate}>
                    Télécharger
                  </button>
                )}
                {updateStatus.state === 'downloading' && <span className="pill">Téléchargement...</span>}
                {updateStatus.state === 'downloaded' && (
                  <button className="btn primary small" onClick={installUpdate}>
                    Installer
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </header>

        <SafeZip
          onOpenTree={openTreeFromSafeZip}
          onClearTree={clearTreeFromSafeZip}
          treeHtml={html}
          treeText={text}
          treeLoading={loading}
          onCopyHtml={copyHtml}
          onHeaderUpdate={setSafeZipHeader}
        />
        <footer className="app-footer">Rendexpress - v{APP_VERSION}</footer>
      </div>
    </div>
  )
}

export default App
