import type {
  StartupDiagnosticsResult,
  SystemHealthSnapshot,
} from '../../../shared/system-health'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'

import {
  electronSystemHealthGetSnapshot,
  electronSystemHealthRefresh,
  electronSystemHealthRunStartupDiagnostics,
} from '../../../shared/eventa'
import { createDefaultSystemHealthSnapshot } from '../../../shared/system-health'

interface SystemHealthActionOptions {
  notify?: boolean
}

/**
 * Renderer bridge for the unified desktop system-health snapshot.
 *
 * Use when:
 * - Settings or diagnostics pages need the latest main-process health snapshot
 * - Renderer actions must trigger a refresh or startup diagnostics run
 *
 * Expects:
 * - Main-process Eventa handlers for the frozen system-health contracts are available
 *
 * Returns:
 * - Reactive snapshot, diagnostics result, and explicit async actions for the UI
 */
export const useSystemHealthSettingsStore = defineStore('tamagotchi-system-health-settings', () => {
  const invokeGetSnapshot = useElectronEventaInvoke(electronSystemHealthGetSnapshot)
  const invokeRefresh = useElectronEventaInvoke(electronSystemHealthRefresh)
  const invokeRunStartupDiagnostics = useElectronEventaInvoke(electronSystemHealthRunStartupDiagnostics)

  const snapshot = ref<SystemHealthSnapshot>(createDefaultSystemHealthSnapshot())
  const diagnostics = ref<StartupDiagnosticsResult>()

  const hasLoaded = ref(false)
  const loading = ref(false)
  const refreshing = ref(false)
  const runningStartupDiagnostics = ref(false)
  const startupDiagnosticsBootstrapped = ref(false)
  const startupAlertDismissed = ref(false)
  const lastError = ref<string | null>(null)
  const startupDiagnosticsFailureCount = computed(() => diagnostics.value?.failures.length ?? 0)
  const shouldShowStartupAlert = computed(() => {
    return startupDiagnosticsFailureCount.value > 0 && !startupAlertDismissed.value
  })

  function applySnapshot(nextSnapshot: SystemHealthSnapshot) {
    snapshot.value = nextSnapshot
  }

  function maybeToastError(message: string, options?: SystemHealthActionOptions) {
    if (options?.notify !== false) {
      toast.error(message)
    }
  }

  function maybeToastSuccess(message: string, options?: SystemHealthActionOptions) {
    if (options?.notify !== false) {
      toast.success(message)
    }
  }

  async function loadSnapshot(options?: SystemHealthActionOptions) {
    loading.value = true
    lastError.value = null

    try {
      applySnapshot(await invokeGetSnapshot())
    }
    catch (error) {
      const message = errorMessageFrom(error) ?? 'Failed to load system health snapshot.'
      lastError.value = message
      maybeToastError(message, options)
    }
    finally {
      hasLoaded.value = true
      loading.value = false
    }
  }

  async function refreshSnapshot(options?: SystemHealthActionOptions) {
    refreshing.value = true
    lastError.value = null

    try {
      const nextSnapshot = await invokeRefresh()
      applySnapshot(nextSnapshot)
      maybeToastSuccess('System health refreshed.', options)
      return nextSnapshot
    }
    catch (error) {
      const message = errorMessageFrom(error) ?? 'Failed to refresh system health.'
      lastError.value = message
      maybeToastError(message, options)
    }
    finally {
      hasLoaded.value = true
      refreshing.value = false
    }
  }

  async function runStartupDiagnostics(options?: SystemHealthActionOptions) {
    runningStartupDiagnostics.value = true
    lastError.value = null

    try {
      const result = await invokeRunStartupDiagnostics()
      diagnostics.value = result
      startupAlertDismissed.value = false
      applySnapshot(await invokeGetSnapshot())
      hasLoaded.value = true
      maybeToastSuccess('Startup diagnostics completed.', options)
      return result
    }
    catch (error) {
      const message = errorMessageFrom(error) ?? 'Failed to run startup diagnostics.'
      lastError.value = message
      maybeToastError(message, options)
    }
    finally {
      runningStartupDiagnostics.value = false
    }
  }

  async function ensureStartupDiagnostics() {
    if (startupDiagnosticsBootstrapped.value) {
      return diagnostics.value
    }

    startupDiagnosticsBootstrapped.value = true

    if (!hasLoaded.value) {
      await loadSnapshot({ notify: false })
    }

    if (!snapshot.value.startupPhase) {
      return diagnostics.value
    }

    return await runStartupDiagnostics({ notify: false })
  }

  function dismissStartupAlert() {
    startupAlertDismissed.value = true
  }

  return {
    diagnostics,
    dismissStartupAlert,
    ensureStartupDiagnostics,
    hasLoaded,
    lastError,
    loading,
    refreshing,
    runStartupDiagnostics,
    runningStartupDiagnostics,
    loadSnapshot,
    refreshSnapshot,
    snapshot,
    shouldShowStartupAlert,
    startupDiagnosticsFailureCount,
  }
})
