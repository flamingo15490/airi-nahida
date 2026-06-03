export type {
  ExternalMemoryCapabilityState,
  ExternalMemoryContextSnapshot,
  ExternalMemoryDocumentKind,
  ExternalMemoryReadSnapshot,
  ExternalMemoryUsageSnapshot,
  ExternalMemoryWriteDecision,
  ExternalMemoryWriteRequest,
  ExternalMemoryWriteResult,
} from '@proj-airi/stage-ui/stores/external-memory-shared'

/**
 * Renderer-to-main request used when the desktop runtime should build a memory context
 * for the active character.
 */
export interface ExternalMemoryLoadRequest {
  characterName?: string
  displayModelName?: string
}
