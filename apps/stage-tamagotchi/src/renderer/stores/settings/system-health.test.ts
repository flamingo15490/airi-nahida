import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMap = vi.hoisted(() => new Map<object, (...args: any[]) => any>())
const toastErrorMock = vi.hoisted(() => vi.fn())
const toastSuccessMock = vi.hoisted(() => vi.fn())

vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaInvoke: (contract: object) => {
    const handler = invokeMap.get(contract)
    if (!handler) {
      throw new Error('Missing mocked Eventa invoke handler.')
    }
    return handler
  },
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}))

describe('useSystemHealthSettingsStore', () => {
  beforeEach(() => {
    invokeMap.clear()
    toastErrorMock.mockReset()
    toastSuccessMock.mockReset()
    setActivePinia(createPinia())
  })

  it('loads the initial snapshot from the main process', async () => {
    const {
      electronSystemHealthGetSnapshot,
      electronSystemHealthRefresh,
      electronSystemHealthRunStartupDiagnostics,
    } = await import('../../../shared/eventa')

    invokeMap.set(electronSystemHealthGetSnapshot, vi.fn(async () => ({
      overall: 'degraded',
      startupPhase: true,
      checkedAt: 100,
      subsystems: [
        {
          kind: 'memory',
          status: 'healthy',
          summary: 'Memory bridge is available.',
          checkedAt: 90,
        },
        {
          kind: 'vision',
          status: 'degraded',
          summary: 'Vision workers are warming up.',
          detail: 'The first runner has not finished preloading.',
          actionHint: 'Wait for startup to finish, then refresh.',
          checkedAt: 95,
        },
      ],
    })))
    invokeMap.set(electronSystemHealthRefresh, vi.fn())
    invokeMap.set(electronSystemHealthRunStartupDiagnostics, vi.fn())

    const { useSystemHealthSettingsStore } = await import('./system-health')
    const store = useSystemHealthSettingsStore()

    await store.loadSnapshot()

    expect(store.hasLoaded).toBe(true)
    expect(store.snapshot.overall).toBe('degraded')
    expect(store.snapshot.startupPhase).toBe(true)
    expect(store.snapshot.subsystems).toHaveLength(2)
    expect(store.snapshot.subsystems[1]?.status).toBe('degraded')
    expect(store.lastError).toBeNull()
  })

  it('refreshes the snapshot through the dedicated refresh contract', async () => {
    const {
      electronSystemHealthGetSnapshot,
      electronSystemHealthRefresh,
      electronSystemHealthRunStartupDiagnostics,
    } = await import('../../../shared/eventa')

    invokeMap.set(electronSystemHealthGetSnapshot, vi.fn(async () => ({
      overall: 'unknown',
      startupPhase: true,
      checkedAt: 1,
      subsystems: [],
    })))
    invokeMap.set(electronSystemHealthRefresh, vi.fn(async () => ({
      overall: 'healthy',
      startupPhase: false,
      checkedAt: 200,
      subsystems: [
        {
          kind: 'memory',
          status: 'healthy',
          summary: 'Memory bridge is healthy.',
          checkedAt: 190,
        },
      ],
    })))
    invokeMap.set(electronSystemHealthRunStartupDiagnostics, vi.fn())

    const { useSystemHealthSettingsStore } = await import('./system-health')
    const store = useSystemHealthSettingsStore()

    await store.refreshSnapshot()

    expect(store.snapshot.overall).toBe('healthy')
    expect(store.snapshot.startupPhase).toBe(false)
    expect(store.snapshot.checkedAt).toBe(200)
    expect(toastSuccessMock).toHaveBeenCalledWith('System health refreshed.')
  })

  it('stores startup diagnostics and re-syncs the latest snapshot afterwards', async () => {
    const {
      electronSystemHealthGetSnapshot,
      electronSystemHealthRefresh,
      electronSystemHealthRunStartupDiagnostics,
    } = await import('../../../shared/eventa')

    const getSnapshotMock = vi
      .fn()
      .mockResolvedValueOnce({
        overall: 'unknown',
        startupPhase: true,
        checkedAt: 10,
        subsystems: [],
      })
      .mockResolvedValueOnce({
        overall: 'unhealthy',
        startupPhase: false,
        checkedAt: 400,
        subsystems: [
          {
            kind: 'integrations',
            status: 'unhealthy',
            summary: 'Integration handshake failed.',
            detail: 'The desktop bridge could not authenticate a required module.',
            actionHint: 'Check the bridge credentials and rerun diagnostics.',
            checkedAt: 390,
          },
        ],
      })

    invokeMap.set(electronSystemHealthGetSnapshot, getSnapshotMock)
    invokeMap.set(electronSystemHealthRefresh, vi.fn())
    invokeMap.set(electronSystemHealthRunStartupDiagnostics, vi.fn(async () => ({
      passed: false,
      warnings: [
        {
          kind: 'vision',
          message: 'Vision prewarm took longer than expected.',
        },
      ],
      failures: [
        {
          kind: 'integrations',
          message: 'Integration handshake failed.',
        },
      ],
      duration: 1250,
    })))

    const { useSystemHealthSettingsStore } = await import('./system-health')
    const store = useSystemHealthSettingsStore()

    await store.loadSnapshot()
    await store.runStartupDiagnostics()

    expect(store.diagnostics?.passed).toBe(false)
    expect(store.diagnostics?.warnings).toHaveLength(1)
    expect(store.diagnostics?.failures).toHaveLength(1)
    expect(store.diagnostics?.duration).toBe(1250)
    expect(store.snapshot.overall).toBe('unhealthy')
    expect(store.snapshot.startupPhase).toBe(false)
    expect(getSnapshotMock).toHaveBeenCalledTimes(2)
    expect(toastSuccessMock).toHaveBeenCalledWith('Startup diagnostics completed.')
  })

  it('bootstraps startup diagnostics once and exposes a dismissible failure banner', async () => {
    const {
      electronSystemHealthGetSnapshot,
      electronSystemHealthRefresh,
      electronSystemHealthRunStartupDiagnostics,
    } = await import('../../../shared/eventa')

    const getSnapshotMock = vi
      .fn()
      .mockResolvedValueOnce({
        overall: 'degraded',
        startupPhase: true,
        checkedAt: 10,
        subsystems: [],
      })
      .mockResolvedValueOnce({
        overall: 'unhealthy',
        startupPhase: false,
        checkedAt: 20,
        subsystems: [],
      })

    const runDiagnosticsMock = vi.fn(async () => ({
      passed: false,
      warnings: [],
      failures: [
        {
          kind: 'integrations',
          message: 'Integration handshake failed.',
        },
      ],
      duration: 250,
    }))

    invokeMap.set(electronSystemHealthGetSnapshot, getSnapshotMock)
    invokeMap.set(electronSystemHealthRefresh, vi.fn())
    invokeMap.set(electronSystemHealthRunStartupDiagnostics, runDiagnosticsMock)

    const { useSystemHealthSettingsStore } = await import('./system-health')
    const store = useSystemHealthSettingsStore()

    await store.ensureStartupDiagnostics()
    await store.ensureStartupDiagnostics()

    expect(runDiagnosticsMock).toHaveBeenCalledTimes(1)
    expect(store.snapshot.startupPhase).toBe(false)
    expect(store.startupDiagnosticsFailureCount).toBe(1)
    expect(store.shouldShowStartupAlert).toBe(true)
    expect(toastSuccessMock).not.toHaveBeenCalled()

    store.dismissStartupAlert()

    expect(store.shouldShowStartupAlert).toBe(false)
  })

  it('skips automatic startup diagnostics when the snapshot is already past startupPhase', async () => {
    const {
      electronSystemHealthGetSnapshot,
      electronSystemHealthRefresh,
      electronSystemHealthRunStartupDiagnostics,
    } = await import('../../../shared/eventa')

    invokeMap.set(electronSystemHealthGetSnapshot, vi.fn(async () => ({
      overall: 'healthy',
      startupPhase: false,
      checkedAt: 100,
      subsystems: [],
    })))
    invokeMap.set(electronSystemHealthRefresh, vi.fn())
    const runDiagnosticsMock = vi.fn()
    invokeMap.set(electronSystemHealthRunStartupDiagnostics, runDiagnosticsMock)

    const { useSystemHealthSettingsStore } = await import('./system-health')
    const store = useSystemHealthSettingsStore()

    await store.ensureStartupDiagnostics()

    expect(runDiagnosticsMock).not.toHaveBeenCalled()
    expect(store.snapshot.startupPhase).toBe(false)
    expect(store.shouldShowStartupAlert).toBe(false)
    expect(toastSuccessMock).not.toHaveBeenCalled()
  })

  it('captures main-process failures without clobbering the fallback snapshot', async () => {
    const {
      electronSystemHealthGetSnapshot,
      electronSystemHealthRefresh,
      electronSystemHealthRunStartupDiagnostics,
    } = await import('../../../shared/eventa')

    invokeMap.set(electronSystemHealthGetSnapshot, vi.fn(async () => {
      throw new Error('snapshot unavailable')
    }))
    invokeMap.set(electronSystemHealthRefresh, vi.fn())
    invokeMap.set(electronSystemHealthRunStartupDiagnostics, vi.fn())

    const { useSystemHealthSettingsStore } = await import('./system-health')
    const store = useSystemHealthSettingsStore()

    await expect(store.loadSnapshot()).resolves.toBeUndefined()

    expect(store.hasLoaded).toBe(true)
    expect(store.snapshot.overall).toBe('unknown')
    expect(store.snapshot.subsystems).toEqual([])
    expect(store.lastError).toBe('snapshot unavailable')
    expect(toastErrorMock).toHaveBeenCalledWith('snapshot unavailable')
  })

  it('stores refresh failures without bubbling a handled exception to the page', async () => {
    const {
      electronSystemHealthGetSnapshot,
      electronSystemHealthRefresh,
      electronSystemHealthRunStartupDiagnostics,
    } = await import('../../../shared/eventa')

    invokeMap.set(electronSystemHealthGetSnapshot, vi.fn(async () => ({
      overall: 'healthy',
      startupPhase: false,
      checkedAt: 100,
      subsystems: [
        {
          kind: 'memory',
          status: 'healthy',
          summary: 'Memory bridge is healthy.',
          checkedAt: 90,
        },
      ],
    })))
    invokeMap.set(electronSystemHealthRefresh, vi.fn(async () => {
      throw new Error('refresh unavailable')
    }))
    invokeMap.set(electronSystemHealthRunStartupDiagnostics, vi.fn())

    const { useSystemHealthSettingsStore } = await import('./system-health')
    const store = useSystemHealthSettingsStore()

    await store.loadSnapshot()
    await expect(store.refreshSnapshot()).resolves.toBeUndefined()

    expect(store.snapshot.overall).toBe('healthy')
    expect(store.lastError).toBe('refresh unavailable')
    expect(toastErrorMock).toHaveBeenCalledWith('refresh unavailable')
    expect(toastSuccessMock).not.toHaveBeenCalled()
  })

  it('stores diagnostics failures without bubbling a handled exception to the page', async () => {
    const {
      electronSystemHealthGetSnapshot,
      electronSystemHealthRefresh,
      electronSystemHealthRunStartupDiagnostics,
    } = await import('../../../shared/eventa')

    invokeMap.set(electronSystemHealthGetSnapshot, vi.fn(async () => ({
      overall: 'healthy',
      startupPhase: false,
      checkedAt: 100,
      subsystems: [
        {
          kind: 'memory',
          status: 'healthy',
          summary: 'Memory bridge is healthy.',
          checkedAt: 90,
        },
      ],
    })))
    invokeMap.set(electronSystemHealthRefresh, vi.fn())
    invokeMap.set(electronSystemHealthRunStartupDiagnostics, vi.fn(async () => {
      throw new Error('diagnostics unavailable')
    }))

    const { useSystemHealthSettingsStore } = await import('./system-health')
    const store = useSystemHealthSettingsStore()

    await store.loadSnapshot()
    await expect(store.runStartupDiagnostics()).resolves.toBeUndefined()

    expect(store.diagnostics).toBeUndefined()
    expect(store.snapshot.overall).toBe('healthy')
    expect(store.lastError).toBe('diagnostics unavailable')
    expect(toastErrorMock).toHaveBeenCalledWith('diagnostics unavailable')
    expect(toastSuccessMock).not.toHaveBeenCalled()
  })
})
