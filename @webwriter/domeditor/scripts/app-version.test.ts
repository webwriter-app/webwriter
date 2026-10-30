import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { build, createServer } from 'vite'
import { appVersionPlugin } from './app-version.mjs'

const tempDirs: string[] = []

async function makeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'webwriter-app-version-'))
  tempDirs.push(root)
  await mkdir(path.join(root, 'src'))
  await writeFile(
    path.join(root, 'src/main.js'),
    "import version from 'virtual:app-version'; console.log(version);",
  )
  return root
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('appVersionPlugin', () => {
  it('keeps the bundled version and emitted marker in sync across builds', async () => {
    const root = await makeFixture()

    async function buildVersion() {
      const outDir = path.join(root, 'dist')
      await build({
        configFile: false,
        root,
        plugins: [appVersionPlugin()],
        logLevel: 'silent',
        build: {
          emptyOutDir: true,
          outDir,
          rollupOptions: { input: path.join(root, 'src/main.js') },
        },
      })
      const marker = JSON.parse(await readFile(path.join(outDir, 'version.json'), 'utf8'))
      const assetsDir = path.join(outDir, 'assets')
      const bundleFile = (await readdir(assetsDir)).find((file) => file.endsWith('.js'))
      expect(bundleFile).toBeDefined()
      const bundle = await readFile(path.join(assetsDir, bundleFile!), 'utf8')
      expect(bundle).toContain(marker.version)
      expect(marker.version).toMatch(/^[0-9a-f-]{36}$/)
      return marker.version as string
    }

    const firstVersion = await buildVersion()
    const secondVersion = await buildVersion()
    expect(secondVersion).not.toBe(firstVersion)
  })

  it('keeps watch rebuild bundles in sync with each emitted marker', async () => {
    const root = await makeFixture()
    const outDir = path.join(root, 'dist')
    const watcher = await build({
      configFile: false,
      root,
      plugins: [appVersionPlugin()],
      logLevel: 'silent',
      build: {
        emptyOutDir: true,
        outDir,
        rollupOptions: { input: path.join(root, 'src/main.js') },
        watch: { clearScreen: false },
      },
    })

    if (Array.isArray(watcher) || !('on' in watcher)) throw new Error('Expected a build watcher')
    try {
      async function nextBuild() {
        return new Promise<void>((resolve, reject) => {
          const onEvent = (event: { code?: string; error?: Error }) => {
            if (event.code === 'ERROR') {
              watcher.off('event', onEvent)
              reject(event.error)
            } else if (event.code === 'BUNDLE_END') {
              watcher.off('event', onEvent)
              resolve()
            }
          }
          watcher.on('event', onEvent)
        })
      }

      const firstBuild = nextBuild()
      await firstBuild
      const firstMarker = JSON.parse(await readFile(path.join(outDir, 'version.json'), 'utf8'))

      const entry = path.join(root, 'src/main.js')
      const secondBuild = nextBuild()
      await writeFile(entry, "import version from 'virtual:app-version'; console.log(version, 'updated');")
      await secondBuild

      const secondMarker = JSON.parse(await readFile(path.join(outDir, 'version.json'), 'utf8'))
      const assetsDir = path.join(outDir, 'assets')
      const bundleFile = (await readdir(assetsDir)).find((file) => file.endsWith('.js'))
      expect(bundleFile).toBeDefined()
      const bundle = await readFile(path.join(assetsDir, bundleFile!), 'utf8')
      expect(secondMarker.version).not.toBe(firstMarker.version)
      expect(bundle).toContain(secondMarker.version)
      expect(bundle).not.toContain(firstMarker.version)
    } finally {
      await watcher.close()
    }
  })

  it('exports an empty version in development and emits no version marker', async () => {
    const root = await makeFixture()
    const server = await createServer({
      configFile: false,
      root,
      plugins: [appVersionPlugin()],
      server: { middlewareMode: true },
    })

    try {
      const module = await server.ssrLoadModule('virtual:app-version')
      expect(module.default).toBe('')
      await expect(readFile(path.join(root, 'version.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await server.close()
    }
  })
})
