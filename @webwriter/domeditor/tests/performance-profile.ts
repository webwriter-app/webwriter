import {SharedDOMDoc, sharedDOMBody} from '../src/domdoc'
import {DomEditor} from '../src/components/dom-editor'
import type {DOMEditor} from '../src/domeditor'
import * as Y from 'yjs'

// Separate unprofiled timings from instrumented diagnostic runs. No timing
// assertions: these are measurements of the current machine, not CI deadlines.
const profiling = new URLSearchParams(location.search).has('profile')
const only = new URLSearchParams(location.search).get('only')
const checks: object[] = []
const channel = new MessageChannel()
const settle = () => new Promise<void>(resolve => {
  channel.port1.onmessage = () => resolve()
  channel.port2.postMessage(null)
})
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const round = (value: number) => +value.toFixed(3)
function assert(value: unknown, message: string): asserts value {
  if(!value) throw new Error(message)
}
const statistics = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return {samples: sorted.length, medianMs: round(sorted[Math.ceil(sorted.length * .5) - 1]),
    p95Ms: round(sorted[Math.ceil(sorted.length * .95) - 1]), maxMs: round(sorted.at(-1)!),
    totalMs: round(values.reduce((a, b) => a + b, 0))}
}
const markup = (size: number) => Array.from({length: size}, (_, i) =>
  i % 10 === 0 ? `<h2>Heading ${i}</h2>` : `<p>Paragraph ${i}: native editable text <em>with emphasis</em>.</p>`).join('')

async function stage(name: string, details: object, run: () => void | Promise<void>, samples = 20, batch = 1, warmups = 3) {
  for(let i = 0; i < warmups; i++) await run()
  await settle()
  await fetch('/__native-progress', {method: 'POST', body: name + ' ' + JSON.stringify(details)})
  if(profiling) {
    const response = await fetch('/__native-profile/start', {method: 'POST', body: JSON.stringify({name, ...details})})
    assert(response.ok, await response.text())
  }
  const values: number[] = []
  const mark = `profile:${name}`
  performance.mark(mark + ':start')
  try {
    const stageStart = performance.now()
    for(let i = 0; i < samples || profiling && performance.now() - stageStart < 350; i++) {
      const start = performance.now()
      for(let j = 0; j < batch; j++) await run()
      values.push((performance.now() - start) / batch)
    }
  }
  finally {
    performance.mark(mark + ':end')
    performance.measure(mark, mark + ':start', mark + ':end')
    if(profiling) {
      const response = await fetch('/__native-profile/stop', {method: 'POST'})
      assert(response.ok, await response.text())
    }
  }
  checks.push({name, ...details, batch, warmups, ...statistics(values)})
}

function fixture(html: string, permalinks = false) {
  const owner = document.implementation.createHTMLDocument('')
  owner.body.innerHTML = html
  const shared = new SharedDOMDoc(undefined, undefined, [], ['◆'], {
    root: owner.body, connect: false, documentPermalinks: permalinks,
  })
  return {owner, shared}
}

function snapshotHost(html: string) {
  // Reuse the same isolated real message handler as tests/performance.ts.
  const host = new DomEditor() as any
  host.editorDocument = new DOMParser().parseFromString(html, 'text/html')
  host.editorOpaque = true
  host.fileHandle = {}
  host.isEditorMessage = () => true
  host.renderRoot = document.createElement('div')
  host.documentTree = host.buildDocumentTree()
  host.stylesVisible = () => false
  host.dirtyTrackingReady = true
  return host
}

