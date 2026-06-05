import type {
  ExternalMemoryContextSnapshot,
  ExternalMemoryUsageSnapshot,
  ExternalMemoryWriteResult,
} from './external-memory-shared'
import type { NahidaPersonaSnapshot } from './nahida-persona-shared'
import type { ProactiveCompanionRuntimeSnapshot } from './proactive-companion-shared'

import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { composeCompanionCoordinationSnapshot } from './companion-coordination-shared'
import { useCompanionCoordinationStore } from './companion-coordination-store'
import {
  createDefaultExternalMemoryTurnSnapshot,
  createDefaultExternalMemoryUsageSnapshot,
  createExternalMemoryReasonSnapshot,
  EXTERNAL_MEMORY_LAYER_KINDS,
} from './external-memory-shared'
import { createDefaultNahidaPersonaSettings } from './nahida-persona-shared'
import { createDefaultProactiveCompanionRuntimeSnapshot } from './proactive-companion-shared'

vi.mock('./external-memory-store', () => ({
  useExternalMemoryStore: () => ({
    usage: {
      ...createDefaultExternalMemoryUsageSnapshot(),
      bridgeState: 'ready',
      reason: createExternalMemoryReasonSnapshot('bridge-ready'),
      summary: 'External memory bridge is healthy.',
      lastReadAt: 1,
      lastUsedDocumentKinds: ['user-profile'],
      context: createMemoryContextSnapshot({
        summary: 'Loaded.',
        readAt: 1,
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
    },
  }),
}))

vi.mock('./nahida-persona-store', () => ({
  useNahidaPersonaStore: () => ({
    activeCardName: 'Nahida',
    activeDisplayModelName: 'Nahida',
    snapshot: {
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
    },
  }),
}))

vi.mock('./proactive-companion-store', () => ({
  useProactiveCompanionStore: () => ({
    runtime: {
      ...createDefaultProactiveCompanionRuntimeSnapshot(),
      state: 'ready',
      summary: 'Proactive governance is healthy.',
      sidecarConnected: true,
      sidecarSummary: 'Companion sidecar is connected.',
      refreshedAt: 2,
    },
  }),
}))

function createReadyPersonaSnapshot(overrides: Partial<NahidaPersonaSnapshot> = {}): NahidaPersonaSnapshot {
  return {
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
    ...overrides,
  }
}

function createDisabledPersonaSnapshot(overrides: Partial<NahidaPersonaSnapshot> = {}): NahidaPersonaSnapshot {
  return {
    ...createDefaultNahidaPersonaSettings(),
    activeCardName: 'Nahida',
    activeDisplayModelName: 'Nahida',
    matchesActiveCard: true,
    isActive: false,
    summary: 'Nahida persona layer is disabled.',
    activeModeSummary: 'Balanced continuity.',
    sections: [],
    ...overrides,
  }
}

function createReadyProactiveRuntimeSnapshot(overrides: Partial<ProactiveCompanionRuntimeSnapshot> = {}): ProactiveCompanionRuntimeSnapshot {
  return {
    ...createDefaultProactiveCompanionRuntimeSnapshot(),
    state: 'ready',
    summary: 'Proactive governance is healthy.',
    sidecarConnected: true,
    sidecarSummary: 'Companion sidecar is connected to the current AIRI server channel.',
    refreshedAt: 20,
    ...overrides,
  }
}

function createDisabledProactiveRuntimeSnapshot(overrides: Partial<ProactiveCompanionRuntimeSnapshot> = {}): ProactiveCompanionRuntimeSnapshot {
  return {
    ...createDefaultProactiveCompanionRuntimeSnapshot(),
    state: 'disabled',
    summary: 'Proactive governance is disabled.',
    sidecarConnected: false,
    sidecarSummary: 'Companion sidecar status is unavailable.',
    refreshedAt: 30,
    ...overrides,
  }
}

function createDisabledMemorySnapshot(overrides: Partial<ExternalMemoryUsageSnapshot> = {}): ExternalMemoryUsageSnapshot {
  return {
    ...createDefaultExternalMemoryUsageSnapshot(),
    bridgeState: 'disabled',
    reason: createExternalMemoryReasonSnapshot('bridge-disabled'),
    summary: 'External memory bridge is disabled.',
    lastUsedDocumentKinds: [],
    ...overrides,
  }
}

function createMemoryContextSnapshot(params: {
  summary: string
  readAt: number
  usedKinds: Array<'user-profile' | 'preferences'>
  usedLayers: Array<'stable-profile' | 'stable-preferences'>
  sections: {
    userProfile: string[]
    preferences: string[]
    followUps: string[]
    recentSummary: string[]
    characterKnowledge: string[]
  }
}): ExternalMemoryContextSnapshot {
  return {
    state: 'ready' as const,
    reason: createExternalMemoryReasonSnapshot(params.usedKinds.length > 0 ? 'context-loaded' : 'context-empty'),
    summary: params.summary,
    readAt: params.readAt,
    layerOrder: [...EXTERNAL_MEMORY_LAYER_KINDS],
    usedKinds: [...params.usedKinds],
    usedLayers: [...params.usedLayers],
    documents: [],
    turn: {
      ...createDefaultExternalMemoryTurnSnapshot(),
      readAt: params.readAt,
      usedLayers: [...params.usedLayers],
      summary: params.summary,
    },
    sections: params.sections,
  }
}

function createWriteResult(params: {
  kind: 'follow-ups' | 'preferences' | 'recent-summary'
  decision: 'written' | 'skipped-duplicate' | 'skipped-unavailable'
  summary: string
  writtenAt: number
  ok: boolean
  changed: boolean
  error?: string
}): ExternalMemoryWriteResult {
  const layer: ExternalMemoryWriteResult['layer'] = params.kind === 'follow-ups'
    ? 'active-follow-ups'
    : params.kind === 'preferences'
      ? 'stable-preferences'
      : 'recent-context'
  const reasonCode = params.decision === 'written'
    ? 'write-written'
    : params.decision === 'skipped-duplicate'
      ? 'write-skipped-duplicate'
      : 'write-skipped-unavailable'

  return {
    kind: params.kind,
    layer,
    ok: params.ok,
    changed: params.changed,
    decision: params.decision,
    reason: createExternalMemoryReasonSnapshot(reasonCode),
    summary: params.summary,
    writtenAt: params.writtenAt,
    error: params.error,
    review: {
      reviewedAt: params.writtenAt,
      summary: `Reviewed ${params.kind}.`,
      decision: params.decision,
      reason: createExternalMemoryReasonSnapshot(reasonCode),
      candidates: [],
    },
  }
}

describe('companion coordination snapshot', () => {
  beforeEach(() => {
    setActivePinia(createTestingPinia({ createSpy: vi.fn, stubActions: false }))
  })

  it('keeps the phase ready when all frozen surfaces are aligned', () => {
    const snapshot = composeCompanionCoordinationSnapshot({
      memoryUsage: {
        ...createDefaultExternalMemoryUsageSnapshot(),
        bridgeState: 'ready',
        reason: createExternalMemoryReasonSnapshot('bridge-ready'),
        summary: 'External memory bridge is healthy.',
        lastReadAt: 10,
        lastUsedDocumentKinds: ['user-profile', 'preferences'],
        context: createMemoryContextSnapshot({
          summary: 'Loaded.',
          readAt: 10,
          usedKinds: ['user-profile', 'preferences'],
          usedLayers: ['stable-profile', 'stable-preferences'],
          sections: {
            userProfile: ['Studies finance.'],
            preferences: ['Prefers concise replies.'],
            followUps: [],
            recentSummary: [],
            characterKnowledge: [],
          },
        }),
      },
      persona: createReadyPersonaSnapshot(),
      proactiveRuntime: createReadyProactiveRuntimeSnapshot(),
    })

    expect(snapshot.status).toBe('ready')
    expect(snapshot.reason.code).toBe('phase-ready')
    expect(snapshot.readyCount).toBe(3)
    expect(snapshot.attentionCount).toBe(0)
    expect(snapshot.inactiveCount).toBe(0)
    expect(snapshot.surfaces.map(surface => surface.surface)).toEqual(['memory', 'persona', 'proactive'])
    expect(snapshot.surfaces[0]?.overview.coverage).toContain('用户信息、偏好设置')
    expect(snapshot.surfaces[1]?.reason.code).toBe('persona-active')
    expect(snapshot.surfaces[1]?.overview.activity).toBe('人格模式：平衡。Balanced continuity.')
    expect(snapshot.surfaces[1]?.overview.coverage).toBe('角色卡：Nahida。 展示模型：Nahida。')
    expect(snapshot.surfaces[2]?.reason.code).toBe('proactive-ready')
    expect(snapshot.updatedAt).toBe(20)
  })

  it('surfaces attention without rewriting underlying subsystem states', () => {
    const snapshot = composeCompanionCoordinationSnapshot({
      memoryUsage: {
        ...createDefaultExternalMemoryUsageSnapshot(),
        bridgeState: 'degraded',
        reason: createExternalMemoryReasonSnapshot('bridge-degraded'),
        summary: 'Last memory read failed.',
        lastReadAt: 12,
        lastReadError: 'Filesystem bridge timeout.',
        lastUsedDocumentKinds: [],
      },
      persona: createReadyPersonaSnapshot({
        activeCardName: 'ReLU',
        activeDisplayModelName: 'ReLU',
        matchesActiveCard: false,
        isActive: false,
        summary: 'Current active card is not recognized as Nahida.',
      }),
      proactiveRuntime: createReadyProactiveRuntimeSnapshot({
        summary: 'Cooldown is active.',
        refreshedAt: 18,
        recentDecisions: [{
          event: {
            id: 'sidecar-1',
            source: 'plugin:local.proactive-companion',
            kind: 'reminder',
            headline: 'Drink water',
            topicKey: 'drink water',
            destinations: ['character'],
            receivedAt: 15,
          },
          decision: 'suppressed',
          reason: 'Suppressed because the global proactive cooldown is still active after a recent delivered reminder.',
          presentation: 'silent',
          matchedSource: true,
          sidecarReady: true,
          cooldownUntil: Date.now() + 60_000,
          decidedAt: 16,
        }],
      }),
    })

    expect(snapshot.status).toBe('attention')
    expect(snapshot.reason.code).toBe('phase-attention')
    expect(snapshot.attentionCount).toBe(2)
    expect(snapshot.readyCount).toBe(1)
    expect(snapshot.surfaces[0]?.reason.code).toBe('memory-degraded')
    expect(snapshot.surfaces[1]?.reason.code).toBe('persona-target-mismatch')
    expect(snapshot.surfaces[1]?.overview.activity).toBe('人格模式：平衡。已启用，正在等待命中纳西妲目标。')
    expect(snapshot.surfaces[1]?.overview.coverage).toBe('角色卡：ReLU。 展示模型：ReLU。')
    expect(snapshot.surfaces[2]?.reason.code).toBe('proactive-cooldown-active')
    expect(snapshot.surfaces[2]?.status).toBe('ready')
  })

  it('keeps disabled surfaces inactive with frozen overview fields', () => {
    const snapshot = composeCompanionCoordinationSnapshot({
      memoryUsage: createDisabledMemorySnapshot(),
      persona: createDisabledPersonaSnapshot(),
      proactiveRuntime: createDisabledProactiveRuntimeSnapshot(),
    })

    expect(snapshot.status).toBe('inactive')
    expect(snapshot.reason.code).toBe('phase-inactive')
    expect(snapshot.inactiveCount).toBe(3)
    expect(snapshot.surfaces.every(surface => surface.status === 'inactive')).toBe(true)
    expect(snapshot.surfaces[0]?.overview).toMatchObject({
      summary: 'External memory bridge is disabled.',
    })
    expect(snapshot.surfaces[1]?.overview.activity).toBe('人格模式：平衡。已由用户关闭。')
    expect(snapshot.surfaces[1]?.overview.coverage).toBe('角色卡：Nahida。 展示模型：Nahida。')
    expect(snapshot.surfaces[2]?.overview.updatedAt).toBe(30)
  })

  it('keeps persona ready when the display model matches Nahida even if the active card does not', () => {
    const snapshot = composeCompanionCoordinationSnapshot({
      memoryUsage: createDisabledMemorySnapshot(),
      persona: createReadyPersonaSnapshot({
        mode: 'active',
        activeCardName: 'ReLU',
        activeDisplayModelName: 'Nahida',
        summary: 'Nahida persona layer is active in active mode.',
        activeModeSummary: 'Active continuity.',
      }),
      proactiveRuntime: createDisabledProactiveRuntimeSnapshot(),
    })

    expect(snapshot.surfaces[1]?.status).toBe('ready')
    expect(snapshot.surfaces[1]?.reason.code).toBe('persona-active')
    expect(snapshot.surfaces[1]?.overview.activity).toBe('人格模式：主动。Active continuity.')
    expect(snapshot.surfaces[1]?.overview.coverage).toBe('角色卡：ReLU。 展示模型：Nahida。')
  })

  it('keeps memory ready but marks it empty when the latest context has no stable sections', () => {
    const snapshot = composeCompanionCoordinationSnapshot({
      memoryUsage: {
        ...createDefaultExternalMemoryUsageSnapshot(),
        bridgeState: 'ready',
        reason: createExternalMemoryReasonSnapshot('bridge-ready'),
        summary: 'External memory bridge is healthy but the latest context is empty.',
        lastReadAt: 40,
        lastReadSummary: 'Memory context loaded without trusted items.',
        lastUsedDocumentKinds: [],
        context: createMemoryContextSnapshot({
          summary: 'Loaded without stable sections.',
          readAt: 35,
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
      persona: createDisabledPersonaSnapshot(),
      proactiveRuntime: createDisabledProactiveRuntimeSnapshot(),
    })

    expect(snapshot.surfaces[0]?.status).toBe('ready')
    expect(snapshot.surfaces[0]?.reason.code).toBe('memory-empty')
    expect(snapshot.surfaces[0]?.overview.summary).toBe('External memory bridge is healthy but the latest context is empty.')
    expect(snapshot.surfaces[0]?.overview.activity).toBe('最近一次记忆上下文刷新完成，但没有纳入稳定内容。')
    expect(snapshot.surfaces[0]?.overview.coverage).toBe('最近覆盖：最近一次上下文里没有纳入稳定分层。')
    expect(snapshot.surfaces[0]?.overview.updatedAt).toBe(40)
  })

  it('uses memory writes as activity and updatedAt when no context snapshot is available yet', () => {
    const snapshot = composeCompanionCoordinationSnapshot({
      memoryUsage: {
        ...createDefaultExternalMemoryUsageSnapshot(),
        bridgeState: 'disabled',
        reason: createExternalMemoryReasonSnapshot('bridge-disabled'),
        summary: 'External memory bridge is disabled.',
        lastReadSummary: 'Automatic reads are disabled.',
        lastWrite: createWriteResult({
          kind: 'follow-ups',
          ok: true,
          changed: false,
          decision: 'skipped-duplicate',
          summary: 'Follow-up items already matched the latest stable notes.',
          writtenAt: 55,
        }),
        recentWrites: [createWriteResult({
          kind: 'preferences',
          ok: true,
          changed: true,
          decision: 'written',
          summary: 'Updated preferences.',
          writtenAt: 50,
        })],
        lastUsedDocumentKinds: [],
      },
      persona: createDisabledPersonaSnapshot(),
      proactiveRuntime: createDisabledProactiveRuntimeSnapshot(),
    })

    expect(snapshot.surfaces[0]?.status).toBe('inactive')
    expect(snapshot.surfaces[0]?.reason.code).toBe('memory-disabled')
    expect(snapshot.surfaces[0]?.overview.activity).toBe('最近写回未更新待跟进，因为内容已经是最新。')
    expect(snapshot.surfaces[0]?.overview.coverage).toBe('最近覆盖：等待最近一次写回后的上下文刷新。')
    expect(snapshot.surfaces[0]?.overview.updatedAt).toBe(55)
  })

  it('keeps degraded memory attention copy stable when the latest write failed', () => {
    const snapshot = composeCompanionCoordinationSnapshot({
      memoryUsage: {
        ...createDefaultExternalMemoryUsageSnapshot(),
        bridgeState: 'degraded',
        reason: createExternalMemoryReasonSnapshot('bridge-degraded'),
        summary: 'Last memory write failed.',
        lastReadAt: 60,
        lastReadSummary: 'Latest read used stale memory cache.',
        lastWrite: createWriteResult({
          kind: 'recent-summary',
          ok: false,
          changed: false,
          decision: 'skipped-unavailable',
          summary: 'Recent summary write failed because the bridge timed out.',
          writtenAt: 62,
          error: 'Filesystem bridge timeout.',
        }),
        lastUsedDocumentKinds: [],
      },
      persona: createDisabledPersonaSnapshot(),
      proactiveRuntime: createDisabledProactiveRuntimeSnapshot(),
    })

    expect(snapshot.surfaces[0]?.status).toBe('attention')
    expect(snapshot.surfaces[0]?.reason.code).toBe('memory-degraded')
    expect(snapshot.surfaces[0]?.overview.reason).toBe('记忆桥接可以访问，但最近一次读写结果仍需关注。')
    expect(snapshot.surfaces[0]?.overview.activity).toBe('Recent summary write failed because the bridge timed out.')
    expect(snapshot.surfaces[0]?.overview.coverage).toBe('最近覆盖：等待最近一次写回后的上下文刷新。')
    expect(snapshot.surfaces[0]?.overview.updatedAt).toBe(62)
  })

  it('keeps unavailable memory on the frozen unavailable reason code', () => {
    const snapshot = composeCompanionCoordinationSnapshot({
      memoryUsage: {
        ...createDefaultExternalMemoryUsageSnapshot(),
        reason: createExternalMemoryReasonSnapshot('bridge-unavailable'),
        summary: 'External memory bridge is not available in this runtime.',
      },
      persona: createDisabledPersonaSnapshot(),
      proactiveRuntime: createDisabledProactiveRuntimeSnapshot(),
    })

    expect(snapshot.surfaces[0]?.status).toBe('attention')
    expect(snapshot.surfaces[0]?.reason.code).toBe('memory-unavailable')
    expect(snapshot.surfaces[0]?.overview.activity).toBe('还没有记录到记忆活动。')
    expect(snapshot.surfaces[0]?.overview.coverage).toBe('最近覆盖：暂无记录。')
    expect(snapshot.surfaces[0]?.overview.updatedAt).toBeUndefined()
  })

  it('surfaces conflicted candidates and recent stable candidate writeback in the memory surface', () => {
    const snapshot = composeCompanionCoordinationSnapshot({
      memoryUsage: {
        ...createDefaultExternalMemoryUsageSnapshot(),
        bridgeState: 'ready',
        reason: createExternalMemoryReasonSnapshot('bridge-ready'),
        summary: 'External memory bridge is healthy.',
        lastReadAt: 70,
        lastUsedDocumentKinds: ['preferences'],
        context: createMemoryContextSnapshot({
          summary: 'Loaded preferences.',
          readAt: 70,
          usedKinds: ['preferences'],
          usedLayers: ['stable-preferences'],
          sections: {
            userProfile: [],
            preferences: ['Prefers concise replies.'],
            followUps: [],
            recentSummary: [],
            characterKnowledge: [],
          },
        }),
        judgement: {
          ...createDefaultExternalMemoryUsageSnapshot().judgement!,
          summary: '1 conflicted candidate still needs review.',
          reason: 'A newer candidate conflicts with an existing structured value.',
          statusCounts: {
            tentative: 0,
            stable: 1,
            conflicted: 1,
            suppressed: 0,
          },
          conflicts: [{
            id: 'conflict-1',
            kind: 'preferences',
            candidateId: 'candidate-2',
            structuredKey: 'reply-style',
            existingText: 'reply style: concise',
            incomingText: 'reply style: playful',
            summary: 'Reply style candidates conflict.',
            reason: 'The incoming value disagrees with an existing stable candidate.',
          }],
          candidates: [],
          recommendations: [],
        },
        lastWrite: {
          kind: 'preferences',
          layer: 'stable-preferences',
          ok: true,
          changed: true,
          decision: 'written',
          reason: createExternalMemoryReasonSnapshot('write-written'),
          summary: 'Stable preference candidate was written back.',
          writtenAt: 71,
          review: {
            reviewedAt: 71,
            summary: 'Reviewed stable preference candidate.',
            decision: 'written',
            reason: createExternalMemoryReasonSnapshot('write-written'),
            candidates: [{
              layer: 'stable-preferences',
              kind: 'preferences',
              source: 'manual-candidate-review',
              summary: 'Stable preference candidate',
              addItems: ['Prefer concise replies'],
              removeItems: [],
            }],
          },
        },
        recentWrites: [],
      },
      persona: createDisabledPersonaSnapshot(),
      proactiveRuntime: createDisabledProactiveRuntimeSnapshot(),
    })

    expect(snapshot.surfaces[0]?.overview.activity).toContain('conflicted candidate')
    expect(snapshot.surfaces[0]?.overview.activity).toContain('stable candidate 写回')
    expect(snapshot.surfaces[0]?.overview.coverage).toContain('conflicted candidate')
    expect(snapshot.surfaces[0]?.overview.coverage).toContain('stable candidate 写回')
  })

  it('keeps proactive ready with cooldown copy when lastDecision is missing but recent history still has an active cooldown', () => {
    const cooldownUntil = Date.now() + 60_000
    const snapshot = composeCompanionCoordinationSnapshot({
      memoryUsage: createDisabledMemorySnapshot(),
      persona: createDisabledPersonaSnapshot(),
      proactiveRuntime: createReadyProactiveRuntimeSnapshot({
        summary: 'Cooldown is active.',
        recentDecisions: [{
          event: {
            id: 'sidecar-2',
            source: 'plugin:local.proactive-companion',
            kind: 'reminder',
            headline: 'Drink water',
            topicKey: 'drink water',
            destinations: ['character'],
            receivedAt: 10,
          },
          decision: 'suppressed',
          reason: 'Suppressed because the global proactive cooldown is still active after a recent delivered reminder.',
          presentation: 'silent',
          matchedSource: true,
          sidecarReady: true,
          cooldownUntil,
          decidedAt: 11,
        }],
        lastDecision: undefined,
      }),
    })

    expect(snapshot.surfaces[2]?.status).toBe('ready')
    expect(snapshot.surfaces[2]?.reason.code).toBe('proactive-cooldown-active')
    expect(snapshot.surfaces[2]?.overview.activity).toBe('最近判定：已压制。当前可查看 1 条最近判定。')
    expect(snapshot.surfaces[2]?.overview.coverage).toBe('sidecar：Companion sidecar is connected to the current AIRI server channel.')
    expect(snapshot.surfaces[2]?.overview.updatedAt).toBe(20)
  })

  it('keeps proactive activity stable from lastDecision and falls back coverage when sidecarSummary is empty', () => {
    const snapshot = composeCompanionCoordinationSnapshot({
      memoryUsage: createDisabledMemorySnapshot(),
      persona: createDisabledPersonaSnapshot(),
      proactiveRuntime: createReadyProactiveRuntimeSnapshot({
        sidecarSummary: '',
        recentDecisions: [{
          event: {
            id: 'sidecar-3',
            source: 'plugin:local.proactive-companion',
            kind: 'important',
            headline: 'Stand up',
            topicKey: 'stand up',
            destinations: ['character'],
            receivedAt: 12,
          },
          decision: 'suppressed',
          reason: 'Suppressed because a cooldown is active.',
          presentation: 'silent',
          matchedSource: true,
          sidecarReady: true,
          decidedAt: 13,
        }],
        lastDecision: {
          event: {
            id: 'sidecar-4',
            source: 'plugin:local.proactive-companion',
            kind: 'important',
            headline: 'Stretch now',
            topicKey: 'stretch now',
            destinations: ['character'],
            receivedAt: 14,
          },
          decision: 'delivered',
          reason: 'Delivered because the event passed source, destination, content, and cooldown checks.',
          presentation: 'prominent-reminder',
          matchedSource: true,
          sidecarReady: true,
          decidedAt: 15,
        },
      }),
    })

    expect(snapshot.surfaces[2]?.status).toBe('ready')
    expect(snapshot.surfaces[2]?.reason.code).toBe('proactive-ready')
    expect(snapshot.surfaces[2]?.overview.activity).toBe('最近判定：已放行。当前可查看 1 条最近判定。')
    expect(snapshot.surfaces[2]?.overview.coverage).toBe('sidecar：已连接。')
  })

  it('refreshes, clears history, and exposes detail routes through the desktop bridge', async () => {
    const store = useCompanionCoordinationStore()
    const refreshSnapshot = composeCompanionCoordinationSnapshot({
      memoryUsage: {
        ...createDefaultExternalMemoryUsageSnapshot(),
        bridgeState: 'ready',
        reason: createExternalMemoryReasonSnapshot('bridge-ready'),
        summary: 'External memory bridge is healthy.',
        lastReadAt: 9,
        lastUsedDocumentKinds: ['user-profile'],
        context: createMemoryContextSnapshot({
          summary: 'Loaded.',
          readAt: 9,
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
      },
      persona: createReadyPersonaSnapshot(),
      proactiveRuntime: createReadyProactiveRuntimeSnapshot(),
    })
    const clearedSnapshot = composeCompanionCoordinationSnapshot({
      memoryUsage: createDisabledMemorySnapshot(),
      persona: createDisabledPersonaSnapshot(),
      proactiveRuntime: createDisabledProactiveRuntimeSnapshot(),
    })

    store.setBridge({
      getSnapshot: vi.fn().mockResolvedValue(refreshSnapshot),
      refresh: vi.fn().mockResolvedValue(refreshSnapshot),
      clearHistory: vi.fn().mockResolvedValue(clearedSnapshot),
      refreshForSparkNotify: vi.fn().mockResolvedValue({
        snapshot: refreshSnapshot,
        persona: createReadyPersonaSnapshot(),
      }),
    })

    await store.refresh()
    expect(store.snapshot.status).toBe('ready')
    expect(store.activeSupplement).toContain('[Companion Coordination Supplement]')

    await store.clearHistory()
    expect(store.snapshot.status).toBe('inactive')
    expect(store.detailRouteFor('memory')).toBe('/settings/integrations')
    expect(store.detailRouteFor('persona')).toBe('/settings/nahida-persona')
    expect(store.detailRouteFor('proactive')).toBe('/settings/proactive-companion')
  })
})
