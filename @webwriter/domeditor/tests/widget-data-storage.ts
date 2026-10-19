import * as Y from 'yjs'
import {SharedDOMDoc, sharedDOMBody} from '../src/domdoc'
import {WidgetDataStorage, type WidgetDataPersistenceState} from '../src/widget-data-storage'

const checks: {name: string}[] = [], samples: object[] = [], paced: object[] = []
const databaseName = 'webwriter-widget-data'
const channel = new MessageChannel()
const settle = () => new Promise<void>(resolve => {
  channel.port1.onmessage = () => resolve(); channel.port2.postMessage(null)
})
function assert(condition: unknown, message: string): asserts condition { if(!condition) throw new Error(message) }
const expect = (actual: unknown, expected: unknown) => assert(JSON.stringify(actual) === JSON.stringify(expected), `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`)
const initialize = (doc: Y.Doc) => {
  if(!doc.getMap('data').has('value')) doc.getMap('data').set('value', new Y.Map(Object.entries({a: 1, b: 1})))
}
const value = (doc: Y.Doc) => (doc.getMap('data').get('value') as Y.Map<unknown>)
const scope = () => `test-${crypto.randomUUID()}`
const owned: WidgetDataStorage[] = []
function storage() { const store = new WidgetDataStorage(indexedDB, localStorage); owned.push(store); return store }
async function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function records(key: string) {
  const db = await openDatabase()
  try { return await new Promise<{updates: {id: number, update: Uint8Array}[], checkpoint?: Uint8Array}>((resolve, reject) => {
    const tx = db.transaction(['updates', 'checkpoints'])
    const updates = tx.objectStore('updates').index('scope').getAll(key)
    const checkpoint = tx.objectStore('checkpoints').get(key)
    tx.oncomplete = () => resolve({updates: updates.result, checkpoint: checkpoint.result})
    tx.onabort = () => reject(tx.error)
  }) }
  finally { db.close() }
}
async function check(name: string, run: () => Promise<void>) {
  try { await run(); checks.push({name}) }
  finally { owned.splice(0).forEach(store => store.destroy()) }
}

