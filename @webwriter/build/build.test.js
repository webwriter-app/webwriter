import {test} from 'node:test'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const run = promisify(execFile)

test('shared dependency rewriting preserves import-shaped strings and parses real TypeScript declarations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'webwriter-build-test-'))
  try {
    await mkdir(join(directory, 'node_modules/tiny'), {recursive: true})
    await mkdir(join(directory, 'src'))
    await writeFile(join(directory, 'package.json'), JSON.stringify({name: 'build-fixture', type: 'module',
      dependencies: {tiny: '1.0.0'}, prebuiltDependencies: [],
      exports: {'./widgets/demo.*': {source: './src/demo.ts', default: './dist/demo.*'}}}))
    await writeFile(join(directory, 'node_modules/tiny/package.json'), JSON.stringify({name: 'tiny', version: '1.0.0',
      type: 'module', sideEffects: false, main: 'index.js'}))
    await writeFile(join(directory, 'node_modules/tiny/index.js'), [
      '// export {fake} from "./missing.js";',
      'export {foo} from "./foo.js";',
    ].join('\n'))
    await writeFile(join(directory, 'node_modules/tiny/foo.js'), 'export const foo = 42;')
    const samples = ['import {foo} from "tiny";', 'export {foo} from "tiny";', 'import {missing} from "tiny";']
    await writeFile(join(directory, 'src/demo.ts'), [
      '// import {missing} from "tiny";',
      'import { /* preserve valid syntax */ foo as answer, type Unused } from "tiny";',
      'export {foo as exported} from "tiny";',
      `export const samples: string[] = ${JSON.stringify(samples)};`,
      'export const template = `import {foo} from "tiny";`;',
      'export const value = answer;',
    ].join('\n'))
    await run(process.execPath, [fileURLToPath(new URL('./build.js', import.meta.url))], {cwd: directory})
    const output = await readFile(join(directory, 'dist/demo.js'), 'utf8')
    assert.match(output, /from "tiny\/foo.js"/)
    const module = await import(pathToFileURL(join(directory, 'dist/demo.js')).href)
    assert.deepEqual(module.samples, samples)
    assert.equal(module.template, samples[0])
    assert.equal(module.value, 42)
    assert.equal(module.exported, 42)
  }
  finally {await rm(directory, {recursive: true, force: true})}
})
