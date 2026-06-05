import type { WebSocketEventOf } from '@proj-airi/server-sdk'
import type {
  ProactiveCompanionDecision,
  ProactiveCompanionDecisionSnapshot,
  ProactiveCompanionEvaluateResult,
  ProactiveCompanionEventKind,
  ProactiveCompanionEventSnapshot,
  ProactiveCompanionIntensity,
  ProactiveCompanionPresentation,
  ProactiveCompanionRuntimeSnapshot,
  ProactiveCompanionRuntimeState,
  ProactiveCompanionSettings,
} from '@proj-airi/stage-ui/stores/proactive-companion-shared'

import {
  createDefaultProactiveCompanionRuntimeSnapshot,
  createDefaultProactiveCompanionSettings,
  PROACTIVE_COMPANION_DECISIONS,
  PROACTIVE_COMPANION_EVENT_KINDS,
} from '@proj-airi/stage-ui/stores/proactive-companion-shared'
import {
  boolean,
  literal,
  number,
  object,
  picklist,
} from 'valibot'

export {
  createDefaultProactiveCompanionRuntimeSnapshot,
  createDefaultProactiveCompanionSettings,
  PROACTIVE_COMPANION_DECISIONS,
  PROACTIVE_COMPANION_EVENT_KINDS,
}

export type {
  ProactiveCompanionDecision,
  ProactiveCompanionDecisionSnapshot,
  ProactiveCompanionEvaluateResult,
  ProactiveCompanionEventKind,
  ProactiveCompanionEventSnapshot,
  ProactiveCompanionIntensity,
  ProactiveCompanionPresentation,
  ProactiveCompanionRuntimeSnapshot,
  ProactiveCompanionRuntimeState,
  ProactiveCompanionSettings,
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

const proactiveCompanionSettingsSchema = object({
  enabled: boolean(),
  globalCooldownMs: number(),
  topicCooldownMs: number(),
  intensity: picklist(['low', 'balanced'] satisfies ProactiveCompanionIntensity[]),
})

export const proactiveCompanionConfigFileSchema = object({
  version: literal(PROACTIVE_COMPANION_CONFIG_VERSION),
  settings: proactiveCompanionSettingsSchema,
})

/**
 * Normalizes proactive companion settings into one conservative persisted shape.
 *
 * Before:
 * - `{ globalCooldownMs: 0, topicCooldownMs: 30_000, intensity: 'low' }`
 *
 * After:
 * - `{ globalCooldownMs: 180_000, topicCooldownMs: 180_000, intensity: 'low' }`
 */
export function normalizeProactiveCompanionSettings(
  settings?: Partial<ProactiveCompanionSettings>,
): ProactiveCompanionSettings {
  const defaults = createDefaultProactiveCompanionSettings()
  const merged = {
    ...defaults,
    ...settings,
  }
  const globalCooldownMs = merged.globalCooldownMs > 0
    ? merged.globalCooldownMs
    : defaults.globalCooldownMs
  const topicCooldownMs = merged.topicCooldownMs > 0
    ? Math.max(merged.topicCooldownMs, globalCooldownMs)
    : Math.max(defaults.topicCooldownMs, globalCooldownMs)

  return {
    ...merged,
    globalCooldownMs,
    topicCooldownMs,
    intensity: merged.intensity === 'balanced' ? 'balanced' : 'low',
  }
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
