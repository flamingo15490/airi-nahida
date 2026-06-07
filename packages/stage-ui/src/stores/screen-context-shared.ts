/** Accepted screen-context data source modes. */
export type ScreenContextSourceMode = 'vision-only' | 'system-idle-assisted'

/** High-level presence state inferred from system signals. */
export type ScreenPresenceState = 'active' | 'idle' | 'away' | 'unknown'

/**
 * Snapshot of the latest vision-derived peek.
 *
 * JSON-safe: all fields are primitives or optional strings.
 */
export interface ScreenPeekSnapshot {
  /** One-line summary of the latest vision analysis. */
  summary: string
  /** Source mode that produced this peek. */
  source: ScreenContextSourceMode
  /** Seconds since this peek was captured. */
  freshness: number
  /** Confidence score between 0 and 1. */
  confidence: number
  /** Machine-readable reason for the peek result. */
  reason: string
}

/**
 * Snapshot of usage-context signals aggregated from vision and system idle.
 *
 * JSON-safe: all fields are primitives or arrays of strings.
 */
export interface ScreenUsageContextSnapshot {
  /** Short trajectory summary over the recent observation window. */
  trajectorySummary: string
  /** Recently observed applications or website domains. */
  recentAppsOrSites: string[]
  /** Current presence state. */
  presence: ScreenPresenceState
  /** UNIX timestamp of the last update. */
  updatedAt: number
}

/**
 * Full screen-context runtime snapshot consumed by renderer stores.
 *
 * JSON-safe: composed entirely of JSON-safe sub-objects and primitives.
 */
export interface ScreenContextRuntimeSnapshot {
  /** Active source mode. */
  sourceMode: ScreenContextSourceMode
  /** Current presence state. */
  presence: ScreenPresenceState
  /** Latest vision peek, or null if no peek has occurred. */
  latestPeek: ScreenPeekSnapshot | null
  /** Latest usage-context snapshot, or null. */
  latestUsageContext: ScreenUsageContextSnapshot | null
  /** Rolling history of recent runtime snapshots (newest first). */
  recentHistory: ScreenContextRuntimeSnapshotEntry[]
  /** UNIX timestamp of the last full refresh. */
  refreshedAt: number
}

/**
 * One entry in the rolling screen-context history.
 */
export interface ScreenContextRuntimeSnapshotEntry {
  /** UNIX timestamp for this history entry. */
  timestamp: number
  /** Source mode at this point. */
  sourceMode: ScreenContextSourceMode
  /** Presence state at this point. */
  presence: ScreenPresenceState
  /** One-line summary at this point. */
  summary: string
}

/**
 * Persisted screen-context settings for the desktop runtime.
 */
export interface ScreenContextSettings {
  /** Active source mode. */
  sourceMode: ScreenContextSourceMode
  /** Maximum number of entries to keep in rolling history. */
  historyLimit: number
  /** Milliseconds after which a peek or usage snapshot is considered stale. */
  staleThresholdMs: number
}

/** Default screen-context settings used before any persisted config is loaded. */
export const DEFAULT_SCREEN_CONTEXT_SETTINGS: ScreenContextSettings = {
  sourceMode: 'vision-only',
  historyLimit: 30,
  staleThresholdMs: 60_000,
}

/**
 * Creates a default empty runtime snapshot.
 */
export function createDefaultScreenContextRuntimeSnapshot(): ScreenContextRuntimeSnapshot {
  return {
    sourceMode: 'vision-only',
    presence: 'unknown',
    latestPeek: null,
    latestUsageContext: null,
    recentHistory: [],
    refreshedAt: 0,
  }
}

/**
 * Creates default screen-context settings.
 */
export function createDefaultScreenContextSettings(): ScreenContextSettings {
  return { ...DEFAULT_SCREEN_CONTEXT_SETTINGS }
}
