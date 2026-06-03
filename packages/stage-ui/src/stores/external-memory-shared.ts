export const EXTERNAL_MEMORY_DOCUMENT_KINDS = [
  'user-profile',
  'preferences',
  'follow-ups',
  'recent-summary',
  'character-knowledge',
] as const

export type ExternalMemoryDocumentKind = typeof EXTERNAL_MEMORY_DOCUMENT_KINDS[number]
export type ExternalMemoryCapabilityState = 'ready' | 'degraded' | 'disabled' | 'unavailable'
export type ExternalMemoryWriteDecision
  = | 'written'
    | 'skipped-unavailable'
    | 'skipped-empty'
    | 'skipped-duplicate'
    | 'skipped-not-stable'

/**
 * Parsed, JSON-safe view of one external memory document.
 */
export interface ExternalMemoryReadSnapshot {
  /** Stable document category inside the external memory root. */
  kind: ExternalMemoryDocumentKind
  /** Best-effort absolute file path used by the desktop runtime. */
  path?: string
  /** Whether this specific document was successfully read and parsed. */
  available: boolean
  /** User-facing one-line summary of the latest read attempt. */
  summary: string
  /** Parsed bullet-like items or short facts extracted from the source file. */
  items: string[]
  /** Optional parsing or filesystem error. */
  error?: string
}

/**
 * Structured memory context built from the external memory root for one chat turn.
 */
export interface ExternalMemoryContextSnapshot {
  /** Overall runtime availability for the memory bridge at read time. */
  state: ExternalMemoryCapabilityState
  /** User-facing summary for the latest context build attempt. */
  summary: string
  /** UNIX timestamp for the latest context refresh. */
  readAt: number
  /** Active card or display-model name used to select character knowledge. */
  characterName?: string
  /** Parsed per-document snapshots used to build the supplement. */
  documents: ExternalMemoryReadSnapshot[]
  /** Document kinds that contributed at least one trusted item to this context. */
  usedKinds: ExternalMemoryDocumentKind[]
  /** Stable sections consumed by the prompt supplement builder. */
  sections: {
    userProfile: string[]
    preferences: string[]
    followUps: string[]
    recentSummary: string[]
    characterKnowledge: string[]
  }
}

/**
 * Controlled write request sent from renderer-safe code to the desktop runtime.
 */
export interface ExternalMemoryWriteRequest {
  /** Optional manual / automatic source label for diagnostics. */
  source?: string
  /** Optional active character name used when updating character-adjacent notes. */
  characterName?: string
  /** Freeform summary block used by `recent-summary` writes. */
  summary?: string
  /** Stable profile facts to merge into `用户信息.md`. */
  facts?: string[]
  /** Preference facts to merge into `偏好设置.md`. */
  preferences?: string[]
  /** Follow-up items to add into `待跟进.md`. */
  items?: string[]
  /** Follow-up items to remove from `待跟进.md`. */
  removeItems?: string[]
}

/**
 * JSON-safe result of one controlled write-back attempt.
 */
export interface ExternalMemoryWriteResult {
  /** Target document kind that the runtime attempted to update. */
  kind: ExternalMemoryDocumentKind
  /** Whether the write completed without throwing. */
  ok: boolean
  /** Whether the target file content changed. */
  changed: boolean
  /** Machine-readable write decision for JSON-safe diagnostics and UI. */
  decision: ExternalMemoryWriteDecision
  /** User-facing summary of what happened. */
  summary: string
  /** UNIX timestamp of the write attempt. */
  writtenAt: number
  /** Optional absolute file path used for the write. */
  path?: string
  /** Added items or facts after normalization. */
  added?: string[]
  /** Removed items after normalization. */
  removed?: string[]
  /** Optional failure detail. */
  error?: string
}

/**
 * Last-known runtime snapshot surfaced to desktop settings and prompt builders.
 */
export interface ExternalMemoryUsageSnapshot {
  /** Overall availability of the desktop memory bridge. */
  bridgeState: ExternalMemoryCapabilityState
  /** User-facing summary of the current bridge state. */
  summary: string
  /** Active card or display-model name used during the last read. */
  characterName?: string
  /** Latest successful or degraded context snapshot. */
  context?: ExternalMemoryContextSnapshot
  /** UNIX timestamp of the most recent read attempt. */
  lastReadAt?: number
  /** Summary of the latest read attempt. */
  lastReadSummary?: string
  /** Optional error from the latest read attempt. */
  lastReadError?: string
  /** Latest write-back result. */
  lastWrite?: ExternalMemoryWriteResult
  /** Small write-back history shown in the desktop settings page. */
  recentWrites: ExternalMemoryWriteResult[]
  /** Document kinds that the latest context actually contributed to prompts. */
  lastUsedDocumentKinds: ExternalMemoryDocumentKind[]
}

/**
 * Empty usage snapshot used before any desktop bridge is attached.
 */
export function createDefaultExternalMemoryUsageSnapshot(): ExternalMemoryUsageSnapshot {
  return {
    bridgeState: 'unavailable',
    summary: 'External memory bridge is not available in this runtime.',
    recentWrites: [],
    lastUsedDocumentKinds: [],
  }
}
