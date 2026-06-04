import type {
  ExternalMemoryCapabilityState as BaseExternalMemoryCapabilityState,
  ExternalMemoryCitationSnapshot as BaseExternalMemoryCitationSnapshot,
  ExternalMemoryContextSnapshot as BaseExternalMemoryContextSnapshot,
  ExternalMemoryDocumentKind as BaseExternalMemoryDocumentKind,
  ExternalMemoryEvidenceSnapshot as BaseExternalMemoryEvidenceSnapshot,
  ExternalMemoryLayerKind as BaseExternalMemoryLayerKind,
  ExternalMemoryReadSnapshot as BaseExternalMemoryReadSnapshot,
  ExternalMemoryReasonCode as BaseExternalMemoryReasonCode,
  ExternalMemoryReasonSnapshot as BaseExternalMemoryReasonSnapshot,
  ExternalMemorySelectionDecision as BaseExternalMemorySelectionDecision,
  ExternalMemoryTurnSnapshot as BaseExternalMemoryTurnSnapshot,
  ExternalMemoryUsageSnapshot as BaseExternalMemoryUsageSnapshot,
  ExternalMemoryWriteCandidate as BaseExternalMemoryWriteCandidate,
  ExternalMemoryWriteDecision as BaseExternalMemoryWriteDecision,
  ExternalMemoryWriteResult as BaseExternalMemoryWriteResult,
  ExternalMemoryWriteReviewSnapshot as BaseExternalMemoryWriteReviewSnapshot,
} from '@proj-airi/stage-ui/stores/external-memory-shared'

import {
  createDefaultExternalMemoryTurnSnapshot as createBaseDefaultExternalMemoryTurnSnapshot,
  createDefaultExternalMemoryUsageSnapshot as createBaseDefaultExternalMemoryUsageSnapshot,
  createDefaultExternalMemoryWriteReviewSnapshot as createBaseDefaultExternalMemoryWriteReviewSnapshot,
  createExternalMemoryReasonSnapshot as createBaseExternalMemoryReasonSnapshot,
  EXTERNAL_MEMORY_LAYER_KINDS,
  EXTERNAL_MEMORY_LAYER_LABELS,
  getExternalMemoryLayerPriority,
  mapDocumentKindToExternalMemoryLayer,
} from '@proj-airi/stage-ui/stores/external-memory-shared'

export type ExternalMemoryCapabilityState = BaseExternalMemoryCapabilityState
export type ExternalMemoryDocumentKind = BaseExternalMemoryDocumentKind
export type ExternalMemoryLayerKind = BaseExternalMemoryLayerKind
export type ExternalMemoryReasonCode = BaseExternalMemoryReasonCode
export type ExternalMemoryWriteDecision = BaseExternalMemoryWriteDecision

export {
  EXTERNAL_MEMORY_LAYER_KINDS,
  EXTERNAL_MEMORY_LAYER_LABELS,
  getExternalMemoryLayerPriority,
  mapDocumentKindToExternalMemoryLayer,
}

export interface ExternalMemoryReasonSnapshot extends BaseExternalMemoryReasonSnapshot {
  detail?: string
}

export interface ExternalMemoryEvidenceSnapshot extends BaseExternalMemoryEvidenceSnapshot {
  normalizedText?: string
  reason?: ExternalMemoryReasonSnapshot
  suppressedByEvidenceId?: string
  decisionType?:
    | 'selected'
    | 'suppressed-duplicate'
    | 'suppressed-lower-priority'
    | 'suppressed-character-mismatch'
    | 'suppressed-not-actionable'
    | 'suppressed-empty'
    | 'suppressed-weak-signal'
}

export interface ExternalMemoryCitationSnapshot extends BaseExternalMemoryCitationSnapshot {}

export interface ExternalMemorySelectionDecision extends BaseExternalMemorySelectionDecision {
  selectedEvidenceCount?: number
  suppressedEvidenceCount?: number
}

export interface ExternalMemoryTurnSnapshot extends BaseExternalMemoryTurnSnapshot {
  selections: ExternalMemorySelectionDecision[]
  evidence: ExternalMemoryEvidenceSnapshot[]
  citations: ExternalMemoryCitationSnapshot[]
}

export interface ExternalMemoryWriteCandidateDecision {
  id: string
  action: 'add' | 'remove'
  text: string
  normalizedText?: string
  selected: boolean
  reason: ExternalMemoryReasonSnapshot
  occurrenceCount?: number
  matchedExistingText?: string
  decisionType?:
    | 'selected'
    | 'suppressed-empty'
    | 'suppressed-duplicate'
    | 'suppressed-not-actionable'
    | 'suppressed-not-stable'
    | 'suppressed-needs-repeat'
    | 'suppressed-no-new-content'
    | 'suppressed-conflict'
    | 'removal-selected'
    | 'removal-suppressed-missing'
}

export interface ExternalMemoryWriteCandidate extends BaseExternalMemoryWriteCandidate {
  selected?: boolean
  reason?: ExternalMemoryReasonSnapshot
  decisions?: ExternalMemoryWriteCandidateDecision[]
}

export interface ExternalMemoryWriteReviewSnapshot extends BaseExternalMemoryWriteReviewSnapshot {
  candidates: ExternalMemoryWriteCandidate[]
}

export interface ExternalMemoryReadSnapshot extends BaseExternalMemoryReadSnapshot {}

export interface ExternalMemoryContextSnapshot extends BaseExternalMemoryContextSnapshot {
  turn: ExternalMemoryTurnSnapshot
  documents: ExternalMemoryReadSnapshot[]
}

export interface ExternalMemoryWriteRequest {
  source?: string
  characterName?: string
  summary?: string
  facts?: string[]
  preferences?: string[]
  items?: string[]
  removeItems?: string[]
}

export interface ExternalMemoryWriteResult extends BaseExternalMemoryWriteResult {
  review: ExternalMemoryWriteReviewSnapshot
}

export interface ExternalMemoryUsageSnapshot extends BaseExternalMemoryUsageSnapshot {
  context?: ExternalMemoryContextSnapshot
  turn?: ExternalMemoryTurnSnapshot
  lastWrite?: ExternalMemoryWriteResult
  lastWriteReview?: ExternalMemoryWriteReviewSnapshot
  recentWrites: ExternalMemoryWriteResult[]
}

/**
 * Renderer-to-main request used when the desktop runtime should build a memory context
 * for the active character.
 */
export interface ExternalMemoryLoadRequest {
  characterName?: string
  displayModelName?: string
}

export function createExternalMemoryReasonSnapshot(
  code: ExternalMemoryReasonCode,
  detail?: string,
): ExternalMemoryReasonSnapshot {
  const base = createBaseExternalMemoryReasonSnapshot(code)
  return detail
    ? {
        ...base,
        detail,
      }
    : base
}

export function createDefaultExternalMemoryTurnSnapshot(): ExternalMemoryTurnSnapshot {
  return createBaseDefaultExternalMemoryTurnSnapshot()
}

export function createDefaultExternalMemoryWriteReviewSnapshot(): ExternalMemoryWriteReviewSnapshot {
  return createBaseDefaultExternalMemoryWriteReviewSnapshot()
}

export function createDefaultExternalMemoryUsageSnapshot(): ExternalMemoryUsageSnapshot {
  return createBaseDefaultExternalMemoryUsageSnapshot()
}
