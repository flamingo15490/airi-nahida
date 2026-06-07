import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type {
  ExternalMemoryCandidateKind,
  ExternalMemoryCandidateSnapshot,
  ExternalMemoryCandidateStatus,
  ExternalMemoryCapabilityState,
  ExternalMemoryCitationSnapshot,
  ExternalMemoryConflictSnapshot,
  ExternalMemoryContextSnapshot,
  ExternalMemoryDocumentKind,
  ExternalMemoryEvidenceSnapshot,
  ExternalMemoryJudgementSnapshot,
  ExternalMemoryLayerKind,
  ExternalMemoryLoadRequest,
  ExternalMemoryMemorizeDecisionSnapshot,
  ExternalMemoryObservationRecord,
  ExternalMemoryObservationSource,
  ExternalMemoryReadSnapshot,
  ExternalMemoryRecallDecisionSnapshot,
  ExternalMemorySelectionDecision,
  ExternalMemoryTurnSnapshot,
  ExternalMemoryUsageSnapshot,
  ExternalMemoryWriteCandidate,
  ExternalMemoryWriteCandidateDecision,
  ExternalMemoryWriteDecision,
  ExternalMemoryWriteRecommendation,
  ExternalMemoryWriteRequest,
  ExternalMemoryWriteResult,
  ExternalMemoryWriteReviewSnapshot,
} from '../../../../shared/external-memory'
import type { ExternalIntegrationsManager } from '../external-integrations'

import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'

import {
  electronExternalMemoryClearMemoryCandidateLedger,
  electronExternalMemoryClearWriteCandidateHistory,
  electronExternalMemoryGetLastUsage,
  electronExternalMemoryGetMemoryJudgementSnapshot,
  electronExternalMemoryLoadContext,
  electronExternalMemoryRecordMemoryObservation,
  electronExternalMemoryRefreshContext,
  electronExternalMemoryRefreshMemoryJudgement,
  electronExternalMemoryWriteFollowUpItems,
  electronExternalMemoryWritePreferencesPatch,
  electronExternalMemoryWriteRecentSummary,
  electronExternalMemoryWriteUserProfilePatch,
} from '../../../../shared/eventa'
import {
  createDefaultExternalMemoryJudgementSnapshot,
  createDefaultExternalMemoryTurnSnapshot,
  createDefaultExternalMemoryUsageSnapshot,
  createDefaultExternalMemoryWriteReviewSnapshot,
  createExternalMemoryReasonSnapshot,
  EXTERNAL_MEMORY_LAYER_KINDS,
  EXTERNAL_MEMORY_LAYER_LABELS,
  getExternalMemoryLayerPriority,
  mapDocumentKindToExternalMemoryLayer,
} from '../../../../shared/external-memory'

type MainContext = ReturnType<typeof createContext>['context']

interface CharacterKnowledgeReadResult {
  document: ExternalMemoryReadSnapshot
  matchedCharacter: boolean
}

interface ExistingItemSnapshot {
  normalized: string
  original: string
  key?: string
}

interface PersistedMemoryRecommendationContext {
  existingNormalizedByKind: Map<ExternalMemoryCandidateKind, Map<string, ExistingItemSnapshot>>
  existingStructuredKeyByKind: Map<Extract<ExternalMemoryCandidateKind, 'user-profile' | 'preferences'>, Map<string, ExistingItemSnapshot>>
}

interface ReviewedStableWriteCandidate {
  candidate: ExternalMemoryWriteCandidate
  selectedAddItems: string[]
}

interface ReviewedFollowUpWriteCandidate {
  candidate: ExternalMemoryWriteCandidate
  selectedAddItems: string[]
  selectedRemoveItems: string[]
  removedOriginalItems: string[]
}

interface ReviewedRecentSummaryWriteCandidate {
  candidate: ExternalMemoryWriteCandidate
  hasBodyContent: boolean
  hasNewBodyContent: boolean
}

interface MemoryRootResolution {
  state: ExternalMemoryCapabilityState
  summary: string
  rootPath?: string
}

interface ExternalMemoryCandidateLedgerEntry {
  kind: ExternalMemoryCandidateKind
  source: ExternalMemoryObservationSource
  text: string
  normalizedText: string
  structuredKey?: string
  characterName?: string
  firstObservedAt: number
  lastObservedAt: number
  observationCount: number
  strongSignal: boolean
  actionable: boolean
  lastCountedObservedAt?: number
}

interface ExternalMemoryCandidateLedgerFile {
  version: 1
  candidates: ExternalMemoryCandidateLedgerEntry[]
}

const userProfileFileName = '\u7528\u6237\u4FE1\u606F.md'
const preferencesFileName = '\u504F\u597D\u8BBE\u7F6E.md'
const followUpsFileName = '\u5F85\u8DDF\u8FDB.md'
const recentSummaryFileName = '\u8FD1\u671F\u6458\u8981.md'
const characterKnowledgeDirectoryName = '\u89D2\u8272\u77E5\u8BC6\u5E93'
const candidateLedgerFileName = 'external-memory-candidate-ledger.json'
const maxRecentWrites = 8
const maxStructuredItemsPerDocument = 8
const maxRecentSummaryItems = 10
const followUpDatePrefixPattern = /^\[\d{4}-\d{2}-\d{2}\]\s*/
const recentSummaryDateHeadingPattern = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/
const temporaryPreferencePattern = /(今天先|这次先|暂时|如果可以|比如|for now|this time|temporarily|if possible|for example)/i
const weakStableSignalPattern = /(可能|也许|有时|最近|这阵子|尽量|想要|希望|大概|maybe|probably|sometimes|for now|recently|currently|if possible|would like|prefer if possible)/i
const strongStableSignalPattern = /(一直|长期|固定|永远|以后都|总是|always|forever|long-term|permanently|from now on)/i
const actionableFollowUpPattern = /(提醒|记得|之后帮我|待会帮我|明天提醒我|后续跟进|稍后再问我|跟进|回头提醒|remind me|please remind me|remember to|follow up|check back|ping me|nudge me)/i

/**
 * Normalizes freeform markdown or prose into one compact line for JSON-safe memory snapshots.
 *
 * Before:
 * - "- **偏好**：温柔一点的回复"
 *
 * After:
 * - "偏好: 温柔一点的回复"
 */
