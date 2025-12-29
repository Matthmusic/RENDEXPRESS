export {}

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
      onUpdateEvent: (callback: (data: any) => void) => () => void
    }
  }
}
