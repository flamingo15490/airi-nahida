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

export const PROACTIVE_COMPANION_SOURCE_MODES = [
  'embedded',
  'external-sidecar',
] as const

export const PROACTIVE_COMPANION_SIGNAL_SOURCES = [
  'idle',
  'memory-follow-up',
  'vision',
  'urgent-keyword',
  'manual',
  'external-sidecar',
  'legacy-context',
] as const

export const PROACTIVE_COMPANION_SIMULATION_KINDS = [
  'idle-check-in',
  'memory-follow-up',
  'vision-reminder',
  'urgent-reminder',
  'manual-check-in',
] as const

export type ProactiveCompanionEventKind = typeof PROACTIVE_COMPANION_EVENT_KINDS[number]
export type ProactiveCompanionDecision = typeof PROACTIVE_COMPANION_DECISIONS[number]
export type ProactiveCompanionRuntimeState = 'ready' | 'degraded' | 'disabled' | 'unavailable'
export type ProactiveCompanionIntensity = 'low' | 'balanced'
export type ProactiveCompanionPresentation = 'light-prompt' | 'prominent-reminder' | 'silent'
export type ProactiveCompanionSourceMode = typeof PROACTIVE_COMPANION_SOURCE_MODES[number]
export type ProactiveCompanionSignalSource = typeof PROACTIVE_COMPANION_SIGNAL_SOURCES[number]
export type ProactiveCompanionSimulationKind = typeof PROACTIVE_COMPANION_SIMULATION_KINDS[number]

/**
 * Persisted desktop-only settings that govern proactive signals and reminder delivery.
 */
export interface ProactiveCompanionSettings {
  /** Whether AIRI should actively deliver approved proactive reminders. */
  enabled: boolean
  /** Cooldown applied after any delivered reminder. */
  globalCooldownMs: number
  /** Existing sidecar-era per-topic dedupe cooldown kept for compatibility. */
  topicCooldownMs: number
  /** Basic reminder intensity exposed to the settings page. */
  intensity: ProactiveCompanionIntensity
  /** Selects whether proactive signals come from the embedded engine or the external sidecar. */
  sourceMode: ProactiveCompanionSourceMode
  /** Whether the embedded rule engine is allowed to produce candidates when selected. */
  engineEnabled: boolean
  /** Minimum user idle threshold required for the embedded idle check-in lane. */
  idleThresholdMs: number
  /** Smallest interval used by the embedded idle probe loop. */
  idleCheckMinMs: number
  /** Largest interval used by the embedded idle probe loop. */
  idleCheckMaxMs: number
  /** Cooldown applied after urgent embedded reminders. */
  urgentCooldownMs: number
  /** Cooldown applied after memory follow-up reminders. */
  memoryCooldownMs: number
  /** Cooldown applied after vision-driven reminders. */
  visionCooldownMs: number
  /** Cooldown applied to the same embedded topic key. */
  sameTopicCooldownMs: number
  /** Hard cap for delivered proactive reminders within a rolling hour. */
  maxProactivePerHour: number
  /** Whether urgent reminders may interrupt recent user activity. */
  allowInterruptOnUrgent: boolean
  /** Whether memory and vision reminders may use the lighter working-nudge path. */
  workingNudgeEnabled: boolean
  /** Minimum pause before a working nudge may bypass the full idle threshold. */
  workingNudgeMinPauseMs: number
  /** Cooldown applied after any working nudge delivery. */
  workingNudgeCooldownMs: number
  /** Whether the embedded engine accepts vision observations. */
  visionEnabled: boolean
  /** Whether the embedded engine accepts memory follow-up candidates. */
  memoryEnabled: boolean
  /** Lowercased keywords that upgrade a signal to urgent. */
  urgentKeywords: string[]
}

/**
 * JSON-safe snapshot of one incoming proactive event after light normalization.
 */
export interface ProactiveCompanionEventSnapshot {
  /** Stable event id supplied by the source, or a derived fallback. */
  id: string
  /** Optional upstream event id when the source separates envelope and content ids. */
  eventId?: string
  /** Raw source label observed by AIRI. */
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
  /** Whether the event matched the configured source identity. */
  matchedSource: boolean
  /** Whether the sidecar itself was healthy enough for delivery checks. */
  sidecarReady: boolean
  /** Optional next eligible time for cooldown-related outcomes. */
  cooldownUntil?: number
  /** UNIX timestamp of the final decision. */
  decidedAt: number
}

/**
 * Summary of one explicit legacy-sidecar config import into embedded settings.
 */
