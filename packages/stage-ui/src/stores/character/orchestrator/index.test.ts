/* eslint-disable style/indent-binary-ops */
/* eslint-disable style/operator-linebreak */

import type { WebSocketEventOf } from '@proj-airi/server-sdk'
import type { Store, StoreDefinition } from 'pinia'
import type { Mock } from 'vitest'
import type { UnwrapRef } from 'vue'
import type z from 'zod'

import type { StreamEvent } from '../../llm'
import type { AiriCard } from '../../modules'

import { createTestingPinia } from '@pinia/testing'
import { tool } from '@xsai/tool'
import { nanoid } from 'nanoid'
import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sparkNotifyCommandSchema, useCharacterOrchestratorStore } from '.'
import { useCharacterStore } from '..'
import { useLLM } from '../../llm'
import { useModsServerChannelStore } from '../../mods/api/channel-server'
import { useAiriCardStore, useConsciousnessStore } from '../../modules'
import { useNahidaPersonaStore } from '../../nahida-persona-store'
import { createDefaultProactiveCompanionRuntimeSnapshot, createDefaultProactiveCompanionSettings } from '../../proactive-companion-shared'
import { useProactiveCompanionStore } from '../../proactive-companion-store'
import { useProvidersStore } from '../../providers'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

function mockedStore<TStoreDef extends () => unknown>(
  useStore: TStoreDef,
): TStoreDef extends StoreDefinition<
  infer Id,
  infer State,
  infer Getters,
  infer Actions
>
  ? Store<
    Id,
    State,
    Record<string, never>,
    {
      [K in keyof Actions]: Actions[K] extends (...args: any[]) => any
        ? // 👇 depends on your testing framework
        Mock<Actions[K]>
        : Actions[K]
    }
  > & {
    [K in keyof Getters]: UnwrapRef<Getters[K]>
  }
  : ReturnType<TStoreDef> {
  return useStore() as any
}

function getObjectSchema(schema?: Record<string, any>) {
  if (!schema)
    return undefined

  if (schema.type === 'object')
    return schema

  const candidates = [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])]
  return candidates.find((candidate: Record<string, any>) => candidate?.type === 'object')
}

function getArraySchema(schema?: Record<string, any>) {
  if (!schema)
    return undefined

  if (schema.type === 'array')
    return schema

  const candidates = [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])]
  return candidates.find((candidate: Record<string, any>) => candidate?.type === 'array')
}

describe('sparkNotifyCommandSchema', () => {
  it('emits strict objects in the json schema', async () => {
    const sparkTool = await tool({
      name: 'builtIn_sparkCommand',
      description: 'test',
      parameters: sparkNotifyCommandSchema,
      execute: async () => undefined,
    })

    const schema = sparkTool.function.parameters as Record<string, any>
    const commandsSchema = getArraySchema(schema.properties?.commands)
    const commandItemSchema = getObjectSchema(commandsSchema?.items)
    const guidanceSchema = getObjectSchema(commandItemSchema?.properties?.guidance)
    const personaSchema = getArraySchema(guidanceSchema?.properties?.persona)
    const personaItemSchema = getObjectSchema(personaSchema?.items)
    const optionsSchema = getArraySchema(guidanceSchema?.properties?.options)
    const optionsItemSchema = getObjectSchema(optionsSchema?.items)

    expect(schema.additionalProperties).toBe(false)
    expect(commandItemSchema?.additionalProperties).toBe(false)
    expect(guidanceSchema?.additionalProperties).toBe(false)
    expect(personaItemSchema?.additionalProperties).toBe(false)
    expect(optionsItemSchema?.additionalProperties).toBe(false)
  })
})

