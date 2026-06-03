import type { ChatHistoryItem } from '../types/chat'
import type {
  ExternalMemoryContextSnapshot,
  ExternalMemoryUsageSnapshot,
  ExternalMemoryWriteRequest,
  ExternalMemoryWriteResult,
} from './external-memory-shared'

import { errorMessageFrom } from '@moeru/std'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { extractMessageText } from '../libs/chat-sync'
import { useChatSessionStore } from './chat/session-store'
import { composeExternalMemorySupplement } from './external-memory'
import { createDefaultExternalMemoryUsageSnapshot } from './external-memory-shared'
import { useAiriCardStore } from './modules/airi-card'
import { useSettingsStageModel } from './settings/stage-model'

export interface ExternalMemoryLoadRequest {
  characterName?: string
  displayModelName?: string
}

/**
 * Runtime bridge implemented by desktop hosts to read and write the external memory root.
 */
export interface ExternalMemoryBridge {
  loadMemoryContext: (request?: ExternalMemoryLoadRequest) => Promise<ExternalMemoryContextSnapshot>
  refreshMemoryContext: (request?: ExternalMemoryLoadRequest) => Promise<ExternalMemoryContextSnapshot>
  getLastMemoryUsage: () => Promise<ExternalMemoryUsageSnapshot>
  writeRecentSummary: (request: ExternalMemoryWriteRequest) => Promise<ExternalMemoryWriteResult>
  writeFollowUpItems: (request: ExternalMemoryWriteRequest) => Promise<ExternalMemoryWriteResult>
  writeUserProfilePatch: (request: ExternalMemoryWriteRequest) => Promise<ExternalMemoryWriteResult>
  writePreferencesPatch: (request: ExternalMemoryWriteRequest) => Promise<ExternalMemoryWriteResult>
}

/**
 * Normalizes freeform text into one-line memory-safe facts or todo items.
 *
 * Before:
 * - "  我喜欢  温柔一点的回复。 "
 *
 * After:
 * - "我喜欢 温柔一点的回复。"
 */
export function normalizeMemoryLine(line: string) {
  return line
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[-*]\s*/, '')
    .trim()
}

function dedupeMemoryLines(lines: string[]) {
  return Array.from(new Set(lines.map(normalizeMemoryLine).filter(Boolean)))
}

function isTemporaryPreference(candidate: string) {
  return /(今天先|这次先|暂时|如果可以|比如|for now|this time|temporarily|if possible|for example)/i.test(candidate)
}

function isUnstableUserFact(candidate: string) {
  return /(今天|最近|这周|现在|目前|刚刚|有点|today|recently|this week|currently|right now)/i.test(candidate)
}

function isActionableFollowUpCandidate(candidate: string) {
  return /(提醒我|记得|之后帮我|待会帮我|明天提醒我|后续跟进|稍后再问我|remind me|please remind me|remember to|follow up|check back)/i.test(candidate)
}

function isFollowUpMetaDiscussion(candidate: string) {
  return /(如何提醒|怎么提醒|提醒功能|can you remind me\??$|could you remind me\??$)/i.test(candidate)
}

function filterStablePreferences(candidates: string[]) {
  return dedupeMemoryLines(candidates).filter((candidate) => {
    return !isTemporaryPreference(candidate)
      && !/[?？]$/.test(candidate)
  })
}

function filterStableUserProfileFacts(candidates: string[]) {
  return dedupeMemoryLines(candidates).filter((candidate) => {
    return !isUnstableUserFact(candidate)
      && !/[?？]$/.test(candidate)
  })
}

function filterActionableFollowUps(candidates: string[]) {
  return dedupeMemoryLines(candidates).filter((candidate) => {
    return isActionableFollowUpCandidate(candidate)
      && !isFollowUpMetaDiscussion(candidate)
  })
}

/**
 * Builds one compact recent-summary block from the active chat session.
 *
 * Before:
 * - A long session containing system, user, assistant, and tool messages
 *
 * After:
 * - A small multi-line summary focused on the latest user/assistant exchange
 */
