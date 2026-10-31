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
  const check = {name, ...details, batch, warmups, ...statistics(values)}
  checks.push(check)
  return check
}

function fixture(html: string, permalinks = false, bodyClass = '') {
  const owner = document.implementation.createHTMLDocument('')
  owner.body.innerHTML = html
  owner.body.className = bodyClass
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

type LayoutMode = 'document' | 'canvas' | 'slides' | 'board'

function layoutFixture(mode: LayoutMode, size: number) {
  const paragraph = (i: number) => `<p class="profile-item">Paragraph ${i}: editable text with enough words to occupy a line.</p>`
  const transform = (style: string) => `<p id="profile-transform" style="${style}">Resize this element</p>`
  if(mode === 'document') return {bodyClass: '', html: transform('width:220px;height:100px;background:#dbeafe')
    + Array.from({length: size}, (_, i) => paragraph(i)).join('')}
  if(mode === 'canvas') return {bodyClass: 'ww-canvas', html: transform('position:absolute;left:40px;top:40px;width:220px;height:100px;background:#dbeafe')
    + Array.from({length: size}, (_, i) => `<p class="profile-item" style="position:absolute;left:${40 + i % 12 * 230}px;top:${180 + Math.floor(i / 12) * 60}px;width:210px">Paragraph ${i}: editable text.</p>`).join('')}
  if(mode === 'slides') return {bodyClass: 'ww-slides', html: '<div class="ww-slides-viewport">'
    + Array.from({length: Math.ceil(size / 10)}, (_, slide) => `<section class="ww-slide" id="profile-slide-${slide}" tabindex="-1">`
      + (slide === 0 ? transform('position:absolute;left:40px;top:30px;width:220px;height:80px;background:#dbeafe') : '')
      + Array.from({length: Math.min(10, size - slide * 10)}, (_, item) => `<p class="profile-item" style="position:absolute;left:${40 + item % 5 * 240}px;top:${140 + Math.floor(item / 5) * 80}px;width:220px">Paragraph ${slide * 10 + item}: editable text.</p>`).join('')
      + '</section>').join('') + '</div>'}
  const columns = size <= 240 ? 8 : 12
  return {bodyClass: 'ww-board', html: Array.from({length: columns}, (_, column) => `<section class="ww-board-column"><h2>Column ${column}</h2>`
    + Array.from({length: Math.ceil(size / columns)}, (_, card) => {
      const i = column * Math.ceil(size / columns) + card
      return i >= size ? '' : `<article class="ww-board-card">${i === 0 ? transform('width:220px;height:80px;background:#dbeafe') : ''}${paragraph(i)}</article>`
    }).join('') + '</section>').join('')}
}

async function layoutProfile(mode: LayoutMode, size: number) {
  const {html, bodyClass} = layoutFixture(mode, size)
  const initial = fixture(html, true, bodyClass), initialState = initial.shared.snapshot()
  initial.shared.destroy()
  const frame = document.createElement('iframe')
  frame.style.cssText = 'width:1200px;height:800px;border:0;max-width:none'
  frame.src = '/tests/performance-profile-frame.html'
  const loaded = new Promise<void>(resolve => { frame.onload = () => resolve() })
  document.body.append(frame); await loaded
  const view = frame.contentWindow as EditorWindow, doc = frame.contentDocument!
  doc.body.className = bodyClass; doc.body.innerHTML = html
  const nonce = `layout-profile-${mode}-${size}`
  const host = snapshotHost(`<html><head></head><body class="${bodyClass}">${html}</body></html>`)
  let snapshots = 0, snapshotChars = 0, snapshotMs = 0, messages = 0
  const capture = (event: MessageEvent) => {
    if(event.source !== view || event.data?.bridgeNonce !== nonce) return
    messages++
    if(event.data.type !== 'editor-frame-snapshot') return
    const start = performance.now()
    host.handleEditorMessage(event)
    snapshotMs += performance.now() - start
    snapshots++; snapshotChars += event.data.html.length
  }
  window.addEventListener('message', capture)
  const initialized = performance.now()
  view.postMessage({type: 'initialize-editor', syncUrl: 'ws://127.0.0.1:65534', bridgeNonce: nonce,
    initialState, proofreadingEnabled: false, proofreadingAllowed: false, disableAnimations: true}, location.origin)
  for(let attempt = 0; !view.editor && attempt < 2000; attempt++) await delay(10)
  assert(view.editor, `${mode} editor failed to initialize`)
  const editor = view.editor
  const initializeMs = round(performance.now() - initialized)
  editor.doc.disconnectCollaboration()
  await delay(400)
  const details = {layout: mode, textBlocks: size, viewport: '1200x800', initializeMs}
  const first = doc.querySelector<HTMLElement>('p.profile-item')!, second = doc.querySelectorAll<HTMLElement>('p.profile-item')[1]
  const textA = first.firstChild as Text, textB = second.firstChild as Text
  const transform = doc.getElementById('profile-transform') as HTMLElement
  const nextFrame = () => new Promise<void>(resolve => view.requestAnimationFrame(() => view.setTimeout(resolve, 0)))
  const longTasks: number[] = []
  const observer = new view.PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => entry.duration)))
  observer.observe({type: 'longtask'})
  try {
    doc.body.focus()
    doc.getSelection()!.setBaseAndExtent(textA, textA.data.length, textA, textA.data.length)
    await delay(100)
    const beforeText = first.textContent!, beforeSnapshots = snapshots, beforeSnapshotMs = snapshotMs,
      beforeSnapshotChars = snapshotChars, beforeMessages = messages
    const insertTimes: number[] = [], frameTimes: number[] = []
    const typing = await stage('layout native typing', details, async () => {
      const start = performance.now()
      assert(doc.execCommand('insertText', false, 'x'), `${mode} native insertText failed`)
      insertTimes.push(performance.now() - start)
      await settle(); await nextFrame()
      frameTimes.push(performance.now() - start)
    }, 20)
    await delay(350)
    assert(first.textContent === beforeText + 'x'.repeat(3 + typing.samples), `${mode} typing lost characters`)
    assert(host.editorDocument.querySelector('p.profile-item')?.textContent === first.textContent, `${mode} host snapshot lagged`)
    Object.assign(typing, {nativeInsert: statistics(insertTimes.slice(3)), nextFrame: statistics(frameTimes.slice(3)),
      snapshots: snapshots - beforeSnapshots, snapshotChars: snapshotChars - beforeSnapshotChars,
      snapshotProcessingMs: round(snapshotMs - beforeSnapshotMs), bridgeMessages: messages - beforeMessages,
      longTasks: longTasks.length, longestTaskMs: round(Math.max(0, ...longTasks))})

    editor.features.selection.selectElement(transform)
    await nextFrame()
    const feature = editor.features.transformation
    assert(feature.target === transform, `${mode} transform target mismatch: ${feature.target?.outerHTML.slice(0, 120) ?? 'null'}; selection ${doc.getSelection()?.anchorNode?.parentElement?.outerHTML.slice(0, 120) ?? 'null'}`)
    const handle = Array.from(feature.overlay.querySelectorAll<HTMLElement>('[data-transform-mode="scale"]'))
      .find(candidate => !candidate.hidden && candidate.dataset.resizeDirection?.includes('right'))
    assert(handle, `${mode} has no visible right resize handle`)
    let resizeCount = 0
    const resizeTimes: number[] = [], resizeFrameTimes: number[] = []
    const resizeStartTimes: number[] = [], resizeDragTimes: number[] = [], resizeEndTimes: number[] = []
    const resize = await stage('layout resize', details, async () => {
      const start = performance.now(), rect = transform.getBoundingClientRect(), beforeStyle = transform.getAttribute('style')
      const delta = ++resizeCount % 2 ? 12 : -12
      const startEvent = new view.MouseEvent('mousedown', {button: 0, clientX: rect.right, clientY: rect.bottom})
      Object.defineProperty(startEvent, 'composedPath', {value: () => [handle]})
      feature.handleScaleStart(startEvent)
      const started = performance.now()
      const dragEvent = new view.MouseEvent('mousemove', {button: 0, clientX: rect.right + delta, clientY: rect.bottom + 6})
      feature.handleScaleDrag(dragEvent)
      const dragged = performance.now()
      feature.handleScaleEnd(dragEvent)
      const ended = performance.now()
      resizeStartTimes.push(started - start); resizeDragTimes.push(dragged - started); resizeEndTimes.push(ended - dragged)
      resizeTimes.push(ended - start)
      await settle(); await nextFrame()
      resizeFrameTimes.push(performance.now() - start)
      if(transform.getAttribute('style') === beforeStyle) throw new Error(`${mode} resize made no change`)
    }, 20)
    Object.assign(resize, {pointerGesture: statistics(resizeTimes.slice(3)), gestureStart: statistics(resizeStartTimes.slice(3)),
      gestureDrag: statistics(resizeDragTimes.slice(3)), gestureEnd: statistics(resizeEndTimes.slice(3)), nextFrame: statistics(resizeFrameTimes.slice(3))})

    if(mode === 'canvas' || mode === 'slides') {
      let moveCount = 0
      const moveTimes: number[] = [], moveFrameTimes: number[] = []
      const moveStartTimes: number[] = [], moveDragTimes: number[] = [], moveEndTimes: number[] = []
      const moving = await stage('layout freeform move', details, async () => {
        const start = performance.now(), rect = transform.getBoundingClientRect(), previous = transform.style.left
        const delta = ++moveCount % 2 ? 24 : -24
        const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
        feature.handleMoveStart(new view.MouseEvent('mousedown', {button: 0, clientX: x, clientY: y}))
        const started = performance.now()
        const dragEvent = new view.MouseEvent('mousemove', {button: 0, clientX: x + delta, clientY: y + 16})
        feature.handleMoveDrag(dragEvent)
        const dragged = performance.now()
        feature.handleMoveEnd(dragEvent)
        const ended = performance.now()
        moveStartTimes.push(started - start); moveDragTimes.push(dragged - started); moveEndTimes.push(ended - dragged)
        moveTimes.push(ended - start)
        await settle(); await nextFrame()
        assert(transform.style.left !== previous, `${mode} move made no change`)
        moveFrameTimes.push(performance.now() - start)
      }, 20)
      Object.assign(moving, {pointerGesture: statistics(moveTimes.slice(3)), gestureStart: statistics(moveStartTimes.slice(3)),
        gestureDrag: statistics(moveDragTimes.slice(3)), gestureEnd: statistics(moveEndTimes.slice(3)), nextFrame: statistics(moveFrameTimes.slice(3))})
    }

    let selectionCount = 0
    const selectionTimes: number[] = [], selectionFrameTimes: number[] = []
    const selection = await stage('layout selection change', details, async () => {
      const start = performance.now(), node = ++selectionCount % 2 ? textA : textB
      doc.getSelection()!.setBaseAndExtent(node, 2, node, 2)
      selectionTimes.push(performance.now() - start)
      await settle(); await nextFrame()
      selectionFrameTimes.push(performance.now() - start)
    }, 20)
    Object.assign(selection, {nativeSelection: statistics(selectionTimes.slice(3)), nextFrame: statistics(selectionFrameTimes.slice(3))})

    const viewport = doc.querySelector<HTMLElement>('.ww-slides-viewport')
    const viewer = (editor.features.canvas as any).viewer as {camera: {x: number}, wheel: (event: WheelEvent) => void} | null
    const position = () => mode === 'canvas' ? viewer!.camera.x : mode === 'slides' ? viewport!.scrollLeft
      : mode === 'board' ? view.scrollX : view.scrollY
    let scrollCount = 0, scrollChanges = 0
    const scrollTimes: number[] = [], scrollFrameTimes: number[] = []
    const scrolling = await stage('layout scrolling', details, async () => {
      const start = performance.now(), previous = position(), delta = ++scrollCount % 2 ? 180 : -180
      if(mode === 'canvas') viewer!.wheel(new view.WheelEvent('wheel', {cancelable: true, deltaX: delta}))
      else if(mode === 'slides') viewport!.scrollBy({left: delta * 4, behavior: 'instant'})
      else if(mode === 'board') view.scrollBy({left: delta, behavior: 'instant'})
      else view.scrollBy({top: delta, behavior: 'instant'})
      scrollTimes.push(performance.now() - start)
      await settle(); await nextFrame()
      scrollFrameTimes.push(performance.now() - start)
      if(position() !== previous) scrollChanges++
    }, 20)
    assert(scrollChanges >= 20, `${mode} scroll position did not change on each sample`)
    Object.assign(scrolling, {scrollOperation: statistics(scrollTimes.slice(3)), nextFrame: statistics(scrollFrameTimes.slice(3)), scrollChanges})
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
  if(only === 'layouts') for(const size of profiling ? [600] : [240, 600])
    for(const mode of ['document', 'canvas', 'slides', 'board'] as const) await layoutProfile(mode, size)
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
