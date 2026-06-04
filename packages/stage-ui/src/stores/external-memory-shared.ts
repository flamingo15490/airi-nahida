export const EXTERNAL_MEMORY_DOCUMENT_KINDS = [
  'user-profile',
  'preferences',
  'follow-ups',
  'recent-summary',
  'character-knowledge',
] as const

export const EXTERNAL_MEMORY_LAYER_KINDS = [
  'stable-profile',
  'stable-preferences',
  'active-follow-ups',
  'recent-context',
  'character-knowledge',
] as const

export const EXTERNAL_MEMORY_REASON_CODES = [
  'bridge-ready',
  'bridge-degraded',
  'bridge-disabled',
  'bridge-unavailable',
  'document-loaded',
  'document-empty',
  'document-missing',
  'document-read-failed',
  'layer-selected',
  'layer-empty',
  'context-loaded',
  'context-empty',
  'write-written',
  'write-skipped-unavailable',
  'write-skipped-empty',
  'write-skipped-duplicate',
  'write-skipped-not-stable',
] as const

export type ExternalMemoryDocumentKind = typeof EXTERNAL_MEMORY_DOCUMENT_KINDS[number]
export type ExternalMemoryLayerKind = typeof EXTERNAL_MEMORY_LAYER_KINDS[number]
export type ExternalMemoryReasonCode = typeof EXTERNAL_MEMORY_REASON_CODES[number]
export type ExternalMemoryCapabilityState = 'ready' | 'degraded' | 'disabled' | 'unavailable'
export type ExternalMemoryWriteDecision
  = | 'written'
    | 'skipped-unavailable'
    | 'skipped-empty'
    | 'skipped-duplicate'
    | 'skipped-not-stable'

export const EXTERNAL_MEMORY_LAYER_LABELS = {
  'stable-profile': 'Stable profile',
  'stable-preferences': 'Stable preferences',
  'active-follow-ups': 'Active follow-ups',
  'recent-context': 'Recent context',
  'character-knowledge': 'Character knowledge',
} satisfies Record<ExternalMemoryLayerKind, string>

const EXTERNAL_MEMORY_REASON_MESSAGES = {
  'bridge-ready': 'External memory bridge is available and can provide JSON-safe snapshots in this runtime.',
  'bridge-degraded': 'External memory bridge is partially available, but the latest read or write still needs attention.',
  'bridge-disabled': 'External memory bridge is intentionally disabled, so AIRI will not read or write the desktop memory root.',
  'bridge-unavailable': 'External memory bridge is not available in this runtime yet.',
  'document-loaded': 'The external memory document was loaded and produced usable JSON-safe items.',
  'document-empty': 'The external memory document was reachable, but it did not produce any usable items.',
  'document-missing': 'The external memory document is missing from the configured desktop memory root.',
  'document-read-failed': 'The external memory document could not be read into a JSON-safe snapshot.',
  'layer-selected': 'This memory layer contributed evidence to the latest turn snapshot.',
  'layer-empty': 'This memory layer did not contribute evidence to the latest turn snapshot.',
  'context-loaded': 'The latest turn snapshot contains memory evidence that can be cited by renderer consumers.',
  'context-empty': 'The latest turn snapshot completed without any memory evidence.',
  'write-written': 'The reviewed memory candidate changed the external memory document.',
  'write-skipped-unavailable': 'The reviewed memory candidate could not be written because the external memory root was unavailable.',
  'write-skipped-empty': 'The reviewed memory candidate did not contain any persisted content after normalization.',
  'write-skipped-duplicate': 'The reviewed memory candidate matched existing memory content, so no write was needed.',
  'write-skipped-not-stable': 'The reviewed memory candidate was rejected because it was not stable enough to persist.',
} satisfies Record<ExternalMemoryReasonCode, string>

/**
 * Stable reason payload shared by runtime, IPC, renderer stores, and tests.
 */
export interface ExternalMemoryReasonSnapshot {
  /** Machine-readable reason code for assertions and filtering. */
  code: ExternalMemoryReasonCode
  /** Frozen user-facing copy for the reason code. */
  message: string
}

/**
 * JSON-safe evidence item produced from one external memory document.
 */
export interface ExternalMemoryEvidenceSnapshot {
  /** Stable evidence identifier scoped to the turn snapshot. */
  id: string
  /** Frozen memory layer that owns this evidence item. */
  layer: ExternalMemoryLayerKind
  /** Source document kind used to collect this evidence item. */
  kind: ExternalMemoryDocumentKind
  /** Layer priority where `0` is the highest-priority layer. */
  priority: number
  /** Best-effort absolute source path used by the desktop runtime. */
  path?: string
  /** One-line source label shown by renderer consumers. */
  title: string
  /** Zero-based item index inside the normalized document snapshot. */
  itemIndex: number
  /** JSON-safe evidence text surfaced to renderer consumers. */
  text: string
  /** Whether the latest selection kept this evidence item active. */
  selected: boolean
}

/**
 * JSON-safe citation entry exposed to renderer-only consumers.
 */
