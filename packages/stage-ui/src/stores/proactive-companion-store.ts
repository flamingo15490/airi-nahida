import type { WebSocketEventOf } from '@proj-airi/server-sdk'

import type {
  ProactiveCompanionActionResult,
  ProactiveCompanionEvaluateResult,
  ProactiveCompanionLegacyImportSummary,
  ProactiveCompanionRuntimeSnapshot,
  ProactiveCompanionSettings,
  ProactiveCompanionSimulationRequest,
  ProactiveCompanionSourceMode,
  ProactiveCompanionVisionObservation,
} from './proactive-companion-shared'

import { errorMessageFrom } from '@moeru/std'
import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'

import {
  createDefaultProactiveCompanionRuntimeSnapshot,
  createDefaultProactiveCompanionSettings,
} from './proactive-companion-shared'

/**
 * Runtime bridge implemented by desktop hosts to govern proactive reminders.
 */
export interface ProactiveCompanionBridge {
  loadConfig: () => Promise<ProactiveCompanionSettings>
  saveConfig: (settings: ProactiveCompanionSettings) => Promise<ProactiveCompanionSettings>
  getRuntimeSnapshot: () => Promise<ProactiveCompanionRuntimeSnapshot>
  refreshRuntime: () => Promise<ProactiveCompanionRuntimeSnapshot>
  clearHistory: () => Promise<ProactiveCompanionRuntimeSnapshot>
  evaluateSparkNotify: (event: WebSocketEventOf<'spark:notify'>) => Promise<ProactiveCompanionEvaluateResult>
  recordContextUpdate: (event: WebSocketEventOf<'context:update'>) => Promise<ProactiveCompanionRuntimeSnapshot>
  importLegacyConfig: () => Promise<ProactiveCompanionLegacyImportSummary>
  getSourceMode: () => Promise<ProactiveCompanionSourceMode>
  setSourceMode: (mode: ProactiveCompanionSourceMode) => Promise<ProactiveCompanionRuntimeSnapshot>
  triggerManualCheckIn: () => Promise<ProactiveCompanionActionResult>
  simulateSignal: (request: ProactiveCompanionSimulationRequest) => Promise<ProactiveCompanionActionResult>
  pauseCompanion: (request?: { durationMs?: number }) => Promise<ProactiveCompanionRuntimeSnapshot>
  clearCooldowns: () => Promise<ProactiveCompanionRuntimeSnapshot>
  recordVisionObservation: (observation: ProactiveCompanionVisionObservation) => Promise<ProactiveCompanionActionResult>
}

