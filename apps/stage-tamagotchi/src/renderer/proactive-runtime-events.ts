import type { ProactiveCompanionRuntimeSnapshot } from '@proj-airi/stage-ui/stores/proactive-companion-shared'

import type {
  ProactiveCompanionDispatchEvent,
  ProactiveCompanionSparkNotifyInput,
} from '../shared/proactive-companion'

interface ProactiveRuntimeEventEnvelope {
  body?: ProactiveCompanionDispatchEvent
}

export interface ProactiveRuntimeEventHandlerDependencies {
  applyRuntimeSnapshot: (runtime: ProactiveCompanionRuntimeSnapshot) => void
  syncCoordinationRuntime: (runtime: ProactiveCompanionRuntimeSnapshot) => void
  isMainStageRoute: () => boolean
  reactOnMainStage: (sparkNotify: ProactiveCompanionSparkNotifyInput) => Promise<void>
  notifyOffStageDelivery: (event: ProactiveCompanionDispatchEvent) => void
}

/**
 * Routes one proactive runtime event into the current renderer surface.
 *
 * Use when:
 * - The desktop runtime already evaluated an embedded proactive signal
 * - Every renderer window should refresh its proactive snapshot consistently
 * - Non-stage routes need a lightweight delivered-only feedback path
 *
 * Expects:
 * - `event.body` already contains the latest decision plus runtime snapshot
 * - Only delivered events with `sparkNotify` should surface visible feedback
 *
 * Returns:
 * - Resolves after any main-stage reaction completes
 */
export async function handleProactiveRuntimeEvent(
  event: ProactiveRuntimeEventEnvelope,
  dependencies: ProactiveRuntimeEventHandlerDependencies,
) {
  if (!event.body) {
    return
  }

  dependencies.applyRuntimeSnapshot(event.body.runtime)
  dependencies.syncCoordinationRuntime(event.body.runtime)

  if (event.body.decision.decision !== 'delivered' || !event.body.sparkNotify) {
    return
  }

  if (dependencies.isMainStageRoute()) {
    await dependencies.reactOnMainStage(event.body.sparkNotify)
    return
  }

  dependencies.notifyOffStageDelivery(event.body)
}
