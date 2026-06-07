import type { ExternalMemoryDocumentKind, ExternalMemoryUsageSnapshot } from '@proj-airi/stage-ui/stores/external-memory-shared'
import type { NahidaPersonaSnapshot } from '@proj-airi/stage-ui/stores/nahida-persona-shared'
import type { ProactiveCompanionRuntimeSnapshot } from '@proj-airi/stage-ui/stores/proactive-companion-shared'

import { createDefaultExternalMemoryUsageSnapshot } from '@proj-airi/stage-ui/stores/external-memory-shared'
import {
  createDefaultNahidaPersonaSettings,
} from '@proj-airi/stage-ui/stores/nahida-persona-shared'
import { createDefaultProactiveCompanionRuntimeSnapshot } from '@proj-airi/stage-ui/stores/proactive-companion-shared'

import { hasConflictedMemoryCandidates, hasRecentStableCandidateWriteback } from './external-memory'

export const COMPANION_COORDINATION_SURFACES = [
  'memory',
  'persona',
  'proactive',
] as const

export const COMPANION_COORDINATION_STATUSES = [
  'ready',
  'attention',
  'inactive',
] as const

export const COMPANION_COORDINATION_REASON_CODES = [
  'phase-ready',
  'phase-attention',
  'phase-inactive',
  'memory-ready',
  'memory-empty',
  'memory-degraded',
  'memory-disabled',
  'memory-unavailable',
  'persona-active',
  'persona-disabled',
  'persona-target-mismatch',
  'proactive-ready',
  'proactive-cooldown-active',
  'proactive-degraded',
  'proactive-disabled',
  'proactive-unavailable',
] as const

export type CompanionCoordinationSurface = typeof COMPANION_COORDINATION_SURFACES[number]
export type CompanionCoordinationStatus = typeof COMPANION_COORDINATION_STATUSES[number]
export type CompanionCoordinationReasonCode = typeof COMPANION_COORDINATION_REASON_CODES[number]

/**
 * Stable reason payload used by the phase-six coordination layer.
 */
export interface CompanionCoordinationReason {
  /** Machine-readable reason code for downstream filtering and tests. */
  code: CompanionCoordinationReasonCode
  /** Frozen user-facing copy shown in the coordination overview. */
  message: string
}

/**
 * Unified dashboard fields frozen for every coordination surface in phase six.
 */
export interface CompanionCoordinationOverviewFields {
  /** One-line operational summary for this surface. */
  summary: string
  /** Frozen reason copy explaining the current status. */
  reason: string
  /** Current activity or mode shown in the overview card. */
  activity: string
  /** Current scope or coverage shown in the overview card. */
  coverage: string
  /** Optional latest refresh timestamp for this surface. */
  updatedAt?: number
}

/**
 * Read-only snapshot for one coordination surface in the phase-six overview.
 */
export interface CompanionCoordinationSurfaceSnapshot {
  /** Stable surface key owned by one subtask lane. */
  surface: CompanionCoordinationSurface
  /** Short title shown in the overview card. */
  title: string
  /** Unified dashboard status derived from the surface runtime. */
  status: CompanionCoordinationStatus
  /** Structured reason payload for the current surface status. */
  reason: CompanionCoordinationReason
  /** Frozen overview fields consumed by the dashboard page. */
  overview: CompanionCoordinationOverviewFields
}

/**
 * Explainability block for one coordination subsystem that surfaces a
 * short human-readable summary and reason for the current state.
 *
 * Used to give the coordination dashboard and prompt supplements visibility
 * into why screen-context or memory-judgement are in their current state.
 */
export interface CompanionCoordinationExplainabilityBlock {
  /** One-line summary of the subsystem's current state. */
  summary: string
  /** User-facing reason explaining why the subsystem reached this state. */
  reason: string
  /** UNIX timestamp of the latest snapshot refresh, when available. */
  updatedAt?: number
}

/**
 * Aggregated phase-six snapshot used by the coordination dashboard.
 */
