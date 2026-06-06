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
const candidateLedgerFileName = 'external-memory-candidate-ledger.json'
const defaultCharacterKnowledgeFileNames = [
  '\u6838\u5FC3\u4EBA\u683C.md',
  '\u8BED\u8A00\u98CE\u683C.md',
  '\u7EA2\u7EBF\u6E05\u5355.md',
  '\u4EBA\u9645\u5173\u7CFB.md',
  '\u80CC\u666F\u6545\u4E8B.md',
  '\u5916\u8C8C\u63CF\u5199.md',
  '\u8BED\u6599\u5E93.md',
] as const

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

function createManager(rootPath: string, state: 'ready' | 'degraded' | 'disabled' = 'ready') {
  return import('./index').then(({ createExternalMemoryManager }) => createExternalMemoryManager({
    externalIntegrationsManager: createExternalIntegrationsManager(rootPath, state) as never,
    userDataPath: rootPath,
  }))
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

    const manager = await createManager(rootPath)

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
    expect(suppressedRecentFact?.reason?.detail).toContain('已稳定的用户信息或偏好')

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

    const manager = await createManager(rootPath)

    const mismatchContext = await manager.refreshMemoryContext({ characterName: 'Lumine' })
    expect(mismatchContext.usedKinds).toEqual(['user-profile'])
    expect(mismatchContext.sections.characterKnowledge).toEqual([])
    expect(mismatchContext.turn.selections.find(item => item.layer === 'character-knowledge')?.selected).toBe(false)

    const unavailableManager = await createManager(join(rootPath, 'missing-root'))
    const unavailableContext = await unavailableManager.refreshMemoryContext({ characterName: 'Nahida' })
    expect(unavailableContext.state).toBe('degraded')
    expect(unavailableContext.usedKinds).toEqual([])
    expect(unavailableManager.getLastMemoryUsage().bridgeState).toBe('degraded')
  })

  it('falls back to a single-character curated knowledge directory when files are intentionally category-named', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'airi-external-memory-single-character-'))
    await mkdir(join(rootPath, characterKnowledgeDirectoryName), { recursive: true })
    await writeFile(join(rootPath, userProfileFileName), '- timezone: UTC+8\n')
    await writeFile(
      join(rootPath, characterKnowledgeDirectoryName, defaultCharacterKnowledgeFileNames[0]),
      '- calm and observant\n',
    )
    await writeFile(
      join(rootPath, characterKnowledgeDirectoryName, defaultCharacterKnowledgeFileNames[1]),
      '- prefers short, gentle metaphors\n',
    )

    const manager = await createManager(rootPath)

    const context = await manager.refreshMemoryContext({ characterName: '纳西妲特供版' })

    expect(context.usedKinds).toEqual(['user-profile', 'character-knowledge'])
    expect(context.sections.characterKnowledge).toEqual([
      `${defaultCharacterKnowledgeFileNames[0]}: calm and observant`,
      `${defaultCharacterKnowledgeFileNames[1]}: prefers short, gentle metaphors`,
    ])
    expect(context.documents.find(item => item.kind === 'character-knowledge')?.summary).toBe('未命中角色命名文件，已按单角色资料目录选取角色知识片段。')
    expect(context.turn.selections.find(item => item.layer === 'character-knowledge')?.selected).toBe(true)
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

    const manager = await createManager(rootPath)

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

    const manager = await createManager(rootPath)

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

    const manager = await createManager(rootPath)

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

  it('freezes phase-nine judgement ledger semantics in userData JSON', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'airi-external-memory-judgement-'))
    const manager = await createManager(rootPath)

    const tentativePreference = await manager.recordMemoryObservation({
      kind: 'preferences',
      source: 'user-turn-preferences',
      text: 'reply style: concise',
      observedAt: 100,
    })
    expect(tentativePreference.candidateLedgerPath).toBe(join(rootPath, candidateLedgerFileName))
    expect(tentativePreference.candidates[0]?.status).toBe('tentative')
    expect(tentativePreference.recommendations).toEqual([])

    const stablePreference = await manager.recordMemoryObservation({
      kind: 'preferences',
      source: 'user-turn-preferences',
      text: 'reply style: concise',
      observedAt: 200,
    })
    expect(stablePreference.candidates[0]?.status).toBe('stable')
    expect(stablePreference.recommendations[0]?.kind).toBe('preferences')
    expect(stablePreference.recommendations[0]?.addItems).toEqual(['reply style: concise'])

    const strongProfile = await manager.recordMemoryObservation({
      kind: 'user-profile',
      source: 'user-turn-profile',
      text: 'location: Shanghai',
      strongSignal: true,
      observedAt: 300,
    })
    const strongProfileCandidate = strongProfile.candidates.find(candidate => candidate.kind === 'user-profile')
    expect(strongProfileCandidate?.status).toBe('stable')

    const stableFollowUp = await manager.recordMemoryObservation({
      kind: 'follow-ups',
      source: 'user-turn-follow-ups',
      text: 'remind me to review the memory PR tomorrow',
      actionable: true,
      observedAt: 400,
    })
    const followUpCandidate = stableFollowUp.candidates.find(candidate => candidate.kind === 'follow-ups')
    expect(followUpCandidate?.status).toBe('stable')

    const suppressedSummary = await manager.recordMemoryObservation({
      kind: 'recent-summary',
      source: 'assistant-turn-summary',
      text: 'user: continue phase nine',
      observedAt: 500,
    })
    const summaryCandidate = suppressedSummary.candidates.find(candidate => candidate.kind === 'recent-summary')
    expect(summaryCandidate?.status).toBe('suppressed')
    expect(suppressedSummary.recommendations.some(item => item.kind === 'recent-summary')).toBe(false)

    const suppressedCharacterKnowledge = await manager.recordMemoryObservation({
      kind: 'character-knowledge',
      source: 'manual-candidate-review',
      text: 'Nahida-notes.md: habit: speaks calmly and precisely',
      strongSignal: true,
      observedAt: 600,
    })
    const characterCandidate = suppressedCharacterKnowledge.candidates.find(candidate => candidate.kind === 'character-knowledge')
    expect(characterCandidate?.status).toBe('suppressed')
    expect(suppressedCharacterKnowledge.recommendations.some(item => item.kind === 'character-knowledge')).toBe(false)

    const conflictedProfile = await manager.recordMemoryObservation({
      kind: 'user-profile',
      source: 'user-turn-profile',
      text: 'location: Beijing',
      strongSignal: true,
      observedAt: 700,
    })
    const conflictCandidate = conflictedProfile.candidates.find(candidate => candidate.text === 'location: Beijing')
    expect(conflictCandidate?.status).toBe('conflicted')
    expect(conflictedProfile.conflicts.length).toBeGreaterThan(0)

    const ledgerText = await readFile(join(rootPath, candidateLedgerFileName), 'utf-8')
    expect(ledgerText).toContain('reply style: concise')
    expect(ledgerText).not.toContain('D:\\AIRI-Memory')

    const cleared = await manager.clearMemoryCandidateLedger()
    expect(cleared.candidates).toEqual([])
    expect(cleared.recommendations).toEqual([])
  })

  it('keeps one evidence count per round for the same normalized candidate', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'airi-external-memory-judgement-round-dedupe-'))
    const manager = await createManager(rootPath)

    await manager.recordMemoryObservation({
      kind: 'preferences',
      source: 'user-turn-preferences',
      text: 'reply style: concise',
      observedAt: 1000,
    })
    const duplicateSameRound = await manager.recordMemoryObservation({
      kind: 'preferences',
      source: 'user-turn-preferences',
      text: 'reply style: concise',
      observedAt: 1000,
    })

    expect(duplicateSameRound.candidates).toHaveLength(1)
    expect(duplicateSameRound.candidates[0]?.observationCount).toBe(1)
    expect(duplicateSameRound.candidates[0]?.status).toBe('tentative')

    const nextRound = await manager.recordMemoryObservation({
      kind: 'preferences',
      source: 'user-turn-preferences',
      text: 'reply style: concise',
      observedAt: 2000,
    })
    expect(nextRound.candidates[0]?.observationCount).toBe(2)
    expect(nextRound.candidates[0]?.status).toBe('stable')
  })

  it('marks a new stable-profile candidate as conflicted when it collides with persisted stable memory', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'airi-external-memory-persisted-conflict-'))
    await writeFile(join(rootPath, userProfileFileName), [
      '- location: Shanghai',
      '',
    ].join('\n'))

    const manager = await createManager(rootPath)

    const conflicted = await manager.recordMemoryObservation({
      kind: 'user-profile',
      source: 'user-turn-profile',
      text: 'location: Beijing',
      strongSignal: true,
      observedAt: 100,
    })

    expect(conflicted.candidates[0]?.status).toBe('conflicted')
    expect(conflicted.candidates[0]?.reason).toContain('stable memory')
    expect(conflicted.conflicts).toHaveLength(1)
    expect(conflicted.conflicts[0]?.existingText).toBe('location: Shanghai')
    expect(conflicted.conflicts[0]?.incomingText).toBe('location: Beijing')
    expect(conflicted.recommendations).toEqual([])
  })
})
