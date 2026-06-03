import { beforeEach, describe, expect, it, vi } from 'vitest'

const readLegacyFileOriginStorageMock = vi.fn()

vi.mock('@proj-airi/stage-shared', () => ({
  isElectronWindow: () => true,
}))

vi.mock('@moeru/eventa', () => ({
  defineInvoke: () => readLegacyFileOriginStorageMock,
}))

vi.mock('@moeru/eventa/adapters/electron/renderer', () => ({
  createContext: () => ({
    context: {},
  }),
}))

vi.mock('../shared/eventa', () => ({
  electronAppReadLegacyFileOriginStorage: Symbol('electronAppReadLegacyFileOriginStorage'),
}))

function createLocalStorageMock() {
  let store: Record<string, string> = {}

  return {
    clear() {
      store = {}
    },
    getItem(key: string) {
      return store[key] ?? null
    },
    setItem(key: string, value: string) {
      store[key] = value
    },
    removeItem(key: string) {
      delete store[key]
    },
  }
}

describe('restoreLegacyFileOriginStorageIfNeeded', () => {
  const localStorageMock = createLocalStorageMock()
  const windowMock = {
    electron: {
      ipcRenderer: {},
    },
    localStorage: localStorageMock,
    location: {
      origin: 'http://localhost:5173',
    },
  }

  beforeEach(() => {
    vi.resetModules()
    readLegacyFileOriginStorageMock.mockReset()
    localStorageMock.clear()

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: windowMock,
    })
  })

  it('restores legacy AIRI cards and provider credentials when localhost storage is still default', async () => {
    localStorageMock.setItem('airi-cards', '[["default",{"name":"ReLU"}]]')
    localStorageMock.setItem('airi-card-active-id', 'default')
    localStorageMock.setItem('settings/credentials/providers', '{}')
    localStorageMock.setItem('settings/providers/added', '{}')
    localStorageMock.setItem('settings/consciousness/active-provider', '')
    localStorageMock.setItem('settings/consciousness/active-model', '')
    localStorageMock.setItem('settings/speech/active-provider', 'speech-noop')
    localStorageMock.setItem('settings/speech/active-model', '')
    localStorageMock.setItem('settings/speech/voice', '')

    readLegacyFileOriginStorageMock.mockResolvedValue({
      values: {
        'airi-cards': '[["nahida-card",{"name":"Nahida"}]]',
        'airi-card-active-id': 'nahida-card',
        'settings/credentials/providers': '{"openai-compatible":{"apiKey":"sk-test"}}',
        'settings/providers/added': '{"openai-compatible":true}',
        'settings/consciousness/active-provider': 'mimo',
        'settings/consciousness/active-model': 'mimo-v2.5',
        'settings/speech/active-provider': 'openai-compatible-audio-speech',
        'settings/speech/active-model': 'auto',
        'settings/speech/voice': 'NAHIDA',
      },
    })

    const { restoreLegacyFileOriginStorageIfNeeded } = await import('./legacy-file-origin-storage')
    await restoreLegacyFileOriginStorageIfNeeded()

    expect(localStorageMock.getItem('airi-cards')).toBe('[["nahida-card",{"name":"Nahida"}]]')
    expect(localStorageMock.getItem('airi-card-active-id')).toBe('nahida-card')
    expect(localStorageMock.getItem('settings/credentials/providers')).toBe('{"openai-compatible":{"apiKey":"sk-test"}}')
    expect(localStorageMock.getItem('settings/providers/added')).toBe('{"openai-compatible":true}')
    expect(localStorageMock.getItem('settings/consciousness/active-provider')).toBe('mimo')
    expect(localStorageMock.getItem('settings/consciousness/active-model')).toBe('mimo-v2.5')
    expect(localStorageMock.getItem('settings/speech/active-provider')).toBe('openai-compatible-audio-speech')
    expect(localStorageMock.getItem('settings/speech/active-model')).toBe('auto')
    expect(localStorageMock.getItem('settings/speech/voice')).toBe('NAHIDA')
  })

  it('does not overwrite meaningful localhost values after the source profile is already in use', async () => {
    localStorageMock.setItem('airi-cards', '[["nahida-card",{"name":"Nahida"}]]')
    localStorageMock.setItem('airi-card-active-id', 'nahida-card')
    localStorageMock.setItem('settings/credentials/providers', '{"deepseek":{"apiKey":"localhost-key"}}')

    readLegacyFileOriginStorageMock.mockResolvedValue({
      values: {
        'airi-cards': '[["legacy-card",{"name":"Legacy Nahida"}]]',
        'airi-card-active-id': 'legacy-card',
        'settings/credentials/providers': '{"deepseek":{"apiKey":"legacy-key"}}',
      },
    })

    const { restoreLegacyFileOriginStorageIfNeeded } = await import('./legacy-file-origin-storage')
    await restoreLegacyFileOriginStorageIfNeeded()

    expect(localStorageMock.getItem('airi-cards')).toBe('[["nahida-card",{"name":"Nahida"}]]')
    expect(localStorageMock.getItem('airi-card-active-id')).toBe('nahida-card')
    expect(localStorageMock.getItem('settings/credentials/providers')).toBe('{"deepseek":{"apiKey":"localhost-key"}}')
  })

  it('restores legacy config when localhost only has seeded default provider shells', async () => {
    localStorageMock.setItem('airi-cards', '[["default",{"name":"ReLU"}]]')
    localStorageMock.setItem('airi-card-active-id', 'default')
    localStorageMock.setItem('settings/consciousness/active-provider', 'mimo')
    localStorageMock.setItem('settings/consciousness/active-model', 'mimo-v2.5')
    localStorageMock.setItem('settings/speech/active-provider', 'speech-noop')
    localStorageMock.setItem('settings/speech/active-model', '')
    localStorageMock.setItem('settings/speech/voice', '')
    localStorageMock.setItem('settings/providers/added', '{"browser-web-speech-api":true}')
    localStorageMock.setItem('settings/credentials/providers', JSON.stringify({
      'speech-noop': { baseUrl: '' },
      'openai-compatible-audio-speech': { baseUrl: '' },
      'deepseek': { baseUrl: 'https://api.deepseek.com/' },
      'index-tts-vllm': { baseUrl: 'http://localhost:11996/tts/', model: 'IndexTTS-1.5' },
      'mimo-audio-speech': { baseUrl: 'https://api.xiaomimimo.com/v1/', model: 'mimo-v2.5-tts', voice: 'mimo_default', format: 'wav' },
      'mimo-audio-transcription': { baseUrl: 'https://api.xiaomimimo.com/v1/', model: 'mimo-v2-omni' },
    }))

    readLegacyFileOriginStorageMock.mockResolvedValue({
      values: {
        'airi-cards': '[["nahida-card",{"name":"Nahida"}]]',
        'airi-card-active-id': 'nahida-card',
        'settings/credentials/providers': '{"deepseek":{"apiKey":"legacy-key"}}',
        'settings/providers/added': '{"deepseek":true}',
        'settings/consciousness/active-provider': 'deepseek',
        'settings/consciousness/active-model': 'deepseek-chat',
        'settings/speech/active-provider': 'openai-compatible-audio-speech',
        'settings/speech/active-model': 'auto',
        'settings/speech/voice': 'NAHIDA',
      },
    })

    const { restoreLegacyFileOriginStorageIfNeeded } = await import('./legacy-file-origin-storage')
    await restoreLegacyFileOriginStorageIfNeeded()

    expect(localStorageMock.getItem('airi-cards')).toBe('[["nahida-card",{"name":"Nahida"}]]')
    expect(localStorageMock.getItem('airi-card-active-id')).toBe('nahida-card')
    expect(localStorageMock.getItem('settings/credentials/providers')).toBe('{"deepseek":{"apiKey":"legacy-key"}}')
    expect(localStorageMock.getItem('settings/providers/added')).toBe('{"deepseek":true}')
    expect(localStorageMock.getItem('settings/consciousness/active-provider')).toBe('deepseek')
    expect(localStorageMock.getItem('settings/consciousness/active-model')).toBe('deepseek-chat')
    expect(localStorageMock.getItem('settings/speech/active-provider')).toBe('openai-compatible-audio-speech')
    expect(localStorageMock.getItem('settings/speech/active-model')).toBe('auto')
    expect(localStorageMock.getItem('settings/speech/voice')).toBe('NAHIDA')
  })
})
