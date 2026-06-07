<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useCompanionCoordinationStore } from '@proj-airi/stage-ui/stores/companion-coordination-store'
import { useExternalMemoryStore } from '@proj-airi/stage-ui/stores/external-memory-store'
import { useScreenContextStore } from '@proj-airi/stage-ui/stores/screen-context'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { electronOpenSettings } from '../../../shared/eventa'

const coordinationStore = useCompanionCoordinationStore()
const externalMemoryStore = useExternalMemoryStore()
const screenContextStore = useScreenContextStore()
const openSettings = useElectronEventaInvoke(electronOpenSettings)
const { clearing, refreshing, snapshot } = storeToRefs(coordinationStore)
const { judgementSnapshot, turnSnapshot, canonicalSummary } = storeToRefs(externalMemoryStore)
const { snapshot: screenContext, captureFreshness, contextFreshness } = storeToRefs(screenContextStore)

const statusToneMap = {
  ready: {
    badge: ['bg-emerald-500/15', 'text-emerald-700', 'dark:text-emerald-300'],
    panel: ['border-emerald-300/80', 'bg-emerald-50/80', 'dark:border-emerald-900/60', 'dark:bg-emerald-950/20'],
  },
  attention: {
    badge: ['bg-orange-500/15', 'text-orange-700', 'dark:text-orange-300'],
    panel: ['border-orange-300/80', 'bg-orange-50/80', 'dark:border-orange-900/60', 'dark:bg-orange-950/20'],
  },
  inactive: {
    badge: ['bg-neutral-500/15', 'text-neutral-700', 'dark:text-neutral-300'],
    panel: ['border-neutral-300/80', 'bg-neutral-50/80', 'dark:border-neutral-800', 'dark:bg-neutral-900/40'],
  },
} as const

const dashboardStatusLabel = computed(() => {
  if (snapshot.value.status === 'ready') {
    return '已对齐'
  }

  if (snapshot.value.status === 'attention') {
    return '需关注'
  }

  return '未启用'
})