export function normalizeMemoryLine(line: string) {
  return line
    .replace(/\r/g, '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[-*+]\s*/, '')
    .replace(/^\d+\.\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/[：﹕]/g, ': ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, '\'')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeComparisonText(text: string) {
  return normalizeMemoryLine(text)
    .toLowerCase()
    .replace(followUpDatePrefixPattern, '')
    .replace(/[，、]/g, ',')
    .replace(/[。！]/g, '.')
    .replace(/；/g, ';')
    .replace(/\s+/g, ' ')
    .trim()
}

function dedupeLines(lines: string[]) {
  const normalizedSeen = new Set<string>()
  const deduped: string[] = []

  for (const line of lines) {
    const normalizedLine = normalizeMemoryLine(line)
    if (!normalizedLine)
      continue

    const normalizedComparison = normalizeComparisonText(normalizedLine)
    if (!normalizedComparison || normalizedSeen.has(normalizedComparison))
      continue

    normalizedSeen.add(normalizedComparison)
    deduped.push(normalizedLine)
  }

  return deduped
}

function takeMeaningfulLines(text: string, limit: number) {
  return dedupeLines(text.split('\n')).filter((line) => {
    return line.length > 1
      && !/^#+$/.test(line)
  }).slice(0, limit)
}

function isRecentSummaryMetadataLine(line: string) {
  const normalized = normalizeMemoryLine(line)
  return normalized === '近期摘要'
    || recentSummaryDateHeadingPattern.test(normalized)
}

function takeRecentSummaryLines(text: string, limit: number) {
  return dedupeLines(text.split('\n')).filter((line) => {
    return line.length > 1
      && !/^#+$/.test(line)
      && !isRecentSummaryMetadataLine(line)
  }).slice(0, limit)
}

function isActionableFollowUpLine(line: string) {
  const normalized = normalizeComparisonText(line)
  if (!normalized)
    return false

  return actionableFollowUpPattern.test(normalized)
}

function isWeakStableSignal(text: string) {
  return weakStableSignalPattern.test(text)
}

function extractStructuredKey(text: string) {
  const normalized = normalizeComparisonText(text)
  if (!normalized)
    return undefined

  const colonMatch = normalized.match(/^([^:]{1,40}):\s*(.+)$/)
  if (colonMatch) {
    return colonMatch[1]
      .replace(/[^a-z0-9\u4E00-\u9FFF\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim() || undefined
  }

  return undefined
}

function buildExistingItemSnapshots(items: string[]) {
  return items
    .map((item): ExistingItemSnapshot | undefined => {
      const normalized = normalizeComparisonText(item)
      if (!normalized)
        return undefined

      return {
        normalized,
        original: item,
        key: extractStructuredKey(item),
      }
    })
    .filter((item): item is ExistingItemSnapshot => Boolean(item))
}

function buildExistingItemMap(items: string[]) {
  const normalizedMap = new Map<string, ExistingItemSnapshot>()
  for (const item of buildExistingItemSnapshots(items)) {
    if (!normalizedMap.has(item.normalized))
      normalizedMap.set(item.normalized, item)
  }

  return normalizedMap
}

function buildExistingKeyMap(items: string[]) {
  const keyMap = new Map<string, ExistingItemSnapshot>()
  for (const item of buildExistingItemSnapshots(items)) {
    if (item.key && !keyMap.has(item.key))
      keyMap.set(item.key, item)
  }

  return keyMap
}

async function readPersistedStableItems(rootPath: string, kind: 'user-profile' | 'preferences' | 'follow-ups') {
  const fileName = kind === 'user-profile'
    ? userProfileFileName
    : kind === 'preferences'
      ? preferencesFileName
      : followUpsFileName
  const text = await readOptionalText(join(rootPath, fileName))
  return takeMeaningfulLines(text ?? '', Number.MAX_SAFE_INTEGER)
}

async function buildPersistedMemoryRecommendationContext(rootPath?: string): Promise<PersistedMemoryRecommendationContext> {
  const existingNormalizedByKind = new Map<ExternalMemoryCandidateKind, Map<string, ExistingItemSnapshot>>()
  const existingStructuredKeyByKind = new Map<Extract<ExternalMemoryCandidateKind, 'user-profile' | 'preferences'>, Map<string, ExistingItemSnapshot>>()

  if (!rootPath)
    return { existingNormalizedByKind, existingStructuredKeyByKind }

  const [userProfileItems, preferenceItems, followUpItems] = await Promise.all([
    readPersistedStableItems(rootPath, 'user-profile'),
    readPersistedStableItems(rootPath, 'preferences'),
    readPersistedStableItems(rootPath, 'follow-ups'),
  ])

  existingNormalizedByKind.set('user-profile', buildExistingItemMap(userProfileItems))
  existingNormalizedByKind.set('preferences', buildExistingItemMap(preferenceItems))
  existingNormalizedByKind.set('follow-ups', buildExistingItemMap(followUpItems))
  existingStructuredKeyByKind.set('user-profile', buildExistingKeyMap(userProfileItems))
  existingStructuredKeyByKind.set('preferences', buildExistingKeyMap(preferenceItems))

  return {
    existingNormalizedByKind,
    existingStructuredKeyByKind,
  }
}

function inferCharacterName(request?: ExternalMemoryLoadRequest) {
  return request?.characterName?.trim()
    || request?.displayModelName?.trim()
}

function mapIntegrationStateToCapabilityState(state?: string): ExternalMemoryCapabilityState {
  if (state === 'ready')
    return 'ready'
  if (state === 'disabled')
    return 'disabled'
  if (state)
    return 'degraded'
  return 'unavailable'
}

function createBridgeReason(state: ExternalMemoryCapabilityState) {
  if (state === 'ready')
    return createExternalMemoryReasonSnapshot('bridge-ready')
  if (state === 'degraded')
    return createExternalMemoryReasonSnapshot('bridge-degraded')
  if (state === 'disabled')
    return createExternalMemoryReasonSnapshot('bridge-disabled')

  return createExternalMemoryReasonSnapshot('bridge-unavailable')
}

function createWriteReason(decision: ExternalMemoryWriteResult['decision']) {
  if (decision === 'written')
    return createExternalMemoryReasonSnapshot('write-written')
  if (decision === 'skipped-unavailable')
    return createExternalMemoryReasonSnapshot('write-skipped-unavailable')
  if (decision === 'skipped-empty')
    return createExternalMemoryReasonSnapshot('write-skipped-empty')
  if (decision === 'skipped-duplicate')
    return createExternalMemoryReasonSnapshot('write-skipped-duplicate')

  return createExternalMemoryReasonSnapshot('write-skipped-not-stable')
}

function createEvidenceReason(params: {
  code: 'layer-selected' | 'layer-empty'
  detail: string
}) {
  return createExternalMemoryReasonSnapshot(params.code, params.detail)
}

function createCandidateReason(params: {
  code: 'write-written' | 'write-skipped-empty' | 'write-skipped-duplicate' | 'write-skipped-not-stable'
  detail: string
}) {
  return createExternalMemoryReasonSnapshot(params.code, params.detail)
}

function createCandidateDecision(params: {
  type: ExternalMemoryWriteCandidateDecision['decisionType']
  detail: string
}): {
  decisionType: NonNullable<ExternalMemoryWriteCandidateDecision['decisionType']>
  reason: ReturnType<typeof createCandidateReason>
} {
  switch (params.type) {
    case 'selected':
    case 'removal-selected':
      return {
        decisionType: params.type,
        reason: createCandidateReason({
          code: 'write-written',
          detail: params.detail,
        }),
      }
    case 'suppressed-duplicate':
    case 'suppressed-no-new-content':
      return {
        decisionType: params.type,
        reason: createCandidateReason({
          code: 'write-skipped-duplicate',
          detail: params.detail,
        }),
      }
    case 'suppressed-not-stable':
    case 'suppressed-needs-repeat':
    case 'suppressed-conflict':
      return {
        decisionType: params.type,
        reason: createCandidateReason({
          code: 'write-skipped-not-stable',
          detail: params.detail,
        }),
      }
    case 'suppressed-not-actionable':
    case 'suppressed-empty':
    case 'removal-suppressed-missing':
      return {
        decisionType: params.type,
        reason: createCandidateReason({
          code: 'write-skipped-empty',
          detail: params.detail,
        }),
      }
  }

  return {
    decisionType: 'suppressed-empty',
    reason: createCandidateReason({
      code: 'write-skipped-empty',
      detail: params.detail,
    }),
  }
}

function buildSelectionDecision(params: {
  layer: ExternalMemoryLayerKind
  kind: ExternalMemoryDocumentKind
  evidence: ExternalMemoryEvidenceSnapshot[]
  citations: ExternalMemoryCitationSnapshot[]
}): ExternalMemorySelectionDecision {
  const selectedEvidence = params.evidence.filter(item => item.selected)

  return {
    layer: params.layer,
    kind: params.kind,
    priority: getExternalMemoryLayerPriority(params.layer),
    selected: selectedEvidence.length > 0,
    reason: selectedEvidence.length > 0
      ? createExternalMemoryReasonSnapshot('layer-selected')
      : createExternalMemoryReasonSnapshot('layer-empty'),
    evidenceCount: params.evidence.length,
    selectedEvidenceCount: selectedEvidence.length,
    suppressedEvidenceCount: params.evidence.length - selectedEvidence.length,
    citationIds: params.citations.map(citation => citation.id),
  }
}

function buildTurnSnapshot(params: {
  readAt: number
  characterName?: string
  summary: string
  documents: ExternalMemoryReadSnapshot[]
  matchedCharacterKnowledge: boolean
}) {
  const selectedByNormalized = new Map<string, ExternalMemoryEvidenceSnapshot>()
  const stableKeyMap = new Map<string, ExternalMemoryEvidenceSnapshot>()
  const evidence: ExternalMemoryEvidenceSnapshot[] = []

  for (const document of params.documents) {
    for (const [itemIndex, item] of document.items.entries()) {
      const normalizedText = normalizeComparisonText(item)
      let selected = false
      let decisionType: ExternalMemoryEvidenceSnapshot['decisionType'] = 'suppressed-empty'
      let reason = createEvidenceReason({
        code: 'layer-empty',
        detail: '已压制：这条内容在归一化后没有保留有意义且 JSON-safe 的信息。',
      })
      let suppressedByEvidenceId: string | undefined

      if (!normalizedText) {
        decisionType = 'suppressed-empty'
        reason = createEvidenceReason({
          code: 'layer-empty',
          detail: '已压制：这条内容在归一化后没有保留有意义且 JSON-safe 的信息。',
        })
      }
      else if (document.kind === 'follow-ups' && !isActionableFollowUpLine(item)) {
        decisionType = 'suppressed-not-actionable'
        reason = createEvidenceReason({
          code: 'layer-empty',
          detail: '已压制：待跟进记忆只接收明确动作或提醒事项。',
        })
      }
      else if (document.kind === 'character-knowledge' && !params.matchedCharacterKnowledge) {
        decisionType = 'suppressed-character-mismatch'
        reason = createEvidenceReason({
          code: 'layer-empty',
          detail: '已压制：角色知识仅在当前角色匹配时参与。',
        })
      }
      else {
        const duplicate = selectedByNormalized.get(normalizedText)
        const structuredKey = extractStructuredKey(item)
        const stableConflict = document.layer === 'recent-context' || document.layer === 'character-knowledge'
          ? structuredKey ? stableKeyMap.get(structuredKey) : undefined
          : undefined

        if (duplicate) {
          decisionType = duplicate.layer === document.layer
            ? 'suppressed-duplicate'
            : 'suppressed-lower-priority'
          reason = createEvidenceReason({
            code: 'layer-empty',
            detail: duplicate.layer === document.layer
              ? '已压制：同一层内已有等价内容被选中。'
              : '已压制：更高优先级的层已经选中了相同内容。',
          })
          suppressedByEvidenceId = duplicate.id
        }
        else if (stableConflict && stableConflict.normalizedText !== normalizedText) {
          decisionType = 'suppressed-lower-priority'
          reason = createEvidenceReason({
            code: 'layer-empty',
            detail: '已压制：已稳定的用户信息或偏好会覆盖低优先级的近期上下文。',
          })
          suppressedByEvidenceId = stableConflict.id
        }
        else {
          selected = true
          decisionType = 'selected'
          reason = createEvidenceReason({
            code: 'layer-selected',
            detail: '已选中：这条内容在分层与归一化后进入了最新记忆快照。',
          })
        }
      }

      const snapshot: ExternalMemoryEvidenceSnapshot = {
        id: `${document.layer}:${itemIndex}`,
        layer: document.layer,
        kind: document.kind,
        priority: document.priority,
        path: document.path,
        title: EXTERNAL_MEMORY_LAYER_LABELS[document.layer],
        itemIndex,
        text: item,
        normalizedText,
        selected,
        reason,
        decisionType,
        suppressedByEvidenceId,
      }

      if (selected) {
        selectedByNormalized.set(normalizedText, snapshot)

        if ((document.layer === 'stable-profile' || document.layer === 'stable-preferences')) {
          const key = extractStructuredKey(item)
          if (key && !stableKeyMap.has(key))
            stableKeyMap.set(key, snapshot)
        }
      }

      evidence.push(snapshot)
    }
  }

  const citations = evidence
    .filter(item => item.selected)
    .map((item): ExternalMemoryCitationSnapshot => ({
      id: item.id,
      evidenceId: item.id,
      layer: item.layer,
      kind: item.kind,
      priority: item.priority,
      path: item.path,
      title: item.title,
      excerpt: item.text,
    }))

  const selections = params.documents.map((document) => {
    const layerEvidence = evidence.filter(item => item.layer === document.layer && item.kind === document.kind)
    const layerCitations = citations.filter(item => item.layer === document.layer && item.kind === document.kind)
    return buildSelectionDecision({
      layer: document.layer,
      kind: document.kind,
      evidence: layerEvidence,
      citations: layerCitations,
    })
  })

  return {
    readAt: params.readAt,
    characterName: params.characterName,
    layerOrder: [...EXTERNAL_MEMORY_LAYER_KINDS],
    usedLayers: selections.filter(item => item.selected).map(item => item.layer),
    summary: params.summary,
    selections,
    evidence,
    citations,
  } satisfies ExternalMemoryTurnSnapshot
}

function buildSectionsFromTurn(turn: ExternalMemoryTurnSnapshot) {
  const selectedEvidence = turn.evidence.filter(item => item.selected)

  return {
    userProfile: selectedEvidence.filter(item => item.kind === 'user-profile').map(item => item.text),
    preferences: selectedEvidence.filter(item => item.kind === 'preferences').map(item => item.text),
    followUps: selectedEvidence.filter(item => item.kind === 'follow-ups').map(item => item.text),
    recentSummary: selectedEvidence.filter(item => item.kind === 'recent-summary').map(item => item.text),
    characterKnowledge: selectedEvidence.filter(item => item.kind === 'character-knowledge').map(item => item.text),
  }
}

function buildWriteReviewSnapshot(params: {
  reviewedAt: number
  summary: string
  decision: ExternalMemoryWriteResult['decision']
  candidates: ExternalMemoryWriteCandidate[]
}): ExternalMemoryWriteReviewSnapshot {
  return {
    reviewedAt: params.reviewedAt,
    summary: params.summary,
    decision: params.decision,
    reason: createWriteReason(params.decision),
    candidates: params.candidates,
  }
}

function buildEmptyContext(params: {
  state: ExternalMemoryCapabilityState
  summary: string
  characterName?: string
  readAt?: number
}): ExternalMemoryContextSnapshot {
  const readAt = params.readAt ?? Date.now()
  const turn = {
    ...createDefaultExternalMemoryTurnSnapshot(),
    readAt,
    characterName: params.characterName,
    summary: params.summary,
  }

  return {
    state: params.state,
    reason: createBridgeReason(params.state),
    summary: params.summary,
    readAt,
    characterName: params.characterName,
    layerOrder: [...EXTERNAL_MEMORY_LAYER_KINDS],
    documents: [],
    usedKinds: [],
    usedLayers: [],
    turn,
    sections: {
      userProfile: [],
      preferences: [],
      followUps: [],
      recentSummary: [],
      characterKnowledge: [],
    },
  }
}

async function pathExists(path: string) {
  try {
    await access(path)
    return true
  }
  catch {
    return false
  }
}

async function readOptionalText(path: string) {
  if (!await pathExists(path))
    return undefined

  return await readFile(path, 'utf-8')
}

function buildReadSnapshot(params: {
  kind: ExternalMemoryDocumentKind
  path: string
  available: boolean
  summary: string
  items?: string[]
  error?: string
}): ExternalMemoryReadSnapshot {
  const layer = mapDocumentKindToExternalMemoryLayer(params.kind)
  const priority = getExternalMemoryLayerPriority(layer)
  const reason = params.error
    ? createExternalMemoryReasonSnapshot('document-read-failed')
    : !params.available
        ? createExternalMemoryReasonSnapshot('document-missing')
        : (params.items?.length ?? 0) > 0
            ? createExternalMemoryReasonSnapshot('document-loaded')
            : createExternalMemoryReasonSnapshot('document-empty')

  return {
    kind: params.kind,
    layer,
    priority,
    reason,
    path: params.path,
    available: params.available,
    summary: params.summary,
    items: params.items ?? [],
    error: params.error,
  }
}

async function readStructuredDocument(kind: ExternalMemoryDocumentKind, path: string, limit: number) {
  try {
    const text = await readOptionalText(path)
    if (typeof text === 'undefined') {
      return buildReadSnapshot({
        kind,
        path,
        available: false,
        summary: '记忆文档缺失。',
      })
    }

    const items = kind === 'recent-summary'
      ? takeRecentSummaryLines(text, limit)
      : kind === 'follow-ups'
        ? takeMeaningfulLines(text, limit)
        : takeMeaningfulLines(text, limit)

    return buildReadSnapshot({
      kind,
      path,
      available: true,
      summary: items.length > 0 ? '记忆文档已加载。' : '记忆文档为空。',
      items,
    })
  }
  catch (error) {
    return buildReadSnapshot({
      kind,
      path,
      available: false,
      summary: '读取记忆文档失败。',
      error: errorMessageFrom(error) ?? 'Unknown error',
    })
  }
}

async function readCharacterKnowledge(rootPath: string, characterName?: string): Promise<CharacterKnowledgeReadResult> {
  const knowledgeDirectoryPath = join(rootPath, characterKnowledgeDirectoryName)

  try {
    if (!await pathExists(knowledgeDirectoryPath)) {
      return {
        matchedCharacter: false,
        document: buildReadSnapshot({
          kind: 'character-knowledge',
          path: knowledgeDirectoryPath,
          available: false,
          summary: '角色知识目录缺失。',
        }),
      }
    }

    const entries = await readdir(knowledgeDirectoryPath)
    const normalizedCharacterName = characterName?.toLowerCase()
    const matchedCharacterEntries = normalizedCharacterName
      ? entries.filter(entry => entry.toLowerCase().includes(normalizedCharacterName))
      : []
    const matchedCharacter = matchedCharacterEntries.length > 0

    if (!matchedCharacter) {
      return {
        matchedCharacter: false,
        document: buildReadSnapshot({
          kind: 'character-knowledge',
          path: knowledgeDirectoryPath,
          available: true,
          summary: '角色知识目录可用，但没有匹配当前角色的文件。',
        }),
      }
    }

    const prioritizedEntries = [
      ...matchedCharacterEntries,
      '\u6838\u5FC3\u4EBA\u683C.md',
      '\u8BED\u8A00\u98CE\u683C.md',
      '\u7EA2\u7EBF\u6E05\u5355.md',
      '\u4EBA\u9645\u5173\u7CFB.md',
    ]
      .filter((entry, index, array) => array.indexOf(entry) === index)
      .filter(entry => entries.includes(entry))
      .slice(0, 4)

    const collectedItems: string[] = []
    for (const entry of prioritizedEntries) {
      const text = await readOptionalText(join(knowledgeDirectoryPath, entry))
      if (!text)
        continue

      const items = takeMeaningfulLines(text, 2).map(item => `${entry}: ${item}`)
      collectedItems.push(...items)
      if (collectedItems.length >= maxStructuredItemsPerDocument)
        break
    }

    return {
      matchedCharacter: true,
      document: buildReadSnapshot({
        kind: 'character-knowledge',
        path: knowledgeDirectoryPath,
        available: true,
        summary: collectedItems.length > 0
          ? '已为当前角色选取轻量角色知识片段。'
          : '角色知识文件可用，但没有提取出可用片段。',
        items: collectedItems.slice(0, maxStructuredItemsPerDocument),
      }),
    }
  }
  catch (error) {
    return {
      matchedCharacter: false,
      document: buildReadSnapshot({
        kind: 'character-knowledge',
        path: knowledgeDirectoryPath,
        available: false,
        summary: '读取角色知识失败。',
        error: errorMessageFrom(error) ?? 'Unknown error',
      }),
    }
  }
}

function buildRecentSummaryText(summary: string) {
  return [
    '# 近期摘要',
    '',
    summary.trim(),
    '',
  ].join('\n')
}

function extractRecentSummaryBodyLines(text: string) {
  return takeRecentSummaryLines(text, Number.MAX_SAFE_INTEGER)
}

function normalizeWriteItems(items?: string[]) {
  return dedupeLines(items ?? [])
}

function summarizeCandidate(kind: ExternalMemoryDocumentKind, decisions: ExternalMemoryWriteCandidateDecision[]) {
  const selectedAdds = decisions.filter(item => item.action === 'add' && item.selected).length
  const selectedRemovals = decisions.filter(item => item.action === 'remove' && item.selected).length
  const suppressed = decisions.filter(item => !item.selected).length
  const kindLabel = {
    'user-profile': '用户信息',
    'preferences': '偏好设置',
    'follow-ups': '待跟进',
    'recent-summary': '近期摘要',
    'character-knowledge': '角色知识',
  } satisfies Record<ExternalMemoryDocumentKind, string>

  return `已评审${kindLabel[kind]}：新增 ${selectedAdds} 条，移除 ${selectedRemovals} 条，压制 ${suppressed} 条。`
}

function appendBulletLines(existingText: string, items: string[]) {
  const existingItems = takeMeaningfulLines(existingText, Number.MAX_SAFE_INTEGER)
  const existingMap = buildExistingItemMap(existingItems)
  const added = items.filter((item) => {
    const normalized = normalizeComparisonText(item)
    return normalized && !existingMap.has(normalized)
  })

  if (added.length === 0) {
    return {
      changed: false,
      added,
      text: existingText,
    }
  }

  const baseText = existingText.trimEnd()
  const appendedText = added.map(item => `- ${item}`).join('\n')
  return {
    changed: true,
    added,
    text: `${baseText}${baseText ? '\n' : ''}${appendedText}\n`,
  }
}

function mergeFollowUpText(existingText: string, additions: string[], removals: string[]) {
  const existingItems = takeMeaningfulLines(existingText, Number.MAX_SAFE_INTEGER)
  const removalSet = new Set(removals.map(item => normalizeComparisonText(item)).filter(Boolean))
  const nextItems = existingItems.filter((item) => {
    const normalized = normalizeComparisonText(item)
    return normalized && !removalSet.has(normalized)
  })
  const nextMap = buildExistingItemMap(nextItems)
  const datedAdditions = additions
    .filter((item) => {
      const normalized = normalizeComparisonText(item)
      return normalized && !nextMap.has(normalized)
    })
    .map(item => `[${new Date().toISOString().slice(0, 10)}] ${item}`)

  const mergedItems = [...nextItems, ...datedAdditions]
  return {
    changed: mergedItems.length !== existingItems.length || datedAdditions.length > 0,
    text: mergedItems.length > 0 ? `${mergedItems.join('\n')}\n` : '',
  }
}

async function writeTextFile(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text, 'utf-8')
}

function deriveSkippedDecisionFromCandidate(candidate: ExternalMemoryWriteCandidate): ExternalMemoryWriteDecision {
  const decisions = candidate.decisions ?? []
  if (decisions.length === 0)
    return 'skipped-empty'

  if (decisions.every(item => item.decisionType === 'suppressed-duplicate'))
    return 'skipped-duplicate'

  if (decisions.some(item => item.decisionType === 'suppressed-needs-repeat'
    || item.decisionType === 'suppressed-not-stable'
    || item.decisionType === 'suppressed-conflict')) {
    return 'skipped-not-stable'
  }

  return 'skipped-empty'
}

/**
 * Desktop-only external memory runtime that keeps AIRI collaborating with
 * `D:\AIRI-Memory` without taking ownership of that repository.
 *
 * Use when:
 * - Electron main should read trusted external memory into JSON-safe prompt context
 * - AIRI should support limited, controlled write-back without exposing filesystem access to renderer
 *
 * Expects:
 * - `externalIntegrationsManager` already reflects the desktop memory bridge config
 *
 * Returns:
 * - One app-wide manager for reads, usage snapshots, and controlled write-back
 */
export interface ExternalMemoryManager {
  loadMemoryContext: (request?: ExternalMemoryLoadRequest) => Promise<ExternalMemoryContextSnapshot>
  refreshMemoryContext: (request?: ExternalMemoryLoadRequest) => Promise<ExternalMemoryContextSnapshot>
  getLastMemoryUsage: () => ExternalMemoryUsageSnapshot
  recordMemoryObservation: (request: ExternalMemoryObservationRecord) => Promise<ExternalMemoryJudgementSnapshot>
  refreshMemoryJudgement: () => Promise<ExternalMemoryJudgementSnapshot>
  getMemoryJudgementSnapshot: () => Promise<ExternalMemoryJudgementSnapshot>
  clearMemoryCandidateLedger: () => Promise<ExternalMemoryJudgementSnapshot>
  clearMemoryWriteCandidateHistory: () => ExternalMemoryUsageSnapshot
  writeRecentSummary: (request: ExternalMemoryWriteRequest) => Promise<ExternalMemoryWriteResult>
  writeFollowUpItems: (request: ExternalMemoryWriteRequest) => Promise<ExternalMemoryWriteResult>
  writeUserProfilePatch: (request: ExternalMemoryWriteRequest) => Promise<ExternalMemoryWriteResult>
  writePreferencesPatch: (request: ExternalMemoryWriteRequest) => Promise<ExternalMemoryWriteResult>
}

export function createExternalMemoryManager(params: {
  externalIntegrationsManager: ExternalIntegrationsManager
  userDataPath: string
}): ExternalMemoryManager {
  let lastUsage = createDefaultExternalMemoryUsageSnapshot()
  let lastRecallDecision: ExternalMemoryRecallDecisionSnapshot | undefined
  let lastMemorizeDecision: ExternalMemoryMemorizeDecisionSnapshot | undefined
  const writeOccurrenceMaps = new Map<ExternalMemoryDocumentKind, Map<string, number>>()
  const candidateLedgerPath = join(params.userDataPath, candidateLedgerFileName)

  function getOccurrenceCount(kind: ExternalMemoryDocumentKind, normalizedText: string) {
    const kindMap = writeOccurrenceMaps.get(kind) ?? new Map<string, number>()
    if (!writeOccurrenceMaps.has(kind))
      writeOccurrenceMaps.set(kind, kindMap)

    const nextCount = (kindMap.get(normalizedText) ?? 0) + 1
    kindMap.set(normalizedText, nextCount)
    return nextCount
  }

  async function readCandidateLedgerFile(): Promise<ExternalMemoryCandidateLedgerFile> {
    try {
      const text = await readFile(candidateLedgerPath, 'utf-8')
      const parsed = JSON.parse(text) as Partial<ExternalMemoryCandidateLedgerFile>
      return {
        version: 1,
        candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
      }
    }
    catch {
      return {
        version: 1,
        candidates: [],
      }
    }
  }

  async function writeCandidateLedgerFile(ledger: ExternalMemoryCandidateLedgerFile) {
    await mkdir(dirname(candidateLedgerPath), { recursive: true })
    await writeFile(candidateLedgerPath, JSON.stringify(ledger, null, 2), 'utf-8')
  }

  function isStrongStableObservation(observation: ExternalMemoryObservationRecord, normalizedText: string) {
    if (observation.strongSignal)
      return true

    if (observation.kind === 'follow-ups')
      return observation.actionable === true || actionableFollowUpPattern.test(normalizedText)

    if (observation.kind === 'preferences' || observation.kind === 'user-profile')
      return strongStableSignalPattern.test(observation.text)

    return false
  }

  function deriveCandidateStatus(params: {
    entry: ExternalMemoryCandidateLedgerEntry
    conflictingEntries: ExternalMemoryCandidateLedgerEntry[]
    persistedStructuredConflict?: ExistingItemSnapshot
  }): ExternalMemoryCandidateStatus {
    const { entry, conflictingEntries, persistedStructuredConflict } = params

    if (entry.kind === 'recent-summary' || entry.kind === 'character-knowledge')
      return 'suppressed'

    if (entry.kind === 'follow-ups')
      return entry.actionable ? 'stable' : 'suppressed'

    if (entry.kind === 'preferences' && temporaryPreferencePattern.test(entry.text))
      return 'suppressed'

    if (conflictingEntries.length > 0 || persistedStructuredConflict)
      return 'conflicted'

    if (entry.strongSignal)
      return 'stable'

    return entry.observationCount >= 2 ? 'stable' : 'tentative'
  }

  function buildCandidateReason(params: {
    entry: ExternalMemoryCandidateLedgerEntry
    status: ExternalMemoryCandidateStatus
    conflictingEntries: ExternalMemoryCandidateLedgerEntry[]
    persistedStructuredConflict?: ExistingItemSnapshot
  }) {
    if (params.status === 'suppressed') {
      if (params.entry.kind === 'recent-summary')
        return '近期摘要只用于短期连续性，不进入 stable candidate ledger。'
      if (params.entry.kind === 'character-knowledge')
        return '角色知识只参与读取，不参与 stable 写回。'
      if (params.entry.kind === 'follow-ups')
        return '只有明确动作型 follow-up 才会进入 stable。'
      return '该候选目前不满足 stable 写回条件。'
    }

    if (params.status === 'conflicted') {
      if (params.persistedStructuredConflict) {
        return '该候选与已落盘的 stable memory 在同一 structured key 上冲突，先进入 conflicted 等待人工复核。'
      }

      return '该候选与同类已记录候选存在冲突，需要人工确认后再写回。'
    }

    if (params.status === 'tentative')
      return '该候选仍需至少两轮一致观察后才会进入 stable。'

    if (params.entry.kind === 'follow-ups')
      return '动作型 follow-up 可直接进入 stable。'

    if (params.entry.strongSignal)
      return '该表达具有强稳定性，可单轮进入 stable。'

    return '该候选已满足 stable 条件，可供后续写回流程使用。'
  }
  function buildCandidateSummary(status: ExternalMemoryCandidateStatus, kind: ExternalMemoryCandidateKind) {
    const kindLabel = {
      'user-profile': '用户信息',
      'preferences': '偏好设置',
      'follow-ups': '待跟进',
      'recent-summary': '近期摘要',
      'character-knowledge': '角色知识',
    } satisfies Record<ExternalMemoryCandidateKind, string>

    return `${kindLabel[kind]}候选当前状态为：${status}。`
  }

  async function buildJudgementSnapshotFromLedger(ledger: ExternalMemoryCandidateLedgerFile): Promise<ExternalMemoryJudgementSnapshot> {
    const statusCounts: Record<ExternalMemoryCandidateStatus, number> = {
      tentative: 0,
      stable: 0,
      conflicted: 0,
      suppressed: 0,
    }
    const conflicts: ExternalMemoryConflictSnapshot[] = []
    const recommendationsByKind = new Map<ExternalMemoryCandidateKind, ExternalMemoryCandidateSnapshot[]>()
    const resolvedRoot = await resolveMemoryRoot()
    const persistedContext = await buildPersistedMemoryRecommendationContext(resolvedRoot.rootPath)

    const candidates = ledger.candidates.map((entry): ExternalMemoryCandidateSnapshot => {
      const structuredKey = entry.structuredKey ?? extractStructuredKey(entry.text)
      const conflictingEntries = structuredKey
        ? ledger.candidates.filter(candidate => candidate !== entry
          && candidate.kind === entry.kind
          && (candidate.structuredKey ?? extractStructuredKey(candidate.text)) === structuredKey
          && candidate.normalizedText !== entry.normalizedText)
        : []
      const persistedStructuredConflict = (entry.kind === 'user-profile' || entry.kind === 'preferences') && structuredKey
        ? persistedContext.existingStructuredKeyByKind.get(entry.kind)?.get(structuredKey)
        : undefined
      const persistedNormalizedMatch = persistedContext.existingNormalizedByKind.get(entry.kind)?.get(entry.normalizedText)
      const status = deriveCandidateStatus({
        entry,
        conflictingEntries,
        persistedStructuredConflict: persistedStructuredConflict?.normalized !== entry.normalizedText
          ? persistedStructuredConflict
          : undefined,
      })
      const reason = buildCandidateReason({
        entry,
        status,
        conflictingEntries,
        persistedStructuredConflict: persistedStructuredConflict?.normalized !== entry.normalizedText
          ? persistedStructuredConflict
          : undefined,
      })
      const snapshot: ExternalMemoryCandidateSnapshot = {
        id: `${entry.kind}:${entry.normalizedText}`,
        kind: entry.kind,
        source: entry.source,
        status,
        text: entry.text,
        normalizedText: entry.normalizedText,
        summary: buildCandidateSummary(status, entry.kind),
        reason,
        firstObservedAt: entry.firstObservedAt,
        lastObservedAt: entry.lastObservedAt,
        observationCount: entry.observationCount,
        strongSignal: entry.strongSignal,
      }

      statusCounts[status] += 1

      if (status === 'conflicted') {
        for (const conflictingEntry of conflictingEntries) {
          conflicts.push({
            id: `${snapshot.id}:conflict:${conflictingEntry.normalizedText}`,
            kind: entry.kind,
            candidateId: snapshot.id,
            structuredKey,
            existingText: conflictingEntry.text,
            incomingText: entry.text,
            summary: '候选内容存在冲突。',
            reason,
          })
        }

        if (persistedStructuredConflict && persistedStructuredConflict.normalized !== entry.normalizedText) {
          conflicts.push({
            id: `${snapshot.id}:persisted-conflict`,
            kind: entry.kind,
            candidateId: snapshot.id,
            structuredKey,
            existingText: persistedStructuredConflict.original,
            incomingText: entry.text,
            summary: '新候选与已落盘的 stable memory 存在冲突。',
            reason,
          })
        }
      }

      if (status === 'stable'
        && entry.kind !== 'recent-summary'
        && entry.kind !== 'character-knowledge'
        && !persistedNormalizedMatch) {
        const current = recommendationsByKind.get(entry.kind) ?? []
        current.push(snapshot)
        recommendationsByKind.set(entry.kind, current)
      }

      return snapshot
    })

    const recommendations: ExternalMemoryWriteRecommendation[] = Array.from(recommendationsByKind.entries()).map(([kind, stableCandidates]) => {
      return {
        kind,
        candidateIds: stableCandidates.map(candidate => candidate.id),
        addItems: stableCandidates.map(candidate => candidate.text),
        summary: `${stableCandidates.length} 条 stable ${kind} 候选已可进入后续写回流程。`,
        reason: kind === 'follow-ups'
          ? '动作型待跟进候选可直接进入 stable。'
          : '这些候选已经满足 stable 规则，但实际写回仍取决于后续流程。',
      }
    })

    const snapshot: ExternalMemoryJudgementSnapshot = {
      ...createDefaultExternalMemoryJudgementSnapshot(),
      refreshedAt: Date.now(),
      candidateLedgerPath,
      summary: `当前候选账本共跟踪 ${candidates.length} 条候选，其中 ${statusCounts.stable} 条为 stable。`,
      reason: '这是第九阶段的候选稳定化快照，供渲染层与后续运行时任务读取。',
      statusCounts,
      candidates,
      conflicts,
      recommendations,
    }

    return snapshot
  }

  async function refreshMemoryJudgement() {
    const snapshot = await buildJudgementSnapshotFromLedger(await readCandidateLedgerFile())
    updateUsage({
      judgement: snapshot,
    })
    return snapshot
  }

  async function getMemoryJudgementSnapshot() {
    if (lastUsage.judgement?.refreshedAt)
      return lastUsage.judgement

    return await refreshMemoryJudgement()
  }

  async function clearMemoryCandidateLedger() {
    const ledger: ExternalMemoryCandidateLedgerFile = {
      version: 1,
      candidates: [],
    }
    await writeCandidateLedgerFile(ledger)
    const snapshot = await buildJudgementSnapshotFromLedger(ledger)
    updateUsage({
      judgement: snapshot,
    })
    return snapshot
  }

  const SCREEN_DERIVED_SOURCES: ReadonlySet<ExternalMemoryObservationSource> = new Set([
    'screen-peek',
    'screen-usage-context',
  ])

  const SCREEN_DERIVED_ALLOWED_KINDS: ReadonlySet<ExternalMemoryCandidateKind> = new Set([
    'recent-summary',
    'follow-ups',
  ])

  async function recordMemoryObservation(request: ExternalMemoryObservationRecord) {
    // NOTICE:
    // Screen-derived observations (screen-peek, screen-usage-context) must only
    // enter recent-summary or follow-ups. They must never directly generate
    // stable user-profile or preferences entries.
    // This boundary prevents transient screen data from polluting long-lived memory.
    if (SCREEN_DERIVED_SOURCES.has(request.source) && !SCREEN_DERIVED_ALLOWED_KINDS.has(request.kind)) {
      return await refreshMemoryJudgement()
    }

    const normalizedText = normalizeComparisonText(request.text)
    const observedAt = request.observedAt ?? Date.now()
    const ledger = await readCandidateLedgerFile()

    if (normalizedText) {
      const existingEntry = ledger.candidates.find(candidate => candidate.kind === request.kind && candidate.normalizedText === normalizedText)
      if (existingEntry) {
        existingEntry.text = request.text
        existingEntry.source = request.source
        existingEntry.characterName = request.characterName ?? existingEntry.characterName
        existingEntry.lastObservedAt = observedAt
        existingEntry.structuredKey = existingEntry.structuredKey ?? extractStructuredKey(request.text)
        if (existingEntry.lastCountedObservedAt !== observedAt) {
          existingEntry.observationCount += 1
          existingEntry.lastCountedObservedAt = observedAt
        }
        existingEntry.strongSignal = existingEntry.strongSignal || isStrongStableObservation(request, normalizedText)
        existingEntry.actionable = existingEntry.actionable || request.actionable === true || actionableFollowUpPattern.test(normalizedText)
      }
      else {
        ledger.candidates.push({
          kind: request.kind,
          source: request.source,
          text: request.text,
          normalizedText,
          structuredKey: extractStructuredKey(request.text),
          characterName: request.characterName,
          firstObservedAt: observedAt,
          lastObservedAt: observedAt,
          observationCount: 1,
          strongSignal: isStrongStableObservation(request, normalizedText),
          actionable: request.actionable === true || actionableFollowUpPattern.test(normalizedText),
          lastCountedObservedAt: observedAt,
        })
      }
    }

    await writeCandidateLedgerFile(ledger)
    return await refreshMemoryJudgement()
  }

  function getMemoryIntegrationSnapshot() {
    return params.externalIntegrationsManager.getSnapshots().find(snapshot => snapshot.kind === 'memory')
  }

  function updateUsage(partial: Partial<ExternalMemoryUsageSnapshot>) {
    lastUsage = {
      ...lastUsage,
      ...partial,
      recentWrites: partial.recentWrites ?? lastUsage.recentWrites,
      lastUsedDocumentKinds: partial.lastUsedDocumentKinds ?? lastUsage.lastUsedDocumentKinds,
    }
  }

  function recordWrite(result: ExternalMemoryWriteResult) {
    lastMemorizeDecision = {
      decision: result.decision,
      kind: result.kind,
      reason: result.reason.code,
      reviewedAt: result.writtenAt,
    }
    updateUsage({
      lastWrite: result,
      lastWriteReview: result.review,
      recentWrites: [result, ...lastUsage.recentWrites].slice(0, maxRecentWrites),
      lastRecallDecision,
      lastMemorizeDecision,
    })
  }

  function clearMemoryWriteCandidateHistory() {
    const clearedReview = createDefaultExternalMemoryWriteReviewSnapshot()
    updateUsage({
      lastWrite: lastUsage.lastWrite
        ? {
            ...lastUsage.lastWrite,
            review: clearedReview,
          }
        : undefined,
      lastWriteReview: clearedReview,
    })
    return lastUsage
  }

  async function resolveMemoryRoot(): Promise<MemoryRootResolution> {
    const snapshot = getMemoryIntegrationSnapshot()
    if (!snapshot || snapshot.config.kind !== 'memory') {
      return {
        state: 'unavailable',
        summary: '未配置记忆集成。',
      }
    }

    if (!snapshot.config.enabled) {
      return {
        state: 'disabled',
        summary: '记忆集成已禁用。',
      }
    }

    const rootPath = snapshot.config.rootPath
    try {
      const rootStat = await stat(rootPath)
      if (!rootStat.isDirectory()) {
        return {
          state: 'degraded',
          summary: '记忆根路径不是目录。',
        }
      }
    }
    catch {
      return {
        state: 'degraded',
        summary: '记忆根路径不可用。',
      }
    }

    return {
      state: mapIntegrationStateToCapabilityState(snapshot.status.state),
      summary: snapshot.status.summary,
      rootPath,
    }
  }

  async function buildContext(request?: ExternalMemoryLoadRequest) {
    const characterName = inferCharacterName(request)
    const resolvedRoot = await resolveMemoryRoot()
    if (!resolvedRoot.rootPath) {
      const emptyContext = buildEmptyContext({
        state: resolvedRoot.state,
        summary: resolvedRoot.summary,
        characterName,
      })
      updateUsage({
        bridgeState: resolvedRoot.state,
        reason: createBridgeReason(resolvedRoot.state),
        summary: resolvedRoot.summary,
        characterName,
        context: emptyContext,
        turn: emptyContext.turn,
        lastReadAt: emptyContext.readAt,
        lastReadSummary: resolvedRoot.summary,
        lastReadError: resolvedRoot.state === 'ready' ? undefined : resolvedRoot.summary,
        lastUsedDocumentKinds: [],
      })
      return emptyContext
    }

    const [userProfile, preferences, followUps, recentSummary, characterKnowledge] = await Promise.all([
      readStructuredDocument('user-profile', join(resolvedRoot.rootPath, userProfileFileName), maxStructuredItemsPerDocument),
      readStructuredDocument('preferences', join(resolvedRoot.rootPath, preferencesFileName), maxStructuredItemsPerDocument),
      readStructuredDocument('follow-ups', join(resolvedRoot.rootPath, followUpsFileName), maxStructuredItemsPerDocument),
      readStructuredDocument('recent-summary', join(resolvedRoot.rootPath, recentSummaryFileName), maxRecentSummaryItems),
      readCharacterKnowledge(resolvedRoot.rootPath, characterName),
    ])

    const documents = [
      userProfile,
      preferences,
      followUps,
      recentSummary,
      characterKnowledge.document,
    ]

    const readAt = Date.now()
    const preliminarySummary = documents.some(document => document.items.length > 0)
      ? `已从 ${documents.filter(document => document.items.length > 0).length} 份文档加载可信记忆。`
      : '记忆根路径可访问，但没有找到可用的记忆片段。'
    const turn = buildTurnSnapshot({
      readAt,
      characterName,
      summary: preliminarySummary,
      documents,
      matchedCharacterKnowledge: characterKnowledge.matchedCharacter,
    })
    const sections = buildSectionsFromTurn(turn)
    const usedKinds = Array.from(new Set(turn.evidence.filter(item => item.selected).map(item => item.kind)))
    const usedLayers = [...turn.usedLayers]
    const summary = usedKinds.length > 0
      ? `已从 ${usedKinds.length} 组已选中文档加载可信记忆。`
      : '记忆根路径可访问，但所有候选都被分层规则压制了。'
    const normalizedTurn: ExternalMemoryTurnSnapshot = {
      ...turn,
      summary,
    }

    const context: ExternalMemoryContextSnapshot = {
      state: resolvedRoot.state,
      reason: usedKinds.length > 0
        ? createExternalMemoryReasonSnapshot('context-loaded')
        : createExternalMemoryReasonSnapshot('context-empty'),
      summary,
      readAt,
      characterName,
      layerOrder: [...EXTERNAL_MEMORY_LAYER_KINDS],
      documents,
      usedKinds,
      usedLayers,
      turn: normalizedTurn,
      sections,
    }

    lastRecallDecision = {
      selectedLayers: usedLayers,
      suppressedLayers: EXTERNAL_MEMORY_LAYER_KINDS.filter(l => !usedLayers.includes(l)),
      reason: usedLayers.length > 0 ? 'layer-selected' : 'context-empty',
    }

    updateUsage({
      bridgeState: resolvedRoot.state,
      reason: createBridgeReason(resolvedRoot.state),
      summary: resolvedRoot.summary,
      characterName,
      context,
      turn: normalizedTurn,
      lastReadAt: readAt,
      lastReadSummary: summary,
      lastReadError: documents.find(document => document.error)?.error,
      lastUsedDocumentKinds: usedKinds,
      lastRecallDecision,
      lastMemorizeDecision,
    })

    return context
  }

  async function loadMemoryContext(request?: ExternalMemoryLoadRequest) {
    const requestedCharacterName = inferCharacterName(request)
    if (lastUsage.context && lastUsage.characterName === requestedCharacterName)
      return lastUsage.context

    return await buildContext(request)
  }

  async function refreshMemoryContext(request?: ExternalMemoryLoadRequest) {
    return await buildContext(request)
  }

  function reviewStableWriteCandidate(params: {
    kind: 'user-profile' | 'preferences'
    request: ExternalMemoryWriteRequest
    items: string[]
    existingItems: string[]
  }): ReviewedStableWriteCandidate {
    const existingMap = buildExistingItemMap(params.existingItems)
    const existingKeyMap = buildExistingKeyMap(params.existingItems)
    const seenNormalized = new Set<string>()
    const decisions: ExternalMemoryWriteCandidateDecision[] = []
    const selectedAddItems: string[] = []

    for (const [itemIndex, item] of params.items.entries()) {
      const normalizedText = normalizeComparisonText(item)
      let selected = false
      let decision = createCandidateDecision({
        type: 'suppressed-empty',
        detail: '已压制：这条记忆候选在归一化后没有有意义的内容。',
      })
      let occurrenceCount = 0
      let matchedExistingText: string | undefined

      if (!normalizedText) {
        decision = createCandidateDecision({
          type: 'suppressed-empty',
          detail: '已压制：这条记忆候选在归一化后没有有意义的内容。',
        })
      }
      else if (seenNormalized.has(normalizedText)) {
        decision = createCandidateDecision({
          type: 'suppressed-duplicate',
          detail: '已压制：这一批中已经包含等价的记忆候选。',
        })
      }
      else {
        seenNormalized.add(normalizedText)
        occurrenceCount = getOccurrenceCount(params.kind, normalizedText)
        const duplicate = existingMap.get(normalizedText)
        const structuredKey = extractStructuredKey(item)
        const conflictingItem = structuredKey ? existingKeyMap.get(structuredKey) : undefined

        if (duplicate) {
          decision = createCandidateDecision({
            type: 'suppressed-duplicate',
            detail: '已压制：stable memory 中已存在等价内容。',
          })
          matchedExistingText = duplicate.original
        }
        else if (params.kind === 'preferences' && temporaryPreferencePattern.test(item)) {
          decision = createCandidateDecision({
            type: 'suppressed-not-stable',
            detail: '已压制：临时性的偏好信号还不够稳定，不能自动写回。',
          })
        }
        else if (conflictingItem && conflictingItem.normalized !== normalizedText) {
          decision = createCandidateDecision({
            type: 'suppressed-conflict',
            detail: '已压制：现有 stable memory 已记录了相互冲突的结构化事实。',
          })
          matchedExistingText = conflictingItem.original
        }
        else if (isWeakStableSignal(item) && occurrenceCount < 2) {
          decision = createCandidateDecision({
            type: 'suppressed-needs-repeat',
            detail: '已压制：较弱的稳定信号至少要在两次观察中重复出现后才能写回。',
          })
        }
        else {
          selected = true
          decision = createCandidateDecision({
            type: 'selected',
            detail: '已选中：这条 stable-memory 候选已通过归一化、去重和冲突检查。',
          })
          selectedAddItems.push(item)
        }
      }

      decisions.push({
        id: `${params.kind}:add:${itemIndex}`,
        action: 'add',
        text: item,
        normalizedText,
        selected,
        reason: decision.reason,
        decisionType: decision.decisionType,
        occurrenceCount,
        matchedExistingText,
      })
    }

    const candidate: ExternalMemoryWriteCandidate = {
      layer: mapDocumentKindToExternalMemoryLayer(params.kind),
      kind: params.kind,
      source: params.request.source?.trim() || undefined,
      summary: summarizeCandidate(params.kind, decisions),
      selected: selectedAddItems.length > 0,
      reason: selectedAddItems.length > 0
        ? createCandidateReason({
            code: 'write-written',
            detail: '至少有一条 stable-memory 候选被选中并已准备写入。',
          })
        : decisions[0]?.reason ?? createCandidateReason({
          code: 'write-skipped-empty',
          detail: '归一化后没有保留下可写入的 stable-memory 候选。',
        }),
      addItems: selectedAddItems,
      removeItems: [],
      decisions,
    }

    return {
      candidate,
      selectedAddItems,
    }
  }

  function reviewFollowUpCandidate(params: {
    request: ExternalMemoryWriteRequest
    items: string[]
    removeItems: string[]
    existingItems: string[]
  }): ReviewedFollowUpWriteCandidate {
    const existingMap = buildExistingItemMap(params.existingItems)
    const seenAdds = new Set<string>()
    const seenRemovals = new Set<string>()
    const decisions: ExternalMemoryWriteCandidateDecision[] = []
    const selectedAddItems: string[] = []
    const selectedRemoveItems: string[] = []
    const removedOriginalItems: string[] = []

    for (const [itemIndex, item] of params.items.entries()) {
      const normalizedText = normalizeComparisonText(item)
      let selected = false
      let decision = createCandidateDecision({
        type: 'suppressed-empty',
        detail: '已压制：这条待跟进候选在归一化后没有有意义的内容。',
      })
      let matchedExistingText: string | undefined

      if (!normalizedText) {
        decision = createCandidateDecision({
          type: 'suppressed-empty',
          detail: '已压制：这条待跟进候选在归一化后没有有意义的内容。',
        })
      }
      else if (seenAdds.has(normalizedText)) {
        decision = createCandidateDecision({
          type: 'suppressed-duplicate',
          detail: '已压制：这一批中已经包含等价的待跟进候选。',
        })
      }
      else if (!isActionableFollowUpLine(item)) {
        decision = createCandidateDecision({
          type: 'suppressed-not-actionable',
          detail: '已压制：待跟进记忆只接收明确动作或提醒事项。',
        })
      }
      else if (existingMap.has(normalizedText)) {
        decision = createCandidateDecision({
          type: 'suppressed-duplicate',
          detail: '已压制：相同的动作型待跟进已经存在。',
        })
        matchedExistingText = existingMap.get(normalizedText)?.original
      }
      else {
        seenAdds.add(normalizedText)
        selected = true
        decision = createCandidateDecision({
          type: 'selected',
          detail: '已选中：这条候选是明确可执行的待跟进事项。',
        })
        selectedAddItems.push(item)
      }

      decisions.push({
        id: `follow-ups:add:${itemIndex}`,
        action: 'add',
        text: item,
        normalizedText,
        selected,
        reason: decision.reason,
        decisionType: decision.decisionType,
        occurrenceCount: 1,
        matchedExistingText,
      })
    }

    for (const [itemIndex, item] of params.removeItems.entries()) {
      const normalizedText = normalizeComparisonText(item)
      const existing = normalizedText ? existingMap.get(normalizedText) : undefined
      let selected = false
      let decision = createCandidateDecision({
        type: 'suppressed-empty',
        detail: '已压制：这条待移除的待跟进候选在归一化后没有有意义的内容。',
      })

      if (!normalizedText) {
        decision = createCandidateDecision({
          type: 'suppressed-empty',
          detail: '已压制：这条待移除的待跟进候选在归一化后没有有意义的内容。',
        })
      }
      else if (seenRemovals.has(normalizedText)) {
        decision = createCandidateDecision({
          type: 'suppressed-duplicate',
          detail: '已压制：这一批中已经包含等价的待跟进移除候选。',
        })
      }
      else if (!existing) {
        decision = createCandidateDecision({
          type: 'removal-suppressed-missing',
          detail: '已压制：没有找到可移除的匹配待跟进项。',
        })
      }
      else {
        seenRemovals.add(normalizedText)
        selected = true
        decision = createCandidateDecision({
          type: 'removal-selected',
          detail: '已选中：已找到匹配的待跟进项，可以移除。',
        })
        selectedRemoveItems.push(item)
        removedOriginalItems.push(existing.original)
      }

      decisions.push({
        id: `follow-ups:remove:${itemIndex}`,
        action: 'remove',
        text: item,
        normalizedText,
        selected,
        reason: decision.reason,
        decisionType: decision.decisionType,
        occurrenceCount: 1,
        matchedExistingText: existing?.original,
      })
    }

    const candidate: ExternalMemoryWriteCandidate = {
      layer: mapDocumentKindToExternalMemoryLayer('follow-ups'),
      kind: 'follow-ups',
      source: params.request.source?.trim() || undefined,
      summary: summarizeCandidate('follow-ups', decisions),
      selected: selectedAddItems.length > 0 || selectedRemoveItems.length > 0,
      reason: selectedAddItems.length > 0 || selectedRemoveItems.length > 0
        ? createCandidateReason({
            code: 'write-written',
            detail: '至少有一条待跟进新增或移除候选被选中并已准备写入。',
          })
        : decisions[0]?.reason ?? createCandidateReason({
          code: 'write-skipped-empty',
          detail: '评审后没有保留下可写入的待跟进候选。',
        }),
      addItems: selectedAddItems,
      removeItems: selectedRemoveItems,
      decisions,
    }

    return {
      candidate,
      selectedAddItems,
      selectedRemoveItems,
      removedOriginalItems,
    }
  }

  function reviewRecentSummaryCandidate(params: {
    request: ExternalMemoryWriteRequest
    summary?: string
    previousText?: string
  }): ReviewedRecentSummaryWriteCandidate {
    const nextBodyItems = takeRecentSummaryLines(params.summary ?? '', maxRecentSummaryItems)
    const previousBodyItems = extractRecentSummaryBodyLines(params.previousText ?? '')
    const previousMap = buildExistingItemMap(previousBodyItems)
    const seenNormalized = new Set<string>()
    const decisions: ExternalMemoryWriteCandidateDecision[] = []
    let hasNewBodyContent = false

    for (const [itemIndex, item] of nextBodyItems.entries()) {
      const normalizedText = normalizeComparisonText(item)
      let selected = false
      let decision = createCandidateDecision({
        type: 'suppressed-empty',
        detail: '已压制：这条近期摘要在归一化后没有有意义的内容。',
      })

      if (!normalizedText) {
        decision = createCandidateDecision({
          type: 'suppressed-empty',
          detail: '已压制：这条近期摘要在归一化后没有有意义的内容。',
        })
      }
      else if (seenNormalized.has(normalizedText)) {
        decision = createCandidateDecision({
          type: 'suppressed-duplicate',
          detail: '已压制：这一批中已经包含等价的近期摘要内容。',
        })
      }
      else if (previousMap.has(normalizedText)) {
        seenNormalized.add(normalizedText)
        decision = createCandidateDecision({
          type: 'suppressed-no-new-content',
          detail: '已压制：已存储的近期摘要已经包含相同的有效内容。',
        })
      }
      else {
        seenNormalized.add(normalizedText)
        selected = true
        decision = createCandidateDecision({
          type: 'selected',
          detail: '已选中：这条内容补充了新的有效近期摘要。',
        })
        hasNewBodyContent = true
      }

      decisions.push({
        id: `recent-summary:add:${itemIndex}`,
        action: 'add',
        text: item,
        normalizedText,
        selected,
        reason: decision.reason,
        decisionType: decision.decisionType,
        occurrenceCount: 1,
      })
    }

    const candidate: ExternalMemoryWriteCandidate = {
      layer: mapDocumentKindToExternalMemoryLayer('recent-summary'),
      kind: 'recent-summary',
      source: params.request.source?.trim() || undefined,
      summary: summarizeCandidate('recent-summary', decisions),
      selected: hasNewBodyContent,
      reason: hasNewBodyContent
        ? createCandidateReason({
            code: 'write-written',
            detail: '近期摘要评审发现了可写回的新有效内容。',
          })
        : decisions[0]?.reason ?? createCandidateReason({
          code: 'write-skipped-empty',
          detail: '近期摘要评审没有发现新的有效内容。',
        }),
      addItems: decisions.filter(item => item.selected && item.action === 'add').map(item => item.text),
      removeItems: [],
      decisions,
    }

    return {
      candidate,
      hasBodyContent: nextBodyItems.length > 0,
      hasNewBodyContent,
    }
  }

  async function writeRecentSummary(request: ExternalMemoryWriteRequest) {
    const resolvedRoot = await resolveMemoryRoot()
    const writtenAt = Date.now()
    const path = resolvedRoot.rootPath ? join(resolvedRoot.rootPath, recentSummaryFileName) : undefined
    const previousText = path ? await readOptionalText(path) : undefined
    const reviewed = reviewRecentSummaryCandidate({
      request,
      summary: request.summary,
      previousText,
    })

    if (!path) {
      const review = buildWriteReviewSnapshot({
        reviewedAt: writtenAt,
        summary: reviewed.candidate.summary,
        decision: 'skipped-unavailable',
        candidates: [reviewed.candidate],
      })
      const result: ExternalMemoryWriteResult = {
        kind: 'recent-summary',
        layer: reviewed.candidate.layer,
        ok: false,
        changed: false,
        decision: 'skipped-unavailable',
        reason: review.reason,
        summary: '近期摘要写回已跳过，因为记忆根路径不可用。',
        writtenAt,
        error: resolvedRoot.summary,
        review,
      }
      recordWrite(result)
      return result
    }

    if (!reviewed.hasBodyContent) {
      const review = buildWriteReviewSnapshot({
        reviewedAt: writtenAt,
        summary: reviewed.candidate.summary,
        decision: 'skipped-empty',
        candidates: [reviewed.candidate],
      })
      const result: ExternalMemoryWriteResult = {
        kind: 'recent-summary',
        layer: reviewed.candidate.layer,
        ok: true,
        changed: false,
        decision: 'skipped-empty',
        reason: review.reason,
        summary: '近期摘要写回已跳过，因为没有提供可用的摘要正文。',
        writtenAt,
        path,
        review,
      }
      recordWrite(result)
      return result
    }

    if (!reviewed.hasNewBodyContent) {
      const review = buildWriteReviewSnapshot({
        reviewedAt: writtenAt,
        summary: reviewed.candidate.summary,
        decision: 'skipped-duplicate',
        candidates: [reviewed.candidate],
      })
      const result: ExternalMemoryWriteResult = {
        kind: 'recent-summary',
        layer: reviewed.candidate.layer,
        ok: true,
        changed: false,
        decision: 'skipped-duplicate',
        reason: review.reason,
        summary: '近期摘要已包含相同正文内容，因此无需写回。',
        writtenAt,
        path,
        review,
      }
      recordWrite(result)
      return result
    }

    await writeTextFile(path, buildRecentSummaryText(request.summary ?? ''))
    const review = buildWriteReviewSnapshot({
      reviewedAt: writtenAt,
      summary: reviewed.candidate.summary,
      decision: 'written',
      candidates: [reviewed.candidate],
    })
    const result: ExternalMemoryWriteResult = {
      kind: 'recent-summary',
      layer: reviewed.candidate.layer,
      ok: true,
      changed: true,
      decision: 'written',
      reason: review.reason,
      summary: '近期摘要已用新的正文内容完成更新。',
      writtenAt,
      path,
      added: reviewed.candidate.addItems,
      review,
    }
    recordWrite(result)
    return result
  }

  async function writeFollowUpItems(request: ExternalMemoryWriteRequest) {
    const resolvedRoot = await resolveMemoryRoot()
    const writtenAt = Date.now()
    const path = resolvedRoot.rootPath ? join(resolvedRoot.rootPath, followUpsFileName) : undefined
    const previousText = path ? (await readOptionalText(path)) ?? '' : ''
    const reviewed = reviewFollowUpCandidate({
      request,
      items: normalizeWriteItems(request.items),
      removeItems: normalizeWriteItems(request.removeItems),
      existingItems: takeMeaningfulLines(previousText, Number.MAX_SAFE_INTEGER),
    })

    if (!path) {
      const review = buildWriteReviewSnapshot({
        reviewedAt: writtenAt,
        summary: reviewed.candidate.summary,
        decision: 'skipped-unavailable',
        candidates: [reviewed.candidate],
      })
      const result: ExternalMemoryWriteResult = {
        kind: 'follow-ups',
        layer: reviewed.candidate.layer,
        ok: false,
        changed: false,
        decision: 'skipped-unavailable',
        reason: review.reason,
        summary: '待跟进写回已跳过，因为记忆根路径不可用。',
        writtenAt,
        error: resolvedRoot.summary,
        review,
      }
      recordWrite(result)
      return result
    }

    if (!reviewed.candidate.selected) {
      const decision = deriveSkippedDecisionFromCandidate(reviewed.candidate)
      const review = buildWriteReviewSnapshot({
        reviewedAt: writtenAt,
        summary: reviewed.candidate.summary,
        decision,
        candidates: [reviewed.candidate],
      })
      const result: ExternalMemoryWriteResult = {
        kind: 'follow-ups',
        layer: reviewed.candidate.layer,
        ok: true,
        changed: false,
        decision,
        reason: review.reason,
        summary: decision === 'skipped-duplicate'
          ? '待跟进项目已与已存储列表一致。'
          : '待跟进写回已跳过，因为评审后没有留下可执行的变更。',
        writtenAt,
        path,
        review,
      }
      recordWrite(result)
      return result
    }

    const merged = mergeFollowUpText(previousText, reviewed.selectedAddItems, reviewed.selectedRemoveItems)
    if (merged.changed)
      await writeTextFile(path, merged.text)

    const review = buildWriteReviewSnapshot({
      reviewedAt: writtenAt,
      summary: reviewed.candidate.summary,
      decision: merged.changed ? 'written' : 'skipped-duplicate',
      candidates: [reviewed.candidate],
    })
    const result: ExternalMemoryWriteResult = {
      kind: 'follow-ups',
      layer: reviewed.candidate.layer,
      ok: true,
      changed: merged.changed,
      decision: review.decision,
      reason: review.reason,
      summary: merged.changed ? '待跟进项目已更新。' : '评审后无需更新待跟进项目。',
      writtenAt,
      path,
      added: reviewed.selectedAddItems,
      removed: reviewed.removedOriginalItems,
      review,
    }
    recordWrite(result)
    return result
  }

  async function writeUserProfilePatch(request: ExternalMemoryWriteRequest) {
    const resolvedRoot = await resolveMemoryRoot()
    const writtenAt = Date.now()
    const path = resolvedRoot.rootPath ? join(resolvedRoot.rootPath, userProfileFileName) : undefined
    const previousText = path ? (await readOptionalText(path)) ?? '' : ''
    const reviewed = reviewStableWriteCandidate({
      kind: 'user-profile',
      request,
      items: normalizeWriteItems(request.facts),
      existingItems: takeMeaningfulLines(previousText, Number.MAX_SAFE_INTEGER),
    })

    if (!path) {
      const review = buildWriteReviewSnapshot({
        reviewedAt: writtenAt,
        summary: reviewed.candidate.summary,
        decision: 'skipped-unavailable',
        candidates: [reviewed.candidate],
      })
      const result: ExternalMemoryWriteResult = {
        kind: 'user-profile',
        layer: reviewed.candidate.layer,
        ok: false,
        changed: false,
        decision: 'skipped-unavailable',
        reason: review.reason,
        summary: '用户信息写回已跳过，因为记忆根路径不可用。',
        writtenAt,
        error: resolvedRoot.summary,
        review,
      }
      recordWrite(result)
      return result
    }

    if (!reviewed.candidate.selected) {
      const decision = deriveSkippedDecisionFromCandidate(reviewed.candidate)
      const review = buildWriteReviewSnapshot({
        reviewedAt: writtenAt,
        summary: reviewed.candidate.summary,
        decision,
        candidates: [reviewed.candidate],
      })
      const result: ExternalMemoryWriteResult = {
        kind: 'user-profile',
        layer: reviewed.candidate.layer,
        ok: true,
        changed: false,
        decision,
        reason: review.reason,
        summary: decision === 'skipped-duplicate'
          ? '未检测到新的用户信息事实。'
          : '用户信息写回已跳过，因为评审后的事实还不够稳定。',
        writtenAt,
        path,
        review,
      }
      recordWrite(result)
      return result
    }

    const merged = appendBulletLines(previousText, reviewed.selectedAddItems)
    if (merged.changed)
      await writeTextFile(path, merged.text)

    const review = buildWriteReviewSnapshot({
      reviewedAt: writtenAt,
      summary: reviewed.candidate.summary,
      decision: merged.changed ? 'written' : 'skipped-duplicate',
      candidates: [reviewed.candidate],
    })
    const result: ExternalMemoryWriteResult = {
      kind: 'user-profile',
      layer: reviewed.candidate.layer,
      ok: true,
      changed: merged.changed,
      decision: review.decision,
      reason: review.reason,
      summary: merged.changed ? '用户信息已更新。' : '未检测到新的用户信息事实。',
      writtenAt,
      path,
      added: reviewed.selectedAddItems,
      review,
    }
    recordWrite(result)
    return result
  }

  async function writePreferencesPatch(request: ExternalMemoryWriteRequest) {
    const resolvedRoot = await resolveMemoryRoot()
    const writtenAt = Date.now()
    const path = resolvedRoot.rootPath ? join(resolvedRoot.rootPath, preferencesFileName) : undefined
    const previousText = path ? (await readOptionalText(path)) ?? '' : ''
    const reviewed = reviewStableWriteCandidate({
      kind: 'preferences',
      request,
      items: normalizeWriteItems(request.preferences),
      existingItems: takeMeaningfulLines(previousText, Number.MAX_SAFE_INTEGER),
    })

    if (!path) {
      const review = buildWriteReviewSnapshot({
        reviewedAt: writtenAt,
        summary: reviewed.candidate.summary,
        decision: 'skipped-unavailable',
        candidates: [reviewed.candidate],
      })
      const result: ExternalMemoryWriteResult = {
        kind: 'preferences',
        layer: reviewed.candidate.layer,
        ok: false,
        changed: false,
        decision: 'skipped-unavailable',
        reason: review.reason,
        summary: '偏好设置写回已跳过，因为记忆根路径不可用。',
        writtenAt,
        error: resolvedRoot.summary,
        review,
      }
      recordWrite(result)
      return result
    }

    if (!reviewed.candidate.selected) {
      const decision = deriveSkippedDecisionFromCandidate(reviewed.candidate)
      const review = buildWriteReviewSnapshot({
        reviewedAt: writtenAt,
        summary: reviewed.candidate.summary,
        decision,
        candidates: [reviewed.candidate],
      })
      const result: ExternalMemoryWriteResult = {
        kind: 'preferences',
        layer: reviewed.candidate.layer,
        ok: true,
        changed: false,
        decision,
        reason: review.reason,
        summary: decision === 'skipped-duplicate'
          ? '未检测到新的偏好。'
          : '偏好设置写回已跳过，因为评审后的偏好还不够稳定。',
        writtenAt,
        path,
        review,
      }
      recordWrite(result)
      return result
    }

    const merged = appendBulletLines(previousText, reviewed.selectedAddItems)
    if (merged.changed)
      await writeTextFile(path, merged.text)

    const review = buildWriteReviewSnapshot({
      reviewedAt: writtenAt,
      summary: reviewed.candidate.summary,
      decision: merged.changed ? 'written' : 'skipped-duplicate',
      candidates: [reviewed.candidate],
    })
    const result: ExternalMemoryWriteResult = {
      kind: 'preferences',
      layer: reviewed.candidate.layer,
      ok: true,
      changed: merged.changed,
      decision: review.decision,
      reason: review.reason,
      summary: merged.changed ? '偏好设置已更新。' : '未检测到新的偏好。',
      writtenAt,
      path,
      added: reviewed.selectedAddItems,
      review,
    }
    recordWrite(result)
    return result
  }

  return {
    clearMemoryCandidateLedger,
    clearMemoryWriteCandidateHistory,
    getLastMemoryUsage: () => lastUsage,
    getMemoryJudgementSnapshot,
    loadMemoryContext,
    recordMemoryObservation,
    refreshMemoryJudgement,
    refreshMemoryContext,
    writeFollowUpItems,
    writePreferencesPatch,
    writeRecentSummary,
    writeUserProfilePatch,
  }
}

export function createExternalMemoryService(params: {
  context: MainContext
  manager: ExternalMemoryManager
}) {
  defineInvokeHandler(params.context, electronExternalMemoryLoadContext, async (request) => {
    return await params.manager.loadMemoryContext(request)
  })

  defineInvokeHandler(params.context, electronExternalMemoryRefreshContext, async (request) => {
    return await params.manager.refreshMemoryContext(request)
  })

  defineInvokeHandler(params.context, electronExternalMemoryGetLastUsage, async () => {
    return params.manager.getLastMemoryUsage()
  })

  defineInvokeHandler(params.context, electronExternalMemoryRecordMemoryObservation, async (request) => {
    return await params.manager.recordMemoryObservation(request)
  })

  defineInvokeHandler(params.context, electronExternalMemoryRefreshMemoryJudgement, async () => {
    return await params.manager.refreshMemoryJudgement()
  })

  defineInvokeHandler(params.context, electronExternalMemoryGetMemoryJudgementSnapshot, async () => {
    return await params.manager.getMemoryJudgementSnapshot()
  })

  defineInvokeHandler(params.context, electronExternalMemoryClearMemoryCandidateLedger, async () => {
    return await params.manager.clearMemoryCandidateLedger()
  })

  defineInvokeHandler(params.context, electronExternalMemoryClearWriteCandidateHistory, async () => {
    return params.manager.clearMemoryWriteCandidateHistory()
  })

  defineInvokeHandler(params.context, electronExternalMemoryWriteRecentSummary, async (request) => {
    return await params.manager.writeRecentSummary(request)
  })

  defineInvokeHandler(params.context, electronExternalMemoryWriteFollowUpItems, async (request) => {
    return await params.manager.writeFollowUpItems(request)
  })

  defineInvokeHandler(params.context, electronExternalMemoryWriteUserProfilePatch, async (request) => {
    return await params.manager.writeUserProfilePatch(request)
  })

  defineInvokeHandler(params.context, electronExternalMemoryWritePreferencesPatch, async (request) => {
    return await params.manager.writePreferencesPatch(request)
  })
}
