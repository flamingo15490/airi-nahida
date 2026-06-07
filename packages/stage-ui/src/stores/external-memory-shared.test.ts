import { describe, expect, it } from 'vitest'

import {
  createDefaultExternalMemoryJudgementSnapshot,
  createDefaultExternalMemoryUsageSnapshot,
  EXTERNAL_MEMORY_OBSERVATION_SOURCES,
} from './external-memory-shared'

describe('external-memory shared types extensions', () => {
  it('includes screen-peek and screen-usage-context in observation sources', () => {
    expect(EXTERNAL_MEMORY_OBSERVATION_SOURCES).toContain('screen-peek')
    expect(EXTERNAL_MEMORY_OBSERVATION_SOURCES).toContain('screen-usage-context')
  })

  it('default judgement snapshot has undefined summaryChannels', () => {
    const snapshot = createDefaultExternalMemoryJudgementSnapshot()
    expect(snapshot.summaryChannels).toBeUndefined()
    expect(snapshot.lastRecallDecision).toBeUndefined()
    expect(snapshot.lastMemorizeDecision).toBeUndefined()
  })

  it('default usage snapshot has undefined recall and memorize decisions', () => {
    const snapshot = createDefaultExternalMemoryUsageSnapshot()
    expect(snapshot.lastRecallDecision).toBeUndefined()
    expect(snapshot.lastMemorizeDecision).toBeUndefined()
  })
})
