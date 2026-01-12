export {}

import type {
  SafeZipJob,
  CopyProgress,
  ZipProgress,
  PathAnalysis,
  CopyResult,
  ZipResult,
  SaveZipResult
} from './types/safezip'

import type {
  GofileUploadProgress,
  GofileUploadResult
} from './types/gofile'

declare global {
  interface Window {
    api: {
      pickFolder: () => Promise<string | null>
      renderTree: (path: string) => Promise<{ html: string; text: string }>
      copyHtml: (html: string) => Promise<void>
      windowClose: () => Promise<void>
      windowMinimize: () => Promise<void>
      windowToggleMaximize: () => Promise<void>
      checkUpdates: () => Promise<{ status: string; version?: string }>
      downloadUpdate: () => Promise<void>
      installUpdate: () => Promise<void>
      getPathForFile: (file: File) => string
      onUpdateEvent: (callback: (data: any) => void) => () => void
      safeZip: {
        createJob: (sourcePath: string) => Promise<{ success: boolean; job?: SafeZipJob; error?: string }>
        analyzeSource: (sourcePath: string) => Promise<{ success: boolean; analysis?: PathAnalysis; error?: string }>
        copyFiles: (job: SafeZipJob) => Promise<{ success: boolean; result?: CopyResult; error?: string }>
        createZip: (job: SafeZipJob) => Promise<{ success: boolean; result?: ZipResult & { analysis?: PathAnalysis }; error?: string }>
        createDirectZip: (sourcePath: string) => Promise<{ success: boolean; result?: ZipResult; error?: string }>
        saveZip: (job: SafeZipJob) => Promise<{ success: boolean; result?: SaveZipResult; error?: string }>
        listJobs: () => Promise<{ success: boolean; jobs?: SafeZipJob[]; error?: string }>
        cleanup: () => Promise<{ success: boolean; result?: { cleaned: number; errors: any[] }; error?: string }>
        openFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>
        openWeTransfer: (folderPath?: string) => Promise<{ success: boolean; error?: string }>
        onCopyProgress: (callback: (progress: CopyProgress) => void) => () => void
        onZipProgress: (callback: (progress: ZipProgress) => void) => () => void
      }
      gofile: {
        getServer: () => Promise<{ success: boolean; server?: string; error?: string }>
        uploadFile: (filePath: string) => Promise<GofileUploadResult>
        onUploadProgress: (callback: (progress: GofileUploadProgress) => void) => () => void
      }
    }
  }
}

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
