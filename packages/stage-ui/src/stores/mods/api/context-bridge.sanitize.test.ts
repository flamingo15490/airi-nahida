import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../character', () => ({
  useCharacterOrchestratorStore: () => ({
    handleSparkNotifyWithReaction: vi.fn(),
  }),
}))

vi.mock('../../chat', () => ({
  useChatOrchestratorStore: () => ({}),
}))

vi.mock('../../chat/session-store', () => ({
  useChatSessionStore: () => ({}),
}))

vi.mock('../../chat/stream-store', () => ({
  useChatStreamStore: () => ({}),
}))

vi.mock('../../chat/context-store', () => ({
  useChatContextStore: () => ({
    ingestContextMessage: vi.fn(),
  }),
}))

vi.mock('../../devtools/context-observability', () => ({
  useContextObservabilityStore: () => ({
    recordLifecycle: vi.fn(),
  }),
}))

vi.mock('../../modules/consciousness', () => ({
  useConsciousnessStore: () => ({
    activeProvider: { value: undefined },
    activeModel: { value: undefined },
  }),
}))

vi.mock('../../providers', () => ({
  useProvidersStore: () => ({}),
}))

vi.mock('./channel-server', () => ({
  useModsServerChannelStore: () => ({
    ensureConnected: vi.fn(async () => undefined),
    send: vi.fn(),
    onReconnected: vi.fn(() => () => undefined),
    onContextUpdate: vi.fn(() => () => undefined),
    onEvent: vi.fn(() => () => undefined),
  }),
}))

describe('normalizeContextSnapshot', () => {
  it('removes non-cloneable browser-like objects from nested context payloads', async () => {
    const { normalizeContextSnapshot } = await import('./context-bridge')
    const fakeEvent = new Event('message')
    const fakeNode = {
      nodeType: 1,
      nodeName: 'DIV',
      ownerDocument: {},
    }

    const result = normalizeContextSnapshot({
      contexts: {
        screen: [
          {
            id: 'ctx-1',
            contextId: 'ctx-1',
            strategy: ContextUpdateStrategy.AppendSelf,
            text: 'safe text',
            createdAt: 0,
            content: {
              safe: true,
              event: fakeEvent,
              node: fakeNode,
              nested: {
                keep: 'value',
                drop: fakeEvent,
              },
            },
          },
        ],
      },
    })

    expect(result).toEqual({
      contexts: {
        screen: [
          {
            id: 'ctx-1',
            contextId: 'ctx-1',
            strategy: ContextUpdateStrategy.AppendSelf,
            text: 'safe text',
            createdAt: 0,
            content: {
              safe: true,
              nested: {
                keep: 'value',
              },
            },
          },
        ],
      },
    })

    expect(() => structuredClone(result)).not.toThrow()
  })
})
