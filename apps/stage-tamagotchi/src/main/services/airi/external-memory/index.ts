import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type {
  ExternalMemoryCapabilityState,
  ExternalMemoryContextSnapshot,
  ExternalMemoryDocumentKind,
  ExternalMemoryLoadRequest,
  ExternalMemoryReadSnapshot,
  ExternalMemoryUsageSnapshot,
  ExternalMemoryWriteRequest,
  ExternalMemoryWriteResult,
} from '../../../../shared/external-memory'
import type { ExternalIntegrationsManager } from '../external-integrations'

import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { createDefaultExternalMemoryUsageSnapshot } from '@proj-airi/stage-ui/stores/external-memory-shared'

import {
  electronExternalMemoryGetLastUsage,
  electronExternalMemoryLoadContext,
  electronExternalMemoryRefreshContext,
  electronExternalMemoryWriteFollowUpItems,
  electronExternalMemoryWritePreferencesPatch,
  electronExternalMemoryWriteRecentSummary,
  electronExternalMemoryWriteUserProfilePatch,
} from '../../../../shared/eventa'

type MainContext = ReturnType<typeof createContext>['context']

const userProfileFileName = '用户信息.md'
const preferencesFileName = '偏好设置.md'
const followUpsFileName = '待跟进.md'
const recentSummaryFileName = '近期摘要.md'
const characterKnowledgeDirectoryName = '角色知识库'
const maxRecentWrites = 8
const followUpDatePrefixPattern = /^\[\d{4}-\d{2}-\d{2}\]\s*/
const recentSummaryDateHeadingPattern = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/
const temporaryPreferencePattern = /(今天先|这次先|暂时|如果可以|比如|for now|this time|temporarily|if possible|for example)/i
const actionableFollowUpPattern = /(提醒我|记得|之后帮我|待会帮我|明天提醒我|后续跟进|稍后再问我|remind me|please remind me|remember to|follow up|check back)/i

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
    .replace(/^[-*]\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/[：﹕]/g, ': ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeComparisonText(text: string) {
  return normalizeMemoryLine(text)
    .toLowerCase()
    .replace(followUpDatePrefixPattern, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, '\'')
    .replace(/[，、]/g, ',')
    .replace(/；/g, ';')
    .replace(/：/g, ':')
    .replace(/[。！？]/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
}

function dedupeLines(lines: string[]) {
  return Array.from(new Set(lines.map(normalizeMemoryLine).filter(Boolean)))
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

function buildNormalizedItemMap(items: string[]) {
  const normalizedMap = new Map<string, string>()
  for (const item of items) {
    const normalized = normalizeComparisonText(item)
    if (!normalized || normalizedMap.has(normalized))
      continue

    normalizedMap.set(normalized, item)
  }

  return normalizedMap
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

function buildEmptyContext(params: {
  state: ExternalMemoryCapabilityState
  summary: string
  characterName?: string
  readAt?: number
}): ExternalMemoryContextSnapshot {
  return {
    state: params.state,
    summary: params.summary,
    readAt: params.readAt ?? Date.now(),
    characterName: params.characterName,
    documents: [],
    usedKinds: [],
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
  return {
    kind: params.kind,
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
        summary: 'Document is missing.',
      })
    }

    const items = kind === 'recent-summary'
      ? takeRecentSummaryLines(text, limit)
      : kind === 'follow-ups'
        ? takeMeaningfulLines(text, limit).filter(isActionableFollowUpLine)
        : takeMeaningfulLines(text, limit)

    return buildReadSnapshot({
      kind,
      path,
      available: true,
      summary: items.length > 0 ? 'Document loaded.' : 'Document is empty.',
      items,
    })
  }
  catch (error) {
    return buildReadSnapshot({
      kind,
      path,
      available: false,
      summary: 'Failed to read document.',
      error: errorMessageFrom(error) ?? 'Unknown error',
    })
  }
}

async function readCharacterKnowledge(rootPath: string, characterName?: string) {
  const knowledgeDirectoryPath = join(rootPath, characterKnowledgeDirectoryName)

  try {
    if (!await pathExists(knowledgeDirectoryPath)) {
      return buildReadSnapshot({
        kind: 'character-knowledge',
        path: knowledgeDirectoryPath,
        available: false,
        summary: 'Character knowledge directory is missing.',
      })
    }

    const entries = await readdir(knowledgeDirectoryPath)
    const normalizedCharacterName = characterName?.toLowerCase()
    const characterMatches = entries.filter((entry) => {
      if (!normalizedCharacterName)
        return false

      return entry.toLowerCase().includes(normalizedCharacterName)
    })
    const prioritizedEntries = [
      ...characterMatches,
      '核心人格.md',
      '语言风格.md',
      '红线清单.md',
      '人际关系.md',
    ]
      .filter((entry, index, array) => array.indexOf(entry) === index)
      .filter(entry => entries.includes(entry))
      .slice(0, 4)

    if (prioritizedEntries.length === 0) {
      return buildReadSnapshot({
        kind: 'character-knowledge',
        path: knowledgeDirectoryPath,
        available: true,
        summary: 'Character knowledge directory is available but no matching files were selected.',
      })
    }

    const collectedItems: string[] = []
    for (const entry of prioritizedEntries) {
      const text = await readOptionalText(join(knowledgeDirectoryPath, entry))
      if (!text)
        continue

      const items = takeMeaningfulLines(text, 2).map(item => `${entry}: ${item}`)
      collectedItems.push(...items)
      if (collectedItems.length >= 8)
        break
    }

    return buildReadSnapshot({
      kind: 'character-knowledge',
      path: knowledgeDirectoryPath,
      available: true,
      summary: collectedItems.length > 0
        ? 'Selected lightweight character knowledge snippets.'
        : 'Character knowledge files were available but produced no usable snippets.',
      items: collectedItems.slice(0, 8),
    })
  }
  catch (error) {
    return buildReadSnapshot({
      kind: 'character-knowledge',
      path: knowledgeDirectoryPath,
      available: false,
      summary: 'Failed to read character knowledge.',
      error: errorMessageFrom(error) ?? 'Unknown error',
    })
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

function extractRecentSummaryBody(text: string) {
  return text
    .split('\n')
    .map(line => normalizeMemoryLine(line))
    .filter(line => line && !isRecentSummaryMetadataLine(line))
    .join('\n')
}

function normalizeWriteItems(items?: string[]) {
  return dedupeLines(items ?? [])
}

function appendBulletLines(existingText: string, items: string[]) {
  const existingItems = takeMeaningfulLines(existingText, Number.MAX_SAFE_INTEGER)
  const existingMap = buildNormalizedItemMap(existingItems)
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

function mergeFollowUpItems(existingText: string, request: ExternalMemoryWriteRequest) {
  const existingItems = takeMeaningfulLines(existingText, Number.MAX_SAFE_INTEGER)
  const removed = normalizeWriteItems(request.removeItems)
  const removedSet = new Set(removed.map(item => normalizeComparisonText(item)).filter(Boolean))
  const nextItems = existingItems.filter((item) => {
    const normalized = normalizeComparisonText(item)
    return normalized && !removedSet.has(normalized)
  })
  const nextMap = buildNormalizedItemMap(nextItems)
  const added = normalizeWriteItems(request.items)
    .filter((item) => {
      const normalized = normalizeComparisonText(item)
      return normalized && !nextMap.has(normalized)
    })
    .map(item => `[${new Date().toISOString().slice(0, 10)}] ${item}`)

  const mergedItems = [...nextItems, ...added]
  const removedItems = existingItems.filter((item) => {
    const normalized = normalizeComparisonText(item)
    return normalized && removedSet.has(normalized)
  })

  return {
    changed: mergedItems.length !== existingItems.length || added.length > 0,
    added,
    removed: removedItems,
    text: mergedItems.length > 0 ? `${mergedItems.join('\n')}\n` : '',
  }
}

async function writeTextFile(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text, 'utf-8')
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
  writeRecentSummary: (request: ExternalMemoryWriteRequest) => Promise<ExternalMemoryWriteResult>
  writeFollowUpItems: (request: ExternalMemoryWriteRequest) => Promise<ExternalMemoryWriteResult>
  writeUserProfilePatch: (request: ExternalMemoryWriteRequest) => Promise<ExternalMemoryWriteResult>
  writePreferencesPatch: (request: ExternalMemoryWriteRequest) => Promise<ExternalMemoryWriteResult>
}

export function createExternalMemoryManager(params: {
  externalIntegrationsManager: ExternalIntegrationsManager
}): ExternalMemoryManager {
  let lastUsage = createDefaultExternalMemoryUsageSnapshot()

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
    updateUsage({
      lastWrite: result,
      recentWrites: [result, ...lastUsage.recentWrites].slice(0, maxRecentWrites),
    })
  }

  async function resolveMemoryRoot() {
    const snapshot = getMemoryIntegrationSnapshot()
    if (!snapshot || snapshot.config.kind !== 'memory') {
      return {
        state: 'unavailable' as const,
        summary: 'Memory integration is not configured.',
      }
    }

    if (!snapshot.config.enabled) {
      return {
        state: 'disabled' as const,
        summary: 'Memory integration is disabled.',
      }
    }

    const rootPath = snapshot.config.rootPath
    try {
      const rootStat = await stat(rootPath)
      if (!rootStat.isDirectory()) {
        return {
          state: 'degraded' as const,
          summary: 'Memory root path is not a directory.',
        }
      }
    }
    catch {
      return {
        state: 'degraded' as const,
        summary: 'Memory root path is unavailable.',
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
        summary: resolvedRoot.summary,
        characterName,
        context: emptyContext,
        lastReadAt: emptyContext.readAt,
        lastReadSummary: resolvedRoot.summary,
        lastReadError: resolvedRoot.state === 'ready' ? undefined : resolvedRoot.summary,
        lastUsedDocumentKinds: [],
      })
      return emptyContext
    }

    const documents = await Promise.all([
      readStructuredDocument('user-profile', join(resolvedRoot.rootPath, userProfileFileName), 8),
      readStructuredDocument('preferences', join(resolvedRoot.rootPath, preferencesFileName), 8),
      readStructuredDocument('follow-ups', join(resolvedRoot.rootPath, followUpsFileName), 8),
      readStructuredDocument('recent-summary', join(resolvedRoot.rootPath, recentSummaryFileName), 10),
      readCharacterKnowledge(resolvedRoot.rootPath, characterName),
    ])

    const sections = {
      userProfile: documents.find(document => document.kind === 'user-profile')?.items ?? [],
      preferences: documents.find(document => document.kind === 'preferences')?.items ?? [],
      followUps: documents.find(document => document.kind === 'follow-ups')?.items ?? [],
      recentSummary: documents.find(document => document.kind === 'recent-summary')?.items ?? [],
      characterKnowledge: documents.find(document => document.kind === 'character-knowledge')?.items ?? [],
    }
    const usedKinds = documents.filter(document => document.items.length > 0).map(document => document.kind)
    const readAt = Date.now()
    const summary = usedKinds.length > 0
      ? `Loaded trusted external memory from ${usedKinds.length} document group(s).`
      : 'External memory root is reachable, but no usable memory snippets were found.'

    const context: ExternalMemoryContextSnapshot = {
      state: resolvedRoot.state,
      summary,
      readAt,
      characterName,
      documents,
      usedKinds,
      sections,
    }

    updateUsage({
      bridgeState: resolvedRoot.state,
      summary: resolvedRoot.summary,
      characterName,
      context,
      lastReadAt: readAt,
      lastReadSummary: summary,
      lastReadError: documents.some(document => document.error) ? documents.find(document => document.error)?.error : undefined,
      lastUsedDocumentKinds: usedKinds,
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

  async function writeRecentSummary(request: ExternalMemoryWriteRequest) {
    const resolvedRoot = await resolveMemoryRoot()
    const writtenAt = Date.now()
    const path = resolvedRoot.rootPath ? join(resolvedRoot.rootPath, recentSummaryFileName) : undefined

    if (!path) {
      const result: ExternalMemoryWriteResult = {
        kind: 'recent-summary',
        ok: false,
        changed: false,
        decision: 'skipped-unavailable',
        summary: 'Recent summary write skipped because the memory root is unavailable.',
        writtenAt,
        error: resolvedRoot.summary,
      }
      recordWrite(result)
      return result
    }

    const summary = request.summary?.trim()
    if (!summary) {
      const result: ExternalMemoryWriteResult = {
        kind: 'recent-summary',
        ok: false,
        changed: false,
        decision: 'skipped-empty',
        summary: 'Recent summary write skipped because no summary text was provided.',
        writtenAt,
        path,
      }
      recordWrite(result)
      return result
    }

    const nextText = buildRecentSummaryText(summary)
    const previousText = await readOptionalText(path)
    const changed = extractRecentSummaryBody(previousText ?? '') !== extractRecentSummaryBody(nextText)

    if (changed)
      await writeTextFile(path, nextText)

    const result: ExternalMemoryWriteResult = {
      kind: 'recent-summary',
      ok: true,
      changed,
      decision: changed ? 'written' : 'skipped-duplicate',
      summary: changed ? 'Recent summary updated.' : 'Recent summary already matched the latest turn summary.',
      writtenAt,
      path,
    }
    recordWrite(result)
    return result
  }

  async function writeFollowUpItems(request: ExternalMemoryWriteRequest) {
    const resolvedRoot = await resolveMemoryRoot()
    const writtenAt = Date.now()
    const path = resolvedRoot.rootPath ? join(resolvedRoot.rootPath, followUpsFileName) : undefined

    if (!path) {
      const result: ExternalMemoryWriteResult = {
        kind: 'follow-ups',
        ok: false,
        changed: false,
        decision: 'skipped-unavailable',
        summary: 'Follow-up write skipped because the memory root is unavailable.',
        writtenAt,
        error: resolvedRoot.summary,
      }
      recordWrite(result)
      return result
    }

    const normalizedPayload = normalizeWriteItems([...(request.items ?? []), ...(request.removeItems ?? [])])
    if (normalizedPayload.length === 0) {
      const result: ExternalMemoryWriteResult = {
        kind: 'follow-ups',
        ok: true,
        changed: false,
        decision: 'skipped-empty',
        summary: 'Follow-up write skipped because no actionable items were provided.',
        writtenAt,
        path,
      }
      recordWrite(result)
      return result
    }

    const previousText = (await readOptionalText(path)) ?? ''
    const merged = mergeFollowUpItems(previousText, request)
    if (merged.changed)
      await writeTextFile(path, merged.text)

    const result: ExternalMemoryWriteResult = {
      kind: 'follow-ups',
      ok: true,
      changed: merged.changed,
      decision: merged.changed ? 'written' : 'skipped-duplicate',
      summary: merged.changed ? 'Follow-up items updated.' : 'No follow-up changes were needed.',
      writtenAt,
      path,
      added: merged.added,
      removed: merged.removed,
    }
    recordWrite(result)
    return result
  }

  async function writeUserProfilePatch(request: ExternalMemoryWriteRequest) {
    const resolvedRoot = await resolveMemoryRoot()
    const writtenAt = Date.now()
    const path = resolvedRoot.rootPath ? join(resolvedRoot.rootPath, userProfileFileName) : undefined

    if (!path) {
      const result: ExternalMemoryWriteResult = {
        kind: 'user-profile',
        ok: false,
        changed: false,
        decision: 'skipped-unavailable',
        summary: 'User profile write skipped because the memory root is unavailable.',
        writtenAt,
        error: resolvedRoot.summary,
      }
      recordWrite(result)
      return result
    }

    const facts = normalizeWriteItems(request.facts)
    if (facts.length === 0) {
      const result: ExternalMemoryWriteResult = {
        kind: 'user-profile',
        ok: true,
        changed: false,
        decision: 'skipped-empty',
        summary: 'User profile write skipped because no stable facts were provided.',
        writtenAt,
        path,
      }
      recordWrite(result)
      return result
    }

    const previousText = (await readOptionalText(path)) ?? ''
    const merged = appendBulletLines(previousText, facts)
    if (merged.changed)
      await writeTextFile(path, merged.text)

    const result: ExternalMemoryWriteResult = {
      kind: 'user-profile',
      ok: true,
      changed: merged.changed,
      decision: merged.changed ? 'written' : 'skipped-duplicate',
      summary: merged.changed ? 'User profile updated.' : 'No new user-profile facts were detected.',
      writtenAt,
      path,
      added: merged.added,
    }
    recordWrite(result)
    return result
  }

  async function writePreferencesPatch(request: ExternalMemoryWriteRequest) {
    const resolvedRoot = await resolveMemoryRoot()
    const writtenAt = Date.now()
    const path = resolvedRoot.rootPath ? join(resolvedRoot.rootPath, preferencesFileName) : undefined

    if (!path) {
      const result: ExternalMemoryWriteResult = {
        kind: 'preferences',
        ok: false,
        changed: false,
        decision: 'skipped-unavailable',
        summary: 'Preference write skipped because the memory root is unavailable.',
        writtenAt,
        error: resolvedRoot.summary,
      }
      recordWrite(result)
      return result
    }

    const preferences = normalizeWriteItems(request.preferences)
      .filter(item => !temporaryPreferencePattern.test(item))
    if (preferences.length === 0) {
      const result: ExternalMemoryWriteResult = {
        kind: 'preferences',
        ok: true,
        changed: false,
        decision: 'skipped-not-stable',
        summary: 'Preference write skipped because no stable preferences were provided.',
        writtenAt,
        path,
      }
      recordWrite(result)
      return result
    }

    const previousText = (await readOptionalText(path)) ?? ''
    const merged = appendBulletLines(previousText, preferences)
    if (merged.changed)
      await writeTextFile(path, merged.text)

    const result: ExternalMemoryWriteResult = {
      kind: 'preferences',
      ok: true,
      changed: merged.changed,
      decision: merged.changed ? 'written' : 'skipped-duplicate',
      summary: merged.changed ? 'Preferences updated.' : 'No new preferences were detected.',
      writtenAt,
      path,
      added: merged.added,
    }
    recordWrite(result)
    return result
  }

  return {
    getLastMemoryUsage: () => lastUsage,
    loadMemoryContext,
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
