<script setup lang="ts">
import { useProactiveCompanionStore } from '@proj-airi/stage-ui/stores/proactive-companion-store'
import { Button, Callout, FieldCheckbox, FieldInput, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import { useProactiveCompanionSettingsStore } from '../../../stores/settings/proactive-companion'

const proactiveStore = useProactiveCompanionSettingsStore()
const runtimeStore = useProactiveCompanionStore()
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
} = storeToRefs(proactiveStore)
const {
  currentCooldownUntil,
  latestCooldownDecision,
  latestDeliveredDecision,
  latestLegacyDecision,
} = storeToRefs(runtimeStore)
const { t } = useI18n()

const intensityOptions = computed(() => ([
  {
    value: 'low',
    label: t('settings.pages.proactive-companion.intensity.low.label'),
    description: t('settings.pages.proactive-companion.intensity.low.description'),
  },
  {
    value: 'balanced',
    label: t('settings.pages.proactive-companion.intensity.balanced.label'),
    description: t('settings.pages.proactive-companion.intensity.balanced.description'),
  },
]))

const globalCooldownModel = computed({
  get: () => String(Math.round(settings.value.globalCooldownMs / 1000)),
  set: (value: string) => {
    const parsed = Number.parseInt(value, 10)
    settings.value.globalCooldownMs = Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : 0
  },
})

const topicCooldownModel = computed({
  get: () => String(Math.round(settings.value.topicCooldownMs / 1000)),
  set: (value: string) => {
    const parsed = Number.parseInt(value, 10)
    settings.value.topicCooldownMs = Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : 0
  },
})

const stateToneMap = {
  ready: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  degraded: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  disabled: 'bg-neutral-500/15 text-neutral-700 dark:text-neutral-300',
  unavailable: 'bg-neutral-500/15 text-neutral-700 dark:text-neutral-300',
} as const

const decisionToneMap = {
  delivered: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  suppressed: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  deferred: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  dropped: 'bg-neutral-500/15 text-neutral-700 dark:text-neutral-300',
} as const

