import {SharedDOMDoc} from '../src/domdoc'
import * as Y from 'yjs'

type Mode = 'attributes' | 'json-attribute' | 'data-block'
const modes: Mode[] = ['attributes', 'json-attribute', 'data-block']
const samples: object[] = []
const paced: object[] = []
const diagnosticsOnly = new URLSearchParams(location.search).has('diagnostics')
const channel = new MessageChannel()
// A task boundary lets native mutation observers and queued Yjs renders settle.
const settle = () => new Promise<void>(resolve => {
  channel.port1.onmessage = () => resolve()
  channel.port2.postMessage(null)
})
const percentile = (values: number[], fraction: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1]
const round = (n: number) => +n.toFixed(3)
function assert(value: unknown, message: string): asserts value {
  if(!value) throw new Error(message)
}

async function fixture(mode: Mode, count: number, kib: number, peers = 1, offline = false) {
  // Same 32 scalar fields and payload in all representations. Only answer changes.
  const state: Record<string, string> = {answer: '00000000'}
  for(let i = 0; i < 31; i++) state[`field${i}`] = 'x'.repeat(Math.floor((kib * 1024 - 440) / 31))
  const initial = JSON.stringify(state)
  const root = document.createElement('main')
  root.hidden = true
  const widgets: Element[] = [], blocks: HTMLScriptElement[] = []
  for(let i = 0; i < count; i++) {
    const widget = document.createElement('bench-widget')
    widget.id = `w${i}`
    if(mode === 'attributes') for(const [key, value] of Object.entries(state)) widget.setAttribute(key, value)
    else if(mode === 'json-attribute') widget.setAttribute('state', initial)
    else {
      const block = document.createElement('script')
      block.type = 'application/json'; block.slot = 'data'; block.textContent = initial
      widget.append(block); blocks.push(block)
    }
    root.append(widget); widgets.push(widget)
  }
  document.body.append(root)
  const docs = new Map<string, Y.Doc>()
  const storageDocument = `benchmark-${crypto.randomUUID()}`
  const source = new SharedDOMDoc(undefined, undefined, [], ['◆'], {
    root, connect: false, supportsWidgetData: element => element.localName === 'bench-widget',
    widgetData: offline ? {documentId: storageDocument} : {resolve: request => {
      const doc = new Y.Doc(); docs.set(request.widget, doc); return {doc}
    }},
  })
  let bytes = 0, updates = 0
  const destinationRoot = document.createElement('main')
  let destination: SharedDOMDoc | undefined
  const extraDocs: Y.Doc[] = []
  if(peers === 2) {
    const doc = new Y.Doc()
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(source.doc))
    destination = new SharedDOMDoc(undefined, undefined, [], ['◆'], {
      root: destinationRoot, ydoc: doc, connect: false,
      supportsWidgetData: element => element.localName === 'bench-widget',
      widgetData: {resolve: request => {
        const remote = new Y.Doc(), local = docs.get(request.widget)!
        Y.applyUpdate(remote, Y.encodeStateAsUpdate(local))
        local.on('update', update => Y.applyUpdate(remote, update, 'benchmark-remote'))
        extraDocs.push(remote)
        return {doc: remote}
      }},
    })
    source.doc.on('update', update => Y.applyUpdate(doc, update, 'benchmark-remote'))
  }
  for(const doc of [source.doc, ...docs.values()]) doc.on('update', (update: Uint8Array) => { bytes += update.byteLength; updates++ })
  await source.widgetData.whenReady()
  await source.widgetData.flushPersistence()
  await settle()
  let revision = 0, cursor = 0
  const expected = new Map<number, string>()
  const write = (active: number) => {
    const value = String(++revision).padStart(8, '0')
    for(let j = 0; j < active; j++) {
      const index = cursor++ % count, widget = widgets[index]
      expected.set(index, value)
      if(mode === 'attributes') widget.setAttribute('answer', value)
      else {
        const text = mode === 'data-block' ? blocks[index].textContent! : widget.getAttribute('state')!
        const current = JSON.parse(text)
        current.answer = value
        if(mode === 'data-block') blocks[index].textContent = JSON.stringify(current)
        else widget.setAttribute('state', JSON.stringify(current))
      }
    }
  }
  const verify = () => {
    for(const target of destination ? [root, destinationRoot] : [root]) {
      for(const [index, value] of expected) {
        const widget = target.children[index]
        const actual = mode === 'attributes' ? widget.getAttribute('answer')
          : JSON.parse(mode === 'data-block' ? widget.firstElementChild!.textContent! : widget.getAttribute('state')!).answer
        assert(actual === value, `${mode}: lost edit at ${index}: ${actual} != ${value}`)
      }
    }
  }
  return {write, verify, source, payloadBytes: initial.length, traffic: () => ({bytes, updates}), destroy: () => {
    destination?.destroy(); source.destroy()
    for(const doc of [...docs.values(), ...extraDocs]) doc.destroy()
    root.remove()
    if(offline) for(const key of Object.keys(localStorage)) if(key.includes(storageDocument)) localStorage.removeItem(key)
  }}
}