await check('binary incremental updates, reload and batched writes', async () => {
  const key = scope(), store = storage(), connection = store.connect(key, initialize)
  await connection.ready
  const states: WidgetDataPersistenceState[] = []
  connection.observePersistence(state => states.push(state))
  for(let i = 0; i < 20; i++) value(connection.doc).set('a', i)
  await store.flush()
  const stored = await records(key)
  assert(stored.updates.length === 2, 'same-turn updates were not batched into one record')
  assert(stored.updates.every(record => record.update instanceof Uint8Array), 'updates are not binary')
  expect(states.at(-1)?.state, 'saved')
  const reloaded = storage().connect(key, initialize)
  await reloaded.ready
  expect(value(reloaded.doc).toJSON(), {a: 19, b: 1})
})
await check('legacy migration commits before removing the legacy key', async () => {
  const key = scope(), legacy = new Y.Doc()
  initialize(legacy); value(legacy).set('a', 42)
  localStorage.setItem(key, JSON.stringify([...Y.encodeStateAsUpdate(legacy)])); legacy.destroy()
  const store = storage(), connection = store.connect(key, initialize)
  assert(localStorage.getItem(key) !== null, 'legacy was removed before restoration committed')
  await connection.ready
  expect(value(connection.doc).toJSON(), {a: 42, b: 1})
  expect(localStorage.getItem(key), null)
  const loaded = storage().connect(key, initialize)
  await loaded.ready
  expect(value(loaded.doc).get('a'), 42)
})
await check('a remaining legacy snapshot merges with already committed IndexedDB edits', async () => {
  const key = scope(), legacy = new Y.Doc()
  initialize(legacy)
  localStorage.setItem(key, JSON.stringify([...Y.encodeStateAsUpdate(legacy)]))
  const store = storage(), connection = store.connect(key, initialize)
  await connection.ready
  value(connection.doc).set('b', 3); await store.flush()
  value(legacy).set('a', 42)
  localStorage.setItem(key, JSON.stringify([...Y.encodeStateAsUpdate(legacy)])); legacy.destroy()
  const loaded = storage().connect(key, initialize)
  await loaded.ready
  expect(value(loaded.doc).toJSON(), {a: 42, b: 3})
  expect(localStorage.getItem(key), null)
})
await check('aborted migration preserves legacy data and retries readiness', async () => {
  const key = scope(), legacy = new Y.Doc()
  initialize(legacy); value(legacy).set('a', 7)
  const text = JSON.stringify([...Y.encodeStateAsUpdate(legacy)])
  localStorage.setItem(key, text); legacy.destroy()
  const original = IDBObjectStore.prototype.add
  let fail = true
  IDBObjectStore.prototype.add = function(...args: Parameters<IDBObjectStore['add']>) {
    if(fail && this.name === 'updates') throw new DOMException('Injected quota failure', 'QuotaExceededError')
    return original.apply(this, args)
  }
  const store = storage(), connection = store.connect(key, initialize)
  try {
    let rejected = false
    try { await store.flush() } catch { rejected = true }
    assert(rejected, 'migration falsely reported success')
    expect(localStorage.getItem(key), text)
    expect(connection.doc.getMap('data').size, 0)
    fail = false
    await store.flush(); await connection.ready
    expect(value(connection.doc).get('a'), 7)
    expect(localStorage.getItem(key), null)
  }
  finally { IDBObjectStore.prototype.add = original }
})
await check('failed multi-scope writes abort atomically and retain updates for retry', async () => {
  const key = scope(), otherKey = scope(), store = storage()
  const left = store.connect(key, initialize), right = store.connect(otherKey, initialize)
  await Promise.all([left.ready, right.ready])
  const states: WidgetDataPersistenceState[] = []
  left.observePersistence(state => states.push(state))
  const original = IDBObjectStore.prototype.add
  let additions = 0
  IDBObjectStore.prototype.add = function(...args: Parameters<IDBObjectStore['add']>) {
    if(this.name === 'updates' && ++additions === 2) throw new DOMException('Injected quota failure', 'QuotaExceededError')
    return original.apply(this, args)
  }
  try {
    value(left.doc).set('a', 3); value(right.doc).set('b', 4)
    let rejected = false
    try { await store.flush() } catch { rejected = true }
    assert(rejected && states.at(-1)?.state === 'error', 'failure was hidden')
    expect((await records(key)).updates.length, 1)
    expect((await records(otherKey)).updates.length, 1)
  }
  finally { IDBObjectStore.prototype.add = original }
  await store.flush()
  const loadedLeft = storage().connect(key, initialize), loadedRight = storage().connect(otherKey, initialize)
  await Promise.all([loadedLeft.ready, loadedRight.ready])
  expect(value(loadedLeft.doc).get('a'), 3); expect(value(loadedRight.doc).get('b'), 4)
  expect(states.at(-1)?.state, 'saved')
})
await check('an unreadable scope does not block committed writes in other scopes', async () => {
  const bad = scope(), good = scope(), store = storage()
  const original = IDBObjectStore.prototype.add
  IDBObjectStore.prototype.add = function(...args: Parameters<IDBObjectStore['add']>) {
    if(this.name === 'updates' && args[0].scope === bad) throw new Error('Injected restore failure')
    return original.apply(this, args)
  }
  try {
    store.connect(bad, initialize)
    const available = store.connect(good, initialize)
    await available.ready
    value(available.doc).set('a', 33)
    let rejected = false
    try { await store.flush() } catch { rejected = true }
    assert(rejected, 'overall flush hid an unreadable scope')
    const loaded = storage().connect(good, initialize)
    await loaded.ready
    expect(value(loaded.doc).get('a'), 33)
  }
  finally { IDBObjectStore.prototype.add = original }
})
await check('an explicitly failed flush retries automatically', async () => {
  const key = scope(), store = storage(), connection = store.connect(key, initialize)
  await connection.ready
  const original = IDBObjectStore.prototype.add
  IDBObjectStore.prototype.add = function() { throw new Error('Injected write failure') }
  try {
    value(connection.doc).set('a', 44)
    let failed = false
    try { await store.flush() } catch { failed = true }
    assert(failed, 'failed flush resolved')
  }
  finally { IDBObjectStore.prototype.add = original }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Failed flush was not automatically retried')), 4000)
    const stop = connection.observePersistence(state => {
      if(state.state === 'saved') { clearTimeout(timer); stop(); resolve() }
    })
  })
  const loaded = storage().connect(key, initialize)
  await loaded.ready
  expect(value(loaded.doc).get('a'), 44)
})
await check('compaction preserves concurrent writers and replay is bounded', async () => {
  const key = scope(), first = storage(), second = storage()
  // Simultaneous initialization must elect the same root Y.Map across tabs.
  const left = first.connect(key, initialize), right = second.connect(key, initialize)
  await Promise.all([left.ready, right.ready])
  for(let i = 0; i < 135; i++) {
    value(left.doc).set('a', i)
    if(i === 126) { value(right.doc).set('b', 42); await Promise.all([first.flush(), second.flush()]) }
    else await first.flush()
  }
  const stored = await records(key)
  assert(stored.checkpoint instanceof Uint8Array && stored.updates.length < 128, 'log was not compacted')
  const loaded = storage().connect(key, initialize)
  await loaded.ready
  expect(value(loaded.doc).toJSON(), {a: 134, b: 42})
})
await check('aborted compaction leaves the old checkpoint and log recoverable', async () => {
  const key = scope(), store = storage(), connection = store.connect(key, initialize)
  await connection.ready
  for(let i = 0; i < 126; i++) { value(connection.doc).set('a', i + 2); await store.flush() }
  const original = IDBObjectStore.prototype.put
  IDBObjectStore.prototype.put = function(...args: Parameters<IDBObjectStore['put']>) {
    if(this.name === 'checkpoints') throw new Error('Injected checkpoint failure')
    return original.apply(this, args)
  }
  try {
    value(connection.doc).set('a', 900)
    let rejected = false
    try { await store.flush() } catch { rejected = true }
    assert(rejected, 'compaction failure was ignored')
    const stored = await records(key)
    assert(!stored.checkpoint && stored.updates.length === 127, 'aborted compaction deleted committed updates')
  }
  finally { IDBObjectStore.prototype.put = original }
  await store.flush()
  const reloaded = storage().connect(key, initialize)
  await reloaded.ready
  expect(value(reloaded.doc).get('a'), 900)
})
await check('large incremental values compact by byte size before the record limit', async () => {
  const key = scope(), store = storage(), connection = store.connect(key, initialize)
  await connection.ready
  value(connection.doc).set('payload', 'x'.repeat(700000)); await store.flush()
  value(connection.doc).set('payload', 'y'.repeat(700000)); await store.flush()
  const stored = await records(key)
  assert(stored.checkpoint && !stored.updates.length, 'large update log did not compact by size')
  const loaded = storage().connect(key, initialize)
  await loaded.ready
  expect(value(loaded.doc).get('payload'), 'y'.repeat(700000))
})
await check('writes arriving during a transaction survive its acknowledgement', async () => {
  const key = scope(), store = storage(), connection = store.connect(key, initialize)
  await connection.ready
  const original = IDBObjectStore.prototype.add
  let injected = false
  IDBObjectStore.prototype.add = function(...args: Parameters<IDBObjectStore['add']>) {
    const request = original.apply(this, args)
    if(this.name === 'updates' && !injected) { injected = true; value(connection.doc).set('b', 99) }
    return request
  }
  try { value(connection.doc).set('a', 2); await store.flush() }
  finally { IDBObjectStore.prototype.add = original }
  const loaded = storage().connect(key, initialize)
  await loaded.ready
  expect(value(loaded.doc).toJSON(), {a: 2, b: 99})
})
await check('teardown drains captured updates without retaining live listeners', async () => {
  const key = scope(), store = storage(), connection = store.connect(key, initialize)
  await connection.ready
  value(connection.doc).set('a', 77)
  store.destroy()
  await store.flush()
  const loaded = storage().connect(key, initialize)
  await loaded.ready
  expect(value(loaded.doc).get('a'), 77)
})

