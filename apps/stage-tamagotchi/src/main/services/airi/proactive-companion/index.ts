import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { ExternalCompanionSidecarConfig, ExternalIntegrationSnapshot } from '../../../../shared/external-integrations'
import type {
  ProactiveCompanionConfigFile,
  ProactiveCompanionContextUpdateInput,
  ProactiveCompanionDecisionSnapshot,
  ProactiveCompanionEvaluateResult,
  ProactiveCompanionEventKind,
  ProactiveCompanionEventSnapshot,
  ProactiveCompanionPresentation,
  ProactiveCompanionRuntimeSnapshot,
  ProactiveCompanionSettings,
  ProactiveCompanionSparkNotifyInput,
} from '../../../../shared/proactive-companion'
import type { ExternalIntegrationsManager } from '../external-integrations'

import { defineInvokeHandler } from '@moeru/eventa'

import {
  electronProactiveCompanionClearHistory,
  electronProactiveCompanionEvaluateSparkNotify,
  electronProactiveCompanionGetRuntimeSnapshot,
  electronProactiveCompanionLoadConfig,
  electronProactiveCompanionRecordContextUpdate,
  electronProactiveCompanionRefreshRuntime,
  electronProactiveCompanionSaveConfig,
} from '../../../../shared/eventa'
import {
  createDefaultProactiveCompanionConfigFile,
  normalizeProactiveCompanionSettings,
  PROACTIVE_COMPANION_CONFIG_VERSION,
  proactiveCompanionConfigFileSchema,
} from '../../../../shared/proactive-companion'
import { createConfig } from '../../../libs/electron/persistence'

type MainContext = ReturnType<typeof createContext>['context']

const maxRecentDecisions = 30
const importantKinds = new Set(['important', 'alarm', 'critical', 'urgent'])
const reminderKinds = new Set(['reminder', 'todo', 'follow-up'])
const gentleCheckInKinds = new Set(['gentle-check-in', 'check-in', 'checkin', 'nudge', 'ping'])
const compatibilityContextModule = 'proactive-companion'

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
  const headline = event.data.headline?.trim() || '未命名主动陪伴提醒'

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
    ? note
        .replace(/^\[Proactive companion internal instruction\]\s*/i, '')
        .slice(0, 120)
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

