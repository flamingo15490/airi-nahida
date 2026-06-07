import { describe, expect, it } from 'vitest'

import {
  createDefaultScreenContextRuntimeSnapshot,
  createDefaultScreenContextSettings,
  DEFAULT_SCREEN_CONTEXT_SETTINGS,
} from './screen-context-shared'

describe('screen-context shared types', () => {
  it('creates default settings with expected values', () => {
    const settings = createDefaultScreenContextSettings()
    expect(settings.sourceMode).toBe('vision-only')
    expect(settings.historyLimit).toBe(30)
    expect(settings.staleThresholdMs).toBe(60_000)
  })

  it('creates default runtime snapshot with null peek and usage context', () => {
    const snapshot = createDefaultScreenContextRuntimeSnapshot()
    expect(snapshot.sourceMode).toBe('vision-only')
    expect(snapshot.presence).toBe('unknown')
    expect(snapshot.latestPeek).toBeNull()
    expect(snapshot.latestUsageContext).toBeNull()
    expect(snapshot.recentHistory).toEqual([])
    expect(snapshot.refreshedAt).toBe(0)
  })

  it('exports DEFAULT_SCREEN_CONTEXT_SETTINGS as a frozen reference', () => {
    expect(DEFAULT_SCREEN_CONTEXT_SETTINGS.sourceMode).toBe('vision-only')
    expect(DEFAULT_SCREEN_CONTEXT_SETTINGS.historyLimit).toBe(30)
  })
})
