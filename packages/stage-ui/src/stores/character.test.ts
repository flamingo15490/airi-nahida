import type {
  ExternalMemoryContextSnapshot,
  ExternalMemoryUsageSnapshot,
} from './external-memory-shared'
import type { AiriCard } from './modules'

import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setCharacterLlmMarkerParserFactoryForTest, useCharacterStore } from './character'
import { useCompanionCoordinationStore } from './companion-coordination-store'
import {
  createDefaultExternalMemoryTurnSnapshot,
  createDefaultExternalMemoryUsageSnapshot,
  createExternalMemoryReasonSnapshot,
  EXTERNAL_MEMORY_LAYER_KINDS,
} from './external-memory-shared'
import { useExternalMemoryStore } from './external-memory-store'
import { useAiriCardStore } from './modules'
import { useNahidaPersonaStore } from './nahida-persona-store'
import { useSpeechRuntimeStore } from './speech-runtime'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

const writeLiteralSpy = vi.fn()
const writeFlushSpy = vi.fn()
const endSpy = vi.fn()
const cancelSpy = vi.fn()
const parserConsumeSpy = vi.fn()
const parserEndSpy = vi.fn()

const openSpeechIntentSpy = vi.fn(() => ({
  intentId: 'intent-test',
  streamId: 'stream-test',
  priority: 100,
  stream: new ReadableStream(),
  writeLiteral: writeLiteralSpy,
  writeSpecial: vi.fn(),
  writeFlush: writeFlushSpy,
  end: endSpy,
  cancel: cancelSpy,
}))

function createMemoryContextSnapshot(): ExternalMemoryContextSnapshot {
  return {
    state: 'ready' as const,
    reason: createExternalMemoryReasonSnapshot('context-loaded'),
    summary: 'Loaded.',
    readAt: 1,
    layerOrder: [...EXTERNAL_MEMORY_LAYER_KINDS],
    usedKinds: ['user-profile'],
    usedLayers: ['stable-profile'],
    documents: [],
    turn: {
      ...createDefaultExternalMemoryTurnSnapshot(),
      readAt: 1,
      usedLayers: ['stable-profile'],
      summary: 'Loaded.',
    },
    sections: {
      userProfile: ['The user prefers concise technical replies.'],
      preferences: [],
      followUps: [],
      recentSummary: [],
      characterKnowledge: [],
    },
  }
}

function createMemoryUsageSnapshot(): ExternalMemoryUsageSnapshot {
  return {
    ...createDefaultExternalMemoryUsageSnapshot(),
    bridgeState: 'ready' as const,
    reason: createExternalMemoryReasonSnapshot('bridge-ready'),
    summary: 'Loaded.',
    lastUsedDocumentKinds: ['user-profile'],
  }
}

