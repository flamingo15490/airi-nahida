import type { CompanionCoordinationManager } from '../companion-coordination'
import type { ExternalIntegrationsManager } from '../external-integrations'
import type { ExternalMemoryManager } from '../external-memory'
import type { GodotStageManager } from '../godot-stage'
import type { NahidaPersonaManager } from '../nahida-persona'
import type { ProactiveCompanionManager } from '../proactive-companion'

import {
  createDefaultExternalMemoryJudgementSnapshot,
  createDefaultExternalMemoryTurnSnapshot,
  createDefaultExternalMemoryUsageSnapshot,
  createExternalMemoryReasonSnapshot,
  EXTERNAL_MEMORY_LAYER_KINDS,
} from '@proj-airi/stage-ui/stores/external-memory-shared'
import { createDefaultNahidaPersonaSettings } from '@proj-airi/stage-ui/stores/nahida-persona-shared'
import { createDefaultProactiveCompanionRuntimeSnapshot } from '@proj-airi/stage-ui/stores/proactive-companion-shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { deriveOverallHealth } from '../../../../shared/system-health'
import { createSystemHealthManager } from './index'

vi.mock('electron', () => ({
  ipcMain: {},
}))

vi.mock('@moeru/eventa/adapters/electron/main', async () => {
  const eventa = await import('@moeru/eventa')
  return {
    createContext: () => ({
      context: eventa.createContext(),
      dispose: () => {},
    }),
  }
})

function createMemoryContextSnapshot(params: {
  state?: 'ready' | 'degraded'
  summary: string
  readAt: number
  usedKinds: Array<'user-profile'>
  usedLayers: Array<'stable-profile'>
  sections: {
    userProfile: string[]
    preferences: string[]
    followUps: string[]
    recentSummary: string[]
    characterKnowledge: string[]
  }
}) {
  const usedKinds = [...params.usedKinds]
  const usedLayers = [...params.usedLayers]

  return {
    state: params.state ?? 'ready' as const,
    reason: createExternalMemoryReasonSnapshot(usedKinds.length > 0 ? 'context-loaded' : 'context-empty'),
    summary: params.summary,
    readAt: params.readAt,
    layerOrder: [...EXTERNAL_MEMORY_LAYER_KINDS],
    documents: [],
    usedKinds,
    usedLayers,
    turn: {
      ...createDefaultExternalMemoryTurnSnapshot(),
      readAt: params.readAt,
      usedLayers,
      summary: params.summary,
    },
    sections: params.sections,
  }
}

