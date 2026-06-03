<script setup lang="ts">
import { useExternalMemoryStore } from '@proj-airi/stage-ui/stores/external-memory-store'
import { useNahidaPersonaStore } from '@proj-airi/stage-ui/stores/nahida-persona-store'
import { Button, Callout } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

const memoryStore = useExternalMemoryStore()
const nahidaPersonaStore = useNahidaPersonaStore()
const {
  activeCharacterName,
  context,
  error,
  isAvailable,
  loading,
  refreshing,
  usage,
  writing,
} = storeToRefs(memoryStore)
const { isActive: nahidaActive, summary: nahidaSummary } = storeToRefs(nahidaPersonaStore)
const { t } = useI18n()

const stateToneMap = {
  ready: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  degraded: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  disabled: 'bg-neutral-500/15 text-neutral-700 dark:text-neutral-300',
  unavailable: 'bg-neutral-500/15 text-neutral-700 dark:text-neutral-300',
} as const

const latestWrite = computed(() => usage.value.lastWrite)
const recentWrites = computed(() => usage.value.recentWrites.slice(0, 4))

function formatWriteDecision(decision?: string) {
  switch (decision) {
    case 'written':
      return 'Written'
    case 'skipped-unavailable':
      return 'Skipped: unavailable'
    case 'skipped-empty':
      return 'Skipped: empty'
    case 'skipped-duplicate':
      return 'Skipped: duplicate'
    case 'skipped-not-stable':
      return 'Skipped: not stable'
    default:
      return 'Unknown'
  }
}

function decisionTone(decision?: string) {
  if (decision === 'written')
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'

  if (decision?.startsWith('skipped-'))
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'

  return 'bg-neutral-500/15 text-neutral-700 dark:text-neutral-300'
}

