import { describe, expect, it } from 'vitest'

import {
  createDefaultScreenContextConfigFile,
  normalizeScreenContextSettings,
  SCREEN_CONTEXT_CONFIG_VERSION,
} from './screen-context'

describe('screen-context shared contract', () => {
  it('normalizes settings with defaults for invalid values', () => {
    const result = normalizeScreenContextSettings({
      sourceMode: 'vision-only',
      historyLimit: 0,
      staleThresholdMs: -1,
    })
    expect(result.sourceMode).toBe('vision-only')
    expect(result.historyLimit).toBe(30)
    // -1 is clamped to minimum 5_000
    expect(result.staleThresholdMs).toBe(5_000)
  })

  it('preserves system-idle-assisted source mode', () => {
    const result = normalizeScreenContextSettings({
      sourceMode: 'system-idle-assisted',
      historyLimit: 50,
      staleThresholdMs: 30_000,
    })
    expect(result.sourceMode).toBe('system-idle-assisted')
    expect(result.historyLimit).toBe(50)
    expect(result.staleThresholdMs).toBe(30_000)
  })

  it('clamps historyLimit to valid range', () => {
    expect(normalizeScreenContextSettings({ historyLimit: -5 }).historyLimit).toBe(1)
    expect(normalizeScreenContextSettings({ historyLimit: 500 }).historyLimit).toBe(200)
  })

  it('creates default config file with correct version', () => {
    const config = createDefaultScreenContextConfigFile()
    expect(config.version).toBe(SCREEN_CONTEXT_CONFIG_VERSION)
    expect(config.settings.sourceMode).toBe('vision-only')
  })
})
