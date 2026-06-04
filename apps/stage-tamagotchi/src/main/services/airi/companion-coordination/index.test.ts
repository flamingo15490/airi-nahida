import type { ExternalMemoryManager } from '../external-memory'
import type { NahidaPersonaManager } from '../nahida-persona'
import type { ProactiveCompanionManager } from '../proactive-companion'

import { createDefaultExternalMemoryUsageSnapshot } from '@proj-airi/stage-ui/stores/external-memory-shared'
import { createDefaultNahidaPersonaSettings } from '@proj-airi/stage-ui/stores/nahida-persona-shared'
import { createDefaultProactiveCompanionRuntimeSnapshot } from '@proj-airi/stage-ui/stores/proactive-companion-shared'
import { describe, expect, it } from 'vitest'

import { createCompanionCoordinationManager } from './index'

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((internalResolve) => {
    resolve = internalResolve
  })

  return {
    promise,
    resolve,
  }
}

function createExternalMemoryManager(): ExternalMemoryManager {
  return {
    loadMemoryContext: async () => {
      throw new Error('Not used in companion coordination tests.')
    },
    refreshMemoryContext: async () => {
      throw new Error('Not used in companion coordination tests.')
    },
    getLastMemoryUsage: () => ({
      ...createDefaultExternalMemoryUsageSnapshot(),
      bridgeState: 'ready',
      summary: 'External memory bridge is healthy.',
      lastReadAt: 1,
      lastUsedDocumentKinds: ['user-profile'],
      context: {
        state: 'ready',
        summary: 'Loaded.',
        readAt: 1,
        usedKinds: ['user-profile'],
        documents: [],
        sections: {
          userProfile: ['Prefers concise replies.'],
          preferences: [],
          followUps: [],
          recentSummary: [],
          characterKnowledge: [],
        },
      },
    }),
    writeRecentSummary: async () => {
      throw new Error('Not used in companion coordination tests.')
    },
    writeFollowUpItems: async () => {
      throw new Error('Not used in companion coordination tests.')
    },
    writeUserProfilePatch: async () => {
      throw new Error('Not used in companion coordination tests.')
    },
    writePreferencesPatch: async () => {
      throw new Error('Not used in companion coordination tests.')
    },
  }
}

function createNahidaPersonaManager(): NahidaPersonaManager {
  let targetContext: {
    activeCardName?: string
    activeDisplayModelName?: string
  } = {}

  return {
    getConfig: () => ({
      ...createDefaultNahidaPersonaSettings(),
      enabled: true,
      mode: 'balanced',
    }),
    getSnapshot: () => ({
      ...createDefaultNahidaPersonaSettings(),
      enabled: true,
      mode: 'balanced',
      activeCardName: targetContext.activeCardName,
      activeDisplayModelName: targetContext.activeDisplayModelName,
      matchesActiveCard: true,
      isActive: true,
      summary: 'Nahida persona layer is active in balanced mode.',
      activeModeSummary: 'Balanced continuity.',
      sections: [],
    }),
    getTargetContext: () => ({
      ...targetContext,
    }),
    saveConfig: settings => settings,
    updateTargetContext: (context) => {
      targetContext = {
        activeCardName: context?.activeCardName?.trim(),
        activeDisplayModelName: context?.activeDisplayModelName?.trim(),
      }

      return {
        ...targetContext,
      }
    },
  }
}

function createProactiveRuntime(overrides: Partial<ReturnType<typeof createDefaultProactiveCompanionRuntimeSnapshot>> = {}) {
  return {
    ...createDefaultProactiveCompanionRuntimeSnapshot(),
    ...overrides,
  }
}