// Alternate mode order to reduce warmup/order bias. Recreate fixtures per repeat.
if(!diagnosticsOnly) {
  for(let repeat = 0; repeat < 3; repeat++) {
    for(const count of [10, 100, 500]) for(const kib of [1, 16, 64]) {
      for(const active of [1, 10]) for(const mode of repeat % 2 ? [...modes].reverse() : modes) {
        const f = await fixture(mode, count, kib)
        try {
          for(let i = 0; i < 5; i++) { f.write(active); await settle() }
          const before = f.traffic(), times: number[] = []
          for(let i = 0; i < 25; i++) {
            const start = performance.now()
            f.write(active); await settle()
            times.push(performance.now() - start)
          }
          f.verify()
          const after = f.traffic()
          samples.push({repeat, count, kib, active, mode, peers: 1, payloadBytes: f.payloadBytes,
            medianMs: round(percentile(times, .5)), p95Ms: round(percentile(times, .95)), maxMs: round(Math.max(...times)),
            bytesPerBatch: (after.bytes - before.bytes) / times.length,
            updatesPerBatch: (after.updates - before.updates) / times.length})
        }
        finally { f.destroy() }
      }
    }
  }
  // Two peers share a process: timings here include both sender and receiver CPU,
  // synchronous in-memory transport, and receiver DOM application, without latency.
  for(const kib of [1, 16, 64]) for(const active of [1, 10]) for(const mode of modes) {
    const f = await fixture(mode, 100, kib, 2)
    try {
      for(let i = 0; i < 5; i++) { f.write(active); await settle() }
      const before = f.traffic(), times: number[] = []
      for(let i = 0; i < 30; i++) {
        const start = performance.now(); f.write(active); await settle(); times.push(performance.now() - start)
      }
      f.verify()
      samples.push({count: 100, kib, active, mode, peers: 2, payloadBytes: f.payloadBytes,
        medianMs: round(percentile(times, .5)), p95Ms: round(percentile(times, .95)), maxMs: round(Math.max(...times)),
        bytesPerBatch: (f.traffic().bytes - before.bytes) / times.length})
    }
    finally { f.destroy() }
  }
  // Absolute deadlines expose overload instead of quietly reducing the offered rate.
  for(const kib of [1, 16, 64]) for(const hz of [10, 30, 60]) for(const mode of modes) {
    const f = await fixture(mode, 500, kib)
    try {
      for(let i = 0; i < 5; i++) { f.write(10); await settle() }
      const start = performance.now(), service: number[] = [], lateness: number[] = []
      for(let tick = 0; tick < hz * 2; tick++) {
        const deadline = start + tick * 1000 / hz
        if(deadline > performance.now()) await new Promise(resolve => setTimeout(resolve, deadline - performance.now()))
        const entered = performance.now()
        lateness.push(Math.max(0, entered - deadline))
        f.write(10); await settle(); service.push(performance.now() - entered)
      }
      const elapsedMs = performance.now() - start
      f.verify()
      paced.push({count: 500, kib, active: 10, hz, mode, batches: service.length, elapsedMs: round(elapsedMs),
        medianMs: round(percentile(service, .5)), p95Ms: round(percentile(service, .95)),
        p95LatenessMs: round(percentile(lateness, .95)), maxLatenessMs: round(Math.max(...lateness)),
        overBudgetBatches: service.filter(ms => ms > 1000 / hz).length,
        serviceMsPerSecond: round(service.reduce((sum, ms) => sum + ms, 0) / 2)})
    }
    finally { f.destroy() }
  }
}
else {
  for(const count of [100, 500]) for(const kib of [1, 16, 64]) {
    const f = await fixture('data-block', count, kib)
    try {
      const unchanged: number[] = []
      for(let i = 0; i < 25; i++) {
        const start = performance.now(); f.source.widgetData.sync(); unchanged.push(performance.now() - start)
      }
      let parses = 0, serializations = 0, parsedChars = 0, serializedChars = 0
      const originalParse = JSON.parse, originalStringify = JSON.stringify
      JSON.parse = ((text: string, ...args: any[]) => { parses++; parsedChars += text.length; return originalParse(text, ...args) }) as typeof JSON.parse
      JSON.stringify = ((...args: any[]) => {
        const text = (originalStringify as Function)(...args)
        serializations++; serializedChars += text?.length ?? 0; return text
      }) as typeof JSON.stringify
      try { f.write(1); await settle() }
      finally { JSON.parse = originalParse; JSON.stringify = originalStringify }
      f.verify()
      samples.push({diagnostic: 'unchanged-binding-scan-and-single-edit', count, kib,
        scanMedianMs: round(percentile(unchanged, .5)), scanP95Ms: round(percentile(unchanged, .95)),
        parses, serializations, parsedChars, serializedChars})
    }
    finally { f.destroy() }
  }
  // Compare the offline IndexedDB backend with the in-memory resolver.
  for(const count of [10, 100]) for(const offline of [false, true]) for(const kib of [1, 16, 64]) for(const active of [1, 10]) {
    let storageWrites = 0, storageFailures = 0
    const originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function(key: string, value: string) {
      storageWrites++
      try { return originalSetItem.call(this, key, value) }
      catch(error) { storageFailures++; throw error }
    }
    const f = await fixture('data-block', count, kib, 1, offline)
    try {
      for(let i = 0; i < 5; i++) { f.write(active); await settle(); await f.source.widgetData.flushPersistence() }
      const setupStorageFailures = storageFailures
      storageWrites = 0; storageFailures = 0
      const times: number[] = [], completion: number[] = []
      for(let i = 0; i < 25; i++) {
        const start = performance.now(); f.write(active); await settle(); times.push(performance.now() - start)
        await f.source.widgetData.flushPersistence(); completion.push(performance.now() - start)
      }
      f.verify()
      samples.push({diagnostic: 'persistence', offline, count, kib, active,
        medianMs: round(percentile(times, .5)), p95Ms: round(percentile(times, .95)),
        persistenceBackend: offline ? 'indexeddb' : 'memory',
        completionMedianMs: round(percentile(completion, .5)), completionP95Ms: round(percentile(completion, .95)),
        setupStorageFailures, storageWrites, storageFailures})
    }
    finally { Storage.prototype.setItem = originalSetItem; f.destroy() }
  }
}
await fetch('/__native-result', {method: 'POST', body: JSON.stringify({
  metadata: {userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency,
    timestamp: new Date().toISOString(), fields: 32, warmups: 5, samples: 25, repeats: diagnosticsOnly ? 1 : 3,
    notes: 'Native MutationObserver settling; one writer; rotating active widgets; JSON read/modify/write; no rendering, WebSocket or CPU throttling. Offline diagnostics use IndexedDB and report transaction completion separately.'},
  checks: [{name: 'widget state benchmark', samples}], paced,
})})
channel.port1.close(); channel.port2.close()
