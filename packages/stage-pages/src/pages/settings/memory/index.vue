<script setup lang="ts">
import { EXTERNAL_MEMORY_LAYER_LABELS } from '@proj-airi/stage-ui/stores/external-memory-shared'
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
  latestPersistedWrite,
  loading,
  refreshing,
  turnSnapshot,
  usage,
  writeReviewSnapshot,
  candidateHistory,
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
const layerSummaries = computed(() => {
  return turnSnapshot.value.layerOrder.map((layer) => {
    const selection = turnSnapshot.value.selections.find(item => item.layer === layer)
    const document = context.value?.documents.find(item => item.layer === layer)

    return {
      layer,
      label: EXTERNAL_MEMORY_LAYER_LABELS[layer],
      selected: selection?.selected ?? false,
      evidenceCount: selection?.evidenceCount ?? 0,
      reason: selection?.reason ?? document?.reason ?? usage.value.reason,
      documentKind: selection?.kind ?? document?.kind,
      documentSummary: document?.summary,
    }
  })
})
const selectedEvidenceEntries = computed(() => {
  return turnSnapshot.value.evidence
    .filter(item => item.selected)
    .map((item) => {
      const selection = turnSnapshot.value.selections.find(entry => entry.layer === item.layer)
      return {
        ...item,
        reason: selection?.reason ?? usage.value.reason,
      }
    })
})
const suppressedEvidenceEntries = computed(() => {
  return turnSnapshot.value.evidence
    .filter(item => !item.selected)
    .map((item) => {
      const selection = turnSnapshot.value.selections.find(entry => entry.layer === item.layer)
      return {
        ...item,
        reason: selection?.reason ?? usage.value.reason,
      }
    })
})
const latestWriteReviewCandidates = computed(() => candidateHistory.value)

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

