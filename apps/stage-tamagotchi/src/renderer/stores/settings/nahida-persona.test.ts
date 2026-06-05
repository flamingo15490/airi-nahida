import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const toastErrorMock = vi.hoisted(() => vi.fn())
const toastSuccessMock = vi.hoisted(() => vi.fn())

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}))

describe('useNahidaPersonaSettingsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    toastErrorMock.mockReset()
    toastSuccessMock.mockReset()
  })

  it('mirrors the shared Nahida persona runtime snapshot', async () => {
    const { useNahidaPersonaStore } = await import('@proj-airi/stage-ui/stores/nahida-persona-store')
    const personaStore = useNahidaPersonaStore()
    personaStore.setBridge({
      getConfig: vi.fn(async () => ({
        enabled: true,
        mode: 'active' as const,
      })),
      saveConfig: vi.fn(async settings => settings),
    })

    const { useAiriCardStore } = await import('@proj-airi/stage-ui/stores/modules/airi-card')
    const cardStore = useAiriCardStore()
    cardStore.cards = new Map([
      ['default', {
        name: 'Nahida',
        extensions: {
          airi: {
            agents: {},
            modules: {
              consciousness: {
                provider: 'mock-provider',
                model: 'mock-model',
              },
              speech: {
                provider: 'mock-speech-provider',
                model: 'mock-speech-model',
                voice_id: 'alloy',
              },
            },
          },
        },
      }],
    ]) as typeof cardStore.cards
    cardStore.activeCardId = 'default'

    const { useNahidaPersonaSettingsStore } = await import('./nahida-persona')
    const store = useNahidaPersonaSettingsStore()

    await store.refresh()

    expect(store.settings.enabled).toBe(true)
    expect(store.settings.mode).toBe('active')
    expect(store.matchesActiveCard).toBe(true)
    expect(store.isActive).toBe(true)
    expect(store.summary).toContain('active')
    expect(store.activeModeSummary).toContain('check in more readily')
    expect(store.sections).toHaveLength(4)
    expect(store.sections[0]?.id).toBe('fact-anchors')
    expect(store.sections[2]?.id).toBe('memory-boundaries')
  })

  it('saves through the shared bridge and shows success toast', async () => {
    const saveConfigMock = vi.fn(async (settings) => {
      expect(() => structuredClone(settings)).not.toThrow()
      return settings
    })
    const { useNahidaPersonaStore } = await import('@proj-airi/stage-ui/stores/nahida-persona-store')
    const personaStore = useNahidaPersonaStore()
    personaStore.setBridge({
      getConfig: vi.fn(async () => ({
        enabled: false,
        mode: 'balanced' as const,
      })),
      saveConfig: saveConfigMock,
    })

    const { useNahidaPersonaSettingsStore } = await import('./nahida-persona')
    const store = useNahidaPersonaSettingsStore()

    await store.refresh()
    store.settings.enabled = true
    store.settings.mode = 'reserved'
    await store.save()

    expect(saveConfigMock).toHaveBeenCalledWith({
      enabled: true,
      mode: 'reserved',
    })
    expect(store.activeModeSummary).toContain('present-focused')
    expect(toastSuccessMock).toHaveBeenCalledWith('Nahida persona settings saved.')
  })
})
