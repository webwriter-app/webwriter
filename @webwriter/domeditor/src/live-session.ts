import * as Y from "yjs"
import {Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates} from "y-protocols/awareness"
import {WebsocketProvider} from "y-websocket"

export type LiveSessionRole = "host" | "learner"
export type LiveSessionStepKind = "document" | "cursor" | "pointer" | "click" | "scroll" | "widget"

export type LiveSessionLearner = {
  id: string
  name: string
  color: string
  firstSeen: number
  lastSeen: number
  connected: boolean
}

export type LiveSessionPoint = {x: number, y: number}
export type LiveSessionClick = LiveSessionPoint & {button?: number}
export type LiveSessionScroll = {top: number, left?: number, height?: number, viewport?: number}
export type LiveSessionRegion = {
  id?: string
  path?: number[]
  x: number
  y: number
  width: number
  height: number
}

export type LiveSessionWidgetState = {
  id?: string
  path?: number[]
  html?: string
  state?: unknown
}

export type LiveSessionStep = {
  id: string
  time: number
  learner?: string
  kind: LiveSessionStepKind
  cursor?: LiveSessionPoint
  pointer?: LiveSessionPoint
  click?: LiveSessionClick
  scroll?: LiveSessionScroll
  regions?: LiveSessionRegion[]
  html?: string
  widgets?: LiveSessionWidgetState[]
}

export type LiveSessionStepInput = Omit<LiveSessionStep, "id" | "time" | "learner"> & {learner?: string}

export type LiveSessionLearnerState = {
  learner: string
  time: number
  html?: string
  cursor?: LiveSessionPoint
  pointer?: LiveSessionPoint
  click?: LiveSessionClick
  clickStep?: string
  scroll?: LiveSessionScroll
  regions?: LiveSessionRegion[]
  widgets?: LiveSessionWidgetState[]
}

export type LiveSessionStatus = "connecting" | "connected" | "stopped"
export type LiveSessionStepDelta = {
  index: number
  deleteCount: number
  steps: LiveSessionStep[]
}
export type LiveSessionChange = {stepDeltas: LiveSessionStepDelta[]}
export type LiveSessionChangeListener = (session: LiveSession, change: LiveSessionChange) => void

type LiveSessionOptions = {
  id: string
  role: LiveSessionRole
  baseHTML?: string
  serverUrl?: string
  /** Capability shared only through the host's learner link. */
  token?: string
  learner?: Pick<LiveSessionLearner, "id" | "name" | "color">
}

type AwarenessState = {
  liveSession?: {
    role: LiveSessionRole
    learner?: Pick<LiveSessionLearner, "id" | "name" | "color">
  }
}

type BroadcastMessage = {
  type: "sync-request" | "sync" | "update" | "awareness"
  session: string
  sender: string
  token?: string
  update?: number[]
  awareness?: number[]
}

const META = "live-session-meta"
const LEARNERS = "live-session-learners"
const STEPS = "live-session-steps"
const STATES = "live-session-states"
const transportSessions = new Map<string, Set<LiveSession>>()
const sessionIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/
const learnerIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

const isLearnerIdentity = (value: unknown): value is Pick<LiveSessionLearner, "id" | "name" | "color"> => {
  if(!value || typeof value !== "object") return false
  const learner = value as Partial<LiveSessionLearner>
  return typeof learner.id === "string" && learnerIdPattern.test(learner.id)
    && typeof learner.name === "string" && learner.name.length <= 200
    && typeof learner.color === "string" && learner.color.length <= 64
}

const clone = <T>(value: T): T => {
  if(value === undefined || value === null) return value
  return JSON.parse(JSON.stringify(value)) as T
}

