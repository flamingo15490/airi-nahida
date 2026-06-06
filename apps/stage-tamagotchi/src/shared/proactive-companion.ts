import type { WebSocketEventOf } from '@proj-airi/server-sdk'
import type {
  ProactiveCompanionActionResult,
  ProactiveCompanionDecision,
  ProactiveCompanionDecisionSnapshot,
  ProactiveCompanionEvaluateResult,
  ProactiveCompanionEventKind,
  ProactiveCompanionEventSnapshot,
  ProactiveCompanionIntensity,
  ProactiveCompanionLegacyImportSummary,
  ProactiveCompanionPresentation,
  ProactiveCompanionRuntimeEvent,
  ProactiveCompanionRuntimeSnapshot,
  ProactiveCompanionRuntimeState,
  ProactiveCompanionSettings,
  ProactiveCompanionSignalSource,
  ProactiveCompanionSimulationKind,
  ProactiveCompanionSimulationRequest,
  ProactiveCompanionSourceMode,
  ProactiveCompanionVisionObservation,
} from '@proj-airi/stage-ui/stores/proactive-companion-shared'

import {
  createDefaultProactiveCompanionRuntimeSnapshot,
  createDefaultProactiveCompanionSettings,
  normalizeProactiveCompanionSharedSettings,
  PROACTIVE_COMPANION_DECISIONS,
  PROACTIVE_COMPANION_EVENT_KINDS,
  PROACTIVE_COMPANION_SIGNAL_SOURCES,
  PROACTIVE_COMPANION_SIMULATION_KINDS,
  PROACTIVE_COMPANION_SOURCE_MODES,
} from '@proj-airi/stage-ui/stores/proactive-companion-shared'
import {
  array,
  boolean,
  literal,
  number,
  object,
  optional,
  picklist,
  string,
} from 'valibot'

export {
  createDefaultProactiveCompanionRuntimeSnapshot,
  createDefaultProactiveCompanionSettings,
  PROACTIVE_COMPANION_DECISIONS,
  PROACTIVE_COMPANION_EVENT_KINDS,
  PROACTIVE_COMPANION_SIGNAL_SOURCES,
  PROACTIVE_COMPANION_SIMULATION_KINDS,
  PROACTIVE_COMPANION_SOURCE_MODES,
}

export type {
  ProactiveCompanionActionResult,
  ProactiveCompanionDecision,
  ProactiveCompanionDecisionSnapshot,
  ProactiveCompanionEvaluateResult,
  ProactiveCompanionEventKind,
  ProactiveCompanionEventSnapshot,
  ProactiveCompanionIntensity,
  ProactiveCompanionLegacyImportSummary,
  ProactiveCompanionPresentation,
  ProactiveCompanionRuntimeEvent,
  ProactiveCompanionRuntimeSnapshot,
  ProactiveCompanionRuntimeState,
  ProactiveCompanionSettings,
  ProactiveCompanionSignalSource,
  ProactiveCompanionSimulationKind,
  ProactiveCompanionSimulationRequest,
  ProactiveCompanionSourceMode,
  ProactiveCompanionVisionObservation,
}

export const PROACTIVE_COMPANION_CONFIG_VERSION = 1

/**
 * Persisted desktop config file for the proactive governance layer.
 */
export interface ProactiveCompanionConfigFile {
  version: typeof PROACTIVE_COMPANION_CONFIG_VERSION
  settings: ProactiveCompanionSettings
}

/**
 * Desktop-safe alias for one incoming websocket reminder.
 */
export type ProactiveCompanionSparkNotifyInput = WebSocketEventOf<'spark:notify'>
export type ProactiveCompanionContextUpdateInput = WebSocketEventOf<'context:update'>
export interface ProactiveCompanionDispatchEvent extends ProactiveCompanionRuntimeEvent {
  sparkNotify?: ProactiveCompanionSparkNotifyInput
}

const proactiveCompanionSettingsSchema = object({
  enabled: boolean(),
  globalCooldownMs: number(),
  topicCooldownMs: number(),
  intensity: picklist(['low', 'balanced'] satisfies ProactiveCompanionIntensity[]),
  sourceMode: optional(picklist([...PROACTIVE_COMPANION_SOURCE_MODES])),
  engineEnabled: optional(boolean()),
  idleThresholdMs: optional(number()),
  idleCheckMinMs: optional(number()),
  idleCheckMaxMs: optional(number()),
  urgentCooldownMs: optional(number()),
  memoryCooldownMs: optional(number()),
  visionCooldownMs: optional(number()),
  sameTopicCooldownMs: optional(number()),
  maxProactivePerHour: optional(number()),
  allowInterruptOnUrgent: optional(boolean()),
  workingNudgeEnabled: optional(boolean()),
  workingNudgeMinPauseMs: optional(number()),
  workingNudgeCooldownMs: optional(number()),
  visionEnabled: optional(boolean()),
  memoryEnabled: optional(boolean()),
  urgentKeywords: optional(array(string())),
})

export const proactiveCompanionConfigFileSchema = object({
  version: literal(PROACTIVE_COMPANION_CONFIG_VERSION),
  settings: proactiveCompanionSettingsSchema,
})

/**
 * Normalizes proactive companion settings into one conservative persisted shape.
 *
 * Before:
 * - `{ globalCooldownMs: 0, sameTopicCooldownMs: 30_000, sourceMode: 'embedded' }`
 *
 * After:
 * - `{ globalCooldownMs: 180_000, sameTopicCooldownMs: 1_800_000, sourceMode: 'embedded', ... }`
 */
export function normalizeProactiveCompanionSettings(
  settings?: Partial<ProactiveCompanionSettings>,
): ProactiveCompanionSettings {
  return normalizeProactiveCompanionSharedSettings(settings)
}

/**
 * Creates the default persisted config file for proactive governance.
 *
 * Use when:
 * - The source build runs without any saved proactive settings yet
 * - Tests need deterministic first-boot defaults
 *
 * Expects:
 * - Optional overrides already follow the persisted settings shape
 *
 * Returns:
 * - A complete desktop config file
 */
export function createDefaultProactiveCompanionConfigFile(
  overrides?: Partial<ProactiveCompanionSettings>,
): ProactiveCompanionConfigFile {
  return {
    version: PROACTIVE_COMPANION_CONFIG_VERSION,
    settings: normalizeProactiveCompanionSettings(overrides),
  }
}