function createManagerDependencies(overrides?: {
  companionCoordinationManager?: Partial<CompanionCoordinationManager>
  externalIntegrationsManager?: Partial<ExternalIntegrationsManager>
  externalMemoryManager?: Partial<ExternalMemoryManager>
  godotStageManager?: Partial<GodotStageManager>
  nahidaPersonaManager?: Partial<NahidaPersonaManager>
  proactiveCompanionManager?: Partial<ProactiveCompanionManager>
}) {
  const externalMemoryManager: ExternalMemoryManager = {
    getLastMemoryUsage: () => ({
      ...createDefaultExternalMemoryUsageSnapshot(),
      bridgeState: 'ready',
      reason: createExternalMemoryReasonSnapshot('bridge-ready'),
      summary: 'External memory bridge is healthy.',
      lastReadAt: 100,
      lastReadSummary: 'Loaded trusted external memory.',
      lastUsedDocumentKinds: ['user-profile'],
      context: createMemoryContextSnapshot({
        summary: 'Loaded trusted external memory.',
        readAt: 100,
        usedKinds: ['user-profile'],
        usedLayers: ['stable-profile'],
        sections: {
          userProfile: ['Prefers concise replies.'],
          preferences: [],
          followUps: [],
          recentSummary: [],
          characterKnowledge: [],
        },
      }),
    }),
    recordMemoryObservation: async () => createDefaultExternalMemoryJudgementSnapshot(),
    refreshMemoryJudgement: async () => createDefaultExternalMemoryJudgementSnapshot(),
    getMemoryJudgementSnapshot: async () => createDefaultExternalMemoryJudgementSnapshot(),
    clearMemoryCandidateLedger: async () => createDefaultExternalMemoryJudgementSnapshot(),
    clearMemoryWriteCandidateHistory: () => createDefaultExternalMemoryUsageSnapshot(),
    loadMemoryContext: async () => {
      throw new Error('Not used in system-health tests.')
    },
    refreshMemoryContext: async () => createMemoryContextSnapshot({
      summary: 'Loaded trusted external memory.',
      readAt: 100,
      usedKinds: ['user-profile'],
      usedLayers: ['stable-profile'],
      sections: {
        userProfile: ['Prefers concise replies.'],
        preferences: [],
        followUps: [],
        recentSummary: [],
        characterKnowledge: [],
      },
    }),
    writeFollowUpItems: async () => {
      throw new Error('Not used in system-health tests.')
    },
    writePreferencesPatch: async () => {
      throw new Error('Not used in system-health tests.')
    },
    writeRecentSummary: async () => {
      throw new Error('Not used in system-health tests.')
    },
    writeUserProfilePatch: async () => {
      throw new Error('Not used in system-health tests.')
    },
    ...overrides?.externalMemoryManager,
  }

  const proactiveCompanionManager: ProactiveCompanionManager = {
    clearHistory: async () => createDefaultProactiveCompanionRuntimeSnapshot(),
    evaluateSparkNotify: () => ({
      managed: false,
      runtime: createDefaultProactiveCompanionRuntimeSnapshot(),
    }),
    getRuntimeSnapshot: () => ({
      ...createDefaultProactiveCompanionRuntimeSnapshot(),
      state: 'ready',
      summary: 'Proactive companion governance is ready.',
      sidecarConnected: true,
      sidecarSummary: 'Companion sidecar is connected to the current AIRI server channel.',
      refreshedAt: 200,
    }),
    loadConfig: () => createDefaultProactiveCompanionRuntimeSnapshot().settings,
    recordContextUpdate: () => createDefaultProactiveCompanionRuntimeSnapshot(),
    refreshRuntime: async () => ({
      ...createDefaultProactiveCompanionRuntimeSnapshot(),
      state: 'ready',
      summary: 'Proactive companion governance is ready.',
      sidecarConnected: true,
      sidecarSummary: 'Companion sidecar is connected to the current AIRI server channel.',
      refreshedAt: 200,
    }),
    saveConfig: settings => settings,
    importLegacyProactiveConfig: async () => ({
      mappedFields: [],
      unmappedFields: [],
      sourceMode: 'external-sidecar' as const,
      switchedToEmbedded: false,
      settings: createDefaultProactiveCompanionRuntimeSnapshot().settings,
      importedAt: Date.now(),
    }),
    getProactiveCompanionSourceMode: () => 'external-sidecar' as const,
    setProactiveCompanionSourceMode: () => createDefaultProactiveCompanionRuntimeSnapshot(),
    triggerManualCheckIn: async () => ({
      ok: true,
      message: 'manual check-in',
      runtime: createDefaultProactiveCompanionRuntimeSnapshot(),
    }),
    simulateProactiveSignal: async () => ({
      ok: true,
      message: 'simulated',
      runtime: createDefaultProactiveCompanionRuntimeSnapshot(),
    }),
    pauseProactiveCompanion: async () => createDefaultProactiveCompanionRuntimeSnapshot(),
    clearProactiveCooldowns: async () => createDefaultProactiveCompanionRuntimeSnapshot(),
    recordVisionObservation: async () => ({
      ok: true,
      message: 'recorded',
      runtime: createDefaultProactiveCompanionRuntimeSnapshot(),
    }),
    subscribeRuntimeEvents: () => () => {},
    ...overrides?.proactiveCompanionManager,
  }

  const nahidaPersonaManager: NahidaPersonaManager = {
    getConfig: () => ({
      ...createDefaultNahidaPersonaSettings(),
      enabled: true,
      mode: 'balanced',
    }),
    getSnapshot: () => ({
      ...createDefaultNahidaPersonaSettings(),
      enabled: true,
      mode: 'balanced',
      activeCardName: 'Nahida',
      activeDisplayModelName: 'Nahida',
      matchesActiveCard: true,
      isActive: true,
      summary: 'Nahida persona layer is active in balanced mode.',
      activeModeSummary: 'Balanced continuity.',
      sections: [],
    }),
    getTargetContext: () => ({
      activeCardName: 'Nahida',
      activeDisplayModelName: 'Nahida',
    }),
    saveConfig: settings => settings,
    updateTargetContext: context => ({
      activeCardName: context?.activeCardName,
      activeDisplayModelName: context?.activeDisplayModelName,
    }),
    ...overrides?.nahidaPersonaManager,
  }

  const companionCoordinationManager: CompanionCoordinationManager = {
    clearHistory: async () => ({
      status: 'ready',
      reason: {
        code: 'phase-ready',
        message: 'Phase-six coordination is aligned.',
      },
      summary: 'All frozen coordination surfaces are aligned for phase six.',
      surfaces: [],
      readyCount: 3,
      attentionCount: 0,
      inactiveCount: 0,
      updatedAt: 300,
    }),
    getSnapshot: async () => ({
      status: 'ready',
      reason: {
        code: 'phase-ready',
        message: 'Phase-six coordination is aligned.',
      },
      summary: 'All frozen coordination surfaces are aligned for phase six.',
      surfaces: [],
      readyCount: 3,
      attentionCount: 0,
      inactiveCount: 0,
      updatedAt: 300,
    }),
    refresh: async () => ({
      status: 'ready',
      reason: {
        code: 'phase-ready',
        message: 'Phase-six coordination is aligned.',
      },
      summary: 'All frozen coordination surfaces are aligned for phase six.',
      surfaces: [],
      readyCount: 3,
      attentionCount: 0,
      inactiveCount: 0,
      updatedAt: 300,
    }),
    refreshForSparkNotify: async () => ({
      snapshot: {
        status: 'ready',
        reason: {
          code: 'phase-ready',
          message: 'Phase-six coordination is aligned.',
        },
        summary: 'All frozen coordination surfaces are aligned for phase six.',
        surfaces: [],
        readyCount: 3,
        attentionCount: 0,
        inactiveCount: 0,
        updatedAt: 300,
      },
      persona: nahidaPersonaManager.getSnapshot(),
    }),
    ...overrides?.companionCoordinationManager,
  }

  const externalIntegrationsManager: ExternalIntegrationsManager = {
    getSnapshots: () => [
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
          checkedAt: 10,
          lastSuccessAt: 10,
        },
      },
      {
        kind: 'companion-sidecar',
        config: {
          kind: 'companion-sidecar',
          enabled: true,
          moduleName: 'Proactive Companion',
          pluginId: 'local.proactive-companion',
          expectedWsUrl: 'ws://127.0.0.1:6121/ws',
        },
        status: {
          kind: 'companion-sidecar',
          state: 'ready',
          summary: 'Companion sidecar is connected to the current AIRI server channel.',
          checkedAt: 20,
          lastSuccessAt: 20,
        },
      },
    ],
    importLegacyMcpConfig: async () => {
      throw new Error('Not used in system-health tests.')
    },
    probeNow: async kind => ({
      kind,
      config: kind === 'memory'
        ? {
            kind: 'memory',
            enabled: true,
            rootPath: 'D:\\AIRI-Memory',
            filesystemServerName: 'filesystem',
            obsidianServerName: 'obsidian',
          }
        : {
            kind: 'companion-sidecar',
            enabled: true,
            moduleName: 'Proactive Companion',
            pluginId: 'local.proactive-companion',
            expectedWsUrl: 'ws://127.0.0.1:6121/ws',
          },
      status: {
        kind,
        state: 'ready',
        summary: `${kind} integration is ready.`,
        checkedAt: Date.now(),
        lastSuccessAt: Date.now(),
      },
    }),
    saveConfig: async () => {
      throw new Error('Not used in system-health tests.')
    },
    ...overrides?.externalIntegrationsManager,
  }

  const godotStageManager: GodotStageManager = {
    applySceneInput: async () => {},
    applyViewPatch: async () => ({ requestId: 'view-patch' }),
    getStatus: () => ({
      state: 'stopped',
      pid: null,
      updatedAt: 400,
    }),
    getViewSnapshot: () => null,
    requestViewSnapshot: async () => ({ requestId: 'view-snapshot' }),
    start: async () => ({
      state: 'running',
      pid: 123,
      updatedAt: 401,
    }),
    stop: async () => ({
      state: 'stopped',
      pid: null,
      updatedAt: 402,
    }),
    subscribe: () => () => {},
    subscribeViewError: () => () => {},
    subscribeViewSnapshot: () => () => {},
    ...overrides?.godotStageManager,
  }

  return {
    companionCoordinationManager,
    externalIntegrationsManager,
    externalMemoryManager,
    godotStageManager,
    nahidaPersonaManager,
    proactiveCompanionManager,
  }
}