export function composeRecentSummaryFromMessages(messages: ChatHistoryItem[]) {
  const now = new Date()
  const readableTurns = dedupeMemoryLines(messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .slice(-6)
    .map((message) => {
      const prefix = message.role === 'user' ? 'User' : 'AIRI'
      const content = normalizeMemoryLine(extractMessageText(message))
      if (!content)
        return undefined

      return `- ${prefix}: ${content.slice(0, 220)}`
    })
    .filter((line): line is string => Boolean(line)))

  if (readableTurns.length === 0)
    return ''

  return [
    `## ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    ...readableTurns,
  ].join('\n')
}

function extractExplicitMatches(text: string, patterns: RegExp[]) {
  const normalizedText = text.replace(/\r/g, '\n')
  const matches = patterns
    .flatMap((pattern) => {
      const results: string[] = []
      for (const match of normalizedText.matchAll(pattern)) {
        const candidate = normalizeMemoryLine(match[0] ?? '')
        if (candidate)
          results.push(candidate)
      }
      return results
    })

  return dedupeMemoryLines(matches)
}

/**
 * Extracts explicit preference statements from a user message.
 *
 * Before:
 * - "我喜欢温柔一点的回复。"
 * - "I prefer shorter answers."
 *
 * After:
 * - ["我喜欢温柔一点的回复。"]
 * - ["I prefer shorter answers."]
 */
export function extractPreferencePatchesFromText(text: string) {
  return filterStablePreferences(extractExplicitMatches(text, [
    /(?:^|[。！？；;\n])\s*(?:我喜欢|我更喜欢|我偏好|我希望|我不喜欢|我讨厌|我不想要)[^。！？；;\n]{0,80}[。！？；;]?/g,
    /(?:^|[.?!;\n])\s*(?:I like|I prefer|I want|I do not like|I don't like|I hate)[^.?!\n]{0,80}[.?!]?/gi,
  ]))
}

/**
 * Extracts stable user-profile facts from a user message when the wording is explicit.
 *
 * Before:
 * - "我是北京大学的学生。"
 * - "I live in Beijing."
 *
 * After:
 * - ["我是北京大学的学生。"]
 * - ["I live in Beijing."]
 */
export function extractUserProfilePatchesFromText(text: string) {
  return filterStableUserProfileFacts(extractExplicitMatches(text, [
    /(?:^|[。！？；;\n])\s*(?:我是|我现在是|我住在|我来自|我的专业是|我的工作是)[^。！？；;\n]{0,80}[。！？；;]?/g,
    /(?:^|[.?!;\n])\s*(?:I am|I work as|I live in|I study|My major is)[^.?!\n]{0,80}[.?!]?/gi,
  ]))
}

/**
 * Extracts explicit follow-up or reminder items from a user message.
 *
 * Before:
 * - "明天提醒我交作业。"
 * - "Please remind me to call mom later."
 *
 * After:
 * - ["明天提醒我交作业。"]
 * - ["Please remind me to call mom later."]
 */
export function extractFollowUpItemsFromText(text: string) {
  return filterActionableFollowUps(extractExplicitMatches(text, [
    /(?:^|[。！？；;\n])\s*(?:提醒我|记得|之后帮我|待会帮我|明天提醒我|后续跟进|稍后再问我)[^。！？；;\n]{0,80}[。！？；;]?/g,
    /(?:^|[.?!;\n])\s*(?:remind me to|please remind me|remember to|follow up on|check back on)[^.?!\n]{0,80}[.?!]?/gi,
  ]))
}

export const useExternalMemoryStore = defineStore('external-memory', () => {
  const cardStore = useAiriCardStore()
  const stageModelStore = useSettingsStageModel()
  const chatSessionStore = useChatSessionStore()

  const bridge = ref<ExternalMemoryBridge>()
  const context = ref<ExternalMemoryContextSnapshot>()
  const usage = ref<ExternalMemoryUsageSnapshot>(createDefaultExternalMemoryUsageSnapshot())
  const loading = ref(false)
  const refreshing = ref(false)
  const writing = ref(false)
  const error = ref<string>()

  const activeCardName = computed(() => cardStore.activeCard?.name?.trim())
  const activeDisplayModelName = computed(() => stageModelStore.stageModelSelectedDisplayModel?.name?.trim())
  const activeCharacterName = computed(() => activeCardName.value ?? activeDisplayModelName.value)
  const activeSupplement = computed(() => composeExternalMemorySupplement({
    usage: usage.value,
    context: context.value,
  }))
  const isAvailable = computed(() => usage.value.bridgeState === 'ready' || usage.value.bridgeState === 'degraded')

  function setBridge(nextBridge: ExternalMemoryBridge) {
    bridge.value = nextBridge
  }

  async function withBridge<T>(run: (activeBridge: ExternalMemoryBridge) => Promise<T>) {
    if (!bridge.value)
      throw new Error('External memory bridge is not available in this runtime.')

    return await run(bridge.value)
  }

  function buildLoadRequest(): ExternalMemoryLoadRequest {
    return {
      characterName: activeCardName.value,
      displayModelName: activeDisplayModelName.value,
    }
  }

  async function refreshUsage() {
    usage.value = await withBridge(activeBridge => activeBridge.getLastMemoryUsage())
    return usage.value
  }

  async function loadContext() {
    loading.value = true
    error.value = undefined

    try {
      context.value = await withBridge(activeBridge => activeBridge.loadMemoryContext(buildLoadRequest()))
      await refreshUsage()
      return context.value
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to load external memory context.'
      throw cause
    }
    finally {
      loading.value = false
    }
  }

  async function refreshContext() {
    refreshing.value = true
    error.value = undefined

    try {
      context.value = await withBridge(activeBridge => activeBridge.refreshMemoryContext(buildLoadRequest()))
      await refreshUsage()
      return context.value
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to refresh external memory context.'
      throw cause
    }
    finally {
      refreshing.value = false
    }
  }

  async function writeWith(
    write: (activeBridge: ExternalMemoryBridge) => Promise<ExternalMemoryWriteResult>,
  ) {
    writing.value = true
    error.value = undefined

    try {
      const result = await withBridge(write)
      await refreshUsage()
      return result
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to write external memory.'
      throw cause
    }
    finally {
      writing.value = false
    }
  }

  async function writeRecentSummary(request: ExternalMemoryWriteRequest) {
    return await writeWith(activeBridge => activeBridge.writeRecentSummary({
      ...request,
      characterName: request.characterName ?? activeCharacterName.value,
    }))
  }

  async function writeFollowUpItems(request: ExternalMemoryWriteRequest) {
    return await writeWith(activeBridge => activeBridge.writeFollowUpItems(request))
  }

  async function writeUserProfilePatch(request: ExternalMemoryWriteRequest) {
    return await writeWith(activeBridge => activeBridge.writeUserProfilePatch(request))
  }

  async function writePreferencesPatch(request: ExternalMemoryWriteRequest) {
    return await writeWith(activeBridge => activeBridge.writePreferencesPatch(request))
  }

  async function writeRecentSummaryFromActiveSession() {
    const summary = composeRecentSummaryFromMessages(chatSessionStore.messages)
    if (!summary)
      return undefined

    return await writeRecentSummary({
      source: 'manual-session-summary',
      summary,
    })
  }

  async function captureUserTurn(params: {
    messageText: string
  }) {
    if (!bridge.value)
      return

    const preferences = extractPreferencePatchesFromText(params.messageText)
    if (preferences.length > 0) {
      await writePreferencesPatch({
        source: 'user-turn-preferences',
        preferences,
      })
    }

    const facts = extractUserProfilePatchesFromText(params.messageText)
    if (facts.length > 0) {
      await writeUserProfilePatch({
        source: 'user-turn-profile',
        facts,
      })
    }

    const items = extractFollowUpItemsFromText(params.messageText)
    if (items.length > 0) {
      await writeFollowUpItems({
        source: 'user-turn-follow-ups',
        items,
      })
    }
  }

  async function captureAssistantTurn(params: {
    sessionMessages: ChatHistoryItem[]
  }) {
    if (!bridge.value)
      return

    const summary = composeRecentSummaryFromMessages(params.sessionMessages)
    if (!summary)
      return

    await writeRecentSummary({
      source: 'assistant-turn-summary',
      summary,
    })
  }

  return {
    activeCardName,
    activeCharacterName,
    activeDisplayModelName,
    activeSupplement,
    context,
    error,
    isAvailable,
    loading,
    refreshing,
    usage,
    writing,

    captureAssistantTurn,
    captureUserTurn,
    loadContext,
    refreshContext,
    refreshUsage,
    setBridge,
    writeFollowUpItems,
    writePreferencesPatch,
    writeRecentSummary,
    writeRecentSummaryFromActiveSession,
    writeUserProfilePatch,
  }
})
