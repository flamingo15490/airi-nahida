import type { NahidaPersonaSettings, NahidaPersonaSnapshot } from './nahida-persona-shared'

import { errorMessageFrom } from '@moeru/std'
import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'

import { useAiriCardStore } from './modules/airi-card'
import {
  composeNahidaPersonaSupplement,
  getNahidaPersonaModeBehavior,
  getNahidaPersonaSectionPreviews,
  isNahidaPersonaTarget,
} from './nahida-persona'
import { createDefaultNahidaPersonaSettings } from './nahida-persona-shared'
import { useSettingsStageModel } from './settings/stage-model'

/**
 * Runtime bridge implemented by desktop hosts to persist Nahida persona
 * settings outside renderer-local storage.
 */
export interface NahidaPersonaBridge {
  getConfig: () => Promise<NahidaPersonaSettings>
  saveConfig: (settings: NahidaPersonaSettings) => Promise<NahidaPersonaSettings>
}

export const useNahidaPersonaStore = defineStore('nahida-persona', () => {
  const cardStore = useAiriCardStore()
  const stageModelStore = useSettingsStageModel()
  const bridge = ref<NahidaPersonaBridge>()
  const settings = ref<NahidaPersonaSettings>(createDefaultNahidaPersonaSettings())
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string>()

  const activeCardName = computed(() => cardStore.activeCard?.name?.trim())
  const activeDisplayModelName = computed(() => stageModelStore.stageModelSelectedDisplayModel?.name?.trim())
  const matchesActiveCard = computed(() => isNahidaPersonaTarget({
    cardName: activeCardName.value,
    displayModelName: activeDisplayModelName.value,
  }))
  const isActive = computed(() => settings.value.enabled && matchesActiveCard.value)
  const activeModeBehavior = computed(() => getNahidaPersonaModeBehavior(settings.value.mode))
  const sections = computed(() => getNahidaPersonaSectionPreviews(settings.value.mode))
  const activeSupplement = computed(() => composeNahidaPersonaSupplement({
    card: cardStore.activeCard,
    displayModelName: activeDisplayModelName.value,
    settings: settings.value,
  }))
  const activeModeSummary = computed(() => activeModeBehavior.value.summary)
  const summary = computed(() => {
    if (!settings.value.enabled) {
      return 'Nahida persona layer is disabled. The active card remains unchanged.'
    }

    if (!matchesActiveCard.value) {
      return 'Current active card and display model are not recognized as Nahida, so the supplement stays inactive.'
    }

    return `Nahida persona layer is active in ${settings.value.mode} mode. ${activeModeSummary.value}`
  })
  const snapshot = computed<NahidaPersonaSnapshot>(() => ({
    ...settings.value,
    activeCardName: activeCardName.value,
    matchesActiveCard: matchesActiveCard.value,
    isActive: isActive.value,
    activeModeSummary: activeModeSummary.value,
    sections: sections.value,
    summary: summary.value,
  }))

  function setBridge(nextBridge: NahidaPersonaBridge) {
    bridge.value = nextBridge
  }

  function applySettings(nextSettings: NahidaPersonaSettings) {
    settings.value = {
      ...createDefaultNahidaPersonaSettings(),
      ...nextSettings,
    }
  }

  async function withBridge<T>(run: (activeBridge: NahidaPersonaBridge) => Promise<T>) {
    if (!bridge.value) {
      throw new Error('Nahida persona bridge is not available in this runtime.')
    }

    return await run(bridge.value)
  }

  async function refresh() {
    loading.value = true
    error.value = undefined

    try {
      applySettings(await withBridge(activeBridge => activeBridge.getConfig()))
      return settings.value
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to load Nahida persona settings.'
      throw cause
    }
    finally {
      loading.value = false
    }
  }

  async function save() {
    saving.value = true
    error.value = undefined

    try {
      const nextSettings = structuredClone(toRaw(settings.value))
      applySettings(await withBridge(activeBridge => activeBridge.saveConfig(nextSettings)))
      return settings.value
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to save Nahida persona settings.'
      throw cause
    }
    finally {
      saving.value = false
    }
  }

  return {
    activeCardName,
    activeModeSummary,
    activeSupplement,
    error,
    isActive,
    loading,
    matchesActiveCard,
    saving,
    sections,
    settings,
    snapshot,
    summary,

    applySettings,
    refresh,
    save,
    setBridge,
  }
})