// Use the same 32-field payloads as the previous offline benchmark. The legacy
// resolver is benchmark-only code reproducing the old synchronous persistence.
type Backend = 'memory' | 'legacy-localStorage' | 'indexeddb'
async function fixture(backend: Backend, count: number, kib: number) {
  const id = scope(), root = document.createElement('main')
  const state: Record<string, string> = {answer: '00000000'}
  for(let i = 0; i < 31; i++) state[`field${i}`] = 'x'.repeat(Math.floor((kib * 1024 - 440) / 31))
  const initial = JSON.stringify(state)
  const markup = Array.from({length: count}, (_, i) => `<bench-widget id="w${i}"><script type="application/json" slot="data">${initial}</script></bench-widget>`).join('')
  root.innerHTML = markup; root.hidden = true; document.body.append(root)
  const docs: Y.Doc[] = [], errors: string[] = [], statuses: WidgetDataPersistenceState[] = []
  const pending = new Set<EventTarget>()
  root.addEventListener('datapersistence', event => {
    const status = (event as CustomEvent<WidgetDataPersistenceState>).detail
    statuses.push(status); if(status.state === 'error') errors.push(status.message ?? 'persistence error')
    if(event.target) {
      if(status.state === 'pending') pending.add(event.target)
      else pending.delete(event.target)
    }
  })
  const shared = new SharedDOMDoc(undefined, undefined, [], ['◆'], {
    root, supportsWidgetData: element => element.localName === 'bench-widget',
    widgetData: {documentId: id, ...(backend === 'indexeddb' ? {} : {resolve: (request: {widget: string}) => {
      const doc = new Y.Doc(); docs.push(doc)
      if(backend === 'legacy-localStorage') doc.on('update', () => {
        try { localStorage.setItem(`${id}:${request.widget}`, JSON.stringify([...Y.encodeStateAsUpdate(doc)])) }
        catch(error) { errors.push(String(error)) }
      })
      return {doc}
    }})},
  })
  await shared.widgetData.whenReady(); await shared.widgetData.flushPersistence(); await settle()
  const blocks = [...root.querySelectorAll<HTMLScriptElement>('script')]
  const expected = new Map<number, string>()
  let revision = 0, cursor = 0
  return {shared, errors, statuses, pending: () => pending.size, write(active: number) {
    const answer = String(++revision).padStart(8, '0')
    for(let i = 0; i < active; i++) {
      const index = cursor++ % count, current = JSON.parse(blocks[index].textContent!)
      current.answer = answer; blocks[index].textContent = JSON.stringify(current); expected.set(index, answer)
    }
  }, async verifyReload() {
    for(const [index, answer] of expected) expect(JSON.parse(blocks[index].textContent!).answer, answer)
    assert(!sharedDOMBody(shared.doc).toString().includes('00000025'), 'participant state leaked into the shared body')
    if(backend !== 'indexeddb') return
    const target = document.createElement('main'); target.innerHTML = markup
    const reloaded = new SharedDOMDoc(undefined, undefined, [], ['◆'], {
      root: target, supportsWidgetData: element => element.localName === 'bench-widget', widgetData: {documentId: id},
    })
    try {
      await reloaded.widgetData.whenReady()
      for(const [index, answer] of expected) expect(JSON.parse(target.children[index].firstElementChild!.textContent!).answer, answer)
    }
    finally { reloaded.destroy() }
  }, destroy() {
    shared.destroy(); docs.forEach(doc => doc.destroy()); root.remove()
    for(const key of Object.keys(localStorage)) if(key.startsWith(id + ':')) localStorage.removeItem(key)
  }}
}
await check('widget integration restores scopes and excludes participant data from exports', async () => {
  const f = await fixture('indexeddb', 10, 16)
  try {
    f.write(10); await settle(); await f.shared.widgetData.flushPersistence(); await f.verifyReload()
    const clone = f.shared.root.cloneNode(true) as HTMLElement
    f.shared.widgetData.writeDefaults(clone)
    assert(!clone.innerHTML.includes('00000001'), 'export contained participant state')
    assert(!f.errors.length && f.statuses.some(state => state.state === 'saved'), 'save status missing or failed')
  }
  finally { f.destroy() }
})
await check('offline scopes isolate users, documents and sharing modes', async () => {
  const id = scope(), peers: SharedDOMDoc[] = []
  const make = async (documentId: string, userId: string) => {
    const root = document.createElement('main')
    root.innerHTML = '<bench-widget id="widget"><script type="application/json" slot="data">{"a":1}</script></bench-widget>'
    const shared = new SharedDOMDoc(undefined, undefined, [], ['◆'], {
      root, supportsWidgetData: element => element.localName === 'bench-widget', widgetData: {documentId, userId},
    })
    peers.push(shared)
    await shared.widgetData.whenReady()
    return {root, shared, block: root.querySelector('script')!}
  }
  try {
    const alice = await make(id, 'alice')
    alice.block.textContent = '{"secret":"alice"}'
    alice.shared.syncFromDOM(); await alice.shared.widgetData.flushPersistence()
    const bob = await make(id, 'bob'), unrelated = await make(scope(), 'alice'), resumed = await make(id, 'alice')
    expect(JSON.parse(bob.block.textContent!), {a: 1})
    expect(JSON.parse(unrelated.block.textContent!), {a: 1})
    expect(JSON.parse(resumed.block.textContent!), {secret: 'alice'})
    alice.root.firstElementChild!.setAttribute('shared', '')
    alice.shared.syncFromDOM(); await alice.shared.widgetData.whenReady()
    expect(JSON.parse(alice.block.textContent!), {a: 1})
    const events: WidgetDataPersistenceState[] = []
    alice.block.addEventListener('datapersistence', event => events.push((event as CustomEvent).detail))
    alice.block.dispatchEvent(new CustomEvent('datarequest', {bubbles: true, cancelable: true}))
    expect(events.at(-1)?.state, 'saved')
  }
  finally { peers.forEach(peer => peer.destroy()) }
})

