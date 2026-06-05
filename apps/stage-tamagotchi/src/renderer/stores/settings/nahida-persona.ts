import { errorMessageFrom } from '@moeru/std'
import { useNahidaPersonaStore } from '@proj-airi/stage-ui/stores/nahida-persona-store'
import { defineStore, storeToRefs } from 'pinia'
import { computed } from 'vue'
import { toast } from 'vue-sonner'

export const useNahidaPersonaSettingsStore = defineStore('tamagotchi-nahida-persona-settings', () => {
  const personaStore = useNahidaPersonaStore()
  const {
    activeCardName,
    activeModeSummary,
    error,
    isActive,
    loading,
    matchesActiveCard,
    saving,
    sections,
    settings,
    snapshot,
    summary,
  } = storeToRefs(personaStore)

  const modeOptions = computed(() => ([
    { label: 'Reserved', value: 'reserved' },
    { label: 'Balanced', value: 'balanced' },
    { label: 'Active', value: 'active' },
  ] as const))

  async function refresh() {
    try {
      return await personaStore.refresh()
    }
    catch (error) {
      const message = errorMessageFrom(error) ?? 'Failed to load Nahida persona settings.'
      toast.error(message)
      throw error
    }
  }

  async function save() {
    try {
      const next = await personaStore.save()
      toast.success('Nahida persona settings saved.')
      return next
    }
    catch (error) {
      const message = errorMessageFrom(error) ?? 'Failed to save Nahida persona settings.'
      toast.error(message)
      throw error
    }
  }

  return {
    activeCardName,
    activeModeSummary,
    error,
    isActive,
    loading,
    matchesActiveCard,
    modeOptions,
    saving,
    sections,
    settings,
    snapshot,
    summary,

    refresh,
    save,
  }
})
