import { join } from 'node:path'

export type UserDataPathSource
  = | 'env'
    | 'source-preview'
    | 'legacy-app'
    | 'default'

export interface UserDataPathResolution {
  candidates: string[]
  path?: string
  source: UserDataPathSource
}

/**
 * Resolves the userData/sessionData directory for the Electron desktop app.
 *
 * In source dev mode we prefer the dedicated preview profile if it already
 * exists, then fall back to the original packaged AIRI profile. This keeps
 * renderer-backed browser storage aligned with the user's live desktop data
 * even when they start the source app without the helper launcher script.
 */
export function resolvePreferredUserDataPath(params: {
  appDataPath: string
  devMode: boolean
  envUserDataPath?: string
  pathExists?: (path: string) => boolean
}): UserDataPathResolution {
  const trimmedEnvUserDataPath = params.envUserDataPath?.trim()
  if (trimmedEnvUserDataPath) {
    return {
      source: 'env',
      path: trimmedEnvUserDataPath,
      candidates: [trimmedEnvUserDataPath],
    }
  }

  if (!params.devMode) {
    return {
      source: 'default',
      candidates: [],
    }
  }

  const pathExists = params.pathExists ?? (() => false)
  const sourcePreviewPath = join(params.appDataPath, '@proj-airi', 'stage-tamagotchi-source-preview')
  const legacyAppPath = join(params.appDataPath, 'ai.moeru.airi')
  const candidates = [sourcePreviewPath, legacyAppPath]

  if (pathExists(sourcePreviewPath)) {
    return {
      source: 'source-preview',
      path: sourcePreviewPath,
      candidates,
    }
  }

  if (pathExists(legacyAppPath)) {
    return {
      source: 'legacy-app',
      path: legacyAppPath,
      candidates,
    }
  }

  return {
    source: 'default',
    candidates,
  }
}
