import type {LiveSession, LiveSessionFeedback, LiveSessionLearner, LiveSessionLearnerState, LiveSessionPreviewDependencies, LiveSessionStep} from "./live-session"
import {clearEditorArtifacts} from "./editor-artifacts"
import {serializeDoctype} from "./serialization-primitives"
import {applyPreviewUpdate, validLiveSessionAnswers, validLiveSessionWidgetEvent} from "./live-session-permissions.js"
import {isCssColor} from "./css-color"
import * as Y from "yjs"

/** Portable session data; the authoring DOM remains the document state. */
export type LiveSessionReplay = {
  format: "webwriter-live-replay"
  startedAt: number
  endedAt: number
  sessionId?: string
  title?: string
  baseHTML: string
  previewDependencies?: LiveSessionPreviewDependencies
  learners: LiveSessionLearner[]
  steps: LiveSessionStep[]
  feedback: LiveSessionFeedback[]
}

// The on-disk representation shares widget snapshots and uses short event keys.
// Playback continues to consume ordinary LiveSessionStep objects.
const stepKeys: Record<string, string> = {id: "i", time: "t", learner: "l", kind: "k", cursor: "c", pointer: "p", click: "a", scroll: "s", regions: "r", html: "h", htmlCheckpoint: "q", htmlUpdate: "u", widgets: "w", analytics: "x", answers: "n"}
const longStepKeys = Object.fromEntries(Object.entries(stepKeys).map(([long, short]) => [short, long]))
const maxReplayBytes = 64 * 1024 * 1024
const maxReplayIndexBytes = 8 * 1024 * 1024
const targetChunkCharacters = 8 * 1024 * 1024
const replayMagic = new TextEncoder().encode("WWREPLAY")
type ReplayChunk = {offset: number, length: number, minTime: number, maxTime: number}
type ReplayIndex = {metadata: {offset: number, length: number}, chunks: ReplayChunk[]}
type ReplayValidation = {documents: Map<string, Y.Doc>, ids: Set<string>}
export type ReplayCheckpoint = {states: LiveSessionLearnerState[], documents: Record<string, string>}
export type ReplayWindow = {index: number, checkpoint: ReplayCheckpoint, steps: LiveSessionStep[]}

