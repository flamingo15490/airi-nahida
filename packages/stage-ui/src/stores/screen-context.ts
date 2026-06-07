import type {
  ScreenContextRuntimeSnapshot,
  ScreenContextSettings,
} from './screen-context-shared'

import { errorMessageFrom } from '@moeru/std'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useVisionProcessingStore } from './modules/vision/processing-store'
import { useVisionStore } from './modules/vision/store'

/**
 * Runtime bridge implemented by desktop hosts to read and manage screen-context.
 */
export interface ScreenContextBridge {
  loadSettings: () => Promise<ScreenContextSettings>
  saveSettings: (settings: ScreenContextSettings) => Promise<ScreenContextSettings>
  getRuntimeSnapshot: () => Promise<ScreenContextRuntimeSnapshot>
  refreshRuntime: () => Promise<ScreenContextRuntimeSnapshot>
  clearHistory: () => Promise<ScreenContextRuntimeSnapshot>
}

/**
 * Frozen screen-context snapshot composed from the runtime or vision stores.
 *
 * Use when:
 * - Renderer surfaces need one compact screen-context overview without pulling
 *   multiple vision stores directly
 * - Explainability blocks need source mode, presence, freshness, and cadence
 *   data in one place
 */
export interface ScreenContextSnapshot {
  /** Active vision provider identifier, or empty when unconfigured. */
  sourceMode: string
  /** Active vision model identifier, or empty when unconfigured. */
  sourceModel: string
  /** Whether the vision processing ticker is currently running. */
  isRunning: boolean
  /** Whether a capture or inference pass is in progress. */
  isProcessing: boolean
  /** Whether a provider and model are both configured. */
  configured: boolean
  /** Whether the vision runtime has an active live stream. */
  hasLiveStream: boolean
  /** UNIX timestamp of the most recent frame capture, or null. */
  lastCaptureAt: number | null
  /** UNIX timestamp of the most recent context update, or null. */
  lastContextUpdateAt: number | null
  /** Total frames captured in the current session. */
  captureCount: number
  /** Total context updates in the current session. */
  contextUpdateCount: number
  /** Captures per minute over the rolling window. */
  captureRatePerMinute: number
  /** Context updates per minute over the rolling window. */
  contextUpdateRatePerMinute: number
  /** Average processing duration in milliseconds. */
  averageProcessingMs: number
  /** Latest error message from the processing ticker, or null. */
  lastError: string | null
  /** Last processing duration in milliseconds, or null. */
  lastProcessingDurationMs: number | null
  /** Latest runtime snapshot from the main process, or null if IPC is unavailable. */
  runtimeSnapshot: ScreenContextRuntimeSnapshot | null
}

/**
 * Composes a read-only screen-context snapshot from the IPC bridge when available,
 * falling back to the existing vision and processing stores.
 *
 * Use when:
 * - Vision settings page needs a "Screen Context" section
 * - Dashboard needs a screen-context explainability block
 *
 * Expects:
 * - Vision and processing stores to be initialized by the host app
 * - On desktop, an IPC bridge may be attached for richer runtime data
 *
 * Returns:
 * - Reactive snapshot, formatting helpers, and thin action wrappers that
 *   delegate to the underlying vision/processing stores or IPC bridge
 */
export const useScreenContextStore = defineStore('screen-context', () => {
  const visionStore = useVisionStore()
  const processingStore = useVisionProcessingStore()

  const bridge = ref<ScreenContextBridge>()
  const runtimeSnapshot = ref<ScreenContextRuntimeSnapshot | null>(null)
  const loading = ref(false)
  const error = ref<string>()

  async function withBridge<T>(run: (activeBridge: ScreenContextBridge) => Promise<T>): Promise<T> {
    if (!bridge.value)
      throw new Error('Screen context bridge is not available in this runtime.')
    return await run(bridge.value)
  }

  const snapshot = computed<ScreenContextSnapshot>(() => {
    const runtime = runtimeSnapshot.value
    return {
      sourceMode: runtime?.sourceMode ?? visionStore.activeProvider ?? '',
      sourceModel: visionStore.activeProvider || '',
      isRunning: processingStore.isRunning,
      isProcessing: processingStore.isProcessing,
      configured: visionStore.configured,
      hasLiveStream: processingStore.isRunning && processingStore.captureCount > 0,
      lastCaptureAt: processingStore.lastCaptureAt,
      lastContextUpdateAt: processingStore.lastContextUpdateAt,
      captureCount: processingStore.captureCount,
      contextUpdateCount: processingStore.contextUpdateCount,
      captureRatePerMinute: processingStore.captureRatePerMinute,
      contextUpdateRatePerMinute: processingStore.contextUpdateRatePerMinute,
      averageProcessingMs: processingStore.averageProcessingMs,
      lastError: processingStore.lastError,
      lastProcessingDurationMs: processingStore.lastProcessingDurationMs,
      runtimeSnapshot: runtime,
    }
  })

  /**
   * Computes a freshness label from the most recent capture or context update.
   *
   * Before:
   * - UNIX timestamp `1717756800000`
   *
   * After:
   * - `"12s ago"` or `"3m ago"` or `"1h ago"` or `"Never"`
   */
  function formatFreshness(timestamp: number | null): string {
    if (!timestamp)
      return 'Never'

    const diffMs = Date.now() - timestamp
    const diffSeconds = Math.max(0, Math.floor(diffMs / 1000))
    if (diffSeconds < 60)
      return `${diffSeconds}s ago`
    const diffMinutes = Math.floor(diffSeconds / 60)
    if (diffMinutes < 60)
      return `${diffMinutes}m ago`
    const diffHours = Math.floor(diffMinutes / 60)
    return `${diffHours}h ago`
  }

  const captureFreshness = computed(() => formatFreshness(processingStore.lastCaptureAt))
  const contextFreshness = computed(() => formatFreshness(processingStore.lastContextUpdateAt))

  function setBridge(nextBridge: ScreenContextBridge) {
    bridge.value = nextBridge
  }

  async function loadRuntimeSnapshot() {
    if (!bridge.value)
      return
    loading.value = true
    error.value = undefined
    try {
      runtimeSnapshot.value = await withBridge(b => b.getRuntimeSnapshot())
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to load screen context runtime snapshot.'
    }
    finally {
      loading.value = false
    }
  }

  async function refreshRuntime() {
    if (!bridge.value)
      return
    loading.value = true
    error.value = undefined
    try {
      runtimeSnapshot.value = await withBridge(b => b.refreshRuntime())
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to refresh screen context runtime.'
    }
    finally {
      loading.value = false
    }
  }

  async function clearHistory() {
    if (!bridge.value)
      return
    try {
      runtimeSnapshot.value = await withBridge(b => b.clearHistory())
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to clear screen context history.'
    }
  }

  function resetHistory() {
    processingStore.resetMetrics()
  }

  return {
    snapshot,
    bridge,
    runtimeSnapshot,
    loading,
    error,
    captureFreshness,
    contextFreshness,
    formatFreshness,
    setBridge,
    loadRuntimeSnapshot,
    refreshRuntime,
    clearHistory,
    resetHistory,
  }
})
