import type {
  ProactiveCompanionSettings,
  ProactiveCompanionSignalSource,
  ProactiveCompanionSimulationRequest,
  ProactiveCompanionVisionObservation,
} from '../../../../shared/proactive-companion'

import { normalizeMemoryLine } from '../external-memory'

type EmbeddedPriority = 'low' | 'medium' | 'high'

export interface EmbeddedSignalCandidate {
  source: Extract<
    ProactiveCompanionSignalSource,
    'idle' | 'memory-follow-up' | 'vision' | 'urgent-keyword' | 'manual'
  >
  priority: EmbeddedPriority
  headline: string
  note?: string
  topicKey: string
  summary: string
  receivedAt: number
}

export interface EmbeddedEngineState {
  lastDeliveredAt: number
  lastUrgentAt: number
  lastWorkingNudgeAt: number
  lastManualTriggerAt?: number
  lastSignalSource?: ProactiveCompanionSignalSource
  lastSignalHeadline?: string
  lastSignalAt?: number
  pauseUntil?: number
  recentDeliveredAt: number[]
  sourceDeliveredAt: Map<EmbeddedSignalCandidate['source'], number>
  topicDeliveredAt: Map<string, number>
  lastVisionSummary?: string
  lastVisionObservedAt?: number
}

export interface EmbeddedGateDecision {
  decision: 'delivered' | 'suppressed'
  reason: string
  cooldownUntil?: number
  recordAsWorkingNudge?: boolean
}

const activeWindowGuardMs = 12_000
const rollingHourMs = 60 * 60 * 1000

function normalizeSummary(value: string | undefined) {
  return normalizeMemoryLine(value ?? '').slice(0, 240)
}

