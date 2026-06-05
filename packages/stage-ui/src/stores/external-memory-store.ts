import type { ChatHistoryItem } from '../types/chat'
import type {
  ExternalMemoryContextSnapshot,
  ExternalMemoryJudgementSnapshot,
  ExternalMemoryObservationRecord,
  ExternalMemoryTurnSnapshot,
  ExternalMemoryUsageSnapshot,
  ExternalMemoryWriteCandidate,
  ExternalMemoryWriteRequest,
  ExternalMemoryWriteResult,
  ExternalMemoryWriteReviewSnapshot,
} from './external-memory-shared'

import { errorMessageFrom } from '@moeru/std'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { extractMessageText } from '../libs/chat-sync'
import { useChatSessionStore } from './chat/session-store'
import { composeExternalMemorySupplement } from './external-memory'
import {
  createDefaultExternalMemoryJudgementSnapshot,
  createDefaultExternalMemoryTurnSnapshot,
  createDefaultExternalMemoryUsageSnapshot,
  createDefaultExternalMemoryWriteReviewSnapshot,
} from './external-memory-shared'
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
  recordMemoryObservation: (request: ExternalMemoryObservationRecord) => Promise<ExternalMemoryJudgementSnapshot>
  refreshMemoryJudgement: () => Promise<ExternalMemoryJudgementSnapshot>
  getMemoryJudgementSnapshot: () => Promise<ExternalMemoryJudgementSnapshot>
  clearMemoryCandidateLedger: () => Promise<ExternalMemoryJudgementSnapshot>
  clearMemoryWriteCandidateHistory: () => Promise<ExternalMemoryUsageSnapshot>
  writeRecentSummary: (request: ExternalMemoryWriteRequest) => Promise<ExternalMemoryWriteResult>
  writeFollowUpItems: (request: ExternalMemoryWriteRequest) => Promise<ExternalMemoryWriteResult>
  writeUserProfilePatch: (request: ExternalMemoryWriteRequest) => Promise<ExternalMemoryWriteResult>
  writePreferencesPatch: (request: ExternalMemoryWriteRequest) => Promise<ExternalMemoryWriteResult>
}

const EMPTY_EXTERNAL_MEMORY_SECTIONS = {
  userProfile: [],
  preferences: [],
  followUps: [],
  recentSummary: [],
  characterKnowledge: [],
} satisfies ExternalMemoryContextSnapshot['sections']

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

function cloneWriteCandidate(candidate: ExternalMemoryWriteCandidate): ExternalMemoryWriteCandidate {
  return {
    ...candidate,
    addItems: [...candidate.addItems],
    removeItems: [...candidate.removeItems],
  }
}

function normalizeTurnSnapshot(
  snapshot?: ExternalMemoryTurnSnapshot,
  fallback?: Pick<ExternalMemoryContextSnapshot, 'readAt' | 'characterName' | 'layerOrder' | 'usedLayers' | 'summary'>,
): ExternalMemoryTurnSnapshot {
  const defaultSnapshot = createDefaultExternalMemoryTurnSnapshot()
  const normalizedSnapshot = snapshot

  return {
    ...defaultSnapshot,
    ...normalizedSnapshot,
    readAt: normalizedSnapshot?.readAt || fallback?.readAt || defaultSnapshot.readAt,
    characterName: normalizedSnapshot?.characterName ?? fallback?.characterName,
    layerOrder: normalizedSnapshot?.layerOrder?.length ? [...normalizedSnapshot.layerOrder] : [...(fallback?.layerOrder ?? defaultSnapshot.layerOrder)],
    usedLayers: normalizedSnapshot?.usedLayers?.length ? [...normalizedSnapshot.usedLayers] : [...(fallback?.usedLayers ?? defaultSnapshot.usedLayers)],
    summary: normalizedSnapshot?.summary || fallback?.summary || defaultSnapshot.summary,
    selections: [...(normalizedSnapshot?.selections ?? defaultSnapshot.selections)],
    evidence: [...(normalizedSnapshot?.evidence ?? defaultSnapshot.evidence)],
    citations: [...(normalizedSnapshot?.citations ?? defaultSnapshot.citations)],
  }
}

