import { describe, expect, it } from 'vitest'

import {
  createDefaultExternalIntegrationConfigFile,
  parseExternalIntegrationConfigText,
} from './external-integrations'

describe('external integration config', () => {
  it('creates defaults that keep memory enabled and sidecar opt-in', () => {
    const config = createDefaultExternalIntegrationConfigFile()

    expect(config.version).toBe(1)
    expect(config.integrations.memory.enabled).toBe(true)
    expect(config.integrations.memory.rootPath).toBe('D:\\AIRI-Memory')
    expect(config.integrations['companion-sidecar'].enabled).toBe(false)
    expect(config.integrations['companion-sidecar'].moduleName).toBe('Proactive Companion')
    expect(config.integrations['companion-sidecar'].pluginId).toBe('local.proactive-companion')
  })

  it('rejects invalid persisted config values', () => {
    expect(() => parseExternalIntegrationConfigText(JSON.stringify({
      version: 1,
      integrations: {
        'memory': {
          kind: 'memory',
          enabled: true,
          rootPath: '',
          filesystemServerName: 'filesystem',
        },
        'companion-sidecar': {
          kind: 'companion-sidecar',
          enabled: true,
          moduleName: '',
          pluginId: 'local.proactive-companion',
          expectedWsUrl: 'ws://127.0.0.1:6121/ws',
        },
      },
    }))).toThrow('integrations.memory.rootPath')
  })
})