describe('store character', () => {
  beforeEach(() => {
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false })
    setActivePinia(pinia)

    setCharacterLlmMarkerParserFactoryForTest(options => ({
      async consume(textPart: string) {
        parserConsumeSpy(textPart)
        if (textPart)
          await options.onLiteral?.(textPart)
      },
      async end() {
        parserEndSpy()
      },
    }))

    writeLiteralSpy.mockClear()
    writeFlushSpy.mockClear()
    endSpy.mockClear()
    cancelSpy.mockClear()
    openSpeechIntentSpy.mockClear()
    parserConsumeSpy.mockClear()
    parserEndSpy.mockClear()

    const speechRuntimeStore = useSpeechRuntimeStore(pinia)
    speechRuntimeStore.openIntent = openSpeechIntentSpy

    const airiCardStore = useAiriCardStore(pinia)
    // @ts-expect-error - testing purpose
    airiCardStore.systemPrompt = 'You are a brave adventurer in Minecraft.'
    // @ts-expect-error - testing purpose
    airiCardStore.activeCard = {
      name: 'Hero',
      version: '1.0',
      extensions: {
        airi: {
          agents: {},
          modules: {
            consciousness: {
              provider: 'mock-provider',
              model: 'mock-model',
            },
            speech: {
              provider: 'mock-speech-provider',
              model: 'mock-speech-model',
              voice_id: 'alloy',
            },
          },
        },
      },
    } satisfies AiriCard
  })

  it('exposes name and system prompt from the active card', () => {
    const store = useCharacterStore()

    expect(store.name).toBe('Hero')
    expect(store.systemPrompt).toBe('You are a brave adventurer in Minecraft.')
  })

  it('adds the Nahida supplement once when the active card matches', () => {
    const airiCardStore = useAiriCardStore()
    // @ts-expect-error - testing purpose
    airiCardStore.systemPrompt = 'Base card prompt.'
    // @ts-expect-error - testing purpose
    airiCardStore.activeCard = {
      name: 'Nahida',
      version: '1.0',
      extensions: {
        airi: {
          agents: {},
          modules: {
            consciousness: {
              provider: 'mock-provider',
              model: 'mock-model',
            },
            speech: {
              provider: 'mock-speech-provider',
              model: 'mock-speech-model',
              voice_id: 'alloy',
            },
          },
        },
      },
    } satisfies AiriCard

    const personaStore = useNahidaPersonaStore()
    personaStore.applySettings({
      enabled: true,
      mode: 'balanced',
    })

    const store = useCharacterStore()
    const prompt = store.systemPrompt

    expect(prompt).toContain('Base card prompt.')
    expect(prompt).toContain('[Nahida Persona Supplement]')
    expect(prompt).toContain('Keep the current active card as the base persona.')
    expect(prompt).toContain('Fact anchors:')
    expect(prompt).toContain('birthday celebrated on October 27')
    expect(prompt.match(/\[Nahida Persona Supplement\]/g)).toHaveLength(1)
  })

  it('adds the external memory supplement once when trusted memory is available', async () => {
    const memoryStore = useExternalMemoryStore()
    memoryStore.setBridge({
      loadMemoryContext: async () => createMemoryContextSnapshot(),
      refreshMemoryContext: async () => createMemoryContextSnapshot(),
      getLastMemoryUsage: async () => createMemoryUsageSnapshot(),
      clearMemoryWriteCandidateHistory: vi.fn(),
      writeFollowUpItems: vi.fn(),
      writePreferencesPatch: vi.fn(),
      writeRecentSummary: vi.fn(),
      writeUserProfilePatch: vi.fn(),
    })
    await memoryStore.loadContext()

    const store = useCharacterStore()
    const prompt = store.systemPrompt

    expect(prompt).toContain('[External Memory Context]')
    expect(prompt).toContain('The user prefers concise technical replies.')
    expect(prompt.match(/\[External Memory Context\]/g)).toHaveLength(1)
  })

  it('adds the coordination supplement once when at least one frozen surface is active', async () => {
    const coordinationStore = useCompanionCoordinationStore()
    coordinationStore.setBridge({
      getSnapshot: async () => ({
        status: 'attention',
        reason: {
          code: 'phase-attention',
          message: 'Phase-six coordination still needs attention before the frozen memory, persona, and proactive surfaces can be treated as aligned.',
        },
        summary: '1 coordination surfaces need attention in the current phase.',
        surfaces: [{
          surface: 'memory',
          title: 'Memory',
          status: 'attention',
          reason: {
            code: 'memory-unavailable',
            message: 'External memory bridge is not available in this runtime yet, so phase-six coordination cannot verify it.',
          },
          overview: {
            summary: 'External memory bridge is not available in this runtime.',
            reason: 'External memory bridge is not available in this runtime yet, so phase-six coordination cannot verify it.',
            activity: 'No external memory activity has been recorded yet.',
            coverage: 'Latest memory coverage: none recorded yet.',
          },
        }, {
          surface: 'persona',
          title: 'Persona',
          status: 'inactive',
          reason: {
            code: 'persona-disabled',
            message: 'Nahida persona is disabled by the user, so the base card stays unchanged and this surface remains inactive.',
          },
          overview: {
            summary: 'Nahida persona layer is disabled. The active card remains unchanged.',
            reason: 'Nahida persona is disabled by the user, so the base card stays unchanged and this surface remains inactive.',
            activity: 'Persona mode: balanced. Disabled by user.',
            coverage: 'Card: none. Display model: none.',
          },
        }, {
          surface: 'proactive',
          title: 'Proactive',
          status: 'inactive',
          reason: {
            code: 'proactive-disabled',
            message: 'Proactive governance is disabled, so companion-sidecar reminders stay outside AIRI in this phase.',
          },
          overview: {
            summary: 'Proactive companion delivery is disabled.',
            reason: 'Proactive governance is disabled, so companion-sidecar reminders stay outside AIRI in this phase.',
            activity: 'No proactive reminder decisions have been recorded yet.',
            coverage: 'Sidecar: status unavailable.',
            updatedAt: 1,
          },
        }],
        readyCount: 0,
        attentionCount: 1,
        inactiveCount: 2,
        updatedAt: 1,
      }),
      refresh: async () => coordinationStore.snapshot,
      clearHistory: async () => coordinationStore.snapshot,
      refreshForSparkNotify: async () => ({
        snapshot: coordinationStore.snapshot,
        persona: useNahidaPersonaStore().snapshot,
      }),
    })
    await coordinationStore.getSnapshot()

    const store = useCharacterStore()
    const prompt = store.systemPrompt

    expect(prompt).toContain('[Companion Coordination Supplement]')
    expect(prompt).toContain('Overall: attention.')
    expect(prompt).toContain('Memory: attention.')
    expect(prompt.match(/\[Companion Coordination Supplement\]/g)).toHaveLength(1)
  })

  it('records reactions and trims to the max size', () => {
    const store = useCharacterStore()

    for (let index = 0; index < 201; index += 1) {
      store.recordSparkNotifyReaction('spark-event', `message-${index}`)
    }

    expect(store.reactions).toHaveLength(200)
    expect(store.reactions[0]?.message).toBe('message-1')
    expect(store.reactions[199]?.message).toBe('message-200')
  })

  it('records streamed reactions when the stream ends', async () => {
    const store = useCharacterStore()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(123456)

    store.onSparkNotifyReactionStreamEvent('spark-1', 'Hello')
    store.onSparkNotifyReactionStreamEvent('spark-1', ' world')
    store.onSparkNotifyReactionStreamEnd('spark-1', 'Hello world')

    expect(store.reactions).toHaveLength(1)
    expect(store.reactions[0]?.message).toBe('Hello world')
    expect(store.reactions[0]?.sourceEventId).toBe('spark-1')
    expect(store.reactions[0]?.createdAt).toBe(123456)

    await vi.waitFor(() => {
      expect(parserConsumeSpy).toHaveBeenCalled()
      expect(parserEndSpy).toHaveBeenCalled()
      expect(writeLiteralSpy).toHaveBeenCalledWith('Hello')
      expect(writeLiteralSpy).toHaveBeenCalledWith(' world')
      expect(writeFlushSpy).toHaveBeenCalled()
      expect(endSpy).toHaveBeenCalled()
    })

    nowSpy.mockRestore()
  })

  it('ignores stream end when no streaming reaction exists', () => {
    const store = useCharacterStore()

    store.onSparkNotifyReactionStreamEnd('missing', 'Ignored')

    expect(store.reactions).toHaveLength(0)
  })

  it('clears reactions', () => {
    const store = useCharacterStore()

    store.recordSparkNotifyReaction('spark-event', 'Hello')
    store.recordSparkNotifyReaction('spark-event', 'World')
    store.clearReactions()

    expect(store.reactions).toHaveLength(0)
  })
})
