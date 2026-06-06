import type { ProactiveCompanionDispatchEvent } from '../shared/proactive-companion'

import { createDefaultProactiveCompanionRuntimeSnapshot } from '@proj-airi/stage-ui/stores/proactive-companion-shared'
import { describe, expect, it, vi } from 'vitest'

import { handleProactiveRuntimeEvent } from './proactive-runtime-events'

function createDeliveredEvent(): ProactiveCompanionDispatchEvent {
  return {
    decision: {
      event: {
        id: 'embedded-manual-1',
        source: 'embedded:manual',
        kind: 'gentle-check-in',
        headline: '现在适合轻轻确认一下近况',
        note: '这是来自轻量操作台的手动 check-in。',
        topicKey: 'manual-check-in',
        destinations: ['character'],
        receivedAt: 10,
      },
      decision: 'delivered',
      reason: '已放行，因为信号通过了空闲、冷却、主题和频率检查。',
      presentation: 'light-prompt',
      matchedSource: true,
      sidecarReady: false,
      decidedAt: 11,
    },
    runtime: {
      ...createDefaultProactiveCompanionRuntimeSnapshot(),
      settings: {
        ...createDefaultProactiveCompanionRuntimeSnapshot().settings,
        sourceMode: 'embedded',
      },
      state: 'ready',
      summary: 'Embedded proactive runtime is healthy.',
      engineActive: true,
      sidecarSummary: '当前模式不依赖 external sidecar 的 ready 状态。',
      refreshedAt: 12,
      lastSignalSource: 'manual',
      lastManualTriggerAt: 11,
    },
    sparkNotify: {
      type: 'spark:notify',
      source: 'embedded:manual',
      data: {
        id: 'embedded-manual-1',
        eventId: 'embedded-manual-1',
        kind: 'ping',
        urgency: 'later',
        headline: '现在适合轻轻确认一下近况',
        note: '这是来自轻量操作台的手动 check-in。',
        destinations: ['character'],
      },
    },
  }
}

describe('handleProactiveRuntimeEvent', () => {
  it('surfaces delivered embedded reminders on non-main-stage routes via the lightweight feedback path', async () => {
    const event = createDeliveredEvent()
    const applyRuntimeSnapshot = vi.fn()
    const syncCoordinationRuntime = vi.fn()
    const reactOnMainStage = vi.fn()
    const notifyOffStageDelivery = vi.fn()

    await handleProactiveRuntimeEvent({ body: event }, {
      applyRuntimeSnapshot,
      syncCoordinationRuntime,
      isMainStageRoute: () => false,
      reactOnMainStage,
      notifyOffStageDelivery,
    })

    expect(applyRuntimeSnapshot).toHaveBeenCalledWith(event.runtime)
    expect(syncCoordinationRuntime).toHaveBeenCalledWith(event.runtime)
    expect(notifyOffStageDelivery).toHaveBeenCalledWith(event)
    expect(reactOnMainStage).not.toHaveBeenCalled()
  })

  it('keeps suppressed embedded reminders history-only outside the main stage', async () => {
    const event = createDeliveredEvent()
    event.decision.decision = 'suppressed'
    event.sparkNotify = undefined

    const applyRuntimeSnapshot = vi.fn()
    const syncCoordinationRuntime = vi.fn()
    const reactOnMainStage = vi.fn()
    const notifyOffStageDelivery = vi.fn()

    await handleProactiveRuntimeEvent({ body: event }, {
      applyRuntimeSnapshot,
      syncCoordinationRuntime,
      isMainStageRoute: () => false,
      reactOnMainStage,
      notifyOffStageDelivery,
    })

    expect(applyRuntimeSnapshot).toHaveBeenCalledWith(event.runtime)
    expect(syncCoordinationRuntime).toHaveBeenCalledWith(event.runtime)
    expect(notifyOffStageDelivery).not.toHaveBeenCalled()
    expect(reactOnMainStage).not.toHaveBeenCalled()
  })
})
