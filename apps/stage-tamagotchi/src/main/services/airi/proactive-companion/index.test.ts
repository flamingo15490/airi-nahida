import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { createDefaultExternalMemoryJudgementSnapshot, createDefaultExternalMemoryUsageSnapshot, createExternalMemoryReasonSnapshot } from '@proj-airi/stage-ui/stores/external-memory-shared'
import { createDefaultProactiveCompanionRuntimeSnapshot } from '@proj-airi/stage-ui/stores/proactive-companion-shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const appMock = vi.hoisted(() => ({
  getPath: vi.fn(),
}))

vi.mock('electron', () => ({
  app: appMock,
}))

function createExternalMemoryManager() {
  return {
    getLastMemoryUsage: () => ({
      ...createDefaultExternalMemoryUsageSnapshot(),
      bridgeState: 'ready',
      reason: createExternalMemoryReasonSnapshot('bridge-ready'),
      summary: 'External memory bridge is healthy.',
      context: {
        ...createDefaultExternalMemoryUsageSnapshot().context,
        sections: { userProfile: [], preferences: [], followUps: [], recentSummary: [], characterKnowledge: [] },
      },
    }),
    recordMemoryObservation: async () => createDefaultExternalMemoryJudgementSnapshot(),
    refreshMemoryJudgement: async () => createDefaultExternalMemoryJudgementSnapshot(),
    getMemoryJudgementSnapshot: async () => createDefaultExternalMemoryJudgementSnapshot(),
    clearMemoryCandidateLedger: async () => createDefaultExternalMemoryJudgementSnapshot(),
    clearMemoryWriteCandidateHistory: () => createDefaultExternalMemoryUsageSnapshot(),
    loadMemoryContext: async () => createDefaultExternalMemoryUsageSnapshot().context,
    refreshMemoryContext: async () => createDefaultExternalMemoryUsageSnapshot().context,
    writeFollowUpItems: async () => createDefaultExternalMemoryUsageSnapshot(),
    writePreferencesPatch: async () => createDefaultExternalMemoryUsageSnapshot(),
    writeRecentSummary: async () => createDefaultExternalMemoryUsageSnapshot(),
    writeUserProfilePatch: async () => createDefaultExternalMemoryUsageSnapshot(),
  } as never
}
function createExternalIntegrationsManager(state: 'ready' | 'degraded' | 'disabled' = 'ready') {
  return {
    getSnapshots: () => [{
      kind: 'companion-sidecar' as const,
      config: {
        kind: 'companion-sidecar' as const,
        enabled: state !== 'disabled',
        moduleName: 'Proactive Companion',
        pluginId: 'local.proactive-companion',
        expectedWsUrl: 'ws://127.0.0.1:6121/ws',
      },
      status: {
        kind: 'companion-sidecar' as const,
        state,
        summary: state === 'ready'
          ? 'Companion sidecar is connected to the current AIRI server channel.'
          : 'Companion sidecar is not connected to the current AIRI server channel.',
      },
    }],
  }
}

