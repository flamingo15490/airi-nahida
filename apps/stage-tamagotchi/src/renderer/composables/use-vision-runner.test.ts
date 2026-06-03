import type { ComputedRef, Ref } from 'vue'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'

const mockUseLocalStorage = vi.fn()
const mockUseBroadcastChannel = vi.fn()
const mockUseVisionScreenCapture = vi.fn()
const localStorageRefs = new Map<string, ReturnType<typeof ref<any>>>()
const broadcastSubscribers = new Set<ReturnType<typeof ref<any>>>()

interface VisionScreenCaptureMockInstance {
  sources: Ref<Array<{ id: string, name: string }>>
  activeSourceId: Ref<string>
  activeSource: ComputedRef<{ id: string, name: string } | null>
  activeStream: Ref<MediaStream | null>
  isRefetching: Ref<boolean>
  hasFetchedOnce: Ref<boolean>
  refetchSources: ReturnType<typeof vi.fn>
  startStream: ReturnType<typeof vi.fn>
  stopStream: ReturnType<typeof vi.fn>
  cleanup: ReturnType<typeof vi.fn>
  captureFrame: ReturnType<typeof vi.fn>
  checkMacOSPermission: ReturnType<typeof vi.fn>
}

const visionCaptureInstances: VisionScreenCaptureMockInstance[] = []

interface MockProcessingRefs {
  isRunning: Ref<boolean>
  isProcessing: Ref<boolean>
  captureCount: Ref<number>
  captureHistory: Ref<number[]>
  contextUpdateCount: Ref<number>
  contextUpdateHistory: Ref<number[]>
  lastCaptureAt: Ref<number | null>
  lastContextUpdateAt: Ref<number | null>
  lastProcessingDurationMs: Ref<number | null>
  lastError: Ref<string | null>
  processingHistoryMs: Ref<number[]>
  captureRatePerMinute: Ref<number>
  contextUpdateRatePerMinute: Ref<number>
}

interface MockProcessingStore {
  __refs: MockProcessingRefs
  isRunning: boolean
  isProcessing: boolean
  captureCount: number
  captureHistory: number[]
  contextUpdateCount: number
  contextUpdateHistory: number[]
  lastCaptureAt: number | null
  lastContextUpdateAt: number | null
  lastProcessingDurationMs: number | null
  lastError: string | null
  processingHistoryMs: number[]
  startTicker: ReturnType<typeof vi.fn>
  stopTicker: ReturnType<typeof vi.fn>
}

interface MockOrchestratorRefs {
  lastResultText: Ref<string>
  lastResultAt: Ref<number | null>
  lastError: Ref<string | null>
}

interface MockOrchestratorStore {
  __refs: MockOrchestratorRefs
  lastResultText: string
  lastResultAt: number | null
  lastError: string | null
  processCapture: ReturnType<typeof vi.fn>
  recordError: ReturnType<typeof vi.fn>
}

const processingStoreRegistry = new Map<'owner' | 'observer', MockProcessingStore>()
const orchestratorStoreRegistry = new Map<'owner' | 'observer', MockOrchestratorStore>()

function resolveWindowRoleFromHash(locationHash: string) {
  return locationHash === '#/' ? 'owner' : 'observer'
}

function getCurrentTestWindowRole() {
  return resolveWindowRoleFromHash(window.location.hash)
}

