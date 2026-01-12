// Gofile.io API types

export interface GofileServer {
  name: string
  zone: string
}

export interface GofileGetServerResponse {
  status: 'ok' | 'error'
  data?: {
    server: string
  }
  error?: string
}

export interface GofileUploadResponse {
  status: 'ok' | 'error'
  data?: {
    downloadPage: string
    code: string
    parentFolder: string
    fileId: string
    fileName: string
    md5: string
  }
  error?: string
}

export interface GofileUploadProgress {
  phase: 'preparing' | 'uploading' | 'finalizing'
  loaded: number
  total: number
  percentage: number
}

export interface GofileUploadResult {
  success: boolean
  downloadUrl?: string
  fileId?: string
  error?: string
}