export interface CompanionCoordinationSnapshot {
  /** Overall dashboard status derived from the three frozen coordination surfaces. */
  status: CompanionCoordinationStatus
  /** Frozen phase-level reason payload for the current snapshot. */
  reason: CompanionCoordinationReason
  /** One-line summary shown at the top of the overview. */
  summary: string
  /** Ordered per-surface snapshots for memory, persona, and proactive. */
  surfaces: CompanionCoordinationSurfaceSnapshot[]
  /** Count of surfaces currently ready. */
  readyCount: number
  /** Count of surfaces that need attention. */
  attentionCount: number
  /** Count of surfaces intentionally inactive. */
  inactiveCount: number
  /** Latest timestamp observed across all surfaces when available. */
  updatedAt?: number
  /** Explainability block for the screen-context subsystem, when available. */
  screenContext?: CompanionCoordinationExplainabilityBlock
  /** Explainability block for the memory-judgement subsystem, when available. */
  memoryJudgement?: CompanionCoordinationExplainabilityBlock
}

/**
 * Creates the conservative coordination snapshot used before a desktop runtime
 * bridge has refreshed the frozen phase-six surfaces.
 *
 * Use when:
 * - Shared UI code needs a JSON-safe fallback snapshot
 * - Tests need one deterministic baseline before any desktop refresh occurs
 *
 * Expects:
 * - Callers to replace this fallback with a refreshed desktop snapshot when available
 *
 * Returns:
 * - One aggregate snapshot composed from the existing default subsystem states
 */
export function createDefaultCompanionCoordinationSnapshot() {
  return composeCompanionCoordinationSnapshot({
    memoryUsage: createDefaultExternalMemoryUsageSnapshot(),
    persona: {
      ...createDefaultNahidaPersonaSettings(),
      matchesActiveCard: false,
      isActive: false,
      summary: '纳西妲人格层未启用，当前角色卡保持不变。',
      activeModeSummary: '平衡地延续当前语境。',
      sections: [],
    },
    proactiveRuntime: createDefaultProactiveCompanionRuntimeSnapshot(),
  })
}

const externalMemoryDocumentKindLabels = {
  'user-profile': '用户信息',
  'preferences': '偏好设置',
  'follow-ups': '待跟进',
  'recent-summary': '近期摘要',
  'character-knowledge': '角色知识库',
} satisfies Record<ExternalMemoryDocumentKind, string>

function joinCoverage(labels: string[]) {
  return labels.length > 0 ? labels.join('、') : '无'
}

function formatMemoryDocumentKind(kind: ExternalMemoryDocumentKind) {
  return externalMemoryDocumentKindLabels[kind]
}

function describePersonaMode(mode: NahidaPersonaSnapshot['mode']) {
  switch (mode) {
    case 'reserved':
      return '克制'
    case 'balanced':
      return '平衡'
    case 'active':
      return '主动'
    default:
      return mode
  }
}

function describeDecision(decision: string) {
  switch (decision) {
    case 'delivered':
      return '已放行'
    case 'suppressed':
      return '已压制'
    case 'deferred':
      return '已延后'
    case 'dropped':
      return '已丢弃'
    default:
      return decision
  }
}

function pickLatestTimestamp(candidates: Array<number | undefined>) {
  return candidates.reduce<number | undefined>((latest, candidate) => {
    if (!candidate) {
      return latest
    }

    if (!latest || candidate > latest) {
      return candidate
    }

    return latest
  }, undefined)
}

function countMemorySectionItems(memoryUsage: ExternalMemoryUsageSnapshot) {
  if (!memoryUsage.context) {
    return 0
  }

  return Object.values(memoryUsage.context.sections).reduce((count, sectionItems) => {
    return count + sectionItems.length
  }, 0)
}

function appendMemoryStatusNotes(baseText: string, params: {
  hasConflicts: boolean
  hasRecentStableWriteback: boolean
}) {
  const notes: string[] = []

  if (params.hasConflicts) {
    notes.push('当前仍有 conflicted candidate 待处理。')
  }

  if (params.hasRecentStableWriteback) {
    notes.push('最近已有 stable candidate 写回。')
  }

  if (notes.length === 0) {
    return baseText
  }

  return `${baseText} ${notes.join(' ')}`
}

