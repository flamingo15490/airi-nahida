import type { ExternalMemoryUsageSnapshot } from './external-memory-shared'
import type { NahidaPersonaSnapshot } from './nahida-persona-shared'
import type { ProactiveCompanionRuntimeSnapshot } from './proactive-companion-shared'

import { createDefaultExternalMemoryUsageSnapshot } from './external-memory-shared'
import {
  createDefaultNahidaPersonaSettings,
} from './nahida-persona-shared'
import { createDefaultProactiveCompanionRuntimeSnapshot } from './proactive-companion-shared'

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
      summary: 'Nahida persona layer is disabled. The active card remains unchanged.',
      activeModeSummary: 'Balanced continuity.',
      sections: [],
    },
    proactiveRuntime: createDefaultProactiveCompanionRuntimeSnapshot(),
  })
}

function joinCoverage(labels: string[]) {
  return labels.length > 0 ? labels.join(', ') : 'None'
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

function composeMemoryWriteActivity(memoryUsage: ExternalMemoryUsageSnapshot) {
  const latestWrite = memoryUsage.lastWrite
  if (!latestWrite) {
    return undefined
  }

  if (!latestWrite.ok) {
    return latestWrite.summary
  }

  if (latestWrite.decision === 'written') {
    return `Latest memory write updated ${latestWrite.kind}.`
  }

  if (latestWrite.decision === 'skipped-duplicate') {
    return `Latest memory write skipped ${latestWrite.kind} because it was already up to date.`
  }

  if (latestWrite.decision === 'skipped-empty') {
    return `Latest memory write skipped ${latestWrite.kind} because there was nothing stable to save.`
  }

  if (latestWrite.decision === 'skipped-not-stable') {
    return `Latest memory write skipped ${latestWrite.kind} because the candidate content was not stable enough to persist.`
  }

  return `Latest memory write could not reach ${latestWrite.kind} because the bridge was unavailable.`
}

function composeMemoryActivity(memoryUsage: ExternalMemoryUsageSnapshot) {
  const usedDocumentKindCount = memoryUsage.lastUsedDocumentKinds.length
  if (memoryUsage.context) {
    if (usedDocumentKindCount === 0) {
      return 'Latest memory context refresh finished without any stable sections.'
    }

    const stableItemCount = countMemorySectionItems(memoryUsage)
    if (stableItemCount === 0) {
      return `${usedDocumentKindCount} document kinds contributed to the latest memory context.`
    }

    return `${usedDocumentKindCount} document kinds contributed ${stableItemCount} stable memory items to the latest context.`
  }

  return composeMemoryWriteActivity(memoryUsage)
    ?? memoryUsage.lastReadSummary
    ?? 'No external memory activity has been recorded yet.'
}

function composeMemoryCoverage(memoryUsage: ExternalMemoryUsageSnapshot) {
  if (memoryUsage.lastUsedDocumentKinds.length > 0) {
    return `Latest memory coverage: ${joinCoverage(memoryUsage.lastUsedDocumentKinds)}.`
  }

  if (memoryUsage.context) {
    return 'Latest memory coverage: no stable sections were included in the latest context.'
  }

  if (memoryUsage.lastWrite) {
    return 'Latest memory coverage: awaiting a context refresh after the latest write.'
  }

  return 'Latest memory coverage: none recorded yet.'
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
  if (!persona.enabled) {
    return `Persona mode: ${persona.mode}. Disabled by user.`
  }

  if (persona.isActive) {
    return `Persona mode: ${persona.mode}. ${persona.activeModeSummary}`
  }

  return `Persona mode: ${persona.mode}. Enabled, waiting for a Nahida target.`
}

function describePersonaCoverage(persona: NahidaPersonaSnapshot) {
  const cardCoverage = persona.activeCardName
    ? `Card: ${persona.activeCardName}.`
    : 'Card: none.'
  const displayModelCoverage = persona.activeDisplayModelName
    ? `Display model: ${persona.activeDisplayModelName}.`
    : 'Display model: none.'

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
    return 'No proactive reminder decisions have been recorded yet.'
  }

  const recentDecisionCount = countRecentDecisions(runtime)
  const latestDecisionActivity = `Latest decision: ${latestDecision.decision}.`

  if (recentDecisionCount > 0) {
    return `${latestDecisionActivity} ${recentDecisionCount} recent decisions are available.`
  }

  return latestDecisionActivity
}