function formatTimestamp(value?: number) {
  if (!value)
    return t('settings.pages.memory.status.never')

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

async function refreshAll() {
  try {
    await memoryStore.refreshContext()
  }
  catch (cause) {
    toast.error(String(error.value ?? cause))
  }
}

async function writeRecentSummary() {
  try {
    const result = await memoryStore.writeRecentSummaryFromActiveSession()
    if (!result) {
      toast.error(t('settings.pages.memory.actions.write-summary-empty'))
      return
    }

    toast.success(result.summary)
  }
  catch (cause) {
    toast.error(String(error.value ?? cause))
  }
}

onMounted(() => {
  void memoryStore.refreshUsage().catch(() => {})
  void memoryStore.loadContext().catch(() => {})
})
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-4']">
    <Callout
      v-if="error"
      theme="orange"
      :label="t('settings.pages.memory.error-title')"
    >
      {{ error }}
    </Callout>

    <section :class="['flex', 'flex-col', 'gap-3', 'rounded-xl', 'border', 'border-neutral-200', 'bg-white/80', 'p-4', 'dark:border-neutral-800', 'dark:bg-neutral-900/40']">
      <div :class="['flex', 'items-start', 'justify-between', 'gap-3']">
        <div :class="['flex', 'flex-col', 'gap-1']">
          <h3 :class="['text-sm', 'font-semibold']">
            {{ t('settings.pages.memory.panel.title') }}
          </h3>
          <p :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
            {{ t('settings.pages.memory.panel.description') }}
          </p>
        </div>
        <span
          :class="[
            'inline-flex', 'items-center', 'rounded-full', 'px-2.5', 'py-1', 'text-[11px]', 'font-medium',
            stateToneMap[usage.bridgeState],
          ]"
        >
          {{ t(`settings.pages.memory.status.states.${usage.bridgeState}`) }}
        </span>
      </div>

      <div :class="['grid', 'gap-2', 'rounded-lg', 'bg-neutral-50', 'p-3', 'text-xs', 'dark:bg-neutral-950/40', 'md:grid-cols-2']">
        <div :class="['break-all', 'text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.memory.status.active-character') }}:</span>
          {{ activeCharacterName || t('settings.pages.memory.status.none') }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.memory.status.summary') }}:</span>
          {{ usage.lastReadSummary || usage.summary }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.memory.status.last-read') }}:</span>
          {{ formatTimestamp(usage.lastReadAt) }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.memory.status.reply-uses-memory') }}:</span>
          {{ isAvailable && (context?.usedKinds.length ?? 0) > 0 ? t('settings.pages.memory.status.yes') : t('settings.pages.memory.status.no') }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.memory.status.nahida-constraint') }}:</span>
          {{ nahidaActive ? t('settings.pages.memory.status.yes') : t('settings.pages.memory.status.no') }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.memory.status.nahida-summary') }}:</span>
          {{ nahidaSummary }}
        </div>
      </div>

      <div :class="['flex', 'flex-wrap', 'gap-2']">
        <Button
          variant="primary"
          size="sm"
          :disabled="loading || refreshing || writing"
          :loading="refreshing || loading"
          :label="t('settings.pages.memory.actions.refresh')"
          icon="i-solar:restart-bold-duotone"
          @click="refreshAll()"
        />
        <Button
          variant="secondary"
          size="sm"
          :disabled="loading || refreshing || writing"
          :loading="writing"
          :label="t('settings.pages.memory.actions.write-summary')"
          icon="i-solar:document-add-bold-duotone"
          @click="writeRecentSummary()"
        />
      </div>
    </section>

    <section :class="['grid', 'gap-3', 'md:grid-cols-2']">
      <article
        v-for="document in context?.documents ?? []"
        :key="document.kind"
        :class="['flex', 'flex-col', 'gap-2', 'rounded-xl', 'border', 'border-neutral-200', 'bg-white/80', 'p-4', 'dark:border-neutral-800', 'dark:bg-neutral-900/40']"
      >
        <div :class="['flex', 'items-start', 'justify-between', 'gap-2']">
          <div :class="['flex', 'flex-col', 'gap-1']">
            <h4 :class="['text-sm', 'font-semibold']">
              {{ t(`settings.pages.memory.documents.${document.kind}.title`) }}
            </h4>
            <p :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
              {{ document.summary }}
            </p>
          </div>
          <span
            :class="[
              'inline-flex', 'items-center', 'rounded-full', 'px-2', 'py-0.5', 'text-[11px]', 'font-medium',
              document.available ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-neutral-500/15 text-neutral-700 dark:text-neutral-300',
            ]"
          >
            {{ document.available ? t('settings.pages.memory.status.ready') : t('settings.pages.memory.status.unavailable') }}
          </span>
        </div>

        <div v-if="document.path" :class="['break-all', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
          {{ document.path }}
        </div>

        <ul v-if="document.items.length > 0" :class="['flex', 'list-disc', 'flex-col', 'gap-1', 'pl-4', 'text-xs', 'text-neutral-600', 'dark:text-neutral-300']">
          <li
            v-for="item in document.items.slice(0, 5)"
            :key="item"
          >
            {{ item }}
          </li>
        </ul>

        <div
          v-else
          :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']"
        >
          {{ t('settings.pages.memory.documents.empty') }}
        </div>
      </article>
    </section>

    <section :class="['flex', 'flex-col', 'gap-3', 'rounded-xl', 'border', 'border-neutral-200', 'bg-white/80', 'p-4', 'dark:border-neutral-800', 'dark:bg-neutral-900/40']">
      <div :class="['flex', 'flex-col', 'gap-1']">
        <h3 :class="['text-sm', 'font-semibold']">
          {{ t('settings.pages.memory.recent-writes.title') }}
        </h3>
        <p :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
          {{ t('settings.pages.memory.recent-writes.description') }}
        </p>
      </div>

      <div v-if="latestWrite" :class="['grid', 'gap-2', 'rounded-lg', 'bg-neutral-50', 'p-3', 'text-xs', 'dark:bg-neutral-950/40', 'md:grid-cols-2']">
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.memory.recent-writes.last-kind') }}:</span>
          {{ t(`settings.pages.memory.documents.${latestWrite.kind}.title`) }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Decision:</span>
          {{ formatWriteDecision(latestWrite.decision) }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.memory.recent-writes.last-time') }}:</span>
          {{ formatTimestamp(latestWrite.writtenAt) }}
        </div>
        <div :class="['break-all', 'text-neutral-600', 'dark:text-neutral-300', 'md:col-span-2']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.memory.recent-writes.last-summary') }}:</span>
          {{ latestWrite.summary }}
        </div>
      </div>

      <div
        v-if="recentWrites.length > 0"
        :class="['flex', 'flex-col', 'gap-2']"
      >
        <div
          v-for="result in recentWrites"
          :key="`${result.kind}-${result.writtenAt}`"
          :class="['rounded-lg', 'border', 'border-neutral-200', 'bg-neutral-50/80', 'p-3', 'text-xs', 'dark:border-neutral-800', 'dark:bg-neutral-950/40']"
        >
          <div :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">
            {{ t(`settings.pages.memory.documents.${result.kind}.title`) }}
          </div>
          <div
            :class="[
              'mt-1', 'inline-flex', 'w-fit', 'items-center', 'rounded-full', 'px-2', 'py-0.5', 'text-[11px]', 'font-medium',
              decisionTone(result.decision),
            ]"
          >
            {{ formatWriteDecision(result.decision) }}
          </div>
          <div :class="['text-neutral-600', 'dark:text-neutral-300']">
            {{ result.summary }}
          </div>
        </div>
      </div>

      <div
        v-else
        :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']"
      >
        {{ t('settings.pages.memory.recent-writes.empty') }}
      </div>
    </section>

    <Callout
      theme="lime"
      :label="t('settings.pages.memory.guardrails.title')"
    >
      {{ t('settings.pages.memory.guardrails.description') }}
    </Callout>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.memory.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.memory.description
  icon: i-solar:leaf-bold-duotone
  settingsEntry: true
  order: 5
  stageTransition:
    name: slide
</route>