async function reconciliation() {
  for(const size of profiling ? [5000] : [100, 1000, 5000, 10000]) {
    const html = markup(size)
    for(const permalinks of [false, true]) {
      const {owner, shared} = fixture(html, permalinks)
      try {
        const text = owner.body.children[Math.floor(size / 2) + 1].firstChild as Text
        await stage('local text', {elements: size, permalinks}, () => { text.appendData('x'); shared.syncFromDOM() }, 20, 10)
        const remote = (sharedDOMBody(shared.doc).get(Math.floor(size / 2) + 1) as Y.XmlElement).get(0) as Y.XmlText
        await stage('remote text', {elements: size, permalinks}, () => shared.doc.transact(() => remote.insert(remote.length, 'y'), 'remote'), 20, 10)
        await stage('local sibling insert/remove', {elements: size, permalinks}, () => {
          const paragraph = owner.createElement('p'); paragraph.textContent = 'Inserted paragraph'
          text.parentElement!.before(paragraph); shared.syncFromDOM()
          paragraph.remove(); shared.syncFromDOM()
        })
        const body = sharedDOMBody(shared.doc)
        await stage('remote sibling insert/remove', {elements: size, permalinks}, () => {
          const paragraph = new Y.XmlElement('p'); paragraph.insert(0, [new Y.XmlText('Remote paragraph')])
          shared.doc.transact(() => body.insert(Math.floor(size / 2), [paragraph]), 'remote')
          shared.doc.transact(() => body.delete(Math.floor(size / 2), 1), 'remote')
        })
        await stage('element boundary selection roundtrip', {elements: size, permalinks}, () => {
          const relative = shared.relativePositionFromDOMPoint(owner.body, size - 1)!
          const point = shared.domPointFromRelativePosition(relative)
          assert(point?.node === owner.body && point.offset === size - 1, 'element selection roundtrip failed')
        }, 20, 10)
        await stage('text selection roundtrip', {elements: size, permalinks}, () => {
          const relative = shared.relativePositionFromDOMPoint(text, 3)!
          assert(shared.domPointFromRelativePosition(relative)?.offset === 3, 'text selection roundtrip failed')
        }, 20, 20)
        assert(owner.body.children.length === size && text.data.includes('xxx') && text.data.includes('yyy'), 'reconciliation lost content')
      }
      finally { shared.destroy() }
    }
    const host = snapshotHost(html)
    for(const treeChanged of [false, true]) {
      let revision = 0
      await stage('host snapshot', {elements: size, treeChanged, htmlBytes: new TextEncoder().encode(html).length}, () => {
        host.handleEditorMessage(new MessageEvent('message', {data: {type: 'editor-frame-snapshot', treeChanged,
          html: `<html><head></head><body>${html.replace('Paragraph 1:', `Paragraph 1 ${revision++}:`)}</body></html>`}}))
      })
    }
  }
  // Joining with an already-populated DOM exercises the boundary-reuse path.
  for(const size of profiling ? [5000] : [100, 1000, 5000]) {
    const html = markup(size), source = fixture(html)
    try {
      const update = Y.encodeStateAsUpdate(source.shared.doc)
      await stage('hydrate existing DOM', {elements: size, bytes: update.length}, () => {
        const owner = document.implementation.createHTMLDocument(''); owner.body.innerHTML = html
        const ydoc = new Y.Doc(); Y.applyUpdate(ydoc, update)
        const shared = new SharedDOMDoc(undefined, undefined, [], ['◆'], {root: owner.body, ydoc, connect: false})
        assert(owner.body.children.length === size && owner.body.children[1].textContent!.startsWith('Paragraph 1:'), 'hydration changed content')
        shared.destroy()
      }, 5)
    }
    finally { source.shared.destroy() }
  }
  for(const count of profiling ? [1000] : [10, 100, 1000]) {
    const {owner, shared} = fixture(Array.from({length: count}, () => '<section><p>Existing</p></section>').join(''))
    try {
      await stage('many changed containers', {containers: count}, () => {
        for(const section of owner.body.children) section.append(owner.createElement('hr'))
        shared.syncFromDOM()
        for(const section of owner.body.children) section.lastChild!.remove()
        shared.syncFromDOM()
      }, 10)
      assert(owner.body.querySelectorAll('hr').length === 0, 'batch cleanup failed')
    }
    finally { shared.destroy() }
  }
}