describe('companion coordination manager', () => {
  it('awaits proactive runtime refresh before composing the coordination snapshot', async () => {
    // ROOT CAUSE:
    //
    // If coordination.refresh() does not await proactiveCompanionManager.refreshRuntime(),
    // the coordination snapshot can be composed from stale proactive runtime state.
    //
    // Before the patch, refreshRuntime() could become async later while coordination
    // still kept fire-and-forget semantics and returned a snapshot too early.
    //
    // We fixed this by making the proactive boundary async-safe and explicitly awaiting
    // the proactive refresh before composeSnapshot() reads the runtime snapshot.
    const deferredRefresh = createDeferred<ReturnType<typeof createDefaultProactiveCompanionRuntimeSnapshot>>()
    let proactiveRuntime = createProactiveRuntime({
      state: 'unavailable',
      summary: 'Proactive companion governance is not available in this runtime.',
      sidecarConnected: false,
      sidecarSummary: 'Companion sidecar status is unavailable.',
      refreshedAt: 10,
    })

    const proactiveCompanionManager: ProactiveCompanionManager = {
      loadConfig: () => proactiveRuntime.settings,
      saveConfig: settings => settings,
      getRuntimeSnapshot: () => proactiveRuntime,
      refreshRuntime: () => deferredRefresh.promise,
      clearHistory: async () => proactiveRuntime,
      evaluateSparkNotify: () => ({
        managed: false,
        runtime: proactiveRuntime,
      }),
      recordContextUpdate: () => proactiveRuntime,
    }

    const manager = createCompanionCoordinationManager({
      externalMemoryManager: createExternalMemoryManager(),
      nahidaPersonaManager: createNahidaPersonaManager(),
      proactiveCompanionManager,
    })

    let settled = false
    const refreshPromise = manager.refresh({
      activeCardName: 'Nahida',
      activeDisplayModelName: 'Nahida',
    }).then((snapshot) => {
      settled = true
      return snapshot
    })

    await Promise.resolve()
    expect(settled).toBe(false)

    proactiveRuntime = createProactiveRuntime({
      state: 'ready',
      summary: 'Proactive companion governance is ready.',
      sidecarConnected: true,
      sidecarSummary: 'Companion sidecar is connected to the current AIRI server channel.',
      refreshedAt: 20,
    })
    deferredRefresh.resolve(proactiveRuntime)

    const snapshot = await refreshPromise
    const proactiveSurface = snapshot.surfaces.find(surface => surface.surface === 'proactive')

    expect(proactiveSurface?.status).toBe('ready')
    expect(proactiveSurface?.reason.code).toBe('proactive-ready')
    expect(proactiveSurface?.overview.updatedAt).toBe(20)
  })

  it('awaits proactive history clearing before composing the cleared coordination snapshot', async () => {
    const deferredClearHistory = createDeferred<ReturnType<typeof createDefaultProactiveCompanionRuntimeSnapshot>>()
    let proactiveRuntime = createProactiveRuntime({
      state: 'degraded',
      summary: 'Companion sidecar is connected through AIRI, but proactive delivery is currently degraded.',
      sidecarConnected: false,
      sidecarSummary: 'Companion sidecar is not connected to the current AIRI server channel.',
      recentDecisions: [{
        event: {
          id: 'old-event',
          source: 'plugin:local.proactive-companion',
          kind: 'reminder',
          headline: 'Old reminder',
          topicKey: 'old reminder',
          destinations: ['character'],
          receivedAt: 1,
        },
        decision: 'dropped',
        reason: 'Old degraded decision.',
        presentation: 'silent',
        matchedSource: true,
        sidecarReady: false,
        decidedAt: 1,
      }],
      refreshedAt: 30,
    })

    const proactiveCompanionManager: ProactiveCompanionManager = {
      loadConfig: () => proactiveRuntime.settings,
      saveConfig: settings => settings,
      getRuntimeSnapshot: () => proactiveRuntime,
      refreshRuntime: async () => proactiveRuntime,
      clearHistory: () => deferredClearHistory.promise,
      evaluateSparkNotify: () => ({
        managed: false,
        runtime: proactiveRuntime,
      }),
      recordContextUpdate: () => proactiveRuntime,
    }

    const manager = createCompanionCoordinationManager({
      externalMemoryManager: createExternalMemoryManager(),
      nahidaPersonaManager: createNahidaPersonaManager(),
      proactiveCompanionManager,
    })

    let settled = false
    const clearHistoryPromise = manager.clearHistory().then((snapshot) => {
      settled = true
      return snapshot
    })

    await Promise.resolve()
    expect(settled).toBe(false)

    proactiveRuntime = createProactiveRuntime({
      state: 'ready',
      summary: 'Proactive companion governance is ready.',
      sidecarConnected: true,
      sidecarSummary: 'Companion sidecar is connected to the current AIRI server channel.',
      recentDecisions: [],
      refreshedAt: 40,
    })
    deferredClearHistory.resolve(proactiveRuntime)

    const snapshot = await clearHistoryPromise
    const proactiveSurface = snapshot.surfaces.find(surface => surface.surface === 'proactive')

    expect(proactiveSurface?.status).toBe('ready')
    expect(proactiveSurface?.overview.activity).toBe('No proactive reminder decisions have been recorded yet.')
    expect(proactiveSurface?.overview.updatedAt).toBe(40)
  })

  it('awaits proactive refresh before returning the spark-notify coordination result', async () => {
    const deferredRefresh = createDeferred<ReturnType<typeof createDefaultProactiveCompanionRuntimeSnapshot>>()
    let proactiveRuntime = createProactiveRuntime({
      state: 'unavailable',
      summary: 'Proactive companion governance is not available in this runtime.',
      sidecarConnected: false,
      sidecarSummary: 'Companion sidecar status is unavailable.',
      refreshedAt: 50,
    })

    const proactiveCompanionManager: ProactiveCompanionManager = {
      loadConfig: () => proactiveRuntime.settings,
      saveConfig: settings => settings,
      getRuntimeSnapshot: () => proactiveRuntime,
      refreshRuntime: () => deferredRefresh.promise,
      clearHistory: async () => proactiveRuntime,
      evaluateSparkNotify: () => ({
        managed: false,
        runtime: proactiveRuntime,
      }),
      recordContextUpdate: () => proactiveRuntime,
    }

    const manager = createCompanionCoordinationManager({
      externalMemoryManager: createExternalMemoryManager(),
      nahidaPersonaManager: createNahidaPersonaManager(),
      proactiveCompanionManager,
    })

    let settled = false
    const refreshPromise = manager.refreshForSparkNotify({
      activeCardName: 'Nahida',
      activeDisplayModelName: 'Nahida',
    }).then((result) => {
      settled = true
      return result
    })

    await Promise.resolve()
    expect(settled).toBe(false)

    proactiveRuntime = createProactiveRuntime({
      state: 'ready',
      summary: 'Proactive companion governance is ready.',
      sidecarConnected: true,
      sidecarSummary: 'Companion sidecar is connected to the current AIRI server channel.',
      refreshedAt: 60,
    })
    deferredRefresh.resolve(proactiveRuntime)

    const result = await refreshPromise
    const proactiveSurface = result.snapshot.surfaces.find(surface => surface.surface === 'proactive')

    expect(proactiveSurface?.status).toBe('ready')
    expect(proactiveSurface?.overview.updatedAt).toBe(60)
    expect(result.persona.isActive).toBe(true)
  })
})