export interface ProactiveCompanionLegacyImportSummary {
  /** Stable field names that were mapped into the embedded settings shape. */
  mappedFields: string[]
  /** Legacy fields that were intentionally ignored. */
  unmappedFields: string[]
  /** Source mode after the import completed. */
  sourceMode: ProactiveCompanionSourceMode
  /** Whether the import switched the runtime into embedded mode. */
  switchedToEmbedded: boolean
  /** Imported settings after normalization. */
  settings: ProactiveCompanionSettings
  /** UNIX timestamp when the import completed. */
  importedAt: number
}

/**
 * JSON-safe manual or simulated signal request used by the lightweight console.
 */
export interface ProactiveCompanionSimulationRequest {
  /** Which built-in embedded signal scenario to run. */
  kind: ProactiveCompanionSimulationKind
  /** Optional replacement headline used for tests or console actions. */
  headline?: string
  /** Optional replacement note used for tests or console actions. */
  note?: string
  /** Optional summary text used by urgent and vision simulations. */
  summary?: string
  /** Optional explicit topic key override for deterministic tests. */
  topicKey?: string
}

/**
 * JSON-safe observation payload passed from renderer vision flows into the embedded engine.
 */
export interface ProactiveCompanionVisionObservation {
  /** Natural-language vision summary generated by the renderer. */
  summary: string
  /** Optional workload id for diagnostics. */
  workloadId?: string
  /** Optional capture source id for diagnostics. */
  sourceId?: string
  /** Optional capture timestamp. */
  capturedAt?: number
}

/**
 * JSON-safe result returned by manual console actions and simulations.
 */
export interface ProactiveCompanionActionResult {
  /** Whether the action completed without throwing. */
  ok: boolean
  /** User-facing summary of what happened. */
  message: string
  /** Latest governance decision when the action evaluated a signal. */
  decision?: ProactiveCompanionDecisionSnapshot
  /** Latest runtime snapshot after the action completed. */
  runtime: ProactiveCompanionRuntimeSnapshot
}

/**
 * Runtime event emitted from Electron main when embedded governance records a new decision.
 */
export interface ProactiveCompanionRuntimeEvent {
  /** Latest decision recorded by the embedded runtime. */
  decision: ProactiveCompanionDecisionSnapshot
  /** Latest runtime snapshot after the decision completed. */
  runtime: ProactiveCompanionRuntimeSnapshot
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
  /** Whether the embedded engine is currently active enough to produce signals. */
  engineActive: boolean
  /** Optional pause-until timestamp when proactive delivery is temporarily paused. */
  pauseUntil?: number
  /** Most recent embedded or external signal source seen by the runtime. */
  lastSignalSource?: ProactiveCompanionSignalSource
  /** Short headline from the latest signal. */
  lastSignalHeadline?: string
  /** UNIX timestamp when the latest signal was evaluated. */
  lastSignalAt?: number
  /** UNIX timestamp of the most recent manual trigger. */
  lastManualTriggerAt?: number
  /** Optional latest degradation reason for quick coordination and health inspection. */
  lastDegradedReason?: string
  /** Recent decision history, newest first. */
  recentDecisions: ProactiveCompanionDecisionSnapshot[]
  /** Most recent decision, when available. */
  lastDecision?: ProactiveCompanionDecisionSnapshot
  /** Optional latest failure or suppression reason for quick inspection. */
  lastFailureReason?: string
  /** UNIX timestamp of the most recent runtime refresh or decision. */
  refreshedAt: number
}

/**
 * Result returned when the desktop runtime evaluates one incoming reminder.
 */
export interface ProactiveCompanionEvaluateResult {
  /** Whether AIRI treated the event as a managed proactive reminder. */
  managed: boolean
  /** Latest governance decision when the event was managed. */
  decision?: ProactiveCompanionDecisionSnapshot
  /** Runtime snapshot after the evaluation completed. */
  runtime: ProactiveCompanionRuntimeSnapshot
}

function normalizeDuration(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : fallback
}

