<script setup lang="ts">
import { Button, Callout, FieldCheckbox, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import { useExternalIntegrationsSettingsStore } from '../../../stores/settings/external-integrations'

const integrationsStore = useExternalIntegrationsSettingsStore()
const {
  importingLegacyProfile,
  lastError,
  lastImportResult,
  loading,
  memoryConfig,
  memoryDirty,
  memoryLastProbe,
  memoryStatus,
  probingKind,
  savingKind,
  sidecarConfig,
  sidecarDirty,
  sidecarLastProbe,
  sidecarStatus,
} = storeToRefs(integrationsStore)
const { t } = useI18n()

const isMemoryBusy = computed(() => savingKind.value === 'memory' || probingKind.value === 'memory')
const isSidecarBusy = computed(() => savingKind.value === 'companion-sidecar' || probingKind.value === 'companion-sidecar')
const memoryObsidianServerNameModel = computed({
  get: () => memoryConfig.value.obsidianServerName ?? '',
  set: (value: string) => {
    memoryConfig.value.obsidianServerName = value
  },
})

const statusToneMap = {
  'ready': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'degraded': 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  'disabled': 'bg-neutral-500/15 text-neutral-700 dark:text-neutral-300',
  'not-configured': 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  'unknown': 'bg-neutral-500/15 text-neutral-700 dark:text-neutral-300',
} as const

function formatTimestamp(value?: number) {
  if (!value) {
    return t('settings.pages.integrations.status.never')
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

function formatDetailValue(value: unknown) {
  if (typeof value === 'boolean') {
    return value
      ? t('settings.pages.integrations.status.boolean.true')
      : t('settings.pages.integrations.status.boolean.false')
  }

  if (value === null || typeof value === 'undefined' || value === '') {
    return '-'
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

function detailLabel(key: string) {
  return t(`settings.pages.integrations.details.${key}`)
}

const memoryDetails = computed(() => Object.entries(memoryLastProbe.value?.details ?? {}))
const sidecarDetails = computed(() => Object.entries(sidecarLastProbe.value?.details ?? {}))

onMounted(() => {
  void integrationsStore.refresh()
})
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-4']">
    <Callout
      v-if="lastError"
      theme="orange"
      :label="t('settings.pages.integrations.error-title')"
    >
      {{ lastError }}
    </Callout>

    <section :class="['flex', 'flex-col', 'gap-3', 'rounded-xl', 'border', 'border-primary-200', 'bg-primary-50/60', 'p-4', 'dark:border-primary-900/50', 'dark:bg-primary-950/20']">
      <div :class="['flex', 'flex-col', 'gap-1']">
        <h3 :class="['text-sm', 'font-semibold']">
          {{ t('settings.pages.integrations.import.title') }}
        </h3>
        <p :class="['text-xs', 'text-neutral-600', 'dark:text-neutral-300']">
          {{ t('settings.pages.integrations.import.description') }}
        </p>
      </div>

      <div v-if="lastImportResult" :class="['grid', 'gap-2', 'rounded-lg', 'bg-white/70', 'p-3', 'text-xs', 'dark:bg-neutral-950/40', 'md:grid-cols-2']">
        <div :class="['break-all', 'text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.integrations.import.source-profile') }}:</span>
          {{ lastImportResult.sourceProfilePath }}
        </div>
        <div :class="['break-all', 'text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.integrations.import.target-profile') }}:</span>
          {{ lastImportResult.targetProfilePath }}
        </div>
      </div>

      <div :class="['flex', 'flex-wrap', 'gap-2']">
        <Button
          variant="primary"
          size="sm"
          :disabled="loading || importingLegacyProfile"
          :loading="importingLegacyProfile"
          :label="t('settings.pages.integrations.actions.import-legacy-mcp')"
          icon="i-solar:import-bold-duotone"
          @click="integrationsStore.importLegacyMcp()"
        />
        <Button
          variant="secondary-muted"
          size="sm"
          :disabled="loading || importingLegacyProfile"
          :label="t('settings.pages.integrations.actions.open-data-folder')"
          icon="i-solar:folder-open-bold-duotone"
          @click="integrationsStore.openUserDataFolder()"
        />
      </div>
    </section>

    <section :class="['flex', 'flex-col', 'gap-3', 'rounded-xl', 'border', 'border-neutral-200', 'bg-white/80', 'p-4', 'dark:border-neutral-800', 'dark:bg-neutral-900/40']">
      <div :class="['flex', 'items-start', 'justify-between', 'gap-3']">
        <div :class="['flex', 'flex-col', 'gap-1']">
          <h3 :class="['text-sm', 'font-semibold']">
            {{ t('settings.pages.integrations.memory.title') }}
          </h3>
          <p :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
            {{ t('settings.pages.integrations.memory.description') }}
          </p>
        </div>
        <span
          :class="[
            'inline-flex', 'items-center', 'rounded-full', 'px-2.5', 'py-1', 'text-[11px]', 'font-medium',
            statusToneMap[memoryStatus?.state ?? 'unknown'],
          ]"
        >
          {{ t(`settings.pages.integrations.status.states.${memoryStatus?.state ?? 'unknown'}`) }}
        </span>
      </div>

      <FieldCheckbox
        v-model="memoryConfig.enabled"
        :label="t('settings.pages.integrations.fields.enabled.label')"
        :description="t('settings.pages.integrations.fields.enabled.description')"
      />

      <FieldInput
        v-model="memoryConfig.rootPath"
        :label="t('settings.pages.integrations.memory.fields.root-path.label')"
        :description="t('settings.pages.integrations.memory.fields.root-path.description')"
        placeholder="D:\AIRI-Memory"
      />

      <FieldInput
        v-model="memoryConfig.filesystemServerName"
        :label="t('settings.pages.integrations.memory.fields.filesystem-server.label')"
        :description="t('settings.pages.integrations.memory.fields.filesystem-server.description')"
        placeholder="filesystem"
      />

      <FieldInput
        v-model="memoryObsidianServerNameModel"
        :label="t('settings.pages.integrations.memory.fields.obsidian-server.label')"
        :description="t('settings.pages.integrations.memory.fields.obsidian-server.description')"
        placeholder="obsidian"
      />

      <div :class="['grid', 'gap-2', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400', 'md:grid-cols-2']">
        <div>
          <span :class="['font-medium', 'text-neutral-700', 'dark:text-neutral-200']">{{ t('settings.pages.integrations.status.summary') }}:</span>
          {{ memoryStatus?.summary ?? t('settings.pages.integrations.status.pending') }}
        </div>
        <div>
          <span :class="['font-medium', 'text-neutral-700', 'dark:text-neutral-200']">{{ t('settings.pages.integrations.status.last-checked') }}:</span>
          {{ formatTimestamp(memoryStatus?.checkedAt) }}
        </div>
        <div>
          <span :class="['font-medium', 'text-neutral-700', 'dark:text-neutral-200']">{{ t('settings.pages.integrations.status.last-success') }}:</span>
          {{ formatTimestamp(memoryStatus?.lastSuccessAt) }}
        </div>
        <div v-if="memoryStatus?.error">
          <span :class="['font-medium', 'text-neutral-700', 'dark:text-neutral-200']">{{ t('settings.pages.integrations.status.last-error') }}:</span>
          {{ memoryStatus.error }}
        </div>
      </div>

      <div
        v-if="memoryDetails.length"
        :class="['grid', 'gap-2', 'rounded-lg', 'bg-neutral-50', 'p-3', 'text-xs', 'dark:bg-neutral-950/40', 'md:grid-cols-2']"
      >
        <div
          v-for="[key, value] in memoryDetails"
          :key="key"
          :class="['break-all', 'text-neutral-600', 'dark:text-neutral-300']"
        >
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ detailLabel(key) }}:</span>
          {{ formatDetailValue(value) }}
        </div>
      </div>

      <div :class="['flex', 'flex-wrap', 'gap-2']">
        <Button
          variant="primary"
          size="sm"
          :disabled="loading || isMemoryBusy || !memoryDirty"
          :loading="savingKind === 'memory'"
          :label="t('settings.pages.integrations.actions.save-memory')"
          icon="i-solar:diskette-bold-duotone"
          @click="integrationsStore.save('memory')"
        />
        <Button
          variant="secondary"
          size="sm"
          :disabled="loading || isMemoryBusy || memoryDirty"
          :loading="probingKind === 'memory'"
          :label="t('settings.pages.integrations.actions.probe-memory')"
          icon="i-solar:restart-bold-duotone"
          @click="integrationsStore.probeNow('memory')"
        />
        <Button
          variant="secondary-muted"
          size="sm"
          :disabled="loading"
          :label="t('settings.pages.integrations.actions.open-data-folder')"
          icon="i-solar:folder-open-bold-duotone"
          @click="integrationsStore.openUserDataFolder()"
        />
      </div>
    </section>

    <section :class="['flex', 'flex-col', 'gap-3', 'rounded-xl', 'border', 'border-neutral-200', 'bg-white/80', 'p-4', 'dark:border-neutral-800', 'dark:bg-neutral-900/40']">
      <div :class="['flex', 'items-start', 'justify-between', 'gap-3']">
        <div :class="['flex', 'flex-col', 'gap-1']">
          <h3 :class="['text-sm', 'font-semibold']">
            {{ t('settings.pages.integrations.sidecar.title') }}
          </h3>
          <p :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
            {{ t('settings.pages.integrations.sidecar.description') }}
          </p>
        </div>
        <span
          :class="[
            'inline-flex', 'items-center', 'rounded-full', 'px-2.5', 'py-1', 'text-[11px]', 'font-medium',
            statusToneMap[sidecarStatus?.state ?? 'unknown'],
          ]"
        >
          {{ t(`settings.pages.integrations.status.states.${sidecarStatus?.state ?? 'unknown'}`) }}
        </span>
      </div>

      <FieldCheckbox
        v-model="sidecarConfig.enabled"
        :label="t('settings.pages.integrations.fields.enabled.label')"
        :description="t('settings.pages.integrations.sidecar.fields.enabled-description')"
      />

      <FieldInput
        v-model="sidecarConfig.moduleName"
        :label="t('settings.pages.integrations.sidecar.fields.module-name.label')"
        :description="t('settings.pages.integrations.sidecar.fields.module-name.description')"
        placeholder="Proactive Companion"
      />

      <FieldInput
        v-model="sidecarConfig.pluginId"
        :label="t('settings.pages.integrations.sidecar.fields.plugin-id.label')"
        :description="t('settings.pages.integrations.sidecar.fields.plugin-id.description')"
        placeholder="local.proactive-companion"
      />

      <FieldInput
        v-model="sidecarConfig.expectedWsUrl"
        :label="t('settings.pages.integrations.sidecar.fields.expected-ws-url.label')"
        :description="t('settings.pages.integrations.sidecar.fields.expected-ws-url.description')"
        placeholder="ws://127.0.0.1:6121/ws"
      />

      <div :class="['grid', 'gap-2', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400', 'md:grid-cols-2']">
        <div>
          <span :class="['font-medium', 'text-neutral-700', 'dark:text-neutral-200']">{{ t('settings.pages.integrations.status.summary') }}:</span>
          {{ sidecarStatus?.summary ?? t('settings.pages.integrations.status.pending') }}
        </div>
        <div>
          <span :class="['font-medium', 'text-neutral-700', 'dark:text-neutral-200']">{{ t('settings.pages.integrations.status.last-checked') }}:</span>
          {{ formatTimestamp(sidecarStatus?.checkedAt) }}
        </div>
        <div>
          <span :class="['font-medium', 'text-neutral-700', 'dark:text-neutral-200']">{{ t('settings.pages.integrations.status.last-success') }}:</span>
          {{ formatTimestamp(sidecarStatus?.lastSuccessAt) }}
        </div>
        <div v-if="sidecarStatus?.error">
          <span :class="['font-medium', 'text-neutral-700', 'dark:text-neutral-200']">{{ t('settings.pages.integrations.status.last-error') }}:</span>
          {{ sidecarStatus.error }}
        </div>
      </div>

      <div
        v-if="sidecarDetails.length"
        :class="['grid', 'gap-2', 'rounded-lg', 'bg-neutral-50', 'p-3', 'text-xs', 'dark:bg-neutral-950/40', 'md:grid-cols-2']"
      >
        <div
          v-for="[key, value] in sidecarDetails"
          :key="key"
          :class="['break-all', 'text-neutral-600', 'dark:text-neutral-300']"
        >
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ detailLabel(key) }}:</span>
          {{ formatDetailValue(value) }}
        </div>
      </div>

      <div :class="['flex', 'flex-wrap', 'gap-2']">
        <Button
          variant="primary"
          size="sm"
          :disabled="loading || isSidecarBusy || !sidecarDirty"
          :loading="savingKind === 'companion-sidecar'"
          :label="t('settings.pages.integrations.actions.save-sidecar')"
          icon="i-solar:diskette-bold-duotone"
          @click="integrationsStore.save('companion-sidecar')"
        />
        <Button
          variant="secondary"
          size="sm"
          :disabled="loading || isSidecarBusy || sidecarDirty"
          :loading="probingKind === 'companion-sidecar'"
          :label="t('settings.pages.integrations.actions.probe-sidecar')"
          icon="i-solar:restart-bold-duotone"
          @click="integrationsStore.probeNow('companion-sidecar')"
        />
      </div>
    </section>

    <Callout
      theme="lime"
      :label="t('settings.pages.integrations.compatibility.title')"
    >
      {{ t('settings.pages.integrations.compatibility.description') }}
    </Callout>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.integrations.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.integrations.description
  icon: i-solar:plug-circle-bold-duotone
  settingsEntry: true
  order: 5.5
  stageTransition:
    name: slide
</route>
