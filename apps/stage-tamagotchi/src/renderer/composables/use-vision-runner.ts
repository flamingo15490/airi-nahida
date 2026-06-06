import type { VisionWorkloadId } from '@proj-airi/stage-ui/composables'
import type { SourcesOptions } from 'electron'

import type { VisionRuntimeChannelEvent, VisionRuntimeSnapshot } from '../../shared/vision-runtime'

import { errorMessageFrom } from '@moeru/std'
import { VISION_WORKLOADS } from '@proj-airi/stage-ui/composables'
import { useVisionOrchestratorStore, useVisionProcessingStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { useProactiveCompanionStore } from '@proj-airi/stage-ui/stores/proactive-companion-store'
import { createSharedComposable, useBroadcastChannel, useLocalStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { visionRuntimeChannelName } from '../../shared/vision-runtime'
import { useVisionScreenCapture } from './use-vision-screen-capture'

const DEFAULT_SOURCES_OPTIONS: SourcesOptions = {
  types: ['screen', 'window'],
  fetchWindowIcons: true,
}

const DEFAULT_WORKLOAD_ID = VISION_WORKLOADS[0]?.id || 'screen:interpret'

function createCaptureVideoElement() {
  const element = document.createElement('video')
  element.autoplay = true
  element.muted = true
  element.playsInline = true
  return element
}

function resolveVisionRunnerRole() {
  const locationHash = typeof window.location?.hash === 'string'
    ? window.location.hash
    : ''
  const routePath = locationHash.replace(/^#/, '').split('?')[0] || '/'

  return routePath === '/' ? 'owner' : 'observer'
}

function createVisionRunnerInstanceId() {
  return `vision-runner:${Math.random().toString(36).slice(2, 10)}`
}

function createVisionRunner() {
  const visionProcessingStore = useVisionProcessingStore()
  const visionOrchestratorStore = useVisionOrchestratorStore()
  const proactiveCompanionStore = useProactiveCompanionStore()
  const {
    isRunning: processingIsRunning,
    isProcessing: processingIsProcessing,
    captureCount,
    captureHistory,
    contextUpdateCount,
    contextUpdateHistory,
    lastCaptureAt,
    lastContextUpdateAt,
    lastProcessingDurationMs,
    lastError: processingLastError,
    processingHistoryMs,
    captureRatePerMinute,
    contextUpdateRatePerMinute,
  } = storeToRefs(visionProcessingStore)
  const {
    lastResultText,
    lastResultAt,
    lastError: orchestratorLastError,
  } = storeToRefs(visionOrchestratorStore)

  const instanceId = createVisionRunnerInstanceId()
  const isOwnerWindow = ref(resolveVisionRunnerRole() === 'owner')
  const sourcesOptions = ref<SourcesOptions>({ ...DEFAULT_SOURCES_OPTIONS })
  const errorMessage = ref('')
  const screenshotDataUrl = ref('')
  const sendContextUpdates = useLocalStorage<boolean>('settings/vision/publish-context-updates', true)
  const captureDownscalePercent = useLocalStorage<number>('settings/vision/capture-downscale-percent', 100)
  const selectedWorkload = useLocalStorage<VisionWorkloadId>('settings/vision/workload-id', DEFAULT_WORKLOAD_ID)
  const hasPermissions = ref(window.platform !== 'darwin')
  const persistedSourceId = useLocalStorage('settings/vision/active-source-id', '')
  const captureVideoElement = createCaptureVideoElement()
  const { data: channelEvent, post: postChannelEvent } = useBroadcastChannel<VisionRuntimeChannelEvent, VisionRuntimeChannelEvent>({
    name: visionRuntimeChannelName,
  })

  const {
    sources,
    activeSourceId,
    activeSource,
    activeStream,
    isRefetching,
    hasFetchedOnce,
    refetchSources,
    startStream,
    stopStream,
    cleanup,
    captureFrame,
    checkMacOSPermission,
  } = useVisionScreenCapture(sourcesOptions)

  const captureInputBounds = computed(() => {
    const scaleRatio = captureDownscalePercent.value / 100

    return {
      maxWidth: Math.max(160, Math.round(1280 * scaleRatio)),
      maxHeight: Math.max(90, Math.round(720 * scaleRatio)),
    }
  })

  function hasLiveVideoStream(stream: MediaStream | null) {
    if (!stream)
      return false

    return stream.getVideoTracks().some(track => track.readyState === 'live')
  }

  function buildSnapshot(): VisionRuntimeSnapshot {
    return {
      ownerInstanceId: instanceId,
      activeSourceId: activeSourceId.value,
      activeSourceName: activeSource.value?.name || '',
      captureCount: captureCount.value,
      captureHistory: [...captureHistory.value],
      captureRatePerMinute: captureRatePerMinute.value,
      contextUpdateCount: contextUpdateCount.value,
      contextUpdateHistory: [...contextUpdateHistory.value],
      contextUpdateRatePerMinute: contextUpdateRatePerMinute.value,
      errorMessage: errorMessage.value,
      hasLiveStream: hasLiveVideoStream(activeStream.value),
      hasPermissions: hasPermissions.value,
      isProcessing: processingIsProcessing.value,
      isRunning: processingIsRunning.value,
      lastCaptureAt: lastCaptureAt.value,
      lastContextUpdateAt: lastContextUpdateAt.value,
      lastProcessingDurationMs: lastProcessingDurationMs.value,
      lastProcessingError: processingLastError.value,
      lastResultAt: lastResultAt.value,
      lastResultError: orchestratorLastError.value,
      lastResultText: lastResultText.value,
      processingHistoryMs: [...processingHistoryMs.value],
      screenshotDataUrl: screenshotDataUrl.value,
    }
  }

  function broadcastState() {
    if (!isOwnerWindow.value)
      return

    postChannelEvent({
      type: 'state-update',
      snapshot: buildSnapshot(),
    })
  }

  function applyRemoteSnapshot(snapshot: VisionRuntimeSnapshot) {
    if (isOwnerWindow.value)
      return

    activeSourceId.value = snapshot.activeSourceId
    hasPermissions.value = snapshot.hasPermissions
    errorMessage.value = snapshot.errorMessage
    screenshotDataUrl.value = snapshot.screenshotDataUrl

    visionProcessingStore.isRunning = snapshot.isRunning
    visionProcessingStore.isProcessing = snapshot.isProcessing
    visionProcessingStore.captureCount = snapshot.captureCount
    visionProcessingStore.captureHistory = [...snapshot.captureHistory]
    visionProcessingStore.contextUpdateCount = snapshot.contextUpdateCount
    visionProcessingStore.contextUpdateHistory = [...snapshot.contextUpdateHistory]
    visionProcessingStore.lastCaptureAt = snapshot.lastCaptureAt
    visionProcessingStore.lastContextUpdateAt = snapshot.lastContextUpdateAt
    visionProcessingStore.lastProcessingDurationMs = snapshot.lastProcessingDurationMs
    visionProcessingStore.lastError = snapshot.lastProcessingError
    visionProcessingStore.processingHistoryMs = [...snapshot.processingHistoryMs]

    visionOrchestratorStore.lastResultText = snapshot.lastResultText
    visionOrchestratorStore.lastResultAt = snapshot.lastResultAt
    visionOrchestratorStore.lastError = snapshot.lastResultError
  }

  async function refreshPermissions() {
    if (window.platform === 'darwin') {
      hasPermissions.value = await checkMacOSPermission() === 'granted'
      return hasPermissions.value
    }

    hasPermissions.value = true
    return true
  }

  async function ensureVideoStream() {
    if (!activeSourceId.value)
      return

    const stream = await startStream()
    captureVideoElement.srcObject = stream
    await captureVideoElement.play()

    await new Promise<void>((resolve) => {
      if (captureVideoElement.readyState >= 2) {
        resolve()
        return
      }

      const handleLoadedMetadata = () => {
        captureVideoElement.removeEventListener('loadedmetadata', handleLoadedMetadata)
        resolve()
      }

      captureVideoElement.addEventListener('loadedmetadata', handleLoadedMetadata)
    })
  }

  async function handleVisionTick() {
    if (!activeSourceId.value)
      return

    try {
      if (!hasLiveVideoStream(activeStream.value)) {
        stopStream()
        await ensureVideoStream()
      }

      const dataUrl = captureFrame(
        captureVideoElement,
        0.82,
        captureInputBounds.value.maxWidth,
        captureInputBounds.value.maxHeight,
      )
      if (!dataUrl)
        return

      screenshotDataUrl.value = dataUrl
      const capturedAt = Date.now()

      const result = await visionOrchestratorStore.processCapture({
        imageDataUrl: dataUrl,
        workloadId: selectedWorkload.value,
        sourceId: activeSourceId.value,
        capturedAt,
        publishContext: sendContextUpdates.value,
      })

      await proactiveCompanionStore.recordVisionObservation({
        summary: result.text,
        workloadId: selectedWorkload.value,
        sourceId: activeSourceId.value,
        capturedAt,
      }).catch((error) => {
        console.warn('[vision-runner] Failed to record proactive vision observation:', error)
      })

      return { capturedAt, contextUpdates: result.contextUpdates }
    }
    catch (error) {
      visionOrchestratorStore.recordError(error)
      errorMessage.value = `Failed to interpret frame: ${errorMessageFrom(error)}`
      return { capturedAt: Date.now(), contextUpdates: 0 }
    }
    finally {
      broadcastState()
    }
  }

  async function startOwnerCaptureLoop() {
    errorMessage.value = ''
    if (processingIsRunning.value) {
      broadcastState()
      return true
    }

    if (!activeSourceId.value) {
      errorMessage.value = 'Select a source before starting the ticker.'
      broadcastState()
      return false
    }

    const permissionsGranted = await refreshPermissions()
    if (!permissionsGranted) {
      errorMessage.value = 'Screen capture permissions are required to start vision.'
      broadcastState()
      return false
    }

    try {
      await ensureVideoStream()
    }
    catch (error) {
      errorMessage.value = `Failed to start stream: ${errorMessageFrom(error)}`
      broadcastState()
      return false
    }

    visionProcessingStore.startTicker(handleVisionTick)
    broadcastState()
    return true
  }

  async function stopOwnerCaptureLoop() {
    visionProcessingStore.stopTicker()
    stopStream()
    captureVideoElement.pause()
    captureVideoElement.srcObject = null
    broadcastState()
  }

  async function startCaptureLoop() {
    if (isOwnerWindow.value)
      return await startOwnerCaptureLoop()

    errorMessage.value = ''
    if (!activeSourceId.value) {
      errorMessage.value = 'Select a source before starting the ticker.'
      return false
    }

    postChannelEvent({
      type: 'capture-start',
    })
    return true
  }

  async function stopCaptureLoop() {
    if (isOwnerWindow.value) {
      await stopOwnerCaptureLoop()
      return
    }

    postChannelEvent({
      type: 'capture-stop',
    })
  }

  async function initializeSources() {
    await refreshPermissions()
    if (!hasPermissions.value)
      return

    await refetchSources()

    if (!isOwnerWindow.value) {
      postChannelEvent({
        type: 'request-state',
      })
    }
  }

  function selectSource(sourceId: string) {
    activeSourceId.value = sourceId

    if (isOwnerWindow.value) {
      if (processingIsRunning.value) {
        void ensureVideoStream().catch((error) => {
          errorMessage.value = `Failed to start stream: ${errorMessageFrom(error)}`
          broadcastState()
        })
      }
      broadcastState()
      return
    }

    postChannelEvent({
      type: 'source-selected',
      sourceId,
    })
  }

  watch(persistedSourceId, (nextSourceId) => {
    const normalizedSourceId = nextSourceId || ''
    if (activeSourceId.value === normalizedSourceId)
      return

    activeSourceId.value = normalizedSourceId
  }, { immediate: true })

  watch(activeSourceId, (nextSourceId) => {
    if (persistedSourceId.value === nextSourceId)
      return

    persistedSourceId.value = nextSourceId
  }, { immediate: true })

  watch(channelEvent, (event) => {
    if (!event)
      return

    if (event.type === 'state-update') {
      applyRemoteSnapshot(event.snapshot)
      return
    }

    if (!isOwnerWindow.value)
      return

    switch (event.type) {
      case 'request-state':
        broadcastState()
        return
      case 'source-selected':
        selectSource(event.sourceId)
        return
      case 'capture-start':
        void startOwnerCaptureLoop()
        return
      case 'capture-stop':
        void stopOwnerCaptureLoop()
        break
    }
  })

  watch([
    activeSourceId,
    activeStream,
    hasPermissions,
    errorMessage,
    processingIsRunning,
    processingIsProcessing,
    captureCount,
    captureHistory,
    contextUpdateCount,
    contextUpdateHistory,
    lastCaptureAt,
    lastContextUpdateAt,
    lastProcessingDurationMs,
    processingLastError,
    processingHistoryMs,
    captureHistory,
    contextUpdateHistory,
    captureRatePerMinute,
    contextUpdateRatePerMinute,
    lastResultText,
    lastResultAt,
    orchestratorLastError,
    screenshotDataUrl,
  ], () => {
    broadcastState()
  }, {
    deep: true,
  })

  if (!isOwnerWindow.value) {
    postChannelEvent({
      type: 'request-state',
    })
  }

  return {
    isOwnerWindow,
    sourcesOptions,
    sources,
    activeSourceId,
    activeSource,
    activeStream,
    isRefetching,
    hasFetchedOnce,
    hasPermissions,
    errorMessage,
    screenshotDataUrl,
    sendContextUpdates,
    captureDownscalePercent,
    selectedWorkload,
    captureInputBounds,
    refetchSources,
    startCaptureLoop,
    stopCaptureLoop,
    initializeSources,
    refreshPermissions,
    selectSource,
    cleanup,
    isRunning: processingIsRunning,
  }
}

/**
 * Shares the Electron vision capture lifecycle across a single renderer window.
 *
 * Use when:
 * - The app shell should keep one stable vision runner per Electron renderer
 * - Non-owner windows should control the main capture loop through a cross-window channel
 *
 * Expects:
 * - The main AIRI stage window to stay open as the capture owner
 * - Renderer preload APIs to expose Electron screen-capture support
 *
 * Returns:
 * - One reactive controller for source selection, background capture, and mirrored remote state
 */
export const useVisionRunner = createSharedComposable(createVisionRunner)