function buildRuntimeState(params: {
  settings: ProactiveCompanionSettings
  sidecarSnapshot?: ExternalIntegrationSnapshot
  recentDecisions: ProactiveCompanionDecisionSnapshot[]
  lastDecision?: ProactiveCompanionDecisionSnapshot
  lastFailureReason?: string
}): ProactiveCompanionRuntimeSnapshot {
  const sidecarStatus = params.sidecarSnapshot?.status
  const sidecarConnected = sidecarStatus?.state === 'ready'

  const state = (() => {
    if (!params.settings.enabled) {
      return 'disabled'
    }

    if (!params.sidecarSnapshot) {
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
      return '主动陪伴已关闭。'
    }

    if (!params.sidecarSnapshot) {
      return '主动陪伴 sidecar 集成尚未配置。'
    }

    if (sidecarConnected) {
      return '主动陪伴已就绪。'
    }

    return '主动陪伴 sidecar 已接入 AIRI，但当前放行链路已降级。'
  })()

  return {
    settings: params.settings,
    state,
    summary,
    sidecarConnected,
    sidecarSummary: sidecarStatus?.summary ?? 'sidecar 状态暂不可用。',
    recentDecisions: params.recentDecisions,
    lastDecision: params.lastDecision,
    lastFailureReason: params.lastFailureReason,
    refreshedAt: Date.now(),
  }
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

/**
 * Desktop-only proactive governance manager for incoming sidecar reminders.
 *
 * Use when:
 * - AIRI should apply one stable reminder policy before the shared spark runtime reacts
 * - Renderer windows need persisted settings plus recent governance history
 *
 * Expects:
 * - The sidecar itself continues to run externally and is already represented by the integration layer
 *
 * Returns:
 * - One shared manager that owns settings, recent decisions, and runtime summaries
 */
export interface ProactiveCompanionManager {
  loadConfig: () => ProactiveCompanionSettings
  saveConfig: (settings: ProactiveCompanionSettings) => ProactiveCompanionSettings
  getRuntimeSnapshot: () => ProactiveCompanionRuntimeSnapshot
  refreshRuntime: () => Promise<ProactiveCompanionRuntimeSnapshot>
  clearHistory: () => Promise<ProactiveCompanionRuntimeSnapshot>
  evaluateSparkNotify: (event: ProactiveCompanionSparkNotifyInput) => ProactiveCompanionEvaluateResult
  recordContextUpdate: (event: ProactiveCompanionContextUpdateInput) => ProactiveCompanionRuntimeSnapshot
}

export function createProactiveCompanionManager(params: {
  externalIntegrationsManager: ExternalIntegrationsManager
}): ProactiveCompanionManager {
  const defaultConfig = createDefaultProactiveCompanionConfigFile()
  const configStore = createConfig('proactive-companion', 'v1.json', proactiveCompanionConfigFileSchema, {
    default: defaultConfig,
    autoHeal: true,
  })

  configStore.setup()

  let recentDecisions: ProactiveCompanionDecisionSnapshot[] = []
  let lastDecision: ProactiveCompanionDecisionSnapshot | undefined
  let lastFailureReason: string | undefined
  let lastDeliveredAt = 0
  const topicDeliveredAt = new Map<string, number>()
  const compatibilityContextRecordedAt = new Map<string, number>()

  function getConfigFile(): ProactiveCompanionConfigFile {
    return configStore.get() ?? defaultConfig
  }

  function getSettings() {
    return normalizeProactiveCompanionSettings(getConfigFile().settings)
  }

  function saveSettings(settings: ProactiveCompanionSettings) {
    const next: ProactiveCompanionConfigFile = {
      version: PROACTIVE_COMPANION_CONFIG_VERSION,
      settings: normalizeProactiveCompanionSettings(settings),
    }
    configStore.update(next)
    return next.settings
  }

  function getRuntimeSnapshot() {
    return buildRuntimeState({
      settings: getSettings(),
      sidecarSnapshot: getSidecarSnapshot(params.externalIntegrationsManager),
      recentDecisions,
      lastDecision,
      lastFailureReason,
    })
  }

  async function refreshRuntime() {
    return getRuntimeSnapshot()
  }

  async function clearHistory() {
    recentDecisions = []
    lastDecision = undefined
    lastFailureReason = undefined
    lastDeliveredAt = 0
    topicDeliveredAt.clear()
    compatibilityContextRecordedAt.clear()
    return getRuntimeSnapshot()
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
        }),
      }
    }

    const eventSnapshot = createEventSnapshot(event)
    const sidecarReady = sidecarSnapshot?.status.state === 'ready'
    const now = Date.now()
    const globalCooldownUntil = lastDeliveredAt + settings.globalCooldownMs
    const topicCooldownUntil = (topicDeliveredAt.get(eventSnapshot.topicKey) ?? 0) + settings.topicCooldownMs

    const decision = (() => {
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
          reason: '已压制，因为相似的主动陪伴提醒最近已经放行过，主题冷却仍在生效。',
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
      lastDeliveredAt = now
      topicDeliveredAt.set(eventSnapshot.topicKey, now)
    }

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
    while (compatibilityContextRecordedAt.size > maxRecentDecisions * 4) {
      const oldestKey = compatibilityContextRecordedAt.keys().next().value as string | undefined
      if (!oldestKey) {
        break
      }

      compatibilityContextRecordedAt.delete(oldestKey)
    }

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

    pushDecision(decision)

    return buildRuntimeState({
      settings: getSettings(),
      sidecarSnapshot,
      recentDecisions,
      lastDecision,
      lastFailureReason,
    })
  }

  return {
    loadConfig: getSettings,
    saveConfig: saveSettings,
    getRuntimeSnapshot,
    refreshRuntime,
    clearHistory,
    evaluateSparkNotify,
    recordContextUpdate,
  }
}

export function createProactiveCompanionService(params: {
  context: MainContext
  manager: ProactiveCompanionManager
}) {
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
}
