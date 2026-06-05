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

const decisionLabelMap = {
  delivered: '已放行',
  suppressed: '已压制',
  deferred: '已延后',
  dropped: '已丢弃',
} as const

const eventKindLabelMap = {
  'gentle-check-in': '轻提醒',
  'reminder': '提醒',
  'important': '重要提醒',
  'unknown': '未知类型',
} as const

const presentationLabelMap = {
  'light-prompt': '轻提示',
  'prominent-reminder': '显著提醒',
  'silent': '静默',
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
  return `${Math.round(value / 1000)} 秒`
}

function formatDestinations(destinations: string[]) {
  if (destinations.length === 0) {
    return '无'
  }

  return destinations.map((destination) => {
    if (destination === 'character') {
      return '角色'
    }

    if (destination === 'all') {
      return '全部'
    }

    return destination
  }).join('、')
}

function formatBoolean(value: boolean) {
  return value ? '是' : '否'
}

function formatSourceLabel(source: string) {
  if (!source.startsWith('legacy:')) {
    return source
  }

  return `兼容路径（${source.slice('legacy:'.length) || '未知'}）`
}

function formatDecisionLabel(decision: keyof typeof decisionLabelMap) {
  return decisionLabelMap[decision]
}

function formatPresentationLabel(presentation: keyof typeof presentationLabelMap) {
  return presentationLabelMap[presentation]
}

function formatEventKindLabel(kind: keyof typeof eventKindLabelMap) {
  return eventKindLabelMap[kind]
}

const cooldownStateLabel = computed(() => currentCooldownUntil.value
  ? '冷却中'
  : '当前无冷却')
const latestDeliveredAt = computed(() => latestDeliveredDecision.value?.decidedAt)
const historyEntries = computed(() => history.value.map(decision => ({
  ...decision,
  destinationsLabel: formatDestinations(decision.event.destinations),
  isLegacy: decision.event.source.startsWith('legacy:'),
  sourceLabel: formatSourceLabel(decision.event.source),
  decisionLabel: formatDecisionLabel(decision.decision),
  eventKindLabel: formatEventKindLabel(decision.event.kind),
  presentationLabel: formatPresentationLabel(decision.presentation),
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
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">最近放行：</span>
          {{ formatTimestamp(latestDeliveredAt) }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">冷却状态：</span>
          {{ cooldownStateLabel }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">冷却截止：</span>
          {{ formatTimestamp(currentCooldownUntil) }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300', 'md:col-span-2']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.proactive-companion.status.last-failure') }}:</span>
          {{ runtime.lastFailureReason || t('settings.pages.proactive-companion.status.none') }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300', 'md:col-span-2']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">最近冷却原因：</span>
          {{ latestCooldownDecision?.reason || t('settings.pages.proactive-companion.status.none') }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300', 'md:col-span-2']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">最近兼容记录：</span>
          {{ latestLegacyDecision?.reason || t('settings.pages.proactive-companion.status.none') }}
        </div>
      </div>

      <div :class="['grid', 'gap-2', 'rounded-lg', 'border', 'border-dashed', 'border-neutral-200', 'bg-neutral-50/60', 'p-3', 'text-xs', 'dark:border-neutral-800', 'dark:bg-neutral-950/30', 'md:grid-cols-2']">
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">全局冷却：</span>
          {{ formatSeconds(settings.globalCooldownMs) }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">主题冷却：</span>
          {{ formatSeconds(settings.topicCooldownMs) }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">提醒强度：</span>
          {{ settings.intensity === 'balanced' ? '平衡' : '低频克制' }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">当前路径：</span>
          低频优先、先提醒后打扰
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
          label="清空历史"
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
          {{ formatPresentationLabel(latestDecision.presentation) }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">最近判定：</span>
          {{ formatDecisionLabel(latestDecision.decision) }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300', 'md:col-span-2']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.proactive-companion.history.latest-reason') }}:</span>
          {{ latestDecision.reason }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">最近来源：</span>
          {{ formatSourceLabel(latestDecision.event.source) }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">最近冷却截止：</span>
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
                {{ decision.sourceLabel }} · {{ decision.eventKindLabel }}
              </div>
            </div>
            <div :class="['flex', 'items-center', 'gap-2']">
              <span
                v-if="decision.isLegacy"
                :class="['inline-flex', 'items-center', 'rounded-full', 'bg-slate-500/15', 'px-2', 'py-0.5', 'text-[11px]', 'font-medium', 'text-slate-700', 'dark:text-slate-300']"
              >
                兼容记录
              </span>
              <span
                :class="[
                  'inline-flex', 'items-center', 'rounded-full', 'px-2', 'py-0.5', 'text-[11px]', 'font-medium',
                  decisionToneMap[decision.decision],
                ]"
              >
                {{ decision.decisionLabel }}
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
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">原始类型：</span>
              {{ decision.event.rawKind || '无' }}
            </div>
            <div :class="['text-neutral-600', 'dark:text-neutral-300']">
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">紧急程度：</span>
              {{ decision.event.urgency || '无' }}
            </div>
            <div :class="['text-neutral-600', 'dark:text-neutral-300']">
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">目标：</span>
              {{ decision.destinationsLabel }}
            </div>
            <div :class="['text-neutral-600', 'dark:text-neutral-300']">
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">展示方式：</span>
              {{ decision.presentationLabel }}
            </div>
            <div :class="['text-neutral-600', 'dark:text-neutral-300']">
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">来源命中：</span>
              {{ formatBoolean(decision.matchedSource) }}
            </div>
            <div :class="['text-neutral-600', 'dark:text-neutral-300']">
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">Sidecar 就绪：</span>
              {{ formatBoolean(decision.sidecarReady) }}
            </div>
            <div :class="['text-neutral-600', 'dark:text-neutral-300']">
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">冷却截止：</span>
              {{ formatTimestamp(decision.cooldownUntil) }}
            </div>
            <div :class="['text-neutral-600', 'dark:text-neutral-300']">
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">主题键：</span>
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
