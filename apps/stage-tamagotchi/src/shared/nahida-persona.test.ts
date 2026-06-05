import { describe, expect, it } from 'vitest'

import {
  createDefaultNahidaPersonaConfigFile,
  parseNahidaPersonaConfigText,
} from './nahida-persona'

describe('nahida persona config', () => {
  it('creates defaults with the feature disabled and balanced mode', () => {
    const config = createDefaultNahidaPersonaConfigFile()

    expect(config.version).toBe(1)
    expect(config.settings.enabled).toBe(false)
    expect(config.settings.mode).toBe('balanced')
  })

  it('rejects invalid mode values', () => {
    expect(() => parseNahidaPersonaConfigText(JSON.stringify({
      version: 1,
      settings: {
        enabled: true,
        mode: 'loud',
      },
    }))).toThrow('settings.mode')
  })
})