function normalizeWriteReviewSnapshot(snapshot?: ExternalMemoryWriteReviewSnapshot): ExternalMemoryWriteReviewSnapshot {
  const defaultSnapshot = createDefaultExternalMemoryWriteReviewSnapshot()
  const normalizedSnapshot = snapshot ?? defaultSnapshot

  return {
    ...defaultSnapshot,
    ...normalizedSnapshot,
    candidates: (normalizedSnapshot.candidates ?? defaultSnapshot.candidates).map(cloneWriteCandidate),
  }
}

function normalizeJudgementSnapshot(snapshot?: ExternalMemoryJudgementSnapshot): ExternalMemoryJudgementSnapshot {
  const defaultSnapshot = createDefaultExternalMemoryJudgementSnapshot()
  const normalizedSnapshot = snapshot ?? defaultSnapshot

  return {
    ...defaultSnapshot,
    ...normalizedSnapshot,
    statusCounts: {
      ...defaultSnapshot.statusCounts,
      ...normalizedSnapshot.statusCounts,
    },
    candidates: [...(normalizedSnapshot.candidates ?? defaultSnapshot.candidates)],
    conflicts: [...(normalizedSnapshot.conflicts ?? defaultSnapshot.conflicts)],
    recommendations: [...(normalizedSnapshot.recommendations ?? defaultSnapshot.recommendations)],
  }
}

function normalizeContextSnapshot(snapshot: ExternalMemoryContextSnapshot): ExternalMemoryContextSnapshot {
  return {
    ...snapshot,
    layerOrder: snapshot.layerOrder?.length ? [...snapshot.layerOrder] : [...createDefaultExternalMemoryTurnSnapshot().layerOrder],
    documents: [...(snapshot.documents ?? [])],
    usedKinds: [...(snapshot.usedKinds ?? [])],
    usedLayers: [...(snapshot.usedLayers ?? [])],
    turn: normalizeTurnSnapshot(snapshot.turn, snapshot),
    sections: {
      ...EMPTY_EXTERNAL_MEMORY_SECTIONS,
      ...snapshot.sections,
      userProfile: [...(snapshot.sections?.userProfile ?? EMPTY_EXTERNAL_MEMORY_SECTIONS.userProfile)],
      preferences: [...(snapshot.sections?.preferences ?? EMPTY_EXTERNAL_MEMORY_SECTIONS.preferences)],
      followUps: [...(snapshot.sections?.followUps ?? EMPTY_EXTERNAL_MEMORY_SECTIONS.followUps)],
      recentSummary: [...(snapshot.sections?.recentSummary ?? EMPTY_EXTERNAL_MEMORY_SECTIONS.recentSummary)],
      characterKnowledge: [...(snapshot.sections?.characterKnowledge ?? EMPTY_EXTERNAL_MEMORY_SECTIONS.characterKnowledge)],
    },
  }
}