export interface ExternalMemoryCitationSnapshot {
  /** Stable citation identifier scoped to the turn snapshot. */
  id: string
  /** Source evidence identifier used by this citation. */
  evidenceId: string
  /** Frozen memory layer that owns this citation. */
  layer: ExternalMemoryLayerKind
  /** Source document kind used to collect this citation. */
  kind: ExternalMemoryDocumentKind
  /** Layer priority where `0` is the highest-priority layer. */
  priority: number
  /** Best-effort absolute source path used by the desktop runtime. */
  path?: string
  /** One-line source label shown by renderer consumers. */
  title: string
  /** Exact JSON-safe excerpt kept for future explanation UI. */
  excerpt: string
}

/**
 * Stable selection decision for one frozen memory layer.
 */
export interface ExternalMemorySelectionDecision {
  /** Frozen memory layer key. */
  layer: ExternalMemoryLayerKind
  /** Source document kind mapped to this layer. */
  kind: ExternalMemoryDocumentKind
  /** Layer priority where `0` is the highest-priority layer. */
  priority: number
  /** Whether this layer contributed to the latest turn snapshot. */
  selected: boolean
  /** Frozen reason payload for the selection outcome. */
  reason: ExternalMemoryReasonSnapshot
  /** Number of evidence items emitted for this layer. */
  evidenceCount: number
  /** Citation identifiers emitted for this layer. */
  citationIds: string[]
}

/**
 * Renderer-safe turn snapshot frozen for the memory page and reference UI.
 */
export interface ExternalMemoryTurnSnapshot {
  /** UNIX timestamp for the latest memory turn snapshot. */
  readAt: number
  /** Active character or display-model name used during selection. */
  characterName?: string
  /** Frozen layer ordering from highest to lowest priority. */
  layerOrder: ExternalMemoryLayerKind[]
  /** Layers that contributed at least one citation in this turn. */
  usedLayers: ExternalMemoryLayerKind[]
  /** One-line summary of the latest turn snapshot. */
  summary: string
  /** Per-layer selection decisions in frozen priority order. */
  selections: ExternalMemorySelectionDecision[]
  /** Flattened evidence entries available to renderer consumers. */
  evidence: ExternalMemoryEvidenceSnapshot[]
  /** Flattened citation entries available to renderer consumers. */
  citations: ExternalMemoryCitationSnapshot[]
}

/**
 * Normalized write candidate reviewed by the desktop runtime.
 */
export interface ExternalMemoryWriteCandidate {
  /** Frozen memory layer targeted by the candidate. */
  layer: ExternalMemoryLayerKind
  /** Source document kind targeted by the candidate. */
  kind: ExternalMemoryDocumentKind
  /** Optional source label supplied by the caller. */
  source?: string
  /** One-line summary of the reviewed candidate batch. */
  summary: string
  /** Candidate additions after JSON-safe normalization. */
  addItems: string[]
  /** Candidate removals after JSON-safe normalization. */
  removeItems: string[]
}

/**
 * Read-only write-review snapshot exposed to renderer consumers.
 */
export interface ExternalMemoryWriteReviewSnapshot {
  /** UNIX timestamp for the latest write review. */
  reviewedAt: number
  /** One-line summary of the review outcome. */
  summary: string
  /** Final write decision for the reviewed candidate batch. */
  decision: ExternalMemoryWriteDecision
  /** Frozen reason payload for the review outcome. */
  reason: ExternalMemoryReasonSnapshot
  /** Reviewed candidates in submission order. */
  candidates: ExternalMemoryWriteCandidate[]
}

/**
 * Parsed, JSON-safe view of one external memory document.
 */
export interface ExternalMemoryReadSnapshot {
  /** Stable document category inside the external memory root. */
  kind: ExternalMemoryDocumentKind
  /** Frozen memory layer mapped from the document kind. */
  layer: ExternalMemoryLayerKind
  /** Layer priority where `0` is the highest-priority layer. */
  priority: number
  /** Frozen reason payload for the latest read attempt. */
  reason: ExternalMemoryReasonSnapshot
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
  /** Frozen reason payload for the latest context build. */
  reason: ExternalMemoryReasonSnapshot
  /** User-facing summary for the latest context build attempt. */
  summary: string
  /** UNIX timestamp for the latest context refresh. */
  readAt: number
  /** Active card or display-model name used to select character knowledge. */
  characterName?: string
  /** Frozen layer ordering from highest to lowest priority. */
  layerOrder: ExternalMemoryLayerKind[]
  /** Parsed per-document snapshots used to build the supplement. */
  documents: ExternalMemoryReadSnapshot[]
  /** Document kinds that contributed at least one trusted item to this context. */
  usedKinds: ExternalMemoryDocumentKind[]
  /** Memory layers that contributed at least one trusted item to this context. */
  usedLayers: ExternalMemoryLayerKind[]
  /** Stable turn snapshot consumed by renderer-only surfaces. */
  turn: ExternalMemoryTurnSnapshot
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
  /** Stable profile facts to merge into the user-profile document. */
  facts?: string[]
  /** Preference facts to merge into the preferences document. */
  preferences?: string[]
  /** Follow-up items to add into the follow-ups document. */
  items?: string[]
  /** Follow-up items to remove from the follow-ups document. */
  removeItems?: string[]
}

