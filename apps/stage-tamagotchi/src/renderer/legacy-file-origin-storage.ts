import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { isElectronWindow } from '@proj-airi/stage-shared'

import { electronAppReadLegacyFileOriginStorage } from '../shared/eventa'

const DEFAULT_ACTIVE_CARD_ID = 'default'
const DEFAULT_PROVIDER_CREDENTIALS = '{}'
const DEFAULT_SPEECH_PROVIDER_ID = 'speech-noop'
const KNOWN_PROVIDER_SHELL_VALUES: Record<string, Partial<Record<string, string>>> = {
  'index-tts-vllm': {
    baseUrl: 'http://localhost:11996/tts/',
    model: 'IndexTTS-1.5',
  },
  'mimo-audio-speech': {
    baseUrl: 'https://api.xiaomimimo.com/v1/',
    model: 'mimo-v2.5-tts',
    voice: 'mimo_default',
    format: 'wav',
  },
  'mimo-audio-transcription': {
    baseUrl: 'https://api.xiaomimimo.com/v1/',
    model: 'mimo-v2-omni',
  },
}

function getLocalStorageValue(key: string) {
  return window.localStorage.getItem(key)
}

function parseAddedProviders(currentAddedProviders: string | null) {
  if (!currentAddedProviders || currentAddedProviders === DEFAULT_PROVIDER_CREDENTIALS) {
    return new Set<string>()
  }

  try {
    return new Set(
      Object.entries(JSON.parse(currentAddedProviders) as Record<string, unknown>)
        .filter(([, enabled]) => enabled === true)
        .map(([providerId]) => providerId),
    )
  }
  catch {
    return new Set<string>()
  }
}

function isKnownProviderShellValue(providerId: string, field: string, value: string) {
  return KNOWN_PROVIDER_SHELL_VALUES[providerId]?.[field] === value
}

function looksLikeFreshProviderCredentialState(currentProviders: string | null, currentAddedProviders = getLocalStorageValue('settings/providers/added')) {
  if (!currentProviders || currentProviders === DEFAULT_PROVIDER_CREDENTIALS) {
    return true
  }

  try {
    const parsedProviders = JSON.parse(currentProviders) as Record<string, unknown>
    const addedProviders = parseAddedProviders(currentAddedProviders)

    for (const [providerId, providerConfig] of Object.entries(parsedProviders)) {
      if (!providerConfig || typeof providerConfig !== 'object') {
        continue
      }

      for (const [field, value] of Object.entries(providerConfig)) {
        if (typeof value !== 'string') {
          continue
        }

        if (!value.trim()) {
          continue
        }

        if (field === 'apiKey' || field === 'accessKeyId' || field === 'accessKeySecret' || field === 'appKey') {
          return false
        }

        if ((field === 'voice' || field === 'model') && !isKnownProviderShellValue(providerId, field, value)) {
          return false
        }

        if (field === 'baseUrl' && addedProviders.has(providerId) && !isKnownProviderShellValue(providerId, field, value)) {
          return false
        }
      }
    }
  }
  catch {
    return false
  }

  return true
}

function shouldReplaceWithLegacyValue(params: {
  key: string
  currentAddedProviders: string | null
  currentProviderCredentials: string | null
  currentValue: string | null
}) {
  const {
    key,
    currentAddedProviders,
    currentProviderCredentials,
    currentValue,
  } = params

  if (currentValue === null) {
    return true
  }

  if (key === 'airi-cards') {
    return currentValue.includes('"name":"ReLU"')
  }

  if (key === 'airi-card-active-id') {
    return currentValue === DEFAULT_ACTIVE_CARD_ID
  }

  if (key === 'settings/credentials/providers') {
    return looksLikeFreshProviderCredentialState(currentValue, currentAddedProviders)
  }

  if (key === 'settings/providers/added') {
    return currentValue === DEFAULT_PROVIDER_CREDENTIALS
      || currentValue === '{}'
      || looksLikeFreshProviderCredentialState(currentProviderCredentials, currentValue)
  }

  if (key === 'settings/consciousness/active-provider' || key === 'settings/consciousness/active-model' || key === 'settings/speech/active-model' || key === 'settings/speech/voice') {
    return currentValue === ''
      || looksLikeFreshProviderCredentialState(currentProviderCredentials, currentAddedProviders)
  }

  if (key === 'settings/speech/active-provider') {
    return currentValue === DEFAULT_SPEECH_PROVIDER_ID
      || looksLikeFreshProviderCredentialState(currentProviderCredentials, currentAddedProviders)
  }

  return false
}

/**
 * Restores renderer localStorage from the legacy file:// origin when source dev
 * runs on http://localhost:5173 and the current origin still looks empty.
 */
export async function restoreLegacyFileOriginStorageIfNeeded(): Promise<boolean> {
  if (typeof window === 'undefined' || !isElectronWindow(window)) {
    return false
  }

  if (!window.location.origin.includes('localhost:5173')) {
    return false
  }

  const { context } = createContext(window.electron.ipcRenderer)
  const readLegacyFileOriginStorage = defineInvoke(context, electronAppReadLegacyFileOriginStorage)
  const { values } = await readLegacyFileOriginStorage({ keys: [] })
  const currentProviderCredentials = getLocalStorageValue('settings/credentials/providers')
  const currentAddedProviders = getLocalStorageValue('settings/providers/added')
  let restoredAnyValues = false

  for (const [key, legacyValue] of Object.entries(values)) {
    if (legacyValue == null) {
      continue
    }

    if (!shouldReplaceWithLegacyValue({
      key,
      currentAddedProviders,
      currentProviderCredentials,
      currentValue: window.localStorage.getItem(key),
    })) {
      continue
    }

    window.localStorage.setItem(key, legacyValue)
    restoredAnyValues = true
  }

  return restoredAnyValues
}
