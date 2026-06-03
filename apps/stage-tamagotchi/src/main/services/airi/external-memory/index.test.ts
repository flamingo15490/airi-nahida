import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

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
  it('loads only meaningful trusted external memory items into a JSON-safe context snapshot', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'airi-external-memory-'))
    await mkdir(join(rootPath, '角色知识库'), { recursive: true })
    await writeFile(join(rootPath, '用户信息.md'), '我是北京大学的学生。\n')
    await writeFile(join(rootPath, '偏好设置.md'), '- 我喜欢温柔一点的回复。\n')
    await writeFile(join(rootPath, '待跟进.md'), '[2026-06-02] 明天提醒我交作业。\n[2026-06-02] 我明天可能做作业。\n')
    await writeFile(join(rootPath, '近期摘要.md'), '# 近期摘要\n\n## 2026-06-02 21:00\n- 我们已经打通了外部记忆。\n')
    await writeFile(join(rootPath, '角色知识库', '核心人格.md'), '- 温柔、聪明、观察力强。\n')

    const { createExternalMemoryManager } = await import('./index')
    const manager = createExternalMemoryManager({
      externalIntegrationsManager: createExternalIntegrationsManager(rootPath) as never,
    })

    const context = await manager.refreshMemoryContext({ characterName: 'Nahida' })
    const usage = manager.getLastMemoryUsage()

    expect(context.usedKinds).toContain('user-profile')
    expect(context.usedKinds).toContain('character-knowledge')
    expect(context.sections.userProfile).toEqual(['我是北京大学的学生。'])
    expect(context.sections.followUps).toEqual(['[2026-06-02] 明天提醒我交作业。'])
    expect(context.sections.recentSummary).toEqual(['我们已经打通了外部记忆。'])
    expect(context.sections.characterKnowledge[0]).toContain('核心人格.md')
    expect(usage.lastUsedDocumentKinds).toContain('recent-summary')
  })

  it('gracefully degrades when the external root is unavailable', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'airi-external-memory-missing-'))
    const missingRootPath = join(basePath, 'missing-memory-root')

    const { createExternalMemoryManager } = await import('./index')
    const manager = createExternalMemoryManager({
      externalIntegrationsManager: createExternalIntegrationsManager(missingRootPath) as never,
    })

    const context = await manager.refreshMemoryContext({ characterName: 'Nahida' })

    expect(context.state).toBe('degraded')
    expect(context.usedKinds).toEqual([])
    expect(manager.getLastMemoryUsage().bridgeState).toBe('degraded')
  })

  it('skips rewriting recent summaries when only the timestamp heading changes', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'airi-external-memory-summary-'))
    await writeFile(
      join(rootPath, '近期摘要.md'),
      '# 近期摘要\n\n## 2026-06-02 21:00\n- User: 继续做第四阶段。\n- AIRI: 已接通外部记忆闭环。\n',
    )

    const { createExternalMemoryManager } = await import('./index')
    const manager = createExternalMemoryManager({
      externalIntegrationsManager: createExternalIntegrationsManager(rootPath) as never,
    })

    const result = await manager.writeRecentSummary({
      summary: '## 2026-06-03 09:00\n- User: 继续做第四阶段。\n- AIRI: 已接通外部记忆闭环。\n',
    })

    expect(result.ok).toBe(true)
    expect(result.changed).toBe(false)
    expect(result.decision).toBe('skipped-duplicate')
    expect(await readFile(join(rootPath, '近期摘要.md'), 'utf-8')).toContain('2026-06-02 21:00')
  })

  it('writes summaries, preferences, and follow-ups with duplicate-aware decisions', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'airi-external-memory-write-'))
    await mkdir(join(rootPath, '角色知识库'), { recursive: true })
    await writeFile(join(rootPath, '偏好设置.md'), '- 我喜欢温柔一点的回复。\n')
    await writeFile(join(rootPath, '待跟进.md'), '[2026-06-01] 问我今天的计划。\n')

    const { createExternalMemoryManager } = await import('./index')
    const manager = createExternalMemoryManager({
      externalIntegrationsManager: createExternalIntegrationsManager(rootPath) as never,
    })

    const summaryResult = await manager.writeRecentSummary({
      summary: '## 2026-06-02 21:00\n- User: 继续做第四阶段。\n- AIRI: 已接通外部记忆闭环。\n',
    })
    const preferenceResult = await manager.writePreferencesPatch({
      preferences: ['我更喜欢简洁但温柔的技术说明。'],
    })
    const followUpResult = await manager.writeFollowUpItems({
      items: ['明天提醒我继续验收第四阶段。'],
      removeItems: ['问我今天的计划。'],
    })

    expect(summaryResult.decision).toBe('written')
    expect(preferenceResult.decision).toBe('written')
    expect(followUpResult.decision).toBe('written')

    expect(await readFile(join(rootPath, '近期摘要.md'), 'utf-8')).toContain('继续做第四阶段')
    expect(await readFile(join(rootPath, '偏好设置.md'), 'utf-8')).toContain('我更喜欢简洁但温柔的技术说明。')
    expect(await readFile(join(rootPath, '待跟进.md'), 'utf-8')).toContain('明天提醒我继续验收第四阶段。')
    expect(await readFile(join(rootPath, '待跟进.md'), 'utf-8')).not.toContain('问我今天的计划。')
  })

  it('returns stable skip decisions for unavailable, empty, and duplicate writes', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'airi-external-memory-decisions-'))
    const missingRootPath = join(rootPath, 'missing-memory-root')
    await writeFile(join(rootPath, '用户信息.md'), '- 我是学生。\n')

    const { createExternalMemoryManager } = await import('./index')
    const unavailableManager = createExternalMemoryManager({
      externalIntegrationsManager: createExternalIntegrationsManager(missingRootPath) as never,
    })
    const manager = createExternalMemoryManager({
      externalIntegrationsManager: createExternalIntegrationsManager(rootPath) as never,
    })

    const unavailableResult = await unavailableManager.writeUserProfilePatch({
      facts: ['我是学生。'],
    })
    const emptyResult = await manager.writeUserProfilePatch({
      facts: [],
    })
    const duplicateResult = await manager.writeUserProfilePatch({
      facts: ['我是学生。'],
    })

    expect(unavailableResult.decision).toBe('skipped-unavailable')
    expect(emptyResult.decision).toBe('skipped-empty')
    expect(duplicateResult.decision).toBe('skipped-duplicate')
  })
})
