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

describe('useExternalIntegrationsSettingsStore', () => {
  beforeEach(() => {
    invokeMap.clear()
    toastErrorMock.mockReset()
    toastSuccessMock.mockReset()
    setActivePinia(createPinia())
  })

  it('loads snapshots from Electron and clears the dirty flag', async () => {
    const {
      electronAppOpenUserDataFolder,
      electronExternalIntegrationsGetSnapshots,
      electronExternalIntegrationsImportLegacyMcp,
      electronExternalIntegrationsProbeNow,
      electronExternalIntegrationsSaveConfig,
    } = await import('../../../shared/eventa')

    invokeMap.set(electronExternalIntegrationsGetSnapshots, async () => ([
      {
        kind: 'memory',
        config: {
          kind: 'memory',
          enabled: true,
          rootPath: 'D:\\AIRI-Memory',
          filesystemServerName: 'filesystem',
          obsidianServerName: 'obsidian',
        },
        status: {
          kind: 'memory',
          state: 'ready',
          summary: 'Memory integration is ready.',
          checkedAt: 1,
          lastSuccessAt: 1,
        },
      },
      {
        kind: 'companion-sidecar',
        config: {
          kind: 'companion-sidecar',
          enabled: false,
          moduleName: 'Proactive Companion',
          pluginId: 'local.proactive-companion',
          expectedWsUrl: 'ws://127.0.0.1:6121/ws',
        },
        status: {
          kind: 'companion-sidecar',
          state: 'disabled',
          summary: 'Companion sidecar integration is disabled.',
          checkedAt: 1,
        },
      },
    ]))
    invokeMap.set(electronExternalIntegrationsImportLegacyMcp, vi.fn())
    invokeMap.set(electronExternalIntegrationsSaveConfig, vi.fn())
    invokeMap.set(electronExternalIntegrationsProbeNow, vi.fn())
    invokeMap.set(electronAppOpenUserDataFolder, vi.fn(async () => ({ path: 'C:\\Users\\Lenovo\\AppData\\Roaming\\ai.moeru.airi' })))

    const { useExternalIntegrationsSettingsStore } = await import('./external-integrations')
    const store = useExternalIntegrationsSettingsStore()

    await store.refresh()

    expect(store.memoryConfig.rootPath).toBe('D:\\AIRI-Memory')
    expect(store.memoryStatus?.state).toBe('ready')
    expect(store.memoryDirty).toBe(false)
    expect(store.sidecarStatus?.state).toBe('disabled')
  })

  it('blocks probing when the local draft has unsaved changes', async () => {
    const getSnapshotsMock = vi.fn(async () => ([
      {
        kind: 'memory',
        config: {
          kind: 'memory',
          enabled: true,
          rootPath: 'D:\\AIRI-Memory',
          filesystemServerName: 'filesystem',
          obsidianServerName: 'obsidian',
        },
        status: {
          kind: 'memory',
          state: 'ready',
          summary: 'Memory integration is ready.',
          checkedAt: 1,
          lastSuccessAt: 1,
        },
      },
      {
        kind: 'companion-sidecar',
        config: {
          kind: 'companion-sidecar',
          enabled: false,
          moduleName: 'Proactive Companion',
          pluginId: 'local.proactive-companion',
          expectedWsUrl: 'ws://127.0.0.1:6121/ws',
        },
        status: {
          kind: 'companion-sidecar',
          state: 'disabled',
          summary: 'Companion sidecar integration is disabled.',
          checkedAt: 1,
        },
      },
    ]))
    const probeNowMock = vi.fn()

    const {
      electronAppOpenUserDataFolder,
      electronExternalIntegrationsGetSnapshots,
      electronExternalIntegrationsImportLegacyMcp,
      electronExternalIntegrationsProbeNow,
      electronExternalIntegrationsSaveConfig,
    } = await import('../../../shared/eventa')

    invokeMap.set(electronExternalIntegrationsGetSnapshots, getSnapshotsMock)
    invokeMap.set(electronExternalIntegrationsImportLegacyMcp, vi.fn())
    invokeMap.set(electronExternalIntegrationsProbeNow, probeNowMock)
    invokeMap.set(electronExternalIntegrationsSaveConfig, vi.fn())
    invokeMap.set(electronAppOpenUserDataFolder, vi.fn(async () => ({ path: 'C:\\Users\\Lenovo\\AppData\\Roaming\\ai.moeru.airi' })))

    const { useExternalIntegrationsSettingsStore } = await import('./external-integrations')
    const store = useExternalIntegrationsSettingsStore()

    await store.refresh()
    store.memoryConfig.rootPath = 'D:\\AnotherMemory'

    await store.probeNow('memory')

    expect(probeNowMock).not.toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalledWith('Save changes before running a probe.')
  })

  it('imports the legacy desktop MCP config and refreshes the memory snapshot', async () => {
    const {
      electronAppOpenUserDataFolder,
      electronExternalIntegrationsGetSnapshots,
      electronExternalIntegrationsImportLegacyMcp,
      electronExternalIntegrationsProbeNow,
      electronExternalIntegrationsSaveConfig,
    } = await import('../../../shared/eventa')

    invokeMap.set(electronExternalIntegrationsGetSnapshots, vi.fn(async () => ([
      {
        kind: 'memory',
        config: {
          kind: 'memory',
          enabled: true,
          rootPath: 'D:\\AIRI-Memory',
          filesystemServerName: 'filesystem',
          obsidianServerName: 'obsidian',
        },
        status: {
          kind: 'memory',
          state: 'degraded',
          summary: 'Filesystem MCP server for memory is missing.',
          checkedAt: 1,
          error: 'filesystem',
        },
      },
      {
        kind: 'companion-sidecar',
        config: {
          kind: 'companion-sidecar',
          enabled: false,
          moduleName: 'Proactive Companion',
          pluginId: 'local.proactive-companion',
          expectedWsUrl: 'ws://127.0.0.1:6121/ws',
        },
        status: {
          kind: 'companion-sidecar',
          state: 'disabled',
          summary: 'Companion sidecar integration is disabled.',
          checkedAt: 1,
        },
      },
    ])))
    invokeMap.set(electronExternalIntegrationsImportLegacyMcp, vi.fn(async () => ({
      sourceProfilePath: 'C:\\Users\\Lenovo\\AppData\\Roaming\\ai.moeru.airi',
      sourceMcpPath: 'C:\\Users\\Lenovo\\AppData\\Roaming\\ai.moeru.airi\\mcp.json',
      targetProfilePath: 'C:\\Users\\Lenovo\\AppData\\Roaming\\@proj-airi\\stage-tamagotchi',
      targetMcpPath: 'C:\\Users\\Lenovo\\AppData\\Roaming\\@proj-airi\\stage-tamagotchi\\mcp.json',
      snapshots: [
        {
          kind: 'memory',
          config: {
            kind: 'memory',
            enabled: true,
            rootPath: 'D:\\AIRI-Memory',
            filesystemServerName: 'filesystem',
            obsidianServerName: 'obsidian',
          },
          status: {
            kind: 'memory',
            state: 'ready',
            summary: 'Memory integration is ready.',
            checkedAt: 2,
            lastSuccessAt: 2,
          },
        },
        {
          kind: 'companion-sidecar',
          config: {
            kind: 'companion-sidecar',
            enabled: false,
            moduleName: 'Proactive Companion',
            pluginId: 'local.proactive-companion',
            expectedWsUrl: 'ws://127.0.0.1:6121/ws',
          },
          status: {
            kind: 'companion-sidecar',
            state: 'disabled',
            summary: 'Companion sidecar integration is disabled.',
            checkedAt: 2,
          },
        },
      ],
    })))
    invokeMap.set(electronExternalIntegrationsProbeNow, vi.fn())
    invokeMap.set(electronExternalIntegrationsSaveConfig, vi.fn())
    invokeMap.set(electronAppOpenUserDataFolder, vi.fn(async () => ({ path: 'C:\\Users\\Lenovo\\AppData\\Roaming\\@proj-airi\\stage-tamagotchi' })))

    const { useExternalIntegrationsSettingsStore } = await import('./external-integrations')
    const store = useExternalIntegrationsSettingsStore()

    await store.refresh()
    await store.importLegacyMcp()

    expect(store.memoryStatus?.state).toBe('ready')
    expect(store.lastImportResult?.sourceProfilePath).toBe('C:\\Users\\Lenovo\\AppData\\Roaming\\ai.moeru.airi')
    expect(toastSuccessMock).toHaveBeenCalledWith('Imported MCP config from the current AIRI desktop profile.')
  })
})
