<script setup lang="ts">
import {
  getNahidaPersonaDisplayModeSummary,
  getNahidaPersonaDisplaySectionPreviews,
  getNahidaPersonaDisplaySummary,
  getNahidaPersonaModeDisplayLabel,
} from '@proj-airi/stage-ui/stores/nahida-persona'
import { Button, Callout, FieldCheckbox, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import { useNahidaPersonaSettingsStore } from '../../../stores/settings/nahida-persona'

const personaStore = useNahidaPersonaSettingsStore()
const {
  activeCardName,
  error,
  isActive,
  loading,
  matchesActiveCard,
  modeOptions,
  saving,
  settings,
} = storeToRefs(personaStore)
const { t } = useI18n()

const sectionLabels: Record<string, string> = {
  'fact-anchors': '事实锚点 / Fact anchors',
  'expression-style': '表达风格 / Expression style',
  'memory-boundaries': '记忆边界 / Memory boundaries',
  'taboos': '禁区 / Taboos',
}

const displayModeLabel = computed(() => getNahidaPersonaModeDisplayLabel(settings.value.mode))
const displayActiveModeSummary = computed(() => getNahidaPersonaDisplayModeSummary(settings.value.mode))
const displaySummary = computed(() => getNahidaPersonaDisplaySummary({
  enabled: settings.value.enabled,
  matchesActiveCard: matchesActiveCard.value,
  mode: settings.value.mode,
}))
const displaySections = computed(() => getNahidaPersonaDisplaySectionPreviews(settings.value.mode))

onMounted(() => {
  void personaStore.refresh()
})
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-4']">
    <Callout
      v-if="error"
      theme="orange"
      :label="t('settings.pages.nahida-persona.error-title')"
    >
      {{ error }}
    </Callout>

    <section :class="['flex', 'flex-col', 'gap-3', 'rounded-xl', 'border', 'border-neutral-200', 'bg-white/80', 'p-4', 'dark:border-neutral-800', 'dark:bg-neutral-900/40']">
      <div :class="['flex', 'flex-col', 'gap-1']">
        <h3 :class="['text-sm', 'font-semibold']">
          {{ t('settings.pages.nahida-persona.panel.title') }}
        </h3>
        <p :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
          {{ t('settings.pages.nahida-persona.panel.description') }}
        </p>
      </div>

      <FieldCheckbox
        v-model="settings.enabled"
        :disabled="loading || saving"
        :label="t('settings.pages.nahida-persona.fields.enabled.label')"
        :description="t('settings.pages.nahida-persona.fields.enabled.description')"
      />

      <FieldSelect
        v-model="settings.mode"
        :disabled="loading || saving || !settings.enabled"
        :label="t('settings.pages.nahida-persona.fields.mode.label')"
        :description="t('settings.pages.nahida-persona.fields.mode.description')"
        :options="modeOptions.map(option => ({
          ...option,
          label: t(`settings.pages.nahida-persona.modes.${option.value}.label`),
          description: t(`settings.pages.nahida-persona.modes.${option.value}.description`),
        }))"
      />

      <div :class="['grid', 'gap-2', 'rounded-lg', 'bg-neutral-50', 'p-3', 'text-xs', 'dark:bg-neutral-950/40', 'md:grid-cols-2']">
        <div :class="['break-all', 'text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.nahida-persona.status.active-card') }}:</span>
          {{ activeCardName || t('settings.pages.nahida-persona.status.none') }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.nahida-persona.status.matches') }}:</span>
          {{ matchesActiveCard ? t('settings.pages.nahida-persona.status.yes') : t('settings.pages.nahida-persona.status.no') }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.nahida-persona.status.active') }}:</span>
          {{ isActive ? t('settings.pages.nahida-persona.status.yes') : t('settings.pages.nahida-persona.status.no') }}
        </div>
        <div :class="['text-neutral-600', 'dark:text-neutral-300']">
          <span :class="['font-medium', 'text-neutral-800', 'dark:text-neutral-100']">{{ t('settings.pages.nahida-persona.status.summary') }}:</span>
          {{ displaySummary }}
        </div>
      </div>

      <section :class="['flex', 'flex-col', 'gap-3', 'rounded-lg', 'border', 'border-neutral-200', 'bg-neutral-50/80', 'p-3', 'dark:border-neutral-800', 'dark:bg-neutral-950/30']">
        <div :class="['flex', 'flex-col', 'gap-1']">
          <h4 :class="['text-sm', 'font-medium', 'text-neutral-900', 'dark:text-neutral-100']">
            人格补充预览 / Persona supplement preview
          </h4>
          <p :class="['text-xs', 'text-neutral-600', 'dark:text-neutral-300']">
            当前模式：{{ displayModeLabel }}（{{ settings.mode }}）。{{ displayActiveModeSummary }}
          </p>
        </div>

        <div :class="['grid', 'gap-3', 'xl:grid-cols-2']">
          <article
            v-for="section in displaySections"
            :key="section.id"
            :class="['flex', 'flex-col', 'gap-2', 'rounded-lg', 'bg-white/80', 'p-3', 'text-xs', 'shadow-sm', 'dark:bg-neutral-900/60']"
          >
            <div :class="['flex', 'flex-col', 'gap-1']">
              <h5 :class="['font-medium', 'text-neutral-900', 'dark:text-neutral-100']">
                {{ sectionLabels[section.id] ?? section.title }}
              </h5>
              <p :class="['text-neutral-600', 'dark:text-neutral-300']">
                {{ section.summary }}
              </p>
            </div>

            <ul :class="['flex', 'flex-col', 'gap-1', 'text-neutral-700', 'dark:text-neutral-200']">
              <li
                v-for="item in section.items.slice(0, 3)"
                :key="item"
                :class="['leading-5']"
              >
                • {{ item }}
              </li>
            </ul>
          </article>
        </div>
      </section>

      <div :class="['flex', 'flex-wrap', 'gap-2']">
        <Button
          variant="primary"
          size="sm"
          :disabled="loading || saving"
          :loading="saving"
          :label="t('settings.pages.nahida-persona.actions.save')"
          icon="i-solar:diskette-bold-duotone"
          @click="personaStore.save()"
        />
      </div>
    </section>

    <Callout
      theme="lime"
      :label="t('settings.pages.nahida-persona.guardrails.title')"
    >
      {{ t('settings.pages.nahida-persona.guardrails.description') }}
    </Callout>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.nahida-persona.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.nahida-persona.description
  icon: i-solar:leaf-bold-duotone
  settingsEntry: true
  order: 5.6
  stageTransition:
    name: slide
</route>
