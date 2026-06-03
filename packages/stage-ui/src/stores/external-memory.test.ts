import { describe, expect, it } from 'vitest'

import {
  composeExternalMemorySupplement,
} from './external-memory'
import {
  composeRecentSummaryFromMessages,
  extractFollowUpItemsFromText,
  extractPreferencePatchesFromText,
  extractUserProfilePatchesFromText,
} from './external-memory-store'

describe('external memory supplement', () => {
  it('returns a guardrail when the bridge is unavailable', () => {
    expect(composeExternalMemorySupplement({
      usage: {
        bridgeState: 'degraded',
        summary: 'Memory unavailable.',
        recentWrites: [],
        lastUsedDocumentKinds: [],
      },
    })).toContain('[External Memory Guardrail]')
  })

  it('renders structured sections from a trusted context snapshot', () => {
    const supplement = composeExternalMemorySupplement({
      usage: {
        bridgeState: 'ready',
        summary: 'ready',
        recentWrites: [],
        lastUsedDocumentKinds: ['user-profile', 'preferences'],
      },
      context: {
        state: 'ready',
        summary: 'Loaded.',
        readAt: 1,
        usedKinds: ['user-profile', 'preferences'],
        documents: [],
        sections: {
          userProfile: ['The user studies finance and computing.'],
          preferences: ['The user prefers warm but concise replies.'],
          followUps: ['Remind the user to review the fourth phase tomorrow.'],
          recentSummary: ['We stabilized the desktop memory bridge.'],
          characterKnowledge: [],
        },
      },
    })

    expect(supplement).toContain('[External Memory Context]')
    expect(supplement).toContain('Stable user profile:')
    expect(supplement).toContain('Known preferences and boundaries:')
    expect(supplement).toContain('Open follow-ups:')
    expect(supplement).toContain('Recent continuity:')
    expect(supplement).toContain('higher-confidence memory')
  })
})

describe('external memory heuristics', () => {
  it('extracts only stable explicit user-profile, preference, and follow-up cues', () => {
    expect(extractUserProfilePatchesFromText('我是北京大学的学生。')).toEqual(['我是北京大学的学生。'])
    expect(extractUserProfilePatchesFromText('我今天有点累。')).toEqual([])

    expect(extractPreferencePatchesFromText('我喜欢温柔一点的回复。')).toEqual(['我喜欢温柔一点的回复。'])
    expect(extractPreferencePatchesFromText('今天先简短一点。')).toEqual([])

    expect(extractFollowUpItemsFromText('明天提醒我交作业。')).toEqual(['明天提醒我交作业。'])
    expect(extractFollowUpItemsFromText('我明天可能做作业。')).toEqual([])
  })

  it('builds a compact recent-summary block from the latest user and assistant turns', () => {
    const summary = composeRecentSummaryFromMessages([
      { id: 'system', role: 'system', content: 'system', createdAt: 1 },
      { id: 'user-1', role: 'user', content: '今天我想继续收尾第四阶段。', createdAt: 2 },
      { id: 'assistant-1', role: 'assistant', content: '我们先把外部记忆闭环接起来。', slices: [], tool_results: [], createdAt: 3 },
      { id: 'assistant-2', role: 'assistant', content: '我们先把外部记忆闭环接起来。', slices: [], tool_results: [], createdAt: 4 },
    ])

    expect(summary).toContain('## ')
    expect(summary).toContain('User: 今天我想继续收尾第四阶段。')
    expect(summary).toContain('AIRI: 我们先把外部记忆闭环接起来。')
    expect(summary.match(/AIRI: 我们先把外部记忆闭环接起来。/g)?.length).toBe(1)
  })
})
