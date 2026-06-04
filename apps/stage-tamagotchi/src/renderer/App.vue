<script setup lang="ts">
import { defineInvokeHandler } from '@moeru/eventa'
import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { themeColorFromValue, useThemeColor } from '@proj-airi/stage-layouts/composables/theme-color'
import { artistrySyncConfig } from '@proj-airi/stage-shared'
import { ToasterRoot } from '@proj-airi/stage-ui/components'
import { useInferencePreload } from '@proj-airi/stage-ui/composables'
import { useSharedAnalyticsStore } from '@proj-airi/stage-ui/stores/analytics'
import { useCharacterOrchestratorStore } from '@proj-airi/stage-ui/stores/character'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useCompanionCoordinationStore } from '@proj-airi/stage-ui/stores/companion-coordination-store'
import { usePluginHostInspectorStore } from '@proj-airi/stage-ui/stores/devtools/plugin-host-debug'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useExternalMemoryStore } from '@proj-airi/stage-ui/stores/external-memory-store'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { useContextBridgeStore } from '@proj-airi/stage-ui/stores/mods/api/context-bridge'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { useNahidaPersonaStore } from '@proj-airi/stage-ui/stores/nahida-persona-store'
import { usePerfTracerBridgeStore } from '@proj-airi/stage-ui/stores/perf-tracer-bridge'
import { listProvidersForPluginHost, shouldPublishPluginHostCapabilities } from '@proj-airi/stage-ui/stores/plugin-host-capabilities'
import { useProactiveCompanionStore } from '@proj-airi/stage-ui/stores/proactive-companion-store'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { useTheme } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { toast, Toaster } from 'vue-sonner'

import ResizeHandler from './components/ResizeHandler.vue'

import {
  electronCompanionCoordinationClearHistory,
  electronCompanionCoordinationGetSnapshot,
  electronCompanionCoordinationRefresh,
  electronCompanionCoordinationRefreshForSparkNotify,
  electronExternalMemoryGetLastUsage,
  electronExternalMemoryLoadContext,
  electronExternalMemoryRefreshContext,
  electronExternalMemoryWriteFollowUpItems,
  electronExternalMemoryWritePreferencesPatch,
  electronExternalMemoryWriteRecentSummary,
  electronExternalMemoryWriteUserProfilePatch,
  electronGetServerChannelConfig,
  electronGodotStageGetStatus,
  electronGodotStageStatusChanged,
  electronNahidaPersonaGetConfig,
  electronNahidaPersonaSaveConfig,
  electronProactiveCompanionClearHistory,
  electronProactiveCompanionEvaluateSparkNotify,
  electronProactiveCompanionGetRuntimeSnapshot,
  electronProactiveCompanionLoadConfig,
  electronProactiveCompanionRecordContextUpdate,
  electronProactiveCompanionRefreshRuntime,
  electronProactiveCompanionSaveConfig,
  electronSettingsNavigate,
  electronStartTrackMousePosition,
  i18nGetLocale,
  i18nSetLocale,
} from '../shared/eventa'
import {
  electronPluginUpdateCapability,
  pluginProtocolListProviders,
  pluginProtocolListProvidersEventName,
} from '../shared/eventa/plugin/capabilities'
import {
  electronPluginInspect,
  electronPluginList,
  electronPluginLoad,
  electronPluginLoadEnabled,
  electronPluginSetAutoReload,
  electronPluginSetEnabled,
  electronPluginUnload,
} from '../shared/eventa/plugin/host'
import { initializeElectronAuthCallbackBridge } from './bridges/electron-auth-callback'
import { initializeStageThreeRuntimeTraceBridge } from './bridges/stage-three-runtime-trace'
import { useLanguage } from './composables/use-language'
import { useVisionRunner } from './composables/use-vision-runner'
import { createChatSyncWindowLifecycle } from './stores/chat-sync-lifecycle'
import { useTamagotchiMcpToolsStore } from './stores/mcp-tools'
import { useTamagotchiPluginToolsStore } from './stores/plugin-tools'
import { useServerChannelSettingsStore } from './stores/settings/server-channel'
import { useStageWindowLifecycleStore } from './stores/stage-window-lifecycle'

