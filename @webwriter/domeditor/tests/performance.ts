import {SharedDOMDoc, sharedDOMBody} from '../src/domdoc'
import {SelectionFeature} from '../src/features/selection'
import {WidgetDataBindings} from '../src/widget-data'
import {DomEditor} from '../src/components/dom-editor'
import type {DOMEditor} from '../src/domeditor'
import * as Y from 'yjs'
import {benchmarkCatalogRendering} from './catalog-performance'

// Isolated operations, 3 warmups and 20 samples. Timings are reported rather
// than asserted, so slower machines can still check the work being avoided.
function sample(run: () => void) {
  for(let i = 0; i < 3; i++) run()
  const times = []
  for(let i = 0; i < 20; i++) {
    const start = performance.now()
    run()
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  return {medianMs: +times[10].toFixed(3), maxMs: +times[19].toFixed(3)}
}
function assert(value: unknown, message: string): asserts value {
  if(!value) throw new Error(message)
}
const checks: {name: string, samples: object[]}[] = [
  {name: 'hover float candidates', samples: []},
  {name: 'local and remote reconciliation', samples: []},
  {name: 'frame snapshot processing', samples: []},
  {name: 'unchanged widget data', samples: []},
]
for(const size of [100, 1000, 5000]) {
  const html = Array.from({length: size}, (_, i) => `<${i % 10 === 0 ? 'h2' : 'p'}>Example text ${i}</${i % 10 === 0 ? 'h2' : 'p'}>`).join('')
  document.body.innerHTML = html
  const target = document.body.children[1]
  const feature = new SelectionFeature({features: {canvas: {active: false}, slides: {active: false}}} as unknown as DOMEditor)
  feature.floatExclusions(target) // Discover once, as an ongoing hover does.
  let styles = 0
  const original = window.getComputedStyle
  window.getComputedStyle = (...args) => { styles++; return original(...args) }
  try {
    const timing = sample(() => feature.floatExclusions(target))
    assert(styles <= 23 * 2, 'steady hover scanned unrelated computed styles')
    checks[0].samples.push({elements: size, computedStyleCallsPerRun: styles / 23, ...timing})
  }
  finally { window.getComputedStyle = original }
  for(const permalinks of [false, true]) {
    const owner = document.implementation.createHTMLDocument('')
    owner.body.innerHTML = html
    const shared = new SharedDOMDoc(undefined, undefined, [], ['◆'], {root: owner.body, documentPermalinks: permalinks, connect: false})
    try {
      const text = owner.body.children[1].firstChild as Text
      const local = sample(() => { text.data += 'x'; shared.syncFromDOM() })
      const yText = (sharedDOMBody(shared.doc).get(1) as Y.XmlElement).get(0) as Y.XmlText
      const remote = sample(() => shared.doc.transact(() => yText.insert(yText.length, 'x'), 'remote'))
      assert(text.data.endsWith('x'.repeat(46)), 'text edits were lost')
      checks[1].samples.push({elements: size, permalinks, local, remote})
    }
    finally { shared.destroy() }
  }
  // Use the real frame-message handler with the filtered bridge contract.
  const host = new DomEditor() as any
  host.editorDocument = new DOMParser().parseFromString(html, 'text/html')
  host.editorOpaque = true
  host.fileHandle = {}
  host.isEditorMessage = () => true
  host.renderRoot = document.createElement('div')
  host.documentTree = host.buildDocumentTree()
  host.stylesVisible = () => false
  host.dirtyTrackingReady = true
  let revision = 0
  const timing = sample(() => host.handleEditorMessage(new MessageEvent('message', {data: {
    type: 'editor-frame-snapshot', html: `<html><head></head><body>${html.replace('Example text 1<', `Example text 1 ${revision++}<`)}</body></html>`, treeChanged: false,
  }})))
  checks[2].samples.push({elements: size, ...timing})
}
for(const size of [1, 10, 50]) {
  const root = document.createElement('main')
  const data = JSON.stringify(Array.from({length: 5000}, (_, i) => i))
  root.innerHTML = Array.from({length: size}, () => `<audit-widget><script slot="data" type="application/json">${data}</script></audit-widget>`).join('')
  const docs: Y.Doc[] = []
  const bindings = new WidgetDataBindings(root, () => true, {resolve: () => {
    const doc = new Y.Doc(); docs.push(doc); return {doc}
  }})
  bindings.sync()
  let parses = 0
  const original = JSON.parse
  JSON.parse = (...args) => { parses++; return original(...args) }
  try {
    const timing = sample(() => bindings.sync())
    assert(parses === 0, 'unchanged widget data was parsed')
    checks[3].samples.push({widgets: size, bytesPerWidget: data.length, jsonParsesPerRun: parses / 23, ...timing})
  }
  finally { JSON.parse = original; bindings.destroy(); docs.forEach(doc => doc.destroy()) }
}
// Native CSSOM writes emit no MutationRecord. A resize or the bounded fallback
// must discover a new float, while shadow widget content remains atomic.
document.body.innerHTML = '<p>Target</p><aside>Float</aside><audit-widget><aside style="float:left">Private</aside></audit-widget>'
const stylesheet = new CSSStyleSheet()
stylesheet.replaceSync('body > aside {float:none;width:30px;height:30px}')
document.adoptedStyleSheets = [...document.adoptedStyleSheets, stylesheet]
const selection = new SelectionFeature({features: {canvas: {active: false}, slides: {active: false}}} as unknown as DOMEditor)
assert(selection.floatExclusions(document.body.firstElementChild!).length === 0, 'widget descendants were inspected as document floats')
;(stylesheet.cssRules[0] as CSSStyleRule).style.float = 'left'
await new Promise(resolve => setTimeout(resolve, 260))
const bounds = new DOMRect(0, 0, 10000, 10000)
assert(selection.floatExclusions(document.body.firstElementChild!, bounds).length === 1, 'CSSOM float was not rediscovered')

// Exercise the real bridge observer, including the throttled trailing batch.
const initial = document.implementation.createHTMLDocument('')
initial.body.innerHTML = '<p>Native snapshot</p>'
const shared = new SharedDOMDoc(undefined, undefined, [], ['◆'], {root: initial.body})
const initialState = shared.snapshot()
shared.destroy()
const frame = document.createElement('iframe')
const snapshots: {html: string, treeChanged: boolean}[] = []
const nonce = 'performance-snapshot-nonce'
const capture = (event: MessageEvent) => {
  if(event.source === frame.contentWindow && event.data?.bridgeNonce === nonce && event.data.type === 'editor-frame-snapshot') snapshots.push(event.data)
}
window.addEventListener('message', capture)
const loaded = new Promise<void>(resolve => { frame.onload = () => resolve() })
frame.srcdoc = '<!doctype html><body><p>Native snapshot</p><script class="◆editor-only" type="module" src="/src/editor-entry.ts"></script></body>'
document.body.append(frame)
try {
  await loaded
  frame.contentWindow!.postMessage({type: 'initialize-editor', syncUrl: 'ws://127.0.0.1:65534', bridgeNonce: nonce,
    initialState, proofreadingEnabled: false}, location.origin)
  await new Promise(resolve => setTimeout(resolve, 500))
  assert(snapshots.length > 0, 'bridge did not publish its initial snapshot')
  snapshots.length = 0
  const paragraph = frame.contentDocument!.querySelector('p')!
  for(let i = 0; i < 20; i++) paragraph.classList.toggle('◆audit-hover')
  await new Promise(resolve => setTimeout(resolve, 300))
  assert(snapshots.length === 0, 'marker-only mutations published document snapshots')
  paragraph.firstChild!.nodeValue = 'Changed text'
  await new Promise(resolve => setTimeout(resolve, 300))
  assert(Number(snapshots.length) === 1 && snapshots[0].treeChanged === false, 'text edit lost or rebuilt the document tree')
  assert(snapshots[0].html.includes('Changed text'), 'snapshot contains stale text')
  snapshots.length = 0
  paragraph.after(frame.contentDocument!.createElement('unknown-audit-widget'))
  await new Promise(resolve => setTimeout(resolve, 300))
  assert(Number(snapshots.length) === 1 && Boolean(snapshots[0].treeChanged), 'structural edit did not invalidate the document tree')
}
finally {
  (frame.contentWindow as Window & {editor?: DOMEditor})?.editor?.destroy()
  frame.remove()
  window.removeEventListener('message', capture)
}
checks.push(await benchmarkCatalogRendering())
await fetch('/__native-result', {method: 'POST', body: JSON.stringify({checks})})
