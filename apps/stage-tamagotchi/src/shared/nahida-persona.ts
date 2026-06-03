import type { NahidaPersonaSettings } from '@proj-airi/stage-ui/stores/nahida-persona-shared'

import {
  createDefaultNahidaPersonaSettings,
  NAHIDA_PERSONA_MODES,
} from '@proj-airi/stage-ui/stores/nahida-persona-shared'
import { safeDestr } from 'destr'
import {
  boolean,
  literal,
  object,
  picklist,
  safeParse,
} from 'valibot'

export type { NahidaPersonaSettings } from '@proj-airi/stage-ui/stores/nahida-persona-shared'

export const NAHIDA_PERSONA_CONFIG_VERSION = 1

export interface NahidaPersonaConfigFile {
  version: typeof NAHIDA_PERSONA_CONFIG_VERSION
  settings: NahidaPersonaSettings
}

const nahidaPersonaSettingsSchema = object({
  enabled: boolean(),
  mode: picklist(NAHIDA_PERSONA_MODES),
})

export const nahidaPersonaConfigFileSchema = object({
  version: literal(NAHIDA_PERSONA_CONFIG_VERSION),
  settings: nahidaPersonaSettingsSchema,
})

function formatNahidaPersonaIssues(issues: ReadonlyArray<{ message?: string, path?: ReadonlyArray<{ key?: unknown }> }>) {
  return issues
    .map((issue) => {
      const path = issue.path
        ?.map(segment => segment.key)
        .filter((segment): segment is PropertyKey => ['string', 'number', 'symbol'].includes(typeof segment))
        .join('.')

      return `${path || '<root>'}: ${issue.message ?? 'Invalid value'}`
    })
    .join('; ')
}

export function parseNahidaPersonaConfigFile(value: unknown): NahidaPersonaConfigFile {
  const parsed = safeParse(nahidaPersonaConfigFileSchema, value)
  if (!parsed.success) {
    throw new Error(formatNahidaPersonaIssues(parsed.issues))
  }

  return parsed.output
}

export function parseNahidaPersonaConfigText(text: string): NahidaPersonaConfigFile {
  let parsed: unknown

  try {
    parsed = safeDestr(text, { strict: true })
  }
  catch (error) {
    throw new Error(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  return parseNahidaPersonaConfigFile(parsed)
}

export function createDefaultNahidaPersonaConfigFile(
  overrides?: Partial<NahidaPersonaSettings>,
): NahidaPersonaConfigFile {
  return {
    version: NAHIDA_PERSONA_CONFIG_VERSION,
    settings: {
      ...createDefaultNahidaPersonaSettings(),
      ...overrides,
    },
  }
}