describe('system health manager', () => {
  it('aggregates subsystem probes and derives overall health from the shared helper', async () => {
    const manager = createSystemHealthManager(createManagerDependencies({
      godotStageManager: {
        getStatus: () => ({
          state: 'error',
          pid: null,
          lastError: 'Godot stage did not report ready in time.',
          updatedAt: 401,
        }),
      },
    }))

    const snapshot = await manager.refresh()

    expect(snapshot.subsystems.map(probe => probe.kind)).toEqual([
      'memory',
      'persona',
      'proactive',
      'coordination',
      'integrations',
      'vision',
    ])
    expect(snapshot.overall).toBe(deriveOverallHealth(snapshot.subsystems))
    expect(snapshot.overall).toBe('unhealthy')
    expect(snapshot.subsystems.find(probe => probe.kind === 'vision')?.status).toBe('unhealthy')
    expect(snapshot.startupPhase).toBe(true)
  })

  it('downgrades healthy cached probes when the latest refresh fails', async () => {
    const manager = createSystemHealthManager(createManagerDependencies({
      companionCoordinationManager: {
        getSnapshot: async () => ({
          status: 'ready',
          reason: {
            code: 'phase-ready',
            message: 'Phase-six coordination is aligned.',
          },
          summary: 'All frozen coordination surfaces are aligned for phase six.',
          surfaces: [],
          readyCount: 3,
          attentionCount: 0,
          inactiveCount: 0,
          updatedAt: 300,
        }),
        refresh: async () => {
          throw new Error('coordination refresh stalled')
        },
      },
      externalMemoryManager: {
        refreshMemoryContext: async () => {
          throw new Error('memory refresh stalled')
        },
      },
      proactiveCompanionManager: {
        refreshRuntime: async () => {
          throw new Error('proactive refresh stalled')
        },
      },
    }))

    const snapshot = await manager.refresh()
    const memoryProbe = snapshot.subsystems.find(probe => probe.kind === 'memory')
    const proactiveProbe = snapshot.subsystems.find(probe => probe.kind === 'proactive')
    const coordinationProbe = snapshot.subsystems.find(probe => probe.kind === 'coordination')

    expect(memoryProbe?.status).toBe('degraded')
    expect(memoryProbe?.summary).toBe('Memory bridge needs attention.')
    expect(memoryProbe?.detail).toContain('Latest refresh error: memory refresh stalled.')

    expect(proactiveProbe?.status).toBe('degraded')
    expect(proactiveProbe?.summary).toBe('Proactive companion needs attention.')
    expect(proactiveProbe?.detail).toContain('Latest refresh error: proactive refresh stalled.')

    expect(coordinationProbe?.status).toBe('degraded')
    expect(coordinationProbe?.summary).toBe('Coordination needs attention.')
    expect(coordinationProbe?.detail).toContain('Latest refresh error: coordination refresh stalled.')

    expect(snapshot.overall).toBe('degraded')
  })

  it('keeps startupPhase active until startup diagnostics finish', async () => {
    const manager = createSystemHealthManager(createManagerDependencies())

    const firstSnapshot = await manager.getSnapshot()
    expect(firstSnapshot.startupPhase).toBe(true)

    const secondSnapshot = await manager.getSnapshot()
    expect(secondSnapshot.startupPhase).toBe(true)

    await manager.runStartupDiagnostics()

    const thirdSnapshot = await manager.getSnapshot()
    expect(thirdSnapshot.startupPhase).toBe(false)
    expect(thirdSnapshot.overall).toBe(firstSnapshot.overall)
  })

  it('reports warnings for degraded or unavailable subsystems and failures for fatal vision errors', async () => {
    const manager = createSystemHealthManager(createManagerDependencies({
      companionCoordinationManager: {
        getSnapshot: async () => ({
          status: 'attention',
          reason: {
            code: 'phase-attention',
            message: 'Coordination still needs attention.',
          },
          summary: '1 coordination surface needs attention in the current phase.',
          surfaces: [],
          readyCount: 2,
          attentionCount: 1,
          inactiveCount: 0,
          updatedAt: 310,
        }),
        refresh: async () => ({
          status: 'attention',
          reason: {
            code: 'phase-attention',
            message: 'Coordination still needs attention.',
          },
          summary: '1 coordination surface needs attention in the current phase.',
          surfaces: [],
          readyCount: 2,
          attentionCount: 1,
          inactiveCount: 0,
          updatedAt: 310,
        }),
      },
      externalMemoryManager: {
        getLastMemoryUsage: () => ({
          ...createDefaultExternalMemoryUsageSnapshot(),
          bridgeState: 'degraded',
          reason: createExternalMemoryReasonSnapshot('bridge-degraded'),
          summary: 'Memory root path is unavailable.',
          lastReadAt: 110,
          lastReadError: 'Memory root path is unavailable.',
          lastUsedDocumentKinds: [],
        }),
        refreshMemoryContext: async () => createMemoryContextSnapshot({
          state: 'degraded',
          summary: 'Memory root path is unavailable.',
          readAt: 110,
          usedKinds: [],
          usedLayers: [],
          sections: {
            userProfile: [],
            preferences: [],
            followUps: [],
            recentSummary: [],
            characterKnowledge: [],
          },
        }),
      },
      externalIntegrationsManager: {
        getSnapshots: () => [
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
              summary: 'Filesystem MCP server is not running.',
              checkedAt: 10,
            },
          },
          {
            kind: 'companion-sidecar',
            config: {
              kind: 'companion-sidecar',
              enabled: true,
              moduleName: 'Proactive Companion',
              pluginId: 'local.proactive-companion',
              expectedWsUrl: 'ws://127.0.0.1:6121/ws',
            },
            status: {
              kind: 'companion-sidecar',
              state: 'ready',
              summary: 'Companion sidecar is connected to the current AIRI server channel.',
              checkedAt: 20,
            },
          },
        ],
      },
      godotStageManager: {
        getStatus: () => ({
          state: 'error',
          pid: null,
          lastError: 'Godot stage did not report ready in time.',
          updatedAt: 401,
        }),
      },
      proactiveCompanionManager: {
        getRuntimeSnapshot: () => ({
          ...createDefaultProactiveCompanionRuntimeSnapshot(),
          state: 'degraded',
          summary: 'Companion sidecar is connected through AIRI, but proactive delivery is currently degraded.',
          sidecarConnected: false,
          sidecarSummary: 'Companion sidecar is not connected to the current AIRI server channel.',
          lastFailureReason: 'Companion sidecar is not connected to the current AIRI server channel.',
          refreshedAt: 220,
        }),
        refreshRuntime: async () => ({
          ...createDefaultProactiveCompanionRuntimeSnapshot(),
          state: 'degraded',
          summary: 'Companion sidecar is connected through AIRI, but proactive delivery is currently degraded.',
          sidecarConnected: false,
          sidecarSummary: 'Companion sidecar is not connected to the current AIRI server channel.',
          lastFailureReason: 'Companion sidecar is not connected to the current AIRI server channel.',
          refreshedAt: 220,
        }),
      },
    }))

    const result = await manager.runStartupDiagnostics()

    expect(result.passed).toBe(false)
    expect(result.warnings.some(item => item.kind === 'memory')).toBe(true)
    expect(result.warnings.some(item => item.kind === 'proactive')).toBe(true)
    expect(result.warnings.some(item => item.kind === 'coordination')).toBe(true)
    expect(result.warnings.some(item => item.kind === 'integrations')).toBe(true)
    expect(result.failures).toEqual([
      {
        kind: 'vision',
        message: 'Godot stage did not report ready in time.',
      },
    ])
    expect(result.duration).toBeGreaterThanOrEqual(0)
  })

  it('reports refresh failures as startup diagnostics warnings even when cached snapshots still look healthy', async () => {
    const manager = createSystemHealthManager(createManagerDependencies({
      companionCoordinationManager: {
        getSnapshot: async () => ({
          status: 'ready',
          reason: {
            code: 'phase-ready',
            message: 'Phase-six coordination is aligned.',
          },
          summary: 'All frozen coordination surfaces are aligned for phase six.',
          surfaces: [],
          readyCount: 3,
          attentionCount: 0,
          inactiveCount: 0,
          updatedAt: 300,
        }),
        refresh: async () => {
          throw new Error('coordination refresh stalled')
        },
      },
      externalMemoryManager: {
        refreshMemoryContext: async () => {
          throw new Error('memory refresh stalled')
        },
      },
      proactiveCompanionManager: {
        refreshRuntime: async () => {
          throw new Error('proactive refresh stalled')
        },
      },
    }))

    const diagnostics = await manager.runStartupDiagnostics()

    expect(diagnostics.passed).toBe(true)
    expect(diagnostics.failures).toEqual([])
    expect(diagnostics.warnings).toEqual([
      {
        kind: 'memory',
        message: 'Memory bridge needs attention.',
      },
      {
        kind: 'proactive',
        message: 'Proactive companion needs attention.',
      },
      {
        kind: 'coordination',
        message: 'Coordination needs attention.',
      },
    ])
  })
})

