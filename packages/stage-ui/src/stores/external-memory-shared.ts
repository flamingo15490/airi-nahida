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

export const EXTERNAL_MEMORY_OBSERVATION_SOURCES = [
  'user-turn-profile',
  'user-turn-preferences',
  'user-turn-follow-ups',
  'assistant-turn-summary',
  'manual-session-summary',
  'manual-candidate-review',
  'system-refresh',
] as const

export const EXTERNAL_MEMORY_CANDIDATE_STATUSES = [
  'tentative',
  'stable',
  'conflicted',
  'suppressed',
] as const

export type ExternalMemoryDocumentKind = typeof EXTERNAL_MEMORY_DOCUMENT_KINDS[number]
export type ExternalMemoryLayerKind = typeof EXTERNAL_MEMORY_LAYER_KINDS[number]
export type ExternalMemoryReasonCode = typeof EXTERNAL_MEMORY_REASON_CODES[number]
export type ExternalMemoryObservationSource = typeof EXTERNAL_MEMORY_OBSERVATION_SOURCES[number]
export type ExternalMemoryCandidateKind = ExternalMemoryDocumentKind
export type ExternalMemoryCandidateStatus = typeof EXTERNAL_MEMORY_CANDIDATE_STATUSES[number]
export type ExternalMemoryCapabilityState = 'ready' | 'degraded' | 'disabled' | 'unavailable'
export type ExternalMemoryWriteDecision
  = | 'written'
    | 'skipped-unavailable'
    | 'skipped-empty'
    | 'skipped-duplicate'
    | 'skipped-not-stable'

export const EXTERNAL_MEMORY_LAYER_LABELS = {
  'stable-profile': '稳定用户信息',
  'stable-preferences': '稳定偏好设置',
  'active-follow-ups': '当前待跟进',
  'recent-context': '近期上下文',
  'character-knowledge': '角色知识库',
} satisfies Record<ExternalMemoryLayerKind, string>

