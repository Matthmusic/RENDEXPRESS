import { useState, useEffect, useRef } from 'react'
import type { SafeZipJob, CopyProgress, ZipProgress, PathAnalysis } from './types/safezip'
import type { GofileUploadProgress } from './types/gofile'
import { Package, FolderOpen, Download, AlertTriangle, CheckCircle, Loader2, X, Upload, Copy } from 'lucide-react'

type Phase = 'idle' | 'analyzing' | 'copying' | 'zipping' | 'ready' | 'uploading' | 'error'

interface Toast {
  message: string
  type: 'success' | 'error' | 'info'
}

interface SafeZipProps {
  onOpenTree?: (path: string) => void
  onClearTree?: () => void
  treeHtml?: string
  treeText?: string
  treeLoading?: boolean
  onCopyHtml?: () => void
  onHeaderUpdate?: (payload: { folder: string; status: string; loading: boolean }) => void
}

export default function SafeZip({
  onOpenTree,
  onClearTree,
  treeHtml = '',
  treeText = '',
  treeLoading = false,
  onCopyHtml,
  onHeaderUpdate
}: SafeZipProps) {
  const [sourcePath, setSourcePath] = useState<string | null>(null)
  const [currentJob, setCurrentJob] = useState<SafeZipJob | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [analysis, setAnalysis] = useState<PathAnalysis | null>(null)
  const [copyProgress, setCopyProgress] = useState<CopyProgress | null>(null)
  const [zipProgress, setZipProgress] = useState<ZipProgress | null>(null)
  const [uploadProgress, setUploadProgress] = useState<GofileUploadProgress | null>(null)
  const [uploadUrl, setUploadUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [viewMode, setViewMode] = useState<'html' | 'text'>('html')
  const [bypassLongPaths, setBypassLongPaths] = useState(false)
  const cleanupCopyRef = useRef<(() => void) | null>(null)
  const cleanupZipRef = useRef<(() => void) | null>(null)
  const cleanupUploadRef = useRef<(() => void) | null>(null)
  const autoZipSourceRef = useRef<string | null>(null)

  // Setup progress listeners
  useEffect(() => {
    if (!window.api?.safeZip || !window.api?.gofile) return

    cleanupCopyRef.current = window.api.safeZip.onCopyProgress((progress) => {
      setCopyProgress(progress)
    })

    cleanupZipRef.current = window.api.safeZip.onZipProgress((progress) => {
      setZipProgress(progress)
    })

    cleanupUploadRef.current = window.api.gofile.onUploadProgress((progress) => {
      setUploadProgress(progress)
    })

    return () => {
      cleanupCopyRef.current?.()
      cleanupZipRef.current?.()
      cleanupUploadRef.current?.()
    }
  }, [])

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(timer)
  }, [toast])

  // Auto-analyze when source path changes
  useEffect(() => {
    if (!sourcePath || !window.api?.safeZip) return

    const analyzeSource = async () => {
      setPhase('analyzing')
      setError(null)
      setBypassLongPaths(false)

      try {
        const result = await window.api.safeZip.analyzeSource(sourcePath)
        if (result.success && result.analysis) {
          setAnalysis(result.analysis)
          setPhase('idle')
          showToast('Analyse terminée', 'success')
        } else {
          throw new Error(result.error || 'Analyse échouée')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur d\'analyse')
        setPhase('error')
        showToast('Erreur d\'analyse', 'error')
      }
    }

    analyzeSource()
  }, [sourcePath])

  const canBypassLongPaths =
    !!analysis &&
    !analysis.hasShortNames &&
    analysis.maxPathLength > 240 &&
    analysis.maxPathLength <= 250

  useEffect(() => {
    if (!sourcePath || !analysis) return
    const shouldAutoZip =
      (analysis.isSafeForDirectTransfer && !analysis.hasShortNames) ||
      (bypassLongPaths && canBypassLongPaths)
    if (!shouldAutoZip) return
    if (autoZipSourceRef.current === sourcePath) return
    if (phase !== 'idle' || currentJob) return

    autoZipSourceRef.current = sourcePath
    handlePrepare()
  }, [analysis, sourcePath, phase, currentJob, bypassLongPaths, canBypassLongPaths])

  const showToast = (message: string, type: Toast['type'] = 'info') => {
    setToast({ message, type })
  }

  const handlePickFolder = async () => {
    try {
      const path = await window.api.pickFolder()
      if (path) {
        setSourcePath(path)
        setError(null)
        setPhase('idle')
        setCurrentJob(null)
        setAnalysis(null)
        showToast('Dossier sélectionné', 'success')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sélection')
      showToast('Erreur de sélection', 'error')
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const getCommonPath = (paths: string[]) => {
    if (paths.length === 0) return ''
    const raw = paths.filter(Boolean)
    if (raw.length === 0) return ''
    const sep = raw[0].includes('\\') ? '\\' : '/'
    const isUnc = raw[0].startsWith('\\\\')
    const splitPaths = raw.map((p) => p.split(sep).filter(Boolean))
    const minLen = Math.min(...splitPaths.map((p) => p.length))
    const common: string[] = []
    for (let i = 0; i < minLen; i += 1) {
      const segment = splitPaths[0][i]
      if (splitPaths.every((p) => p[i] === segment)) {
        common.push(segment)
      } else {
        break
      }
    }
    if (common.length === 0) return ''
    let result = (isUnc ? '\\\\' : '') + common.join(sep)
    if (common.length === 1 && common[0].endsWith(':')) {
      result += sep
    }
    return result
  }

  const extractPathFromDataTransfer = (dt: DataTransfer) => {
    const raw = dt.getData('text/uri-list') || dt.getData('text/plain')
    if (!raw) return ''
    const first = raw.split(/\r?\n/).find((line) => line && !line.startsWith('#'))
    if (!first) return ''
    if (first.startsWith('file://')) {
      let decoded = decodeURIComponent(first.replace('file:///', '').replace('file://', ''))
      if (/^[a-zA-Z]:\//.test(decoded)) {
        decoded = decoded.replace(/\//g, '\\')
      }
      return decoded
    }
    return first
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const items = Array.from(e.dataTransfer.items)
    const dirItem = items.find(item => item.kind === 'file')

    if (dirItem) {
      const entry = dirItem.webkitGetAsEntry()
      if (entry && entry.isDirectory) {
        const fileList = Array.from(e.dataTransfer.files || [])
        const dirFile = dirItem.getAsFile()
        const dirPath = (dirFile as any)?.path || ''
        const directPath = (fileList[0] as any)?.path || ''
        const apiPath = window.api?.getPathForFile
        const dirPathFromApi = dirFile && apiPath ? apiPath(dirFile) : ''
        const filePathFromApi = fileList[0] && apiPath ? apiPath(fileList[0]) : ''
        const filePaths = fileList.map((file) => (file as any).path).filter(Boolean)
        const commonPath = getCommonPath(filePaths)
        const uriPath = extractPathFromDataTransfer(e.dataTransfer)
        const path = dirPathFromApi || filePathFromApi || dirPath || directPath || commonPath || uriPath || (entry as any).fullPath
        if (path) {
          setSourcePath(path)
          setError(null)
          setPhase('idle')
          setCurrentJob(null)
          setAnalysis(null)
          showToast('Dossier déposé', 'success')
        }
      } else {
        showToast('Veuillez déposer un dossier, pas un fichier', 'error')
      }
    }
  }

  const handlePrepare = async () => {
    if (!sourcePath) return
    if (!window.api?.safeZip) {
      setError('API SafeZip non disponible')
      showToast('API non disponible', 'error')
      return
    }

    setPhase('analyzing')
    setError(null)
    setCopyProgress(null)
    setZipProgress(null)

    try {
      // Create job
      const jobResult = await window.api.safeZip.createJob(sourcePath)
      if (!jobResult.success || !jobResult.job) {
        throw new Error(jobResult.error || 'Création du job échouée')
      }

      setCurrentJob(jobResult.job)
      setPhase('copying')

      // Copy files
      const copyResult = await window.api.safeZip.copyFiles(jobResult.job)
      if (!copyResult.success || !copyResult.result) {
        throw new Error(copyResult.error || 'Copie échouée')
      }

      if (copyResult.result.copiedFiles === 0) {
        throw new Error('Aucun fichier n\'a pu être copié')
      }

      if (copyResult.result.errors.length > 0) {
        console.warn('Fichiers ignorés:', copyResult.result.errors)
        showToast(`${copyResult.result.errors.length} fichier(s) ignoré(s)`, 'info')
      }

      setPhase('zipping')

      // Create ZIP
      const zipResult = await window.api.safeZip.createZip(jobResult.job)
      if (!zipResult.success || !zipResult.result) {
        throw new Error(zipResult.error || 'Création du ZIP échouée')
      }

      // Update current job with ZIP path
      const updatedJob = {
        ...jobResult.job,
        zipPath: zipResult.result.zipPath,
        zipName: jobResult.job.sourceName + '.zip',
        status: 'READY' as const
      }
      setCurrentJob(updatedJob)

      // Update analysis from ZIP result
      if (zipResult.result.analysis) {
        setAnalysis(zipResult.result.analysis)
      }

      setPhase('ready')
      showToast('ZIP prêt à envoyer !', 'success')

      // Cleanup old jobs
      await window.api.safeZip.cleanup()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de préparation')
      setPhase('error')
      showToast('Erreur de préparation', 'error')
    }
  }

  const handleSaveZip = async () => {
    if (!currentJob) return
    if (!window.api?.safeZip) return

    try {
      const result = await window.api.safeZip.saveZip(currentJob)
      if (result.success && result.result) {
        showToast(`ZIP sauvegardé : ${result.result.finalPath}`, 'success')
      } else if (result.error !== 'Cancelled') {
        throw new Error(result.error || 'Sauvegarde échouée')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de sauvegarde')
      showToast('Erreur de sauvegarde', 'error')
    }
  }

  const handleOpenFolder = async () => {
    if (!currentJob?.outPath) return
    if (!window.api?.safeZip) return

    try {
      await window.api.safeZip.openFolder(currentJob.outPath)
    } catch (err) {
      showToast('Erreur d\'ouverture du dossier', 'error')
    }
  }

  const handleOpenTree = () => {
    if (!sourcePath || !onOpenTree) return
    onOpenTree(sourcePath)
  }

  const handleUploadToGofile = async () => {
    console.log('handleUploadToGofile called')
    console.log('currentJob:', currentJob)

    if (!currentJob?.zipPath) {
      console.error('No ZIP path available')
      showToast('Erreur: Pas de fichier ZIP disponible', 'error')
      return
    }

    if (!window.api?.gofile) {
      console.error('Gofile API not available')
      showToast('Erreur: API Gofile non disponible', 'error')
      return
    }

    console.log('Starting upload for:', currentJob.zipPath)
    setPhase('uploading')
    setError(null)
    setUploadProgress(null)
    setUploadUrl(null)

    try {
      showToast('Upload en cours...', 'info')
      const result = await window.api.gofile.uploadFile(currentJob.zipPath)
      console.log('Upload result:', result)

      if (result.success && result.downloadUrl) {
        setUploadUrl(result.downloadUrl)
        setPhase('ready')

        // Copy URL to clipboard
        await navigator.clipboard.writeText(result.downloadUrl)
        showToast('Lien copié dans le presse-papier !', 'success')
      } else {
        throw new Error(result.error || 'Upload échoué')
      }
    } catch (err) {
      console.error('Upload error:', err)
      setError(err instanceof Error ? err.message : 'Erreur d\'upload')
      setPhase('ready')
      showToast('Erreur d\'upload', 'error')
    }
  }

  const handleCopyUploadUrl = async () => {
    if (!uploadUrl) return

    try {
      await navigator.clipboard.writeText(uploadUrl)
      showToast('Lien copié !', 'success')
    } catch (err) {
      showToast('Erreur de copie', 'error')
    }
  }

  const handleClearSource = (event?: React.MouseEvent<HTMLButtonElement>) => {
    if (event) event.stopPropagation()
    setSourcePath(null)
    setCurrentJob(null)
    setPhase('idle')
    setAnalysis(null)
    setCopyProgress(null)
    setZipProgress(null)
    setError(null)
    setUploadUrl(null)
    setUploadProgress(null)
    setBypassLongPaths(false)
    autoZipSourceRef.current = null
    // Clear the tree in parent component
    if (onClearTree) {
      onClearTree()
    }
  }

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
  }

  const isWorking = phase === 'analyzing' || phase === 'copying' || phase === 'zipping' || phase === 'uploading'

  const getHeaderStatus = () => {
    if (error) return 'Erreur'
    if (uploadUrl) return 'Lien genere'
    switch (phase) {
      case 'analyzing':
        return 'Analyse en cours...'
      case 'copying':
        return 'Copie en cours...'
      case 'zipping':
        return 'Creation du ZIP...'
      case 'uploading':
        return 'Upload en cours...'
      case 'ready':
        return 'ZIP pret'
      case 'idle':
      default:
        if (analysis) return 'Analyse terminee'
        return sourcePath ? 'Pret' : 'En attente'
    }
  }

  useEffect(() => {
    if (!onHeaderUpdate) return
    onHeaderUpdate({
      folder: sourcePath || '',
      status: getHeaderStatus(),
      loading: isWorking
    })
  }, [sourcePath, phase, analysis, error, isWorking, onHeaderUpdate])

  return (
    <div className="safezip-container">
      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}

      {/* Main Content */}
      <main className="layout">
        {/* Source Selection Panel */}
        <div className={`panel safezip-source-panel ${sourcePath ? 'has-source' : 'no-source'}`}>
          <h2>1. Dossier source</h2>

          <div className={`source-row ${sourcePath ? 'has-source' : 'no-source'}`}>
            <div className="source-left">
              <div
                className={`dropzone ${sourcePath ? 'has-source' : ''} ${isDragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {sourcePath ? (
                  <>
                    <div className="dropzone-icon-wrap">
                      <FolderOpen size={52} className="dropzone-folder-icon" />
                      <button
                        className="dropzone-remove"
                        onClick={handleClearSource}
                        aria-label="Retirer le dossier"
                      >
                        <X size={50} strokeWidth={3.6} />
                      </button>
                    </div>
                    <p className="dropzone-path">{sourcePath}</p>
                  </>
                ) : (
                  <>
                    <FolderOpen size={32} />
                    <p>Glissez-déposez un dossier ici</p>
                    <button className="btn btn-secondary" onClick={handlePickFolder}>
                      Ou sélectionner un dossier
                    </button>
                  </>
                )}
              </div>
            </div>

            <div
              className={`source-right ${
                sourcePath
                  ? 'is-visible animate__animated animate__fadeIn'
                  : 'is-hidden'
              }`}
            >
              <div className="source-info">
                {phase === 'analyzing' && (
                  <div className="info-item">
                    <Loader2 size={20} className="spinner" style={{ color: '#f97316' }} />
                    <span className="value" style={{ color: '#94a3b8' }}>Analyse en cours...</span>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Analysis & Job Panel */}
        <div className="panel safezip-job-panel">
          <h2>2. Analyse et préparation</h2>

          {analysis && (
            <div className="analysis-info">
              {/* Only show stats before correction (not in ready phase) */}
              {phase !== 'ready' && (
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="stat-label">Fichiers</span>
                    <span className="stat-value">{analysis.totalFiles}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Taille</span>
                    <span className="stat-value">{formatBytes(analysis.totalSize)}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Chemin max</span>
                    <span className="stat-value">{analysis.maxPathLength} car.</span>
                  </div>
                </div>
              )}

              {/* Safe for direct transfer */}
              {analysis.isSafeForDirectTransfer && (
                <div className="risk-indicator" style={{ borderColor: 'var(--success)', background: 'rgba(34, 197, 94, 0.1)' }}>
                  <div className="risk-header">
                    <span style={{ color: 'var(--success)' }}>
                      <CheckCircle size={20} />
                    </span>
                    <span className="risk-label">
                      <strong>✓ Dossier prêt pour envoi direct</strong>
                    </span>
                  </div>
                  <p className="risk-message" style={{ marginTop: '8px' }}>
                    Tous les fichiers ont des chemins sûrs (&lt;225 caractères). Vous pouvez compresser manuellement et envoyer directement sur WeTransfer.
                  </p>
                </div>
              )}

              {/* Short names detected - BLOCKED */}
              {analysis.hasShortNames && (
                <div className="risk-indicator" style={{ borderColor: 'var(--error)', background: 'rgba(239, 68, 68, 0.1)' }}>
                  <div className="risk-header">
                    <span style={{ color: 'var(--error)' }}>
                      <AlertTriangle size={20} />
                    </span>
                    <span className="risk-label">
                      <strong>🚫 EXPORT BLOQUÉ - Noms courts Windows détectés</strong>
                    </span>
                  </div>
                  <p className="risk-message" style={{ marginTop: '8px' }}>
                    {analysis.shortNameWarning}
                  </p>
                  <p className="risk-message" style={{ marginTop: '12px', fontWeight: 600, color: '#fecdd3' }}>
                    ➜ Action requise : Copiez le dossier source vers un chemin plus court (ex: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px' }}>C:\TEMP\MonDossier</code>) puis réessayez.
                  </p>
                </div>
              )}

              {/* Problematic files - needs preparation */}
              {!analysis.hasShortNames && !analysis.isSafeForDirectTransfer && analysis.needsPreparation && !bypassLongPaths && analysis.problematicFiles.length > 0 && (
                <div className="risk-indicator" style={{ borderColor: '#f97316', background: 'rgba(249, 115, 22, 0.1)' }}>
                  <div className="risk-header">
                    <span style={{ color: '#f97316' }}>
                      <AlertTriangle size={20} />
                    </span>
                    <span className="risk-label">
                      <strong>⚠️ {analysis.problematicFiles.length} fichier(s) avec chemins trop longs</strong>
                    </span>
                  </div>
                  <p className="risk-message" style={{ marginTop: '8px' }}>
                    Ces fichiers dépassent 225 caractères et nécessitent une correction :
                  </p>
                  <ul style={{ marginTop: '8px', fontSize: '13px', opacity: 0.9, listStyle: 'none', padding: 0, maxHeight: '300px', overflowY: 'auto' }}>
                    {analysis.problematicFiles.map((file, idx) => (
                      <li key={idx} style={{ marginTop: '4px', wordBreak: 'break-all' }}>
                        <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>
                          {file.path}
                        </code>
                        <span style={{ marginLeft: '8px', color: '#f97316' }}>
                          ({file.length} car.)
                          {file.hasShortName && <span style={{ marginLeft: '4px', color: 'var(--error)' }}>🚫 Nom court Windows</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="risk-message" style={{ marginTop: '12px', fontWeight: 600, color: '#fed7aa' }}>
                    ➜ Utilisez le bouton "Corriger le rendu" ci-dessous pour créer une version optimisée pour l'envoi.
                  </p>
                </div>
              )}
            </div>
          )}

          {currentJob && (
            <div className="job-info">
              <div className="info-item">
                <span className="label">Job ID :</span>
                <span className="value">{currentJob.id}</span>
              </div>
              <div className="info-item">
                <span className="label">Staging :</span>
                <span className="value">{currentJob.stagingPath}</span>
              </div>
            </div>
          )}

          {phase === 'copying' && copyProgress && (
            <div className="progress-section">
              <div className="progress-header">
                <span>{copyProgress.phase === 'scanning' ? 'Scan en cours...' : 'Copie en cours...'}</span>
                {copyProgress.phase === 'copying' && (
                  <span>{copyProgress.current} / {copyProgress.total}</span>
                )}
              </div>
              {copyProgress.phase === 'copying' && (
                <>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${(copyProgress.current / copyProgress.total) * 100}%` }}
                    />
                  </div>
                  <div className="progress-file">{copyProgress.currentFile}</div>
                </>
              )}
            </div>
          )}

          {phase === 'zipping' && zipProgress && (
            <div className="progress-section">
              <div className="progress-header">
                <span>Création du ZIP...</span>
                <span>{zipProgress.current} / {zipProgress.total}</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${(zipProgress.current / zipProgress.total) * 100}%` }}
                />
              </div>
              <div className="progress-file">{zipProgress.currentFile}</div>
            </div>
          )}

          {phase === 'uploading' && uploadProgress && (
            <div className="progress-section">
              <div className="progress-header">
                <span>
                  {uploadProgress.phase === 'preparing' && 'Préparation de l\'upload...'}
                  {uploadProgress.phase === 'uploading' && 'Upload en cours...'}
                  {uploadProgress.phase === 'finalizing' && 'Finalisation...'}
                </span>
                {uploadProgress.phase === 'uploading' && (
                  <span>{uploadProgress.percentage}%</span>
                )}
              </div>
              {uploadProgress.phase === 'uploading' && (
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${uploadProgress.percentage}%` }}
                  />
                </div>
              )}
              {uploadProgress.phase === 'uploading' && (
                <div className="progress-file">
                  {formatBytes(uploadProgress.loaded)} / {formatBytes(uploadProgress.total)}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="error-box">
              <AlertTriangle size={20} />
              <span>{error}</span>
            </div>
          )}

          <div className="actions">
            {/* Show Prepare button only if preparation is needed */}
            {analysis?.needsPreparation && !analysis.hasShortNames && (
              <button
                className="btn btn-primary btn-blink-orange"
                onClick={handlePrepare}
                disabled={!sourcePath || isWorking || phase === 'ready'}
              >
                {isWorking ? <Loader2 size={16} className="spinner" /> : <Package size={16} />}
                Corriger le rendu
              </button>
            )}

            {canBypassLongPaths && !bypassLongPaths && (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setBypassLongPaths(true)
                  showToast('Bypass active, creation du ZIP...', 'info')
                  handlePrepare()
                }}
                disabled={!sourcePath || isWorking || phase === 'ready'}
              >
                Forcer le ZIP (240-250)
              </button>
            )}

          </div>
        </div>
      </main>

      {/* Actions Panel (when ready) */}
      {phase === 'ready' && currentJob && (
        <div className="panel safezip-ready-panel">
          <h2>3. ZIP prêt à envoyer</h2>

          <div className="ready-message">
            <CheckCircle size={24} style={{ color: 'var(--success)' }} />
            <span>Votre archive est prête !</span>
          </div>

          {/* Upload URL display */}
          {uploadUrl && (
            <div className="upload-url-box" style={{
              marginTop: '16px',
              marginBottom: '16px',
              padding: '12px 16px',
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <CheckCircle size={20} style={{ color: 'var(--success)', flexShrink: 0 }} />
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px' }}>Lien de téléchargement :</div>
                <a
                  href={uploadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#22c55e',
                    textDecoration: 'none',
                    fontSize: '14px',
                    wordBreak: 'break-all',
                    display: 'block'
                  }}
                >
                  {uploadUrl}
                </a>
              </div>
              <button
                className="btn btn-secondary"
                onClick={handleCopyUploadUrl}
                style={{ flexShrink: 0 }}
              >
                <Copy size={16} />
              </button>
            </div>
          )}

          <div className="ready-actions">
            {/* Primary upload button */}
            <button
              className="btn btn-primary"
              onClick={handleUploadToGofile}
              disabled={isWorking}
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
              {isWorking ? <Loader2 size={16} className="spinner" /> : <Upload size={16} />}
              {uploadUrl ? 'Ré-uploader sur Gofile' : 'Upload automatique (Gofile)'}
            </button>

            <button className="btn btn-secondary" onClick={handleOpenFolder}>
              <FolderOpen size={16} />
              Ouvrir le dossier
            </button>

            <button className="btn btn-secondary" onClick={handleSaveZip}>
              <Download size={16} />
              Enregistrer le ZIP...
            </button>

            <button className="btn btn-secondary" onClick={handleOpenTree}>
              <FolderOpen size={16} />
              Générer l'arborescence
            </button>
          </div>
        </div>
      )}

      {/* Tree Preview Panel - appears after generating tree */}
      {treeHtml && (
        <section className="panel preview">
          <div className="panel-head">
            <div>
              <p className="eyebrow subtle">Arborescence</p>
              <h2>Aperçu immédiat</h2>
              <p className="hint">Contrôle le rendu avant de copier. Tout est déjà stylé.</p>
            </div>
            <div className="preview-actions">
              <div className="toggle">
                <button
                  className={`btn ghost small ${viewMode === 'html' ? 'active' : ''}`}
                  onClick={() => setViewMode('html')}
                  disabled={treeLoading}
                >
                  Version HTML
                </button>
                <button
                  className={`btn ghost small ${viewMode === 'text' ? 'active' : ''}`}
                  onClick={() => setViewMode('text')}
                  disabled={treeLoading}
                >
                  Version texte
                </button>
              </div>
              <span className="pill">{treeLoading ? 'Chargement...' : 'À jour'}</span>
            </div>
          </div>

          <div className="preview-single">
            {viewMode === 'html' ? (
              <div className="preview-card">
                <div className="preview-title">Version HTML (email)</div>
                <div className="html-preview" dangerouslySetInnerHTML={{ __html: treeHtml || '<em>Aucun rendu pour le moment.</em>' }} />
              </div>
            ) : (
              <div className="preview-card">
                <div className="preview-title">Version texte</div>
                <pre className="tree-preview">{treeText || 'Sélectionne un dossier pour générer le rendu.'}</pre>
              </div>
            )}
          </div>

          <div className="actions-footer inline">
            <div>
              <p className="label">Copie</p>
              <p className="tiny">Compatibilite Outlook + webmails.</p>
            </div>
            <button className="btn secondary" onClick={onCopyHtml} disabled={!treeHtml || treeLoading}>
              Copier pour mail
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
