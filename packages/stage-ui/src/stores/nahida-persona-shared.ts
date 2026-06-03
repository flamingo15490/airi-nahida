export const NAHIDA_PERSONA_MODES = ['reserved', 'balanced', 'active'] as const

export type NahidaPersonaMode = typeof NAHIDA_PERSONA_MODES[number]
export const NAHIDA_PERSONA_SECTION_IDS = [
  'fact-anchors',
  'expression-style',
  'memory-boundaries',
  'taboos',
] as const

export type NahidaPersonaSectionId = typeof NAHIDA_PERSONA_SECTION_IDS[number]

/**
 * User-controlled Nahida persona settings layered on top of the active card.
 */
export interface NahidaPersonaSettings {
  enabled: boolean
  mode: NahidaPersonaMode
}

/**
 * One read-only preview block shown in desktop settings and derived from the
 * shared Nahida supplement source of truth.
 */
export interface NahidaPersonaSectionPreview {
  id: NahidaPersonaSectionId
  title: string
  summary: string
  items: string[]
}

/**
 * Runtime snapshot exposed to desktop settings and prompt composition.
 */
export interface NahidaPersonaSnapshot extends NahidaPersonaSettings {
  activeCardName?: string
  matchesActiveCard: boolean
  isActive: boolean
  summary: string
  activeModeSummary: string
  sections: NahidaPersonaSectionPreview[]
}

export interface NahidaPersonaModeBehavior {
  summary: string
  continuity: string[]
  initiative: string[]
}

/**
 * Curated Nahida-specific persona material used by the supplement composer.
 *
 * This asset is intentionally source-controlled instead of reading raw local
 * TXT files at runtime, so behavior stays deterministic across environments.
 */
export interface NahidaPersonaAsset {
  factAnchors: string[]
  expressionStyle: {
    tone: string[]
    motifs: string[]
    sentencePatterns: string[]
    proactiveTone: string[]
    antiPatterns: string[]
  }
  memoryBoundaries: Record<NahidaPersonaMode, NahidaPersonaModeBehavior>
  taboos: string[]
}

export function createDefaultNahidaPersonaSettings(): NahidaPersonaSettings {
  return {
    enabled: false,
    mode: 'balanced',
  }
}
