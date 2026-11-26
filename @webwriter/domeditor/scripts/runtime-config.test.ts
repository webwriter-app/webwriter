import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { build } from 'vite'
import { defaultRuntimeConfig, runtimeConfigPlugin } from './runtime-config.mjs'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('runtimeConfigPlugin', () => {
  it('loads the runtime settings before the page modules and emits an empty default', async () => {
    const root = await mkdtemp(path.join(await realpath(tmpdir()), 'webwriter-runtime-config-'))
    tempDirs.push(root)
    await writeFile(path.join(root, 'main.js'), 'console.log(globalThis.webwriterRuntimeConfig)')
    await writeFile(path.join(root, 'index.html'),
      '<!doctype html><html><head><script type="module" src="/main.js"></script></head><body></body></html>')
    const outDir = path.join(root, 'dist')
    await build({
      configFile: false,
      root,
      plugins: [runtimeConfigPlugin()],
      logLevel: 'silent',
      build: { emptyOutDir: true, outDir },
    })

    const html = await readFile(path.join(outDir, 'index.html'), 'utf8')
    const classic = html.indexOf('<script src="/runtime-config.js"></script>')
    expect(classic).toBeGreaterThan(-1)
    expect(classic).toBeLessThan(html.indexOf('type="module"'))
    expect(await readFile(path.join(outDir, 'runtime-config.js'), 'utf8')).toBe(defaultRuntimeConfig)
  })
})
