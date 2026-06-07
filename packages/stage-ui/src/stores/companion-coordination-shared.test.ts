import type { ExternalMemoryUsageSnapshot } from './external-memory-shared'
import type { NahidaPersonaSnapshot } from './nahida-persona-shared'
import type { ProactiveCompanionRuntimeSnapshot } from './proactive-companion-shared'

import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { composeCompanionCoordinationSupplement } from './companion-coordination'
import { composeCompanionCoordinationSnapshot } from './companion-coordination-shared'
import {
  createDefaultExternalMemoryUsageSnapshot,
  createExternalMemoryReasonSnapshot,
} from './external-memory-shared'
import { createDefaultNahidaPersonaSettings } from './nahida-persona-shared'
import { createDefaultProactiveCompanionRuntimeSnapshot } from './proactive-companion-shared'

function createReadyMemoryUsage(): ExternalMemoryUsageSnapshot {
  return {
    ...createDefaultExternalMemoryUsageSnapshot(),
    bridgeState: 'ready',
    reason: createExternalMemoryReasonSnapshot('bridge-ready'),
    summary: 'External memory bridge is healthy.',
    lastReadAt: 10,
    lastUsedDocumentKinds: ['user-profile'],
  }
}

function createReadyPersona(): NahidaPersonaSnapshot {
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
  }
}

function createReadyProactive(): ProactiveCompanionRuntimeSnapshot {
  return {
    ...createDefaultProactiveCompanionRuntimeSnapshot(),
    state: 'ready',
    summary: 'Proactive governance is healthy.',
    sidecarConnected: true,
    sidecarSummary: 'Companion sidecar is connected.',
    refreshedAt: 20,
  }
}

describe('companion coordination explainability blocks', () => {
  beforeEach(() => {
    setActivePinia(createTestingPinia({ createSpy: vi.fn, stubActions: false }))
  })

  it('carries screenContext and memoryJudgement blocks in the snapshot', () => {
    const snapshot = composeCompanionCoordinationSnapshot({
      memoryUsage: createReadyMemoryUsage(),
      persona: createReadyPersona(),
      proactiveRuntime: createReadyProactive(),
      screenContext: {
        summary: 'Screen context is active and fresh.',
        reason: 'User presence is active and screen-context data is up to date.',
        updatedAt: 100,
      },
      memoryJudgement: {
        summary: '1 stable candidate is ready for write-back.',
        reason: 'The judgement ledger contains one stable candidate with no conflicts.',
        updatedAt: 200,
      },
    })

    expect(snapshot.screenContext).toBeDefined()
    expect(snapshot.screenContext?.summary).toBe('Screen context is active and fresh.')
    expect(snapshot.screenContext?.reason).toContain('User presence')
    expect(snapshot.screenContext?.updatedAt).toBe(100)

    expect(snapshot.memoryJudgement).toBeDefined()
    expect(snapshot.memoryJudgement?.summary).toContain('stable candidate')
    expect(snapshot.memoryJudgement?.reason).toContain('judgement ledger')
    expect(snapshot.memoryJudgement?.updatedAt).toBe(200)
  })

  it('omits screenContext and memoryJudgement when not provided', () => {
    const snapshot = composeCompanionCoordinationSnapshot({
      memoryUsage: createReadyMemoryUsage(),
      persona: createReadyPersona(),
      proactiveRuntime: createReadyProactive(),
    })

    expect(snapshot.screenContext).toBeUndefined()
    expect(snapshot.memoryJudgement).toBeUndefined()
  })

  it('includes screenContext and memoryJudgement summaries in the supplement', () => {
    const snapshot = composeCompanionCoordinationSnapshot({
      memoryUsage: createReadyMemoryUsage(),
      persona: createReadyPersona(),
      proactiveRuntime: createReadyProactive(),
      screenContext: {
        summary: 'User is actively viewing the screen.',
        reason: 'Presence detected as active.',
        updatedAt: 100,
      },
      memoryJudgement: {
        summary: 'Memory judgement is healthy.',
        reason: 'No conflicts detected.',
        updatedAt: 200,
      },
    })

    const supplement = composeCompanionCoordinationSupplement(snapshot)

    expect(supplement).toContain('[Companion Coordination Supplement]')
    expect(supplement).toContain('Subsystem explainability:')
    expect(supplement).toContain('Screen context: User is actively viewing the screen.')
    expect(supplement).toContain('Memory judgement: Memory judgement is healthy.')
  })

  it('appends the supplement exactly once even with explainability blocks', () => {
    const snapshot = composeCompanionCoordinationSnapshot({
      memoryUsage: createReadyMemoryUsage(),
      persona: createReadyPersona(),
      proactiveRuntime: createReadyProactive(),
      screenContext: {
        summary: 'Screen context available.',
        reason: 'Active.',
      },
      memoryJudgement: {
        summary: 'Judgement available.',
        reason: 'Healthy.',
      },
    })

    const supplement = composeCompanionCoordinationSupplement(snapshot)
    const supplementMarkerCount = (supplement.match(/\[Companion Coordination Supplement\]/g) ?? []).length

    expect(supplementMarkerCount).toBe(1)
  })

  it('produces supplement without explainability block when blocks are absent', () => {
    const snapshot = composeCompanionCoordinationSnapshot({
      memoryUsage: createReadyMemoryUsage(),
      persona: createReadyPersona(),
      proactiveRuntime: createReadyProactive(),
    })

    const supplement = composeCompanionCoordinationSupplement(snapshot)

    expect(supplement).toContain('[Companion Coordination Supplement]')
    expect(supplement).not.toContain('Subsystem explainability:')
  })

  it('includes explainability blocks regardless of snapshot status', () => {
    const snapshot = composeCompanionCoordinationSnapshot({
      memoryUsage: {
        ...createDefaultExternalMemoryUsageSnapshot(),
        bridgeState: 'degraded',
        reason: createExternalMemoryReasonSnapshot('bridge-degraded'),
        summary: 'Memory bridge is degraded.',
      },
      persona: createReadyPersona(),
      proactiveRuntime: createReadyProactive(),
      screenContext: {
        summary: 'Screen context is stale.',
        reason: 'Last update was 10 minutes ago.',
      },
      memoryJudgement: {
        summary: 'Memory judgement has conflicts.',
        reason: '2 conflicted candidates detected.',
      },
    })

    expect(snapshot.status).toBe('attention')
    expect(snapshot.screenContext?.summary).toBe('Screen context is stale.')
    expect(snapshot.memoryJudgement?.summary).toBe('Memory judgement has conflicts.')
  })
})
