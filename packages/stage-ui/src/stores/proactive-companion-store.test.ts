import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useProactiveCompanionStore } from './proactive-companion-store'

describe('proactive companion store', () => {
  beforeEach(() => {
    setActivePinia(createTestingPinia({ createSpy: vi.fn, stubActions: false }))
  })

  it('returns an unmanaged result when no desktop bridge is attached', async () => {
    const store = useProactiveCompanionStore()
    const result = await store.evaluateSparkNotify({
      type: 'spark:notify',
      source: 'plugin:local.proactive-companion',
      data: {
        id: 'sidecar-1',
        eventId: 'sidecar-1',
        kind: 'reminder',
        urgency: 'soon',
        headline: 'Drink water soon',
        destinations: ['character'],
      },
    })

    expect(result.managed).toBe(false)
    expect(store.runtime.state).toBe('unavailable')
  })

  it('updates settings and runtime snapshots from the desktop bridge', async () => {
    const store = useProactiveCompanionStore()
    store.setBridge({
      loadConfig: async () => ({
        enabled: true,
        globalCooldownMs: 90000,
        topicCooldownMs: 180000,
        intensity: 'balanced',
      }),
      saveConfig: async settings => settings,
      getRuntimeSnapshot: async () => ({
        settings: {
          enabled: true,
          globalCooldownMs: 90000,
          topicCooldownMs: 180000,
          intensity: 'balanced',
        },
        state: 'ready',
        summary: 'ready',
        sidecarConnected: true,
        sidecarSummary: 'connected',
        recentDecisions: [],
        refreshedAt: 1,
      }),
      refreshRuntime: async () => ({
        settings: {
          enabled: true,
          globalCooldownMs: 90000,
          topicCooldownMs: 180000,
          intensity: 'balanced',
        },
        state: 'ready',
        summary: 'refreshed',
        sidecarConnected: true,
        sidecarSummary: 'connected',
        recentDecisions: [],
        refreshedAt: 2,
      }),
      clearHistory: async () => ({
        settings: {
          enabled: true,
          globalCooldownMs: 90000,
          topicCooldownMs: 180000,
          intensity: 'balanced',
        },
        state: 'ready',
        summary: 'cleared',
        sidecarConnected: true,
        sidecarSummary: 'connected',
        recentDecisions: [],
        refreshedAt: 3,
      }),
      recordContextUpdate: async () => ({
        settings: {
          enabled: true,
          globalCooldownMs: 90000,
          topicCooldownMs: 180000,
          intensity: 'balanced',
        },
        state: 'ready',
        summary: 'recorded',
        sidecarConnected: true,
        sidecarSummary: 'connected',
        recentDecisions: [{
          event: {
            id: 'legacy-sidecar-1',
            source: 'legacy:vision',
            kind: 'reminder',
            rawKind: 'vision',
            headline: 'Look back at the current task.',
            topicKey: 'look back at the current task',
            destinations: ['character'],
            receivedAt: 2,
          },
          decision: 'delivered',
          reason: 'Recorded via the legacy context:update compatibility path as a reminder event inferred from source "vision". This is a history-only compatibility record and does not trigger a new proactive reaction.',
          presentation: 'light-prompt',
          matchedSource: true,
          sidecarReady: true,
          decidedAt: 3,
        }],
        refreshedAt: 3,
      }),
      evaluateSparkNotify: async () => ({
        managed: true,
        decision: {
          event: {
            id: 'sidecar-2',
            source: 'plugin:local.proactive-companion',
            kind: 'important',
            headline: 'Stand up and stretch',
            topicKey: 'stand up and stretch',
            destinations: ['character'],
            receivedAt: 1,
          },
          decision: 'delivered',
          reason: 'approved',
          presentation: 'prominent-reminder',
          matchedSource: true,
          sidecarReady: true,
          decidedAt: 2,
        },
        runtime: {
          settings: {
            enabled: true,
            globalCooldownMs: 90000,
            topicCooldownMs: 180000,
            intensity: 'balanced',
          },
          state: 'ready',
          summary: 'evaluated',
          sidecarConnected: true,
          sidecarSummary: 'connected',
          recentDecisions: [{
            event: {
              id: 'sidecar-2',
              source: 'plugin:local.proactive-companion',
              kind: 'important',
              headline: 'Stand up and stretch',
              topicKey: 'stand up and stretch',
              destinations: ['character'],
              receivedAt: 1,
            },
            decision: 'delivered',
            reason: 'approved',
            presentation: 'prominent-reminder',
            matchedSource: true,
            sidecarReady: true,
            decidedAt: 2,
          }, {
            event: {
              id: 'sidecar-3',
              source: 'plugin:local.proactive-companion',
              kind: 'reminder',
              headline: 'Drink water',
              topicKey: 'drink water',
              destinations: ['character'],
              receivedAt: 3,
            },
            decision: 'suppressed',
            reason: 'Suppressed because the global proactive cooldown is still active after a recent delivered reminder.',
            presentation: 'silent',
            matchedSource: true,
            sidecarReady: true,
            cooldownUntil: Date.now() + 60_000,
            decidedAt: 4,
          }],
          refreshedAt: 4,
        },
      }),
    })

    await store.refreshConfig()
    await store.getRuntimeSnapshot()

    expect(store.settings.intensity).toBe('balanced')
    expect(store.runtime.summary).toBe('ready')

    const result = await store.evaluateSparkNotify({
      type: 'spark:notify',
      source: 'plugin:local.proactive-companion',
      data: {
        id: 'sidecar-2',
        eventId: 'sidecar-2',
        kind: 'alarm',
        urgency: 'immediate',
        headline: 'Stand up and stretch',
        destinations: ['character'],
      },
    })

    expect(result.managed).toBe(true)
    expect(store.runtime.summary).toBe('evaluated')
    expect(store.latestDeliveredDecision?.event.id).toBe('sidecar-2')
    expect(store.latestCooldownDecision?.event.id).toBe('sidecar-3')
    expect(store.currentCooldownUntil).toBeTypeOf('number')

    const legacyRuntime = await store.recordContextUpdate({
      type: 'context:update',
      data: {
        id: 'legacy-runtime',
        text: 'legacy',
      },
    } as never)

    expect(legacyRuntime.summary).toBe('recorded')
    expect(store.latestLegacyDecision?.event.id).toBe('legacy-sidecar-1')
  })
})