function formatLayerLabel(layer: keyof typeof EXTERNAL_MEMORY_LAYER_LABELS) {
  return EXTERNAL_MEMORY_LAYER_LABELS[layer]
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

async function refreshSnapshotPanel() {
  try {
    await memoryStore.refreshTurnSnapshot()
    toast.success('Turn snapshot refreshed.')
  }
  catch (cause) {
    toast.error(String(error.value ?? cause))
  }
}

async function refreshWriteReviewPanel() {
  try {
    await memoryStore.refreshWriteReview()
    toast.success('Write review refreshed.')
  }
  catch (cause) {
    toast.error(String(error.value ?? cause))
  }
}

async function clearCandidateHistoryPanel() {
  try {
    await memoryStore.clearCandidateHistory()
    toast.success('Candidate history cleared from the desktop runtime.')
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
      <div :class="['flex', 'items-start', 'justify-between', 'gap-3']">
        <div :class="['flex', 'flex-col', 'gap-1']">
          <h3 :class="['text-sm', 'font-semibold']">
            Memory Layering Mechanism
          </h3>
          <p :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
            Read-only snapshot of the latest layering, selection, suppression, and write-back review decisions.
          </p>
        </div>

        <div :class="['flex', 'flex-wrap', 'justify-end', 'gap-2']">
          <Button
            variant="secondary"
            size="sm"
            :disabled="loading || refreshing || writing"
            label="Refresh snapshot"
            icon="i-solar:restart-bold-duotone"
            @click="refreshSnapshotPanel()"
          />
          <Button
            variant="secondary"
            size="sm"
            :disabled="loading || refreshing || writing"
            label="Refresh write review"
            icon="i-solar:clipboard-check-bold-duotone"
            @click="refreshWriteReviewPanel()"
          />
          <Button
            variant="ghost"
            size="sm"
            :disabled="loading || refreshing || writing"
            label="Clear candidate history"
            icon="i-solar:trash-bin-trash-bold-duotone"
            @click="clearCandidateHistoryPanel()"
          />
        </div>
      </div>

      <div :class="['grid', 'gap-2', 'rounded-lg', 'bg-neutral-50', 'p-3', 'text-xs', 'dark:bg-neutral-950/40', 'md:grid-cols-2']">
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Current layering summary:</span>
          {{ turnSnapshot.summary }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Snapshot time:</span>
          {{ formatTimestamp(turnSnapshot.readAt) }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Character:</span>
          {{ turnSnapshot.characterName || activeCharacterName || t('settings.pages.memory.status.none') }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Layers used in the latest chat:</span>
          {{ turnSnapshot.usedLayers.length > 0 ? turnSnapshot.usedLayers.map(formatLayerLabel).join(', ') : t('settings.pages.memory.status.none') }}
        </div>
      </div>

      <div :class="['grid', 'gap-3', 'lg:grid-cols-2']">
        <article :class="['flex', 'flex-col', 'gap-2', 'rounded-lg', 'border', 'border-neutral-200', 'bg-neutral-50/80', 'p-3', 'dark:border-neutral-800', 'dark:bg-neutral-950/40']">
          <div :class="['flex', 'flex-col', 'gap-1']">
            <h4 :class="['text-sm', 'font-semibold']">
              Layer Summary
            </h4>
            <p :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
              Frozen layer order and per-layer decision reasons from the latest turn snapshot.
            </p>
          </div>

          <div
            v-for="entry in layerSummaries"
            :key="entry.layer"
            :class="['rounded-lg', 'border', 'border-neutral-200', 'bg-white/80', 'p-3', 'text-xs', 'dark:border-neutral-800', 'dark:bg-neutral-900/40']"
          >
            <div :class="['flex', 'items-start', 'justify-between', 'gap-2']">
              <div :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">
                {{ entry.label }}
              </div>
              <span
                :class="[
                  'inline-flex', 'items-center', 'rounded-full', 'px-2', 'py-0.5', 'text-[11px]', 'font-medium',
                  entry.selected ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                ]"
              >
                {{ entry.selected ? 'Selected' : 'Suppressed' }}
              </span>
            </div>
            <div :class="['mt-1', 'text-neutral-600', 'dark:text-neutral-300']">
              {{ entry.reason.message }}
            </div>
            <div v-if="entry.documentKind" :class="['mt-1', 'text-neutral-500', 'dark:text-neutral-400']">
              {{ entry.documentKind }} · {{ entry.evidenceCount }} evidence
            </div>
            <div v-if="entry.documentSummary" :class="['mt-1', 'text-neutral-500', 'dark:text-neutral-400']">
              {{ entry.documentSummary }}
            </div>
          </div>
        </article>

        <article :class="['flex', 'flex-col', 'gap-2', 'rounded-lg', 'border', 'border-neutral-200', 'bg-neutral-50/80', 'p-3', 'dark:border-neutral-800', 'dark:bg-neutral-950/40']">
          <div :class="['flex', 'flex-col', 'gap-1']">
            <h4 :class="['text-sm', 'font-semibold']">
              Latest Write Review
            </h4>
            <p :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
              Renderer-safe review result frozen by the main process.
            </p>
          </div>

          <div :class="['grid', 'gap-2', 'rounded-lg', 'bg-white/80', 'p-3', 'text-xs', 'dark:bg-neutral-900/40']">
            <div :class="['text-neutral-600', 'dark:text-neutral-300']">
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Review time:</span>
              {{ formatTimestamp(writeReviewSnapshot.reviewedAt) }}
            </div>
            <div :class="['text-neutral-600', 'dark:text-neutral-300']">
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Decision:</span>
              {{ formatWriteDecision(writeReviewSnapshot.decision) }}
            </div>
            <div :class="['text-neutral-600', 'dark:text-neutral-300']">
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Reason:</span>
              {{ writeReviewSnapshot.reason.message }}
            </div>
            <div :class="['text-neutral-600', 'dark:text-neutral-300']">
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Summary:</span>
              {{ writeReviewSnapshot.summary }}
            </div>
          </div>

          <div v-if="latestPersistedWrite" :class="['rounded-lg', 'border', 'border-neutral-200', 'bg-white/80', 'p-3', 'text-xs', 'dark:border-neutral-800', 'dark:bg-neutral-900/40']">
            <div :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">
              Latest persisted write
            </div>
            <div :class="['mt-1', 'text-neutral-600', 'dark:text-neutral-300']">
              {{ latestPersistedWrite.kind }} · {{ formatLayerLabel(latestPersistedWrite.layer) }}
            </div>
            <div :class="['mt-1', 'text-neutral-600', 'dark:text-neutral-300']">
              {{ formatWriteDecision(latestPersistedWrite.decision) }} · {{ formatTimestamp(latestPersistedWrite.writtenAt) }}
            </div>
            <div :class="['mt-1', 'text-neutral-500', 'dark:text-neutral-400']">
              {{ latestPersistedWrite.summary }}
            </div>
          </div>

          <div
            v-if="latestWriteReviewCandidates.length > 0"
            :class="['flex', 'flex-col', 'gap-2']"
          >
            <div
              v-for="(candidate, index) in latestWriteReviewCandidates"
              :key="`${candidate.kind}-${candidate.layer}-${index}`"
              :class="['rounded-lg', 'border', 'border-neutral-200', 'bg-white/80', 'p-3', 'text-xs', 'dark:border-neutral-800', 'dark:bg-neutral-900/40']"
            >
              <div :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">
                {{ candidate.kind }} · {{ formatLayerLabel(candidate.layer) }}
              </div>
              <div :class="['mt-1', 'text-neutral-600', 'dark:text-neutral-300']">
                {{ candidate.summary }}
              </div>
              <div v-if="candidate.addItems.length > 0" :class="['mt-2', 'text-neutral-500', 'dark:text-neutral-400']">
                Add: {{ candidate.addItems.join(' | ') }}
              </div>
              <div v-if="candidate.removeItems.length > 0" :class="['mt-1', 'text-neutral-500', 'dark:text-neutral-400']">
                Remove: {{ candidate.removeItems.join(' | ') }}
              </div>
            </div>
          </div>

          <div
            v-else
            :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']"
          >
            No candidate history is currently shown in this view.
          </div>
        </article>
      </div>

      <div :class="['grid', 'gap-3', 'lg:grid-cols-2']">
        <article :class="['flex', 'flex-col', 'gap-2', 'rounded-lg', 'border', 'border-neutral-200', 'bg-neutral-50/80', 'p-3', 'dark:border-neutral-800', 'dark:bg-neutral-950/40']">
          <div :class="['flex', 'flex-col', 'gap-1']">
            <h4 :class="['text-sm', 'font-semibold']">
              Latest Selected Entries
            </h4>
            <p :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
              Entries that survived layering selection in the latest snapshot.
            </p>
          </div>

          <div
            v-if="selectedEvidenceEntries.length > 0"
            :class="['flex', 'flex-col', 'gap-2']"
          >
            <div
              v-for="entry in selectedEvidenceEntries"
              :key="entry.id"
              :class="['rounded-lg', 'border', 'border-neutral-200', 'bg-white/80', 'p-3', 'text-xs', 'dark:border-neutral-800', 'dark:bg-neutral-900/40']"
            >
              <div :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">
                {{ formatLayerLabel(entry.layer) }} · {{ entry.title }}
              </div>
              <div :class="['mt-1', 'text-neutral-600', 'dark:text-neutral-300']">
                {{ entry.text }}
              </div>
              <div :class="['mt-1', 'text-neutral-500', 'dark:text-neutral-400']">
                Reason: {{ entry.reason.message }}
              </div>
            </div>
          </div>

          <div
            v-else
            :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']"
          >
            No selected entries were frozen in the latest snapshot.
          </div>
        </article>

        <article :class="['flex', 'flex-col', 'gap-2', 'rounded-lg', 'border', 'border-neutral-200', 'bg-neutral-50/80', 'p-3', 'dark:border-neutral-800', 'dark:bg-neutral-950/40']">
          <div :class="['flex', 'flex-col', 'gap-1']">
            <h4 :class="['text-sm', 'font-semibold']">
              Latest Suppressed Entries
            </h4>
            <p :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
              Entries that were considered but suppressed by layering decisions.
            </p>
          </div>

          <div
            v-if="suppressedEvidenceEntries.length > 0"
            :class="['flex', 'flex-col', 'gap-2']"
          >
            <div
              v-for="entry in suppressedEvidenceEntries"
              :key="entry.id"
              :class="['rounded-lg', 'border', 'border-neutral-200', 'bg-white/80', 'p-3', 'text-xs', 'dark:border-neutral-800', 'dark:bg-neutral-900/40']"
            >
              <div :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">
                {{ formatLayerLabel(entry.layer) }} · {{ entry.title }}
              </div>
              <div :class="['mt-1', 'text-neutral-600', 'dark:text-neutral-300']">
                {{ entry.text }}
              </div>
              <div :class="['mt-1', 'text-neutral-500', 'dark:text-neutral-400']">
                Reason: {{ entry.reason.message }}
              </div>
            </div>
          </div>

          <div
            v-else
            :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']"
          >
            No suppressed entries were frozen in the latest snapshot.
          </div>
        </article>
      </div>
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
