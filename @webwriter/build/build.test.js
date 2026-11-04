import {test} from 'node:test'
import assert from 'node:assert/strict'
import {execFile, spawn} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdtemp, mkdir, writeFile, readFile, readdir, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {JSDOM} from 'jsdom'
import xliff2js from 'xliff/xliff2js'
import {xliffFromUnits} from './localize.js'

const run = promisify(execFile)
const buildScript = fileURLToPath(new URL('./build.js', import.meta.url))

test('help describes the opt-in without requiring a package or creating files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'webwriter-build-help-'))
  try {
    const {stdout} = await run(process.execPath, [buildScript, '--help'], {cwd: directory})
    assert.match(stdout, /--shared-dependencies/)
    assert.match(stdout, /WebWriter 1 compatibility/)
    assert.deepEqual(await readdir(directory), [])
  }
  finally {await rm(directory, {recursive: true, force: true})}
})

for(const mode of ['build', 'dev']) test(`${mode} bundles independent entries by default`, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'webwriter-build-compatible-'))
  let watcher
  try {
    await mkdir(join(directory, 'node_modules/tiny'), {recursive: true})
    await mkdir(join(directory, 'src'))
    const manifest = JSON.stringify({name: 'build-fixture', type: 'module', dependencies: {tiny: '1.0.0'},
      prebuiltDependencies: [], exports: {
        './widgets/first.*': {source: './src/first.js', default: './dist/widgets/first.*'},
        './widgets/second.*': {source: './src/second.js', default: './dist/widgets/second.*'},
        './tests/example.*': {source: './src/test.js', default: './dist/tests/example.*'},
      }})
    await writeFile(join(directory, 'package.json'), manifest)
    await writeFile(join(directory, 'node_modules/tiny/package.json'), JSON.stringify({name: 'tiny', type: 'module', main: 'index.js'}))
    await writeFile(join(directory, 'node_modules/tiny/index.js'), 'export const value = 42;')
    await writeFile(join(directory, 'src/shared.js'), 'export const extra = 1;')
    const source = 'import {value} from "tiny"; import {extra} from "./shared.js"; export const result = value + extra;'
    for(const entry of ['first', 'second', 'test']) await writeFile(join(directory, 'src', `${entry}.js`), source)
    if(mode === 'build') await run(process.execPath, [buildScript], {cwd: directory})
    else {
      watcher = spawn(process.execPath, [buildScript, 'dev'], {cwd: directory, stdio: ['ignore', 'ignore', 'pipe']})
      let stderr = ''
      watcher.stderr.on('data', data => {stderr += data})
      const done = new Promise((resolve, reject) => {
        watcher.once('error', reject)
        watcher.once('exit', code => reject(new Error(`Watch exited before initial build (${code}): ${stderr}`)))
        watcher.stderr.on('data', () => {if(stderr.includes('watching for changes')) resolve()})
      })
      let timer
      try {await Promise.race([done, new Promise((_, reject) => {timer = setTimeout(() => reject(new Error(`Watch build timed out: ${stderr}`)), 10000)})])}
      finally {clearTimeout(timer)}
    }
    const entries = ['widgets/first.js', 'widgets/second.js', ...(mode === 'dev' ? ['tests/example.js'] : [])]
    assert.equal(await readFile(join(directory, 'package.json'), 'utf8'), manifest)
    assert.deepEqual((await readdir(join(directory, 'dist'))).sort(), mode === 'dev' ? ['tests', 'widgets'] : ['widgets'])
    // The outputs must execute without the package or any generated shared chunks.
    await rm(join(directory, 'node_modules'), {recursive: true, force: true})
    for(const entry of entries) {
      const output = await readFile(join(directory, 'dist', entry), 'utf8')
      assert.doesNotMatch(output, /from ["']tiny/)
      const module = await import(pathToFileURL(join(directory, 'dist', entry)).href)
      assert.equal(module.result, 43)
    }
  }
  finally {
    if(watcher && watcher.exitCode === null) {
      const stopped = new Promise(resolve => watcher.once('exit', resolve))
      watcher.kill()
      await stopped
    }
    await rm(directory, {recursive: true, force: true})
  }
})