const EXTERNAL_MEMORY_REASON_MESSAGES = {
  'bridge-ready': '当前运行时可用记忆桥接，并可提供 JSON-safe 快照。',
  'bridge-degraded': '记忆桥接当前部分可用，但最近一次读取或写回仍需关注。',
  'bridge-disabled': '记忆桥接已被显式禁用，因此 AIRI 不会读取或写回桌面记忆根目录。',
  'bridge-unavailable': '当前运行时尚未提供可用的记忆桥接。',
  'document-loaded': '记忆文档已成功读取，并生成了可用的 JSON-safe 条目。',
  'document-empty': '记忆文档可以访问，但没有生成可用条目。',
  'document-missing': '配置的桌面记忆根目录中缺少该记忆文档。',
  'document-read-failed': '该记忆文档未能读取为 JSON-safe 快照。',
  'layer-selected': '这一记忆层为最近一次记忆快照提供了证据。',
  'layer-empty': '这一记忆层没有为最近一次记忆快照提供证据。',
  'context-loaded': '最近一次记忆快照包含可供渲染进程引用的记忆证据。',
  'context-empty': '最近一次记忆快照完成了构建，但没有产出记忆证据。',
  'write-written': '已评审的记忆候选改动了外部记忆文档。',
  'write-skipped-unavailable': '由于外部记忆根目录不可用，已评审的记忆候选未能写回。',
  'write-skipped-empty': '已评审的记忆候选在规范化后没有可落盘内容。',
  'write-skipped-duplicate': '已评审的记忆候选与现有记忆内容重复，因此无需写回。',
  'write-skipped-not-stable': '已评审的记忆候选因稳定性不足而被拒绝写回。',
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
 * One external-memory observation recorded into the phase-nine candidate ledger.
 */
export interface ExternalMemoryObservationRecord {
  /** Frozen candidate kind that the observation belongs to. */
  kind: ExternalMemoryCandidateKind
  /** Stable observation source used for diagnostics and UI. */
  source: ExternalMemoryObservationSource
  /** Raw observation text before renderer display. */
  text: string
  /** Optional active character name associated with the observation. */
  characterName?: string
  /** Optional caller-provided timestamp for deterministic tests. */
  observedAt?: number
  /** Optional explicit strong-signal hint from upstream extractors. */
  strongSignal?: boolean
  /** Optional explicit actionable hint for follow-up observations. */
  actionable?: boolean
}

/**
 * Frozen conflict explanation for one candidate that cannot be written back safely.
 */
export interface ExternalMemoryConflictSnapshot {
  /** Stable conflict identifier scoped to the current judgement snapshot. */
  id: string
  /** Candidate kind that the conflict belongs to. */
  kind: ExternalMemoryCandidateKind
  /** Candidate identifier blocked by this conflict. */
  candidateId: string
  /** Optional structured key used to detect the conflict. */
  structuredKey?: string
  /** Existing persisted text or competing candidate text. */
  existingText?: string
  /** Incoming candidate text that triggered the conflict. */
  incomingText: string
  /** One-line summary for renderer and diagnostics surfaces. */
  summary: string
  /** User-facing explanation of why the candidate is blocked. */
  reason: string
}

/**
 * Renderer-safe candidate snapshot derived from the userData judgement ledger.
 */
export interface ExternalMemoryCandidateSnapshot {
  /** Stable candidate identifier scoped to the ledger entry. */
  id: string
  /** Candidate kind under review. */
  kind: ExternalMemoryCandidateKind
  /** Latest observation source that updated this candidate. */
  source: ExternalMemoryObservationSource
  /** Frozen candidate lifecycle status. */
  status: ExternalMemoryCandidateStatus
  /** Latest raw candidate text kept for review UI. */
  text: string
  /** Stable comparison text used for ledger dedupe. */
  normalizedText: string
  /** One-line renderer summary for this candidate. */
  summary: string
  /** User-facing reason explaining the current candidate status. */
  reason: string
  /** UNIX timestamp for the first observation kept in the ledger. */
  firstObservedAt: number
  /** UNIX timestamp for the latest observation kept in the ledger. */
  lastObservedAt: number
  /** Number of consistent observations merged into this candidate. */
  observationCount: number
  /** Whether the candidate was explicitly marked as a strong stable signal. */
  strongSignal: boolean
}

/**
 * Controlled write recommendation derived from the judgement snapshot.
 */
export interface ExternalMemoryWriteRecommendation {
  /** Candidate kind that the runtime may write back. */
  kind: ExternalMemoryCandidateKind
  /** Candidate identifiers included in this recommendation batch. */
  candidateIds: string[]
  /** Stable items that are safe to write back. */
  addItems: string[]
  /** One-line recommendation summary for renderer surfaces. */
  summary: string
  /** User-facing explanation of why the recommendation is or is not writable. */
  reason: string
}

/**
 * Renderer-visible phase-nine memory judgement snapshot.
 */
export interface ExternalMemoryJudgementSnapshot {
  /** UNIX timestamp for the latest judgement refresh. */
  refreshedAt: number
  /** Best-effort absolute JSON ledger path under the AIRI userData directory. */
  candidateLedgerPath?: string
  /** One-line aggregate summary for the latest judgement pass. */
  summary: string
  /** User-facing explanation of the latest judgement pass. */
  reason: string
  /** Candidate status counters for renderer overviews. */
  statusCounts: Record<ExternalMemoryCandidateStatus, number>
  /** Frozen candidate snapshots currently tracked by the ledger. */
  candidates: ExternalMemoryCandidateSnapshot[]
  /** Frozen conflicts that block write-back recommendations. */
  conflicts: ExternalMemoryConflictSnapshot[]
  /** Stable write recommendations derived from the current candidates. */
  recommendations: ExternalMemoryWriteRecommendation[]
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
  /** Latest renderer-visible memory judgement snapshot. */
  judgement?: ExternalMemoryJudgementSnapshot
  /** Small write-back history shown in the desktop settings page. */
  recentWrites: ExternalMemoryWriteResult[]
  /** Document kinds that the latest context actually contributed to prompts. */
  lastUsedDocumentKinds: ExternalMemoryDocumentKind[]
}

/**
 * Reports whether the frozen judgement snapshot currently contains conflicts.
 *
 * Use when:
 * - Shared dashboard surfaces need a minimal conflict state
 * - Prompt guardrails must avoid upgrading conflicted candidates into remembered facts
 *
 * Expects:
 * - `judgement` follows the frozen external-memory snapshot contract
 *
 * Returns:
 * - `true` when conflicted candidates or explicit conflicts are present
 */
export function hasConflictedMemoryCandidates(judgement?: ExternalMemoryJudgementSnapshot) {
  return (judgement?.statusCounts.conflicted ?? 0) > 0 || (judgement?.conflicts.length ?? 0) > 0
}

/**
 * Reports whether the latest persisted write looks like a reviewed stable-candidate writeback.
 *
 * Use when:
 * - Coordination surfaces need to show whether stable candidate review recently wrote back
 * - Shared runtime code must avoid guessing from unfrozen candidate internals
 *
 * Expects:
 * - Stable candidate review writes keep the frozen `manual-candidate-review` source label
 *
 * Returns:
 * - `true` when the latest successful reviewed write came from candidate review
 */
export function hasRecentStableCandidateWriteback(usage?: ExternalMemoryUsageSnapshot) {
  return [usage?.lastWrite, ...(usage?.recentWrites ?? [])].some((write) => {
    return write?.decision === 'written'
      && write.review.candidates.some(candidate => candidate.source === 'manual-candidate-review')
  })
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
    summary: '尚未记录任何记忆快照。',
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
    summary: '尚未记录任何写回评审。',
    decision: 'skipped-empty',
    reason: createExternalMemoryReasonSnapshot('write-skipped-empty'),
    candidates: [],
  }
}

/**
 * Creates an empty judgement snapshot before any phase-nine observation is recorded.
 */
export function createDefaultExternalMemoryJudgementSnapshot(): ExternalMemoryJudgementSnapshot {
  return {
    refreshedAt: 0,
    summary: '尚未记录任何记忆判断。',
    reason: '第九阶段候选账本当前为空。',
    statusCounts: {
      tentative: 0,
      stable: 0,
      conflicted: 0,
      suppressed: 0,
    },
    candidates: [],
    conflicts: [],
    recommendations: [],
  }
}

/**
 * Empty usage snapshot used before any desktop bridge is attached.
 */
export function createDefaultExternalMemoryUsageSnapshot(): ExternalMemoryUsageSnapshot {
  return {
    bridgeState: 'unavailable',
    reason: createExternalMemoryReasonSnapshot('bridge-unavailable'),
    summary: '当前运行时尚未提供可用的记忆桥接。',
    turn: createDefaultExternalMemoryTurnSnapshot(),
    lastWriteReview: createDefaultExternalMemoryWriteReviewSnapshot(),
    judgement: createDefaultExternalMemoryJudgementSnapshot(),
    recentWrites: [],
    lastUsedDocumentKinds: [],
  }
}
