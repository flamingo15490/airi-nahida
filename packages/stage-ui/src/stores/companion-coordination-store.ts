import type {
  CompanionCoordinationSnapshot,
  CompanionCoordinationSurface,
} from './companion-coordination-shared'
import type { NahidaPersonaSnapshot } from './nahida-persona-shared'

import { errorMessageFrom } from '@moeru/std'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { composeCompanionCoordinationSupplement } from './companion-coordination'
import {
  composeCompanionCoordinationSnapshot,
  createDefaultCompanionCoordinationSnapshot,
} from './companion-coordination-shared'
import { useExternalMemoryStore } from './external-memory-store'
import { useNahidaPersonaStore } from './nahida-persona-store'
import { useProactiveCompanionStore } from './proactive-companion-store'

export interface CompanionCoordinationRefreshRequest {
  activeCardName?: string
  activeDisplayModelName?: string
}

export interface CompanionCoordinationSparkNotifyResult {
  snapshot: CompanionCoordinationSnapshot
  persona: NahidaPersonaSnapshot
}

/**
 * Runtime bridge implemented by desktop hosts to expose one shared phase-six
 * coordination snapshot and a tiny action surface.
 */
export interface CompanionCoordinationBridge {
  getSnapshot: (request?: CompanionCoordinationRefreshRequest) => Promise<CompanionCoordinationSnapshot>
  refresh: (request?: CompanionCoordinationRefreshRequest) => Promise<CompanionCoordinationSnapshot>
  clearHistory: (request?: CompanionCoordinationRefreshRequest) => Promise<CompanionCoordinationSnapshot>
  refreshForSparkNotify: (request?: CompanionCoordinationRefreshRequest) => Promise<CompanionCoordinationSparkNotifyResult>
}

const coordinationDetailRoutes = {
  memory: '/settings/integrations',
  persona: '/settings/nahida-persona',
  proactive: '/settings/proactive-companion',
} as const satisfies Record<CompanionCoordinationSurface, string>

function cloneSnapshot(snapshot: CompanionCoordinationSnapshot) {
  return {
    ...snapshot,
    reason: { ...snapshot.reason },
    surfaces: snapshot.surfaces.map(surface => ({
      ...surface,
      reason: { ...surface.reason },
      overview: { ...surface.overview },
    })),
  } satisfies CompanionCoordinationSnapshot
}

export const useCompanionCoordinationStore = defineStore('companion-coordination', () => {
  const externalMemoryStore = useExternalMemoryStore()
  const nahidaPersonaStore = useNahidaPersonaStore()
  const proactiveCompanionStore = useProactiveCompanionStore()

  const bridge = ref<CompanionCoordinationBridge>()
  const desktopSnapshot = ref<CompanionCoordinationSnapshot>()
  const refreshing = ref(false)
  const clearing = ref(false)
  const error = ref<string>()

  const fallbackSnapshot = computed(() => composeCompanionCoordinationSnapshot({
    memoryUsage: externalMemoryStore.usage,
    persona: nahidaPersonaStore.snapshot,
    proactiveRuntime: proactiveCompanionStore.runtime,
  }))

  const snapshot = computed(() => desktopSnapshot.value ?? fallbackSnapshot.value)
  const activeSupplement = computed(() => composeCompanionCoordinationSupplement(desktopSnapshot.value))
  const activeCardName = computed(() => nahidaPersonaStore.activeCardName)
  const activeDisplayModelName = computed(() => nahidaPersonaStore.activeDisplayModelName)

  function buildRefreshRequest(): CompanionCoordinationRefreshRequest {
    return {
      activeCardName: activeCardName.value,
      activeDisplayModelName: activeDisplayModelName.value,
    }
  }

  function setBridge(nextBridge: CompanionCoordinationBridge) {
    bridge.value = nextBridge
  }

  function detailRouteFor(surface: CompanionCoordinationSurface) {
    return coordinationDetailRoutes[surface]
  }

  async function refresh() {
    if (!bridge.value) {
      desktopSnapshot.value = cloneSnapshot(fallbackSnapshot.value)
      return snapshot.value
    }

    refreshing.value = true
    error.value = undefined

    try {
      desktopSnapshot.value = await bridge.value.refresh(buildRefreshRequest())
      return snapshot.value
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to refresh coordination snapshot.'
      throw cause
    }
    finally {
      refreshing.value = false
    }
  }

  async function getSnapshot() {
    if (!bridge.value) {
      desktopSnapshot.value = cloneSnapshot(fallbackSnapshot.value)
      return snapshot.value
    }

    refreshing.value = true
    error.value = undefined

    try {
      desktopSnapshot.value = await bridge.value.getSnapshot(buildRefreshRequest())
      return snapshot.value
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to load coordination snapshot.'
      throw cause
    }
    finally {
      refreshing.value = false
    }
  }

  async function clearHistory() {
    if (!bridge.value) {
      desktopSnapshot.value = cloneSnapshot(createDefaultCompanionCoordinationSnapshot())
      return snapshot.value
    }

    clearing.value = true
    error.value = undefined

    try {
      desktopSnapshot.value = await bridge.value.clearHistory(buildRefreshRequest())
      return snapshot.value
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to clear coordination history.'
      throw cause
    }
    finally {
      clearing.value = false
    }
  }

  async function refreshForSparkNotify() {
    if (!bridge.value) {
      desktopSnapshot.value = cloneSnapshot(fallbackSnapshot.value)
      return {
        snapshot: snapshot.value,
        persona: nahidaPersonaStore.snapshot,
      } satisfies CompanionCoordinationSparkNotifyResult
    }

    refreshing.value = true
    error.value = undefined

    try {
      const result = await bridge.value.refreshForSparkNotify(buildRefreshRequest())
      desktopSnapshot.value = result.snapshot
      return result
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to refresh coordination snapshot for spark:notify.'
      throw cause
    }
    finally {
      refreshing.value = false
    }
  }

  return {
    clearing,
    error,
    refreshing,
    activeSupplement,
    snapshot,

    clearHistory,
    detailRouteFor,
    getSnapshot,
    refresh,
    refreshForSparkNotify,
    setBridge,
  }
})
