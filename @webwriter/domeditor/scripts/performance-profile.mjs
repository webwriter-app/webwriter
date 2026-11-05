import {spawn} from 'node:child_process'
import {createHash, randomUUID} from 'node:crypto'
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises'
import {createServer as createNetServer} from 'node:net'
import {tmpdir, cpus, platform, release} from 'node:os'
import {basename, join, resolve} from 'node:path'
import {build, createServer, preview} from 'vite'
import WebSocket from 'ws'

// CDP is provided by Chrome itself; ws is already a project dependency.
// All servers and the debugging endpoint are loopback-only, in a fresh profile.
// Profile a saved canvas in the full editor (including its installed widgets):
// node scripts/performance-profile.mjs --production --only=gestures --document=/path/to/sample.html
// Add --target='body > webwriter-map' to choose an item, --gesture='canvas move'
// to isolate an operation, --burst=4 to send four mouse positions per frame, or
// --profile to collect diagnostic CPU/timeline traces.
const production = process.argv.includes('--production')
const profiling = process.argv.includes('--profile')
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7)
if(only && !['live', 'reconciliation', 'tables', 'layouts', 'gestures'].includes(only)) throw new Error('--only must be live, reconciliation, tables, layouts or gestures')
const gestureFilters = process.argv.filter(arg => arg.startsWith('--gesture=')).map(arg => arg.slice(10))
const burstArgument = process.argv.find(arg => arg.startsWith('--burst='))?.slice(8)
const burst = burstArgument === undefined ? 1 : Number(burstArgument)
if(burstArgument !== undefined && (!/^\d+$/.test(burstArgument) || burst < 1 || burst > 16)) throw new Error('--burst must be an integer from 1 to 16')
if(burstArgument !== undefined && only !== 'gestures') throw new Error('--burst requires --only=gestures')
const gestureToken = only === 'gestures' ? randomUUID() : null
const documentPath = process.argv.find(arg => arg.startsWith('--document='))?.slice(11)
const target = process.argv.find(arg => arg.startsWith('--target='))?.slice(9)
if((documentPath || target) && only !== 'gestures') throw new Error('--document and --target require --only=gestures')
if(target && !documentPath) throw new Error('--target requires --document')
const documentSource = documentPath ? await readFile(resolve(documentPath), 'utf8') : null
const documentDetails = documentSource === null ? null : {name: basename(documentPath), bytes: Buffer.byteLength(documentSource),
  sha256: createHash('sha256').update(documentSource).digest('hex'), target: target ?? 'body > figure'}
