import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type {
  NahidaPersonaSettings,
  NahidaPersonaSnapshot,
  NahidaPersonaTargetContext,
} from '@proj-airi/stage-ui/stores/nahida-persona-shared'

import { defineInvokeHandler } from '@moeru/eventa'
import { composeNahidaPersonaSnapshot } from '@proj-airi/stage-ui/stores/nahida-persona'

import {
  electronNahidaPersonaGetConfig,
  electronNahidaPersonaSaveConfig,
} from '../../../../shared/eventa'
import {
  createDefaultNahidaPersonaConfigFile,
  nahidaPersonaConfigFileSchema,
  parseNahidaPersonaConfigFile,
} from '../../../../shared/nahida-persona'
import { createConfig } from '../../../libs/electron/persistence'

type MainContext = ReturnType<typeof createContext>['context']

/**
 * Desktop-only persisted Nahida persona settings.
 *
 * Use when:
 * - Renderer windows need one shared Nahida mode toggle that survives restarts
 * - AIRI should keep persona tuning outside localStorage and outside card data
 *
 * Expects:
 * - The manager is created once in Electron main and reused by every window
 *
 * Returns:
 * - A stable get/save API for Nahida persona settings
 */
export interface NahidaPersonaManager {
  getConfig: () => NahidaPersonaSettings
  getSnapshot: () => NahidaPersonaSnapshot
  getTargetContext: () => NahidaPersonaTargetContext
  saveConfig: (settings: NahidaPersonaSettings) => NahidaPersonaSettings
  updateTargetContext: (context?: NahidaPersonaTargetContext) => NahidaPersonaTargetContext
}

export function createNahidaPersonaManager(): NahidaPersonaManager {
  const defaultConfig = createDefaultNahidaPersonaConfigFile()
  const configStore = createConfig('nahida-persona', 'v1.json', nahidaPersonaConfigFileSchema, {
    default: defaultConfig,
    autoHeal: true,
  })

  configStore.setup()
  let targetContext: NahidaPersonaTargetContext = {}

  function getConfigFile() {
    return parseNahidaPersonaConfigFile(configStore.get() ?? defaultConfig)
  }

  function getConfig() {
    return getConfigFile().settings
  }

  function saveConfig(settings: NahidaPersonaSettings) {
    const next = parseNahidaPersonaConfigFile({
      version: defaultConfig.version,
      settings,
    })

    configStore.update(next)
    return next.settings
  }

  function getTargetContext() {
    return {
      ...targetContext,
    }
  }

  function updateTargetContext(context?: NahidaPersonaTargetContext) {
    targetContext = {
      activeCardName: context?.activeCardName?.trim(),
      activeDisplayModelName: context?.activeDisplayModelName?.trim(),
    }

    return getTargetContext()
  }

  function getSnapshot() {
    return composeNahidaPersonaSnapshot({
      settings: getConfig(),
      context: targetContext,
    })
  }

  return {
    getConfig,
    getSnapshot,
    getTargetContext,
    saveConfig,
    updateTargetContext,
  }
}

export function createNahidaPersonaService(params: {
  context: MainContext
  manager: NahidaPersonaManager
}) {
  defineInvokeHandler(params.context, electronNahidaPersonaGetConfig, async () => {
    return params.manager.getConfig()
  })

  defineInvokeHandler(params.context, electronNahidaPersonaSaveConfig, async (settings) => {
    return params.manager.saveConfig(settings)
  })
}
