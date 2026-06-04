import type {
  SubsystemHealthProbe,
} from './system-health'

import { describe, expect, it } from 'vitest'

import {
  createDefaultStartupDiagnosticsResult,
  createDefaultSystemHealthSnapshot,
  deriveOverallHealth,
} from './system-health'

function probe(kind: SubsystemHealthProbe['kind'], status: SubsystemHealthProbe['status']): SubsystemHealthProbe {
  return { kind, status, summary: `${kind}:${status}`, checkedAt: Date.now() }
}

describe('deriveOverallHealth', () => {
  it('returns healthy when all subsystems are healthy', () => {
    const result = deriveOverallHealth([
      probe('memory', 'healthy'),
      probe('persona', 'healthy'),
      probe('vision', 'healthy'),
    ])
    expect(result).toBe('healthy')
  })

  it('returns degraded when any subsystem is degraded', () => {
    const result = deriveOverallHealth([
      probe('memory', 'healthy'),
      probe('persona', 'degraded'),
      probe('vision', 'healthy'),
    ])
    expect(result).toBe('degraded')
  })

  it('returns unhealthy when any subsystem is unhealthy', () => {
    const result = deriveOverallHealth([
      probe('memory', 'healthy'),
      probe('persona', 'degraded'),
      probe('vision', 'unhealthy'),
    ])
    expect(result).toBe('unhealthy')
  })

  it('returns unknown when all subsystems are unknown', () => {
    const result = deriveOverallHealth([
      probe('memory', 'unknown'),
      probe('persona', 'unknown'),
    ])
    expect(result).toBe('unknown')
  })

  it('returns unknown for an empty subsystems array', () => {
    const result = deriveOverallHealth([])
    expect(result).toBe('unknown')
  })

  it('returns unhealthy even when mixed with degraded and healthy', () => {
    const result = deriveOverallHealth([
      probe('memory', 'healthy'),
      probe('persona', 'degraded'),
      probe('proactive', 'unknown'),
      probe('coordination', 'unhealthy'),
    ])
    expect(result).toBe('unhealthy')
  })

  it('returns unknown as worse than healthy but better than degraded', () => {
    const result = deriveOverallHealth([
      probe('memory', 'healthy'),
      probe('persona', 'unknown'),
    ])
    expect(result).toBe('unknown')
  })
})

describe('createDefaultSystemHealthSnapshot', () => {
  it('returns unknown overall with empty subsystems and startupPhase true', () => {
    const snapshot = createDefaultSystemHealthSnapshot()

    expect(snapshot.overall).toBe('unknown')
    expect(snapshot.subsystems).toEqual([])
    expect(snapshot.startupPhase).toBe(true)
  })

  it('sets checkedAt to a recent timestamp', () => {
    const before = Date.now()
    const snapshot = createDefaultSystemHealthSnapshot()
    const after = Date.now()

    expect(snapshot.checkedAt).toBeGreaterThanOrEqual(before)
    expect(snapshot.checkedAt).toBeLessThanOrEqual(after)
  })
})

describe('createDefaultStartupDiagnosticsResult', () => {
  it('returns passing result with empty warnings and failures', () => {
    const result = createDefaultStartupDiagnosticsResult()

    expect(result.passed).toBe(true)
    expect(result.warnings).toEqual([])
    expect(result.failures).toEqual([])
  })

  it('returns zero duration', () => {
    const result = createDefaultStartupDiagnosticsResult()

    expect(result.duration).toBe(0)
  })
})