test('prebuild threshold requires the shared-dependencies opt-in', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'webwriter-build-threshold-'))
  try {
    await writeFile(join(directory, 'package.json'), JSON.stringify({exports: {}}))
    await assert.rejects(run(process.execPath, [buildScript, '--prebuild-threshold=10'], {cwd: directory}),
      error => error.code === 1 && error.stderr.includes('requires --shared-dependencies'))
  }
  finally {await rm(directory, {recursive: true, force: true})}
})

test('snippet XLIFF preserves multiline IDs, XML text, and existing translations', async () => {
  const fileId = './snippets/example.html'
  const source = 'This text contains\n    a line break & <tag> "quoted"'
  const id = `${source}#1`
  const target = 'Übersetzung & <Zitat>'
  const legacyId = id.replace(/\n/g, ' ')
  const xml = xliffFromUnits({[fileId]: {[id]: source}}, 'de', {[fileId]: {[legacyId]: target}})
  const parsed = new JSDOM(xml, {contentType: 'text/xml'}).window.document
  assert.equal(parsed.querySelector('file').getAttribute('id'), fileId)
  assert.equal(parsed.querySelector('unit').getAttribute('id'), id)
  assert.equal(parsed.querySelector('source').textContent, source)
  assert.equal(parsed.querySelector('target').textContent, target)
  const exchange = await xliff2js(xml)
  assert.equal(exchange.resources[fileId][id].target, target)
})

test('shared dependency rewriting preserves import-shaped strings and parses real TypeScript declarations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'webwriter-build-test-'))
  try {
    await mkdir(join(directory, 'node_modules/tiny'), {recursive: true})
    await mkdir(join(directory, 'src'))
    await writeFile(join(directory, 'package.json'), JSON.stringify({name: 'build-fixture', type: 'module',
      dependencies: {tiny: '1.0.0'}, prebuiltDependencies: [],
      exports: {
        './widgets/demo.*': {source: './src/demo.ts', default: './dist/demo.*'},
        './widgets/other.*': {source: './src/other.ts', default: './dist/other.*'},
      }}))
    await writeFile(join(directory, 'node_modules/tiny/package.json'), JSON.stringify({name: 'tiny', version: '1.0.0',
      type: 'module', sideEffects: false, main: 'index.js'}))
    await writeFile(join(directory, 'node_modules/tiny/index.js'), [
      '// export {fake} from "./missing.js";',
      'export {foo} from "./foo.js";',
    ].join('\n'))
    await writeFile(join(directory, 'node_modules/tiny/foo.js'), 'export const foo = 42;')
    await writeFile(join(directory, 'src/shared.ts'), 'export const shared = 7;')
    await writeFile(join(directory, 'src/other.ts'), 'export {shared} from "./shared.js";')
    const samples = ['import {foo} from "tiny";', 'export {foo} from "tiny";', 'import {missing} from "tiny";']
    await writeFile(join(directory, 'src/demo.ts'), [
      '// import {missing} from "tiny";',
      'import { /* preserve valid syntax */ foo as answer, type Unused } from "tiny";',
      'export {shared} from "./shared.js";',
      'export {foo as exported} from "tiny";',
      `export const samples: string[] = ${JSON.stringify(samples)};`,
      'export const template = `import {foo} from "tiny";`;',
      'export const value = answer;',
    ].join('\n'))
    await run(process.execPath, [fileURLToPath(new URL('./build.js', import.meta.url)), '--shared-dependencies'], {cwd: directory})
    const output = await readFile(join(directory, 'dist/demo.js'), 'utf8')
    assert.match(output, /from "tiny\/foo.js"/)
    assert.match(output, /chunks\/chunk-/)
    assert.ok((await readdir(join(directory, 'dist/chunks'))).some(file => file.endsWith('.js')))
    const module = await import(pathToFileURL(join(directory, 'dist/demo.js')).href)
    assert.deepEqual(module.samples, samples)
    assert.equal(module.template, samples[0])
    assert.equal(module.value, 42)
    assert.equal(module.exported, 42)
  }
  finally {await rm(directory, {recursive: true, force: true})}
})
