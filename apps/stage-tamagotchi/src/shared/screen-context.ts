import type {
  ScreenContextRuntimeSnapshot,
  ScreenContextRuntimeSnapshotEntry,
  ScreenContextSettings,
} from '@proj-airi/stage-ui/stores/screen-context-shared'

import {
  createDefaultScreenContextRuntimeSnapshot,
  createDefaultScreenContextSettings,
} from '@proj-airi/stage-ui/stores/screen-context-shared'

export type {
  ScreenContextRuntimeSnapshot,
  ScreenContextRuntimeSnapshotEntry,
  ScreenContextSettings,
}

export {
  createDefaultScreenContextRuntimeSnapshot,
  createDefaultScreenContextSettings,
}

export const SCREEN_CONTEXT_CONFIG_VERSION = 1

/**
 * Persisted desktop config file for the screen-context runtime.
 */
export interface ScreenContextConfigFile {
  version: typeof SCREEN_CONTEXT_CONFIG_VERSION
  settings: ScreenContextSettings
}

/**
 * Normalizes screen-context settings into one conservative persisted shape.
 *
 * Before:
 * - `{ sourceMode: 'vision-only', historyLimit: 0, staleThresholdMs: -1 }`
 *
 * After:
 * - `{ sourceMode: 'vision-only', historyLimit: 30, staleThresholdMs: 60000 }`
 */
export function normalizeScreenContextSettings(
  settings?: Partial<ScreenContextSettings>,
): ScreenContextSettings {
  const defaults = createDefaultScreenContextSettings()
  const merged = { ...defaults, ...settings }

  return {
    sourceMode: merged.sourceMode === 'system-idle-assisted' ? 'system-idle-assisted' : 'vision-only',
    historyLimit: Math.max(1, Math.min(200, merged.historyLimit || defaults.historyLimit)),
    staleThresholdMs: Math.max(5_000, merged.staleThresholdMs || defaults.staleThresholdMs),
  }
}

/**
 * Creates the default persisted config file for screen-context.
 */
export function createDefaultScreenContextConfigFile(
  overrides?: Partial<ScreenContextSettings>,
): ScreenContextConfigFile {
  return {
    version: SCREEN_CONTEXT_CONFIG_VERSION,
    settings: normalizeScreenContextSettings(overrides),
  }
}
