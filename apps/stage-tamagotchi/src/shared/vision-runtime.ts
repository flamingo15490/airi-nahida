export const visionRuntimeChannelName = 'airi:stage-tamagotchi:vision-runtime'

export interface VisionRuntimeSnapshot {
  ownerInstanceId: string
  activeSourceId: string
  activeSourceName: string
  captureCount: number
  captureHistory: number[]
  captureRatePerMinute: number
  contextUpdateCount: number
  contextUpdateHistory: number[]
  contextUpdateRatePerMinute: number
  errorMessage: string
  hasLiveStream: boolean
  hasPermissions: boolean
  isProcessing: boolean
  isRunning: boolean
  lastCaptureAt: number | null
  lastContextUpdateAt: number | null
  lastProcessingDurationMs: number | null
  lastProcessingError: string | null
  lastResultAt: number | null
  lastResultError: string | null
  lastResultText: string
  processingHistoryMs: number[]
  screenshotDataUrl: string
}

export type VisionRuntimeChannelEvent
  = | { type: 'request-state' }
    | { type: 'source-selected', sourceId: string }
    | { type: 'capture-start' }
    | { type: 'capture-stop' }
    | { type: 'state-update', snapshot: VisionRuntimeSnapshot }
