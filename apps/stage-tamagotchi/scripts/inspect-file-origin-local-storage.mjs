import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { app, BrowserWindow } from 'electron'

const userDataPath = process.argv[2]

if (!userDataPath) {
  console.error('Usage: electron inspect-file-origin-local-storage.mjs <userDataPath>')
  process.exit(1)
}

app.setPath('userData', userDataPath)
app.setPath('sessionData', userDataPath)

const inspectorHtmlPath = resolve(userDataPath, '.codex', 'legacy-file-origin-storage-inspector.html')
console.log(`[inspect] userDataPath=${userDataPath}`)
console.log(`[inspect] inspectorHtmlPath=${inspectorHtmlPath}`)

const keysToInspect = [
  'airi-cards',
  'airi-card-active-id',
  'settings/credentials/providers',
  'settings/providers/added',
  'settings/consciousness/active-provider',
  'settings/consciousness/active-model',
  'settings/speech/active-provider',
  'settings/speech/voice',
  'settings/language',
]

app.whenReady().then(async () => {
  console.log('[inspect] app ready')
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: false,
    },
  })

  try {
    await mkdir(dirname(inspectorHtmlPath), { recursive: true })
    await writeFile(
      inspectorHtmlPath,
      '<!doctype html><html><head><meta charset="utf-8"><title>AIRI Legacy Storage Inspector</title></head><body></body></html>',
      'utf8',
    )

    console.log('[inspect] loading file origin window')
    await window.loadURL(`file://${inspectorHtmlPath.replace(/\\/g, '/')}`)
    console.log('[inspect] file origin window loaded')

    const result = await window.webContents.executeJavaScript(`
      (() => {
        const keys = ${JSON.stringify(keysToInspect)};
        const output = {
          totalKeys: window.localStorage.length,
          entries: {},
        };

        for (const key of keys) {
          const value = window.localStorage.getItem(key);
          output.entries[key] = value;
        }

        output.allKeys = [];
        for (let index = 0; index < window.localStorage.length; index += 1) {
          const key = window.localStorage.key(index);
          if (key) {
            output.allKeys.push(key);
          }
        }

        return output;
      })()
    `, true)

    console.log('[inspect] localStorage snapshot collected')
    console.log(JSON.stringify(result, null, 2))
  }
  catch (error) {
    console.error(error)
    process.exitCode = 1
  }
  finally {
    console.log('[inspect] shutting down')
    if (!window.isDestroyed()) {
      window.destroy()
    }
    app.quit()
  }
})