function createProcessingStore(): MockProcessingStore {
  const refs: MockProcessingRefs = {
    isRunning: ref(false),
    isProcessing: ref(false),
    captureCount: ref(0),
    captureHistory: ref<number[]>([]),
    contextUpdateCount: ref(0),
    contextUpdateHistory: ref<number[]>([]),
    lastCaptureAt: ref<number | null>(null),
    lastContextUpdateAt: ref<number | null>(null),
    lastProcessingDurationMs: ref<number | null>(null),
    lastError: ref<string | null>(null),
    processingHistoryMs: ref<number[]>([]),
    captureRatePerMinute: ref(0),
    contextUpdateRatePerMinute: ref(0),
  }

  return {
    __refs: refs,
    get isRunning(): boolean {
      return refs.isRunning.value ?? false
    },
    set isRunning(value: boolean) {
      refs.isRunning.value = value
    },
    get isProcessing(): boolean {
      return refs.isProcessing.value ?? false
    },
    set isProcessing(value: boolean) {
      refs.isProcessing.value = value
    },
    get captureCount(): number {
      return refs.captureCount.value ?? 0
    },
    set captureCount(value: number) {
      refs.captureCount.value = value
    },
    get captureHistory(): number[] {
      return refs.captureHistory.value ?? []
    },
    set captureHistory(value: number[]) {
      refs.captureHistory.value = value
    },
    get contextUpdateCount(): number {
      return refs.contextUpdateCount.value ?? 0
    },
    set contextUpdateCount(value: number) {
      refs.contextUpdateCount.value = value
    },
    get contextUpdateHistory(): number[] {
      return refs.contextUpdateHistory.value ?? []
    },
    set contextUpdateHistory(value: number[]) {
      refs.contextUpdateHistory.value = value
    },
    get lastCaptureAt(): number | null {
      return refs.lastCaptureAt.value ?? null
    },
    set lastCaptureAt(value: number | null) {
      refs.lastCaptureAt.value = value
    },
    get lastContextUpdateAt(): number | null {
      return refs.lastContextUpdateAt.value ?? null
    },
    set lastContextUpdateAt(value: number | null) {
      refs.lastContextUpdateAt.value = value
    },
    get lastProcessingDurationMs(): number | null {
      return refs.lastProcessingDurationMs.value ?? null
    },
    set lastProcessingDurationMs(value: number | null) {
      refs.lastProcessingDurationMs.value = value
    },
    get lastError(): string | null {
      return refs.lastError.value ?? null
    },
    set lastError(value: string | null) {
      refs.lastError.value = value
    },
    get processingHistoryMs(): number[] {
      return refs.processingHistoryMs.value ?? []
    },
    set processingHistoryMs(value: number[]) {
      refs.processingHistoryMs.value = value
    },
    startTicker: vi.fn(() => {
      refs.isRunning.value = true
    }),
    stopTicker: vi.fn(() => {
      refs.isRunning.value = false
    }),
  }
}

function createOrchestratorStore(): MockOrchestratorStore {
  const refs: MockOrchestratorRefs = {
    lastResultText: ref(''),
    lastResultAt: ref<number | null>(null),
    lastError: ref<string | null>(null),
  }

  return {
    __refs: refs,
    get lastResultText(): string {
      return refs.lastResultText.value ?? ''
    },
    set lastResultText(value: string) {
      refs.lastResultText.value = value
    },
    get lastResultAt(): number | null {
      return refs.lastResultAt.value ?? null
    },
    set lastResultAt(value: number | null) {
      refs.lastResultAt.value = value
    },
    get lastError(): string | null {
      return refs.lastError.value ?? null
    },
    set lastError(value: string | null) {
      refs.lastError.value = value
    },
    processCapture: vi.fn(async () => ({ contextUpdates: 0 })),
    recordError: vi.fn(),
  }
}

function getProcessingStoreForCurrentWindow() {
  const role = getCurrentTestWindowRole()
  if (!processingStoreRegistry.has(role))
    processingStoreRegistry.set(role, createProcessingStore())
  return processingStoreRegistry.get(role)!
}

function getOrchestratorStoreForCurrentWindow() {
  const role = getCurrentTestWindowRole()
  if (!orchestratorStoreRegistry.has(role))
    orchestratorStoreRegistry.set(role, createOrchestratorStore())
  return orchestratorStoreRegistry.get(role)!
}

vi.mock('@vueuse/core', async () => {
  const actual = await vi.importActual<typeof import('@vueuse/core')>('@vueuse/core')
  return {
    ...actual,
    createSharedComposable: <T>(fn: () => T) => fn,
    useBroadcastChannel: mockUseBroadcastChannel,
    useLocalStorage: mockUseLocalStorage,
  }
})

vi.mock('@proj-airi/stage-ui/composables', () => ({
  VISION_WORKLOADS: [
    { id: 'screen:interpret', label: 'Interpret screen' },
  ],
}))

vi.mock('@proj-airi/stage-ui/stores/modules/vision', () => ({
  useVisionOrchestratorStore: () => getOrchestratorStoreForCurrentWindow(),
  useVisionProcessingStore: () => getProcessingStoreForCurrentWindow(),
}))

vi.mock('pinia', () => ({
  storeToRefs: (store: { __refs: Record<string, unknown> }) => store.__refs,
}))

vi.mock('./use-vision-screen-capture', () => ({
  useVisionScreenCapture: mockUseVisionScreenCapture,
}))

function createStorageRef<T>(key: string, initialValue: T) {
  if (!localStorageRefs.has(key)) {
    localStorageRefs.set(key, ref(initialValue))
  }

  return localStorageRefs.get(key) as ReturnType<typeof ref<T>>
}

function createLiveStream() {
  const track = {
    readyState: 'live',
    addEventListener: vi.fn(),
    stop: vi.fn(),
  }

  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream
}