function composeMemoryWriteActivity(memoryUsage: ExternalMemoryUsageSnapshot) {
  const latestWrite = memoryUsage.lastWrite
  if (!latestWrite) {
    return undefined
  }

  if (!latestWrite.ok) {
    return latestWrite.summary
  }

  const kindLabel = formatMemoryDocumentKind(latestWrite.kind)
  if (latestWrite.decision === 'written') {
    return `最近写回已更新${kindLabel}。`
  }

  if (latestWrite.decision === 'skipped-duplicate') {
    return `最近写回未更新${kindLabel}，因为内容已经是最新。`
  }

  if (latestWrite.decision === 'skipped-empty') {
    return `最近写回未更新${kindLabel}，因为没有可稳定保存的内容。`
  }

  if (latestWrite.decision === 'skipped-not-stable') {
    return `最近写回未更新${kindLabel}，因为候选内容还不够稳定。`
  }

  return `最近写回未能更新${kindLabel}，因为桥接当前不可用。`
}

function composeMemoryActivity(memoryUsage: ExternalMemoryUsageSnapshot) {
  const usedDocumentKindCount = memoryUsage.lastUsedDocumentKinds.length
  const hasConflicts = hasConflictedMemoryCandidates(memoryUsage.judgement)
  const hasRecentStableWriteback = hasRecentStableCandidateWriteback(memoryUsage)
  if (memoryUsage.context) {
    if (usedDocumentKindCount === 0) {
      return appendMemoryStatusNotes('最近一次记忆上下文刷新完成，但没有纳入稳定内容。', {
        hasConflicts,
        hasRecentStableWriteback,
      })
    }

    const stableItemCount = countMemorySectionItems(memoryUsage)
    if (stableItemCount === 0) {
      return appendMemoryStatusNotes(`最近一次记忆上下文引用了 ${usedDocumentKindCount} 类文档。`, {
        hasConflicts,
        hasRecentStableWriteback,
      })
    }

    return appendMemoryStatusNotes(`最近一次记忆上下文引用了 ${usedDocumentKindCount} 类文档，共纳入 ${stableItemCount} 条稳定记忆。`, {
      hasConflicts,
      hasRecentStableWriteback,
    })
  }

  const baseActivity = composeMemoryWriteActivity(memoryUsage)
    ?? memoryUsage.lastReadSummary
    ?? '还没有记录到记忆活动。'
  return appendMemoryStatusNotes(baseActivity, {
    hasConflicts,
    hasRecentStableWriteback,
  })
}

function composeMemoryCoverage(memoryUsage: ExternalMemoryUsageSnapshot) {
  const hasConflicts = hasConflictedMemoryCandidates(memoryUsage.judgement)
  const hasRecentStableWriteback = hasRecentStableCandidateWriteback(memoryUsage)
  if (memoryUsage.lastUsedDocumentKinds.length > 0) {
    return appendMemoryStatusNotes(`最近覆盖：${joinCoverage(memoryUsage.lastUsedDocumentKinds.map(formatMemoryDocumentKind))}。`, {
      hasConflicts,
      hasRecentStableWriteback,
    })
  }

  if (memoryUsage.context) {
    return appendMemoryStatusNotes('最近覆盖：最近一次上下文里没有纳入稳定分层。', {
      hasConflicts,
      hasRecentStableWriteback,
    })
  }

  if (memoryUsage.lastWrite) {
    return appendMemoryStatusNotes('最近覆盖：等待最近一次写回后的上下文刷新。', {
      hasConflicts,
      hasRecentStableWriteback,
    })
  }

  return appendMemoryStatusNotes('最近覆盖：暂无记录。', {
    hasConflicts,
    hasRecentStableWriteback,
  })
}

function getMemoryUpdatedAt(memoryUsage: ExternalMemoryUsageSnapshot) {
  return pickLatestTimestamp([
    memoryUsage.lastReadAt,
    memoryUsage.context?.readAt,
    memoryUsage.lastWrite?.writtenAt,
    ...memoryUsage.recentWrites.map(write => write.writtenAt),
  ])
}