const { isDark: dark } = useTheme()
const contextBridgeStore = useContextBridgeStore()
const displayModelsStore = useDisplayModelsStore()
const settingsStore = useSettings()
const { language, themeColorsHue, themeColorsHueDynamic } = storeToRefs(settingsStore)
const serverChannelSettingsStore = useServerChannelSettingsStore()
const router = useRouter()
const route = useRoute()
const cardStore = useAiriCardStore()
const chatSessionStore = useChatSessionStore()
const serverChannelStore = useModsServerChannelStore()
const characterOrchestratorStore = useCharacterOrchestratorStore()
const analyticsStore = useSharedAnalyticsStore()
const coordinationStore = useCompanionCoordinationStore()
const inferencePreload = useInferencePreload()
const pluginHostInspectorStore = usePluginHostInspectorStore()
const nahidaPersonaStore = useNahidaPersonaStore()
const externalMemoryStore = useExternalMemoryStore()
const proactiveCompanionStore = useProactiveCompanionStore()
const mcpToolsStore = useTamagotchiMcpToolsStore()
const pluginToolsStore = useTamagotchiPluginToolsStore()
const stageWindowLifecycleStore = useStageWindowLifecycleStore()
const settingsAudioDeviceStore = useSettingsAudioDevice()
const artistryStore = useArtistryStore()
const visionStore = useVisionStore()
const visionRunner = useVisionRunner()
const { activeProvider, artistryGlobals, activeModel, defaultPromptPrefix, providerOptions } = storeToRefs(artistryStore)
const { autoRun: visionAutoRun, configured: visionConfigured } = storeToRefs(visionStore)
const context = useElectronEventaContext()
usePerfTracerBridgeStore()
initializeStageThreeRuntimeTraceBridge()
initializeElectronAuthCallbackBridge()
void stageWindowLifecycleStore.initializeWindowLifecycleBridge()
const getServerChannelConfig = useElectronEventaInvoke(electronGetServerChannelConfig)
const listPlugins = useElectronEventaInvoke(electronPluginList)
const setPluginEnabled = useElectronEventaInvoke(electronPluginSetEnabled)
const setPluginAutoReload = useElectronEventaInvoke(electronPluginSetAutoReload)
const loadEnabledPlugins = useElectronEventaInvoke(electronPluginLoadEnabled)
const loadPlugin = useElectronEventaInvoke(electronPluginLoad)
const unloadPlugin = useElectronEventaInvoke(electronPluginUnload)
const inspectPluginHost = useElectronEventaInvoke(electronPluginInspect)
const startTrackingCursorPoint = useElectronEventaInvoke(electronStartTrackMousePosition)
const getNahidaPersonaConfig = useElectronEventaInvoke(electronNahidaPersonaGetConfig)
const saveNahidaPersonaConfig = useElectronEventaInvoke(electronNahidaPersonaSaveConfig)
const loadExternalMemoryContext = useElectronEventaInvoke(electronExternalMemoryLoadContext)
const refreshExternalMemoryContext = useElectronEventaInvoke(electronExternalMemoryRefreshContext)
const getExternalMemoryUsage = useElectronEventaInvoke(electronExternalMemoryGetLastUsage)
const writeExternalMemoryRecentSummary = useElectronEventaInvoke(electronExternalMemoryWriteRecentSummary)
const writeExternalMemoryFollowUpItems = useElectronEventaInvoke(electronExternalMemoryWriteFollowUpItems)
const writeExternalMemoryUserProfilePatch = useElectronEventaInvoke(electronExternalMemoryWriteUserProfilePatch)
const writeExternalMemoryPreferencesPatch = useElectronEventaInvoke(electronExternalMemoryWritePreferencesPatch)
const getCompanionCoordinationSnapshot = useElectronEventaInvoke(electronCompanionCoordinationGetSnapshot)
const refreshCompanionCoordinationSnapshot = useElectronEventaInvoke(electronCompanionCoordinationRefresh)
const clearCompanionCoordinationHistory = useElectronEventaInvoke(electronCompanionCoordinationClearHistory)
const refreshCompanionCoordinationForSparkNotify = useElectronEventaInvoke(electronCompanionCoordinationRefreshForSparkNotify)
const loadProactiveCompanionConfig = useElectronEventaInvoke(electronProactiveCompanionLoadConfig)
const saveProactiveCompanionConfig = useElectronEventaInvoke(electronProactiveCompanionSaveConfig)
const getProactiveCompanionRuntimeSnapshot = useElectronEventaInvoke(electronProactiveCompanionGetRuntimeSnapshot)
const refreshProactiveCompanionRuntime = useElectronEventaInvoke(electronProactiveCompanionRefreshRuntime)
const clearProactiveCompanionHistory = useElectronEventaInvoke(electronProactiveCompanionClearHistory)
const evaluateProactiveCompanionSparkNotify = useElectronEventaInvoke(electronProactiveCompanionEvaluateSparkNotify)
const recordProactiveCompanionContextUpdate = useElectronEventaInvoke(electronProactiveCompanionRecordContextUpdate)
const reportPluginCapability = useElectronEventaInvoke(electronPluginUpdateCapability)
const getMainLocale = useElectronEventaInvoke(i18nGetLocale)
const setLocale = useElectronEventaInvoke(i18nSetLocale)
const getGodotStageStatus = useElectronEventaInvoke(electronGodotStageGetStatus)
const syncArtistryConfig = useElectronEventaInvoke(artistrySyncConfig)
const chatSyncLifecycle = createChatSyncWindowLifecycle(route.path)
const isChatWindowRoute = () => route.path === '/chat'
const isGodotStageRoute = () => route.path === '/' || route.path.startsWith('/settings')
const isVisionOwnerRoute = () => route.path === '/'
const isWidgetsWindowRoute = () => route.path === '/widgets'

