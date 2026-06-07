import type { CompanionCoordinationSnapshot } from './companion-coordination-shared'

function quoteBullets(lines: string[]) {
  return lines.map(line => `- ${line}`).join('\n')
}

/**
 * Builds one compact coordination supplement from the frozen phase-six snapshot
 * without modifying any subsystem-specific prompt contract.
 *
 * Use when:
 * - Chat or spark-notify prompt assembly needs one shared coordination summary
 * - Renderer should surface cross-surface readiness without changing message storage
 *
 * Expects:
 * - `snapshot` already reflects the latest desktop-backed coordination refresh
 *
 * Returns:
 * - An empty string when no surface is active or needs attention
 * - One deterministic supplement block otherwise
 */
export function composeCompanionCoordinationSupplement(snapshot?: CompanionCoordinationSnapshot) {
  if (!snapshot) {
    return ''
  }

  if (snapshot.readyCount === 0 && snapshot.attentionCount === 0) {
    return ''
  }

  const lines = snapshot.surfaces.map((surface) => {
    return `${surface.title}: ${surface.status}. ${surface.overview.reason} Activity: ${surface.overview.activity} Coverage: ${surface.overview.coverage}`
  })

  const explainability: string[] = []

  if (snapshot.screenContext) {
    explainability.push(`Screen context: ${snapshot.screenContext.summary}`)
  }

  if (snapshot.memoryJudgement) {
    explainability.push(`Memory judgement: ${snapshot.memoryJudgement.summary}`)
  }

  const explainabilityBlock = explainability.length > 0
    ? ['', 'Subsystem explainability:', quoteBullets(explainability)].join('\n')
    : ''

  return [
    '[Companion Coordination Supplement]',
    'The following frozen phase-six coordination snapshot summarizes memory, persona, and proactive readiness for this turn.',
    `Overall: ${snapshot.status}. ${snapshot.reason.message}`,
    '',
    quoteBullets(lines),
    explainabilityBlock,
  ].filter(Boolean).join('\n')
}