const output = resolve(process.argv.find(arg => arg.startsWith('--output='))?.slice(9) ?? '.cache/performance/profile')
await mkdir(output, {recursive: true})
const temporary = await mkdtemp(join(tmpdir(), 'domeditor-profiler-'))
const messages = [], pending = new Map(), listeners = new Map()
let socket, browser, server, id = 0, active, sessionId, timer, resolveResult
const resultPromise = new Promise(resolve => { resolveResult = resolve })
const on = (name, callback) => {
  const callbacks = listeners.get(name) ?? new Set(); callbacks.add(callback); listeners.set(name, callbacks)
  return () => callbacks.delete(callback)
}
const once = name => new Promise(resolve => { const off = on(name, event => { off(); resolve(event) }) })
function call(method, params = {}, target = sessionId, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const requestId = ++id
    const timeout = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP timeout: ${method}`)) }, timeoutMs)
    pending.set(requestId, {resolve: value => { clearTimeout(timeout); resolve(value) }, reject: error => { clearTimeout(timeout); reject(error) }})
    socket.send(JSON.stringify({id: requestId, method, params, ...(target ? {sessionId: target} : {})}))
  })
}
function summarize(profile) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node])), parents = new Map()
  for(const node of profile.nodes) for(const child of node.children ?? []) parents.set(child, node.id)
  const self = new Map(), inclusive = new Map()
  const key = node => JSON.stringify(node.callFrame)
  let idle = 0, gc = 0, total = 0
  for(let i = 0; i < (profile.samples?.length ?? 0); i++) {
    const node = nodes.get(profile.samples[i]), ms = (profile.timeDeltas?.[i] ?? 0) / 1000
    total += ms
    if(['(idle)', '(program)', '(root)'].includes(node.callFrame.functionName)) idle += ms
    if(node.callFrame.functionName === '(garbage collector)') gc += ms
    self.set(key(node), (self.get(key(node)) ?? 0) + ms)
    const seen = new Set()
    for(let current = node; current; current = nodes.get(parents.get(current.id))) {
      const identity = key(current)
      if(seen.has(identity)) continue
      seen.add(identity); inclusive.set(identity, (inclusive.get(identity) ?? 0) + ms)
    }
  }
  const top = map => [...map.entries()].map(([frame, ms]) => ({...JSON.parse(frame), ms: +ms.toFixed(3)}))
    .filter(frame => !['(root)', '(idle)', '(program)'].includes(frame.functionName)).sort((a, b) => b.ms - a.ms).slice(0, 30)
  return {durationMs: (profile.endTime - profile.startTime) / 1000, sampledMs: +total.toFixed(3),
    activeSampledMs: +(total - idle).toFixed(3), gcMs: +gc.toFixed(3), self: top(self), inclusive: top(inclusive)}
}
async function counters() {
  const [performance, dom] = await Promise.all([call('Performance.getMetrics'), call('Memory.getDOMCounters')])
  return {metrics: Object.fromEntries(performance.metrics.map(({name, value}) => [name, value])), dom}
}
const profiles = []
let frameTarget, frameSession, dragData, dragEntered
on('Input.dragIntercepted', ({data}) => { dragData = data })
async function gestureMouse(mouse, nativeDrag) {
  const session = nativeDrag ? sessionId : frameSession
  // Let Chrome initiate the drag, then use its captured transfer to route
  // trusted drag events into the out-of-process editing frame.
  if(nativeDrag && mouse.type === 'mousePressed') {
    dragData = undefined
    dragEntered = false
    await call('Input.setInterceptDrags', {enabled: true}, session)
  }
  if(!nativeDrag || !dragData) {
    try { await call('Input.dispatchMouseEvent', mouse, session, 20000) }
    finally {
      if(nativeDrag && mouse.type === 'mouseReleased') await call('Input.setInterceptDrags', {enabled: false}, session)
    }
    return
  }
  const {x, y} = mouse
  const dispatch = type => call('Input.dispatchDragEvent', {type, x, y, data: dragData}, session, 20000)
  if(!dragEntered) { await dispatch('dragEnter'); dragEntered = true }
  if(mouse.type === 'mouseReleased') {
    try { await dispatch('drop') }
    finally {
      dragData = undefined
      await call('Input.setInterceptDrags', {enabled: false}, session)
    }
  }
  else await dispatch('dragOver')
}

async function evaluateFrame(expression, revision) {
  if(Number.isInteger(revision)) {
    const {targetInfos} = await call('Target.getTargets', {}, null)
    const target = targetInfos.find(info => {
      if(info.type !== 'iframe') return false
      const url = new URL(info.url || 'about:blank')
      return url.pathname.endsWith('/frame-shell.html') && url.searchParams.get('revision') === String(revision)
    })
    if(!target) return {unavailable: true}
    if(frameTarget !== target.targetId) {
      frameSession = (await call('Target.attachToTarget', {targetId: target.targetId, flatten: true}, null)).sessionId
      frameTarget = target.targetId
    }
  }
  const {result, exceptionDetails} = await call('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}, frameSession, 20000)
  if(exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
  return result.value
}

function gestureTimeline(trace) {
  const {traceEvents} = JSON.parse(trace)
  const mainThreads = new Set(traceEvents.filter(event => event.name === 'thread_name' && event.args?.name === 'CrRendererMain')
    .map(event => `${event.pid}:${event.tid}`))
  const work = traceEvents.filter(event => event.ph === 'X' && mainThreads.has(`${event.pid}:${event.tid}`)
    && ['Layout', 'UpdateLayoutTree', 'Paint', 'EventDispatch', 'FireAnimationFrame', 'FunctionCall'].includes(event.name))
  const input = work.filter(event => event.name === 'EventDispatch' && /^(pointer|mouse|drag|drop)/.test(event.args?.data?.type ?? ''))
  const intervals = new Map(), phases = {}
  for(const mark of traceEvents.filter(event => event.cat?.includes('blink.user_timing') && event.name.startsWith('gesture:')).sort((a, b) => a.ts - b.ts)) {
    const [, phase, boundary] = mark.name.split(':')
    if(boundary === 'start') { intervals.set(phase, mark.ts); continue }
    const start = intervals.get(phase)
    if(start === undefined) continue
    intervals.delete(phase)
    const totals = phases[phase] ??= {samples: 0, elapsedMs: 0, events: {}}
    totals.samples++
    totals.elapsedMs += (mark.ts - start) / 1000
    for(const event of work) {
      if(event.ts < start || event.ts >= mark.ts) continue
      const name = event.name === 'EventDispatch' ? event.args?.data?.type ?? event.name : event.name
      const entry = totals.events[name] ??= {count: 0, ms: 0, withinInput: {count: 0, ms: 0}}
      entry.count++
      entry.ms += event.dur / 1000
      if(['Layout', 'UpdateLayoutTree'].includes(name) && input.some(parent => parent.pid === event.pid && parent.tid === event.tid
        && parent.ts <= event.ts && parent.ts + parent.dur >= event.ts + event.dur)) {
        entry.withinInput.count++
        entry.withinInput.ms += event.dur / 1000
      }
    }
  }
  return phases
}

async function startProfile(details) {
  if(active) throw new Error('Profiling stages overlap')
  const {name} = details
  const stem = `${String(profiles.length + 1).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
  active = {...details, stem, before: await counters()}
  if(name === 'live native typing' || only === 'gestures') {
    const {data} = await call('Page.captureScreenshot', {captureBeyondViewport: false})
    await writeFile(join(output, stem + '.png'), Buffer.from(data, 'base64'))
  }
  if(only === 'gestures') {
    active.frameSession = frameSession
    await call('Profiler.enable', {}, frameSession)
    await call('Profiler.setSamplingInterval', {interval: 1000}, frameSession)
    await call('Profiler.start', {}, frameSession)
  }
  await call('Profiler.start')
  await call('Tracing.start', {categories: 'devtools.timeline,blink.user_timing,v8,disabled-by-default-v8.gc,disabled-by-default-devtools.timeline', transferMode: 'ReturnAsStream'}, null)
}
async function stopProfile() {
  if(!active) throw new Error('No profiling stage is active')
  const [{profile}, after, frame] = await Promise.all([call('Profiler.stop'), counters(),
    active.frameSession ? call('Profiler.stop', {}, active.frameSession) : null])
  const complete = once('Tracing.tracingComplete')
  await call('Tracing.end', {}, null)
  const {stream} = await complete
  let trace = ''
  while(true) {
    const chunk = await call('IO.read', {handle: stream}, null)
    trace += chunk.base64Encoded ? Buffer.from(chunk.data, 'base64').toString() : chunk.data
    if(chunk.eof) break
  }
  await call('IO.close', {handle: stream}, null)
  await writeFile(join(output, active.stem + '.cpuprofile'), JSON.stringify(profile))
  await writeFile(join(output, active.stem + '.trace.json'), trace)
  if(frame) await writeFile(join(output, active.stem + '.frame.cpuprofile'), JSON.stringify(frame.profile))
  profiles.push({...active, after, ...summarize(profile), ...(frame ? {frameCPU: summarize(frame.profile), timeline: gestureTimeline(trace)} : {})})
  active = undefined
  await writeFile(join(output, 'profile-summary.json'), JSON.stringify(profiles, null, 2))
}

const handler = async (request, response, next) => {
  if(request.url === '/__gesture-document' && documentSource !== null) {
    if(request.method !== 'GET' || request.headers['x-gesture-token'] !== gestureToken) { response.writeHead(403).end(); return }
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({html: documentSource, ...documentDetails}))
    return
  }
  const gesture = only === 'gestures' && request.url === '/__native-gesture'
  if(request.method !== 'POST' || !gesture && !['/__native-result', '/__native-progress', '/__native-profile/start', '/__native-profile/stop'].includes(request.url)) return next()
  if(gesture && request.headers['x-gesture-token'] !== gestureToken) { response.writeHead(403).end(); return }
  try {
    const chunks = []
    for await(const chunk of request) chunks.push(chunk)
    const body = Buffer.concat(chunks).toString()
    if(gesture) {
      const {expression, revision, mouse, nativeDrag} = JSON.parse(body)
      if(typeof expression === 'string') response.end(JSON.stringify(await evaluateFrame(expression, revision) ?? null))
      else if(Array.isArray(mouse)) {
        if(nativeDrag) throw new Error('Native drag does not support mouse bursts')
        await Promise.all(mouse.map(event => gestureMouse(event, nativeDrag)))
        response.end('null')
      }
      else if(mouse) { await gestureMouse(mouse, nativeDrag); response.end('null') }
      else throw new Error('Missing gesture command')
      return
    }
    if(request.url === '/__native-progress') process.stdout.write(body + '\n')
    else if(request.url === '/__native-result') resolveResult(JSON.parse(body))
    else if(request.url.endsWith('/start')) await startProfile(JSON.parse(body))
    else await stopProfile()
    response.end('ok')
  }
  catch(error) { response.statusCode = 500; response.end(String(error)); if(!gesture) resolveResult({error: String(error)}) }
}
const plugin = {name: 'performance-profile-results', configureServer(vite) { vite.middlewares.use(handler) }, configurePreviewServer(vite) { vite.middlewares.use(handler) }}

