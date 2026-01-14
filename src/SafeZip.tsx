import { useState, useEffect, useRef } from 'react'
import type { SafeZipJob, CopyProgress, ZipProgress, PathAnalysis } from './types/safezip'
import type { GofileUploadProgress } from './types/gofile'
import { Package, FolderOpen, Download, AlertTriangle, CheckCircle, Loader2, X, Upload, Copy, Mail } from 'lucide-react'

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

interface SourceItem {
  id: string
  path: string
  name: string
  type: 'file' | 'directory'
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
  const [sourceItems, setSourceItems] = useState<SourceItem[]>([])
  const [currentJob, setCurrentJob] = useState<SafeZipJob | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [analysis, setAnalysis] = useState<PathAnalysis | null>(null)
  const [copyProgress, setCopyProgress] = useState<CopyProgress | null>(null)
  const [zipProgress, setZipProgress] = useState<ZipProgress | null>(null)
  const [uploadProgress, setUploadProgress] = useState<GofileUploadProgress | null>(null)
  const [uploadUrl, setUploadUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [copyNotice, setCopyNotice] = useState<string | null>(null)
  const [copyNoticeTarget, setCopyNoticeTarget] = useState<'link' | 'email' | null>(null)
  const [wasCorrected, setWasCorrected] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [viewMode, setViewMode] = useState<'html' | 'text'>('html')
  const [bypassLongPaths, setBypassLongPaths] = useState(false)
  const [showNameDialog, setShowNameDialog] = useState(false)
  const [customZipName, setCustomZipName] = useState('')
  const cleanupCopyRef = useRef<(() => void) | null>(null)
  const cleanupZipRef = useRef<(() => void) | null>(null)
  const cleanupUploadRef = useRef<(() => void) | null>(null)
  const autoZipSourceRef = useRef<string | null>(null)
  const copyNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  useEffect(() => {
    return () => {
      if (copyNoticeTimeoutRef.current) {
        clearTimeout(copyNoticeTimeoutRef.current)
      }
    }
  }, [])

  // Auto-analyze when source items change
  useEffect(() => {
    if (sourceItems.length === 0 || !window.api?.safeZip) return

    const analyzeSource = async () => {
      setWasCorrected(false)
      setPhase('analyzing')
      setError(null)
      setBypassLongPaths(false)

      try {
        const sourcePaths = sourceItems.map(item => item.path)
        const result = await window.api.safeZip.analyzeMultipleSources(sourcePaths)
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
  }, [sourceItems])

  const canBypassLongPaths =
    !!analysis &&
    !analysis.hasShortNames &&
    analysis.maxPathLength > 240 &&
    analysis.maxPathLength <= 250

  useEffect(() => {
    if (sourceItems.length === 0 || !analysis) return
    const shouldAutoZip =
      (analysis.isSafeForDirectTransfer && !analysis.hasShortNames) ||
      (bypassLongPaths && canBypassLongPaths)
    if (!shouldAutoZip) return
    const sourceKey = sourceItems.map(i => i.path).join('|')
    if (autoZipSourceRef.current === sourceKey) return
    if (phase !== 'idle' || currentJob) return

    autoZipSourceRef.current = sourceKey
    handlePrepare({ corrected: false })
  }, [analysis, sourceItems, phase, currentJob, bypassLongPaths, canBypassLongPaths])

  const showToast = (message: string, type: Toast['type'] = 'info') => {
    setToast({ message, type })
  }

  const showCopyNotice = (message: string, target: 'link' | 'email') => {
    setCopyNotice(message)
    setCopyNoticeTarget(target)
    if (copyNoticeTimeoutRef.current) {
      clearTimeout(copyNoticeTimeoutRef.current)
    }
    copyNoticeTimeoutRef.current = setTimeout(() => {
      setCopyNotice(null)
      setCopyNoticeTarget(null)
      copyNoticeTimeoutRef.current = null
    }, 2000)
  }

  const handlePickFolder = async () => {
    try {
      const folderPath = await window.api.pickFolder()
      if (folderPath) {
        const newItem: SourceItem = {
          id: Date.now().toString(),
          path: folderPath,
          name: folderPath.split(/[\\/]/).pop() || folderPath,
          type: 'directory'
        }
        setSourceItems(prev => [...prev, newItem])
        setError(null)
        setPhase('idle')
        setCurrentJob(null)
        setAnalysis(null)
        showToast('Dossier ajouté', 'success')
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


  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const items = Array.from(e.dataTransfer.items)
    const newItems: SourceItem[] = []

    for (const item of items) {
      if (item.kind !== 'file') continue

      const entry = item.webkitGetAsEntry()
      if (!entry) continue

      const fileList = Array.from(e.dataTransfer.files || [])
      const file = item.getAsFile()
      const filePath = (file as any)?.path || ''
      const apiPath = window.api?.getPathForFile
      const filePathFromApi = file && apiPath ? apiPath(file) : ''

      let itemPath = filePathFromApi || filePath || (entry as any).fullPath

      if (!itemPath && fileList.length > 0) {
        const firstFile = fileList[0]
        itemPath = (firstFile as any)?.path || ''
      }

      if (itemPath) {
        const isDuplicate = sourceItems.some(existing => existing.path === itemPath)
        if (!isDuplicate) {
          newItems.push({
            id: `${Date.now()}-${Math.random()}`,
            path: itemPath,
            name: itemPath.split(/[\\/]/).pop() || itemPath,
            type: entry.isDirectory ? 'directory' : 'file'
          })
        }
      }
    }

    if (newItems.length > 0) {
      setSourceItems(prev => [...prev, ...newItems])
      setError(null)
      setPhase('idle')
      setCurrentJob(null)
      setAnalysis(null)
      showToast(`${newItems.length} élément(s) ajouté(s)`, 'success')
    }
  }

  const handlePrepare = async ({ corrected }: { corrected: boolean }) => {
    if (sourceItems.length === 0) return
    if (!window.api?.safeZip) {
      setError('API SafeZip non disponible')
      showToast('API non disponible', 'error')
      return
    }

    // If multiple sources, prompt for custom name first
    if (sourceItems.length > 1 && !customZipName) {
      setShowNameDialog(true)
      setWasCorrected(corrected)
      return
    }

    setWasCorrected(corrected)
    setPhase('analyzing')
    setError(null)
    setCopyProgress(null)
    setZipProgress(null)

    try {
      // Create job with multiple sources
      const sourcePaths = sourceItems.map(item => item.path)
      const nameToUse = sourceItems.length > 1 ? customZipName : undefined
      const jobResult = await window.api.safeZip.createJobMultiple(sourcePaths, nameToUse)
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

  const handleConfirmName = () => {
    if (!customZipName.trim()) {
      showToast('Veuillez entrer un nom', 'error')
      return
    }
    setShowNameDialog(false)
    // Trigger prepare with the name
    handlePrepare({ corrected: wasCorrected })
  }

  const handleCancelName = () => {
    setShowNameDialog(false)
    setCustomZipName('')
    setWasCorrected(false)
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
    if (sourceItems.length === 0 || !onOpenTree) return
    // Use first source item for tree generation
    onOpenTree(sourceItems[0].path)
  }

  const handleRemoveItem = (id: string) => {
    setSourceItems(prev => prev.filter(item => item.id !== id))
    setCurrentJob(null)
    setPhase('idle')
    setAnalysis(null)
    setError(null)
    setUploadUrl(null)
    setUploadProgress(null)
    setCustomZipName('')
    showToast('Élément supprimé', 'info')
  }

  const handleClearAll = () => {
    setSourceItems([])
    setCurrentJob(null)
    setPhase('idle')
    setAnalysis(null)
    setCopyProgress(null)
    setZipProgress(null)
    setError(null)
    setUploadUrl(null)
    setUploadProgress(null)
    setBypassLongPaths(false)
    setWasCorrected(false)
    setCustomZipName('')
    autoZipSourceRef.current = null
    if (onClearTree) {
      onClearTree()
    }
    showToast('Liste vidée', 'info')
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
        await copyTextToClipboard(result.downloadUrl)
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

  const copyTextToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch (err) {
      if (window.api?.copyText) {
        await window.api.copyText(text)
        return
      }
      throw err
    }
  }

  const handleCopyUploadUrl = async () => {
    if (!uploadUrl) return

    try {
      await copyTextToClipboard(uploadUrl)
      showToast('Lien copié !', 'success')
      showCopyNotice('Lien copié', 'link')
    } catch (err) {
      showToast('Erreur de copie', 'error')
    }
  }

  const handleCopyEmailText = async () => {
    if (!uploadUrl) return

    try {
      const zipName = currentJob?.zipPath?.split(/[\\/]/).pop() || 'archive'
      const emailText = `Retrouvez le dossier (${zipName}) en cliquant ici :\n${uploadUrl}`
      const emailHtml = `Retrouvez le dossier (<a href="${uploadUrl}">${zipName}</a>) en cliquant <a href="${uploadUrl}">ici</a>`
      if (window.api?.copyHtml) {
        await window.api.copyHtml(emailHtml)
      } else {
        await copyTextToClipboard(emailText)
      }
      showToast('Texte pour email copié !', 'success')
      showCopyNotice('Texte email copié', 'email')
    } catch (err) {
      showToast('Erreur de copie', 'error')
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
    if (uploadUrl) return 'Lien généré'
    switch (phase) {
      case 'analyzing':
        return 'Analyse en cours...'
      case 'copying':
        return 'Copie en cours...'
      case 'zipping':
        return 'Création du ZIP...'
      case 'uploading':
        return 'Upload en cours...'
      case 'ready':
        return 'ZIP prêt'
      case 'idle':
      default:
        if (analysis) return 'Analyse terminée'
        return sourceItems.length > 0 ? 'Prêt' : 'En attente'
    }
  }

  useEffect(() => {
    if (!onHeaderUpdate) return
    const folder = sourceItems.length > 0
      ? `${sourceItems.length} élément(s)`
      : ''
    onHeaderUpdate({
      folder,
      status: getHeaderStatus(),
      loading: isWorking
    })
  }, [sourceItems, phase, analysis, error, isWorking, onHeaderUpdate])

  return (
    <div className="safezip-container">
      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}

      {/* Custom Name Dialog */}
      {showNameDialog && (
        <div className="dialog-overlay" onClick={handleCancelName}>
          <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', color: '#e2e8f0', fontSize: '18px' }}>
              Nom du ZIP
            </h3>
            <p style={{ margin: '0 0 16px 0', color: '#94a3b8', fontSize: '14px' }}>
              Entrez un nom pour votre archive ZIP (plusieurs sources détectées)
            </p>
            <input
              type="text"
              value={customZipName}
              onChange={(e) => setCustomZipName(e.target.value)}
              placeholder="Ex: MonProjet"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmName()
                if (e.key === 'Escape') handleCancelName()
              }}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                borderRadius: '6px',
                color: '#e2e8f0',
                fontSize: '14px',
                marginBottom: '20px',
                outline: 'none'
              }}
            />
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleCancelName}
                style={{
                  padding: '8px 16px',
                  background: 'rgba(51, 65, 85, 0.5)',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  borderRadius: '6px',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmName}
                style={{
                  padding: '8px 16px',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                Continuer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="layout">
        {/* Source Selection Panel */}
        <div className={`panel safezip-source-panel ${sourceItems.length > 0 ? 'has-source' : 'no-source'}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2>1. Fichiers & dossiers source</h2>
            {sourceItems.length > 0 && (
              <button
                className="btn btn-ghost btn-icon"
                onClick={handleClearAll}
                title="Vider la liste"
                aria-label="Vider la liste"
                style={{ color: '#ef4444' }}
              >
                <X size={20} />
                Tout supprimer
              </button>
            )}
          </div>

          <div className={`source-row ${sourceItems.length > 0 ? 'has-source' : 'no-source'}`}>
            <div className="source-left">
              <div
                className={`dropzone ${sourceItems.length > 0 ? 'has-source' : ''} ${isDragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={sourceItems.length === 0 ? handlePickFolder : undefined}
                style={{ cursor: sourceItems.length === 0 ? 'pointer' : 'default' }}
              >
                {sourceItems.length > 0 ? (
                  <div style={{ width: '100%' }}>
                    <div style={{
                      maxHeight: '200px',
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      padding: '4px'
                    }}>
                      {sourceItems.map(item => (
                        <div key={item.id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 12px',
                          background: 'rgba(51, 65, 85, 0.5)',
                          borderRadius: '6px',
                          border: '1px solid rgba(148, 163, 184, 0.2)',
                        }}>
                          <FolderOpen size={16} style={{ flexShrink: 0, color: '#60a5fa' }} />
                          <span style={{
                            flex: 1,
                            fontSize: '13px',
                            color: '#e2e8f0',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }} title={item.path}>{item.name}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRemoveItem(item.id)
                            }}
                            style={{
                              background: 'rgba(239, 68, 68, 0.2)',
                              border: '1px solid rgba(239, 68, 68, 0.4)',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              color: '#fca5a5',
                              fontSize: '12px',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.3)'
                              e.currentTarget.style.color = '#fee2e2'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'
                              e.currentTarget.style.color = '#fca5a5'
                            }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div style={{
                      marginTop: '12px',
                      paddingTop: '12px',
                      borderTop: '1px solid rgba(148, 163, 184, 0.2)',
                      textAlign: 'center'
                    }}>
                      <button
                        className="btn btn-secondary"
                        onClick={handlePickFolder}
                        style={{ fontSize: '13px' }}
                      >
                        + Ajouter un élément
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <FolderOpen size={32} />
                    <p>Glissez-déposez des fichiers/dossiers ici ou cliquez pour sélectionner</p>
                  </>
                )}
              </div>
            </div>

            <div
              className={`source-right ${
                sourceItems.length > 0
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
          <div className="job-panel-header">
            <h2>2. Analyse et préparation</h2>
            {analysis && phase === 'ready' && (
              analysis.isSafeForDirectTransfer || wasCorrected || !analysis.needsPreparation ? (
                <div className="validation-badge compact animate__animated animate__bounceIn">
                  <CheckCircle size={24} />
                  <span>OK</span>
                </div>
              ) : (
                <div className="validation-badge warning compact animate__animated animate__bounceIn">
                  <AlertTriangle size={24} />
                  <span>À corriger</span>
                </div>
              )
            )}
          </div>

          <div className="job-panel-content">
            <div className="job-panel-left">
              {analysis && (
                <div className="analysis-info">
              {/* Only show stats when not processing */}
              {(phase === 'idle' || phase === 'error') && (
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
                  {analysis && (phase === 'idle' || phase === 'error') && (
                    <div className="stat-item badge-item">
                      {analysis.isSafeForDirectTransfer ? (
                        <div className="validation-badge animate__animated animate__bounceIn">
                          <CheckCircle size={32} />
                          <span>Validé</span>
                        </div>
                      ) : (
                        <div className="validation-badge warning animate__animated animate__bounceIn">
                          <AlertTriangle size={32} />
                          <span>À corriger</span>
                        </div>
                      )}
                    </div>
                  )}
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
                    Tous les fichiers ont des chemins sûrs (&lt;240 caractères). Vous pouvez compresser manuellement et envoyer directement sur Gofile.
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
                    Ces fichiers dépassent 240 caractères et nécessitent une correction :
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
                <span className={uploadProgress.phase === 'finalizing' ? 'progress-finalizing' : undefined}>
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
                onClick={() => handlePrepare({ corrected: true })}
                disabled={sourceItems.length === 0 || isWorking || phase === 'ready'}
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
                  showToast('Bypass activé, création du ZIP...', 'info')
                  handlePrepare({ corrected: true })
                }}
                disabled={sourceItems.length === 0 || isWorking || phase === 'ready'}
              >
                Forcer le ZIP (240-250)
              </button>
            )}

              </div>
            </div>

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
              <div className="copy-actions">
                <div className="copy-buttons">
                  <div className="copy-btn-wrap">
                    {copyNotice && copyNoticeTarget === 'link' && (
                      <div className="copy-tooltip" role="status">
                        {copyNotice}
                      </div>
                    )}
                    <button
                      className="btn btn-secondary"
                      onClick={handleCopyUploadUrl}
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                  <div className="copy-btn-wrap">
                    {copyNotice && copyNoticeTarget === 'email' && (
                      <div className="copy-tooltip" role="status">
                        {copyNotice}
                      </div>
                    )}
                    <button
                      className="btn btn-secondary"
                      onClick={handleCopyEmailText}
                      title="Copier le texte formaté pour email"
                    >
                      <Mail size={16} />
                      Copier pour email
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="ready-actions">
            <button
              className="btn btn-primary"
              onClick={handleSaveZip}
              style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}
            >
              <Download size={16} />
              Enregistrer ZIP
            </button>

            <button
              className="btn btn-primary"
              onClick={handleUploadToGofile}
              disabled={isWorking}
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
              <Upload size={16} />
              {uploadUrl ? 'Ré-uploader Gofile' : 'Upload Gofile'}
            </button>

            <button className="btn btn-secondary" onClick={handleOpenTree}>
              <FolderOpen size={16} />
              Générer Arborescence
            </button>

            
            <button
              className="btn btn-ghost btn-icon"
              onClick={handleOpenFolder}
              title="Ouvrir le dossier de staging"
              aria-label="Ouvrir le dossier de staging"
            >
              <FolderOpen size={20} />
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
              <p className="hint">Contrôle le rendu avant de copier.</p>
            </div>
            <div className="preview-actions">
              <div className="toggle">
                <button
                  className={`btn ${viewMode === 'html' ? 'primary' : 'secondary'} small`}
                  onClick={() => setViewMode('html')}
                  disabled={treeLoading}
                >
                  Version HTML
                </button>
                <button
                  className={`btn ${viewMode === 'text' ? 'primary' : 'secondary'} small`}
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
            <button className="btn btn-secondary" onClick={onCopyHtml} disabled={!treeHtml || treeLoading}>
              Copier pour mail
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
