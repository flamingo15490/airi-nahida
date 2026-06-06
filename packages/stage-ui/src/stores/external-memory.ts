import type {
  ExternalMemoryContextSnapshot,
  ExternalMemoryJudgementSnapshot,
  ExternalMemoryTurnSnapshot,
  ExternalMemoryUsageSnapshot,
} from './external-memory-shared'

import {
  hasConflictedMemoryCandidates,
} from './external-memory-shared'

function quoteBullets(lines: string[]) {
  return lines.map(line => `- ${line}`).join('\n')
}

function dedupeMemoryLines(lines: string[]) {
  return Array.from(new Set(lines.map(line => line.trim()).filter(Boolean)))
}

/**
 * Collects trusted turn-level evidence that may be referenced for the current reply.
 *
 * Use when:
 * - Prompt builders need short-lived evidence without upgrading it into stable memory
 * - Persona or chat layers must stay grounded in the latest cited turn snapshot
 *
 * Expects:
 * - `turn` comes from the frozen renderer snapshot contract
 *
 * Returns:
 * - Deduplicated citation excerpts when available
 * - Otherwise selected evidence lines from the latest turn snapshot
 */
export function collectTrustedTurnEvidence(turn?: ExternalMemoryTurnSnapshot) {
  const citationExcerpts = dedupeMemoryLines((turn?.citations ?? []).map(citation => citation.excerpt))
  if (citationExcerpts.length > 0) {
    return citationExcerpts
  }

  return dedupeMemoryLines((turn?.evidence ?? [])
    .filter(evidence => evidence.selected)
    .map(evidence => evidence.text))
}

/**
 * Composes frozen prompt guardrails that keep memory references truthful.
 *
 * Use when:
 * - Chat or persona supplements need to distinguish stable memory from turn evidence
 * - Prompt assembly must avoid upgrading tentative or conflicted candidates into memory claims
 *
 * Expects:
 * - `judgement` and `turn` come from the frozen renderer snapshot contract when available
 *
 * Returns:
 * - Short guardrail lines safe to embed in prompt supplements
 */
export function composeTrustedMemoryGuardrails(params: {
  judgement?: ExternalMemoryJudgementSnapshot
  turn?: ExternalMemoryTurnSnapshot
}) {
  const trustedTurnEvidence = collectTrustedTurnEvidence(params.turn)
  const hasUnconfirmedCandidates = (params.judgement?.statusCounts.tentative ?? 0) > 0
    || hasConflictedMemoryCandidates(params.judgement)

  const lines = [
    'Only stable external memory and trusted turn evidence may be referenced as remembered context.',
  ]

  if (trustedTurnEvidence.length === 0) {
    lines.push('If trusted turn evidence is absent, stay present-focused instead of implying additional remembered detail.')
  }

  if (hasUnconfirmedCandidates) {
    lines.push('Do not describe tentative or conflicted candidates as remembered facts, confirmed preferences, or established long-term memory.')
  }

  if (params.judgement?.summary) {
    lines.push(`Current memory judgement: ${params.judgement.summary}`)
  }

  if (hasUnconfirmedCandidates && params.judgement?.reason) {
    lines.push(`Current memory guardrail: ${params.judgement.reason}`)
  }

  return lines
}

/**
 * Builds one deterministic external-memory supplement from the latest desktop snapshot.
 *
 * Use when:
 * - Desktop runtime already parsed trusted external memory into JSON-safe sections
 * - The chat or character prompt should receive factual continuity without changing message history
 *
 * Expects:
 * - `usage` and `context` come from the desktop-only bridge
 *
 * Returns:
 * - A factual supplement block when memory is available
 * - A short guardrail block when the bridge is unavailable for this turn
 */
export function composeExternalMemorySupplement(params: {
  usage?: ExternalMemoryUsageSnapshot
  context?: ExternalMemoryContextSnapshot
  judgement?: ExternalMemoryJudgementSnapshot
  turn?: ExternalMemoryTurnSnapshot
}) {
  const context = params.context
  const usage = params.usage
  const judgement = params.judgement ?? usage?.judgement
  const turn = params.turn ?? context?.turn ?? usage?.turn
  const trustedTurnEvidence = collectTrustedTurnEvidence(turn)
  const guardrails = composeTrustedMemoryGuardrails({
    judgement,
    turn,
  })
  const hasStableMemory = context
    ? (
        context.sections.userProfile.length > 0
        || context.sections.preferences.length > 0
        || context.sections.followUps.length > 0
        || context.sections.characterKnowledge.length > 0
      )
    : false

  if (!hasStableMemory && trustedTurnEvidence.length === 0) {
    if (!usage || usage.bridgeState === 'unavailable')
      return ''

    return [
      '[External Memory Guardrail]',
      'Trusted external memory is not available for this turn.',
      'Do not claim to remember prior facts unless they are present in the live conversation context.',
      ...guardrails,
    ].join('\n')
  }

  const sections: string[] = [
    '[External Memory Context]',
    'Use the following memory only when it is directly relevant to the current reply.',
    'If a detail is absent here and absent from the live conversation, do not pretend to remember it.',
    ...guardrails,
  ]

  if (context?.sections.userProfile.length) {
    sections.push('', 'Stable user profile:', quoteBullets(context.sections.userProfile))
  }

  if (context?.sections.preferences.length) {
    sections.push('', 'Known preferences and boundaries:', quoteBullets(context.sections.preferences))
  }

  if (context?.sections.followUps.length) {
    sections.push('', 'Open follow-ups:', quoteBullets(context.sections.followUps))
  }

  if (trustedTurnEvidence.length > 0) {
    sections.push('', 'Trusted turn evidence:', quoteBullets(trustedTurnEvidence))
  }

  if (context?.sections.characterKnowledge.length) {
    sections.push('', 'Relevant character knowledge:', quoteBullets(context.sections.characterKnowledge))
  }

  return sections.join('\n')
}