const percentile = (values: number[], fraction: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1]
const round = (n: number) => +n.toFixed(3)
for(let repeat = 0; repeat < 2; repeat++) for(const count of [10, 100]) for(const kib of [1, 16, 64]) for(const active of [1, 10]) {
  const backends: Backend[] = ['memory', 'legacy-localStorage', 'indexeddb']
  for(const backend of repeat ? backends.reverse() : backends) {
    const f = await fixture(backend, count, kib)
    try {
      for(let i = 0; i < 5; i++) { f.write(active); await settle(); await f.shared.widgetData.flushPersistence() }
      const edit: number[] = [], completion: number[] = []
      for(let i = 0; i < 25; i++) {
        const start = performance.now()
        f.write(active); await settle(); edit.push(performance.now() - start)
        await f.shared.widgetData.flushPersistence(); completion.push(performance.now() - start)
      }
      await f.verifyReload()
      if(backend === 'indexeddb') assert(!f.errors.length, 'IndexedDB persistence failed during benchmark')
      samples.push({repeat, count, kib, active, backend, errors: f.errors.length,
        editMedianMs: round(percentile(edit, .5)), editP95Ms: round(percentile(edit, .95)),
        completionMedianMs: round(percentile(completion, .5)), completionP95Ms: round(percentile(completion, .95)),
        reloadVerified: backend === 'indexeddb'})
    }
    finally { f.destroy() }
  }
}
await check('paced IndexedDB persistence drains without an accumulating write backlog', async () => {
  const f = await fixture('indexeddb', 100, 64)
  try {
    const start = performance.now(), service: number[] = [], lateness: number[] = [], pendingAtStart: number[] = []
    for(let tick = 0; tick < 120; tick++) {
      const deadline = start + tick * 1000 / 60
      if(deadline > performance.now()) await new Promise(resolve => setTimeout(resolve, deadline - performance.now()))
      const entered = performance.now()
      pendingAtStart.push(f.pending()); lateness.push(Math.max(0, entered - deadline))
      f.write(10); await settle(); service.push(performance.now() - entered)
    }
    const beforeDrain = performance.now()
    await f.shared.widgetData.flushPersistence()
    const drainMs = performance.now() - beforeDrain, elapsedMs = performance.now() - start
    assert(!f.errors.length && !f.pending(), 'writes failed or remained uncommitted')
    await f.verifyReload()
    paced.push({backend: 'indexeddb', count: 100, kib: 64, active: 10, hz: 60, batches: 120,
      elapsedIncludingCommitMs: round(elapsedMs), finalDrainMs: round(drainMs),
      editMedianMs: round(percentile(service, .5)), editP95Ms: round(percentile(service, .95)),
      startLatenessP95Ms: round(percentile(lateness, .95)), maxPendingScopesAtStart: Math.max(...pendingAtStart),
      batchesOverInterval: service.filter(ms => ms > 1000 / 60).length, reloadVerified: true})
  }
  finally { f.destroy() }
})
await fetch('/__native-result', {method: 'POST', body: JSON.stringify({checks, samples, paced,
  metadata: {userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency,
    timestamp: new Date().toISOString(), repeats: 2, samples: 25, warmups: 5,
    notes: 'Actual DOM/Yjs paths, native IndexedDB. Edit latency includes observer settling; completion also waits for committed storage transactions. Reload checked for every IndexedDB case. Legacy errors include quota failures.'},
})})
channel.port1.close(); channel.port2.close()