function createVisionScreenCaptureMock(): VisionScreenCaptureMockInstance {
  const sources = ref([
    { id: 'screen:1:0', name: 'Primary Display' },
  ])
  const activeSourceId = ref('')
  const activeStream = ref<MediaStream | null>(null)

  const instance = {
    sources,
    activeSourceId,
    activeSource: computed(() => {
      return sources.value.find(source => source.id === activeSourceId.value) || null
    }),
    activeStream,
    isRefetching: ref(false),
    hasFetchedOnce: ref(false),
    refetchSources: vi.fn(async () => {
      instance.hasFetchedOnce.value = true
    }),
    startStream: vi.fn(async () => {
      const stream = createLiveStream()
      activeStream.value = stream
      return stream
    }),
    stopStream: vi.fn(() => {
      activeStream.value = null
    }),
    cleanup: vi.fn(),
    captureFrame: vi.fn(),
    checkMacOSPermission: vi.fn(async () => 'granted'),
  }

  visionCaptureInstances.push(instance)
  return instance
}

async function flushVisionTasks() {
  await nextTick()
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
}

function mockBroadcastChannel() {
  mockUseBroadcastChannel.mockImplementation(() => {
    const data = ref<any>()
    broadcastSubscribers.add(data)

    return {
      data,
      post: (message: unknown) => {
        for (const subscriber of broadcastSubscribers) {
          if (subscriber === data)
            continue
          subscriber.value = message
        }
      },
    }
  })
}

describe('useVisionRunner', () => {
  afterEach(async () => {
    localStorageRefs.clear()
    broadcastSubscribers.clear()
    visionCaptureInstances.length = 0
    processingStoreRegistry.clear()
    orchestratorStoreRegistry.clear()
    mockUseLocalStorage.mockReset()
    mockUseBroadcastChannel.mockReset()
    mockUseVisionScreenCapture.mockReset()

    vi.resetModules()
    vi.unstubAllGlobals()
    await nextTick()
  })

  it('syncs the active source id from persisted storage updates across windows', async () => {
    mockUseLocalStorage.mockImplementation((key: string, initialValue: unknown) => createStorageRef(key, initialValue))
    mockBroadcastChannel()
    mockUseVisionScreenCapture.mockImplementation(() => createVisionScreenCaptureMock())

    const mockWindow = {
      platform: 'win32',
      electron: {
        ipcRenderer: {},
      },
      location: {
        hash: '#/settings/modules/vision',
      },
    }

    vi.stubGlobal('window', mockWindow)
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        autoplay: true,
        muted: true,
        playsInline: true,
        readyState: 2,
        srcObject: null,
        play: vi.fn(async () => undefined),
        pause: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })

    const { useVisionRunner } = await import('./use-vision-runner')
    const runner = useVisionRunner()
    const persistedSourceId = createStorageRef('settings/vision/active-source-id', '')

    expect(runner.activeSourceId.value).toBe('')

    persistedSourceId.value = 'screen:1:0'
    await nextTick()

    expect(runner.activeSourceId.value).toBe('screen:1:0')
  })

  it('routes capture commands to the owner window so closing observers does not own the ticker', async () => {
    mockUseLocalStorage.mockImplementation((key: string, initialValue: unknown) => createStorageRef(key, initialValue))
    mockBroadcastChannel()
    mockUseVisionScreenCapture.mockImplementation(() => createVisionScreenCaptureMock())

    const mockWindow = {
      platform: 'win32',
      electron: {
        ipcRenderer: {},
      },
      location: {
        hash: '#/',
      },
    }

    vi.stubGlobal('window', mockWindow)
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        autoplay: true,
        muted: true,
        playsInline: true,
        readyState: 2,
        srcObject: null,
        play: vi.fn(async () => undefined),
        pause: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })

    const { useVisionRunner } = await import('./use-vision-runner')

    mockWindow.location.hash = '#/'
    const ownerRunner = useVisionRunner()
    const ownerProcessingStore = processingStoreRegistry.get('owner')!

    mockWindow.location.hash = '#/settings/modules/vision'
    const observerRunner = useVisionRunner()

    observerRunner.selectSource('screen:1:0')
    await flushVisionTasks()

    expect(ownerRunner.isOwnerWindow.value).toBe(true)
    expect(observerRunner.isOwnerWindow.value).toBe(false)
    expect(ownerRunner.activeSourceId.value).toBe('screen:1:0')

    await observerRunner.startCaptureLoop()
    await flushVisionTasks()

    expect(ownerProcessingStore.startTicker).toHaveBeenCalledTimes(1)
    expect(ownerProcessingStore.__refs.isRunning.value).toBe(true)
    expect(visionCaptureInstances[0]?.startStream).toHaveBeenCalledTimes(1)
    expect(visionCaptureInstances[1]?.startStream).not.toHaveBeenCalled()

    await observerRunner.stopCaptureLoop()
    await flushVisionTasks()

    expect(ownerProcessingStore.stopTicker).toHaveBeenCalledTimes(1)
    expect(ownerProcessingStore.__refs.isRunning.value).toBe(false)
  })
})