try {
  const port = await new Promise((resolve, reject) => {
    const probe = createNetServer().once('error', reject).listen(0, '127.0.0.1', () => {
      const port = probe.address().port
      probe.close(error => error ? reject(error) : resolve(port))
    })
  })
  if(production) {
    await build({logLevel: 'warn', publicDir: false, plugins: [{name: 'profiling-entrypoints', configResolved(config) {
      config.build.rollupOptions.input = {...config.build.rollupOptions.input,
        profile: resolve('tests/performance-profile.html'), frame: resolve('tests/performance-profile-frame.html')}
    }}], build: {outDir: join(output, 'build'), sourcemap: true}})
    server = await preview({plugins: [plugin], build: {outDir: join(output, 'build')}, preview: {host: '127.0.0.1', port, strictPort: true}})
  }
  else {
    server = await createServer({plugins: [plugin], logLevel: 'warn', server: {host: '127.0.0.1', port, strictPort: true, hmr: false, watch: null}})
    await server.listen()
  }
  const chrome = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  let resolveEndpoint, rejectEndpoint
  const endpoint = new Promise((resolve, reject) => { resolveEndpoint = resolve; rejectEndpoint = reject })
  browser = spawn(chrome, ['--headless=new', '--no-first-run', '--disable-popup-blocking', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--window-size=1920,1080', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    `--user-data-dir=${temporary}`, 'about:blank'], {stdio: ['ignore', 'ignore', 'pipe']})
  browser.once('error', rejectEndpoint)
  browser.once('close', code => { rejectEndpoint(new Error(`Chrome exited: ${code}`)); resolveResult({error: `Chrome exited: ${code}`}) })
  browser.stderr.on('data', chunk => {
    const match = chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/)
    if(match) resolveEndpoint(match[1])
    messages.push(chunk.toString())
  })
  socket = new WebSocket(await endpoint)
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
  socket.on('message', data => {
    const message = JSON.parse(data.toString())
    if(message.id) {
      const request = pending.get(message.id); pending.delete(message.id)
      if(message.error) request?.reject(new Error(JSON.stringify(message.error)))
      else request?.resolve(message.result)
    }
    else for(const listener of listeners.get(message.method) ?? []) listener(message.params)
  })
  socket.on('close', () => {
    for(const request of pending.values()) request.reject(new Error('Chrome debugging connection closed'))
    pending.clear()
  })
  const version = await call('Browser.getVersion', {}, null)
  const {targetId} = await call('Target.createTarget', {url: 'about:blank'}, null)
  sessionId = (await call('Target.attachToTarget', {targetId, flatten: true}, null)).sessionId
  await Promise.all([call('Page.enable'), call('Runtime.enable'), call('Performance.enable'), call('Profiler.enable')])
  await call('Profiler.setSamplingInterval', {interval: 1000})
  const exceptions = []
  on('Runtime.exceptionThrown', event => {
    exceptions.push(event.exceptionDetails)
    resolveResult({error: event.exceptionDetails.text, checks: []})
  })
  const before = await counters()
  const deadline = new Promise(resolve => { timer = setTimeout(() => resolve({error: 'Performance suite timed out after 10 minutes'}), 600000) })
  const parameters = new URLSearchParams()
  if(profiling) parameters.set('profile', '')
  if(only) parameters.set('only', only)
  if(burstArgument !== undefined) parameters.set('burst', String(burst))
  if(documentSource !== null) parameters.set('document', '')
  for(const filter of gestureFilters) parameters.append('gesture', filter)
  await call('Page.navigate', {url: `http://127.0.0.1:${port}/tests/performance-profile.html?${parameters}${gestureToken ? '#' + gestureToken : ''}`})
  const result = await Promise.race([resultPromise, deadline])
  clearTimeout(timer)
  await call('HeapProfiler.collectGarbage')
  const after = await counters()
  const report = {...result, ...(documentDetails ? {document: documentDetails} : {}), environment: {production, profiling, version, cpu: cpus()[0]?.model, logicalCores: cpus().length,
    os: `${platform()} ${release()}`, before, after}, exceptions}
  await writeFile(join(output, 'results.json'), JSON.stringify(report, null, 2))
  await writeFile(join(output, 'chrome.stderr.log'), messages.join(''))
  if(result.error || exceptions.length) throw new Error(result.error ?? `${exceptions.length} unhandled browser exceptions`)
  const expected = (!only || only === 'reconciliation' ? profiling ? 16 : 62 : 0)
    + (!only || only === 'live' ? profiling ? 7 : 21 : 0) + (!only || only === 'tables' ? profiling ? 7 : 14 : 0)
    + (only === 'layouts' ? profiling ? 18 : 36 : 0) + (only === 'gestures' ? new Set(gestureFilters).size || (documentSource !== null ? 3 : 19) : 0)
  if(result.checks?.length !== expected) throw new Error(`Expected ${expected} measurements, received ${result.checks?.length}`)
  process.stdout.write(`Saved ${result.checks.length} measurements and ${profiles.length} CPU/timeline profiles to ${output}\n`)
}
catch(error) { console.error(error); process.exitCode = 1 }
finally {
  clearTimeout(timer)
  if(socket?.readyState === WebSocket.OPEN) {
    try { await call('Browser.close', {}, null) } catch {}
    socket.close()
  }
  if(browser && browser.exitCode === null) {
    browser.kill('SIGTERM')
    await Promise.race([new Promise(resolve => browser.once('close', resolve)), new Promise(resolve => setTimeout(resolve, 1000))])
    if(browser.exitCode === null) browser.kill('SIGKILL')
  }
  if(server?.close) await server.close()
  else if(server?.httpServer) await new Promise(resolve => server.httpServer.close(resolve))
  // The documentation plugin emits example tests too. Do not leave those
  // generated copies available to a subsequent repository test discovery.
  if(production) await rm(join(output, 'build/docs'), {recursive: true, force: true})
  await rm(temporary, {recursive: true, force: true, maxRetries: 4, retryDelay: 300})
}