const identifier = (prefix: string) => globalThis.crypto?.randomUUID?.()
  ?? `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

/**
 * Durable session timeline and learner registry. The Y.Doc owned here is a
 * session log, not a second representation of the authored editor DOM.
 */
export class LiveSession {
  readonly id: string
  readonly role: LiveSessionRole
  readonly doc: Y.Doc
  readonly awareness: Awareness

  readonly #meta: Y.Map<unknown>
  readonly #learnerMap: Y.Map<LiveSessionLearner>
  readonly #stepArray: Y.Array<LiveSessionStep>
  readonly #stateMap: Y.Map<LiveSessionLearnerState>
  readonly #transportOrigin = {}
  readonly #transportId = identifier("transport")
  readonly #listeners = new Set<LiveSessionChangeListener>()
  readonly #clientLearners = new Map<number, string>()
  readonly #channel?: BroadcastChannel
  readonly #provider?: WebsocketProvider
  readonly #learner?: Pick<LiveSessionLearner, "id" | "name" | "color">
  readonly #token?: string
  readonly #pendingStepDeltas: LiveSessionStepDelta[] = []
  #status: LiveSessionStatus
  #destroyed = false
  #notifyQueued = false

  constructor(options: LiveSessionOptions) {
    if(!sessionIdPattern.test(options.id)) throw new TypeError("A live session needs a safe id")
    this.id = options.id
    this.role = options.role
    if(options.token !== undefined && !/^[A-Za-z0-9_-]{24,256}$/.test(options.token)) {
      throw new TypeError("A live session token is invalid")
    }
    if(options.serverUrl && !options.token) {
      throw new TypeError("A server-backed live session requires a bearer token")
    }
    this.#token = options.token
    this.#status = options.serverUrl ? "connecting" : "connected"
    this.doc = new Y.Doc()
    this.awareness = new Awareness(this.doc as any)
    this.#meta = this.doc.getMap(META)
    this.#learnerMap = this.doc.getMap(LEARNERS)
    this.#stepArray = this.doc.getArray(STEPS)
    this.#stateMap = this.doc.getMap(STATES)

    if(options.baseHTML !== undefined && this.#meta.get("baseHTML") === undefined) {
      this.#meta.set("baseHTML", options.baseHTML)
    }
    if(this.role === "host" && this.#meta.get("status") === undefined) {
      this.#meta.set("status", "connected")
    }

    if(this.role === "learner") {
      const learner = options.learner ?? {
        id: identifier("learner"),
        name: "Learner",
        color: "#2563eb",
      }
      if(!isLearnerIdentity(learner)) throw new TypeError("A learner identity is invalid")
      this.#learner = {id: learner.id, name: learner.name, color: learner.color}
      this.#upsertLearner(this.#learner, true)
      this.awareness.setLocalStateField("liveSession", {role: this.role, learner: this.#learner})
    }
    else this.awareness.setLocalStateField("liveSession", {role: this.role})

    this.doc.on("update", this.#handleUpdate)
    this.#stepArray.observe(this.#handleStepChange)
    this.#learnerMap.observe(this.#handleCollectionChange)
    this.#stateMap.observe(this.#handleCollectionChange)
    this.#meta.observe(this.#handleCollectionChange)
    this.awareness.on("change", this.#handleAwarenessChange)

    if(options.serverUrl) {
      this.#provider = new WebsocketProvider(options.serverUrl, `live-session-${this.id}`, this.doc as any, {
        awareness: this.awareness,
        ...(this.#token ? {params: {token: this.#token, role: this.role}} : {}),
      })
      this.#provider.on("status", ({status}: {status: string}) => {
        this.#status = status === "connected" ? "connected" : "connecting"
        this.#notify()
      })
    }
    else {
      const peers = transportSessions.get(this.id) ?? new Set<LiveSession>()
      const compatiblePeers = [...peers].filter(peer => peer.#token === this.#token)
      const source = compatiblePeers.find(peer => peer.role === "host") ?? compatiblePeers[0]
      const sourceStateVector = source ? Y.encodeStateVector(source.doc) : new Uint8Array()
      if(source) source.#sendSync(this)
      peers.add(this)
      transportSessions.set(this.id, peers)
      if(typeof BroadcastChannel !== "undefined") {
        this.#channel = new BroadcastChannel(`webwriter-live-session:${this.id}`)
        this.#channel.addEventListener("message", this.#handleBroadcast)
        this.#channel.postMessage({
          type: "sync-request",
          session: this.id,
          sender: this.#transportId,
          ...(this.#token ? {token: this.#token} : {}),
        } satisfies BroadcastMessage)
      }
      const joiningUpdate = source
        ? Y.encodeStateAsUpdate(this.doc, sourceStateVector)
        : Y.encodeStateAsUpdate(this.doc)
      this.#broadcastUpdate(joiningUpdate)
      this.#broadcastAwareness([this.awareness.clientID])
    }
  }

  get baseHTML() {
    const html = this.#meta.get("baseHTML")
    return typeof html === "string" ? html : undefined
  }

  get learners() {
    return [...this.#learnerMap.values()]
      .filter(learner => isLearnerIdentity(learner)
        && typeof learner.firstSeen === "number" && Number.isFinite(learner.firstSeen)
        && typeof learner.lastSeen === "number" && Number.isFinite(learner.lastSeen)
        && typeof learner.connected === "boolean")
      .map(learner => clone(learner))
      .sort((a, b) => a.firstSeen - b.firstSeen || a.id.localeCompare(b.id))
  }

  get steps() {
    return this.#stepArray.toArray().map(step => clone(step))
  }

  get states() {
    return [...this.#stateMap.values()]
      .filter(state => state && typeof state.learner === "string")
      .map(state => clone(state)).sort((a, b) => a.learner.localeCompare(b.learner))
  }

  get status() {
    return this.#meta.get("status") === "stopped" ? "stopped" : this.#status
  }

  onChange(listener: LiveSessionChangeListener) {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  publish(input: LiveSessionStepInput) {
    if(this.#destroyed || this.status === "stopped") throw new Error("The live session is stopped")
    const learner = this.role === "learner" ? this.#learner?.id : input.learner
    const step: LiveSessionStep = {
      ...clone(input),
      id: identifier("step"),
      time: Date.now(),
      ...(learner ? {learner} : {}),
    }
    this.doc.transact(() => {
      this.#stepArray.push([step])
      if(learner) {
        const previous = this.#stateMap.get(learner)
        const state: LiveSessionLearnerState = {
          ...(previous ? clone(previous) : {learner}),
          learner,
          time: step.time,
          ...(step.html !== undefined ? {html: step.html} : {}),
          ...(step.cursor !== undefined ? {cursor: clone(step.cursor)} : {}),
          ...(step.pointer !== undefined ? {pointer: clone(step.pointer)} : {}),
          ...(step.click !== undefined ? {click: clone(step.click), clickStep: step.id} : {}),
          ...(step.scroll !== undefined ? {scroll: clone(step.scroll)} : {}),
          ...(step.regions !== undefined ? {regions: clone(step.regions)} : {}),
          ...(step.widgets !== undefined ? {widgets: clone(step.widgets)} : {}),
        }
        this.#stateMap.set(learner, state)
      }
    })
    return clone(step)
  }

  stop() {
    if(this.#status === "stopped") return
    this.doc.transact(() => {
      if(this.role === "host" && this.#meta.get("status") !== "stopped") this.#meta.set("status", "stopped")
      if(this.role === "host") {
        this.#learnerMap.forEach((learner, id) => {
          if(learner.connected) this.#learnerMap.set(id, {...learner, connected: false, lastSeen: Date.now()})
        })
      }
      else if(this.#learner) {
        const learner = this.#learnerMap.get(this.#learner.id)
        if(learner) this.#learnerMap.set(this.#learner.id, {...learner, connected: false, lastSeen: Date.now()})
      }
    })
    removeAwarenessStates(this.awareness, [this.awareness.clientID], "live-session-stop")
    this.#status = "stopped"
    this.#provider?.destroy()
    this.#channel?.close()
    const peers = transportSessions.get(this.id)
    peers?.delete(this)
    if(peers?.size === 0) transportSessions.delete(this.id)
    this.#notify()
  }

  destroy() {
    if(this.#destroyed) return
    this.stop()
    this.doc.off("update", this.#handleUpdate)
    this.#stepArray.unobserve(this.#handleStepChange)
    this.#learnerMap.unobserve(this.#handleCollectionChange)
    this.#stateMap.unobserve(this.#handleCollectionChange)
    this.#meta.unobserve(this.#handleCollectionChange)
    this.awareness.off("change", this.#handleAwarenessChange)
    this.awareness.destroy()
    this.doc.destroy()
    this.#listeners.clear()
    this.#destroyed = true
  }

  #upsertLearner(learner: Pick<LiveSessionLearner, "id" | "name" | "color">, connected: boolean) {
    const current = this.#learnerMap.get(learner.id)
    this.#learnerMap.set(learner.id, {
      id: learner.id,
      name: learner.name,
      color: learner.color,
      firstSeen: current?.firstSeen ?? Date.now(),
      lastSeen: Date.now(),
      connected,
    })
  }

  #handleCollectionChange = () => this.#queueNotify()

  #handleStepChange = (event: Y.YArrayEvent<LiveSessionStep>) => {
    let index = 0
    for(const part of event.changes.delta) {
      if(part.retain) index += part.retain
      if(part.delete) {
        this.#pendingStepDeltas.push({index, deleteCount: part.delete, steps: []})
      }
      if(part.insert) {
        const steps = clone(part.insert as LiveSessionStep[])
        this.#pendingStepDeltas.push({index, deleteCount: 0, steps})
        index += steps.length
      }
    }
    this.#queueNotify()
  }

  #handleAwarenessChange = (
    {added, updated, removed}: {added: number[], updated: number[], removed: number[]},
    origin?: unknown,
  ) => {
    if(this.role === "host") {
      for(const clientId of [...added, ...updated]) {
        const state = this.awareness.getStates().get(clientId) as AwarenessState | undefined
        const learner = state?.liveSession?.learner
        if(!isLearnerIdentity(learner)) continue
        this.#clientLearners.set(clientId, learner.id)
        this.#upsertLearner(learner, true)
      }
      for(const clientId of removed) {
        const learnerId = this.#clientLearners.get(clientId)
        if(!learnerId) continue
        this.#clientLearners.delete(clientId)
        const learner = this.#learnerMap.get(learnerId)
        const connected = [...this.#clientLearners.values()].some(id => id === learnerId)
        if(learner) this.#learnerMap.set(learnerId, {...learner, connected, lastSeen: Date.now()})
      }
    }
    if(origin !== this.#transportOrigin) this.#broadcastAwareness([...new Set([...added, ...updated, ...removed])])
    this.#queueNotify()
  }

  #handleUpdate = (update: Uint8Array, origin: unknown) => {
    if(origin === this.#transportOrigin) return
    this.#broadcastUpdate(update)
  }

  #broadcastUpdate(update: Uint8Array) {
    const data = Array.from(update)
    transportSessions.get(this.id)?.forEach(peer => {
      if(peer !== this && peer.#token === this.#token) peer.#applyUpdate(update)
    })
    this.#channel?.postMessage({
      type: "update",
      session: this.id,
      sender: this.#transportId,
      ...(this.#token ? {token: this.#token} : {}),
      update: data,
    } satisfies BroadcastMessage)
  }

  #sendSync(target: LiveSession) {
    target.#applyUpdate(Y.encodeStateAsUpdate(this.doc))
    const awareness = encodeAwarenessUpdate(this.awareness, [...this.awareness.getStates().keys()])
    target.#applyAwareness(awareness)
  }

  #applyUpdate(update: Uint8Array) {
    if(!(update instanceof Uint8Array) || update.byteLength > 8 * 1024 * 1024) return
    try { Y.applyUpdate(this.doc, update, this.#transportOrigin) }
    catch { /* Ignore malformed or oversized peer updates. */ }
  }

  #applyAwareness(update: Uint8Array) {
    if(!(update instanceof Uint8Array) || update.byteLength > 512 * 1024) return
    try { applyAwarenessUpdate(this.awareness, update, this.#transportOrigin) }
    catch { /* Ignore malformed peer awareness updates. */ }
  }

  #broadcastAwareness(clientIds = [...this.awareness.getStates().keys()]) {
    const update = encodeAwarenessUpdate(this.awareness, clientIds)
    transportSessions.get(this.id)?.forEach(peer => {
      if(peer !== this && peer.#token === this.#token) peer.#applyAwareness(update)
    })
    this.#channel?.postMessage({
      type: "awareness",
      session: this.id,
      sender: this.#transportId,
      ...(this.#token ? {token: this.#token} : {}),
      awareness: Array.from(update),
    } satisfies BroadcastMessage)
  }

  #handleBroadcast = (event: MessageEvent<BroadcastMessage>) => {
    const message = event.data
    if(!message || message.session !== this.id || message.sender === this.#transportId) return
    if(message.token !== this.#token) return
    if(message.type === "sync-request" && this.role === "host") {
      this.#channel?.postMessage({
        type: "sync",
        session: this.id,
        sender: this.#transportId,
        ...(this.#token ? {token: this.#token} : {}),
        update: Array.from(Y.encodeStateAsUpdate(this.doc)),
        awareness: Array.from(encodeAwarenessUpdate(this.awareness, [...this.awareness.getStates().keys()])),
      } satisfies BroadcastMessage)
    }
    else if(Array.isArray(message.update) && message.update.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
      this.#applyUpdate(Uint8Array.from(message.update))
    }
    if((message.type === "sync" || message.type === "awareness") && message.awareness) {
      if(Array.isArray(message.awareness) && message.awareness.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
        this.#applyAwareness(Uint8Array.from(message.awareness))
      }
    }
  }

  #notify(change: LiveSessionChange = {stepDeltas: []}) {
    this.#listeners.forEach(listener => listener(this, change))
  }

  #queueNotify() {
    if(this.#notifyQueued) return
    this.#notifyQueued = true
    queueMicrotask(() => {
      this.#notifyQueued = false
      const stepDeltas = this.#pendingStepDeltas.splice(0)
      if(!this.#destroyed) this.#notify({stepDeltas})
    })
  }
}