describe('store character-orchestrator', () => {
  beforeEach(() => {
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false })
    setActivePinia(pinia)

    const mockGetProviderInstance = vi.fn()
    mockedStore(useProvidersStore).getProviderInstance = mockGetProviderInstance
    mockedStore(useProvidersStore).getProviderInstance.mockResolvedValue({ chat: (_model: string) => ({} as any) })
    mockedStore(useModsServerChannelStore).onEvent = vi.fn((_type: string, _callback: unknown) => () => {})

    const consciousnessStore = useConsciousnessStore(pinia)
    consciousnessStore.activeProvider = 'mock-provider'
    consciousnessStore.activeModel = 'mock-model'

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

  it('handles immediate spark:notify with reaction and commands', async () => {
    const mockStream = vi.fn()
    mockedStore(useLLM).stream = mockStream
    mockedStore(useLLM).stream.mockImplementation(async (_model: string, _provider: unknown, _messages: unknown, options: any) => {
      if (options?.tools?.length) {
        await options.tools[1].execute({ commands: [{
          destinations: ['minecraft'],
          intent: 'action',
          priority: 'critical',
          interrupt: 'false',
          ack: 'ok',
          guidance: null,
        }] } satisfies z.infer<typeof sparkNotifyCommandSchema>)
      }

      await options?.onStreamEvent?.({ type: 'text-delta', text: 'Ahhh, got hit by zombie!' } satisfies StreamEvent)
      await options?.onStreamEvent?.({ type: 'finish' } satisfies StreamEvent)
    })

    const mockOnSparkNotifyReactionStreamEvent = vi.fn()
    mockedStore(useCharacterStore).onSparkNotifyReactionStreamEvent = mockOnSparkNotifyReactionStreamEvent
    const mockOnSparkNotifyReactionStreamEnd = vi.fn()
    mockedStore(useCharacterStore).onSparkNotifyReactionStreamEnd = mockOnSparkNotifyReactionStreamEnd

    const store = useCharacterOrchestratorStore()
    const event: WebSocketEventOf<'spark:notify'> = {
      type: 'spark:notify',
      source: 'minecraft',
      data: {
        id: nanoid(),
        eventId: nanoid(),
        kind: 'alarm',
        urgency: 'immediate',
        headline: 'Hit by zombie',
        destinations: ['character'],
      },
    }

    const result = await store.handleSparkNotify(event)

    expect(result?.commands).toHaveLength(1)
    expect(result?.commands?.[0].destinations).toEqual([event.source])
    expect(result?.commands?.[0].parentEventId).toBe(event.data.id)
    expect(result?.commands?.[0].intent).toBe('action')
    expect(result?.commands?.[0].priority).toBe('critical')

    expect(mockStream).toBeCalledTimes(1)
    expect(mockStream.mock.calls).toHaveLength(1)
    expect(mockStream.mock.calls[0][0]).toEqual('mock-model')
    expect(mockStream.mock.calls[0][1]).not.toBeNull()
    expect(mockStream.mock.calls[0][2]).toHaveLength(2)
    expect(mockStream.mock.calls[0][3]).toHaveProperty('tools')

    expect(mockOnSparkNotifyReactionStreamEvent).toBeCalledWith(event.data.id, 'Ahhh, got hit by zombie!')
    expect(mockOnSparkNotifyReactionStreamEnd).toBeCalledTimes(1)
  })

  it('supports forcing text-only spark:notify responses', async () => {
    const mockStream = vi.fn()
    mockedStore(useLLM).stream = mockStream
    mockedStore(useLLM).stream.mockImplementation(async (_model: string, _provider: unknown, _messages: unknown, options: any) => {
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'I choose d5 to pressure the center.' } satisfies StreamEvent)
      await options?.onStreamEvent?.({ type: 'finish' } satisfies StreamEvent)
    })

    const onDelta = vi.fn()
    const onEnd = vi.fn()
    mockedStore(useCharacterStore).onSparkNotifyReactionStreamEvent = onDelta
    mockedStore(useCharacterStore).onSparkNotifyReactionStreamEnd = onEnd

    const store = useCharacterOrchestratorStore()
    const event: WebSocketEventOf<'spark:notify'> = {
      type: 'spark:notify',
      source: 'plugin:airi-plugin-game-chess',
      data: {
        id: nanoid(),
        eventId: nanoid(),
        kind: 'ping',
        urgency: 'immediate',
        headline: 'AIRI played d5',
        destinations: ['character'],
      },
    }

    await store.handleSparkNotifyWithReaction(event, {
      forceTextResponse: true,
    })

    const streamOptions = mockStream.mock.calls[0][3]
    expect(streamOptions.supportsTools).toBe(false)
    expect(streamOptions.waitForTools).toBe(false)
    expect(streamOptions.tools).toEqual([])
    expect(streamOptions.toolChoice).toBeUndefined()
    expect(onDelta).toBeCalled()
    expect(onEnd).toBeCalled()
  })

  it('supports forcing spark-command responses', async () => {
    const mockStream = vi.fn()
    mockedStore(useLLM).stream = mockStream
    mockedStore(useLLM).stream.mockImplementation(async (_model: string, _provider: unknown, _messages: unknown, options: any) => {
      const sparkCommandTool = options?.tools?.find((tool: any) => tool.function?.name === 'builtIn_sparkCommand')
      await sparkCommandTool.execute({
        commands: [{
          destinations: ['minecraft'],
          intent: 'action',
          priority: 'high',
          interrupt: 'false',
          ack: 'go',
          guidance: null,
        }],
      } satisfies z.infer<typeof sparkNotifyCommandSchema>)
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'This should be ignored.' } satisfies StreamEvent)
      await options?.onStreamEvent?.({ type: 'finish' } satisfies StreamEvent)
    })

    const onDelta = vi.fn()
    const onEnd = vi.fn()
    mockedStore(useCharacterStore).onSparkNotifyReactionStreamEvent = onDelta
    mockedStore(useCharacterStore).onSparkNotifyReactionStreamEnd = onEnd

    const store = useCharacterOrchestratorStore()
    const event: WebSocketEventOf<'spark:notify'> = {
      type: 'spark:notify',
      source: 'minecraft',
      data: {
        id: nanoid(),
        eventId: nanoid(),
        kind: 'alarm',
        urgency: 'immediate',
        headline: 'Take cover',
        destinations: ['character'],
      },
    }

    const result = await store.handleSparkNotify(event, {
      forceSparkCommandResponse: true,
    })

    const streamOptions = mockStream.mock.calls[0][3]
    expect(streamOptions.supportsTools).toBe(true)
    expect(streamOptions.waitForTools).toBe(true)
    expect(streamOptions.toolChoice).toEqual({
      type: 'function',
      function: { name: 'builtIn_sparkCommand' },
    })
    expect(result?.commands?.length).toBe(1)
    expect(onDelta).not.toBeCalled()
    expect(onEnd).toBeCalledWith(event.data.id, '')
  })

  it('forwards runtime-only message overrides into the rendered spark prompt', async () => {
    const mockStream = vi.fn()
    mockedStore(useLLM).stream = mockStream
    mockedStore(useLLM).stream.mockImplementation(async (_model: string, _provider: unknown, _messages: unknown, options: any) => {
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'legacy-safe text' } satisfies StreamEvent)
      await options?.onStreamEvent?.({ type: 'finish' } satisfies StreamEvent)
    })

    const store = useCharacterOrchestratorStore()
    const event: WebSocketEventOf<'spark:notify'> = {
      type: 'spark:notify',
      source: 'plugin:airi-plugin-game-chess',
      data: {
        id: nanoid(),
        eventId: nanoid(),
        kind: 'ping',
        urgency: 'immediate',
        headline: 'Legacy rendering',
        destinations: ['character'],
      },
    }

    await store.handleSparkNotify(event, {
      forceTextResponse: true,
      messageOverride: {
        appendSystemInstructions: ['Plugin-specific hint'],
        appendUserSections: ['Rendered board snapshot'],
      },
    })

    const renderedMessages = mockStream.mock.calls[0]?.[2] as Array<{ role: string, content: string }> | undefined
    expect(String(renderedMessages?.[0]?.content)).toContain('Plugin-specific hint')
    expect(String(renderedMessages?.[1]?.content)).toContain('Rendered board snapshot')
  })

  it('reuses the same Nahida supplement for spark:notify reactions', async () => {
    const airiCardStore = useAiriCardStore()
    // @ts-expect-error - testing purpose
    airiCardStore.systemPrompt = 'Base Nahida prompt.'
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
      mode: 'active',
    })

    const mockStream = vi.fn()
    mockedStore(useLLM).stream = mockStream
    mockedStore(useLLM).stream.mockImplementation(async (_model: string, _provider: unknown, _messages: unknown, options: any) => {
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'I am still here with you.' } satisfies StreamEvent)
      await options?.onStreamEvent?.({ type: 'finish' } satisfies StreamEvent)
    })

    const onDelta = vi.fn()
    const onEnd = vi.fn()
    mockedStore(useCharacterStore).onSparkNotifyReactionStreamEvent = onDelta
    mockedStore(useCharacterStore).onSparkNotifyReactionStreamEnd = onEnd

    const store = useCharacterOrchestratorStore()
    const event: WebSocketEventOf<'spark:notify'> = {
      type: 'spark:notify',
      source: 'plugin:airi-plugin-game-chess',
      data: {
        id: nanoid(),
        eventId: nanoid(),
        kind: 'ping',
        urgency: 'immediate',
        headline: 'Check in gently',
        destinations: ['character'],
      },
    }

    await store.handleSparkNotifyWithReaction(event, {
      forceTextResponse: true,
    })

    const renderedMessages = mockStream.mock.calls[0]?.[2] as Array<{ role: string, content: string }> | undefined
    expect(String(renderedMessages?.[0]?.content)).toContain('Base Nahida prompt.')
    expect(String(renderedMessages?.[0]?.content)).toContain('[Nahida Persona Supplement]')
    expect(String(renderedMessages?.[0]?.content)).toContain('Memory boundaries: active')
    expect(String(renderedMessages?.[0]?.content)).toContain('For reminders or check-ins, observe first, then offer one brief, warm nudge.')
    expect(onDelta).toBeCalled()
    expect(onEnd).toBeCalled()
  })

  it('routes managed proactive companion events through the text-only reminder path', async () => {
    let sparkNotifyListener: ((event: WebSocketEventOf<'spark:notify'>) => Promise<void>) | undefined
    mockedStore(useModsServerChannelStore).onEvent = vi.fn((type: string, callback: unknown) => {
      if (type === 'spark:notify') {
        sparkNotifyListener = callback as (event: WebSocketEventOf<'spark:notify'>) => Promise<void>
      }

      return () => {}
    })

    const proactiveStore = useProactiveCompanionStore()
    proactiveStore.setBridge({
      loadConfig: async () => ({
        ...createDefaultProactiveCompanionSettings(),
        enabled: true,
        globalCooldownMs: 180000,
        topicCooldownMs: 600000,
        intensity: 'low',
      }),
      saveConfig: async settings => settings,
      getRuntimeSnapshot: async () => ({
        ...createDefaultProactiveCompanionRuntimeSnapshot(),
        settings: {
          ...createDefaultProactiveCompanionSettings(),
          enabled: true,
          globalCooldownMs: 180000,
          topicCooldownMs: 600000,
          intensity: 'low',
        },
        state: 'ready',
        summary: 'ready',
        sidecarConnected: true,
        sidecarSummary: 'ready',
        recentDecisions: [],
        refreshedAt: 1,
      }),
      refreshRuntime: async () => ({
        ...createDefaultProactiveCompanionRuntimeSnapshot(),
        settings: {
          ...createDefaultProactiveCompanionSettings(),
          enabled: true,
          globalCooldownMs: 180000,
          topicCooldownMs: 600000,
          intensity: 'low',
        },
        state: 'ready',
        summary: 'ready',
        sidecarConnected: true,
        sidecarSummary: 'ready',
        recentDecisions: [],
        refreshedAt: 1,
      }),
      clearHistory: async () => ({
        ...createDefaultProactiveCompanionRuntimeSnapshot(),
        settings: {
          ...createDefaultProactiveCompanionSettings(),
          enabled: true,
          globalCooldownMs: 180000,
          topicCooldownMs: 600000,
          intensity: 'low',
        },
        state: 'ready',
        summary: 'ready',
        sidecarConnected: true,
        sidecarSummary: 'ready',
        recentDecisions: [],
        refreshedAt: 1,
      }),
      recordContextUpdate: async () => ({
        ...createDefaultProactiveCompanionRuntimeSnapshot(),
        settings: {
          ...createDefaultProactiveCompanionSettings(),
          enabled: true,
          globalCooldownMs: 180000,
          topicCooldownMs: 600000,
          intensity: 'low',
        },
        state: 'ready',
        summary: 'ready',
        sidecarConnected: true,
        sidecarSummary: 'ready',
        recentDecisions: [],
        refreshedAt: 1,
      }),
      evaluateSparkNotify: async () => ({
        managed: true,
        decision: {
          event: {
            id: 'sidecar-1',
            source: 'plugin:local.proactive-companion',
            kind: 'reminder',
            headline: 'Drink water soon',
            topicKey: 'drink water soon',
            destinations: ['character'],
            receivedAt: 1,
          },
          decision: 'delivered',
          reason: 'approved',
          presentation: 'light-prompt',
          matchedSource: true,
          sidecarReady: true,
          decidedAt: 2,
        },
        runtime: {
          ...createDefaultProactiveCompanionRuntimeSnapshot(),
          settings: {
            ...createDefaultProactiveCompanionSettings(),
            enabled: true,
            globalCooldownMs: 180000,
            topicCooldownMs: 600000,
            intensity: 'low',
          },
          engineActive: true,
          state: 'ready',
          summary: 'ready',
          sidecarConnected: true,
          sidecarSummary: 'ready',
          recentDecisions: [],
          refreshedAt: 2,
        },
      }),

      importLegacyConfig: async () => ({
        mappedFields: [],
        unmappedFields: [],
        sourceMode: 'external-sidecar' as const,
        switchedToEmbedded: false,
        settings: createDefaultProactiveCompanionSettings(),
        importedAt: Date.now(),
      }),
      getSourceMode: async () => 'external-sidecar' as const,
      setSourceMode: async () => createDefaultProactiveCompanionRuntimeSnapshot(),
      triggerManualCheckIn: async () => ({
        ok: true,
        message: 'manual',
        runtime: createDefaultProactiveCompanionRuntimeSnapshot(),
      }),
      simulateSignal: async () => ({
        ok: true,
        message: 'simulated',
        runtime: createDefaultProactiveCompanionRuntimeSnapshot(),
      }),
      pauseCompanion: async () => createDefaultProactiveCompanionRuntimeSnapshot(),
      clearCooldowns: async () => createDefaultProactiveCompanionRuntimeSnapshot(),
      recordVisionObservation: async () => ({
        ok: true,
        message: 'recorded',
        runtime: createDefaultProactiveCompanionRuntimeSnapshot(),
      }),
    })

    const mockStream = vi.fn()
    mockedStore(useLLM).stream = mockStream
    mockedStore(useLLM).stream.mockImplementation(async (_model: string, _provider: unknown, _messages: unknown, options: any) => {
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'Please remember to rest a little.' } satisfies StreamEvent)
      await options?.onStreamEvent?.({ type: 'finish' } satisfies StreamEvent)
    })

    const onDelta = vi.fn()
    const onEnd = vi.fn()
    mockedStore(useCharacterStore).onSparkNotifyReactionStreamEvent = onDelta
    mockedStore(useCharacterStore).onSparkNotifyReactionStreamEnd = onEnd

    const store = useCharacterOrchestratorStore()
    store.initialize()

    await sparkNotifyListener?.({
      type: 'spark:notify',
      source: 'plugin:local.proactive-companion',
      data: {
        id: 'sidecar-1',
        eventId: 'sidecar-1',
        kind: 'reminder',
        urgency: 'immediate',
        headline: 'Drink water soon',
        destinations: ['character'],
      },
    })

    const streamOptions = mockStream.mock.calls[0]?.[3]
    expect(streamOptions.supportsTools).toBe(false)
    expect(streamOptions.waitForTools).toBe(false)
    expect(onDelta).toBeCalled()
    expect(onEnd).toBeCalled()
    store.dispose()
  })

  it('suppresses managed proactive companion events when governance says no', async () => {
    let sparkNotifyListener: ((event: WebSocketEventOf<'spark:notify'>) => Promise<void>) | undefined
    mockedStore(useModsServerChannelStore).onEvent = vi.fn((type: string, callback: unknown) => {
      if (type === 'spark:notify') {
        sparkNotifyListener = callback as (event: WebSocketEventOf<'spark:notify'>) => Promise<void>
      }

      return () => {}
    })

    const proactiveStore = useProactiveCompanionStore()
    const runtimeSnapshot = {
      ...createDefaultProactiveCompanionRuntimeSnapshot(),
      settings: {
        ...createDefaultProactiveCompanionSettings(),
        enabled: true,
        globalCooldownMs: 180000,
        topicCooldownMs: 600000,
        intensity: 'low' as const,
      },
      state: 'ready' as const,
      summary: 'ready',
      sidecarConnected: true,
      sidecarSummary: 'ready',
      recentDecisions: [],
      refreshedAt: 2,
    }
    proactiveStore.setBridge({
      loadConfig: async () => ({
        ...createDefaultProactiveCompanionSettings(),
        enabled: true,
        globalCooldownMs: 180000,
        topicCooldownMs: 600000,
        intensity: 'low',
      }),
      saveConfig: async settings => settings,
      getRuntimeSnapshot: async () => runtimeSnapshot,
      refreshRuntime: async () => runtimeSnapshot,
      clearHistory: async () => runtimeSnapshot,
      recordContextUpdate: async () => runtimeSnapshot,
      evaluateSparkNotify: async () => ({
        managed: true,
        decision: {
          event: {
            id: 'sidecar-2',
            source: 'plugin:local.proactive-companion',
            kind: 'reminder',
            headline: 'Repeat reminder',
            topicKey: 'repeat reminder',
            destinations: ['character'],
            receivedAt: 1,
          },
          decision: 'suppressed',
          reason: 'cooldown',
          presentation: 'silent',
          matchedSource: true,
          sidecarReady: true,
          decidedAt: 2,
        },
        runtime: runtimeSnapshot,
      }),

      importLegacyConfig: async () => ({
        mappedFields: [],
        unmappedFields: [],
        sourceMode: 'external-sidecar' as const,
        switchedToEmbedded: false,
        settings: createDefaultProactiveCompanionSettings(),
        importedAt: Date.now(),
      }),
      getSourceMode: async () => 'external-sidecar' as const,
      setSourceMode: async () => createDefaultProactiveCompanionRuntimeSnapshot(),
      triggerManualCheckIn: async () => ({
        ok: true,
        message: 'manual',
        runtime: createDefaultProactiveCompanionRuntimeSnapshot(),
      }),
      simulateSignal: async () => ({
        ok: true,
        message: 'simulated',
        runtime: createDefaultProactiveCompanionRuntimeSnapshot(),
      }),
      pauseCompanion: async () => createDefaultProactiveCompanionRuntimeSnapshot(),
      clearCooldowns: async () => createDefaultProactiveCompanionRuntimeSnapshot(),
      recordVisionObservation: async () => ({
        ok: true,
        message: 'recorded',
        runtime: createDefaultProactiveCompanionRuntimeSnapshot(),
      }),
    })

    const mockStream = vi.fn()
    mockedStore(useLLM).stream = mockStream

    const store = useCharacterOrchestratorStore()
    store.initialize()

    await sparkNotifyListener?.({
      type: 'spark:notify',
      source: 'plugin:local.proactive-companion',
      data: {
        id: 'sidecar-2',
        eventId: 'sidecar-2',
        kind: 'reminder',
        urgency: 'soon',
        headline: 'Repeat reminder',
        destinations: ['character'],
      },
    })

    expect(mockStream).not.toBeCalled()
    store.dispose()
  })
})
