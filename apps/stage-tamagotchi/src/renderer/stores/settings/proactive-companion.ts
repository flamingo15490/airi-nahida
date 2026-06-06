import type { ProactiveCompanionSimulationRequest, ProactiveCompanionSourceMode } from '@proj-airi/stage-ui/stores/proactive-companion-shared'

import { errorMessageFrom } from '@moeru/std'
import { useProactiveCompanionStore } from '@proj-airi/stage-ui/stores/proactive-companion-store'
import { defineStore, storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'

export const useProactiveCompanionSettingsStore = defineStore('tamagotchi-proactive-companion-settings', () => {
  const proactiveCompanionStore = useProactiveCompanionStore()
  const lastImportSummary = storeToRefs(proactiveCompanionStore).lastImportSummary
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
      await proactiveCompanionStore.getSourceMode()
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
      toast.success('\u4E3B\u52A8\u966A\u4F34\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\u3002')
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
      toast.success('\u4E3B\u52A8\u966A\u4F34\u5386\u53F2\u5DF2\u6E05\u7A7A\u3002')
      return nextRuntime
    }
    catch (cause) {
      const message = errorMessageFrom(cause) ?? 'Failed to clear proactive companion history.'
      toast.error(message)
      throw cause
    }
  }

  async function importLegacyConfig() {
    try {
      const summary = await proactiveCompanionStore.importLegacyConfig()
      toast.success('\u65E7\u914D\u7F6E\u5DF2\u5BFC\u5165\u5230 embedded \u8BBE\u7F6E\u3002')
      return summary
    }
    catch (cause) {
      const message = errorMessageFrom(cause) ?? 'Failed to import legacy config.'
      toast.error(message)
      throw cause
    }
  }

  async function setSourceMode(mode: ProactiveCompanionSourceMode) {
    try {
      await proactiveCompanionStore.setSourceMode(mode)
      await proactiveCompanionStore.refreshRuntime()
      toast.success(`\u5DF2\u5207\u6362\u5230 ${mode} \u6A21\u5F0F\u3002`)
    }
    catch (cause) {
      const message = errorMessageFrom(cause) ?? 'Failed to set source mode.'
      toast.error(message)
      throw cause
    }
  }

  async function triggerManualCheckIn() {
    try {
      return await proactiveCompanionStore.triggerManualCheckIn()
    }
    catch (cause) {
      const message = errorMessageFrom(cause) ?? 'Failed to trigger manual check-in.'
      toast.error(message)
      throw cause
    }
  }

  async function simulateSignal(request: ProactiveCompanionSimulationRequest) {
    try {
      return await proactiveCompanionStore.simulateSignal(request)
    }
    catch (cause) {
      const message = errorMessageFrom(cause) ?? 'Failed to simulate proactive signal.'
      toast.error(message)
      throw cause
    }
  }

  async function pauseCompanion(durationMs?: number) {
    try {
      const nextRuntime = await proactiveCompanionStore.pauseCompanion({ durationMs })
      toast.success('\u4E3B\u52A8\u966A\u4F34\u5DF2\u6682\u505C\u3002')
      return nextRuntime
    }
    catch (cause) {
      const message = errorMessageFrom(cause) ?? 'Failed to pause proactive companion.'
      toast.error(message)
      throw cause
    }
  }

  async function clearCooldowns() {
    try {
      const nextRuntime = await proactiveCompanionStore.clearCooldowns()
      toast.success('\u51B7\u5374\u5DF2\u6E05\u96F6\u3002')
      return nextRuntime
    }
    catch (cause) {
      const message = errorMessageFrom(cause) ?? 'Failed to clear proactive cooldowns.'
      toast.error(message)
      throw cause
    }
  }

  async function refreshRuntime() {
    try {
      return await proactiveCompanionStore.refreshRuntime()
    }
    catch (cause) {
      const message = errorMessageFrom(cause) ?? 'Failed to refresh runtime.'
      toast.error(message)
      throw cause
    }
  }

  return {
    clearing,
    error,
    history,
    lastImportSummary,
    latestDecision,
    loading,
    refreshing,
    runtime,
    saving,
    settings,

    clearCooldowns,
    clearHistory,
    importLegacyConfig,
    pauseCompanion,
    refresh,
    refreshRuntime,
    save,
    setSourceMode,
    simulateSignal,
    triggerManualCheckIn,
  }
})
