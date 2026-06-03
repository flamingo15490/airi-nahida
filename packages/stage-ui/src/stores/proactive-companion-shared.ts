export const PROACTIVE_COMPANION_EVENT_KINDS = [
  'gentle-check-in',
  'reminder',
  'important',
  'unknown',
] as const

export const PROACTIVE_COMPANION_DECISIONS = [
  'delivered',
  'suppressed',
  'deferred',
  'dropped',
] as const

export type ProactiveCompanionEventKind = typeof PROACTIVE_COMPANION_EVENT_KINDS[number]
export type ProactiveCompanionDecision = typeof PROACTIVE_COMPANION_DECISIONS[number]
export type ProactiveCompanionRuntimeState = 'ready' | 'degraded' | 'disabled' | 'unavailable'
export type ProactiveCompanionIntensity = 'low' | 'balanced'
export type ProactiveCompanionPresentation = 'light-prompt' | 'prominent-reminder' | 'silent'

/**
 * Persisted desktop-only settings that govern incoming proactive sidecar events.
 */
export interface ProactiveCompanionSettings {
  /** Whether AIRI should actively deliver approved sidecar reminders. */
  enabled: boolean
  /** Cooldown applied after any delivered reminder. */
  globalCooldownMs: number
  /** Per-topic dedupe cooldown used for similar repeated reminders. */
  topicCooldownMs: number
  /** Basic reminder intensity exposed to the settings page. */
  intensity: ProactiveCompanionIntensity
}

/**
 * JSON-safe snapshot of one incoming proactive event after light normalization.
 */
export interface ProactiveCompanionEventSnapshot {
  /** Stable event id supplied by the source, or a derived fallback. */
  id: string
  /** Optional upstream event id when the source separates envelope and content ids. */
  eventId?: string
  /** Raw websocket source label observed by AIRI. */
  source: string
  /** Normalized proactive category used by the governance policy. */
  kind: ProactiveCompanionEventKind
  /** Raw upstream kind kept for debugging and UI inspection. */
  rawKind?: string
  /** Short headline shown to the user or model. */
  headline: string
  /** Optional short note carried by the reminder. */
  note?: string
  /** Optional urgency label from the upstream event. */
  urgency?: string
  /** Best-effort dedupe key used by the governance policy. */
  topicKey: string
  /** Original destinations declared by the source event. */
  destinations: string[]
  /** UNIX timestamp when AIRI normalized the event. */
  receivedAt: number
}

/**
 * Result of one proactive governance decision.
 */
export interface ProactiveCompanionDecisionSnapshot {
  /** Event that was evaluated by the proactive governance layer. */
  event: ProactiveCompanionEventSnapshot
  /** Final decision applied to the event. */
  decision: ProactiveCompanionDecision
  /** User-facing summary of why the decision happened. */
  reason: string
  /** Chosen presentation mode when the event was delivered. */
  presentation: ProactiveCompanionPresentation
  /** Whether the event matched the configured sidecar identity. */
  matchedSource: boolean
  /** Whether the sidecar itself was healthy enough for delivery checks. */
  sidecarReady: boolean
  /** Optional next eligible time for cooldown-related outcomes. */
  cooldownUntil?: number
  /** UNIX timestamp of the final decision. */
  decidedAt: number
}

/**
 * Runtime snapshot shown to renderer settings and shared stores.
 */
export interface ProactiveCompanionRuntimeSnapshot {
  /** Latest persisted proactive settings. */
  settings: ProactiveCompanionSettings
  /** Overall readiness of the governance layer. */
  state: ProactiveCompanionRuntimeState
  /** User-facing summary of the current runtime state. */
  summary: string
  /** Whether the configured sidecar currently appears connected and healthy. */
  sidecarConnected: boolean
  /** Compact status summary inherited from the sidecar integration layer. */
  sidecarSummary: string
  /** Recent decision history, newest first. */
  recentDecisions: ProactiveCompanionDecisionSnapshot[]
  /** Most recent decision, when available. */
  lastDecision?: ProactiveCompanionDecisionSnapshot
  /** Optional latest degradation or drop reason for quick inspection. */
  lastFailureReason?: string
  /** UNIX timestamp of the most recent runtime refresh or decision. */
  refreshedAt: number
}

/**
 * Result returned when the desktop runtime evaluates one incoming reminder.
 */
export interface ProactiveCompanionEvaluateResult {
  /** Whether AIRI treated the event as a managed companion-sidecar reminder. */
  managed: boolean
  /** Latest governance decision when the event was managed. */
  decision?: ProactiveCompanionDecisionSnapshot
  /** Runtime snapshot after the evaluation completed. */
  runtime: ProactiveCompanionRuntimeSnapshot
}

/**
 * Creates conservative default settings for proactive governance.
 *
 * Use when:
 * - The desktop runtime needs a first-boot policy
 * - Tests need one stable baseline without renderer-local storage
 *
 * Expects:
 * - Callers to persist edits through the desktop bridge instead of mutating ad hoc copies
 *
 * Returns:
 * - Low-frequency settings suitable for the default sidecar integration
 */
export function createDefaultProactiveCompanionSettings(): ProactiveCompanionSettings {
  return {
    enabled: true,
    globalCooldownMs: 3 * 60 * 1000,
    topicCooldownMs: 10 * 60 * 1000,
    intensity: 'low',
  }
}

/**
 * Creates an empty runtime snapshot before any desktop bridge is attached.
 *
 * Use when:
 * - Shared UI code runs outside the Electron desktop runtime
 * - The settings page or orchestrator needs a JSON-safe fallback snapshot
 *
 * Expects:
 * - Callers to replace it with a desktop-backed snapshot when available
 *
 * Returns:
 * - One unavailable runtime snapshot with default settings
 */
export function createDefaultProactiveCompanionRuntimeSnapshot(): ProactiveCompanionRuntimeSnapshot {
  return {
    settings: createDefaultProactiveCompanionSettings(),
    state: 'unavailable',
    summary: 'Proactive companion governance is not available in this runtime.',
    sidecarConnected: false,
    sidecarSummary: 'Companion sidecar status is unavailable.',
    recentDecisions: [],
    refreshedAt: Date.now(),
  }
}