async function recordProactiveCompanionContextUpdates(
  updates: Array<Record<string, unknown>> | undefined,
  parentEventId?: string,
) {
  if (!updates?.length) {
    return
  }

  for (const [index, update] of updates.entries()) {
    if (!update || typeof update !== 'object') {
      continue
    }

    const metadata = 'metadata' in update && update.metadata && typeof update.metadata === 'object'
      ? update.metadata as Record<string, unknown>
      : undefined

    if (metadata?.module !== 'proactive-companion') {
      continue
    }

    try {
      await proactiveCompanionStore.recordContextUpdate({
        type: 'context:update',
        metadata: parentEventId
          ? {
              event: {
                id: `${parentEventId}:${index}`,
                parentId: parentEventId,
              },
            }
          : undefined,
        data: {
          id: typeof update.id === 'string' ? update.id : `proactive-context-update:${index}`,
          contextId: typeof update.contextId === 'string' ? update.contextId : `proactive-context-update:${index}`,
          strategy: update.strategy as never,
          lane: typeof update.lane === 'string' ? update.lane : undefined,
          text: typeof update.text === 'string' ? update.text : '',
          destinations: Array.isArray(update.destinations) ? update.destinations as string[] : undefined,
          metadata,
        },
      })
    }
    catch (error) {
      console.warn('[App] Failed to record proactive companion context update from input:text:', error)
    }
  }
}

function syncGodotStageRenderer(state: { state: 'stopped' | 'starting' | 'running' | 'stopping' | 'error' }) {
  if (state.state === 'running') {
    settingsStore.setStageModelRenderer('godot')
    return
  }

  if ((state.state === 'stopped' || state.state === 'error') && settingsStore.stageModelRenderer === 'godot')
    settingsStore.restoreBuiltInStageModelRenderer()
}

async function refreshPluginRuntimeTools() {
  try {
    await pluginToolsStore.refresh()
  }
  catch (error) {
    console.warn('[App] Failed to refresh plugin runtime tools:', error)
  }
}

async function startBackgroundVisionIfEnabled() {
  if (isChatWindowRoute() || isWidgetsWindowRoute() || !isVisionOwnerRoute() || !visionRunner.isOwnerWindow.value) {
    return
  }

  await visionRunner.initializeSources()
  if (!visionAutoRun.value || !visionConfigured.value || !visionRunner.hasPermissions.value || !visionRunner.activeSourceId.value) {
    return
  }

  const started = await visionRunner.startCaptureLoop()
  if (!started && visionRunner.errorMessage.value) {
    console.warn('[App] Failed to auto-start vision runner:', visionRunner.errorMessage.value)
  }
}

watch(() => route.path, () => {
  contextBridgeStore.setSparkNotifyHostRole(isWidgetsWindowRoute() ? 'client' : 'main')
}, { immediate: true })

// NOTICE: register plugin host bridge during setup to avoid race with pages using it in immediate watchers.
pluginHostInspectorStore.setBridge({
  list: () => listPlugins(),
  setEnabled: async (payload) => {
    const result = await setPluginEnabled(payload)
    await refreshPluginRuntimeTools()
    return result
  },
  setAutoReload: payload => setPluginAutoReload(payload),
  loadEnabled: async () => {
    const result = await loadEnabledPlugins()
    await refreshPluginRuntimeTools()
    return result
  },
  load: async (payload) => {
    const result = await loadPlugin(payload)
    await refreshPluginRuntimeTools()
    return result
  },
  unload: async (payload) => {
    const result = await unloadPlugin(payload)
    await refreshPluginRuntimeTools()
    return result
  },
  inspect: () => inspectPluginHost(),
})

