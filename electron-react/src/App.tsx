import { useState } from 'react'
import { Maximize2, Minus, X as Close } from 'lucide-react'
import './App.css'
import logo from '../public/logo.svg'

type RenderResponse = {
  html: string
  text: string
}

const hasApi = () => typeof window !== 'undefined' && typeof (window as any).api !== 'undefined'

function App() {
  const currentVersion = '0.0.3'
  const [folder, setFolder] = useState('')
  const [html, setHtml] = useState('')
  const [text, setText] = useState('')
  const [status, setStatus] = useState('Choisis un dossier pour commencer.')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'html' | 'text'>('html')
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' } | null>(null)
  const [toastTimeout, setToastTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (message: string, type: 'info' | 'error' = 'info') => {
    if (toastTimeout) clearTimeout(toastTimeout)
    setToast({ message, type })
    const t = setTimeout(() => setToast(null), 3200)
    setToastTimeout(t)
  }

  const shortenPath = (value: string) => {
    if (!value) return ''
    if (value.length <= 70) return value
    return `${value.slice(0, 30)} ... ${value.slice(-28)}`
  }

  const pickFolder = async () => {
    setError('')
    if (!hasApi()) {
      setError("Lance l'app Electron (npm run electron:dev) pour ouvrir le sélecteur.")
      return
    }
    try {
      const selected = await window.api.pickFolder()
      if (!selected) return
      setFolder(selected)
      setStatus('Génération en cours...')
      await generate(selected)
    } catch (err) {
      console.error('pickFolder', err)
      setError('Impossible d’ouvrir la fenêtre de sélection.')
      setStatus('Erreur lors de la sélection.')
    }
  }

  const generate = async (path: string) => {
    if (!hasApi()) {
      setError("Lance l'app Electron pour générer le rendu.")
      return
    }
    setLoading(true)
    try {
      const result = await window.api.renderTree(path)
      const payload = result as RenderResponse
      setHtml(payload.html)
      setText(payload.text)
      setStatus('Rendu prêt à être copié.')
      showToast('Aperçu mis à jour.', 'info')
    } catch (err) {
      console.error(err)
      setError(String(err))
      setStatus('Erreur lors de la génération.')
      showToast('Erreur lors de la génération.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const copyHtml = async () => {
    if (!html) return
    if (!hasApi()) {
      setError("Copie dispo uniquement dans l'app Electron.")
      return
    }
    try {
      await window.api.copyHtml(html)
      setStatus('HTML copié dans le presse-papiers.')
      showToast('HTML copié dans le presse-papiers.', 'info')
    } catch (err) {
      console.error(err)
      setError('Impossible de copier dans le presse-papiers.')
      showToast('Impossible de copier dans le presse-papiers.', 'error')
    }
  }

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
        <header className="hero">
          <div className="hero-left">
            <div className="logo-wrap">
              <img src={logo} alt="Rendexpress" className="logo" />
              <div className="logo-text">
                <p className="eyebrow">Rendexpress</p>
                <p className="subtext">Générateur d’arborescence</p>
              </div>
            </div>
            <h1>Arborescence prête à coller dans ton email.</h1>
            <p className="lede">
              Sélectionne un dossier, récupère le rendu prêt à coller dans ton email (HTML ou texte soigné).
            </p>
          </div>
          <div className="right-stack">
            <div className="stats" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <div className="stat">
                <span className="stat-label">Dossier</span>
                <span className="stat-value">{folder ? 'Sélectionné' : 'En attente'}</span>
              </div>
              <div className="stat">
                <span className="stat-label">État</span>
                <span className="stat-value">{loading ? 'Génération...' : status}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="layout">
          <section className="panel actions">
            <div className="panel-head">
              <div>
                <p className="eyebrow subtle">Etape 1</p>
                <h2>Préparer le rendu</h2>
                <p className="hint">
                  Choisis un dossier puis copie l&apos;HTML formaté pour l&apos;envoyer par email.
                </p>
              </div>
              {folder ? <span className="pill">Prêt</span> : <span className="pill muted">En attente</span>}
            </div>

            <div className="path-box">
              <p className="label">Dossier sélectionné</p>
              <p className="path">{folder ? shortenPath(folder) : 'Aucun dossier pour le moment.'}</p>
            </div>

            <div className="buttons">
              <button className="btn primary" onClick={pickFolder} disabled={loading}>
                {loading ? 'Patiente...' : 'Choisir un dossier'}
              </button>
              <button className="btn ghost" onClick={() => folder && generate(folder)} disabled={!folder || loading}>
                Rafraîchir l&apos;aperçu
              </button>
            </div>

            {error ? <div className="error-box">{error}</div> : null}
          </section>

          <section className="panel preview">
            <div className="panel-head">
              <div>
                <p className="eyebrow subtle">Etape 2</p>
                <h2>Aperçu immédiat</h2>
                <p className="hint">Contrôle le rendu avant de copier. Tout est déjà stylé.</p>
              </div>
              <div className="preview-actions">
                <div className="toggle">
                  <button
                    className={`btn ghost small ${viewMode === 'html' ? 'active' : ''}`}
                    onClick={() => setViewMode('html')}
                    disabled={loading}
                  >
                    Version HTML
                  </button>
                  <button
                    className={`btn ghost small ${viewMode === 'text' ? 'active' : ''}`}
                    onClick={() => setViewMode('text')}
                    disabled={loading}
                  >
                    Version texte
                  </button>
                </div>
                <span className="pill">{loading ? 'Chargement...' : 'À jour'}</span>
              </div>
            </div>

            <div className="preview-single">
              {viewMode === 'html' ? (
                <div className="preview-card">
                  <div className="preview-title">Version HTML (email)</div>
                  <div className="html-preview" dangerouslySetInnerHTML={{ __html: html || '<em>Aucun rendu pour le moment.</em>' }} />
                </div>
              ) : (
                <div className="preview-card">
                  <div className="preview-title">Version texte</div>
                  <pre className="tree-preview">{text || 'Sélectionne un dossier pour générer le rendu.'}</pre>
                </div>
              )}
            </div>

            <div className="actions-footer inline">
              <div>
                <p className="label">Copie</p>
                <p className="tiny">Compatibilite Outlook + webmails.</p>
              </div>
              <button className="btn secondary" onClick={copyHtml} disabled={!html || loading}>
                Copier l&apos;HTML formate
              </button>
            </div>
          </section>
        </main>

        <footer className="footer">Rendexpress - v{currentVersion}</footer>
      </div>
    </div>
  )
}

export default App
