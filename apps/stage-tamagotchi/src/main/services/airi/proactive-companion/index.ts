import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { ExternalCompanionSidecarConfig, ExternalIntegrationSnapshot } from '../../../../shared/external-integrations'
import type {
  ProactiveCompanionActionResult,
  ProactiveCompanionConfigFile,
  ProactiveCompanionContextUpdateInput,
  ProactiveCompanionDecisionSnapshot,
  ProactiveCompanionDispatchEvent,
  ProactiveCompanionEvaluateResult,
  ProactiveCompanionEventKind,
  ProactiveCompanionEventSnapshot,
  ProactiveCompanionLegacyImportSummary,
  ProactiveCompanionPresentation,
  ProactiveCompanionRuntimeSnapshot,
  ProactiveCompanionSettings,
  ProactiveCompanionSignalSource,
  ProactiveCompanionSimulationRequest,
  ProactiveCompanionSourceMode,
  ProactiveCompanionSparkNotifyInput,
  ProactiveCompanionVisionObservation,
} from '../../../../shared/proactive-companion'
import type { ExternalIntegrationsManager } from '../external-integrations'
import type { ExternalMemoryManager } from '../external-memory'
import type { EmbeddedSignalCandidate } from './embedded-engine'

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { app, powerMonitor } from 'electron'

import {
  electronProactiveCompanionClearCooldowns,
  electronProactiveCompanionClearHistory,
  electronProactiveCompanionEvaluateSparkNotify,
  electronProactiveCompanionGetRuntimeSnapshot,
  electronProactiveCompanionGetSourceMode,
  electronProactiveCompanionImportLegacyConfig,
  electronProactiveCompanionLoadConfig,
  electronProactiveCompanionPause,
  electronProactiveCompanionRecordContextUpdate,
  electronProactiveCompanionRecordVisionObservation,
  electronProactiveCompanionRefreshRuntime,
  electronProactiveCompanionRuntimeEvent,
  electronProactiveCompanionSaveConfig,
  electronProactiveCompanionSetSourceMode,
  electronProactiveCompanionSimulateSignal,
  electronProactiveCompanionTriggerManualCheckIn,
} from '../../../../shared/eventa'
import {
  createDefaultProactiveCompanionConfigFile,
  normalizeProactiveCompanionSettings,
  PROACTIVE_COMPANION_CONFIG_VERSION,
  proactiveCompanionConfigFileSchema,
} from '../../../../shared/proactive-companion'
import { createConfig } from '../../../libs/electron/persistence'
import {
  buildIdleCandidate,
  buildManualCheckInCandidate,
  buildMemoryFollowUpCandidate,
  buildSimulationCandidate,
  buildUrgentCandidate,
  buildVisionCandidate,
  detectUrgentKeyword,

  gateEmbeddedCandidate,
  normalizeEmbeddedTopicKey,
} from './embedded-engine'

type MainContext = ReturnType<typeof createContext>['context']
type TimeoutHandle = ReturnType<typeof setTimeout>

const maxRecentDecisions = 30
const compatibilityContextModule = 'proactive-companion'
const importantKinds = new Set(['important', 'alarm', 'critical', 'urgent'])
const reminderKinds = new Set(['reminder', 'todo', 'follow-up'])
const gentleCheckInKinds = new Set(['gentle-check-in', 'check-in', 'checkin', 'nudge', 'ping'])
const defaultPauseDurationMs = 30 * 60 * 1000
const legacyDesktopProfileDirectoryName = 'ai.moeru.airi'
const legacyConfigDirectoryName = 'proactive-companion'
const legacyConfigFileName = 'proactive-config.json'

interface LegacyProactiveConfigShape {
  enabled?: boolean
  idle_threshold_ms?: number
  idle_check_min_ms?: number
  idle_check_max_ms?: number
  global_cooldown_ms?: number
  urgent_cooldown_ms?: number
  memory_cooldown_ms?: number
  vision_cooldown_ms?: number
  same_topic_cooldown_ms?: number
  max_proactive_per_hour?: number
  allow_interrupt_on_urgent?: boolean
  working_nudge_enabled?: boolean
  working_nudge_min_pause_ms?: number
  working_nudge_cooldown_ms?: number
  vision_enabled?: boolean
  memory_enabled?: boolean
  urgent_keywords?: string[]
  [key: string]: unknown
}

interface DeliveryState {
  lastDeliveredAt: number
  lastUrgentAt: number
  lastWorkingNudgeAt: number
  pauseUntil?: number
  recentDeliveredAt: number[]
  sourceDeliveredAt: Map<Extract<ProactiveCompanionSignalSource, 'idle' | 'memory-follow-up' | 'vision' | 'urgent-keyword' | 'manual'>, number>
  topicDeliveredAt: Map<string, number>
  lastVisionSummary?: string
  lastVisionObservedAt?: number
  lastSignalSource?: ProactiveCompanionSignalSource
  lastSignalHeadline?: string
  lastSignalAt?: number
  lastManualTriggerAt?: number
}

/**
 * Normalizes repeated reminder headlines into one small dedupe key.
 *
 * Before:
 * - "Drink water at 22:00!"
 * - "  DRINK   water at 22:30  "
 *
 * After:
 * - "drink water at"
 */
