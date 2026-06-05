import { describe, expect, it } from 'vitest'

import { resolvePreferredUserDataPath } from './user-data-path'

function normalizePathSeparators(value: string | undefined) {
  return value?.replaceAll('\\', '/')
}

describe('resolvePreferredUserDataPath', () => {
  it('prefers the explicit environment override when provided', () => {
    const resolution = resolvePreferredUserDataPath({
      appDataPath: 'C:\\Users\\Lenovo\\AppData\\Roaming',
      devMode: true,
      envUserDataPath: 'D:\\custom-airi-profile',
      pathExists: () => false,
    })

    expect(resolution.source).toBe('env')
    expect(resolution.path).toBe('D:\\custom-airi-profile')
    expect(resolution.candidates).toEqual(['D:\\custom-airi-profile'])
  })

  it('prefers the prepared source preview profile during source dev', () => {
    const resolution = resolvePreferredUserDataPath({
      appDataPath: 'C:\\Users\\Lenovo\\AppData\\Roaming',
      devMode: true,
      pathExists: path => path.endsWith('stage-tamagotchi-source-preview'),
    })

    expect(resolution.source).toBe('source-preview')
    expect(normalizePathSeparators(resolution.path)).toBe('C:/Users/Lenovo/AppData/Roaming/@proj-airi/stage-tamagotchi-source-preview')
  })

  it('falls back to the packaged AIRI profile when the preview profile is missing', () => {
    const resolution = resolvePreferredUserDataPath({
      appDataPath: 'C:\\Users\\Lenovo\\AppData\\Roaming',
      devMode: true,
      pathExists: path => path.endsWith('ai.moeru.airi'),
    })

    expect(resolution.source).toBe('legacy-app')
    expect(normalizePathSeparators(resolution.path)).toBe('C:/Users/Lenovo/AppData/Roaming/ai.moeru.airi')
  })

  it('keeps Electron defaults outside source dev when there is no override', () => {
    const resolution = resolvePreferredUserDataPath({
      appDataPath: 'C:\\Users\\Lenovo\\AppData\\Roaming',
      devMode: false,
      pathExists: () => true,
    })

    expect(resolution.source).toBe('default')
    expect(resolution.path).toBeUndefined()
    expect(resolution.candidates).toEqual([])
  })
})