function describeProactiveCoverage(runtime: ProactiveCompanionRuntimeSnapshot) {
  if (runtime.sidecarSummary.trim()) {
    return `Sidecar: ${runtime.sidecarSummary}`
  }

  return runtime.sidecarConnected
    ? 'Sidecar: connected.'
    : 'Sidecar: status unavailable.'
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
        message: 'Phase-six coordination still needs attention before the frozen memory, persona, and proactive surfaces can be treated as aligned.',
      },
      summary: `${attentionCount} coordination surfaces need attention in the current phase.`,
      surfaces,
      readyCount,
      attentionCount,
      inactiveCount,
      updatedAt,
    }
  }

  if (readyCount > 0) {
    return {
      status: 'ready',
      reason: {
        code: 'phase-ready',
        message: 'Phase-six coordination is aligned across the currently active frozen surfaces without expanding any subsystem logic.',
      },
      summary: readyCount === surfaces.length
        ? 'All frozen coordination surfaces are aligned for phase six.'
        : `${readyCount} coordination surfaces are active and aligned in the current phase.`,
      surfaces,
      readyCount,
      attentionCount,
      inactiveCount,
      updatedAt,
    }
  }

  return {
    status: 'inactive',
    reason: {
      code: 'phase-inactive',
      message: 'Phase-six coordination remains intentionally scoped, so inactive surfaces stay out of the overview until their own lane enables them.',
    },
    summary: 'No coordination surfaces are active right now.',
    surfaces,
    readyCount,
    attentionCount,
    inactiveCount,
    updatedAt,
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
          message: 'External memory is connected and contributing stable context to AIRI in the current phase.',
        }
      : {
          code: 'memory-empty',
          message: 'External memory is connected, but the latest context did not contribute any stable memory sections yet.',
        }

    return {
      surface: 'memory',
      title: 'Memory',
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
      message: 'External memory coordination is disabled, so AIRI will not read or write the desktop memory bridge in this phase.',
    } satisfies CompanionCoordinationReason

    return {
      surface: 'memory',
      title: 'Memory',
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
      message: 'External memory is reachable, but the latest read or write still needs attention before coordination is fully reliable.',
    } satisfies CompanionCoordinationReason

    return {
      surface: 'memory',
      title: 'Memory',
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
    message: 'External memory bridge is not available in this runtime yet, so phase-six coordination cannot verify it.',
  } satisfies CompanionCoordinationReason

  return {
    surface: 'memory',
    title: 'Memory',
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
      message: 'Nahida persona is active because the current card or selected display model resolves to Nahida, and this phase keeps it as a read-only expression layer.',
    } satisfies CompanionCoordinationReason

    return {
      surface: 'persona',
      title: 'Persona',
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
      message: 'Nahida persona is disabled by the user, so the base card stays unchanged and this surface remains inactive.',
    } satisfies CompanionCoordinationReason

    return {
      surface: 'persona',
      title: 'Persona',
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
    message: 'Nahida persona is enabled, but neither the current active card nor the selected display model resolves to Nahida, so the layer needs attention.',
  } satisfies CompanionCoordinationReason

  return {
    surface: 'persona',
    title: 'Persona',
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
          message: 'Proactive governance is ready, and a current cooldown is intentionally suppressing repeated reminders.',
        }
      : {
          code: 'proactive-ready',
          message: 'Proactive governance is ready and can evaluate companion-sidecar reminders within the frozen phase-six rules.',
        }

    return {
      surface: 'proactive',
      title: 'Proactive',
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
      message: 'Proactive governance is disabled, so companion-sidecar reminders stay outside AIRI in this phase.',
    } satisfies CompanionCoordinationReason

    return {
      surface: 'proactive',
      title: 'Proactive',
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
      message: 'Proactive governance is partially available, but sidecar readiness or runtime health still needs attention.',
    } satisfies CompanionCoordinationReason

    return {
      surface: 'proactive',
      title: 'Proactive',
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
    message: 'Proactive governance is not available in this runtime yet, so phase-six coordination cannot verify the sidecar reminder lane.',
  } satisfies CompanionCoordinationReason

  return {
    surface: 'proactive',
    title: 'Proactive',
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