function describePersonaActivity(persona: NahidaPersonaSnapshot) {
  const modeLabel = describePersonaMode(persona.mode)
  if (!persona.enabled) {
    return `人格模式：${modeLabel}。已由用户关闭。`
  }

  if (persona.isActive) {
    return `人格模式：${modeLabel}。${persona.activeModeSummary}`
  }

  return `人格模式：${modeLabel}。已启用，正在等待命中纳西妲目标。`
}

function describePersonaCoverage(persona: NahidaPersonaSnapshot) {
  const cardCoverage = persona.activeCardName
    ? `角色卡：${persona.activeCardName}。`
    : '角色卡：无。'
  const displayModelCoverage = persona.activeDisplayModelName
    ? `展示模型：${persona.activeDisplayModelName}。`
    : '展示模型：无。'

  return `${cardCoverage} ${displayModelCoverage}`
}

function countRecentDecisions(runtime: ProactiveCompanionRuntimeSnapshot) {
  return runtime.recentDecisions.length
}

function findLatestDecision(runtime: ProactiveCompanionRuntimeSnapshot) {
  return runtime.lastDecision ?? runtime.recentDecisions[0]
}

function findActiveCooldown(runtime: ProactiveCompanionRuntimeSnapshot) {
  const latestDecision = runtime.lastDecision
  if (latestDecision && typeof latestDecision.cooldownUntil === 'number' && latestDecision.cooldownUntil > Date.now()) {
    return latestDecision
  }

  return runtime.recentDecisions.find((decision) => {
    return typeof decision.cooldownUntil === 'number'
      && decision.cooldownUntil > Date.now()
  })
}

function describeProactiveActivity(runtime: ProactiveCompanionRuntimeSnapshot) {
  const latestDecision = findLatestDecision(runtime)
  if (!latestDecision) {
    return '还没有记录到主动陪伴判定。'
  }

  const recentDecisionCount = countRecentDecisions(runtime)
  const latestDecisionActivity = `最近判定：${describeDecision(latestDecision.decision)}。`

  if (recentDecisionCount > 0) {
    return `${latestDecisionActivity}当前可查看 ${recentDecisionCount} 条最近判定。`
  }

  return latestDecisionActivity
}

function describeProactiveCoverage(runtime: ProactiveCompanionRuntimeSnapshot) {
  if (runtime.sidecarSummary.trim()) {
    return `sidecar：${runtime.sidecarSummary}`
  }

  return runtime.sidecarConnected
    ? 'sidecar：已连接。'
    : 'sidecar：状态暂不可用。'
}

/**
 * Composes the frozen phase-six coordination snapshot from the existing memory,
 * persona, and proactive runtime snapshots without rewriting their logic.
 *
 * Use when:
 * - The dashboard needs one stable read-only overview contract
 * - Subtasks need a shared status and reason vocabulary for their surfaces
 *
 * Expects:
 * - Inputs to come from the existing shared stores without mutating them here
 * - Callers to keep memory, persona, and proactive logic inside their own modules
 *
 * Returns:
 * - One aggregate snapshot with ordered surface entries and unified overview fields
 */