function encodeCheckpoint(bytes: Uint8Array) {
  let binary = ""
  for(let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(binary)
}

/** Restore Yjs identifiers as well as text, so later incremental updates remain applicable. */
export function restoreReplayCheckpoint(checkpoint: ReplayCheckpoint) {
  const documents = new Map<string, Y.Doc>(), states = new Map<string, LiveSessionLearnerState>()
  try {
    for(const state of checkpoint.states) states.set(state.learner, state)
    for(const [learner, encoded] of Object.entries(checkpoint.documents)) {
      if(typeof encoded !== "string" || !encoded.length || encoded.length > maxReplayBytes
        || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new TypeError("Invalid replay checkpoint")
      const doc = new Y.Doc(); documents.set(learner, doc)
      Y.applyUpdate(doc, Uint8Array.from(atob(encoded), character => character.charCodeAt(0)))
      if(doc.store.pendingStructs || doc.store.pendingDs || [...doc.share.keys()].some(key => key !== "preview")
        || !states.has(learner) || states.get(learner)?.html !== doc.getText("preview").toString()) throw new TypeError("Invalid replay checkpoint")
    }
    return {documents, states}
  }
  catch(error) { documents.forEach(doc => doc.destroy()); throw error }
}

export function advanceCheckpoint(states: Map<string, LiveSessionLearnerState>, documents: Map<string, Y.Doc>, step: LiveSessionStep) {
  if(!step.learner) return
  const previous = states.get(step.learner)
  let html = step.html
  if(step.html !== undefined || step.htmlCheckpoint !== undefined) {
    documents.get(step.learner)?.destroy(); documents.delete(step.learner)
  }
  if(step.htmlCheckpoint !== undefined) {
    const doc = new Y.Doc(); documents.set(step.learner, doc)
    html = applyPreviewUpdate(doc, step.htmlCheckpoint)
  }
  if(step.htmlUpdate !== undefined) {
    const doc = documents.get(step.learner)
    if(!doc) throw new TypeError("Replay document checkpoint is missing")
    html = applyPreviewUpdate(doc, step.htmlUpdate)
  }
  states.set(step.learner, {
    ...(previous ?? {learner: step.learner}), learner: step.learner, time: step.time,
    ...(html !== undefined ? {html} : {}),
    ...(step.cursor !== undefined ? {cursor: step.cursor} : {}),
    ...(step.pointer !== undefined ? {pointer: step.pointer} : {}),
    ...(step.click !== undefined ? {click: step.click, clickStep: step.id} : {}),
    ...(step.scroll !== undefined ? {scroll: step.scroll} : {}),
    ...(step.regions !== undefined ? {regions: step.regions} : {}),
    ...(step.widgets !== undefined ? {widgets: step.widgets} : {}),
  })
}

async function compressReplay(replay: LiveSessionReplay & {checkpoint?: ReplayCheckpoint}): Promise<Blob> {
  const source = serializeLiveSessionReplay(replay)
  const blob = new Blob([source], {type: "application/json;charset=utf-8"})
  if(source.length > maxReplayBytes || blob.size > maxReplayBytes) throw new TypeError("Replay chunk is too large")
  const compressed = await new Response(blob.stream().pipeThrough(new CompressionStream("gzip"))).blob()
  if(compressed.size > maxReplayBytes) throw new TypeError("Replay chunk is too large")
  return compressed
}

/** Incrementally produce compressed chunks and a trailing byte-offset index. */
export class LiveSessionReplayWriter {
  private readonly chunks: ReplayChunk[] = []
  private readonly states = new Map<string, LiveSessionLearnerState>()
  private readonly documents = new Map<string, Y.Doc>()
  private pending: LiveSessionStep[] = []
  private pendingSizes: number[] = []
  private pendingCharacters = 0
  private offset = 0
  private metadataSize = 0
  private closed = false
  private constructor(private readonly replay: LiveSessionReplay, private readonly write: (part: Blob) => Promise<void>) {}

  static async create(replay: LiveSessionReplay, write: (part: Blob) => Promise<void>) {
    if(replay.feedback.length > 200000 || replay.learners.length > 10000) throw new TypeError("Replay file is too large")
    if(typeof CompressionStream === "undefined" || typeof DecompressionStream === "undefined") throw new Error("This browser does not support compressed replay files")
    const writer = new LiveSessionReplayWriter({...replay, steps: []}, write)
    const metadata = await compressReplay(writer.replay)
    const header = new Uint8Array(12); header.set(replayMagic)
    await write(new Blob([header])); await write(metadata)
    writer.metadataSize = metadata.size; writer.offset = metadata.size
    return writer
  }

  async append(steps: readonly LiveSessionStep[]) {
    if(this.closed) throw new Error("Replay writer is closed")
    for(const step of steps) {
      const size = JSON.stringify(step).length
      if(this.pending.length && (this.pending.length >= 1000 || step.time - this.pending[0].time >= 30000
        || this.pendingCharacters + size > targetChunkCharacters)) await this.flush()
      this.pending.push(step); this.pendingSizes.push(size); this.pendingCharacters += size
    }
  }

  private async flush() {
    while(this.pending.length) {
      let end = this.pending.length, steps = this.pending.slice(0, end), compressed: Blob
      const checkpoint: ReplayCheckpoint = {states: [...this.states.values()], documents: Object.fromEntries([...this.documents].map(([learner, doc]) => [learner, encodeCheckpoint(Y.encodeStateAsUpdate(doc))]))}
      while(true) {
        try {
          compressed = await compressReplay({...this.replay, title: undefined, baseHTML: "", previewDependencies: undefined, feedback: [], steps, checkpoint})
          break
        }
        catch(error) {
          if(!(error instanceof TypeError) || error.message !== "Replay chunk is too large" || end <= 1) throw error
          end = Math.floor(end / 2); steps = this.pending.slice(0, end)
        }
      }
      const times = steps.map(step => step.time)
      this.chunks.push({offset: this.offset, length: compressed.size, minTime: Math.min(...times), maxTime: Math.max(...times)})
      steps.forEach(step => advanceCheckpoint(this.states, this.documents, step))
      await this.write(compressed)
      this.offset += compressed.size
      this.pendingCharacters -= this.pendingSizes.slice(0, end).reduce((sum, size) => sum + size, 0)
      this.pending = this.pending.slice(end); this.pendingSizes = this.pendingSizes.slice(end)
    }
  }

  async finish() {
    if(this.closed) throw new Error("Replay writer is closed")
    try {
      await this.flush()
      const index: ReplayIndex = {metadata: {offset: 0, length: this.metadataSize}, chunks: this.chunks}
      const indexBytes = new TextEncoder().encode(JSON.stringify(index))
      if(indexBytes.byteLength > maxReplayIndexBytes) throw new TypeError("Replay index is too large")
      await this.write(new Blob([indexBytes]))
      const footer = new Uint8Array(12)
      new DataView(footer.buffer).setUint32(0, indexBytes.byteLength); footer.set(replayMagic, 4)
      await this.write(new Blob([footer]))
    }
    finally { this.close() }
  }

  close() { this.closed = true; this.pending = []; this.pendingSizes = []; this.pendingCharacters = 0; this.documents.forEach(doc => doc.destroy()); this.documents.clear(); this.states.clear() }
}

export async function writeLiveSessionReplayFile(replay: LiveSessionReplay, write: (part: Blob) => Promise<void>): Promise<void> {
  const writer = await LiveSessionReplayWriter.create(replay, write)
  try { await writer.append(replay.steps); await writer.finish() }
  finally { writer.close() }
}

/** Download fallback for browsers without a writable file picker. */
export async function createLiveSessionReplayFile(replay: LiveSessionReplay): Promise<Blob> {
  const parts: Blob[] = []
  await writeLiveSessionReplayFile(replay, async part => { parts.push(part) })
  return new Blob(parts, {type: "application/octet-stream"})
}

async function decompressReplay(file: Blob): Promise<string> {
  if(file.size > maxReplayBytes) throw new TypeError("Replay chunk is too large")
  if(typeof DecompressionStream === "undefined") throw new Error("This browser cannot open compressed replay files")
  const reader = file.stream().pipeThrough(new DecompressionStream("gzip")).getReader()
  const decoder = new TextDecoder(), chunks: string[] = []
  let size = 0
  try {
    while(true) {
      const {done, value} = await reader.read()
      if(done) break
      size += value.byteLength
      if(size > maxReplayBytes) throw new TypeError("Replay chunk is too large")
      chunks.push(decoder.decode(value, {stream: true}))
    }
    chunks.push(decoder.decode())
  }
  catch(error) {
    await reader.cancel().catch(() => {})
    throw error
  }
  finally { reader.releaseLock() }
  return chunks.join("")
}

/** Read the index and metadata immediately; activity is loaded only as needed. */
export class LiveSessionReplayReader {
  readonly metadata: LiveSessionReplay
  private readonly validation: ReplayValidation = {documents: new Map(), ids: new Set()}
  private next = 0
  private pending: Promise<void> = Promise.resolve()
  private closed = false
  private failure: unknown
  private readonly timeIndex: {time: number, last: number}[]
  private readonly priorMaxTimes: number[]
  private window: ReplayWindow | null = null
  private constructor(private readonly file: Blob, private readonly dataOffset: number, private readonly index: ReplayIndex, metadata: LiveSessionReplay) {
    this.metadata = metadata
    let last = -1
    this.timeIndex = index.chunks.map((chunk, index) => ({time: chunk.minTime, last: index}))
      .sort((a, b) => a.time - b.time)
      .map(entry => ({time: entry.time, last: last = Math.max(last, entry.last)}))
    let maximum = -Infinity
    this.priorMaxTimes = index.chunks.map(chunk => { const prior = maximum; maximum = Math.max(maximum, chunk.maxTime); return prior })
  }

  /** Load the latest checkpoint whose preceding activity is entirely before time. */
  async readAt(time: number): Promise<ReplayWindow> {
    if(this.closed) throw new Error("Replay reader is closed")
    let low = 0, high = this.priorMaxTimes.length
    while(low < high) {
      const middle = Math.floor((low + high) / 2)
      if(this.priorMaxTimes[middle] <= time) low = middle + 1
      else high = middle
    }
    const index = low - 1
    if(index < 0) return {index: -1, checkpoint: {states: [], documents: {}}, steps: []}
    if(this.window?.index === index) return this.window
    const chunk = this.index.chunks[index]
    const source = await decompressReplay(this.file.slice(this.dataOffset + chunk.offset, this.dataOffset + chunk.offset + chunk.length))
    if(this.closed) throw new Error("Replay reader is closed")
    const raw = JSON.parse(source), checkpoint: ReplayCheckpoint = raw?.checkpoint
    if(!checkpoint || !Array.isArray(checkpoint.states) || checkpoint.states.length > this.metadata.learners.length
      || !checkpoint.documents || typeof checkpoint.documents !== "object" || Array.isArray(checkpoint.documents)) throw new TypeError("Invalid replay checkpoint")
    const ids = new Set<string>()
    const synthetic: LiveSessionStep[] = checkpoint.states.map((state, i) => {
      if(!state || typeof state !== "object" || typeof state.learner !== "string" || ids.has(state.learner)
        || state.clickStep !== undefined && (typeof state.clickStep !== "string" || !state.clickStep || state.clickStep.length > 256)) throw new TypeError("Invalid replay checkpoint")
      ids.add(state.learner)
      return {id: `checkpoint-${i}`, kind: "document", learner: state.learner, time: state.time,
        ...(state.html !== undefined ? {html: state.html} : {}), ...(state.cursor !== undefined ? {cursor: state.cursor} : {}),
        ...(state.pointer !== undefined ? {pointer: state.pointer} : {}), ...(state.click !== undefined ? {click: state.click} : {}),
        ...(state.scroll !== undefined ? {scroll: state.scroll} : {}), ...(state.regions !== undefined ? {regions: state.regions} : {}),
        ...(state.widgets !== undefined ? {widgets: state.widgets} : {})}
    })
    parseLiveSessionReplay(serializeLiveSessionReplay({...this.metadata, baseHTML: "", feedback: [], steps: synthetic}))
    const restored = restoreReplayCheckpoint(checkpoint)
    try {
      const replay = parseLiveSessionReplay(source, {documents: restored.documents, ids: new Set()})
      if(replay.baseHTML !== "" || replay.feedback.length || replay.startedAt !== this.metadata.startedAt || replay.endedAt !== this.metadata.endedAt || replay.sessionId !== this.metadata.sessionId
        || JSON.stringify(replay.learners) !== JSON.stringify(this.metadata.learners) || !replay.steps.length || replay.steps.length > 1000
        || replay.steps.some(step => step.time < chunk.minTime || step.time > chunk.maxTime)) throw new TypeError("Invalid replay chunk")
      const window = {index, checkpoint, steps: replay.steps}
      this.window = window
      return window
    }
    finally { restored.documents.forEach(doc => doc.destroy()) }
  }

  static async open(file: Blob) {
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    if(header.length !== 12 || !replayMagic.every((byte, i) => header[i] === byte)) throw new TypeError("Invalid replay file")
    let indexLength = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(8)
    let dataOffset: number, dataEnd: number, indexStart: number
    if(indexLength === 0) {
      const footer = new Uint8Array(await file.slice(-12).arrayBuffer())
      if(footer.length !== 12 || !replayMagic.every((byte, i) => footer[4 + i] === byte)) throw new TypeError("Invalid replay index")
      indexLength = new DataView(footer.buffer, footer.byteOffset, footer.byteLength).getUint32(0)
      indexStart = file.size - 12 - indexLength
      dataOffset = 12; dataEnd = indexStart
    }
    else { indexStart = 12; dataOffset = 12 + indexLength; dataEnd = file.size }
    if(!indexLength || indexLength > maxReplayIndexBytes || indexStart < 12 || dataOffset > dataEnd) throw new TypeError("Invalid replay index")
    const index: ReplayIndex = JSON.parse(await file.slice(indexStart, indexStart + indexLength).text())
    if(!index || !index.metadata || !Array.isArray(index.chunks) || index.chunks.length > 200000) throw new TypeError("Invalid replay index")
    let end = 0
    for(const entry of [index.metadata, ...index.chunks]) {
      if(!entry || !Number.isSafeInteger(entry.offset) || !Number.isSafeInteger(entry.length) || entry.offset !== end
        || entry.length <= 0 || entry.length > maxReplayBytes || entry.length > dataEnd - dataOffset - end) throw new TypeError("Invalid replay index")
      end += entry.length
    }
    if(end !== dataEnd - dataOffset || index.chunks.some(entry => !Number.isFinite(entry.minTime) || !Number.isFinite(entry.maxTime) || entry.minTime > entry.maxTime)) throw new TypeError("Invalid replay index")
    const source = await decompressReplay(file.slice(dataOffset, dataOffset + index.metadata.length))
    const metadata = parseLiveSessionReplay(source)
    if(metadata.steps.length) throw new TypeError("Invalid replay metadata")
    return new LiveSessionReplayReader(file, dataOffset, index, metadata)
  }

  /** Returns newly loaded steps. Earlier chunks are needed to reconstruct document updates. */
  private async readChunk(): Promise<LiveSessionStep[] | null> {
    if(this.closed) throw new Error("Replay reader is closed")
    const chunk = this.index.chunks[this.next]
    if(!chunk) return null
    const source = await decompressReplay(this.file.slice(this.dataOffset + chunk.offset, this.dataOffset + chunk.offset + chunk.length))
    if(this.closed) throw new Error("Replay reader is closed")
    const replay = parseLiveSessionReplay(source, this.validation)
    if(replay.baseHTML !== "" || replay.feedback.length || replay.startedAt !== this.metadata.startedAt || replay.endedAt !== this.metadata.endedAt || replay.sessionId !== this.metadata.sessionId
      || JSON.stringify(replay.learners) !== JSON.stringify(this.metadata.learners) || !replay.steps.length
      || replay.steps.some(step => step.time < chunk.minTime || step.time > chunk.maxTime)) throw new TypeError("Invalid replay chunk")
    this.next++
    return replay.steps
  }

  /** Read and validate one bounded chunk, without accumulating the whole replay. */
  async readNext(): Promise<LiveSessionStep[] | null> {
    const operation = this.pending.then(async () => {
      if(this.failure !== undefined) throw this.failure
      return this.readChunk()
    })
    this.pending = operation.then(() => {}, () => {})
    try { return await operation }
    catch(error) { this.failure = error; this.close(); throw error }
  }

  async readThrough(time: number): Promise<LiveSessionStep[]> {
    if(this.failure !== undefined) throw this.failure
    const added: LiveSessionStep[] = []
    const run = async () => {
      if(this.failure !== undefined) throw this.failure
      let low = 0, high = this.timeIndex.length
      while(low < high) {
        const middle = Math.floor((low + high) / 2)
        if(this.timeIndex[middle].time <= time) low = middle + 1
        else high = middle
      }
      const target = low ? this.timeIndex[low - 1].last : -1
      while(!this.closed && this.next <= target) {
        const steps = await this.readChunk()
        if(!steps) break
        added.push(...steps)
      }
    }
    const operation = this.pending.then(run)
    this.pending = operation.catch(() => {})
    try { await operation; return added }
    catch(error) { this.failure = error; this.close(); throw error }
  }

  close() { this.closed = true; this.window = null; this.validation.documents.forEach(doc => doc.destroy()); this.validation.documents.clear() }
}

export async function readLiveSessionReplayFile(file: Blob): Promise<LiveSessionReplay> {
  const reader = await LiveSessionReplayReader.open(file)
  try { return {...reader.metadata, steps: await reader.readThrough(Infinity)} }
  finally { reader.close() }
}

/** Serialize without repeating identical widget snapshots or participant IDs. */
export function serializeLiveSessionReplay(replay: LiveSessionReplay): string {
  const widgets: unknown[] = [], widgetIds = new Map<string, number>()
  const learnerIds = new Map(replay.learners.map((learner, index) => [learner.id, index]))
  const steps = replay.steps.map(step => {
    const compact: Record<string, unknown> = {}
    for(const [key, value] of Object.entries(step)) {
      if(!Object.hasOwn(stepKeys, key)) continue
      if(key === "learner" && typeof value === "string" && learnerIds.has(value)) compact.l = learnerIds.get(value)
      else if(key === "widgets" && Array.isArray(value)) compact.w = value.map(widget => {
        const serialized = JSON.stringify(widget)
        let index = widgetIds.get(serialized)
        if(index === undefined) {
          if(widgets.length >= 200000) throw new TypeError("Replay file is too large")
          index = widgets.length; widgets.push(widget); widgetIds.set(serialized, index)
        }
        return index
      })
      else compact[stepKeys[key]] = value
    }
    return compact
  })
  return JSON.stringify({...replay, encoding: "compact", widgets, steps})
}

/** Keep the first and last pointer samples in each short interval per learner. */
function samplePointerSteps(steps: LiveSessionStep[]): LiveSessionStep[] {
  const groups = new Map<string, {start: number, last: number}>()
  const discarded = new Set<number>()
  const finish = (group: {last: number}) => { discarded.delete(group.last) }
  steps.forEach((step, index) => {
    if(!step.learner) return
    const group = groups.get(step.learner)
    const pointerOnly = step.kind === "pointer" && step.pointer !== undefined
      && Object.keys(step).every(key => ["id", "time", "learner", "kind", "pointer"].includes(key))
    if(!pointerOnly || !Number.isFinite(step.time)) {
      if(group && (step.pointer !== undefined || step.click !== undefined)) { finish(group); groups.delete(step.learner) }
      return
    }
    if(!group || step.time < group.start || step.time - group.start >= 250) {
      if(group) finish(group)
      groups.set(step.learner, {start: step.time, last: index})
    }
    else { discarded.add(index); group.last = index }
  })
  groups.forEach(finish)
  return steps.filter((_, index) => !discarded.has(index))
}

/** Capture the host's accepted timeline after the session has stopped. */
export function captureLiveSessionReplay(session: LiveSession, startedAt: number, endedAt = Math.max(startedAt, Date.now()), title = ""): LiveSessionReplay {
  if(session.role !== "host" || session.status !== "stopped") throw new Error("Only a concluded host session can be saved")
  return captureLiveSessionSnapshot(session, startedAt, endedAt, title)
}

/** Capture the host's current timeline without stopping an ongoing session. */
export function captureLiveSessionSnapshot(session: LiveSession, startedAt: number, endedAt = Math.max(startedAt, Date.now()), title = ""): LiveSessionReplay {
  if(session.role !== "host") throw new Error("Only a host session can be saved")
  if(!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) throw new TypeError("Invalid session time")
  if(typeof session.baseHTML !== "string") throw new Error("The initial session document is unavailable")
  const previewDependencies = session.previewDependencies
  const steps = samplePointerSteps(session.steps).map(step => ({
    ...step,
    ...(step.html !== undefined ? {html: cleanLiveSessionDocument(step.html)} : {}),
  }))
  return {
    format: "webwriter-live-replay", startedAt, endedAt,
    ...(session.id ? {sessionId: session.id} : {}),
    ...(title ? {title} : {}),
    baseHTML: cleanLiveSessionDocument(session.baseHTML),
    ...(previewDependencies ? {previewDependencies} : {}),
    learners: session.learners, steps, feedback: session.feedback,
  }
}

export function cleanLiveSessionDocument(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html")
  clearEditorArtifacts(doc)
  return `${serializeDoctype(doc.doctype)}${doc.documentElement.outerHTML}`
}

/** Validate an untrusted replay before it reaches the preview or timeline. */
export function parseLiveSessionReplay(source: string, validation?: ReplayValidation): LiveSessionReplay {
  if(source.length > maxReplayBytes) throw new TypeError("Replay file is too large")
  const value: unknown = JSON.parse(source)
  const record = (item: unknown): item is Record<string, any> => Boolean(item) && typeof item === "object" && !Array.isArray(item)
  if(record(value) && value.encoding === "compact" && value.version === undefined) {
    if(value.encoding !== "compact" || !Array.isArray(value.widgets) || !Array.isArray(value.steps) || !Array.isArray(value.learners)
      || value.steps.length > 200000 || value.widgets.length > 200000 || value.learners.length > 10000) throw new TypeError("Invalid replay encoding")
    const widgetTable = value.widgets
    value.steps = value.steps.map((step: unknown) => {
      if(!record(step)) throw new TypeError("Invalid replay activity")
      const expanded: Record<string, unknown> = {}
      for(const [key, item] of Object.entries(step)) {
        if(!Object.hasOwn(longStepKeys, key)) throw new TypeError("Invalid replay activity")
        const name = longStepKeys[key]
        if(Object.hasOwn(expanded, name)) throw new TypeError("Invalid replay activity")
        if(key === "l") {
          if(!Number.isSafeInteger(item) || (item as number) < 0 || (item as number) >= value.learners.length || !record(value.learners[item as number])) throw new TypeError("Invalid replay participant reference")
          expanded.learner = value.learners[item as number].id
        }
        else if(key === "w") {
          if(!Array.isArray(item) || !item.every(index => Number.isSafeInteger(index) && index >= 0 && index < widgetTable.length)) throw new TypeError("Invalid replay widget reference")
          expanded.widgets = item.map(index => widgetTable[index])
        }
        else expanded[name] = item
      }
      return expanded
    })
    delete value.encoding
    delete value.widgets
  }
  else throw new TypeError("Invalid or unsupported replay file")
  const finite = (item: unknown): item is number => typeof item === "number" && Number.isFinite(item)
  const time = (item: unknown): item is number => finite(item) && Math.abs(item) <= 8.64e15
  const point = (item: unknown) => record(item) && finite(item.x) && finite(item.y)
  if(!record(value) || value.format !== "webwriter-live-replay"
    || !time(value.startedAt) || !time(value.endedAt) || value.endedAt < value.startedAt
    || typeof value.baseHTML !== "string"
    || value.sessionId !== undefined && (typeof value.sessionId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.sessionId))
    || value.title !== undefined && typeof value.title !== "string"
    || !Array.isArray(value.learners) || value.learners.length > 10000
    || !Array.isArray(value.steps) || value.steps.length > 200000
    || !Array.isArray(value.feedback) || value.feedback.length > 200000) throw new TypeError("Invalid or unsupported replay file")
  const learners = new Set<string>()
  for(const learner of value.learners) {
    if(!record(learner) || typeof learner.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(learner.id)
      || learners.has(learner.id) || typeof learner.name !== "string" || learner.name.length > 200
      || !(isCssColor(learner.color) || typeof document === "undefined" && typeof learner.color === "string" && /^[a-z]{1,64}$/i.test(learner.color))
      || !time(learner.firstSeen) || !time(learner.lastSeen) || typeof learner.connected !== "boolean") throw new TypeError("Invalid replay participant")
    learners.add(learner.id)
  }
  const documents = validation?.documents ?? new Map<string, Y.Doc>(), ids = validation?.ids ?? new Set<string>()
  try {
    for(const step of value.steps) {
      if(!record(step) || typeof step.id !== "string" || !step.id || step.id.length > 256 || ids.has(step.id)
        || !time(step.time) || !["document", "cursor", "pointer", "click", "scroll", "widget", "submission"].includes(step.kind)
        || step.learner !== undefined && (typeof step.learner !== "string" || !learners.has(step.learner))
        || step.html !== undefined && typeof step.html !== "string"
        || step.analytics !== undefined && (step.kind !== "widget" || !validLiveSessionWidgetEvent(step.analytics))
        || (step.kind === "submission" ? !step.learner || !validLiveSessionAnswers(step.answers) : step.answers !== undefined)
        || step.cursor !== undefined && !point(step.cursor) || step.pointer !== undefined && !point(step.pointer)
        || step.click !== undefined && !point(step.click)
        || step.scroll !== undefined && (!record(step.scroll) || !finite(step.scroll.top)
          || ["left", "height", "viewport"].some(key => step.scroll[key] !== undefined && !finite(step.scroll[key])))
        || step.regions !== undefined && (!Array.isArray(step.regions) || !step.regions.every((region: unknown) => point(region) && finite((region as any).width) && finite((region as any).height)))
        || step.widgets !== undefined && (!Array.isArray(step.widgets) || !step.widgets.every((widget: unknown) => record(widget)
          && (widget.id === undefined || typeof widget.id === "string")
          && (widget.path === undefined || Array.isArray(widget.path) && widget.path.every((n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0))
          && (widget.html === undefined || typeof widget.html === "string")
          && (widget.data === undefined || record(widget.data) && ["ready", "pending", "error"].includes(widget.data.status)
            && ["json", "xml"].includes(widget.data.format) && ["local", "individual", "all", "group"].includes(widget.data.mode)
            && (widget.data.text === undefined || typeof widget.data.text === "string")
            && (widget.data.scopeId === undefined || typeof widget.data.scopeId === "string"))))) throw new TypeError("Invalid replay activity")
      ids.add(step.id)
      if(step.htmlCheckpoint !== undefined || step.htmlUpdate !== undefined) {
        if(step.kind !== "document" || !step.learner || step.html !== undefined
          || step.htmlCheckpoint !== undefined && step.htmlUpdate !== undefined) throw new TypeError("Invalid replay document update")
        if(step.htmlCheckpoint !== undefined) {
          documents.get(step.learner)?.destroy()
          const doc = new Y.Doc(); documents.set(step.learner, doc)
          applyPreviewUpdate(doc, step.htmlCheckpoint)
        }
        else {
          const doc = documents.get(step.learner)
          if(!doc) throw new TypeError("Replay document checkpoint is missing")
          applyPreviewUpdate(doc, step.htmlUpdate)
        }
      }
      else if(step.html !== undefined && step.learner) { documents.get(step.learner)?.destroy(); documents.delete(step.learner) }
    }
  }
  finally { if(!validation) documents.forEach(doc => doc.destroy()) }
  if(!value.feedback.every((message: unknown) => record(message) && typeof message.id === "string" && message.id.length > 0
    && typeof message.participant === "string" && learners.has(message.participant) && typeof message.text === "string" && time(message.time))) throw new TypeError("Invalid replay feedback")
  return value as LiveSessionReplay
}