/**
 * JSON-safe result of one controlled write-back attempt.
 */
export interface ExternalMemoryWriteResult {
  /** Target document kind that the runtime attempted to update. */
  kind: ExternalMemoryDocumentKind
  /** Frozen memory layer mapped from the document kind. */
  layer: ExternalMemoryLayerKind
  /** Whether the write completed without throwing. */
  ok: boolean
  /** Whether the target file content changed. */
  changed: boolean
  /** Machine-readable write decision for JSON-safe diagnostics and UI. */
  decision: ExternalMemoryWriteDecision
  /** Frozen reason payload for the write outcome. */
  reason: ExternalMemoryReasonSnapshot
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
  /** Renderer-safe review snapshot for the latest candidate batch. */
  review: ExternalMemoryWriteReviewSnapshot
}

/**
 * Last-known runtime snapshot surfaced to desktop settings and prompt builders.
 */
export interface ExternalMemoryUsageSnapshot {
  /** Overall availability of the desktop memory bridge. */
  bridgeState: ExternalMemoryCapabilityState
  /** Frozen reason payload for the current bridge state. */
  reason: ExternalMemoryReasonSnapshot
  /** User-facing summary of the current bridge state. */
  summary: string
  /** Active card or display-model name used during the last read. */
  characterName?: string
  /** Latest successful or degraded context snapshot. */
  context?: ExternalMemoryContextSnapshot
  /** Latest turn snapshot mirrored for renderer consumers. */
  turn?: ExternalMemoryTurnSnapshot
  /** UNIX timestamp of the most recent read attempt. */
  lastReadAt?: number
  /** Summary of the latest read attempt. */
  lastReadSummary?: string
  /** Optional error from the latest read attempt. */
  lastReadError?: string
  /** Latest write-back result. */
  lastWrite?: ExternalMemoryWriteResult
  /** Latest renderer-safe write review snapshot. */
  lastWriteReview?: ExternalMemoryWriteReviewSnapshot
  /** Small write-back history shown in the desktop settings page. */
  recentWrites: ExternalMemoryWriteResult[]
  /** Document kinds that the latest context actually contributed to prompts. */
  lastUsedDocumentKinds: ExternalMemoryDocumentKind[]
}

/**
 * Maps one document kind to the frozen memory-layer contract.
 */
export function mapDocumentKindToExternalMemoryLayer(kind: ExternalMemoryDocumentKind): ExternalMemoryLayerKind {
  switch (kind) {
    case 'user-profile':
      return 'stable-profile'
    case 'preferences':
      return 'stable-preferences'
    case 'follow-ups':
      return 'active-follow-ups'
    case 'recent-summary':
      return 'recent-context'
    case 'character-knowledge':
      return 'character-knowledge'
  }
}

/**
 * Returns the frozen priority for one external memory layer.
 */
export function getExternalMemoryLayerPriority(layer: ExternalMemoryLayerKind) {
  return EXTERNAL_MEMORY_LAYER_KINDS.indexOf(layer)
}

/**
 * Creates the frozen reason payload shared by runtime, renderer, and tests.
 */
export function createExternalMemoryReasonSnapshot(code: ExternalMemoryReasonCode): ExternalMemoryReasonSnapshot {
  return {
    code,
    message: EXTERNAL_MEMORY_REASON_MESSAGES[code],
  }
}

/**
 * Creates an empty turn snapshot before any read succeeds.
 */
export function createDefaultExternalMemoryTurnSnapshot(): ExternalMemoryTurnSnapshot {
  return {
    readAt: 0,
    layerOrder: [...EXTERNAL_MEMORY_LAYER_KINDS],
    usedLayers: [],
    summary: 'No external memory turn snapshot has been recorded yet.',
    selections: [],
    evidence: [],
    citations: [],
  }
}

/**
 * Creates an empty write-review snapshot before any write is attempted.
 */
export function createDefaultExternalMemoryWriteReviewSnapshot(): ExternalMemoryWriteReviewSnapshot {
  return {
    reviewedAt: 0,
    summary: 'No external memory write review has been recorded yet.',
    decision: 'skipped-empty',
    reason: createExternalMemoryReasonSnapshot('write-skipped-empty'),
    candidates: [],
  }
}

/**
 * Empty usage snapshot used before any desktop bridge is attached.
 */
export function createDefaultExternalMemoryUsageSnapshot(): ExternalMemoryUsageSnapshot {
  return {
    bridgeState: 'unavailable',
    reason: createExternalMemoryReasonSnapshot('bridge-unavailable'),
    summary: 'External memory bridge is not available in this runtime.',
    turn: createDefaultExternalMemoryTurnSnapshot(),
    lastWriteReview: createDefaultExternalMemoryWriteReviewSnapshot(),
    recentWrites: [],
    lastUsedDocumentKinds: [],
  }
}