export function composeCompanionCoordinationSnapshot(params: {
  memoryUsage: ExternalMemoryUsageSnapshot
  persona: NahidaPersonaSnapshot
  proactiveRuntime: ProactiveCompanionRuntimeSnapshot
  /** Optional explainability block for the screen-context subsystem. */
  screenContext?: CompanionCoordinationExplainabilityBlock
  /** Optional explainability block for the memory-judgement subsystem. */
  memoryJudgement?: CompanionCoordinationExplainabilityBlock
}): CompanionCoordinationSnapshot {
  const memory = composeMemorySurface(params.memoryUsage)
  const persona = composePersonaSurface(params.persona)
  const proactive = composeProactiveSurface(params.proactiveRuntime)
  const surfaces = [memory, persona, proactive]
  const readyCount = surfaces.filter(surface => surface.status === 'ready').length
  const attentionCount = surfaces.filter(surface => surface.status === 'attention').length
  const inactiveCount = surfaces.filter(surface => surface.status === 'inactive').length
  const updatedAt = surfaces.reduce<number | undefined>((latest, surface) => {
    const candidate = surface.overview.updatedAt
    if (!candidate) {
      return latest
    }

    if (!latest || candidate > latest) {
      return candidate
    }

    return latest
  }, undefined)

  if (attentionCount > 0) {
    return {
      status: 'attention',
      reason: {
        code: 'phase-attention',
        message: '当前协同仍需关注，记忆、人格与主动陪伴这三条线还没有完全对齐。',
      },
      summary: `当前有 ${attentionCount} 个协同面仍需关注。`,
      surfaces,
      readyCount,
      attentionCount,
      inactiveCount,
      updatedAt,
      screenContext: params.screenContext,
      memoryJudgement: params.memoryJudgement,
    }
  }

  if (readyCount > 0) {
    return {
      status: 'ready',
      reason: {
        code: 'phase-ready',
        message: '当前已启用的协同面已经完成对齐。',
      },
      summary: readyCount === surfaces.length
        ? '当前所有协同面都已对齐。'
        : `当前有 ${readyCount} 个协同面已启用并完成对齐。`,
      surfaces,
      readyCount,
      attentionCount,
      inactiveCount,
      updatedAt,
      screenContext: params.screenContext,
      memoryJudgement: params.memoryJudgement,
    }
  }

  return {
    status: 'inactive',
    reason: {
      code: 'phase-inactive',
      message: '当前协同仍按既定范围运行，未启用的协同面会保持未启用状态。',
    },
    summary: '当前还没有启用中的协同面。',
    surfaces,
    readyCount,
    attentionCount,
    inactiveCount,
    updatedAt,
    screenContext: params.screenContext,
    memoryJudgement: params.memoryJudgement,
  }
}

function composeMemorySurface(memoryUsage: ExternalMemoryUsageSnapshot): CompanionCoordinationSurfaceSnapshot {
  const activity = composeMemoryActivity(memoryUsage)
  const coverage = composeMemoryCoverage(memoryUsage)
  const updatedAt = getMemoryUpdatedAt(memoryUsage)

  if (memoryUsage.bridgeState === 'ready') {
    const hasCoverage = memoryUsage.lastUsedDocumentKinds.length > 0
    const reason: CompanionCoordinationReason = hasCoverage
      ? {
          code: 'memory-ready',
          message: '记忆桥接已连接，当前能为 AIRI 提供稳定上下文。',
        }
      : {
          code: 'memory-empty',
          message: '记忆桥接已连接，但最近一次上下文还没有纳入稳定记忆分层。',
        }

    return {
      surface: 'memory',
      title: '记忆',
      status: 'ready',
      reason,
      overview: {
        summary: memoryUsage.summary,
        reason: reason.message,
        activity,
        coverage,
        updatedAt,
      },
    }
  }

  if (memoryUsage.bridgeState === 'disabled') {
    const reason = {
      code: 'memory-disabled',
      message: '记忆协同已关闭，当前不会读写桌面端记忆桥接。',
    } satisfies CompanionCoordinationReason

    return {
      surface: 'memory',
      title: '记忆',
      status: 'inactive',
      reason,
      overview: {
        summary: memoryUsage.summary,
        reason: reason.message,
        activity,
        coverage,
        updatedAt,
      },
    }
  }

  if (memoryUsage.bridgeState === 'degraded') {
    const reason = {
      code: 'memory-degraded',
      message: '记忆桥接可以访问，但最近一次读写结果仍需关注。',
    } satisfies CompanionCoordinationReason

    return {
      surface: 'memory',
      title: '记忆',
      status: 'attention',
      reason,
      overview: {
        summary: memoryUsage.summary,
        reason: reason.message,
        activity,
        coverage,
        updatedAt,
      },
    }
  }

  const reason = {
    code: 'memory-unavailable',
    message: '记忆桥接当前运行时暂不可用，因此暂时无法纳入协同确认。',
  } satisfies CompanionCoordinationReason

  return {
    surface: 'memory',
    title: '记忆',
    status: 'attention',
    reason,
    overview: {
      summary: memoryUsage.summary,
      reason: reason.message,
      activity,
      coverage,
      updatedAt,
    },
  }
}

