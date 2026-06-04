<script setup lang="ts">
import type {
  StartupDiagnosticsItem,
  SubsystemHealthKind,
  SubsystemHealthStatus,
} from '../../../../shared/system-health'

import { Button, Callout } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useSystemHealthSettingsStore } from '../../../stores/settings/system-health'

const systemHealthStore = useSystemHealthSettingsStore()
const router = useRouter()
const {
  diagnostics,
  hasLoaded,
  lastError,
  loading,
  refreshing,
  runningStartupDiagnostics,
  snapshot,
} = storeToRefs(systemHealthStore)
const { t } = useI18n()
const subsystemRouteMap: Record<SubsystemHealthKind, string> = {
  memory: '/settings/memory',
  persona: '/settings/nahida-persona',
  proactive: '/settings/proactive-companion',
  coordination: '/settings/integrations',
  integrations: '/settings/integrations',
  vision: '/settings/modules/vision',
}

const statusToneMap: Record<SubsystemHealthStatus, { badge: string[], panel: string[], dot: string[] }> = {
  healthy: {
    badge: ['bg-emerald-500/15', 'text-emerald-700', 'dark:text-emerald-300'],
    panel: ['border-emerald-200/80', 'bg-emerald-50/65', 'dark:border-emerald-900/60', 'dark:bg-emerald-950/20'],
    dot: ['bg-emerald-500'],
  },
  degraded: {
    badge: ['bg-orange-500/15', 'text-orange-700', 'dark:text-orange-300'],
    panel: ['border-orange-200/80', 'bg-orange-50/70', 'dark:border-orange-900/60', 'dark:bg-orange-950/20'],
    dot: ['bg-orange-500'],
  },
  unhealthy: {
    badge: ['bg-red-500/15', 'text-red-700', 'dark:text-red-300'],
    panel: ['border-red-200/80', 'bg-red-50/70', 'dark:border-red-900/60', 'dark:bg-red-950/20'],
    dot: ['bg-red-500'],
  },
  unknown: {
    badge: ['bg-neutral-500/15', 'text-neutral-700', 'dark:text-neutral-300'],
    panel: ['border-neutral-200/80', 'bg-neutral-50/75', 'dark:border-neutral-800', 'dark:bg-neutral-900/35'],
    dot: ['bg-neutral-400'],
  },
}

const overallStatusLabel = computed(() => t(`settings.pages.system.health.status.${snapshot.value.overall}`))
const startupPhaseLabel = computed(() => snapshot.value.startupPhase
  ? t('settings.pages.system.health.startup-phase.in-progress')
  : t('settings.pages.system.health.startup-phase.completed'))
const checkedAtLabel = computed(() => formatTimestamp(snapshot.value.checkedAt))
const subsystemCountLabel = computed(() => snapshot.value.subsystems.length > 0
  ? t('settings.pages.system.health.overview.subsystems-count', { count: snapshot.value.subsystems.length })
  : t('settings.pages.system.health.empty.subsystems'))
const diagnosticsStatusLabel = computed(() => {
  if (!diagnostics.value) {
    return t('settings.pages.system.health.diagnostics.idle')
  }

  return diagnostics.value.passed
    ? t('settings.pages.system.health.diagnostics.passed')
    : t('settings.pages.system.health.diagnostics.failed')
})

const diagnosticsTone = computed(() => {
  if (!diagnostics.value) {
    return statusToneMap.unknown
  }

  if (diagnostics.value.failures.length > 0) {
    return statusToneMap.unhealthy
  }

  if (diagnostics.value.warnings.length > 0) {
    return statusToneMap.degraded
  }

  return statusToneMap.healthy
})

