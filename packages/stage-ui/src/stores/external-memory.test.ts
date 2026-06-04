import type { ExternalMemoryContextSnapshot } from './external-memory-shared'

import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  composeExternalMemorySupplement,
} from './external-memory'
import {
  createDefaultExternalMemoryTurnSnapshot,
  createDefaultExternalMemoryUsageSnapshot,
  createDefaultExternalMemoryWriteReviewSnapshot,
  createExternalMemoryReasonSnapshot,
  EXTERNAL_MEMORY_LAYER_KINDS,
} from './external-memory-shared'
import {
  composeRecentSummaryFromMessages,
  extractFollowUpItemsFromText,
  extractPreferencePatchesFromText,
  extractUserProfilePatchesFromText,
  useExternalMemoryStore,
} from './external-memory-store'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

function createContextSnapshot(): ExternalMemoryContextSnapshot {
  return {
    state: 'ready' as const,
    reason: createExternalMemoryReasonSnapshot('context-loaded'),
    summary: 'Loaded.',
    readAt: 1,
    layerOrder: [...EXTERNAL_MEMORY_LAYER_KINDS],
    usedKinds: ['user-profile', 'preferences'],
    usedLayers: ['stable-profile', 'stable-preferences'],
    documents: [],
    turn: {
      ...createDefaultExternalMemoryTurnSnapshot(),
      readAt: 1,
      usedLayers: ['stable-profile', 'stable-preferences'],
      summary: 'Loaded.',
    },
    sections: {
      userProfile: ['The user studies finance and computing.'],
      preferences: ['The user prefers warm but concise replies.'],
      followUps: ['Remind the user to review the fourth phase tomorrow.'],
      recentSummary: ['We stabilized the desktop memory bridge.'],
      characterKnowledge: [],
    },
  }
}

beforeEach(() => {
  setActivePinia(createTestingPinia({ createSpy: vi.fn, stubActions: false }))
})

describe('external memory supplement', () => {
  it('returns a guardrail when the bridge is unavailable', () => {
    expect(composeExternalMemorySupplement({
      usage: {
        ...createDefaultExternalMemoryUsageSnapshot(),
        bridgeState: 'degraded',
        reason: createExternalMemoryReasonSnapshot('bridge-degraded'),
        summary: 'Memory unavailable.',
      },
    })).toContain('[External Memory Guardrail]')
  })

  it('renders structured sections from a trusted context snapshot', () => {
    const supplement = composeExternalMemorySupplement({
      usage: {
        ...createDefaultExternalMemoryUsageSnapshot(),
        bridgeState: 'ready',
        reason: createExternalMemoryReasonSnapshot('bridge-ready'),
        summary: 'ready',
        lastUsedDocumentKinds: ['user-profile', 'preferences'],
      },
      context: createContextSnapshot(),
    })

    expect(supplement).toContain('[External Memory Context]')
    expect(supplement).toContain('Stable user profile:')
    expect(supplement).toContain('Known preferences and boundaries:')
    expect(supplement).toContain('Open follow-ups:')
    expect(supplement).toContain('Recent continuity:')
    expect(supplement).toContain('higher-confidence memory')
  })
})

describe('external memory heuristics', () => {
  it('extracts only stable explicit user-profile, preference, and follow-up cues', () => {
    expect(extractUserProfilePatchesFromText('我是北京大学的学生。')).toEqual(['我是北京大学的学生。'])
    expect(extractUserProfilePatchesFromText('我今天有点累。')).toEqual([])

    expect(extractPreferencePatchesFromText('我喜欢温柔一点的回复。')).toEqual(['我喜欢温柔一点的回复。'])
    expect(extractPreferencePatchesFromText('今天先简短一点。')).toEqual([])

    expect(extractFollowUpItemsFromText('明天提醒我交作业。')).toEqual(['明天提醒我交作业。'])
    expect(extractFollowUpItemsFromText('我明天可能做作业。')).toEqual([])
  })

  it('builds a compact recent-summary block from the latest user and assistant turns', () => {
    const summary = composeRecentSummaryFromMessages([
      { id: 'system', role: 'system', content: 'system', createdAt: 1 },
      { id: 'user-1', role: 'user', content: '今天我想继续收尾第四阶段。', createdAt: 2 },
      { id: 'assistant-1', role: 'assistant', content: '我们先把外部记忆闭环接起来。', slices: [], tool_results: [], createdAt: 3 },
      { id: 'assistant-2', role: 'assistant', content: '我们先把外部记忆闭环接起来。', slices: [], tool_results: [], createdAt: 4 },
    ])

    expect(summary).toContain('## ')
    expect(summary).toContain('User: 今天我想继续收尾第四阶段。')
    expect(summary).toContain('AIRI: 我们先把外部记忆闭环接起来。')
    expect(summary.match(/AIRI: 我们先把外部记忆闭环接起来。/g)?.length).toBe(1)
  })
})

