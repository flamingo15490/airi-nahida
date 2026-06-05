import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { NahidaPersonaSnapshot } from '@proj-airi/stage-ui/stores/nahida-persona-shared'

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
}): CompanionCoordinationManager {
  let lastSnapshot = createDefaultCompanionCoordinationSnapshot()

  async function composeSnapshot(request?: CompanionCoordinationRefreshRequest) {
    const memoryUsage = params.externalMemoryManager.getLastMemoryUsage()
    const proactiveRuntime = params.proactiveCompanionManager.getRuntimeSnapshot()
    const persona = updatePersonaSnapshot(request, params.nahidaPersonaManager)
    const snapshot = composeCompanionCoordinationSnapshot({
      memoryUsage,
      persona,
      proactiveRuntime,
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