nahidaPersonaStore.setBridge({
  getConfig: () => getNahidaPersonaConfig(),
  saveConfig: settings => saveNahidaPersonaConfig(settings),
})

externalMemoryStore.setBridge({
  loadMemoryContext: request => loadExternalMemoryContext(request),
  refreshMemoryContext: request => refreshExternalMemoryContext(request),
  getLastMemoryUsage: () => getExternalMemoryUsage(),
  writeRecentSummary: request => writeExternalMemoryRecentSummary(request),
  writeFollowUpItems: request => writeExternalMemoryFollowUpItems(request),
  writeUserProfilePatch: request => writeExternalMemoryUserProfilePatch(request),
  writePreferencesPatch: request => writeExternalMemoryPreferencesPatch(request),
})

proactiveCompanionStore.setBridge({
  loadConfig: () => loadProactiveCompanionConfig(),
  saveConfig: settings => saveProactiveCompanionConfig(settings),
  getRuntimeSnapshot: () => getProactiveCompanionRuntimeSnapshot(),
  refreshRuntime: () => refreshProactiveCompanionRuntime(),
  clearHistory: () => clearProactiveCompanionHistory(),
  evaluateSparkNotify: event => evaluateProactiveCompanionSparkNotify(event),
  recordContextUpdate: event => recordProactiveCompanionContextUpdate(event),
})

coordinationStore.setBridge({
  getSnapshot: request => getCompanionCoordinationSnapshot(request),
  refresh: request => refreshCompanionCoordinationSnapshot(request),
  clearHistory: request => clearCompanionCoordinationHistory(request),
  refreshForSparkNotify: request => refreshCompanionCoordinationForSparkNotify(request),
})

// NOTICE: Runtime tool stores must register during setup so renderer consumers can see them
// before `onMounted()` finishes the rest of the startup flow.
void mcpToolsStore.refresh().catch((error) => {
  console.warn('[App] Failed to refresh MCP runtime tools:', error)
})
void refreshPluginRuntimeTools()

const { restore: restoreLocale } = useLanguage(language, getMainLocale, setLocale)

watch([activeProvider, artistryGlobals, activeModel, defaultPromptPrefix, providerOptions], () => {
  if (activeProvider.value) {
    void syncArtistryConfig({
      provider: activeProvider.value as string,
      globals: JSON.parse(JSON.stringify(artistryGlobals.value)),
      model: activeModel.value,
      promptPrefix: defaultPromptPrefix.value,
      options: providerOptions.value,
    })
  }
}, { deep: true, immediate: true })

const { updateThemeColor } = useThemeColor(themeColorFromValue({ light: 'rgb(255 255 255)', dark: 'rgb(18 18 18)' }))
watch(dark, () => updateThemeColor(), { immediate: true })
watch(route, () => updateThemeColor(), { immediate: true })
onMounted(() => updateThemeColor())
onMounted(() => {
  void proactiveCompanionStore.refreshConfig().catch(() => {})
  void proactiveCompanionStore.refreshRuntime().catch(() => {})
  void coordinationStore.getSnapshot().catch(() => {})
})

context.value.on(electronSettingsNavigate, (event) => {
  const targetRoute = event?.body?.route
  if (!targetRoute || route.fullPath === targetRoute) {
    return
  }

  void router.push(targetRoute).catch((error) => {
    console.warn('Failed to navigate settings window:', error)
  })
})

context.value.on(electronGodotStageStatusChanged, (event) => {
  if (!event.body) {
    return
  }

  syncGodotStageRenderer(event.body)
})

