import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const appMock = vi.hoisted(() => ({
  getPath: vi.fn(),
}))

vi.mock('electron', () => ({
  app: appMock,
}))

describe('nahida persona manager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('persists and returns desktop Nahida persona settings', async () => {
    const userDataRoot = await mkdtemp(join(tmpdir(), 'airi-nahida-persona-'))
    appMock.getPath.mockImplementation((name: string) => {
      if (name === 'userData') {
        return userDataRoot
      }

      throw new Error(`Unexpected Electron path lookup: ${name}`)
    })

    const { createNahidaPersonaManager } = await import('./index')
    const manager = createNahidaPersonaManager()

    expect(manager.getConfig()).toEqual({
      enabled: false,
      mode: 'balanced',
    })

    expect(manager.saveConfig({
      enabled: true,
      mode: 'active',
    })).toEqual({
      enabled: true,
      mode: 'active',
    })
    expect(manager.getConfig()).toEqual({
      enabled: true,
      mode: 'active',
    })
  })

  it('stores the latest renderer-provided target context in a normalized runtime snapshot', async () => {
    const userDataRoot = await mkdtemp(join(tmpdir(), 'airi-nahida-persona-runtime-'))
    appMock.getPath.mockImplementation((name: string) => {
      if (name === 'userData') {
        return userDataRoot
      }

      throw new Error(`Unexpected Electron path lookup: ${name}`)
    })

    const { createNahidaPersonaManager } = await import('./index')
    const manager = createNahidaPersonaManager()

    manager.saveConfig({
      enabled: true,
      mode: 'balanced',
    })
    manager.updateTargetContext({
      activeCardName: ' ReLU ',
      activeDisplayModelName: ' Nahida ',
    })

    expect(manager.getTargetContext()).toEqual({
      activeCardName: 'ReLU',
      activeDisplayModelName: 'Nahida',
    })
    expect(manager.getSnapshot()).toMatchObject({
      enabled: true,
      mode: 'balanced',
      activeCardName: 'ReLU',
      activeDisplayModelName: 'Nahida',
      matchesActiveCard: true,
      isActive: true,
    })
  })
})
