import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { CompanionCoordinationExplainabilityBlock } from '@proj-airi/stage-ui/stores/companion-coordination-shared'
import type { NahidaPersonaSnapshot } from '@proj-airi/stage-ui/stores/nahida-persona-shared'
import type { ScreenContextProvider } from '@proj-airi/stage-ui/stores/proactive-companion-shared'

import type {
  CompanionCoordinationRefreshRequest,
  CompanionCoordinationSparkNotifyResult,
} from '../../../../shared/companion-coordination'
import type { ExternalMemoryManager } from '../external-memory'
import type { NahidaPersonaManager } from '../nahida-persona'
import type { ProactiveCompanionManager } from '../proactive-companion'

import { defineInvokeHandler } from '@moeru/eventa'
import {
  composeCompanionCoordinationSnapshot,
  createDefaultCompanionCoordinationSnapshot,
} from '@proj-airi/stage-ui/stores/companion-coordination-shared'

import {
  electronCompanionCoordinationClearHistory,
  electronCompanionCoordinationGetSnapshot,
  electronCompanionCoordinationRefresh,
  electronCompanionCoordinationRefreshForSparkNotify,
} from '../../../../shared/eventa'

type MainContext = ReturnType<typeof createContext>['context']

function updatePersonaSnapshot(request: CompanionCoordinationRefreshRequest | undefined, manager: NahidaPersonaManager): NahidaPersonaSnapshot {
  manager.updateTargetContext(request)
  return manager.getSnapshot()
}

/**
 * Desktop-only phase-six coordination runtime that aggregates the existing
 * memory, persona, and proactive snapshots into one JSON-safe overview.
 *
 * Use when:
 * - Renderer windows should consume one frozen coordination snapshot
 * - Chat and proactive reminder paths need the same shared status vocabulary
 *
 * Expects:
 * - Memory and proactive managers already own their own logic and JSON-safe snapshots
 * - Persona targeting context is supplied by renderer refresh requests and cached inside the persona manager
 *
 * Returns:
 * - One coordination manager with read, refresh, and history-clear entrypoints
 */
export interface CompanionCoordinationManager {
  getSnapshot: (request?: CompanionCoordinationRefreshRequest) => Promise<ReturnType<typeof createDefaultCompanionCoordinationSnapshot>>
  refresh: (request?: CompanionCoordinationRefreshRequest) => Promise<ReturnType<typeof createDefaultCompanionCoordinationSnapshot>>
  clearHistory: (request?: CompanionCoordinationRefreshRequest) => Promise<ReturnType<typeof createDefaultCompanionCoordinationSnapshot>>
  refreshForSparkNotify: (request?: CompanionCoordinationRefreshRequest) => Promise<CompanionCoordinationSparkNotifyResult>
}

export function createCompanionCoordinationManager(params: {
  externalMemoryManager: ExternalMemoryManager
  nahidaPersonaManager: NahidaPersonaManager
  proactiveCompanionManager: ProactiveCompanionManager
  screenContextProvider?: ScreenContextProvider
}): CompanionCoordinationManager {
  let lastSnapshot = createDefaultCompanionCoordinationSnapshot()

  function composeScreenContextBlock(): CompanionCoordinationExplainabilityBlock {
    if (!params.screenContextProvider) {
      return {
        summary: '屏幕上下文提供者不可用。',
        reason: '当前运行时未配置屏幕上下文提供者，因此无法生成屏幕上下文说明。',
      }
    }

    const presence = params.screenContextProvider.getPresence()
    const freshnessMs = params.screenContextProvider.getFreshnessMs()

    if (presence === 'away') {
      return {
        summary: '用户当前不在屏幕前。',
        reason: '屏幕上下文检测到用户 presence 为 away，表明用户可能暂时离开。',
        updatedAt: Date.now(),
      }
    }

    if (freshnessMs !== null && freshnessMs > 5 * 60 * 1000) {
      return {
        summary: '屏幕上下文快照已过时。',
        reason: `最近一次屏幕上下文更新距今已超过 ${Math.floor(freshnessMs / 1000)} 秒，数据可能不再反映当前状态。`,
        updatedAt: Date.now(),
      }
    }

    return {
      summary: '屏幕上下文当前可用。',
      reason: '屏幕上下文提供者运行正常，用户 presence 为 active。',
      updatedAt: Date.now(),
    }
  }

  function composeMemoryJudgementBlock(): CompanionCoordinationExplainabilityBlock {
    const usage = params.externalMemoryManager.getLastMemoryUsage()
    const judgement = usage.judgement

    if (!judgement || judgement.refreshedAt === 0) {
      return {
        summary: '记忆判断尚未初始化。',
        reason: '当前运行时还没有记录过记忆判断快照。',
      }
    }

    return {
      summary: judgement.summary,
      reason: judgement.reason,
      updatedAt: judgement.refreshedAt,
    }
  }

  async function composeSnapshot(request?: CompanionCoordinationRefreshRequest) {
    const memoryUsage = params.externalMemoryManager.getLastMemoryUsage()
    const proactiveRuntime = params.proactiveCompanionManager.getRuntimeSnapshot()
    const persona = updatePersonaSnapshot(request, params.nahidaPersonaManager)
    const snapshot = composeCompanionCoordinationSnapshot({
      memoryUsage,
      persona,
      proactiveRuntime,
      screenContext: composeScreenContextBlock(),
      memoryJudgement: composeMemoryJudgementBlock(),
    })

    lastSnapshot = snapshot
    return {
      snapshot,
      persona,
    }
  }

  async function getSnapshot(request?: CompanionCoordinationRefreshRequest) {
    if (lastSnapshot.updatedAt) {
      return lastSnapshot
    }

    return (await composeSnapshot(request)).snapshot
  }

  async function refresh(request?: CompanionCoordinationRefreshRequest) {
    await params.proactiveCompanionManager.refreshRuntime()
    return (await composeSnapshot(request)).snapshot
  }

  async function clearHistory(request?: CompanionCoordinationRefreshRequest) {
    await params.proactiveCompanionManager.clearHistory()
    return (await composeSnapshot(request)).snapshot
  }

  async function refreshForSparkNotify(request?: CompanionCoordinationRefreshRequest) {
    await params.proactiveCompanionManager.refreshRuntime()
    return await composeSnapshot(request)
  }

  return {
    clearHistory,
    getSnapshot,
    refresh,
    refreshForSparkNotify,
  }
}

export function createCompanionCoordinationService(params: {
  context: MainContext
  manager: CompanionCoordinationManager
}) {
  defineInvokeHandler(params.context, electronCompanionCoordinationGetSnapshot, async (request) => {
    return await params.manager.getSnapshot(request)
  })

  defineInvokeHandler(params.context, electronCompanionCoordinationRefresh, async (request) => {
    return await params.manager.refresh(request)
  })

  defineInvokeHandler(params.context, electronCompanionCoordinationClearHistory, async (request) => {
    return await params.manager.clearHistory(request)
  })

  defineInvokeHandler(params.context, electronCompanionCoordinationRefreshForSparkNotify, async (request) => {
    return await params.manager.refreshForSparkNotify(request)
  })
}