function formatTimestamp(value?: number) {
  if (!value) {
    return t('settings.pages.proactive-companion.status.never')
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

function formatSeconds(value: number) {
  return `${Math.round(value / 1000)}s`
}

function formatDestinations(destinations: string[]) {
  return destinations.length > 0 ? destinations.join(', ') : 'none'
}

function formatBoolean(value: boolean) {
  return value ? 'yes' : 'no'
}

function formatSourceLabel(source: string) {
  if (!source.startsWith('legacy:')) {
    return source
  }

  return `legacy (${source.slice('legacy:'.length) || 'unknown'})`
}

const cooldownStateLabel = computed(() => currentCooldownUntil.value
  ? 'cooldown active'
  : 'no active cooldown')
const latestDeliveredAt = computed(() => latestDeliveredDecision.value?.decidedAt)
const historyEntries = computed(() => history.value.map(decision => ({
  ...decision,
  destinationsLabel: formatDestinations(decision.event.destinations),
  isLegacy: decision.event.source.startsWith('legacy:'),
  sourceLabel: formatSourceLabel(decision.event.source),
})))

onMounted(() => {
  void proactiveStore.refresh()
})
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-4']">
    <Callout
      v-if="error"
      theme="orange"
      :label="t('settings.pages.proactive-companion.error-title')"
    >
      {{ error }}
    </Callout>

    <section :class="['flex', 'flex-col', 'gap-3', 'rounded-xl', 'border', 'border-neutral-200', 'bg-white/80', 'p-4', 'dark:border-neutral-800', 'dark:bg-neutral-900/40']">
      <div :class="['flex', 'items-start', 'justify-between', 'gap-3']">
        <div :class="['flex', 'flex-col', 'gap-1']">
          <h3 :class="['text-sm', 'font-semibold']">
            {{ t('settings.pages.proactive-companion.panel.title') }}
          </h3>
          <p :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
            {{ t('settings.pages.proactive-companion.panel.description') }}
          </p>
        </div>
        <span
          :class="[
            'inline-flex', 'items-center', 'rounded-full', 'px-2.5', 'py-1', 'text-[11px]', 'font-medium',
            stateToneMap[runtime.state],
          ]"
        >
          {{ t(`settings.pages.proactive-companion.status.states.${runtime.state}`) }}
        </span>
      </div>

      <FieldCheckbox
        v-model="settings.enabled"
        :disabled="loading || saving || refreshing"
        :label="t('settings.pages.proactive-companion.fields.enabled.label')"
        :description="t('settings.pages.proactive-companion.fields.enabled.description')"
      />

      <FieldInput
        v-model="globalCooldownModel"
        :disabled="loading || saving || refreshing"
        :label="t('settings.pages.proactive-companion.fields.global-cooldown.label')"
        :description="t('settings.pages.proactive-companion.fields.global-cooldown.description')"
        placeholder="180"
      />

      <FieldInput
        v-model="topicCooldownModel"
        :disabled="loading || saving || refreshing"
        :label="t('settings.pages.proactive-companion.fields.topic-cooldown.label')"
        :description="t('settings.pages.proactive-companion.fields.topic-cooldown.description')"
        placeholder="600"
      />

      <FieldSelect
        v-model="settings.intensity"
        :disabled="loading || saving || refreshing"
        :label="t('settings.pages.proactive-companion.fields.intensity.label')"
        :description="t('settings.pages.proactive-companion.fields.intensity.description')"
        :options="intensityOptions"
      />

      <div :class="['grid', 'gap-2', 'rounded-lg', 'bg-neutral-50', 'p-3', 'text-xs', 'dark:bg-neutral-950/40', 'md:grid-cols-2']">
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.proactive-companion.status.sidecar') }}:</span>
          {{ runtime.sidecarConnected ? t('settings.pages.proactive-companion.status.connected') : t('settings.pages.proactive-companion.status.disconnected') }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.proactive-companion.status.summary') }}:</span>
          {{ runtime.summary }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.proactive-companion.status.sidecar-summary') }}:</span>
          {{ runtime.sidecarSummary }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.proactive-companion.status.last-refresh') }}:</span>
          {{ formatTimestamp(runtime.refreshedAt) }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Latest delivered:</span>
          {{ formatTimestamp(latestDeliveredAt) }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Cooldown state:</span>
          {{ cooldownStateLabel }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Cooldown until:</span>
          {{ formatTimestamp(currentCooldownUntil) }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300', 'md:col-span-2']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.proactive-companion.status.last-failure') }}:</span>
          {{ runtime.lastFailureReason || t('settings.pages.proactive-companion.status.none') }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300', 'md:col-span-2']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Latest cooldown reason:</span>
          {{ latestCooldownDecision?.reason || t('settings.pages.proactive-companion.status.none') }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300', 'md:col-span-2']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Latest legacy record:</span>
          {{ latestLegacyDecision?.reason || t('settings.pages.proactive-companion.status.none') }}
        </div>
      </div>

      <div :class="['grid', 'gap-2', 'rounded-lg', 'border', 'border-dashed', 'border-neutral-200', 'bg-neutral-50/60', 'p-3', 'text-xs', 'dark:border-neutral-800', 'dark:bg-neutral-950/30', 'md:grid-cols-2']">
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Global cooldown:</span>
          {{ formatSeconds(settings.globalCooldownMs) }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Topic cooldown:</span>
          {{ formatSeconds(settings.topicCooldownMs) }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Intensity:</span>
          {{ settings.intensity }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Current path:</span>
          low-frequency, reminder-first
        </div>
      </div>

      <div :class="['flex', 'flex-wrap', 'gap-2']">
        <Button
          variant="primary"
          size="sm"
          :disabled="loading || saving || refreshing || clearing"
          :loading="saving"
          :label="t('settings.pages.proactive-companion.actions.save')"
          icon="i-solar:diskette-bold-duotone"
          @click="proactiveStore.save()"
        />
        <Button
          variant="secondary"
          size="sm"
          :disabled="loading || saving || refreshing || clearing"
          :loading="refreshing"
          :label="t('settings.pages.proactive-companion.actions.refresh')"
          icon="i-solar:restart-bold-duotone"
          @click="proactiveStore.refresh()"
        />
        <Button
          variant="secondary-muted"
          size="sm"
          :disabled="loading || saving || refreshing || clearing"
          :loading="clearing"
          :label="t('settings.pages.proactive-companion.actions.clear-history')"
          icon="i-solar:trash-bin-trash-bold-duotone"
          @click="proactiveStore.clearHistory()"
        />
      </div>
    </section>

    <section :class="['flex', 'flex-col', 'gap-3', 'rounded-xl', 'border', 'border-neutral-200', 'bg-white/80', 'p-4', 'dark:border-neutral-800', 'dark:bg-neutral-900/40']">
      <div :class="['flex', 'flex-col', 'gap-1']">
        <h3 :class="['text-sm', 'font-semibold']">
          {{ t('settings.pages.proactive-companion.history.title') }}
        </h3>
        <p :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
          {{ t('settings.pages.proactive-companion.history.description') }}
        </p>
      </div>

      <div v-if="latestDecision" :class="['grid', 'gap-2', 'rounded-lg', 'bg-neutral-50', 'p-3', 'text-xs', 'dark:bg-neutral-950/40', 'md:grid-cols-2']">
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.proactive-companion.history.latest-headline') }}:</span>
          {{ latestDecision.event.headline }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.proactive-companion.history.latest-time') }}:</span>
          {{ formatTimestamp(latestDecision.decidedAt) }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.proactive-companion.history.latest-presentation') }}:</span>
          {{ latestDecision.presentation }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Latest decision:</span>
          {{ latestDecision.decision }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300', 'md:col-span-2']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.proactive-companion.history.latest-reason') }}:</span>
          {{ latestDecision.reason }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Latest source:</span>
          {{ formatSourceLabel(latestDecision.event.source) }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Latest cooldown until:</span>
          {{ formatTimestamp(latestDecision.cooldownUntil) }}
        </div>
      </div>

      <div
        v-if="historyEntries.length > 0"
        :class="['flex', 'flex-col', 'gap-2']"
      >
        <article
          v-for="decision in historyEntries"
          :key="`${decision.event.id}-${decision.decidedAt}`"
          :class="['flex', 'flex-col', 'gap-2', 'rounded-lg', 'border', 'border-neutral-200', 'bg-neutral-50/80', 'p-3', 'text-xs', 'dark:border-neutral-800', 'dark:bg-neutral-950/40']"
        >
          <div :class="['flex', 'items-start', 'justify-between', 'gap-2']">
            <div :class="['flex', 'flex-col', 'gap-1']">
              <div :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">
                {{ decision.event.headline }}
              </div>
              <div :class="['text-neutral-500', 'dark:text-neutral-400']">
                {{ decision.sourceLabel }} · {{ decision.event.kind }}
              </div>
            </div>
            <div :class="['flex', 'items-center', 'gap-2']">
              <span
                v-if="decision.isLegacy"
                :class="['inline-flex', 'items-center', 'rounded-full', 'bg-slate-500/15', 'px-2', 'py-0.5', 'text-[11px]', 'font-medium', 'text-slate-700', 'dark:text-slate-300']"
              >
                legacy
              </span>
              <span
                :class="[
                  'inline-flex', 'items-center', 'rounded-full', 'px-2', 'py-0.5', 'text-[11px]', 'font-medium',
                  decisionToneMap[decision.decision],
                ]"
              >
                {{ t(`settings.pages.proactive-companion.history.decisions.${decision.decision}`) }}
              </span>
            </div>
          </div>

          <div :class="['grid', 'gap-2', 'md:grid-cols-2']">
            <div :class="['text-neutral-600', 'dark:text-neutral-300']">
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.proactive-companion.history.reason') }}:</span>
              {{ decision.reason }}
            </div>
            <div :class="['text-neutral-600', 'dark:text-neutral-300']">
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.proactive-companion.history.time') }}:</span>
              {{ formatTimestamp(decision.decidedAt) }}
            </div>
            <div :class="['text-neutral-600', 'dark:text-neutral-300']">
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Raw kind:</span>
              {{ decision.event.rawKind || 'none' }}
            </div>
            <div :class="['text-neutral-600', 'dark:text-neutral-300']">
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Urgency:</span>
              {{ decision.event.urgency || 'none' }}
            </div>
            <div :class="['text-neutral-600', 'dark:text-neutral-300']">
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Destinations:</span>
              {{ decision.destinationsLabel }}
            </div>
            <div :class="['text-neutral-600', 'dark:text-neutral-300']">
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Presentation:</span>
              {{ decision.presentation }}
            </div>
            <div :class="['text-neutral-600', 'dark:text-neutral-300']">
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Matched source:</span>
              {{ formatBoolean(decision.matchedSource) }}
            </div>
            <div :class="['text-neutral-600', 'dark:text-neutral-300']">
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Sidecar ready:</span>
              {{ formatBoolean(decision.sidecarReady) }}
            </div>
            <div :class="['text-neutral-600', 'dark:text-neutral-300']">
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Cooldown until:</span>
              {{ formatTimestamp(decision.cooldownUntil) }}
            </div>
            <div :class="['text-neutral-600', 'dark:text-neutral-300']">
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Topic key:</span>
              {{ decision.event.topicKey }}
            </div>
          </div>
        </article>
      </div>

      <div
        v-else
        :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']"
      >
        {{ t('settings.pages.proactive-companion.history.empty') }}
      </div>
    </section>

    <Callout
      theme="lime"
      :label="t('settings.pages.proactive-companion.guardrails.title')"
    >
      {{ t('settings.pages.proactive-companion.guardrails.description') }}
    </Callout>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.proactive-companion.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.proactive-companion.description
  icon: i-solar:bell-bing-bold-duotone
  settingsEntry: true
  order: 5.8
  stageTransition:
    name: slide
</route>
