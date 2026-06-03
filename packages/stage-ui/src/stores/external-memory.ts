import type {
  ExternalMemoryContextSnapshot,
  ExternalMemoryUsageSnapshot,
} from './external-memory-shared'

function quoteBullets(lines: string[]) {
  return lines.map(line => `- ${line}`).join('\n')
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
}) {
  const context = params.context
  const usage = params.usage

  if (!context || context.usedKinds.length === 0) {
    if (!usage || usage.bridgeState === 'unavailable')
      return ''

    return [
      '[External Memory Guardrail]',
      'Trusted external memory is not available for this turn.',
      'Do not claim to remember prior facts unless they are present in the live conversation context.',
    ].join('\n')
  }

  const sections: string[] = [
    '[External Memory Context]',
    'Use the following memory only when it is directly relevant to the current reply.',
    'If a detail is absent here and absent from the live conversation, do not pretend to remember it.',
    'Treat stable profile, preferences, and follow-ups as higher-confidence memory than recent continuity snippets.',
    'Use recent continuity only as a short-lived recap, never as proof of a stable user trait or preference.',
  ]

  if (context.sections.userProfile.length > 0) {
    sections.push('', 'Stable user profile:', quoteBullets(context.sections.userProfile))
  }

  if (context.sections.preferences.length > 0) {
    sections.push('', 'Known preferences and boundaries:', quoteBullets(context.sections.preferences))
  }

  if (context.sections.followUps.length > 0) {
    sections.push('', 'Open follow-ups:', quoteBullets(context.sections.followUps))
  }

  if (context.sections.recentSummary.length > 0) {
    sections.push('', 'Recent continuity:', quoteBullets(context.sections.recentSummary))
  }

  if (context.sections.characterKnowledge.length > 0) {
    sections.push('', 'Relevant character knowledge:', quoteBullets(context.sections.characterKnowledge))
  }

  return sections.join('\n')
}