describe('system health service', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('registers the three frozen Eventa invoke handlers on the main-process context', async () => {
    const handlers = new Map<string, (payload: unknown) => unknown>()

    vi.doMock('@moeru/eventa', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@moeru/eventa')>()
      return {
        ...actual,
        defineInvokeHandler: (_context: unknown, eventa: { sendEvent: { id: string } }, handler: (payload: unknown) => unknown) => {
          handlers.set(eventa.sendEvent.id.replace(/-send$/, ''), handler)
          return vi.fn()
        },
      }
    })

    const module = await import('./index')
    const manager = {
      getSnapshot: vi.fn(async () => ({
        overall: 'healthy' as const,
        subsystems: [],
        startupPhase: false,
        checkedAt: 1,
      })),
      refresh: vi.fn(async () => ({
        overall: 'degraded' as const,
        subsystems: [],
        startupPhase: false,
        checkedAt: 2,
      })),
      runStartupDiagnostics: vi.fn(async () => ({
        passed: true,
        warnings: [],
        failures: [],
        duration: 3,
      })),
    }

    module.createSystemHealthService({
      manager,
    })

    const getSnapshot = handlers.get('eventa:invoke:electron:system-health:get-snapshot')
    const refresh = handlers.get('eventa:invoke:electron:system-health:refresh')
    const runStartupDiagnostics = handlers.get('eventa:invoke:electron:system-health:run-startup-diagnostics')

    expect(getSnapshot).toBeDefined()
    expect(refresh).toBeDefined()
    expect(runStartupDiagnostics).toBeDefined()

    await expect(getSnapshot?.(undefined)).resolves.toEqual({
      overall: 'healthy',
      subsystems: [],
      startupPhase: false,
      checkedAt: 1,
    })
    await expect(refresh?.(undefined)).resolves.toEqual({
      overall: 'degraded',
      subsystems: [],
      startupPhase: false,
      checkedAt: 2,
    })
    await expect(runStartupDiagnostics?.(undefined)).resolves.toEqual({
      passed: true,
      warnings: [],
      failures: [],
      duration: 3,
    })
  })
})