export function normalizeEmbeddedTopicKey(value: string) {
  return value
    .toLowerCase()
    .replace(/\d+/g, ' ')
    .replace(/[^a-z\u4E00-\u9FA5]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export function detectUrgentKeyword(text: string, urgentKeywords: string[]) {
  const normalized = normalizeSummary(text).toLowerCase()
  return urgentKeywords.some(keyword => normalized.includes(keyword.toLowerCase()))
}

function buildHeadline(prefix: string, body: string, fallback: string) {
  const normalized = normalizeSummary(body)
  if (!normalized) {
    return fallback
  }

  return `${prefix}${normalized}`.slice(0, 120)
}

export function buildManualCheckInCandidate(now = Date.now()): EmbeddedSignalCandidate {
  return {
    source: 'manual',
    priority: 'low',
    headline: '主动陪伴手动触发了一次轻量关心',
    note: '这是来自轻量操作台的手动 check-in。',
    topicKey: `manual-check-in:${Math.floor(now / 60_000)}`,
    summary: 'Manual proactive console check-in.',
    receivedAt: now,
  }
}

export function buildIdleCandidate(now = Date.now()): EmbeddedSignalCandidate {
  return {
    source: 'idle',
    priority: 'low',
    headline: '现在适合轻轻确认一下近况',
    note: '用户已经安静了一会儿，可以用一句克制的提醒轻轻敲门。',
    topicKey: `idle-check-in:${Math.floor(now / 60_000)}`,
    summary: 'User idle check-in candidate.',
    receivedAt: now,
  }
}

export function buildMemoryFollowUpCandidate(followUp: string, now = Date.now()): EmbeddedSignalCandidate {
  const normalized = normalizeSummary(followUp)
  return {
    source: 'memory-follow-up',
    priority: 'medium',
    headline: buildHeadline('有一条待跟进现在适合轻轻提醒一下：', normalized, '有一条待跟进现在适合轻轻提醒一下'),
    note: normalized || '外部记忆里有一条稳定的待跟进事项。',
    topicKey: normalizeEmbeddedTopicKey(`memory ${normalized}`) || `memory-follow-up:${Math.floor(now / 60_000)}`,
    summary: normalized || 'Stable follow-up candidate from external memory.',
    receivedAt: now,
  }
}

export function buildUrgentCandidate(text: string, now = Date.now()): EmbeddedSignalCandidate {
  const normalized = normalizeSummary(text)
  return {
    source: 'urgent-keyword',
    priority: 'high',
    headline: buildHeadline('屏幕里像是出现了报错或阻塞：', normalized, '屏幕里像是出现了报错或阻塞'),
    note: normalized || '检测到了紧急关键词。',
    topicKey: normalizeEmbeddedTopicKey(`urgent ${normalized}`) || `urgent:${Math.floor(now / 60_000)}`,
    summary: normalized || 'Urgent keyword candidate.',
    receivedAt: now,
  }
}

export function buildVisionCandidate(observation: ProactiveCompanionVisionObservation, now = Date.now()): EmbeddedSignalCandidate {
  const normalized = normalizeSummary(observation.summary)
  return {
    source: 'vision',
    priority: 'medium',
    headline: buildHeadline('屏幕内容刚发生了值得留意的变化：', normalized, '屏幕内容刚发生了值得留意的变化'),
    note: normalized || '检测到新的视觉变化。',
    topicKey: normalizeEmbeddedTopicKey(`vision ${normalized}`) || `vision:${Math.floor(now / 60_000)}`,
    summary: normalized || 'Vision change candidate.',
    receivedAt: observation.capturedAt ?? now,
  }
}

export function buildSimulationCandidate(request: ProactiveCompanionSimulationRequest, now = Date.now()) {
  const fallbackText = request.summary || request.note || request.headline || ''

  switch (request.kind) {
    case 'memory-follow-up':
      return buildMemoryFollowUpCandidate(request.summary || request.note || request.headline || '记得回看那条待跟进。', now)
    case 'vision-reminder':
      return buildVisionCandidate({
        summary: request.summary || request.note || request.headline || '屏幕停在同一件事上有一阵子了。',
        capturedAt: now,
      }, now)
    case 'urgent-reminder':
      return buildUrgentCandidate(fallbackText || 'error: the current task looks stuck.', now)
    case 'manual-check-in':
      return {
        ...buildManualCheckInCandidate(now),
        headline: request.headline || '主动陪伴手动触发了一次轻量关心',
        note: request.note || '这是来自轻量操作台的手动 check-in。',
        topicKey: request.topicKey || `manual-check-in:${Math.floor(now / 60_000)}`,
      }
    case 'idle-check-in':
    default:
      return {
        ...buildIdleCandidate(now),
        headline: request.headline || '现在适合轻轻确认一下近况',
        note: request.note || '这是一次模拟的 idle check-in。',
        topicKey: request.topicKey || `idle-check-in:${Math.floor(now / 60_000)}`,
      }
  }
}

function getSourceCooldownMs(candidate: EmbeddedSignalCandidate, settings: ProactiveCompanionSettings) {
  if (candidate.priority === 'high') {
    return settings.urgentCooldownMs
  }

  switch (candidate.source) {
    case 'memory-follow-up':
      return settings.memoryCooldownMs
    case 'vision':
      return settings.visionCooldownMs
    case 'idle':
    case 'manual':
    case 'urgent-keyword':
    default:
      return settings.globalCooldownMs
  }
}

function canUseWorkingNudge(candidate: EmbeddedSignalCandidate, idleMs: number, now: number, settings: ProactiveCompanionSettings, state: EmbeddedEngineState) {
  if (!settings.workingNudgeEnabled) {
    return false
  }

  if (candidate.source !== 'memory-follow-up' && candidate.source !== 'vision') {
    return false
  }

  if (idleMs < settings.workingNudgeMinPauseMs) {
    return false
  }

  return now - state.lastWorkingNudgeAt >= settings.workingNudgeCooldownMs
}

export function gateEmbeddedCandidate(params: {
  candidate: EmbeddedSignalCandidate
  currentIdleMs: number
  now: number
  settings: ProactiveCompanionSettings
  state: EmbeddedEngineState
}): EmbeddedGateDecision {
  const { candidate, currentIdleMs, now, settings, state } = params
  const urgent = candidate.priority === 'high'
  const sourceCooldownMs = getSourceCooldownMs(candidate, settings)
  const sourceLastDeliveredAt = state.sourceDeliveredAt.get(candidate.source) ?? 0
  const topicLastDeliveredAt = state.topicDeliveredAt.get(candidate.topicKey) ?? 0

  state.recentDeliveredAt = state.recentDeliveredAt.filter(value => now - value < rollingHourMs)

  if (!settings.enabled) {
    return {
      decision: 'suppressed',
      reason: '已压制，因为主动陪伴当前已关闭。',
    }
  }

  if (state.pauseUntil && state.pauseUntil > now) {
    return {
      decision: 'suppressed',
      reason: '已压制，因为主动陪伴当前处于临时暂停中。',
      cooldownUntil: state.pauseUntil,
    }
  }

  if (state.recentDeliveredAt.length >= settings.maxProactivePerHour) {
    return {
      decision: 'suppressed',
      reason: '已压制，因为当前小时内的主动提醒次数已经达到上限。',
      cooldownUntil: state.recentDeliveredAt[0]! + rollingHourMs,
    }
  }

  if (now - sourceLastDeliveredAt < sourceCooldownMs) {
    return {
      decision: 'suppressed',
      reason: '已压制，因为同来源提醒的冷却仍在生效。',
      cooldownUntil: sourceLastDeliveredAt + sourceCooldownMs,
    }
  }

  if (now - topicLastDeliveredAt < settings.sameTopicCooldownMs) {
    return {
      decision: 'suppressed',
      reason: '已压制，因为相同主题最近已经提醒过了。',
      cooldownUntil: topicLastDeliveredAt + settings.sameTopicCooldownMs,
    }
  }

  if (urgent) {
    if (now - state.lastUrgentAt < settings.urgentCooldownMs) {
      return {
        decision: 'suppressed',
        reason: '已压制，因为紧急提醒冷却仍在生效。',
        cooldownUntil: state.lastUrgentAt + settings.urgentCooldownMs,
      }
    }
  }
  else if (now - state.lastDeliveredAt < settings.globalCooldownMs) {
    return {
      decision: 'suppressed',
      reason: '已压制，因为全局主动提醒冷却仍在生效。',
      cooldownUntil: state.lastDeliveredAt + settings.globalCooldownMs,
    }
  }

  if (currentIdleMs < activeWindowGuardMs && (!urgent || !settings.allowInterruptOnUrgent)) {
    return {
      decision: 'suppressed',
      reason: '已压制，因为用户刚刚还有明显活动，现在还不适合打断。',
      cooldownUntil: now + Math.max(activeWindowGuardMs - currentIdleMs, 1_500),
    }
  }

  if (!urgent && currentIdleMs < settings.idleThresholdMs) {
    if (!canUseWorkingNudge(candidate, currentIdleMs, now, settings, state)) {
      return {
        decision: 'suppressed',
        reason: '已压制，因为当前还没有达到适合开口的空档。',
        cooldownUntil: now + Math.max(settings.idleThresholdMs - currentIdleMs, 1_500),
      }
    }

    return {
      decision: 'delivered',
      reason: '已放行，因为当前虽未完全空闲，但已经满足更克制的 working nudge 条件。',
      recordAsWorkingNudge: true,
    }
  }

  return {
    decision: 'delivered',
    reason: urgent
      ? '已放行，因为紧急信号通过了冷却、主题和打断检查。'
      : '已放行，因为信号通过了空闲、冷却、主题和频率检查。',
  }
}