function composePersonaSurface(persona: NahidaPersonaSnapshot): CompanionCoordinationSurfaceSnapshot {
  const activity = describePersonaActivity(persona)
  const coverage = describePersonaCoverage(persona)

  if (persona.isActive) {
    const reason = {
      code: 'persona-active',
      message: '当前角色卡或展示模型已命中纳西妲，因此人格层正在生效。',
    } satisfies CompanionCoordinationReason

    return {
      surface: 'persona',
      title: '人格',
      status: 'ready',
      reason,
      overview: {
        summary: persona.summary,
        reason: reason.message,
        activity,
        coverage,
      },
    }
  }

  if (!persona.enabled) {
    const reason = {
      code: 'persona-disabled',
      message: '纳西妲人格已由用户关闭，因此当前人格面保持未启用。',
    } satisfies CompanionCoordinationReason

    return {
      surface: 'persona',
      title: '人格',
      status: 'inactive',
      reason,
      overview: {
        summary: persona.summary,
        reason: reason.message,
        activity,
        coverage,
      },
    }
  }

  const reason = {
    code: 'persona-target-mismatch',
    message: '纳西妲人格已启用，但当前角色卡和展示模型都没有命中纳西妲，因此仍需关注。',
  } satisfies CompanionCoordinationReason

  return {
    surface: 'persona',
    title: '人格',
    status: 'attention',
    reason,
    overview: {
      summary: persona.summary,
      reason: reason.message,
      activity,
      coverage,
    },
  }
}

function composeProactiveSurface(runtime: ProactiveCompanionRuntimeSnapshot): CompanionCoordinationSurfaceSnapshot {
  const latestCooldownDecision = findActiveCooldown(runtime)
  const activity = describeProactiveActivity(runtime)
  const coverage = describeProactiveCoverage(runtime)

  if (runtime.state === 'ready') {
    const reason: CompanionCoordinationReason = latestCooldownDecision
      ? {
          code: 'proactive-cooldown-active',
          message: '主动陪伴当前可用，但正在冷却中，因此会暂时压制重复提醒。',
        }
      : {
          code: 'proactive-ready',
          message: '主动陪伴当前可用，能够按既定规则判断 sidecar 提醒。',
        }

    return {
      surface: 'proactive',
      title: '主动陪伴',
      status: 'ready',
      reason,
      overview: {
        summary: runtime.summary,
        reason: reason.message,
        activity,
        coverage,
        updatedAt: runtime.refreshedAt,
      },
    }
  }

  if (runtime.state === 'disabled') {
    const reason = {
      code: 'proactive-disabled',
      message: '主动陪伴已关闭，因此 sidecar 提醒当前不会进入 AIRI。',
    } satisfies CompanionCoordinationReason

    return {
      surface: 'proactive',
      title: '主动陪伴',
      status: 'inactive',
      reason,
      overview: {
        summary: runtime.summary,
        reason: reason.message,
        activity,
        coverage,
        updatedAt: runtime.refreshedAt,
      },
    }
  }

  if (runtime.state === 'degraded') {
    const reason = {
      code: 'proactive-degraded',
      message: '主动陪伴部分可用，但 sidecar 就绪状态或运行健康度仍需关注。',
    } satisfies CompanionCoordinationReason

    return {
      surface: 'proactive',
      title: '主动陪伴',
      status: 'attention',
      reason,
      overview: {
        summary: runtime.summary,
        reason: reason.message,
        activity,
        coverage,
        updatedAt: runtime.refreshedAt,
      },
    }
  }

  const reason = {
    code: 'proactive-unavailable',
    message: '主动陪伴当前运行时暂不可用，因此暂时无法纳入协同确认。',
  } satisfies CompanionCoordinationReason

  return {
    surface: 'proactive',
    title: '主动陪伴',
    status: 'attention',
    reason,
    overview: {
      summary: runtime.summary,
      reason: reason.message,
      activity,
      coverage,
      updatedAt: runtime.refreshedAt,
    },
  }
}
