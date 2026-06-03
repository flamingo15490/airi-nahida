import { errorMessageFrom } from '@moeru/std'
import { useProactiveCompanionStore } from '@proj-airi/stage-ui/stores/proactive-companion-store'
import { defineStore, storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'

export const useProactiveCompanionSettingsStore = defineStore('tamagotchi-proactive-companion-settings', () => {
  const proactiveCompanionStore = useProactiveCompanionStore()
  const {
    clearing,
    error,
    history,
    latestDecision,
    loading,
    refreshing,
    runtime,
    saving,
    settings,
  } = storeToRefs(proactiveCompanionStore)

  async function refresh() {
    try {
      await proactiveCompanionStore.refreshConfig()
      return await proactiveCompanionStore.refreshRuntime()
    }
    catch (cause) {
      const message = errorMessageFrom(cause) ?? 'Failed to refresh proactive companion settings.'
      toast.error(message)
      throw cause
    }
  }

  async function save() {
    try {
      const nextSettings = await proactiveCompanionStore.saveConfig()
      await proactiveCompanionStore.refreshRuntime()
      toast.success('Proactive companion settings saved.')
      return nextSettings
    }
    catch (cause) {
      const message = errorMessageFrom(cause) ?? 'Failed to save proactive companion settings.'
      toast.error(message)
      throw cause
    }
  }

  async function clearHistory() {
    try {
      const nextRuntime = await proactiveCompanionStore.clearHistory()
      toast.success('Proactive companion history cleared.')
      return nextRuntime
    }
    catch (cause) {
      const message = errorMessageFrom(cause) ?? 'Failed to clear proactive companion history.'
      toast.error(message)
      throw cause
    }
  }

  return {
    clearing,
    error,
    history,
    latestDecision,
    loading,
    refreshing,
    runtime,
    saving,
    settings,

    clearHistory,
    refresh,
    save,
  }
})