export function normalizeProactiveCompanionTopicKey(headline: string) {
  return headline
    .toLowerCase()
    .replace(/\d+/g, ' ')
    .replace(/[^a-z\u4E00-\u9FA5]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

/**
 * Maps freeform upstream event kinds into the conservative v1 governance set.
 *
 * Before:
 * - "alarm"
 * - "Check-In"
 *
 * After:
 * - "important"
 * - "gentle-check-in"
 */
export function classifyProactiveCompanionKind(rawKind?: string): ProactiveCompanionEventKind {
  const normalizedKind = rawKind?.trim().toLowerCase()
  if (!normalizedKind) {
    return 'unknown'
  }

  if (importantKinds.has(normalizedKind)) {
    return 'important'
  }

  if (reminderKinds.has(normalizedKind)) {
    return 'reminder'
  }

  if (gentleCheckInKinds.has(normalizedKind)) {
    return 'gentle-check-in'
  }

  return 'unknown'
}

function normalizeSourceToken(value?: string) {
  return value?.trim().toLowerCase() ?? ''
}

function getLegacyDesktopProfilePath() {
  return join(app.getPath('appData'), legacyDesktopProfileDirectoryName)
}

function getDefaultLegacyConfigPath() {
  return join(getLegacyDesktopProfilePath(), legacyConfigDirectoryName, legacyConfigFileName)
}

function getSidecarSnapshot(externalIntegrationsManager: ExternalIntegrationsManager) {
  return externalIntegrationsManager.getSnapshots()
    .find((snapshot): snapshot is ExternalIntegrationSnapshot & {
      kind: 'companion-sidecar'
      config: ExternalCompanionSidecarConfig
    } => snapshot.kind === 'companion-sidecar')
}

function buildSourceAliases(config: ExternalCompanionSidecarConfig) {
  const normalizedModuleName = normalizeSourceToken(config.moduleName)
  const normalizedPluginId = normalizeSourceToken(config.pluginId)
  const aliases = new Set<string>()

  if (normalizedModuleName) {
    aliases.add(normalizedModuleName)
    aliases.add(`module:${normalizedModuleName}`)
  }

  if (normalizedPluginId) {
    aliases.add(normalizedPluginId)
    aliases.add(`plugin:${normalizedPluginId}`)
  }

  return aliases
}

function readContextMetadataString(
  event: ProactiveCompanionContextUpdateInput,
  key: string,
) {
  const value = event.data.metadata?.[key]
  return typeof value === 'string' ? value : undefined
}

function normalizeContextDestinations(event: ProactiveCompanionContextUpdateInput) {
  const { destinations } = event.data

  if (Array.isArray(destinations)) {
    return [...destinations]
  }

  if (destinations && typeof destinations === 'object') {
    if ('all' in destinations && destinations.all) {
      return ['all']
    }

    if ('include' in destinations && Array.isArray(destinations.include)) {
      return [...destinations.include]
    }
  }

  return []
}

function createEventSnapshot(event: ProactiveCompanionSparkNotifyInput): ProactiveCompanionEventSnapshot {
  const receivedAt = Date.now()
  const headline = event.data.headline?.trim() || '未命名主动提醒'

  return {
    id: event.data.id,
    eventId: event.data.eventId,
    source: event.source || 'unknown',
    kind: classifyProactiveCompanionKind(event.data.kind),
    rawKind: event.data.kind,
    headline,
    note: event.data.note?.trim() || undefined,
    urgency: event.data.urgency,
    topicKey: normalizeProactiveCompanionTopicKey(`${event.data.kind ?? ''} ${headline}`) || event.data.id,
    destinations: [...(event.data.destinations ?? [])],
    receivedAt,
  }
}

function hasAiriReminderDestination(destinations: string[]) {
  return destinations.some((destination) => {
    const normalizedDestination = normalizeSourceToken(destination)
    return normalizedDestination === 'character' || normalizedDestination === 'all'
  })
}

function hasMeaningfulReminderContent(event: ProactiveCompanionSparkNotifyInput) {
  return Boolean(event.data.headline?.trim() || event.data.note?.trim())
}

function selectPresentation(
  kind: ProactiveCompanionEventKind,
  intensity: ProactiveCompanionSettings['intensity'],
): ProactiveCompanionPresentation {
  if (intensity === 'balanced' && kind === 'important') {
    return 'prominent-reminder'
  }

  return 'light-prompt'
}

function describeSupportedKind(kind: ProactiveCompanionEventKind) {
  switch (kind) {
    case 'gentle-check-in':
      return '轻提醒'
    case 'reminder':
      return '提醒'
    case 'important':
      return '重要提醒'
    default:
      return '未知类型'
  }
}

function classifyCompatibilityContextKind(event: ProactiveCompanionContextUpdateInput): ProactiveCompanionEventKind {
  const priority = readContextMetadataString(event, 'priority')?.trim().toLowerCase()
  const source = readContextMetadataString(event, 'source')?.trim().toLowerCase()

  if (priority === 'high' || source === 'urgent') {
    return 'important'
  }

  if (source === 'idle') {
    return 'gentle-check-in'
  }

  if (source === 'memory' || source === 'vision') {
    return 'reminder'
  }

  return 'unknown'
}

function createCompatibilityContextSnapshot(event: ProactiveCompanionContextUpdateInput): ProactiveCompanionEventSnapshot {
  const receivedAt = Date.now()
  const note = event.data.text?.trim() || undefined
  const metadataSource = readContextMetadataString(event, 'source')
  const metadataTopic = readContextMetadataString(event, 'topic')
  const metadataPriority = readContextMetadataString(event, 'priority')
  const source = metadataSource?.trim() || compatibilityContextModule
  const headline = note
    ? note.replace(/^\[Proactive companion internal instruction\]\s*/i, '').slice(0, 120)
    : '旧版主动陪伴上下文更新'

  return {
    id: event.metadata?.event?.id || event.data.contextId || event.data.id || `legacy-context-${receivedAt}`,
    eventId: event.data.contextId,
    source: `legacy:${source}`,
    kind: classifyCompatibilityContextKind(event),
    rawKind: metadataSource,
    headline,
    note,
    urgency: metadataPriority,
    topicKey: normalizeProactiveCompanionTopicKey(`${metadataSource ?? ''} ${metadataTopic ?? ''} ${headline}`)
      || event.data.contextId
      || event.data.id
      || `legacy-context-${receivedAt}`,
    destinations: normalizeContextDestinations(event),
    receivedAt,
  }
}

function isCompatibilityContextUpdate(event: ProactiveCompanionContextUpdateInput) {
  return readContextMetadataString(event, 'module')?.trim().toLowerCase() === compatibilityContextModule
}

function buildDecision(params: {
  event: ProactiveCompanionEventSnapshot
  decision: ProactiveCompanionDecisionSnapshot['decision']
  reason: string
  presentation: ProactiveCompanionPresentation
  matchedSource: boolean
  sidecarReady: boolean
  cooldownUntil?: number
}): ProactiveCompanionDecisionSnapshot {
  return {
    event: params.event,
    decision: params.decision,
    reason: params.reason,
    presentation: params.presentation,
    matchedSource: params.matchedSource,
    sidecarReady: params.sidecarReady,
    cooldownUntil: params.cooldownUntil,
    decidedAt: Date.now(),
  }
}

function buildDeliveryReason(params: {
  event: ProactiveCompanionEventSnapshot
  intensity: ProactiveCompanionSettings['intensity']
}) {
  if (params.event.kind === 'important' && params.intensity === 'balanced') {
    return '已放行，因为事件通过了来源、目标、内容和冷却检查，且平衡强度允许重要提醒更明显地呈现。'
  }

  if (params.event.kind === 'important') {
    return '已放行，因为事件通过了来源、目标、内容和冷却检查，但低频克制强度会让重要提醒保持轻提示。'
  }

  return '已放行，因为事件通过了来源、目标、内容和冷却检查，并保持在克制的提醒路径上。'
}

function buildLegacyCompatibilityReason(event: ProactiveCompanionEventSnapshot) {
  const legacySource = event.source.replace(/^legacy:/, '')
  const inferredKind = describeSupportedKind(event.kind)

  return `这是通过 legacy context:update 兼容路径记入的一条${inferredKind}事件，来源推断为“${legacySource}”。它只用于历史记录，不会触发新的主动陪伴反应。`
}

function createInitialDeliveryState(): DeliveryState {
  return {
    lastDeliveredAt: 0,
    lastUrgentAt: 0,
    lastWorkingNudgeAt: 0,
    recentDeliveredAt: [],
    sourceDeliveredAt: new Map(),
    topicDeliveredAt: new Map(),
  }
}

function createEmbeddedSignalEvent(candidate: {
  source: Extract<ProactiveCompanionSignalSource, 'idle' | 'memory-follow-up' | 'vision' | 'urgent-keyword' | 'manual'>
  priority: 'low' | 'medium' | 'high'
  headline: string
  note?: string
  topicKey: string
  summary: string
  receivedAt: number
}): ProactiveCompanionSparkNotifyInput {
  const eventId = `embedded:${candidate.source}:${candidate.receivedAt}`
  const kind = candidate.priority === 'high'
    ? 'alarm'
    : candidate.source === 'idle' || candidate.source === 'manual'
      ? 'ping'
      : 'reminder'

  return {
    type: 'spark:notify',
    source: `embedded:${candidate.source}`,
    data: {
      id: eventId,
      eventId,
      kind,
      urgency: candidate.priority === 'high'
        ? 'immediate'
        : candidate.priority === 'medium'
          ? 'soon'
          : 'later',
      headline: candidate.headline,
      note: candidate.note,
      destinations: ['character'],
      payload: {
        sourceMode: 'embedded',
        signalSource: candidate.source,
        topicKey: candidate.topicKey,
        summary: candidate.summary,
      },
    },
  }
}

function normalizeLegacyImportSettings(legacyConfig: LegacyProactiveConfigShape, currentSettings: ProactiveCompanionSettings) {
  const mappedFields: string[] = []
  const unmappedFields: string[] = []
  const nextSettings: Partial<ProactiveCompanionSettings> = {
    ...currentSettings,
    sourceMode: 'embedded',
  }

  const fieldMappings: Array<{
    legacy: keyof LegacyProactiveConfigShape
    apply: (value: unknown) => void
  }> = [
    {
      legacy: 'enabled',
      apply: (value) => {
        if (typeof value === 'boolean') {
          nextSettings.enabled = value
          nextSettings.engineEnabled = value
          mappedFields.push('enabled', 'engineEnabled')
        }
      },
    },
    { legacy: 'idle_threshold_ms', apply: value => typeof value === 'number' && (nextSettings.idleThresholdMs = value, mappedFields.push('idleThresholdMs')) },
    { legacy: 'idle_check_min_ms', apply: value => typeof value === 'number' && (nextSettings.idleCheckMinMs = value, mappedFields.push('idleCheckMinMs')) },
    { legacy: 'idle_check_max_ms', apply: value => typeof value === 'number' && (nextSettings.idleCheckMaxMs = value, mappedFields.push('idleCheckMaxMs')) },
    { legacy: 'global_cooldown_ms', apply: value => typeof value === 'number' && (nextSettings.globalCooldownMs = value, mappedFields.push('globalCooldownMs')) },
    { legacy: 'urgent_cooldown_ms', apply: value => typeof value === 'number' && (nextSettings.urgentCooldownMs = value, mappedFields.push('urgentCooldownMs')) },
    { legacy: 'memory_cooldown_ms', apply: value => typeof value === 'number' && (nextSettings.memoryCooldownMs = value, mappedFields.push('memoryCooldownMs')) },
    { legacy: 'vision_cooldown_ms', apply: value => typeof value === 'number' && (nextSettings.visionCooldownMs = value, mappedFields.push('visionCooldownMs')) },
    {
      legacy: 'same_topic_cooldown_ms',
      apply: (value) => {
        if (typeof value === 'number') {
          nextSettings.sameTopicCooldownMs = value
          mappedFields.push('sameTopicCooldownMs')
        }
      },
    },
    { legacy: 'max_proactive_per_hour', apply: value => typeof value === 'number' && (nextSettings.maxProactivePerHour = value, mappedFields.push('maxProactivePerHour')) },
    { legacy: 'allow_interrupt_on_urgent', apply: value => typeof value === 'boolean' && (nextSettings.allowInterruptOnUrgent = value, mappedFields.push('allowInterruptOnUrgent')) },
    { legacy: 'working_nudge_enabled', apply: value => typeof value === 'boolean' && (nextSettings.workingNudgeEnabled = value, mappedFields.push('workingNudgeEnabled')) },
    { legacy: 'working_nudge_min_pause_ms', apply: value => typeof value === 'number' && (nextSettings.workingNudgeMinPauseMs = value, mappedFields.push('workingNudgeMinPauseMs')) },
    { legacy: 'working_nudge_cooldown_ms', apply: value => typeof value === 'number' && (nextSettings.workingNudgeCooldownMs = value, mappedFields.push('workingNudgeCooldownMs')) },
    { legacy: 'vision_enabled', apply: value => typeof value === 'boolean' && (nextSettings.visionEnabled = value, mappedFields.push('visionEnabled')) },
    { legacy: 'memory_enabled', apply: value => typeof value === 'boolean' && (nextSettings.memoryEnabled = value, mappedFields.push('memoryEnabled')) },
    {
      legacy: 'urgent_keywords',
      apply: (value) => {
        if (Array.isArray(value)) {
          nextSettings.urgentKeywords = value.filter((item): item is string => typeof item === 'string')
          mappedFields.push('urgentKeywords')
        }
      },
    },
  ]

  for (const [legacyField, value] of Object.entries(legacyConfig) as Array<[keyof LegacyProactiveConfigShape, unknown]>) {
    const mapping = fieldMappings.find(item => item.legacy === legacyField)
    if (mapping) {
      mapping.apply(value)
      continue
    }

    unmappedFields.push(String(legacyField))
  }

  mappedFields.push('sourceMode')
  return {
    mappedFields: [...new Set(mappedFields)],
    unmappedFields: [...new Set(unmappedFields)].sort(),
    settings: normalizeProactiveCompanionSettings(nextSettings),
  }
}

/**
 * Desktop-only proactive governance manager for incoming sidecar reminders and
 * embedded rule-driven proactive signals.
 *
 * Use when:
 * - AIRI should apply one stable reminder policy before the shared spark runtime reacts
 * - Renderer windows need persisted settings plus recent governance history
 * - The desktop build should gradually migrate from external sidecar rules to an embedded engine
 *
 * Expects:
 * - The external sidecar path remains available for compatibility when `sourceMode` is `external-sidecar`
 * - The embedded engine only proposes candidates; final delivery still becomes one governance decision snapshot
 *
 * Returns:
 * - One shared manager that owns settings, recent decisions, runtime summaries, and embedded timers
 */
export interface ProactiveCompanionManager {
  loadConfig: () => ProactiveCompanionSettings
  saveConfig: (settings: ProactiveCompanionSettings) => ProactiveCompanionSettings
  getRuntimeSnapshot: () => ProactiveCompanionRuntimeSnapshot
  refreshRuntime: () => Promise<ProactiveCompanionRuntimeSnapshot>
  clearHistory: () => Promise<ProactiveCompanionRuntimeSnapshot>
  evaluateSparkNotify: (event: ProactiveCompanionSparkNotifyInput) => ProactiveCompanionEvaluateResult
  recordContextUpdate: (event: ProactiveCompanionContextUpdateInput) => ProactiveCompanionRuntimeSnapshot
  importLegacyProactiveConfig: () => Promise<ProactiveCompanionLegacyImportSummary>
  getProactiveCompanionSourceMode: () => ProactiveCompanionSourceMode
  setProactiveCompanionSourceMode: (mode: ProactiveCompanionSourceMode) => ProactiveCompanionRuntimeSnapshot
  triggerManualCheckIn: () => Promise<ProactiveCompanionActionResult>
  simulateProactiveSignal: (request: ProactiveCompanionSimulationRequest) => Promise<ProactiveCompanionActionResult>
  pauseProactiveCompanion: (durationMs?: number) => Promise<ProactiveCompanionRuntimeSnapshot>
  clearProactiveCooldowns: () => Promise<ProactiveCompanionRuntimeSnapshot>
  recordVisionObservation: (observation: ProactiveCompanionVisionObservation) => Promise<ProactiveCompanionActionResult>
  subscribeRuntimeEvents: (listener: (event: ProactiveCompanionDispatchEvent) => void) => () => void
}

export function createProactiveCompanionManager(params: {
  externalIntegrationsManager: ExternalIntegrationsManager
  externalMemoryManager: ExternalMemoryManager
  legacyConfigPath?: string
  readLegacyConfigText?: (path: string) => Promise<string>
  getSystemIdleTimeMs?: () => number
  random?: () => number
  setTimeoutFn?: (handler: () => void, delay: number) => TimeoutHandle
  clearTimeoutFn?: (handle: TimeoutHandle) => void
}): ProactiveCompanionManager {
  const defaultConfig = createDefaultProactiveCompanionConfigFile()
  const configStore = createConfig('proactive-companion', 'v1.json', proactiveCompanionConfigFileSchema, {
    default: defaultConfig,
    autoHeal: true,
  })

  const readLegacyConfigText = params.readLegacyConfigText ?? (async path => await readFile(path, 'utf-8'))
  const getSystemIdleTimeMs = params.getSystemIdleTimeMs ?? (() => powerMonitor.getSystemIdleTime() * 1000)
  const random = params.random ?? Math.random
  const setTimeoutFn = params.setTimeoutFn ?? ((handler, delay) => setTimeout(handler, delay))
  const clearTimeoutFn = params.clearTimeoutFn ?? (handle => clearTimeout(handle))

  configStore.setup()

  let recentDecisions: ProactiveCompanionDecisionSnapshot[] = []
  let lastDecision: ProactiveCompanionDecisionSnapshot | undefined
  let lastFailureReason: string | undefined
  let lastEmbeddedRuntimeIssue: string | undefined
  let idleTimer: TimeoutHandle | undefined
  const compatibilityContextRecordedAt = new Map<string, number>()
  const deliveryState = createInitialDeliveryState()
  const runtimeListeners = new Set<(event: ProactiveCompanionDispatchEvent) => void>()

  function getConfigFile(): ProactiveCompanionConfigFile {
    const config = configStore.get()
    if (!config) {
      return defaultConfig
    }

    return {
      version: PROACTIVE_COMPANION_CONFIG_VERSION,
      settings: normalizeProactiveCompanionSettings(config.settings),
    }
  }

  function getSettings() {
    return normalizeProactiveCompanionSettings(getConfigFile().settings)
  }

  async function loadLegacyConfigText() {
    const legacyPath = params.legacyConfigPath ?? getDefaultLegacyConfigPath()

    try {
      return {
        path: legacyPath,
        text: await readLegacyConfigText(legacyPath),
      }
    }
    catch (cause) {
      throw new Error([
        `未找到旧版 proactive 配置文件：${legacyPath}`,
        '。请确认旧桌面 AIRI profile 下的 proactive-companion/proactive-config.json 仍然存在，',
        '或在创建 manager 时显式传入 legacyConfigPath。',
        `底层原因：${errorMessageFrom(cause) ?? 'Unknown error.'}`,
      ].join(''))
    }
  }

  function saveSettings(settings: ProactiveCompanionSettings) {
    const next: ProactiveCompanionConfigFile = {
      version: PROACTIVE_COMPANION_CONFIG_VERSION,
      settings: normalizeProactiveCompanionSettings(settings),
    }
    configStore.update(next)
    ensureEmbeddedIdleLoop()
    return next.settings
  }

  function getSourceMode() {
    return getSettings().sourceMode
  }

  function setSourceMode(mode: ProactiveCompanionSourceMode) {
    const settings = saveSettings({
      ...getSettings(),
      sourceMode: mode,
    })
    return buildRuntimeState({
      settings,
      sidecarSnapshot: getSidecarSnapshot(params.externalIntegrationsManager),
      recentDecisions,
      lastDecision,
      lastFailureReason,
      lastEmbeddedRuntimeIssue,
      deliveryState,
    })
  }

  function clearIdleLoop() {
    if (!idleTimer) {
      return
    }

    clearTimeoutFn(idleTimer)
    idleTimer = undefined
  }

  function isEmbeddedLoopEnabled(settings: ProactiveCompanionSettings) {
    if (!settings.enabled || !settings.engineEnabled || settings.sourceMode !== 'embedded') {
      return false
    }

    return true
  }

  function pickIdleDelay(settings: ProactiveCompanionSettings) {
    const min = settings.idleCheckMinMs
    const max = Math.max(settings.idleCheckMaxMs, min)
    const distance = max - min
    return min + Math.round(random() * distance)
  }

  async function runIdleCheck() {
    idleTimer = undefined

    try {
      await evaluateEmbeddedIdleSignal()
    }
    finally {
      ensureEmbeddedIdleLoop()
    }
  }

  function ensureEmbeddedIdleLoop() {
    clearIdleLoop()
    const settings = getSettings()

    if (!isEmbeddedLoopEnabled(settings)) {
      return
    }

    const now = Date.now()
    if (deliveryState.pauseUntil && deliveryState.pauseUntil > now) {
      idleTimer = setTimeoutFn(() => {
        void runIdleCheck()
      }, Math.max(deliveryState.pauseUntil - now, 1_000))
      return
    }

    idleTimer = setTimeoutFn(() => {
      void runIdleCheck()
    }, pickIdleDelay(settings))
  }

  function pushDecision(decision: ProactiveCompanionDecisionSnapshot) {
    recentDecisions = [decision, ...recentDecisions].slice(0, maxRecentDecisions)
    lastDecision = decision
    if (decision.decision !== 'delivered') {
      lastFailureReason = decision.reason
    }
    else {
      lastFailureReason = undefined
    }
  }

  function pruneDecisionMaps() {
    while (compatibilityContextRecordedAt.size > maxRecentDecisions * 4) {
      const oldestKey = compatibilityContextRecordedAt.keys().next().value as string | undefined
      if (!oldestKey) {
        break
      }

      compatibilityContextRecordedAt.delete(oldestKey)
    }
  }

  function markSignalSeen(source: ProactiveCompanionSignalSource, headline: string, receivedAt: number) {
    deliveryState.lastSignalSource = source
    deliveryState.lastSignalHeadline = headline
    deliveryState.lastSignalAt = receivedAt
    if (source === 'manual') {
      deliveryState.lastManualTriggerAt = receivedAt
    }
  }

  function recordDeliveredDecision(paramsForRecord: {
    source: Extract<ProactiveCompanionSignalSource, 'idle' | 'memory-follow-up' | 'vision' | 'urgent-keyword' | 'manual'>
    topicKey: string
    deliveredAt: number
    urgent: boolean
    recordAsWorkingNudge?: boolean
    trackHourlyLimit: boolean
  }) {
    deliveryState.lastDeliveredAt = paramsForRecord.deliveredAt
    deliveryState.topicDeliveredAt.set(paramsForRecord.topicKey, paramsForRecord.deliveredAt)
    deliveryState.sourceDeliveredAt.set(paramsForRecord.source, paramsForRecord.deliveredAt)

    if (paramsForRecord.trackHourlyLimit) {
      deliveryState.recentDeliveredAt = [
        ...deliveryState.recentDeliveredAt.filter(value => paramsForRecord.deliveredAt - value < 60 * 60 * 1000),
        paramsForRecord.deliveredAt,
      ]
    }

    if (paramsForRecord.urgent) {
      deliveryState.lastUrgentAt = paramsForRecord.deliveredAt
    }

    if (paramsForRecord.recordAsWorkingNudge) {
      deliveryState.lastWorkingNudgeAt = paramsForRecord.deliveredAt
    }
  }

  function clearExpiredPause(now = Date.now()) {
    if (deliveryState.pauseUntil && deliveryState.pauseUntil <= now) {
      deliveryState.pauseUntil = undefined
    }
  }

  function getFollowUpCandidate(settings: ProactiveCompanionSettings) {
    if (!settings.memoryEnabled) {
      return undefined
    }

    const followUps = params.externalMemoryManager.getLastMemoryUsage().context?.sections.followUps ?? []

    for (const followUp of followUps) {
      const normalizedTopicKey = normalizeEmbeddedTopicKey(`memory ${followUp}`)
      const lastTopicDeliveredAt = deliveryState.topicDeliveredAt.get(normalizedTopicKey) ?? 0

      if (Date.now() - lastTopicDeliveredAt < settings.sameTopicCooldownMs) {
        continue
      }

      return followUp
    }

    return undefined
  }

  function safeGetIdleMs() {
    try {
      const value = getSystemIdleTimeMs()
      if (!Number.isFinite(value) || value < 0) {
        throw new Error('System idle time is not available.')
      }

      lastEmbeddedRuntimeIssue = undefined
      return Math.round(value)
    }
    catch (error) {
      lastEmbeddedRuntimeIssue = error instanceof Error
        ? error.message
        : 'System idle time is not available.'
      return undefined
    }
  }

  function buildRuntimeState(paramsForBuild: {
    settings: ProactiveCompanionSettings
    sidecarSnapshot?: ExternalIntegrationSnapshot
    recentDecisions: ProactiveCompanionDecisionSnapshot[]
    lastDecision?: ProactiveCompanionDecisionSnapshot
    lastFailureReason?: string
    lastEmbeddedRuntimeIssue?: string
    deliveryState: DeliveryState
  }): ProactiveCompanionRuntimeSnapshot {
    clearExpiredPause()

    const sidecarStatus = paramsForBuild.sidecarSnapshot?.status
    const sidecarConnected = sidecarStatus?.state === 'ready'
    const engineActive = isEmbeddedLoopEnabled(paramsForBuild.settings)
    const sourceMode = paramsForBuild.settings.sourceMode

    const state = (() => {
      if (!paramsForBuild.settings.enabled) {
        return 'disabled'
      }

      if (sourceMode === 'embedded') {
        if (!paramsForBuild.settings.engineEnabled) {
          return 'disabled'
        }

        if (paramsForBuild.lastEmbeddedRuntimeIssue) {
          return 'degraded'
        }

        return 'ready'
      }

      if (!paramsForBuild.sidecarSnapshot) {
        return 'unavailable'
      }

      if (sidecarConnected) {
        return 'ready'
      }

      if (sidecarStatus?.state === 'disabled') {
        return 'disabled'
      }

      return 'degraded'
    })()

    const summary = (() => {
      if (state === 'disabled') {
        if (sourceMode === 'embedded' && paramsForBuild.settings.enabled) {
          return '已切到内建模式，但内建引擎当前关闭。'
        }

        return '主动陪伴已关闭。'
      }

      if (sourceMode === 'embedded') {
        if (paramsForBuild.deliveryState.pauseUntil && paramsForBuild.deliveryState.pauseUntil > Date.now()) {
          return '内建主动陪伴已暂停，当前只保留历史与操作台控制。'
        }

        if (paramsForBuild.lastEmbeddedRuntimeIssue) {
          return '内建主动陪伴需要关注，空闲探测或规则运行最近出现了问题。'
        }

        return '内建主动陪伴已就绪，正在按规则观察空闲、记忆和视觉信号。'
      }

      if (!paramsForBuild.sidecarSnapshot) {
        return '主动陪伴 sidecar 集成尚未配置。'
      }

      if (sidecarConnected) {
        return '主动陪伴 sidecar 已就绪。'
      }

      return '主动陪伴 sidecar 已接入 AIRI，但当前放行链路已降级。'
    })()

    const lastDegradedReason = sourceMode === 'embedded'
      ? paramsForBuild.lastEmbeddedRuntimeIssue
      : state === 'degraded' || state === 'unavailable'
        ? sidecarStatus?.summary
        : undefined

    return {
      settings: paramsForBuild.settings,
      state,
      summary,
      sidecarConnected,
      sidecarSummary: sidecarStatus?.summary ?? (sourceMode === 'embedded'
        ? '当前模式不依赖 external sidecar 的 ready 状态。'
        : 'Sidecar 状态暂不可用。'),
      engineActive,
      pauseUntil: paramsForBuild.deliveryState.pauseUntil,
      lastSignalSource: paramsForBuild.deliveryState.lastSignalSource,
      lastSignalHeadline: paramsForBuild.deliveryState.lastSignalHeadline,
      lastSignalAt: paramsForBuild.deliveryState.lastSignalAt,
      lastManualTriggerAt: paramsForBuild.deliveryState.lastManualTriggerAt,
      lastDegradedReason,
      recentDecisions: paramsForBuild.recentDecisions,
      lastDecision: paramsForBuild.lastDecision,
      lastFailureReason: paramsForBuild.lastFailureReason,
      refreshedAt: Date.now(),
    }
  }

  function emitRuntimeEvent(event: ProactiveCompanionDispatchEvent) {
    for (const listener of runtimeListeners) {
      listener(event)
    }
  }

  async function evaluateEmbeddedCandidate(paramsForEvaluate: {
    candidate: EmbeddedSignalCandidate
    currentIdleMs?: number
    requireEmbeddedMode: boolean
    actionMessage: string
    trackHourlyLimit: boolean
  }): Promise<ProactiveCompanionActionResult> {
    const settings = getSettings()
    if (paramsForEvaluate.requireEmbeddedMode && settings.sourceMode !== 'embedded') {
      return {
        ok: true,
        message: '当前仍在 external-sidecar 模式，这个内建信号已被忽略。',
        runtime: buildRuntimeState({
          settings,
          sidecarSnapshot: getSidecarSnapshot(params.externalIntegrationsManager),
          recentDecisions,
          lastDecision,
          lastFailureReason,
          lastEmbeddedRuntimeIssue,
          deliveryState,
        }),
      }
    }

    const now = Date.now()
    const currentIdleMs = paramsForEvaluate.currentIdleMs ?? safeGetIdleMs() ?? 0
    const sparkNotify = createEmbeddedSignalEvent(paramsForEvaluate.candidate)
    const eventSnapshot = createEventSnapshot(sparkNotify)
    const gate = gateEmbeddedCandidate({
      candidate: paramsForEvaluate.candidate,
      currentIdleMs,
      now,
      settings,
      state: deliveryState,
    })
    const decision = buildDecision({
      event: eventSnapshot,
      decision: gate.decision,
      reason: gate.reason,
      presentation: gate.decision === 'delivered'
        ? selectPresentation(eventSnapshot.kind, settings.intensity)
        : 'silent',
      matchedSource: true,
      sidecarReady: getSidecarSnapshot(params.externalIntegrationsManager)?.status.state === 'ready',
      cooldownUntil: gate.cooldownUntil,
    })

    markSignalSeen(paramsForEvaluate.candidate.source, eventSnapshot.headline, eventSnapshot.receivedAt)

    if (decision.decision === 'delivered') {
      recordDeliveredDecision({
        source: paramsForEvaluate.candidate.source,
        topicKey: eventSnapshot.topicKey,
        deliveredAt: now,
        urgent: paramsForEvaluate.candidate.priority === 'high',
        recordAsWorkingNudge: gate.recordAsWorkingNudge,
        trackHourlyLimit: paramsForEvaluate.trackHourlyLimit,
      })
    }

    pushDecision(decision)

    const runtime = buildRuntimeState({
      settings,
      sidecarSnapshot: getSidecarSnapshot(params.externalIntegrationsManager),
      recentDecisions,
      lastDecision,
      lastFailureReason,
      lastEmbeddedRuntimeIssue,
      deliveryState,
    })

    emitRuntimeEvent({
      decision,
      runtime,
      sparkNotify: decision.decision === 'delivered' ? sparkNotify : undefined,
    })

    return {
      ok: true,
      message: gate.decision === 'delivered'
        ? paramsForEvaluate.actionMessage
        : gate.reason,
      decision,
      runtime,
    }
  }

  async function evaluateEmbeddedIdleSignal() {
    const settings = getSettings()
    if (settings.sourceMode !== 'embedded' || !settings.enabled || !settings.engineEnabled) {
      return
    }

    const idleMs = safeGetIdleMs()
    if (typeof idleMs !== 'number') {
      return
    }

    if (idleMs < settings.idleThresholdMs) {
      return
    }

    const followUp = getFollowUpCandidate(settings)
    const candidate = followUp
      ? buildMemoryFollowUpCandidate(followUp)
      : buildIdleCandidate()

    await evaluateEmbeddedCandidate({
      candidate,
      currentIdleMs: idleMs,
      requireEmbeddedMode: true,
      actionMessage: followUp
        ? '已根据稳定待跟进事项触发一次内建提醒。'
        : '已根据空闲状态触发一次内建 check-in。',
      trackHourlyLimit: true,
    })
  }

  function getRuntimeSnapshot() {
    ensureEmbeddedIdleLoop()
    return buildRuntimeState({
      settings: getSettings(),
      sidecarSnapshot: getSidecarSnapshot(params.externalIntegrationsManager),
      recentDecisions,
      lastDecision,
      lastFailureReason,
      lastEmbeddedRuntimeIssue,
      deliveryState,
    })
  }

  async function refreshRuntime() {
    ensureEmbeddedIdleLoop()
    return getRuntimeSnapshot()
  }

  async function clearHistory() {
    recentDecisions = []
    lastDecision = undefined
    lastFailureReason = undefined
    lastEmbeddedRuntimeIssue = undefined
    deliveryState.lastDeliveredAt = 0
    deliveryState.lastUrgentAt = 0
    deliveryState.lastWorkingNudgeAt = 0
    deliveryState.pauseUntil = undefined
    deliveryState.recentDeliveredAt = []
    deliveryState.sourceDeliveredAt.clear()
    deliveryState.topicDeliveredAt.clear()
    deliveryState.lastSignalAt = undefined
    deliveryState.lastSignalHeadline = undefined
    deliveryState.lastSignalSource = undefined
    deliveryState.lastManualTriggerAt = undefined
    deliveryState.lastVisionObservedAt = undefined
    deliveryState.lastVisionSummary = undefined
    compatibilityContextRecordedAt.clear()
    ensureEmbeddedIdleLoop()
    return getRuntimeSnapshot()
  }

  function evaluateSparkNotify(event: ProactiveCompanionSparkNotifyInput): ProactiveCompanionEvaluateResult {
    const settings = getSettings()
    const sidecarSnapshot = getSidecarSnapshot(params.externalIntegrationsManager)
    const sidecarConfig = sidecarSnapshot?.config
    const matchedSource = sidecarConfig
      ? buildSourceAliases(sidecarConfig).has(normalizeSourceToken(event.source))
      : false

    if (!matchedSource) {
      return {
        managed: false,
        runtime: buildRuntimeState({
          settings,
          sidecarSnapshot,
          recentDecisions,
          lastDecision,
          lastFailureReason,
          lastEmbeddedRuntimeIssue,
          deliveryState,
        }),
      }
    }

    const eventSnapshot = createEventSnapshot(event)
    const sidecarReady = sidecarSnapshot?.status.state === 'ready'
    const now = Date.now()
    const globalCooldownUntil = deliveryState.lastDeliveredAt + settings.globalCooldownMs
    const topicCooldownUntil = (deliveryState.topicDeliveredAt.get(eventSnapshot.topicKey) ?? 0) + settings.topicCooldownMs

    const decision = (() => {
      if (settings.sourceMode === 'embedded') {
        return buildDecision({
          event: eventSnapshot,
          decision: 'suppressed',
          reason: '已压制，因为当前 source mode 已切换为 embedded，external sidecar 信号不会再进入放行链路。',
          presentation: 'silent',
          matchedSource,
          sidecarReady,
        })
      }

      if (!settings.enabled) {
        return buildDecision({
          event: eventSnapshot,
          decision: 'suppressed',
          reason: '已压制，因为主动陪伴已关闭。',
          presentation: 'silent',
          matchedSource,
          sidecarReady,
        })
      }

      if (!sidecarReady) {
        return buildDecision({
          event: eventSnapshot,
          decision: 'dropped',
          reason: sidecarSnapshot?.status.summary
            ? `已丢弃，因为 companion sidecar 当前未就绪：${sidecarSnapshot.status.summary}`
            : '已丢弃，因为 companion sidecar 当前未就绪。',
          presentation: 'silent',
          matchedSource,
          sidecarReady,
        })
      }

      if (!hasAiriReminderDestination(eventSnapshot.destinations)) {
        return buildDecision({
          event: eventSnapshot,
          decision: 'suppressed',
          reason: '已压制，因为 sidecar 事件没有指向 AIRI 角色提醒目标。',
          presentation: 'silent',
          matchedSource,
          sidecarReady,
        })
      }

      if (!hasMeaningfulReminderContent(event)) {
        return buildDecision({
          event: eventSnapshot,
          decision: 'suppressed',
          reason: '已压制，因为 sidecar 事件没有提供值得展示为提醒的标题或备注。',
          presentation: 'silent',
          matchedSource,
          sidecarReady,
        })
      }

      if (eventSnapshot.kind === 'unknown') {
        return buildDecision({
          event: eventSnapshot,
          decision: 'suppressed',
          reason: `已压制，因为 sidecar 事件类型“${eventSnapshot.rawKind ?? '未知'}”没有映射到支持的轻提醒、提醒或重要提醒类别。`,
          presentation: 'silent',
          matchedSource,
          sidecarReady,
        })
      }

      if (now < globalCooldownUntil) {
        return buildDecision({
          event: eventSnapshot,
          decision: 'suppressed',
          reason: '已压制，因为全局主动陪伴冷却仍在生效，最近刚有一次已放行提醒。',
          presentation: 'silent',
          matchedSource,
          sidecarReady,
          cooldownUntil: globalCooldownUntil,
        })
      }

      if (now < topicCooldownUntil) {
        return buildDecision({
          event: eventSnapshot,
          decision: 'suppressed',
          reason: '已压制，因为相似的主动陪伴提醒最近已经放行过了，主题冷却仍在生效。',
          presentation: 'silent',
          matchedSource,
          sidecarReady,
          cooldownUntil: topicCooldownUntil,
        })
      }

      return buildDecision({
        event: eventSnapshot,
        decision: 'delivered',
        reason: buildDeliveryReason({
          event: eventSnapshot,
          intensity: settings.intensity,
        }),
        presentation: selectPresentation(eventSnapshot.kind, settings.intensity),
        matchedSource,
        sidecarReady,
      })
    })()

    if (decision.decision === 'delivered') {
      deliveryState.lastDeliveredAt = now
      deliveryState.topicDeliveredAt.set(eventSnapshot.topicKey, now)
    }

    markSignalSeen('external-sidecar', eventSnapshot.headline, eventSnapshot.receivedAt)
    pushDecision(decision)

    return {
      managed: true,
      decision,
      runtime: buildRuntimeState({
        settings,
        sidecarSnapshot,
        recentDecisions,
        lastDecision,
        lastFailureReason,
        lastEmbeddedRuntimeIssue,
        deliveryState,
      }),
    }
  }

  function recordContextUpdate(event: ProactiveCompanionContextUpdateInput) {
    if (!isCompatibilityContextUpdate(event)) {
      return getRuntimeSnapshot()
    }

    const dedupeKey = event.metadata?.event?.id
      || event.data.contextId
      || event.data.id
      || `${readContextMetadataString(event, 'source') ?? 'unknown'}:${readContextMetadataString(event, 'topic') ?? event.data.text ?? 'event'}`

    if (compatibilityContextRecordedAt.has(dedupeKey)) {
      return getRuntimeSnapshot()
    }

    compatibilityContextRecordedAt.set(dedupeKey, Date.now())
    pruneDecisionMaps()

    const sidecarSnapshot = getSidecarSnapshot(params.externalIntegrationsManager)
    const sidecarReady = sidecarSnapshot?.status.state === 'ready'
    const eventSnapshot = createCompatibilityContextSnapshot(event)
    const decision = buildDecision({
      event: eventSnapshot,
      decision: 'delivered',
      reason: buildLegacyCompatibilityReason(eventSnapshot),
      presentation: selectPresentation(eventSnapshot.kind, getSettings().intensity),
      matchedSource: true,
      sidecarReady,
    })

    markSignalSeen('legacy-context', eventSnapshot.headline, eventSnapshot.receivedAt)
    pushDecision(decision)

    return buildRuntimeState({
      settings: getSettings(),
      sidecarSnapshot,
      recentDecisions,
      lastDecision,
      lastFailureReason,
      lastEmbeddedRuntimeIssue,
      deliveryState,
    })
  }

  async function importLegacyProactiveConfig() {
    const currentSettings = getSettings()
    const legacySource = await loadLegacyConfigText()
    let legacyConfig: LegacyProactiveConfigShape

    try {
      legacyConfig = JSON.parse(legacySource.text) as LegacyProactiveConfigShape
    }
    catch (cause) {
      throw new Error(`旧版 proactive 配置不是有效 JSON：${legacySource.path}。${errorMessageFrom(cause) ?? 'Unknown parse error.'}`)
    }

    const mapped = normalizeLegacyImportSettings(legacyConfig, currentSettings)
    const switchedToEmbedded = currentSettings.sourceMode !== 'embedded'
    const settings = saveSettings(mapped.settings)

    return {
      mappedFields: mapped.mappedFields.sort(),
      unmappedFields: mapped.unmappedFields,
      sourceMode: settings.sourceMode,
      switchedToEmbedded,
      settings,
      importedAt: Date.now(),
    }
  }

  async function triggerManualCheckIn() {
    return await evaluateEmbeddedCandidate({
      candidate: buildManualCheckInCandidate(),
      requireEmbeddedMode: false,
      actionMessage: '已手动触发一次轻量 check-in。',
      trackHourlyLimit: true,
    })
  }

  async function simulateProactiveSignal(request: ProactiveCompanionSimulationRequest) {
    return await evaluateEmbeddedCandidate({
      candidate: buildSimulationCandidate(request),
      requireEmbeddedMode: false,
      actionMessage: '已完成一次模拟信号演练。',
      trackHourlyLimit: request.kind !== 'manual-check-in',
    })
  }

  async function pauseProactiveCompanion(durationMs = defaultPauseDurationMs) {
    deliveryState.pauseUntil = Date.now() + Math.max(durationMs, 1_000)
    ensureEmbeddedIdleLoop()
    return getRuntimeSnapshot()
  }

  async function clearProactiveCooldowns() {
    deliveryState.lastDeliveredAt = 0
    deliveryState.lastUrgentAt = 0
    deliveryState.lastWorkingNudgeAt = 0
    deliveryState.pauseUntil = undefined
    deliveryState.recentDeliveredAt = []
    deliveryState.sourceDeliveredAt.clear()
    deliveryState.topicDeliveredAt.clear()
    ensureEmbeddedIdleLoop()
    return getRuntimeSnapshot()
  }

  async function recordVisionObservation(observation: ProactiveCompanionVisionObservation) {
    const settings = getSettings()
    if (settings.sourceMode !== 'embedded' || !settings.engineEnabled || !settings.visionEnabled) {
      return {
        ok: true,
        message: '当前未启用 embedded vision lane，这条视觉观察已忽略。',
        runtime: getRuntimeSnapshot(),
      }
    }

    const normalizedSummary = observation.summary.trim()
    if (!normalizedSummary) {
      return {
        ok: true,
        message: '视觉观察为空，未产生新的主动信号。',
        runtime: getRuntimeSnapshot(),
      }
    }

    const previousSummary = deliveryState.lastVisionSummary
    deliveryState.lastVisionSummary = normalizedSummary
    deliveryState.lastVisionObservedAt = observation.capturedAt ?? Date.now()

    if (detectUrgentKeyword(normalizedSummary, settings.urgentKeywords)) {
      return await evaluateEmbeddedCandidate({
        candidate: buildUrgentCandidate(normalizedSummary, observation.capturedAt),
        requireEmbeddedMode: true,
        actionMessage: '视觉观察命中了紧急关键词，已进入主动提醒治理。',
        trackHourlyLimit: true,
      })
    }

    if (normalizedSummary === previousSummary) {
      return {
        ok: true,
        message: '视觉摘要没有显著变化，未产生新的主动信号。',
        runtime: getRuntimeSnapshot(),
      }
    }

    return await evaluateEmbeddedCandidate({
      candidate: buildVisionCandidate(observation),
      requireEmbeddedMode: true,
      actionMessage: '已根据视觉变化触发一次内建提醒。',
      trackHourlyLimit: true,
    })
  }

  function subscribeRuntimeEvents(listener: (event: ProactiveCompanionDispatchEvent) => void) {
    runtimeListeners.add(listener)
    return () => {
      runtimeListeners.delete(listener)
    }
  }

  ensureEmbeddedIdleLoop()

  return {
    loadConfig: getSettings,
    saveConfig: saveSettings,
    getRuntimeSnapshot,
    refreshRuntime,
    clearHistory,
    evaluateSparkNotify,
    recordContextUpdate,
    importLegacyProactiveConfig,
    getProactiveCompanionSourceMode: getSourceMode,
    setProactiveCompanionSourceMode: setSourceMode,
    triggerManualCheckIn,
    simulateProactiveSignal,
    pauseProactiveCompanion,
    clearProactiveCooldowns,
    recordVisionObservation,
    subscribeRuntimeEvents,
  }
}

export function createProactiveCompanionService(params: {
  context: MainContext
  manager: ProactiveCompanionManager
}) {
  params.manager.subscribeRuntimeEvents((event) => {
    params.context.emit(electronProactiveCompanionRuntimeEvent, event)
  })

  defineInvokeHandler(params.context, electronProactiveCompanionLoadConfig, async () => {
    return params.manager.loadConfig()
  })

  defineInvokeHandler(params.context, electronProactiveCompanionSaveConfig, async (settings) => {
    return params.manager.saveConfig(settings)
  })

  defineInvokeHandler(params.context, electronProactiveCompanionGetRuntimeSnapshot, async () => {
    return params.manager.getRuntimeSnapshot()
  })

  defineInvokeHandler(params.context, electronProactiveCompanionRefreshRuntime, async () => {
    return await params.manager.refreshRuntime()
  })

  defineInvokeHandler(params.context, electronProactiveCompanionClearHistory, async () => {
    return await params.manager.clearHistory()
  })

  defineInvokeHandler(params.context, electronProactiveCompanionEvaluateSparkNotify, async (event) => {
    return params.manager.evaluateSparkNotify(event)
  })

  defineInvokeHandler(params.context, electronProactiveCompanionRecordContextUpdate, async (event) => {
    return params.manager.recordContextUpdate(event)
  })

  defineInvokeHandler(params.context, electronProactiveCompanionImportLegacyConfig, async () => {
    return await params.manager.importLegacyProactiveConfig()
  })

  defineInvokeHandler(params.context, electronProactiveCompanionGetSourceMode, async () => {
    return params.manager.getProactiveCompanionSourceMode()
  })

  defineInvokeHandler(params.context, electronProactiveCompanionSetSourceMode, async (mode) => {
    return params.manager.setProactiveCompanionSourceMode(mode)
  })

  defineInvokeHandler(params.context, electronProactiveCompanionTriggerManualCheckIn, async () => {
    return await params.manager.triggerManualCheckIn()
  })

  defineInvokeHandler(params.context, electronProactiveCompanionSimulateSignal, async (request) => {
    return await params.manager.simulateProactiveSignal(request)
  })

  defineInvokeHandler(params.context, electronProactiveCompanionPause, async (request) => {
    return await params.manager.pauseProactiveCompanion(request?.durationMs)
  })

  defineInvokeHandler(params.context, electronProactiveCompanionClearCooldowns, async () => {
    return await params.manager.clearProactiveCooldowns()
  })

  defineInvokeHandler(params.context, electronProactiveCompanionRecordVisionObservation, async (observation) => {
    return await params.manager.recordVisionObservation(observation)
  })
}