function formatTimestamp(value?: number) {
  if (!value) {
    return t('settings.pages.system.health.empty.timestamp')
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

function formatDuration(duration: number) {
  if (duration < 1000) {
    return `${duration} ms`
  }

  return `${(duration / 1000).toFixed(duration >= 10_000 ? 0 : 1)} s`
}

function subsystemTitle(kind: SubsystemHealthKind) {
  return t(`settings.pages.system.health.subsystems.${kind}.title`)
}

function subsystemDescription(kind: SubsystemHealthKind) {
  return t(`settings.pages.system.health.subsystems.${kind}.description`)
}

function diagnosticsItemKey(item: StartupDiagnosticsItem, index: number) {
  return `${item.kind}:${item.message}:${index}`
}

function openSubsystemSettings(kind: SubsystemHealthKind) {
  void router.push(subsystemRouteMap[kind]).catch((error) => {
    console.warn('[SystemHealthPage] Failed to navigate to subsystem settings:', error)
  })
}

onMounted(() => {
  if (!hasLoaded.value) {
    void systemHealthStore.loadSnapshot({ notify: false })
  }
})
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-4']">
    <Callout
      v-if="lastError"
      theme="orange"
      :label="t('settings.pages.system.health.error-title')"
    >
      {{ lastError }}
    </Callout>

    <section
      :class="[
        'flex', 'flex-col', 'gap-4', 'rounded-2xl', 'border', 'bg-white/80', 'p-4',
        'shadow-[0_12px_32px_rgba(15,23,42,0.05)]', 'dark:bg-neutral-900/40',
        ...statusToneMap[snapshot.overall].panel,
      ]"
    >
      <div :class="['flex', 'flex-col', 'gap-3', 'lg:flex-row', 'lg:items-start', 'lg:justify-between']">
        <div :class="['flex', 'flex-col', 'gap-2']">
          <div :class="['flex', 'flex-wrap', 'items-center', 'gap-2']">
            <span
              :class="[
                'inline-flex', 'items-center', 'rounded-full', 'px-2.5', 'py-1',
                'text-[11px]', 'font-semibold', 'tracking-[0.14em]', 'uppercase',
                ...statusToneMap[snapshot.overall].badge,
              ]"
            >
              {{ overallStatusLabel }}
            </span>
            <span
              :class="[
                'inline-flex', 'items-center', 'gap-2', 'rounded-full', 'border',
                'border-neutral-200/80', 'bg-neutral-50/80', 'px-2.5', 'py-1',
                'text-[11px]', 'font-medium', 'text-neutral-600',
                'dark:border-neutral-800', 'dark:bg-neutral-900/50', 'dark:text-neutral-300',
              ]"
            >
              <span :class="['h-2', 'w-2', 'rounded-full', snapshot.startupPhase ? 'bg-orange-400' : 'bg-emerald-400']" />
              {{ startupPhaseLabel }}
            </span>
          </div>

          <div :class="['flex', 'flex-col', 'gap-1']">
            <h3 :class="['text-sm', 'font-semibold', 'text-neutral-950', 'dark:text-neutral-50']">
              {{ t('settings.pages.system.health.overview.title') }}
            </h3>
            <p :class="['text-sm', 'leading-6', 'text-neutral-600', 'dark:text-neutral-300']">
              {{ t('settings.pages.system.health.overview.description') }}
            </p>
          </div>
        </div>

        <div :class="['flex', 'flex-wrap', 'gap-2']">
          <Button
            variant="secondary"
            size="sm"
            icon="i-solar:restart-bold-duotone"
            :disabled="loading || refreshing || runningStartupDiagnostics"
            :loading="refreshing"
            :label="t('settings.pages.system.health.actions.refresh')"
            @click="systemHealthStore.refreshSnapshot()"
          />
          <Button
            variant="primary"
            size="sm"
            icon="i-solar:stethoscope-bold-duotone"
            :disabled="loading || refreshing || runningStartupDiagnostics"
            :loading="runningStartupDiagnostics"
            :label="t('settings.pages.system.health.actions.run-diagnostics')"
            @click="systemHealthStore.runStartupDiagnostics()"
          />
        </div>
      </div>

      <div :class="['grid', 'gap-3', 'md:grid-cols-3']">
        <div :class="['rounded-xl', 'border', 'border-black/6', 'bg-white/70', 'p-3', 'dark:border-white/8', 'dark:bg-black/15']">
          <div :class="['text-[11px]', 'font-medium', 'tracking-[0.18em]', 'text-neutral-500', 'uppercase', 'dark:text-neutral-400']">
            {{ t('settings.pages.system.health.overview.overall-label') }}
          </div>
          <div :class="['mt-2', 'text-lg', 'font-semibold', 'text-neutral-950', 'dark:text-neutral-50']">
            {{ overallStatusLabel }}
          </div>
        </div>
        <div :class="['rounded-xl', 'border', 'border-black/6', 'bg-white/70', 'p-3', 'dark:border-white/8', 'dark:bg-black/15']">
          <div :class="['text-[11px]', 'font-medium', 'tracking-[0.18em]', 'text-neutral-500', 'uppercase', 'dark:text-neutral-400']">
            {{ t('settings.pages.system.health.overview.checked-at-label') }}
          </div>
          <div :class="['mt-2', 'text-sm', 'font-medium', 'text-neutral-800', 'dark:text-neutral-100']">
            {{ checkedAtLabel }}
          </div>
        </div>
        <div :class="['rounded-xl', 'border', 'border-black/6', 'bg-white/70', 'p-3', 'dark:border-white/8', 'dark:bg-black/15']">
          <div :class="['text-[11px]', 'font-medium', 'tracking-[0.18em]', 'text-neutral-500', 'uppercase', 'dark:text-neutral-400']">
            {{ t('settings.pages.system.health.overview.subsystems-label') }}
          </div>
          <div :class="['mt-2', 'text-sm', 'font-medium', 'text-neutral-800', 'dark:text-neutral-100']">
            {{ subsystemCountLabel }}
          </div>
        </div>
      </div>

      <Callout
        v-if="!hasLoaded && loading"
        theme="lime"
        :label="t('settings.pages.system.health.loading.title')"
      >
        {{ t('settings.pages.system.health.loading.description') }}
      </Callout>
    </section>

    <section :class="['flex', 'flex-col', 'gap-3', 'rounded-2xl', 'border', 'border-neutral-200', 'bg-white/80', 'p-4', 'dark:border-neutral-800', 'dark:bg-neutral-900/40']">
      <div :class="['flex', 'flex-col', 'gap-1']">
        <h3 :class="['text-sm', 'font-semibold']">
          {{ t('settings.pages.system.health.subsystems-panel.title') }}
        </h3>
        <p :class="['text-sm', 'leading-6', 'text-neutral-600', 'dark:text-neutral-300']">
          {{ t('settings.pages.system.health.subsystems-panel.description') }}
        </p>
      </div>

      <div
        v-if="snapshot.subsystems.length > 0"
        :class="['grid', 'gap-3']"
      >
        <article
          v-for="subsystem in snapshot.subsystems"
          :key="subsystem.kind"
          :class="[
            'flex', 'flex-col', 'gap-3', 'rounded-xl', 'border', 'p-4',
            ...statusToneMap[subsystem.status].panel,
          ]"
        >
          <div :class="['flex', 'flex-col', 'gap-3', 'lg:flex-row', 'lg:items-start', 'lg:justify-between']">
            <div :class="['flex', 'flex-col', 'gap-1']">
              <div :class="['flex', 'items-center', 'gap-2']">
                <span :class="['h-2.5', 'w-2.5', 'rounded-full', ...statusToneMap[subsystem.status].dot]" />
                <h4 :class="['text-sm', 'font-semibold', 'text-neutral-950', 'dark:text-neutral-50']">
                  {{ subsystemTitle(subsystem.kind) }}
                </h4>
              </div>
              <p :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
                {{ subsystemDescription(subsystem.kind) }}
              </p>
            </div>

            <span
              :class="[
                'inline-flex', 'items-center', 'rounded-full', 'px-2.5', 'py-1',
                'text-[11px]', 'font-semibold', 'tracking-[0.14em]', 'uppercase',
                ...statusToneMap[subsystem.status].badge,
              ]"
            >
              {{ t(`settings.pages.system.health.status.${subsystem.status}`) }}
            </span>
          </div>

          <div :class="['grid', 'gap-3', 'md:grid-cols-2']">
            <div :class="['text-sm', 'text-neutral-700', 'dark:text-neutral-200', 'md:col-span-2']">
              <span :class="['font-medium']">{{ t('settings.pages.system.health.fields.summary') }}:</span>
              {{ subsystem.summary }}
            </div>

            <div
              v-if="subsystem.detail"
              :class="['text-sm', 'text-neutral-700', 'dark:text-neutral-200', 'md:col-span-2']"
            >
              <span :class="['font-medium']">{{ t('settings.pages.system.health.fields.detail') }}:</span>
              {{ subsystem.detail }}
            </div>

            <div
              v-if="subsystem.actionHint"
              :class="['text-sm', 'text-neutral-700', 'dark:text-neutral-200', 'md:col-span-2']"
            >
              <span :class="['font-medium']">{{ t('settings.pages.system.health.fields.action-hint') }}:</span>
              {{ subsystem.actionHint }}
            </div>

            <div :class="['text-sm', 'text-neutral-700', 'dark:text-neutral-200']">
              <span :class="['font-medium']">{{ t('settings.pages.system.health.fields.checked-at') }}:</span>
              {{ formatTimestamp(subsystem.checkedAt) }}
            </div>
          </div>

          <div :class="['flex', 'justify-end']">
            <Button
              variant="secondary"
              size="sm"
              icon="i-solar:arrow-right-up-bold-duotone"
              :label="t('settings.pages.system.health.actions.open-related-settings')"
              @click="openSubsystemSettings(subsystem.kind)"
            />
          </div>
        </article>
      </div>

      <div
        v-else
        :class="[
          'rounded-xl', 'border', 'border-dashed', 'border-neutral-200', 'bg-neutral-50/70', 'p-4',
          'text-sm', 'text-neutral-600', 'dark:border-neutral-800', 'dark:bg-neutral-950/30', 'dark:text-neutral-300',
        ]"
      >
        {{ t('settings.pages.system.health.empty.subsystems') }}
      </div>
    </section>

    <section
      :class="[
        'flex', 'flex-col', 'gap-3', 'rounded-2xl', 'border', 'bg-white/80', 'p-4', 'dark:bg-neutral-900/40',
        ...diagnosticsTone.panel,
      ]"
    >
      <div :class="['flex', 'flex-col', 'gap-3', 'lg:flex-row', 'lg:items-start', 'lg:justify-between']">
        <div :class="['flex', 'flex-col', 'gap-1']">
          <div :class="['flex', 'items-center', 'gap-2']">
            <h3 :class="['text-sm', 'font-semibold']">
              {{ t('settings.pages.system.health.diagnostics.title') }}
            </h3>
            <span
              :class="[
                'inline-flex', 'items-center', 'rounded-full', 'px-2.5', 'py-1',
                'text-[11px]', 'font-semibold', 'tracking-[0.14em]', 'uppercase',
                ...diagnosticsTone.badge,
              ]"
            >
              {{ diagnosticsStatusLabel }}
            </span>
          </div>
          <p :class="['text-sm', 'leading-6', 'text-neutral-600', 'dark:text-neutral-300']">
            {{ t('settings.pages.system.health.diagnostics.description') }}
          </p>
        </div>

        <div
          v-if="diagnostics"
          :class="['rounded-xl', 'border', 'border-black/6', 'bg-white/60', 'px-3', 'py-2', 'text-xs', 'text-neutral-700', 'dark:border-white/8', 'dark:bg-black/15', 'dark:text-neutral-200']"
        >
          <span :class="['font-medium']">{{ t('settings.pages.system.health.diagnostics.duration') }}:</span>
          {{ formatDuration(diagnostics.duration) }}
        </div>
      </div>

      <div
        v-if="diagnostics"
        :class="['grid', 'gap-3', 'lg:grid-cols-2']"
      >
        <div :class="['flex', 'flex-col', 'gap-2', 'rounded-xl', 'border', 'border-orange-200/80', 'bg-orange-50/60', 'p-3', 'dark:border-orange-900/50', 'dark:bg-orange-950/20']">
          <div :class="['text-[11px]', 'font-medium', 'tracking-[0.18em]', 'text-orange-700', 'uppercase', 'dark:text-orange-300']">
            {{ t('settings.pages.system.health.diagnostics.warnings-title', { count: diagnostics.warnings.length }) }}
          </div>

          <div
            v-if="diagnostics.warnings.length > 0"
            :class="['flex', 'flex-col', 'gap-2']"
          >
            <article
              v-for="(warning, index) in diagnostics.warnings"
              :key="diagnosticsItemKey(warning, index)"
              :class="['rounded-lg', 'border', 'border-orange-200/70', 'bg-white/70', 'p-3', 'text-sm', 'dark:border-orange-900/40', 'dark:bg-black/15']"
            >
              <div :class="['font-medium', 'text-neutral-900', 'dark:text-neutral-100']">
                {{ subsystemTitle(warning.kind) }}
              </div>
              <div :class="['mt-1', 'text-neutral-700', 'dark:text-neutral-200']">
                {{ warning.message }}
              </div>
            </article>
          </div>

          <div
            v-else
            :class="['text-sm', 'text-neutral-700', 'dark:text-neutral-200']"
          >
            {{ t('settings.pages.system.health.diagnostics.no-warnings') }}
          </div>
        </div>

        <div :class="['flex', 'flex-col', 'gap-2', 'rounded-xl', 'border', 'border-red-200/80', 'bg-red-50/60', 'p-3', 'dark:border-red-900/50', 'dark:bg-red-950/20']">
          <div :class="['text-[11px]', 'font-medium', 'tracking-[0.18em]', 'text-red-700', 'uppercase', 'dark:text-red-300']">
            {{ t('settings.pages.system.health.diagnostics.failures-title', { count: diagnostics.failures.length }) }}
          </div>

          <div
            v-if="diagnostics.failures.length > 0"
            :class="['flex', 'flex-col', 'gap-2']"
          >
            <article
              v-for="(failure, index) in diagnostics.failures"
              :key="diagnosticsItemKey(failure, index)"
              :class="['rounded-lg', 'border', 'border-red-200/70', 'bg-white/70', 'p-3', 'text-sm', 'dark:border-red-900/40', 'dark:bg-black/15']"
            >
              <div :class="['font-medium', 'text-neutral-900', 'dark:text-neutral-100']">
                {{ subsystemTitle(failure.kind) }}
              </div>
              <div :class="['mt-1', 'text-neutral-700', 'dark:text-neutral-200']">
                {{ failure.message }}
              </div>
            </article>
          </div>

          <div
            v-else
            :class="['text-sm', 'text-neutral-700', 'dark:text-neutral-200']"
          >
            {{ t('settings.pages.system.health.diagnostics.no-failures') }}
          </div>
        </div>
      </div>

      <div
        v-else
        :class="[
          'rounded-xl', 'border', 'border-dashed', 'border-neutral-200', 'bg-neutral-50/70', 'p-4',
          'text-sm', 'text-neutral-600', 'dark:border-neutral-800', 'dark:bg-neutral-950/30', 'dark:text-neutral-300',
        ]"
      >
        {{ t('settings.pages.system.health.diagnostics.empty') }}
      </div>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.system.health.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.system.health.description
  stageTransition:
    name: slide
</route>