function normalizeUsageSnapshot(
  snapshot: ExternalMemoryUsageSnapshot,
  contextSnapshot?: ExternalMemoryContextSnapshot,
): ExternalMemoryUsageSnapshot {
  const normalizedContext = contextSnapshot ?? snapshot.context
  const defaultUsage = createDefaultExternalMemoryUsageSnapshot()

  return {
    ...defaultUsage,
    ...snapshot,
    context: normalizedContext ? normalizeContextSnapshot(normalizedContext) : undefined,
    judgement: normalizeJudgementSnapshot(snapshot.judgement),
    turn: normalizeTurnSnapshot(snapshot.turn, normalizedContext),
    lastWriteReview: normalizeWriteReviewSnapshot(snapshot.lastWriteReview ?? snapshot.lastWrite?.review),
    recentWrites: [...(snapshot.recentWrites ?? defaultUsage.recentWrites)],
    lastUsedDocumentKinds: [...(snapshot.lastUsedDocumentKinds ?? defaultUsage.lastUsedDocumentKinds)],
  }
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
  const candidateHistory = ref<ExternalMemoryWriteCandidate[]>([])
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
    judgement: judgementSnapshot.value,
    turn: turnSnapshot.value,
  }))
  const isAvailable = computed(() => usage.value.bridgeState === 'ready' || usage.value.bridgeState === 'degraded')
  const judgementSnapshot = computed(() => normalizeJudgementSnapshot(usage.value.judgement))
  const turnSnapshot = computed(() => normalizeTurnSnapshot(usage.value.turn, context.value))
  const writeReviewSnapshot = computed(() => normalizeWriteReviewSnapshot(usage.value.lastWriteReview ?? usage.value.lastWrite?.review))
  const latestPersistedWrite = computed(() => {
    if (usage.value.lastWrite?.decision === 'written')
      return usage.value.lastWrite

    return usage.value.recentWrites.find(result => result.decision === 'written')
  })

  function syncCandidateHistory(reviewSnapshot?: ExternalMemoryWriteReviewSnapshot) {
    candidateHistory.value = normalizeWriteReviewSnapshot(reviewSnapshot).candidates
  }

  function setContextSnapshot(nextContext: ExternalMemoryContextSnapshot) {
    context.value = normalizeContextSnapshot(nextContext)
  }

  function setUsageSnapshot(nextUsage: ExternalMemoryUsageSnapshot) {
    usage.value = normalizeUsageSnapshot(nextUsage, context.value)
    syncCandidateHistory(usage.value.lastWriteReview)
  }

  function setJudgementSnapshot(nextJudgement: ExternalMemoryJudgementSnapshot) {
    usage.value = normalizeUsageSnapshot({
      ...usage.value,
      judgement: nextJudgement,
    }, context.value)
  }

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
    setUsageSnapshot(await withBridge(activeBridge => activeBridge.getLastMemoryUsage()))
    return usage.value
  }

  async function recordMemoryObservation(request: ExternalMemoryObservationRecord) {
    const judgement = await withBridge(activeBridge => activeBridge.recordMemoryObservation(request))
    setJudgementSnapshot(judgement)
    return judgementSnapshot.value
  }

  async function refreshMemoryJudgement() {
    const judgement = await withBridge(activeBridge => activeBridge.refreshMemoryJudgement())
    setJudgementSnapshot(judgement)
    return judgementSnapshot.value
  }

  async function getMemoryJudgementSnapshot() {
    const judgement = await withBridge(activeBridge => activeBridge.getMemoryJudgementSnapshot())
    setJudgementSnapshot(judgement)
    return judgementSnapshot.value
  }

  async function clearMemoryCandidateLedger() {
    const judgement = await withBridge(activeBridge => activeBridge.clearMemoryCandidateLedger())
    setJudgementSnapshot(judgement)
    return judgementSnapshot.value
  }

  async function loadContext() {
    loading.value = true
    error.value = undefined

    try {
      setContextSnapshot(await withBridge(activeBridge => activeBridge.loadMemoryContext(buildLoadRequest())))
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
      setContextSnapshot(await withBridge(activeBridge => activeBridge.refreshMemoryContext(buildLoadRequest())))
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

  async function refreshTurnSnapshot() {
    return await refreshContext()
  }

  async function refreshWriteReview() {
    await refreshUsage()
    return writeReviewSnapshot.value
  }

  async function clearCandidateHistory() {
    error.value = undefined

    try {
      setUsageSnapshot(await withBridge(activeBridge => activeBridge.clearMemoryWriteCandidateHistory()))
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Failed to clear external memory candidate history.'
      throw cause
    }
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
    candidateHistory,
    context,
    error,
    isAvailable,
    judgementSnapshot,
    latestPersistedWrite,
    loading,
    refreshing,
    turnSnapshot,
    usage,
    writeReviewSnapshot,
    writing,

    clearCandidateHistory,
    clearMemoryCandidateLedger,
    captureAssistantTurn,
    captureUserTurn,
    getMemoryJudgementSnapshot,
    loadContext,
    recordMemoryObservation,
    refreshContext,
    refreshMemoryJudgement,
    refreshTurnSnapshot,
    refreshUsage,
    refreshWriteReview,
    setBridge,
    writeFollowUpItems,
    writePreferencesPatch,
    writeRecentSummary,
    writeRecentSummaryFromActiveSession,
    writeUserProfilePatch,
  }
})
