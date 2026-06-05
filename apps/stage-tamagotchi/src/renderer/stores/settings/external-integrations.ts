import type {
  ExternalCompanionSidecarConfig,
  ExternalIntegrationImportResult,
  ExternalIntegrationKind,
  ExternalIntegrationSnapshot,
  ExternalMemoryIntegrationConfig,
} from '../../../shared/external-integrations'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'

import {
  electronAppOpenUserDataFolder,
  electronExternalIntegrationsGetSnapshots,
  electronExternalIntegrationsImportLegacyMcp,
  electronExternalIntegrationsProbeNow,
  electronExternalIntegrationsSaveConfig,
} from '../../../shared/eventa'
import { createDefaultExternalIntegrationConfigFile } from '../../../shared/external-integrations'

const defaultConfigFile = createDefaultExternalIntegrationConfigFile()

export const useExternalIntegrationsSettingsStore = defineStore('tamagotchi-external-integrations-settings', () => {
  const invokeGetSnapshots = useElectronEventaInvoke(electronExternalIntegrationsGetSnapshots)
  const invokeImportLegacyMcp = useElectronEventaInvoke(electronExternalIntegrationsImportLegacyMcp)
  const invokeSaveConfig = useElectronEventaInvoke(electronExternalIntegrationsSaveConfig)
  const invokeProbeNow = useElectronEventaInvoke(electronExternalIntegrationsProbeNow)
  const invokeOpenUserDataFolder = useElectronEventaInvoke(electronAppOpenUserDataFolder)

  const memorySnapshot = ref<ExternalIntegrationSnapshot>()
  const sidecarSnapshot = ref<ExternalIntegrationSnapshot>()

  const memoryConfig = ref<ExternalMemoryIntegrationConfig>(structuredClone(defaultConfigFile.integrations.memory))
  const sidecarConfig = ref<ExternalCompanionSidecarConfig>(structuredClone(defaultConfigFile.integrations['companion-sidecar']))

  const memorySavedSignature = ref(JSON.stringify(memoryConfig.value))
  const sidecarSavedSignature = ref(JSON.stringify(sidecarConfig.value))

  const loading = ref(false)
  const importingLegacyProfile = ref(false)
  const lastError = ref<string | null>(null)
  const lastImportResult = ref<ExternalIntegrationImportResult>()
  const savingKind = ref<ExternalIntegrationKind | null>(null)
  const probingKind = ref<ExternalIntegrationKind | null>(null)

  function applySnapshot(snapshot: ExternalIntegrationSnapshot) {
    if (snapshot.kind === 'memory') {
      memorySnapshot.value = snapshot
      memoryConfig.value = structuredClone(snapshot.config as ExternalMemoryIntegrationConfig)
      memorySavedSignature.value = JSON.stringify(memoryConfig.value)
      return
    }

    sidecarSnapshot.value = snapshot
    sidecarConfig.value = structuredClone(snapshot.config as ExternalCompanionSidecarConfig)
    sidecarSavedSignature.value = JSON.stringify(sidecarConfig.value)
  }

  function applySnapshots(snapshots: ExternalIntegrationSnapshot[]) {
    for (const snapshot of snapshots) {
      applySnapshot(snapshot)
    }
  }

  const memoryStatus = computed(() => memorySnapshot.value?.status)
  const sidecarStatus = computed(() => sidecarSnapshot.value?.status)
  const memoryLastProbe = computed(() => memorySnapshot.value?.lastProbe)
  const sidecarLastProbe = computed(() => sidecarSnapshot.value?.lastProbe)

  const memoryDirty = computed(() => JSON.stringify(memoryConfig.value) !== memorySavedSignature.value)
  const sidecarDirty = computed(() => JSON.stringify(sidecarConfig.value) !== sidecarSavedSignature.value)

  async function refresh() {
    loading.value = true
    lastError.value = null

    try {
      applySnapshots(await invokeGetSnapshots())
    }
    catch (error) {
      const message = errorMessageFrom(error) ?? 'Failed to load external integrations'
      lastError.value = message
      toast.error(message)
    }
    finally {
      loading.value = false
    }
  }

  async function save(kind: ExternalIntegrationKind) {
    savingKind.value = kind
    lastError.value = null

    try {
      const payload = kind === 'memory'
        ? {
            ...memoryConfig.value,
            rootPath: memoryConfig.value.rootPath.trim(),
            filesystemServerName: memoryConfig.value.filesystemServerName.trim(),
            obsidianServerName: memoryConfig.value.obsidianServerName?.trim() || undefined,
          }
        : {
            ...sidecarConfig.value,
            moduleName: sidecarConfig.value.moduleName.trim(),
            pluginId: sidecarConfig.value.pluginId.trim(),
            expectedWsUrl: sidecarConfig.value.expectedWsUrl?.trim() || undefined,
          }

      const snapshot = await invokeSaveConfig(payload)
      applySnapshot(snapshot)
      toast.success(kind === 'memory' ? 'Memory integration saved.' : 'Companion sidecar integration saved.')
      return snapshot
    }
    catch (error) {
      const message = errorMessageFrom(error) ?? 'Failed to save external integration'
      lastError.value = message
      toast.error(message)
      throw error
    }
    finally {
      savingKind.value = null
    }
  }

  async function probeNow(kind: ExternalIntegrationKind) {
    if ((kind === 'memory' && memoryDirty.value) || (kind === 'companion-sidecar' && sidecarDirty.value)) {
      toast.error('Save changes before running a probe.')
      return
    }

    probingKind.value = kind
    lastError.value = null

    try {
      const snapshot = await invokeProbeNow({ kind })
      applySnapshot(snapshot)
      return snapshot
    }
    catch (error) {
      const message = errorMessageFrom(error) ?? 'Failed to probe external integration'
      lastError.value = message
      toast.error(message)
      throw error
    }
    finally {
      probingKind.value = null
    }
  }

  async function openUserDataFolder() {
    await invokeOpenUserDataFolder()
  }

  async function importLegacyMcp() {
    importingLegacyProfile.value = true
    lastError.value = null

    try {
      const result = await invokeImportLegacyMcp()
      lastImportResult.value = result
      applySnapshots(result.snapshots)
      toast.success('Imported MCP config from the current AIRI desktop profile.')
      return result
    }
    catch (error) {
      const message = errorMessageFrom(error) ?? 'Failed to import the current AIRI desktop MCP config'
      lastError.value = message
      toast.error(message)
      throw error
    }
    finally {
      importingLegacyProfile.value = false
    }
  }

  return {
    importLegacyMcp,
    importingLegacyProfile,
    lastError,
    lastImportResult,
    loading,
    memoryConfig,
    memoryDirty,
    memoryLastProbe,
    memoryStatus,
    openUserDataFolder,
    probeNow,
    probingKind,
    refresh,
    save,
    savingKind,
    sidecarConfig,
    sidecarDirty,
    sidecarLastProbe,
    sidecarStatus,
  }
})