onMounted(async () => {
  chatSyncLifecycle.initialize()

  // NOTICE: Issue #1658
  // When Electron restarts, renderer localStorage may not be flushed to disk.
  // The store's onMounted hook falls back to navigator.language, which triggers
  // watch(language) and overwrites the main-process config with the OS locale.
  // We must restore the correct locale from main process before allowing sync.
  // https://github.com/moeru-ai/airi/issues/1658
  await restoreLocale()

  analyticsStore.initialize()
  await nahidaPersonaStore.refresh().catch((error) => {
    console.warn('[App] Failed to refresh Nahida persona settings:', error)
  })
  await displayModelsStore.initialize()
  cardStore.initialize()
  await externalMemoryStore.refreshUsage().catch((error) => {
    console.warn('[App] Failed to fetch external memory usage:', error)
  })

  await chatSessionStore.initialize()
  await displayModelsStore.loadDisplayModelsFromIndexedDB()
  await settingsStore.initializeStageModel()
  await settingsAudioDeviceStore.initialize()
  await externalMemoryStore.refreshContext().catch((error) => {
    console.warn('[App] Failed to refresh external memory context:', error)
  })
  await coordinationStore.refresh().catch((error) => {
    console.warn('[App] Failed to refresh coordination snapshot:', error)
  })

  if (isGodotStageRoute()) {
    try {
      syncGodotStageRenderer(await getGodotStageStatus())
    }
    catch (error) {
      console.warn('[App] Failed to fetch Godot stage status:', error)
    }
  }

  const serverChannelConfig = await getServerChannelConfig()
  serverChannelSettingsStore.tlsConfig = serverChannelConfig.tlsConfig ?? null
  serverChannelSettingsStore.hostname = serverChannelConfig.hostname
  serverChannelSettingsStore.authToken = serverChannelConfig.authToken

  await serverChannelStore.initialize({
    token: serverChannelConfig.authToken || undefined,
    possibleEvents: ['ui:configure'],
  }).catch(err => console.error('Failed to initialize Mods Server Channel in App.vue:', err))
  serverChannelStore.onContextUpdate(async (event) => {
    if (event.data.metadata?.module !== 'proactive-companion') {
      return
    }

    try {
      await proactiveCompanionStore.recordContextUpdate(event)
    }
    catch (error) {
      console.warn('[App] Failed to record proactive companion context update:', error)
    }
  })
  serverChannelStore.onEvent('input:text', async (event) => {
    try {
      await recordProactiveCompanionContextUpdates(
        event.data.contextUpdates as Array<Record<string, unknown>> | undefined,
        event.metadata?.event?.id,
      )
    }
    catch (error) {
      console.warn('[App] Failed to inspect proactive companion input:text context updates:', error)
    }
  })
  if (!isChatWindowRoute()) {
    contextBridgeStore.initialize()
    if (!isWidgetsWindowRoute()) {
      characterOrchestratorStore.initialize()
      await startTrackingCursorPoint()
    }
  }

  // Expose stage provider definitions to plugin host APIs.
  defineInvokeHandler(context.value, pluginProtocolListProviders, async () => listProvidersForPluginHost())

  if (shouldPublishPluginHostCapabilities()) {
    await reportPluginCapability({
      key: pluginProtocolListProvidersEventName,
      state: 'ready',
      metadata: {
        source: 'stage-ui',
      },
    })
  }

  // Preload local inference models (Kokoro TTS, etc.) in background after a delay
  inferencePreload.triggerPreload()
  await startBackgroundVisionIfEnabled()
})

watch([
  visionAutoRun,
  visionConfigured,
  () => visionRunner.activeSourceId.value,
  () => visionRunner.hasPermissions.value,
], ([autoRun, configured, activeSourceId, hasPermissions]) => {
  if (isChatWindowRoute() || isWidgetsWindowRoute() || !isVisionOwnerRoute() || !visionRunner.isOwnerWindow.value) {
    return
  }

  if (!autoRun || !configured) {
    void visionRunner.stopCaptureLoop()
    return
  }

  if (!activeSourceId) {
    return
  }

  if (!hasPermissions) {
    return
  }

  if (!visionRunner.isRunning.value) {
    void visionRunner.startCaptureLoop()
  }
}, { immediate: false })

onUnmounted(() => {
  chatSyncLifecycle.dispose()
  if (visionRunner.isOwnerWindow.value) {
    void visionRunner.stopCaptureLoop()
  }
  if (!isChatWindowRoute() && !isWidgetsWindowRoute()) {
    visionRunner.cleanup()
  }
})

watch(themeColorsHue, () => {
  document.documentElement.style.setProperty('--chromatic-hue', themeColorsHue.value.toString())
}, { immediate: true })

watch(themeColorsHueDynamic, () => {
  document.documentElement.classList.toggle('dynamic-hue', themeColorsHueDynamic.value)
}, { immediate: true })

onUnmounted(() => {
  if (!isChatWindowRoute()) {
    contextBridgeStore.dispose()
  }
  mcpToolsStore.dispose()
  pluginToolsStore.dispose()
})
</script>

<template>
  <ToasterRoot @close="id => toast.dismiss(id)">
    <Toaster />
  </ToasterRoot>
  <ResizeHandler />
  <RouterView />
</template>

<style>
/* We need this to properly animate the CSS variable */
@property --chromatic-hue {
  syntax: '<number>';
  initial-value: 0;
  inherits: true;
}

@keyframes hue-anim {
  from {
    --chromatic-hue: 0;
  }
  to {
    --chromatic-hue: 360;
  }
}

.dynamic-hue {
  animation: hue-anim 10s linear infinite;
}
</style>
