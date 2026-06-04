import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createDefaultExternalMemoryUsageSnapshot } from '@proj-airi/stage-ui/stores/external-memory-shared'
import { describe, expect, it } from 'vitest'

const userProfileFileName = '\u7528\u6237\u4FE1\u606F.md'
const preferencesFileName = '\u504F\u597D\u8BBE\u7F6E.md'
const followUpsFileName = '\u5F85\u8DDF\u8FDB.md'
const recentSummaryFileName = '\u8FD1\u671F\u6458\u8981.md'
const characterKnowledgeDirectoryName = '\u89D2\u8272\u77E5\u8BC6\u5E93'

function createExternalIntegrationsManager(rootPath: string, state: 'ready' | 'degraded' | 'disabled' = 'ready') {
  return {
    getSnapshots: () => [{
      kind: 'memory',
      config: {
        kind: 'memory',
        enabled: state !== 'disabled',
        rootPath,
        filesystemServerName: 'filesystem',
        obsidianServerName: 'obsidian',
      },
      status: {
        kind: 'memory',
        state,
        summary: state === 'ready' ? 'Memory integration is ready.' : 'Memory integration is degraded.',
      },
    }],
  }
}

describe('external memory manager', () => {
  it('builds layered turn snapshots with selected and suppressed evidence reasons', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'airi-external-memory-layering-'))
    await mkdir(join(rootPath, characterKnowledgeDirectoryName), { recursive: true })
    await writeFile(join(rootPath, userProfileFileName), [
      '- timezone: UTC+8',
      '- occupation: student',
      '',
    ].join('\n'))
    await writeFile(join(rootPath, preferencesFileName), [
      '- reply style: concise',
      '',
    ].join('\n'))
    await writeFile(join(rootPath, followUpsFileName), [
      '[2026-06-02] remind me to submit the report tomorrow',
      '[2026-06-02] I might submit the report tomorrow',
      '',
    ].join('\n'))
    await writeFile(join(rootPath, recentSummaryFileName), [
      '# 近期摘要',
      '',
      '## 2026-06-02 21:00',
      '- timezone: UTC+9',
      '- project: memory layering runtime',
      '',
    ].join('\n'))
    await writeFile(
      join(rootPath, characterKnowledgeDirectoryName, 'Nahida-notes.md'),
      [
        '- habit: speaks calmly and precisely',
        '',
      ].join('\n'),
    )

    const { createExternalMemoryManager } = await import('./index')
    const manager = createExternalMemoryManager({
      externalIntegrationsManager: createExternalIntegrationsManager(rootPath) as never,
    })

    const context = await manager.refreshMemoryContext({ characterName: 'Nahida' })

    expect(context.reason.code).toBe('context-loaded')
    expect(context.layerOrder).toEqual([
      'stable-profile',
      'stable-preferences',
      'active-follow-ups',
      'recent-context',
      'character-knowledge',
    ])
    expect(context.usedKinds).toEqual([
      'user-profile',
      'preferences',
      'follow-ups',
      'recent-summary',
      'character-knowledge',
    ])
    expect(context.sections.followUps).toEqual([
      '[2026-06-02] remind me to submit the report tomorrow',
    ])
    expect(context.sections.recentSummary).toEqual([
      'project: memory layering runtime',
    ])
    expect(context.sections.characterKnowledge).toEqual([
      'Nahida-notes.md: habit: speaks calmly and precisely',
    ])

    const suppressedRecentFact = context.turn.evidence.find(item => item.text === 'timezone: UTC+9')
    expect(suppressedRecentFact?.selected).toBe(false)
    expect(suppressedRecentFact?.decisionType).toBe('suppressed-lower-priority')
    expect(suppressedRecentFact?.reason?.code).toBe('layer-empty')
    expect(suppressedRecentFact?.reason?.detail).toContain('stable profile')

    const suppressedFollowUp = context.turn.evidence.find(item => item.text.includes('I might submit'))
    expect(suppressedFollowUp?.selected).toBe(false)
    expect(suppressedFollowUp?.decisionType).toBe('suppressed-not-actionable')
    expect(suppressedFollowUp?.reason?.code).toBe('layer-empty')

    expect(context.turn.evidence.every(item => item.reason)).toBe(true)
    expect(context.turn.selections.every(item => item.reason)).toBe(true)
    expect(context.turn.selections.find(item => item.layer === 'character-knowledge')?.selected).toBe(true)
    expect(context.turn.usedLayers).toContain('character-knowledge')
  })

  it('keeps character knowledge out when the current character does not match and degrades cleanly when root is unavailable', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'airi-external-memory-character-'))
    await mkdir(join(rootPath, characterKnowledgeDirectoryName), { recursive: true })
    await writeFile(join(rootPath, userProfileFileName), '- timezone: UTC+8\n')
    await writeFile(
      join(rootPath, characterKnowledgeDirectoryName, 'Nahida-notes.md'),
      '- habit: speaks calmly and precisely\n',
    )

    const { createExternalMemoryManager } = await import('./index')
    const manager = createExternalMemoryManager({
      externalIntegrationsManager: createExternalIntegrationsManager(rootPath) as never,
    })

    const mismatchContext = await manager.refreshMemoryContext({ characterName: 'Lumine' })
    expect(mismatchContext.usedKinds).toEqual(['user-profile'])
    expect(mismatchContext.sections.characterKnowledge).toEqual([])
    expect(mismatchContext.turn.selections.find(item => item.layer === 'character-knowledge')?.selected).toBe(false)

    const unavailableManager = createExternalMemoryManager({
      externalIntegrationsManager: createExternalIntegrationsManager(join(rootPath, 'missing-root')) as never,
    })
    const unavailableContext = await unavailableManager.refreshMemoryContext({ characterName: 'Nahida' })
    expect(unavailableContext.state).toBe('degraded')
    expect(unavailableContext.usedKinds).toEqual([])
    expect(unavailableManager.getLastMemoryUsage().bridgeState).toBe('degraded')
  })

  it('reviews stable writes and follow-up writes with repeat thresholds, conflicts, and actionable filtering', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'airi-external-memory-write-review-'))
    await writeFile(join(rootPath, userProfileFileName), [
      '- timezone: UTC+8',
      '',
    ].join('\n'))
    await writeFile(join(rootPath, preferencesFileName), [
      '- reply style: concise',
      '',
    ].join('\n'))
    await writeFile(join(rootPath, followUpsFileName), [
      '[2026-06-01] remind me to stretch after lunch',
      '',
    ].join('\n'))

    const { createExternalMemoryManager } = await import('./index')
    const manager = createExternalMemoryManager({
      externalIntegrationsManager: createExternalIntegrationsManager(rootPath) as never,
    })

    const weakPreferenceFirst = await manager.writePreferencesPatch({
      preferences: ['maybe tone: softer'],
    })
    expect(weakPreferenceFirst.decision).toBe('skipped-not-stable')
    expect(weakPreferenceFirst.review.candidates[0]?.decisions?.[0]?.decisionType).toBe('suppressed-needs-repeat')

    const weakPreferenceSecond = await manager.writePreferencesPatch({
      preferences: ['maybe tone: softer'],
    })
    expect(weakPreferenceSecond.decision).toBe('written')
    expect(weakPreferenceSecond.review.candidates[0]?.decisions?.[0]?.decisionType).toBe('selected')

    const conflictProfile = await manager.writeUserProfilePatch({
      facts: ['timezone: UTC+9'],
    })
    expect(conflictProfile.decision).toBe('skipped-not-stable')
    expect(conflictProfile.review.candidates[0]?.decisions?.[0]?.decisionType).toBe('suppressed-conflict')

    const followUpResult = await manager.writeFollowUpItems({
      items: [
        'remind me to review the memory layering PR tomorrow',
        'I might review the memory layering PR tomorrow',
      ],
      removeItems: [
        'remind me to stretch after lunch',
      ],
    })
    expect(followUpResult.decision).toBe('written')
    expect(followUpResult.review.candidates[0]?.decisions?.map(item => item.decisionType)).toEqual([
      'selected',
      'suppressed-not-actionable',
      'removal-selected',
    ])

    const preferencesText = await readFile(join(rootPath, preferencesFileName), 'utf-8')
    expect(preferencesText).toContain('maybe tone: softer')

    const followUpsText = await readFile(join(rootPath, followUpsFileName), 'utf-8')
    expect(followUpsText).toContain('review the memory layering PR tomorrow')
    expect(followUpsText).not.toContain('stretch after lunch')
  })

  it('writes recent summaries only when the body has substantive new content and returns stable skip decisions for empty or duplicate batches', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'airi-external-memory-summary-review-'))
    await writeFile(
      join(rootPath, recentSummaryFileName),
      [
        '# 近期摘要',
        '',
        '## 2026-06-02 21:00',
        '- user: continue phase eight',
        '- airi: memory layering runtime is wired up',
        '',
      ].join('\n'),
    )
    await writeFile(join(rootPath, userProfileFileName), '- occupation: student\n')

    const { createExternalMemoryManager } = await import('./index')
    const manager = createExternalMemoryManager({
      externalIntegrationsManager: createExternalIntegrationsManager(rootPath) as never,
    })

    const duplicateSummary = await manager.writeRecentSummary({
      summary: [
        '## 2026-06-03 09:00',
        '- user: continue phase eight',
        '- airi: memory layering runtime is wired up',
      ].join('\n'),
    })
    expect(duplicateSummary.decision).toBe('skipped-duplicate')
    expect(duplicateSummary.review.candidates[0]?.decisions?.every(item => !item.selected)).toBe(true)

    const changedSummary = await manager.writeRecentSummary({
      summary: [
        '## 2026-06-03 10:00',
        '- user: continue phase eight',
        '- airi: memory layering runtime is wired up',
        '- airi: write review snapshots are now emitted',
      ].join('\n'),
    })
    expect(changedSummary.decision).toBe('written')
    expect(changedSummary.review.candidates[0]?.decisions?.at(-1)?.decisionType).toBe('selected')

    const emptyProfile = await manager.writeUserProfilePatch({
      facts: [],
    })
    expect(emptyProfile.decision).toBe('skipped-empty')

    const duplicateProfile = await manager.writeUserProfilePatch({
      facts: ['occupation: student'],
    })
    expect(duplicateProfile.decision).toBe('skipped-duplicate')

    const summaryText = await readFile(join(rootPath, recentSummaryFileName), 'utf-8')
    expect(summaryText).toContain('write review snapshots are now emitted')
  })

  it('clears main-runtime write candidate history without touching recent writes, turn snapshots, or persisted files', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'airi-external-memory-clear-history-'))
    await writeFile(join(rootPath, userProfileFileName), '- timezone: UTC+8\n')
    await writeFile(
      join(rootPath, recentSummaryFileName),
      [
        '# 近期摘要',
        '',
        '## 2026-06-03 10:00',
        '- user: continue phase eight',
        '- airi: candidate review is visible',
        '',
      ].join('\n'),
    )

    const { createExternalMemoryManager } = await import('./index')
    const manager = createExternalMemoryManager({
      externalIntegrationsManager: createExternalIntegrationsManager(rootPath) as never,
    })

    await manager.refreshMemoryContext({ characterName: 'Nahida' })
    const usageBeforeWrite = manager.getLastMemoryUsage()

    const writeResult = await manager.writePreferencesPatch({
      preferences: ['reply style: concise'],
    })
    expect(writeResult.review.candidates).toHaveLength(1)

    const usageBeforeClear = manager.getLastMemoryUsage()
    expect(usageBeforeClear.lastWriteReview?.candidates).toHaveLength(1)
    expect(usageBeforeClear.recentWrites).toHaveLength(1)

    const clearedUsage = manager.clearMemoryWriteCandidateHistory()

    expect(clearedUsage.lastWriteReview).toEqual(createDefaultExternalMemoryUsageSnapshot().lastWriteReview)
    expect(clearedUsage.lastWrite?.review).toEqual(createDefaultExternalMemoryUsageSnapshot().lastWriteReview)
    expect(clearedUsage.recentWrites).toEqual(usageBeforeClear.recentWrites)
    expect(clearedUsage.recentWrites[0]?.review.candidates).toHaveLength(1)
    expect(clearedUsage.turn).toEqual(usageBeforeWrite.turn)
    expect(clearedUsage.turn?.summary).toBe(usageBeforeWrite.turn?.summary)

    const preferencesText = await readFile(join(rootPath, preferencesFileName), 'utf-8')
    expect(preferencesText).toContain('reply style: concise')
  })
})