function formatTimestamp(value?: number) {
  if (!value) {
    return '未记录'
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

function formatSurfaceStatus(status: 'ready' | 'attention' | 'inactive') {
  if (status === 'ready') {
    return '已对齐'
  }

  if (status === 'attention') {
    return '需关注'
  }

  return '未启用'
}

async function refreshSnapshot() {
  await coordinationStore.refresh()
}

async function clearCoordinationHistory() {
  await coordinationStore.clearHistory()
}

async function openSurfaceDetail(surface: 'memory' | 'persona' | 'proactive') {
  await openSettings({
    route: coordinationStore.detailRouteFor(surface),
  })
}
</script>

<template>
  <main :class="['min-h-screen', 'bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_45%),linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(245,247,250,0.96))]', 'px-6', 'py-8', 'text-neutral-950', 'dark:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_35%),linear-gradient(180deg,_rgba(10,14,12,0.98),_rgba(13,18,16,0.98))]', 'dark:text-neutral-50', 'sm:px-8', 'lg:px-10']">
    <section :class="['mx-auto', 'flex', 'max-w-6xl', 'flex-col', 'gap-6']">
      <header :class="['grid', 'gap-4', 'rounded-[28px]', 'border', 'border-white/70', 'bg-white/85', 'p-6', 'shadow-[0_24px_80px_rgba(15,23,42,0.08)]', 'backdrop-blur', 'dark:border-white/10', 'dark:bg-black/30', 'lg:grid-cols-[minmax(0,1.8fr)_minmax(320px,1fr)]']">
        <div :class="['flex', 'flex-col', 'gap-3']">
          <div :class="['flex', 'items-center', 'gap-3']">
            <span
              :class="[
                'inline-flex', 'items-center', 'rounded-full', 'px-3', 'py-1', 'text-xs', 'font-semibold', 'tracking-[0.16em]', 'uppercase',
                ...statusToneMap[snapshot.status].badge,
              ]"
            >
              {{ dashboardStatusLabel }}
            </span>
            <span :class="['text-xs', 'font-medium', 'tracking-[0.22em]', 'text-neutral-500', 'uppercase', 'dark:text-neutral-400']">
              第六阶段协同
            </span>
          </div>

          <div :class="['flex', 'flex-col', 'gap-2']">
            <h1 :class="['font-serif', 'text-3xl', 'leading-tight', 'sm:text-4xl']">
              协同总览
            </h1>
            <p :class="['max-w-3xl', 'text-sm', 'leading-6', 'text-neutral-600', 'dark:text-neutral-300']">
              {{ snapshot.summary }}
            </p>
            <p :class="['max-w-3xl', 'text-sm', 'leading-6', 'text-neutral-500', 'dark:text-neutral-400']">
              {{ snapshot.reason.message }}
            </p>
          </div>
        </div>

        <div :class="['flex', 'flex-col', 'gap-3']">
          <div :class="['flex', 'flex-wrap', 'items-center', 'gap-2', 'justify-start', 'lg:justify-end']">
            <button
              type="button"
              :disabled="refreshing"
              :class="['inline-flex', 'items-center', 'rounded-full', 'border', 'border-emerald-300/70', 'bg-emerald-50/80', 'px-4', 'py-2', 'text-sm', 'font-medium', 'text-emerald-800', 'transition', 'disabled:cursor-not-allowed', 'disabled:opacity-60', 'dark:border-emerald-900/60', 'dark:bg-emerald-950/30', 'dark:text-emerald-200']"
              @click="refreshSnapshot"
            >
              {{ refreshing ? '刷新中...' : '刷新快照' }}
            </button>
            <button
              type="button"
              :disabled="clearing"
              :class="['inline-flex', 'items-center', 'rounded-full', 'border', 'border-neutral-300/70', 'bg-white/80', 'px-4', 'py-2', 'text-sm', 'font-medium', 'text-neutral-700', 'transition', 'disabled:cursor-not-allowed', 'disabled:opacity-60', 'dark:border-neutral-700', 'dark:bg-neutral-900/40', 'dark:text-neutral-200']"
              @click="clearCoordinationHistory"
            >
              {{ clearing ? '清空中...' : '清空历史' }}
            </button>
          </div>

          <div :class="['grid', 'gap-3', 'sm:grid-cols-3', 'lg:grid-cols-1']">
            <div :class="['rounded-2xl', 'border', 'border-emerald-200/70', 'bg-emerald-50/75', 'p-4', 'dark:border-emerald-900/50', 'dark:bg-emerald-950/20']">
              <div :class="['text-xs', 'font-medium', 'tracking-[0.18em]', 'text-emerald-700', 'uppercase', 'dark:text-emerald-300']">
                已对齐
              </div>
              <div :class="['mt-2', 'text-3xl', 'font-semibold']">
                {{ snapshot.readyCount }}
              </div>
            </div>
            <div :class="['rounded-2xl', 'border', 'border-orange-200/70', 'bg-orange-50/75', 'p-4', 'dark:border-orange-900/50', 'dark:bg-orange-950/20']">
              <div :class="['text-xs', 'font-medium', 'tracking-[0.18em]', 'text-orange-700', 'uppercase', 'dark:text-orange-300']">
                需关注
              </div>
              <div :class="['mt-2', 'text-3xl', 'font-semibold']">
                {{ snapshot.attentionCount }}
              </div>
            </div>
            <div :class="['rounded-2xl', 'border', 'border-neutral-200/70', 'bg-neutral-100/80', 'p-4', 'dark:border-neutral-800', 'dark:bg-neutral-900/50']">
              <div :class="['text-xs', 'font-medium', 'tracking-[0.18em]', 'text-neutral-600', 'uppercase', 'dark:text-neutral-400']">
                未启用
              </div>
              <div :class="['mt-2', 'text-3xl', 'font-semibold']">
                {{ snapshot.inactiveCount }}
              </div>
            </div>
          </div>
        </div>
      </header>

      <section :class="['grid', 'gap-4', 'lg:grid-cols-3']">
        <article
          v-for="surface in snapshot.surfaces"
          :key="surface.surface"
          :class="[
            'flex', 'min-h-[280px]', 'flex-col', 'gap-4', 'rounded-[24px]', 'border', 'p-5', 'shadow-[0_20px_60px_rgba(15,23,42,0.06)]',
            ...statusToneMap[surface.status].panel,
          ]"
        >
          <div :class="['flex', 'items-start', 'justify-between', 'gap-3']">
            <div :class="['flex', 'flex-col', 'gap-1']">
              <h2 :class="['text-xl', 'font-semibold']">
                {{ surface.title }}
              </h2>
              <p :class="['text-sm', 'leading-6', 'text-neutral-600', 'dark:text-neutral-300']">
                {{ surface.overview.summary }}
              </p>
            </div>

            <span
              :class="[
                'inline-flex', 'items-center', 'rounded-full', 'px-2.5', 'py-1', 'text-[11px]', 'font-semibold', 'tracking-[0.14em]', 'uppercase',
                ...statusToneMap[surface.status].badge,
              ]"
            >
              {{ formatSurfaceStatus(surface.status) }}
            </span>
          </div>

          <div :class="['space-y-3', 'text-sm', 'leading-6']">
            <div>
              <div :class="['text-[11px]', 'font-medium', 'tracking-[0.18em]', 'text-neutral-500', 'uppercase', 'dark:text-neutral-400']">
                原因
              </div>
              <p :class="['mt-1', 'text-neutral-700', 'dark:text-neutral-200']">
                {{ surface.overview.reason }}
              </p>
            </div>

            <div>
              <div :class="['text-[11px]', 'font-medium', 'tracking-[0.18em]', 'text-neutral-500', 'uppercase', 'dark:text-neutral-400']">
                最近活动
              </div>
              <p :class="['mt-1', 'text-neutral-700', 'dark:text-neutral-200']">
                {{ surface.overview.activity }}
              </p>
            </div>

            <div>
              <div :class="['text-[11px]', 'font-medium', 'tracking-[0.18em]', 'text-neutral-500', 'uppercase', 'dark:text-neutral-400']">
                覆盖情况
              </div>
              <p :class="['mt-1', 'text-neutral-700', 'dark:text-neutral-200']">
                {{ surface.overview.coverage }}
              </p>
            </div>
          </div>

          <div :class="['mt-auto', 'border-t', 'border-black/6', 'pt-3', 'text-xs', 'text-neutral-500', 'dark:border-white/8', 'dark:text-neutral-400']">
            <div :class="['flex', 'items-center', 'justify-between', 'gap-3']">
              <span>更新时间：{{ formatTimestamp(surface.overview.updatedAt) }}</span>
              <button
                type="button"
                :class="['inline-flex', 'items-center', 'rounded-full', 'border', 'border-black/10', 'bg-white/60', 'px-3', 'py-1.5', 'text-[11px]', 'font-semibold', 'tracking-[0.08em]', 'uppercase', 'text-neutral-700', 'transition', 'hover:bg-white/90', 'dark:border-white/10', 'dark:bg-black/20', 'dark:text-neutral-200', 'dark:hover:bg-black/35']"
                @click="openSurfaceDetail(surface.surface)"
              >
                打开详情
              </button>
            </div>
          </div>
        </article>
      </section>

      <section :class="['grid', 'gap-4', 'lg:grid-cols-2']">
        <article :class="['flex', 'flex-col', 'gap-4', 'rounded-[24px]', 'border', 'border-sky-200/70', 'bg-sky-50/75', 'p-5', 'shadow-[0_20px_60px_rgba(15,23,42,0.06)]', 'dark:border-sky-900/50', 'dark:bg-sky-950/20']">
          <div :class="['flex', 'flex-col', 'gap-1']">
            <h2 :class="['text-xl', 'font-semibold']">
              Screen Context
            </h2>
            <p :class="['text-sm', 'leading-6', 'text-neutral-600', 'dark:text-neutral-300']">
              Read-only explainability block for the current screen-context runtime state.
            </p>
          </div>

          <div :class="['grid', 'gap-2', 'text-sm']">
            <div :class="['flex', 'items-center', 'justify-between']">
              <span :class="['text-neutral-500', 'dark:text-neutral-400']">Source mode</span>
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ screenContext.sourceMode || 'Unconfigured' }}</span>
            </div>
            <div :class="['flex', 'items-center', 'justify-between']">
              <span :class="['text-neutral-500', 'dark:text-neutral-400']">Presence</span>
              <span :class="['font-medium', screenContext.isRunning ? 'text-emerald-700 dark:text-emerald-300' : 'text-neutral-500 dark:text-neutral-400']">{{ screenContext.isRunning ? 'Active' : 'Idle' }}</span>
            </div>
            <div :class="['flex', 'items-center', 'justify-between']">
              <span :class="['text-neutral-500', 'dark:text-neutral-400']">Capture freshness</span>
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ captureFreshness }}</span>
            </div>
            <div :class="['flex', 'items-center', 'justify-between']">
              <span :class="['text-neutral-500', 'dark:text-neutral-400']">Context freshness</span>
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ contextFreshness }}</span>
            </div>
            <div :class="['flex', 'items-center', 'justify-between']">
              <span :class="['text-neutral-500', 'dark:text-neutral-400']">Screen peeks</span>
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ screenContext.captureCount }} ({{ screenContext.captureRatePerMinute }}/min)</span>
            </div>
            <div :class="['flex', 'items-center', 'justify-between']">
              <span :class="['text-neutral-500', 'dark:text-neutral-400']">Usage context updates</span>
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ screenContext.contextUpdateCount }} ({{ screenContext.contextUpdateRatePerMinute }}/min)</span>
            </div>
          </div>
        </article>

        <article :class="['flex', 'flex-col', 'gap-4', 'rounded-[24px]', 'border', 'border-violet-200/70', 'bg-violet-50/75', 'p-5', 'shadow-[0_20px_60px_rgba(15,23,42,0.06)]', 'dark:border-violet-900/50', 'dark:bg-violet-950/20']">
          <div :class="['flex', 'flex-col', 'gap-1']">
            <h2 :class="['text-xl', 'font-semibold']">
              Memory Judgement
            </h2>
            <p :class="['text-sm', 'leading-6', 'text-neutral-600', 'dark:text-neutral-300']">
              Read-only explainability block for the latest memory judgement and recall snapshot.
            </p>
          </div>

          <div :class="['grid', 'gap-2', 'text-sm']">
            <div :class="['flex', 'items-center', 'justify-between']">
              <span :class="['text-neutral-500', 'dark:text-neutral-400']">Judgement summary</span>
              <span :class="['max-w-[60%]', 'text-right', 'font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ judgementSnapshot.summary || 'No judgement yet' }}</span>
            </div>
            <div :class="['flex', 'items-center', 'justify-between']">
              <span :class="['text-neutral-500', 'dark:text-neutral-400']">Turn summary</span>
              <span :class="['max-w-[60%]', 'text-right', 'font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ canonicalSummary || turnSnapshot.summary || 'No turn snapshot' }}</span>
            </div>
            <div :class="['flex', 'items-center', 'justify-between']">
              <span :class="['text-neutral-500', 'dark:text-neutral-400']">Stable candidates</span>
              <span :class="['font-medium', 'text-emerald-700', 'dark:text-emerald-300']">{{ judgementSnapshot.statusCounts.stable }}</span>
            </div>
            <div :class="['flex', 'items-center', 'justify-between']">
              <span :class="['text-neutral-500', 'dark:text-neutral-400']">Tentative candidates</span>
              <span :class="['font-medium', 'text-amber-700', 'dark:text-amber-300']">{{ judgementSnapshot.statusCounts.tentative }}</span>
            </div>
            <div :class="['flex', 'items-center', 'justify-between']">
              <span :class="['text-neutral-500', 'dark:text-neutral-400']">Conflicted</span>
              <span :class="['font-medium', 'text-rose-700', 'dark:text-rose-300']">{{ judgementSnapshot.statusCounts.conflicted }}</span>
            </div>
            <div :class="['flex', 'items-center', 'justify-between']">
              <span :class="['text-neutral-500', 'dark:text-neutral-400']">Used layers</span>
              <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ turnSnapshot.usedLayers.length > 0 ? turnSnapshot.usedLayers.join(', ') : 'None' }}</span>
            </div>
          </div>
        </article>
      </section>
    </section>
  </main>
</template>