describe('external memory store', () => {
  it('normalizes missing turn and write-review fields from runtime snapshots', async () => {
    const store = useExternalMemoryStore()
    const runtimeContext = JSON.parse(JSON.stringify(createContextSnapshot()))
    delete runtimeContext.turn

    const runtimeUsage = JSON.parse(JSON.stringify({
      ...createDefaultExternalMemoryUsageSnapshot(),
      bridgeState: 'ready' as const,
      reason: createExternalMemoryReasonSnapshot('bridge-ready'),
      summary: 'Usage loaded.',
      lastReadAt: 123,
      lastReadSummary: 'Snapshot refreshed.',
      lastUsedDocumentKinds: ['user-profile'],
    }))
    delete runtimeUsage.context
    delete runtimeUsage.turn
    delete runtimeUsage.lastWriteReview

    store.setBridge({
      loadMemoryContext: async () => runtimeContext,
      refreshMemoryContext: async () => runtimeContext,
      getLastMemoryUsage: async () => runtimeUsage,
      clearMemoryWriteCandidateHistory: vi.fn(),
      writeFollowUpItems: vi.fn(),
      writePreferencesPatch: vi.fn(),
      writeRecentSummary: vi.fn(),
      writeUserProfilePatch: vi.fn(),
    })

    await store.loadContext()

    expect(store.turnSnapshot.readAt).toBe(1)
    expect(store.turnSnapshot.summary).toBe('Loaded.')
    expect(store.turnSnapshot.layerOrder).toEqual(EXTERNAL_MEMORY_LAYER_KINDS)
    expect(store.writeReviewSnapshot.summary).toBe(createDefaultExternalMemoryWriteReviewSnapshot().summary)
    expect(store.writeReviewSnapshot.candidates).toEqual([])
  })

  it('clears candidate history by resyncing the main-runtime write review state', async () => {
    const store = useExternalMemoryStore()
    const runtimeUsage = {
      ...createDefaultExternalMemoryUsageSnapshot(),
      bridgeState: 'ready' as const,
      reason: createExternalMemoryReasonSnapshot('bridge-ready'),
      summary: 'Usage loaded.',
      turn: {
        ...createDefaultExternalMemoryTurnSnapshot(),
        readAt: 789,
        summary: 'Existing turn snapshot should stay intact.',
      },
      recentWrites: [{
        kind: 'preferences' as const,
        layer: 'stable-preferences' as const,
        ok: true,
        changed: true,
        decision: 'written' as const,
        reason: createExternalMemoryReasonSnapshot('write-written'),
        summary: 'Preference write persisted.',
        writtenAt: 654,
        review: createDefaultExternalMemoryWriteReviewSnapshot(),
      }],
      lastWriteReview: {
        ...createDefaultExternalMemoryWriteReviewSnapshot(),
        reviewedAt: 456,
        summary: 'One preference candidate was reviewed.',
        decision: 'written' as const,
        reason: createExternalMemoryReasonSnapshot('write-written'),
        candidates: [{
          layer: 'stable-preferences' as const,
          kind: 'preferences' as const,
          source: 'test',
          summary: 'Preference patch candidate',
          addItems: ['Prefer concise replies'],
          removeItems: [],
        }],
      },
    }
    const clearedUsage = {
      ...runtimeUsage,
      lastWriteReview: createDefaultExternalMemoryWriteReviewSnapshot(),
    }
    const clearMemoryWriteCandidateHistory = vi.fn(async () => clearedUsage)

    store.setBridge({
      loadMemoryContext: async () => createContextSnapshot(),
      refreshMemoryContext: async () => createContextSnapshot(),
      getLastMemoryUsage: async () => runtimeUsage,
      clearMemoryWriteCandidateHistory,
      writeFollowUpItems: vi.fn(),
      writePreferencesPatch: vi.fn(),
      writeRecentSummary: vi.fn(),
      writeUserProfilePatch: vi.fn(),
    })

    await store.refreshWriteReview()

    expect(store.candidateHistory).toHaveLength(1)
    expect(store.candidateHistory[0]?.addItems).toEqual(['Prefer concise replies'])

    await store.clearCandidateHistory()

    expect(clearMemoryWriteCandidateHistory).toHaveBeenCalledTimes(1)
    expect(store.candidateHistory).toEqual([])
    expect(store.writeReviewSnapshot.summary).toBe(createDefaultExternalMemoryWriteReviewSnapshot().summary)
    expect(store.usage.lastWriteReview).toEqual(createDefaultExternalMemoryWriteReviewSnapshot())
    expect(store.usage.recentWrites).toEqual(runtimeUsage.recentWrites)
    expect(store.turnSnapshot.summary).toBe('Existing turn snapshot should stay intact.')
  })
})
