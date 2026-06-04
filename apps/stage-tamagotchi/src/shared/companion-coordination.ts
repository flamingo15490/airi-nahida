import type {
  CompanionCoordinationSnapshot,
} from '@proj-airi/stage-ui/stores/companion-coordination-shared'
import type {
  NahidaPersonaSnapshot,
  NahidaPersonaTargetContext,
} from '@proj-airi/stage-ui/stores/nahida-persona-shared'

export type {
  CompanionCoordinationOverviewFields,
  CompanionCoordinationReason,
  CompanionCoordinationReasonCode,
  CompanionCoordinationSnapshot,
  CompanionCoordinationStatus,
  CompanionCoordinationSurface,
  CompanionCoordinationSurfaceSnapshot,
} from '@proj-airi/stage-ui/stores/companion-coordination-shared'

/**
 * Minimal desktop-safe request used when renderer supplies the latest known
 * Nahida persona targeting context to the main-process runtime.
 */
export interface CompanionCoordinationRefreshRequest extends NahidaPersonaTargetContext {}

/**
 * JSON-safe coordination runtime snapshot returned after a managed spark-notify
 * evaluation refreshes the phase-six overview.
 */
export interface CompanionCoordinationSparkNotifyResult {
  /** Frozen coordination snapshot after the refresh completes. */
  snapshot: CompanionCoordinationSnapshot
  /** Persona snapshot used to compose the coordination refresh. */
  persona: NahidaPersonaSnapshot
}
