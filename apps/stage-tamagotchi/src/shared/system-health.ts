/**
 * Frozen system-health contract for Phase 7 ops-health unification.
 *
 * Defines the shared types, factory functions, and derivation logic used by
 * subsystem health probes, startup diagnostics, and the renderer dashboard.
 *
 * @module system-health
 */

/** Known subsystem identifiers tracked by the health probe system. */
export type SubsystemHealthKind
  = | 'memory'
    | 'persona'
    | 'proactive'
    | 'coordination'
    | 'integrations'
    | 'vision'

/** Possible health states for a subsystem or the aggregated system. */
export type SubsystemHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown'

/**
 * Result of a single subsystem health probe.
 *
 * - `kind` identifies which subsystem produced the probe
 * - `status` reflects the subsystem's current condition
 * - `summary` provides a human-readable one-liner
 * - `detail` optionally expands on the summary for diagnostics views
 * - `actionHint` optionally suggests a remediation step for the user
 * - `checkedAt` is the epoch-ms timestamp when the probe was evaluated
 */
export interface SubsystemHealthProbe {
  /** Which subsystem produced this probe. */
  kind: SubsystemHealthKind
  /** Current health state of the subsystem. */
  status: SubsystemHealthStatus
  /** Human-readable one-line summary of the subsystem state. */
  summary: string
  /** Optional detailed explanation for diagnostics views. */
  detail?: string
  /** Optional suggested remediation step for the user. */
  actionHint?: string
  /** Epoch-ms timestamp when the probe was evaluated. */
  checkedAt: number
}

/**
 * Aggregated system health snapshot combining all subsystem probes.
 *
 * - `overall` is derived from the worst individual subsystem status
 * - `subsystems` contains one probe per tracked subsystem
 * - `startupPhase` is true while the app is still running initial diagnostics
 * - `checkedAt` is the epoch-ms timestamp of the snapshot
 */
export interface SystemHealthSnapshot {
  /** Aggregated health status derived from the worst subsystem. */
  overall: SubsystemHealthStatus
  /** Individual subsystem probes that compose this snapshot. */
  subsystems: SubsystemHealthProbe[]
  /** Whether the application is still in its startup diagnostics phase. */
  startupPhase: boolean
  /** Epoch-ms timestamp when this snapshot was assembled. */
  checkedAt: number
}

/**
 * A single warning or failure item produced during startup diagnostics.
 *
 * - `kind` identifies the subsystem that generated the item
 * - `message` is a human-readable description of the issue
 */
export interface StartupDiagnosticsItem {
  /** Subsystem that generated this diagnostics item. */
  kind: SubsystemHealthKind
  /** Human-readable description of the issue. */
  message: string
}

/**
 * Result of a startup diagnostics run.
 *
 * - `passed` is true only when `failures` is empty
 * - `warnings` lists non-fatal issues encountered during startup
 * - `failures` lists fatal issues that prevent healthy operation
 * - `duration` is the wall-clock time in milliseconds for the full run
 */
export interface StartupDiagnosticsResult {
  /** True when no failures were recorded. */
  passed: boolean
  /** Non-fatal issues encountered during startup. */
  warnings: StartupDiagnosticsItem[]
  /** Fatal issues that prevent healthy operation. */
  failures: StartupDiagnosticsItem[]
  /** Wall-clock duration of the diagnostics run in milliseconds. */
  duration: number
}

/**
 * Severity ordering used by {@link deriveOverallHealth} to select the worst
 * status among subsystem probes. Higher index = worse status.
 */
const HEALTH_SEVERITY_ORDER: readonly SubsystemHealthStatus[] = [
  'healthy',
  'unknown',
  'degraded',
  'unhealthy',
]

const severityRank: Record<SubsystemHealthStatus, number> = {
  healthy: 0,
  unknown: 1,
  degraded: 2,
  unhealthy: 3,
}

/**
 * Derives the overall system health from an array of subsystem probes.
 *
 * Use when:
 * - Assembling a {@link SystemHealthSnapshot} from freshly evaluated probes
 * - Re-checking the aggregate after a single subsystem updates
 *
 * Expects:
 * - Each probe has a valid `status` field
 *
 * Returns:
 * - The worst (most severe) status across all probes
 * - 'unknown' when the input array is empty
 *
 * @example
 * ```ts
 * const overall = deriveOverallHealth([
 *   { kind: 'memory', status: 'healthy', summary: 'OK', checkedAt: Date.now() },
 *   { kind: 'vision', status: 'degraded', summary: 'Slow', checkedAt: Date.now() },
 * ])
 * // overall === 'degraded'
 * ```
 */
export function deriveOverallHealth(subsystems: SubsystemHealthProbe[]): SubsystemHealthStatus {
  if (subsystems.length === 0)
    return 'unknown'

  let worst = 0
  for (const probe of subsystems) {
    const rank = severityRank[probe.status]
    if (rank > worst)
      worst = rank
  }
  return HEALTH_SEVERITY_ORDER[worst]
}

/**
 * Creates a default {@link SystemHealthSnapshot} with all subsystems unknown
 * and `startupPhase` set to true.
 *
 * Use when:
 * - Initializing store state before the first real probe completes
 * - Resetting health state during a full re-evaluation cycle
 *
 * Returns:
 * - A snapshot with `overall: 'unknown'`, empty `subsystems`, and current timestamp
 *
 * @example
 * ```ts
 * const snapshot = createDefaultSystemHealthSnapshot()
 * // snapshot.overall === 'unknown'
 * // snapshot.startupPhase === true
 * ```
 */
export function createDefaultSystemHealthSnapshot(): SystemHealthSnapshot {
  const now = Date.now()
  return {
    overall: 'unknown',
    subsystems: [],
    startupPhase: true,
    checkedAt: now,
  }
}

/**
 * Creates a default {@link StartupDiagnosticsResult} representing a passing
 * run with no warnings or failures and zero duration.
 *
 * Use when:
 * - Initializing diagnostics state before a real run executes
 * - Providing a safe fallback when diagnostics cannot be performed
 *
 * Returns:
 * - A result with `passed: true`, empty warnings/failures, `duration: 0`
 *
 * @example
 * ```ts
 * const result = createDefaultStartupDiagnosticsResult()
 * // result.passed === true
 * // result.duration === 0
 * ```
 */
export function createDefaultStartupDiagnosticsResult(): StartupDiagnosticsResult {
  return {
    passed: true,
    warnings: [],
    failures: [],
    duration: 0,
  }
}