function normalizeBoolean(value: boolean | undefined, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeKeywords(value: string[] | undefined, fallback: string[]) {
  const normalized = (value ?? fallback)
    .map(keyword => keyword?.trim().toLowerCase())
    .filter((keyword): keyword is string => Boolean(keyword))

  return normalized.length > 0
    ? [...new Set(normalized)]
    : [...fallback]
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
 * - Low-frequency settings suitable for the sidecar-compatible transition path
 */
export function createDefaultProactiveCompanionSettings(): ProactiveCompanionSettings {
  return {
    enabled: true,
    globalCooldownMs: 3 * 60 * 1000,
    topicCooldownMs: 10 * 60 * 1000,
    intensity: 'low',
    sourceMode: 'external-sidecar',
    engineEnabled: true,
    idleThresholdMs: 90 * 1000,
    idleCheckMinMs: 60 * 1000,
    idleCheckMaxMs: 120 * 1000,
    urgentCooldownMs: 90 * 1000,
    memoryCooldownMs: 3 * 60 * 1000,
    visionCooldownMs: 3 * 60 * 1000,
    sameTopicCooldownMs: 30 * 60 * 1000,
    maxProactivePerHour: 5,
    allowInterruptOnUrgent: true,
    workingNudgeEnabled: true,
    workingNudgeMinPauseMs: 8 * 1000,
    workingNudgeCooldownMs: 5 * 60 * 1000,
    visionEnabled: true,
    memoryEnabled: true,
    urgentKeywords: [
      'error',
      'failed',
      'failure',
      'not found',
      'timeout',
      'exception',
      'traceback',
      'stuck',
      'report error',
      '卡住',
      '报错',
      '错误',
      '失败',
      '超时',
      '没反应',
    ],
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
    summary: '主动陪伴当前运行时暂不可用。',
    sidecarConnected: false,
    sidecarSummary: 'Sidecar 状态暂不可用。',
    engineActive: false,
    recentDecisions: [],
    refreshedAt: Date.now(),
  }
}

/**
 * Normalizes persisted proactive settings into one conservative desktop-safe shape.
 *
 * Before:
 * - `{ globalCooldownMs: 0, sameTopicCooldownMs: 60_000, sourceMode: 'embedded' }`
 *
 * After:
 * - `{ globalCooldownMs: 180_000, sameTopicCooldownMs: 1_800_000, sourceMode: 'embedded', ... }`
 */
export function normalizeProactiveCompanionSharedSettings(
  settings?: Partial<ProactiveCompanionSettings>,
): ProactiveCompanionSettings {
  const defaults = createDefaultProactiveCompanionSettings()
  const merged = {
    ...defaults,
    ...settings,
  }
  const globalCooldownMs = normalizeDuration(merged.globalCooldownMs, defaults.globalCooldownMs)
  const topicCooldownMs = Math.max(
    normalizeDuration(merged.topicCooldownMs, defaults.topicCooldownMs),
    globalCooldownMs,
  )
  const idleThresholdMs = normalizeDuration(merged.idleThresholdMs, defaults.idleThresholdMs)
  const idleCheckMinMs = normalizeDuration(merged.idleCheckMinMs, defaults.idleCheckMinMs)
  const idleCheckMaxMs = Math.max(
    normalizeDuration(merged.idleCheckMaxMs, defaults.idleCheckMaxMs),
    idleCheckMinMs,
  )

  return {
    ...merged,
    globalCooldownMs,
    topicCooldownMs,
    intensity: merged.intensity === 'balanced' ? 'balanced' : 'low',
    sourceMode: merged.sourceMode === 'embedded' ? 'embedded' : 'external-sidecar',
    engineEnabled: normalizeBoolean(merged.engineEnabled, defaults.engineEnabled),
    idleThresholdMs,
    idleCheckMinMs,
    idleCheckMaxMs,
    urgentCooldownMs: normalizeDuration(merged.urgentCooldownMs, defaults.urgentCooldownMs),
    memoryCooldownMs: normalizeDuration(merged.memoryCooldownMs, defaults.memoryCooldownMs),
    visionCooldownMs: normalizeDuration(merged.visionCooldownMs, defaults.visionCooldownMs),
    sameTopicCooldownMs: Math.max(
      normalizeDuration(merged.sameTopicCooldownMs, defaults.sameTopicCooldownMs),
      globalCooldownMs,
    ),
    maxProactivePerHour: Math.max(1, Math.round(merged.maxProactivePerHour || defaults.maxProactivePerHour)),
    allowInterruptOnUrgent: normalizeBoolean(merged.allowInterruptOnUrgent, defaults.allowInterruptOnUrgent),
    workingNudgeEnabled: normalizeBoolean(merged.workingNudgeEnabled, defaults.workingNudgeEnabled),
    workingNudgeMinPauseMs: normalizeDuration(merged.workingNudgeMinPauseMs, defaults.workingNudgeMinPauseMs),
    workingNudgeCooldownMs: normalizeDuration(merged.workingNudgeCooldownMs, defaults.workingNudgeCooldownMs),
    visionEnabled: normalizeBoolean(merged.visionEnabled, defaults.visionEnabled),
    memoryEnabled: normalizeBoolean(merged.memoryEnabled, defaults.memoryEnabled),
    urgentKeywords: normalizeKeywords(merged.urgentKeywords, defaults.urgentKeywords),
  }
}