type EditorWindow = Window & typeof globalThis & {editor?: DOMEditor}
async function liveEditor(size: number, table = false) {
  const html = table ? '<p>Before table</p><table><tbody>' + Array.from({length: size}, (_, i) =>
    '<tr>' + Array.from({length: 6}, (_, j) => `<td>Cell ${i}, ${j}.</td>`).join('') + '</tr>').join('') + '</tbody></table>' : markup(size)
  const details = table ? {tableRows: size, columns: 6} : {elements: size}
  const initial = fixture(html, true), initialState = initial.shared.snapshot()
  initial.shared.destroy()
  const frame = document.createElement('iframe')
  frame.style.cssText = 'width:1200px;height:800px;border:0;max-width:none'
  frame.src = '/tests/performance-profile-frame.html'
  const loaded = new Promise<void>(resolve => { frame.onload = () => resolve() })
  document.body.append(frame); await loaded
  const view = frame.contentWindow as EditorWindow, doc = frame.contentDocument!
  doc.body.innerHTML = html
  const nonce = 'performance-profile-editor-nonce'
  const host = snapshotHost(html)
  let snapshots = 0, snapshotBytes = 0, snapshotMs = 0, messages = 0
  const capture = (event: MessageEvent) => {
    if(event.source !== view || event.data?.bridgeNonce !== nonce) return
    messages++
    if(event.data.type !== 'editor-frame-snapshot') return
    const start = performance.now()
    host.handleEditorMessage(event)
    snapshotMs += performance.now() - start
    snapshots++; snapshotBytes += event.data.html.length
  }
  window.addEventListener('message', capture)
  const initializeStart = performance.now()
  view.postMessage({type: 'initialize-editor', syncUrl: 'ws://127.0.0.1:65534', bridgeNonce: nonce,
    initialState, proofreadingEnabled: false, proofreadingAllowed: false}, location.origin)
  for(let attempt = 0; !view.editor && attempt < 2000; attempt++) await delay(10)
  assert(view.editor, 'live editor failed to initialize')
  const editor = view.editor
  const initializeMs = performance.now() - initializeStart
  editor.doc.disconnectCollaboration()
  await delay(400)
  const longTasks: number[] = []
  const observer = new view.PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => entry.duration)))
  observer.observe({type: 'longtask'})
  const paragraph = table ? doc.querySelector('td')! : doc.body.children[1], text = paragraph.lastChild!
  doc.body.focus()
  doc.getSelection()!.setBaseAndExtent(text, text.textContent!.length, text, text.textContent!.length)
  await delay(100)
  const before = paragraph.textContent!
  const insertTimes: number[] = [], settledTimes: number[] = [], frameTimes: number[] = []
  const initialMessages = messages, initialSnapshots = snapshots, initialBytes = snapshotBytes, initialMs = snapshotMs
  try {
    await stage('live native typing', {...details, viewport: '1200x800', initializeMs: round(initializeMs)}, async () => {
      const start = performance.now()
      assert(doc.execCommand('insertText', false, 'x'), 'native insertText failed')
      insertTimes.push(performance.now() - start)
      await settle(); settledTimes.push(performance.now() - start)
      await new Promise<void>(resolve => view.requestAnimationFrame(() => view.setTimeout(resolve, 0)))
      frameTimes.push(performance.now() - start)
    }, 60)
    await delay(350)
    assert(paragraph.textContent === before + 'x'.repeat(63), 'native typing lost characters')
    const hostParagraph = table ? host.editorDocument.querySelector('td') : host.editorDocument.body.children[1]
    assert(hostParagraph.textContent === paragraph.textContent, 'host snapshot lagged after settling')
    const typingLongTasks = [...longTasks]
    checks.push({name: 'live typing detail', ...details, nativeInsert: statistics(insertTimes.slice(3)),
      observerSettled: statistics(settledTimes.slice(3)), nextFrame: statistics(frameTimes.slice(3)),
      snapshots: snapshots - initialSnapshots, snapshotChars: snapshotBytes - initialBytes,
      snapshotProcessingMs: round(snapshotMs - initialMs), bridgeMessages: messages - initialMessages,
      longTasks: typingLongTasks.length, longestTaskMs: round(Math.max(0, ...typingLongTasks))})
    await stage('live selection changes', details, async () => {
      const offset = doc.getSelection()!.anchorOffset === 2 ? 3 : 2
      doc.getSelection()!.setBaseAndExtent(text, offset, text, offset)
      await settle()
      // Chromium coalesces selectionchange within a task/frame. Let each
      // selection reach the editor before issuing the next one.
      await new Promise<void>(resolve => view.requestAnimationFrame(() => view.setTimeout(resolve, 0)))
    }, 60)
    await stage('live serialization', details, () => {
      const serialized = editor.toHTML(true)
      assert(!serialized.includes('◆'), 'editor markers leaked into export')
    }, 10)
    await stage('live undo/redo', details, async () => {
      editor.doc.undo(); await settle(); editor.doc.redo(); await settle()
    }, 10)
    const restored = table ? doc.querySelector('td') : doc.body.children[1]
    assert(restored?.textContent === before + 'x'.repeat(63), 'undo/redo changed the typed content')
    await delay(400)
    const idleMessages = messages, idleSnapshots = snapshots
    await stage('live idle', details, () => delay(1000), 1, 1, 0)
    checks.push({name: 'live idle detail', ...details, bridgeMessages: messages - idleMessages, snapshots: snapshots - idleSnapshots})
  }
  finally {
    observer.disconnect(); editor.destroy(); frame.remove(); window.removeEventListener('message', capture)
    await settle()
  }
}

try {
  if(!only || only === 'reconciliation') await reconciliation()
  if(!only || only === 'live') for(const size of profiling ? [5000] : [100, 1000, 5000]) await liveEditor(size)
  if(!only || only === 'tables') for(const size of profiling ? [500] : [100, 500]) await liveEditor(size, true)
  await fetch('/__native-result', {method: 'POST', body: JSON.stringify({
    metadata: {userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, profiling,
      viewport: [innerWidth, innerHeight], warmups: 3, timestamp: new Date().toISOString(),
      notes: 'Synthetic authored DOM; live native execCommand insertText, actual frame bridge and isolated real host snapshot handler; no external widgets, proofreading, network latency, or host UI rendering. Next-frame checkpoint uses rAF followed by a timer; not an INP measurement.'}, checks,
  })})
}
catch(error) {
  await fetch('/__native-result', {method: 'POST', body: JSON.stringify({error: String(error), checks})})
}
finally { channel.port1.close(); channel.port2.close() }