export const useProactiveCompanionStore = defineStore('proactive-companion', () => {
  const bridge = ref<ProactiveCompanionBridge>()
  const settings = ref<ProactiveCompanionSettings>(createDefaultProactiveCompanionSettings())
  const runtime = ref<ProactiveCompanionRuntimeSnapshot>(createDefaultProactiveCompanionRuntimeSnapshot())
  const lastImportSummary = ref<ProactiveCompanionLegacyImportSummary>()
  const loading = ref(false)
  const saving = ref(false)
  const refreshing = ref(false)
  const evaluating = ref(false)
  const clearing = ref(false)
  const error = ref<string>()

  const isBridgeAvailable = computed(() => Boolean(bridge.value))
  const history = computed(() => runtime.value.recentDecisions)
  const latestDecision = computed(() => runtime.value.lastDecision)
  const latestDeliveredDecision = computed(() => history.value.find(decision => decision.decision === 'delivered'))
  const latestCooldownDecision = computed(() => history.value.find(decision => typeof decision.cooldownUntil === 'number'))
  const currentCooldownUntil = computed(() => {
    const cooldownUntil = latestCooldownDecision.value?.cooldownUntil
    if (!cooldownUntil || cooldownUntil <= Date.now()) {
      return undefined
    }

    return cooldownUntil
  })
  const latestLegacyDecision = computed(() => history.value.find(decision => decision.event.source.startsWith('legacy:')))
  const sourceMode = computed(() => runtime.value.settings.sourceMode)

  function setBridge(nextBridge: ProactiveCompanionBridge) {
    bridge.value = nextBridge
  }

  function applySettings(nextSettings: ProactiveCompanionSettings) {
    settings.value = {
      ...createDefaultProactiveCompanionSettings(),
      ...nextSettings,
    }
  }

  function applyRuntimeSnapshot(nextRuntime: ProactiveCompanionRuntimeSnapshot) {
    runtime.value = {
      ...createDefaultProactiveCompanionRuntimeSnapshot(),
      ...nextRuntime,
      settings: {
        ...createDefaultProactiveCompanionSettings(),
        ...nextRuntime.settings,
      },
    }
    applySettings(runtime.value.settings)
  }

  async function withBridge<T>(run: (activeBridge: ProactiveCompanionBridge) => Promise<T>) {
    if (!bridge.value) {
      throw new Error('Proactive companion bridge is not available in this runtime.')
    }

    return await run(bridge.value)
  }

  async function refreshConfig() {
    loading.value = true
    error.value = undefined

    try {
      applySettings(await withBridge(activeBridge => activeBridge.loadConfig()))
      return settings.value
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to load proactive companion settings.'
      throw cause
    }
    finally {
      loading.value = false
    }
  }

  async function saveConfig() {
    saving.value = true
    error.value = undefined

    try {
      const nextSettings = structuredClone(toRaw(settings.value))
      applySettings(await withBridge(activeBridge => activeBridge.saveConfig(nextSettings)))
      return settings.value
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to save proactive companion settings.'
      throw cause
    }
    finally {
      saving.value = false
    }
  }

  async function getRuntimeSnapshot() {
    refreshing.value = true
    error.value = undefined

    try {
      applyRuntimeSnapshot(await withBridge(activeBridge => activeBridge.getRuntimeSnapshot()))
      return runtime.value
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to load proactive companion runtime state.'
      throw cause
    }
    finally {
      refreshing.value = false
    }
  }

  async function refreshRuntime() {
    refreshing.value = true
    error.value = undefined

    try {
      applyRuntimeSnapshot(await withBridge(activeBridge => activeBridge.refreshRuntime()))
      return runtime.value
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to refresh proactive companion runtime state.'
      throw cause
    }
    finally {
      refreshing.value = false
    }
  }

  async function clearHistory() {
    clearing.value = true
    error.value = undefined

    try {
      applyRuntimeSnapshot(await withBridge(activeBridge => activeBridge.clearHistory()))
      return runtime.value
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to clear proactive companion history.'
      throw cause
    }
    finally {
      clearing.value = false
    }
  }

  async function evaluateSparkNotify(event: WebSocketEventOf<'spark:notify'>) {
    if (!bridge.value) {
      return {
        managed: false,
        runtime: runtime.value,
      } satisfies ProactiveCompanionEvaluateResult
    }

    evaluating.value = true
    error.value = undefined

    try {
      const result = await bridge.value.evaluateSparkNotify(event)
      applyRuntimeSnapshot(result.runtime)
      return result
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to evaluate proactive companion event.'
      throw cause
    }
    finally {
      evaluating.value = false
    }
  }

  async function recordContextUpdate(event: WebSocketEventOf<'context:update'>) {
    if (!bridge.value) {
      return runtime.value
    }

    refreshing.value = true
    error.value = undefined

    try {
      const nextRuntime = await bridge.value.recordContextUpdate(event)
      applyRuntimeSnapshot(nextRuntime)
      return nextRuntime
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to record proactive companion context update.'
      throw cause
    }
    finally {
      refreshing.value = false
    }
  }

  async function importLegacyConfig() {
    const summary = await withBridge(activeBridge => activeBridge.importLegacyConfig())
    lastImportSummary.value = summary
    applySettings(summary.settings)
    await getRuntimeSnapshot()
    return summary
  }

  async function getSourceMode() {
    const nextSourceMode = await withBridge(activeBridge => activeBridge.getSourceMode())
    settings.value.sourceMode = nextSourceMode
    runtime.value.settings.sourceMode = nextSourceMode
    return nextSourceMode
  }

  async function setSourceMode(mode: ProactiveCompanionSourceMode) {
    applyRuntimeSnapshot(await withBridge(activeBridge => activeBridge.setSourceMode(mode)))
    return runtime.value
  }

  async function triggerManualCheckIn() {
    const result = await withBridge(activeBridge => activeBridge.triggerManualCheckIn())
    applyRuntimeSnapshot(result.runtime)
    return result
  }

  async function simulateSignal(request: ProactiveCompanionSimulationRequest) {
    const result = await withBridge(activeBridge => activeBridge.simulateSignal(request))
    applyRuntimeSnapshot(result.runtime)
    return result
  }

  async function pauseCompanion(request?: { durationMs?: number }) {
    applyRuntimeSnapshot(await withBridge(activeBridge => activeBridge.pauseCompanion(request)))
    return runtime.value
  }

  async function clearCooldowns() {
    applyRuntimeSnapshot(await withBridge(activeBridge => activeBridge.clearCooldowns()))
    return runtime.value
  }

  async function recordVisionObservation(observation: ProactiveCompanionVisionObservation) {
    const result = await withBridge(activeBridge => activeBridge.recordVisionObservation(observation))
    applyRuntimeSnapshot(result.runtime)
    return result
  }

  return {
    clearing,
    currentCooldownUntil,
    error,
    evaluating,
    history,
    isBridgeAvailable,
    lastImportSummary,
    latestCooldownDecision,
    latestDecision,
    latestDeliveredDecision,
    latestLegacyDecision,
    loading,
    refreshing,
    runtime,
    saving,
    settings,
    sourceMode,

    applyRuntimeSnapshot,
    clearCooldowns,
    clearHistory,
    evaluateSparkNotify,
    getRuntimeSnapshot,
    getSourceMode,
    importLegacyConfig,
    pauseCompanion,
    recordContextUpdate,
    recordVisionObservation,
    refreshConfig,
    refreshRuntime,
    saveConfig,
    setBridge,
    setSourceMode,
    simulateSignal,
    triggerManualCheckIn,
  }
})