describe('proactive companion manager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('persists desktop proactive settings and exposes a runtime snapshot', async () => {
    const userDataRoot = await mkdtemp(join(tmpdir(), 'airi-proactive-companion-'))
    appMock.getPath.mockImplementation((name: string) => {
      if (name === 'userData') {
        return userDataRoot
      }

      throw new Error(`Unexpected Electron path lookup: ${name}`)
    })

    const { createProactiveCompanionManager } = await import('./index')
    const manager = createProactiveCompanionManager({
      externalIntegrationsManager: createExternalIntegrationsManager() as never,
      externalMemoryManager: createExternalMemoryManager(),
      setTimeoutFn: (handler) => { setTimeout(handler, 0); return 0 as never },
      clearTimeoutFn: () => {},
    })

    expect(manager.loadConfig()).toMatchObject({
      enabled: true,
      globalCooldownMs: 180000,
      topicCooldownMs: 600000,
      intensity: 'low',
    })

    expect(manager.saveConfig({
      ...createDefaultProactiveCompanionRuntimeSnapshot().settings,
      enabled: true,
      globalCooldownMs: 0,
      topicCooldownMs: 60000,
      intensity: 'balanced',
    })).toMatchObject({
      globalCooldownMs: 180000,
      topicCooldownMs: 180000,
      intensity: 'balanced',
    })

    expect(manager.getRuntimeSnapshot().state).toBe('ready')
    expect(manager.getRuntimeSnapshot().sidecarConnected).toBe(true)
  })

  it('fails gracefully when the legacy proactive config file is missing', async () => {
    const userDataRoot = await mkdtemp(join(tmpdir(), 'airi-proactive-companion-missing-user-'))
    const appDataRoot = await mkdtemp(join(tmpdir(), 'airi-proactive-companion-missing-appdata-'))
    appMock.getPath.mockImplementation((name: string) => {
      if (name === 'userData') {
        return userDataRoot
      }

      if (name === 'appData') {
        return appDataRoot
      }

      throw new Error(`Unexpected Electron path lookup: ${name}`)
    })

    const { createProactiveCompanionManager } = await import('./index')
    const readLegacyConfigText = vi.fn(async () => {
      throw new Error('ENOENT: no such file or directory')
    })
    const manager = createProactiveCompanionManager({
      externalIntegrationsManager: createExternalIntegrationsManager() as never,
      externalMemoryManager: createExternalMemoryManager(),
      readLegacyConfigText,
      setTimeoutFn: (handler) => { setTimeout(handler, 0); return 0 as never },
      clearTimeoutFn: () => {},
    })

    await expect(manager.importLegacyProactiveConfig()).rejects.toThrow('未找到旧版 proactive 配置文件')
    expect(readLegacyConfigText).toHaveBeenCalledWith(join(appDataRoot, 'ai.moeru.airi', 'proactive-companion', 'proactive-config.json'))
  })

  it('governs matching sidecar events with destination checks and cooldowns', async () => {
    const userDataRoot = await mkdtemp(join(tmpdir(), 'airi-proactive-companion-govern-'))
    appMock.getPath.mockImplementation((name: string) => {
      if (name === 'userData') {
        return userDataRoot
      }

      throw new Error(`Unexpected Electron path lookup: ${name}`)
    })

    const { createProactiveCompanionManager } = await import('./index')
    const manager = createProactiveCompanionManager({
      externalIntegrationsManager: createExternalIntegrationsManager() as never,
      externalMemoryManager: createExternalMemoryManager(),
      setTimeoutFn: (handler) => { setTimeout(handler, 0); return 0 as never },
      clearTimeoutFn: () => {},
    })

    const foreignResult = manager.evaluateSparkNotify({
      type: 'spark:notify',
      source: 'plugin:airi-plugin-game-chess',
      data: {
        id: 'foreign-1',
        eventId: 'foreign-1',
        kind: 'reminder',
        urgency: 'soon',
        headline: 'Foreign reminder',
        destinations: ['character'],
      },
    })

    expect(foreignResult.managed).toBe(false)
    expect(foreignResult.runtime.recentDecisions).toHaveLength(0)

    const deliveredResult = manager.evaluateSparkNotify({
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

    expect(deliveredResult.managed).toBe(true)
    expect(deliveredResult.decision?.decision).toBe('delivered')
    expect(deliveredResult.decision?.presentation).toBe('light-prompt')
    expect(deliveredResult.decision?.reason).toContain('来源、目标、内容和冷却检查')

    const destinationSuppressedResult = manager.evaluateSparkNotify({
      type: 'spark:notify',
      source: 'plugin:local.proactive-companion',
      data: {
        id: 'sidecar-target-miss',
        eventId: 'sidecar-target-miss',
        kind: 'reminder',
        urgency: 'soon',
        headline: 'Only for another module',
        destinations: ['notebook'],
      },
    })

    expect(destinationSuppressedResult.managed).toBe(true)
    expect(destinationSuppressedResult.decision?.decision).toBe('suppressed')
    expect(destinationSuppressedResult.decision?.reason).toContain('没有指向 AIRI 角色提醒目标')

    const suppressedResult = manager.evaluateSparkNotify({
      type: 'spark:notify',
      source: 'local.proactive-companion',
      data: {
        id: 'sidecar-2',
        eventId: 'sidecar-2',
        kind: 'reminder',
        urgency: 'soon',
        headline: 'Drink water soon',
        destinations: ['character'],
      },
    })

    expect(suppressedResult.managed).toBe(true)
    expect(suppressedResult.decision?.decision).toBe('suppressed')
    expect(suppressedResult.decision?.reason).toContain('全局主动陪伴冷却仍在生效')
    expect(suppressedResult.decision?.cooldownUntil).toBeTypeOf('number')
    expect(suppressedResult.runtime.recentDecisions[0]?.event.id).toBe('sidecar-2')
  })

  it('suppresses empty sidecar events with explicit reasons', async () => {
    const userDataRoot = await mkdtemp(join(tmpdir(), 'airi-proactive-companion-shape-'))
    appMock.getPath.mockImplementation((name: string) => {
      if (name === 'userData') {
        return userDataRoot
      }

      throw new Error(`Unexpected Electron path lookup: ${name}`)
    })

    const { createProactiveCompanionManager } = await import('./index')
    const manager = createProactiveCompanionManager({
      externalIntegrationsManager: createExternalIntegrationsManager() as never,
      externalMemoryManager: createExternalMemoryManager(),
      setTimeoutFn: (handler) => { setTimeout(handler, 0); return 0 as never },
      clearTimeoutFn: () => {},
    })

    const emptyResult = manager.evaluateSparkNotify({
      type: 'spark:notify',
      source: 'plugin:local.proactive-companion',
      data: {
        id: 'sidecar-empty',
        eventId: 'sidecar-empty',
        kind: 'reminder',
        urgency: 'soon',
        headline: '   ',
        note: '   ',
        destinations: ['character'],
      },
    })

    expect(emptyResult.managed).toBe(true)
    expect(emptyResult.decision?.decision).toBe('suppressed')
    expect(emptyResult.decision?.reason).toContain('没有提供值得展示为提醒的标题或备注')
  })

  it('maps missing or unsupported sidecar kinds into the conservative unknown bucket', async () => {
    const { classifyProactiveCompanionKind } = await import('./index')

    expect(classifyProactiveCompanionKind()).toBe('unknown')
    expect(classifyProactiveCompanionKind('ambient')).toBe('unknown')
  })

  it('drops matched sidecar events when the sidecar is degraded', async () => {
    const userDataRoot = await mkdtemp(join(tmpdir(), 'airi-proactive-companion-degraded-'))
    appMock.getPath.mockImplementation((name: string) => {
      if (name === 'userData') {
        return userDataRoot
      }

      throw new Error(`Unexpected Electron path lookup: ${name}`)
    })

    const { createProactiveCompanionManager } = await import('./index')
    const manager = createProactiveCompanionManager({
      externalIntegrationsManager: createExternalIntegrationsManager('degraded') as never,
      externalMemoryManager: createExternalMemoryManager(),
      setTimeoutFn: (handler) => { setTimeout(handler, 0); return 0 as never },
      clearTimeoutFn: () => {},
    })

    const result = manager.evaluateSparkNotify({
      type: 'spark:notify',
      source: 'local.proactive-companion',
      data: {
        id: 'sidecar-degraded',
        eventId: 'sidecar-degraded',
        kind: 'alarm',
        urgency: 'immediate',
        headline: 'Critical check-in',
        destinations: ['character'],
      },
    })

    expect(result.managed).toBe(true)
    expect(result.decision?.decision).toBe('dropped')
    expect(result.decision?.reason).toContain('companion sidecar 当前未就绪')
    expect(result.runtime.lastFailureReason).toContain('not connected')
  })

  it('uses intensity only for delivered presentation strength', async () => {
    const userDataRoot = await mkdtemp(join(tmpdir(), 'airi-proactive-companion-intensity-'))
    appMock.getPath.mockImplementation((name: string) => {
      if (name === 'userData') {
        return userDataRoot
      }

      throw new Error(`Unexpected Electron path lookup: ${name}`)
    })

    const { createProactiveCompanionManager } = await import('./index')
    const lowManager = createProactiveCompanionManager({
      externalIntegrationsManager: createExternalIntegrationsManager() as never,
      externalMemoryManager: createExternalMemoryManager(),
      setTimeoutFn: (handler) => { setTimeout(handler, 0); return 0 as never },
      clearTimeoutFn: () => {},
    })

    const lowResult = lowManager.evaluateSparkNotify({
      type: 'spark:notify',
      source: 'plugin:local.proactive-companion',
      data: {
        id: 'sidecar-important-low',
        eventId: 'sidecar-important-low',
        kind: 'alarm',
        urgency: 'immediate',
        headline: 'Stand up now',
        destinations: ['character'],
      },
    })

    expect(lowResult.decision?.decision).toBe('delivered')
    expect(lowResult.decision?.presentation).toBe('light-prompt')

    const balancedManager = createProactiveCompanionManager({
      externalIntegrationsManager: createExternalIntegrationsManager() as never,
      externalMemoryManager: createExternalMemoryManager(),
      setTimeoutFn: (handler) => { setTimeout(handler, 0); return 0 as never },
      clearTimeoutFn: () => {},
    })
    balancedManager.saveConfig({
      ...createDefaultProactiveCompanionRuntimeSnapshot().settings,
      enabled: true,
      topicCooldownMs: 600000,
      intensity: 'balanced',
    })

    const balancedResult = balancedManager.evaluateSparkNotify({
      type: 'spark:notify',
      source: 'plugin:local.proactive-companion',
      data: {
        id: 'sidecar-important-balanced',
        eventId: 'sidecar-important-balanced',
        kind: 'alarm',
        urgency: 'immediate',
        headline: 'Stand up now',
        destinations: ['character'],
      },
    })

    expect(balancedResult.decision?.decision).toBe('delivered')
    expect(balancedResult.decision?.presentation).toBe('prominent-reminder')
  })

  it('records legacy proactive context:update events into recent history without duplicates', async () => {
    const userDataRoot = await mkdtemp(join(tmpdir(), 'airi-proactive-companion-context-update-'))
    appMock.getPath.mockImplementation((name: string) => {
      if (name === 'userData') {
        return userDataRoot
      }

      throw new Error(`Unexpected Electron path lookup: ${name}`)
    })

    const { createProactiveCompanionManager } = await import('./index')
    const manager = createProactiveCompanionManager({
      externalIntegrationsManager: createExternalIntegrationsManager() as never,
      externalMemoryManager: createExternalMemoryManager(),
      setTimeoutFn: (handler) => { setTimeout(handler, 0); return 0 as never },
      clearTimeoutFn: () => {},
    })

    const runtimeAfterFirstRecord = manager.recordContextUpdate({
      type: 'context:update',
      metadata: {
        event: {
          id: 'legacy-event-1',
        },
      },
      data: {
        id: 'legacy-update-1',
        contextId: 'proactive:vision:task-review',
        strategy: ContextUpdateStrategy.AppendSelf,
        lane: 'system',
        text: '[Proactive companion internal instruction] The user is staring at the task list for too long.',
        metadata: {
          module: 'proactive-companion',
          source: 'vision',
          priority: 'normal',
          topic: 'task-review',
        },
      },
    })

    expect(runtimeAfterFirstRecord.recentDecisions).toHaveLength(1)
    expect(runtimeAfterFirstRecord.recentDecisions[0]?.event.source).toBe('legacy:vision')
    expect(runtimeAfterFirstRecord.recentDecisions[0]?.event.kind).toBe('reminder')
    expect(runtimeAfterFirstRecord.recentDecisions[0]?.decision).toBe('delivered')
    expect(runtimeAfterFirstRecord.recentDecisions[0]?.reason).toContain('legacy context:update 兼容路径')
    expect(runtimeAfterFirstRecord.recentDecisions[0]?.reason).toContain('只用于历史记录')

    const runtimeAfterDuplicateRecord = manager.recordContextUpdate({
      type: 'context:update',
      metadata: {
        event: {
          id: 'legacy-event-1',
        },
      },
      data: {
        id: 'legacy-update-1',
        contextId: 'proactive:vision:task-review',
        strategy: ContextUpdateStrategy.AppendSelf,
        lane: 'system',
        text: '[Proactive companion internal instruction] The user is staring at the task list for too long.',
        metadata: {
          module: 'proactive-companion',
          source: 'vision',
          priority: 'normal',
          topic: 'task-review',
        },
      },
    })

    expect(runtimeAfterDuplicateRecord.recentDecisions).toHaveLength(1)
  })
})
