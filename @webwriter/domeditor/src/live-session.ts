import * as Y from "yjs"
import {Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates} from "y-protocols/awareness"
import {WebsocketProvider} from "y-websocket"
import {acceptLearnerUpdate, encodeLiveSessionFeedback, liveSessionFeedbackMessage, readLiveSessionFeedback} from "./live-session-permissions.js"
import {isCssColor} from "./css-color"
import {LivePeerTransport, encodeLiveBytes, decodeLiveBytes} from "./live-peer"
import type {IImportMap} from "@jspm/import-map"
import type {WebWriterPackage} from "./packages"
import type {WidgetDataSnapshot} from "./widget-aggregate"

export type LiveSessionRole = "host" | "learner"
export type LiveSessionStepKind = "document" | "cursor" | "pointer" | "click" | "scroll" | "widget" | "submission"
export type LiveSessionAnswers = [name: string, value: string][]

export type LiveSessionLearner = {
  id: string
  name: string
  color: string
  firstSeen: number
  lastSeen: number
  connected: boolean
}

export type LiveSessionFeedback = {
  id: string
  participant: string
  text: string
  time: number
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
  data?: WidgetDataSnapshot
}

/** An explicitly emitted package event; ordinary widget changes carry no semantics. */
export type LiveSessionWidgetEvent = {
  profile: string
  verb: {id: string, display?: Record<string, string>}
  contextExtensions?: Record<string, unknown>
  resultExtensions?: Record<string, unknown>
  widget: {tag: string, path: number[]}
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
  htmlCheckpoint?: string
  htmlUpdate?: string
  widgets?: LiveSessionWidgetState[]
  analytics?: LiveSessionWidgetEvent
  /** Earlier clients sent answers separately. Readers now record submission on widgets. */
  answers?: LiveSessionAnswers
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

export type LiveSessionPreviewDependencies = {packages: WebWriterPackage[], importMap: IImportMap | null}

type LiveSessionOptions = {
  id: string
  role: LiveSessionRole
  baseHTML?: string
  previewDependencies?: LiveSessionPreviewDependencies
  /** WebSocket endpoint for signaling, or for explicit legacy server sessions. */
  serverUrl?: string
  /** Capability shared only through the host's learner link. */
  token?: string
  /** Reuse the HTTP publisher's host capability even when storage is unavailable. */
  hostKey?: string
  learner?: Pick<LiveSessionLearner, "id" | "name" | "color">
  validateDocument?: (before: string | undefined, after: string) => boolean
  peer?: {hostPublicKey: string, hostPrivateKey?: CryptoKey, secret: string}
}

type AwarenessState = {
  liveSession?: {
    role: LiveSessionRole
    learner?: Pick<LiveSessionLearner, "id" | "name" | "color">
  }
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
    && isCssColor(learner.color)
}

const clone = <T>(value: T): T => {
  if(value === undefined || value === null) return value
  return JSON.parse(JSON.stringify(value)) as T
}

const identifier = (prefix: string) => globalThis.crypto?.randomUUID?.()
  ?? `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

/** Keep a learner's identity stable across reloads of the same session. */
export function liveSessionLearnerIdentity(sessionId: string, name = "") {
  const storageKey = `webwriter_live_session_learner_${sessionId}`
  try {
    const saved = JSON.parse(globalThis.sessionStorage?.getItem(storageKey) ?? "null") as unknown
    if(isLearnerIdentity(saved)) return {...saved, name: name || saved.name}
  }
  catch { /* Identity storage can be unavailable on document origins. */ }
  const id = identifier("learner")
  const colors = ["#e11d48", "#db2777", "#9333ea", "#4f46e5", "#2563eb", "#0284c7",
    "#0891b2", "#0d9488", "#059669", "#65a30d", "#ca8a04", "#ea580c"]
  const hash = Array.from(id).reduce((hash, character) => (Math.imul(hash, 31) + character.codePointAt(0)!) | 0, 0)
  const suffix = id.replaceAll(/[^a-zA-Z0-9]/g, "").slice(-4).toLocaleUpperCase()
  const learner = {id, name: name || `Learner ${suffix || "?"}`, color: colors[Math.abs(hash) % colors.length]}
  try { globalThis.sessionStorage?.setItem(storageKey, JSON.stringify(learner)) }
  catch { /* The identity remains valid for this connection. */ }
  return learner
}

const connectionKey = (id: string, role: string, token: string, learner = "") => {
  const storageKey = `webwriter-live-connection:${id}:${role}:${token}:${learner}`
  let key: string | null = null
  try { key = globalThis.sessionStorage?.getItem(storageKey) ?? null }
  catch { /* Storage can be unavailable in opaque origins. */ }
  if(!key || !/^[A-Za-z0-9_-]{24,256}$/.test(key)) {
    key = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, "0")).join("")
    try { globalThis.sessionStorage?.setItem(storageKey, key) }
    catch { /* The key remains valid for this connection and its reconnects. */ }
  }
  return key
}

export const liveSessionHostKey = (id: string, token: string) => connectionKey(id, "host", token)

/**
 * Durable session timeline and learner registry. The Y.Doc owned here is a
 * session log, not a second representation of the authored editor DOM.
 * Peer sessions use the server only for signaling. Without `serverUrl`,
 * instances coordinate only in the same JavaScript realm.
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
  readonly #feedbackMessages = new Map<string, LiveSessionFeedback>()
  readonly #transportOrigin = {}
  readonly #listeners = new Set<LiveSessionChangeListener>()
  readonly #clientLearners = new Map<number, string>()
  readonly #provider?: WebsocketProvider
  readonly #peer?: LivePeerTransport
  readonly #peerLearners = new Map<string, string>()
  readonly #peerKeys = new Map<string, string>()
  readonly #learnerKeys = new Map<string, string>()
  #peerConnection?: string
  #peerBaseHTML?: string
  #peerDependencies?: LiveSessionPreviewDependencies
  readonly #learner?: Pick<LiveSessionLearner, "id" | "name" | "color">
  readonly #token?: string
  readonly #validateDocument?: (before: string | undefined, after: string) => boolean
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
    if(options.serverUrl && !options.token && !options.peer) {
      throw new TypeError("A server-backed live session requires a bearer token")
    }
    if(options.hostKey !== undefined && !/^[A-Za-z0-9_-]{24,256}$/.test(options.hostKey)) {
      throw new TypeError("A live session host key is invalid")
    }
    if(options.peer && (!options.serverUrl || !/^[A-Za-z0-9_-]{87}$/.test(options.peer.hostPublicKey)
      || !/^[A-Za-z0-9_-]{32}$/.test(options.peer.secret) || this.role === "host" && !options.peer.hostPrivateKey)) {
      throw new TypeError("Invalid peer host identity")
    }
    this.#token = options.token
    this.#validateDocument = options.validateDocument
    this.#status = options.serverUrl ? "connecting" : "connected"
    this.doc = new Y.Doc()
    this.awareness = new Awareness(this.doc as any)
    this.#meta = this.doc.getMap(META)
    this.#learnerMap = this.doc.getMap(LEARNERS)
    this.#stepArray = this.doc.getArray(STEPS)
    this.#stateMap = this.doc.getMap(STATES)

    if((!options.serverUrl || options.peer) && this.role === "host" && options.baseHTML !== undefined && this.#meta.get("baseHTML") === undefined) {
      this.#meta.set("baseHTML", options.baseHTML)
    }
    if((!options.serverUrl || options.peer) && this.role === "host" && options.previewDependencies !== undefined) {
      this.#meta.set("previewDependencies", clone(options.previewDependencies))
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

    if(options.serverUrl && options.peer) {
      this.#peer = new LivePeerTransport({
        room: this.id, signaling: options.serverUrl, role: this.role, ...options.peer,
        learnerKeyId: this.#learner?.id,
        onStatus: connected => { if(!this.#destroyed && this.#status !== "stopped") { this.#status = connected ? "connected" : "connecting"; this.#notify() } },
        onOpen: (peer, key) => {
          this.#peerKeys.set(peer, key)
          if(this.role === "learner") this.#peerConnection = peer
          if(this.role === "host") this.#peer?.send(peer, {type: "welcome", html: this.baseHTML, dependencies: this.previewDependencies})
          else this.#peer?.send(peer, {type: "hello", learner: this.#learner, update: encodeLiveBytes(Y.encodeStateAsUpdate(this.doc))})
        },
        onMessage: (peer, message) => this.#receivePeerMessage(peer, message),
        onClose: peer => {
          this.#peerKeys.delete(peer)
          if(this.#peerConnection === peer) this.#peerConnection = undefined
          const learner = this.#peerLearners.get(peer)
          this.#peerLearners.delete(peer)
          if(learner && ![...this.#peerLearners.values()].includes(learner)) {
            const current = this.#learnerMap.get(learner)
            if(current) this.#learnerMap.set(learner, {...current, connected: false, lastSeen: Date.now()})
          }
          if(this.role === "learner" && !this.#destroyed && this.#status !== "stopped") { this.#status = "connecting"; this.#notify() }
        },
      })
    }
    else if(options.serverUrl) {
      this.#provider = new WebsocketProvider(options.serverUrl, `live-session-${this.id}`, this.doc as any, {
        awareness: this.awareness,
        disableBc: true,
        connect: false,
        params: {
          token: this.#token!, role: this.role,
          ...(this.role === "host"
            ? {hostKey: options.hostKey ?? liveSessionHostKey(this.id, this.#token!)}
            : {learner: this.#learner!.id, learnerKey: connectionKey(this.id, this.role, this.#token!, this.#learner!.id)}),
        },
      })
      this.#provider.messageHandlers[liveSessionFeedbackMessage] = (_encoder, decoder) => {
        try { this.#receiveFeedback(readLiveSessionFeedback(decoder)) }
        catch { /* Ignore malformed feedback without interrupting document synchronization. */ }
      }
      this.#provider.on("status", ({status}: {status: string}) => {
        this.#status = status === "connected" ? "connected" : "connecting"
        if(status === "connected" && this.role === "host") {
          // Reconnects retry messages whose delivery may have been interrupted.
          for(const message of this.#feedbackMessages.values()) this.#provider!.ws?.send(encodeLiveSessionFeedback(message))
        }
        this.#notify()
      })
      this.#provider.connect()
    }
    else {
      const peers = transportSessions.get(this.id) ?? new Set<LiveSession>()
      const compatiblePeers = [...peers].filter(peer => peer.#token === this.#token)
      const host = compatiblePeers.find(peer => peer.role === "host")
      if(host) host.#sendSync(this)
      else if(this.role === "host") compatiblePeers.forEach(peer => { peer.#sendLearnerHistory(this); this.#sendSync(peer) })
      peers.add(this)
      transportSessions.set(this.id, peers)
      if(this.role === "learner") this.#broadcastUpdate(Y.encodeStateAsUpdate(this.doc))
      else compatiblePeers.forEach(peer => peer.#broadcastAwareness())
      this.#broadcastAwareness([this.awareness.clientID])
    }
  }

  get baseHTML() {
    if(this.#peerBaseHTML !== undefined) return this.#peerBaseHTML
    const html = this.#meta.get("baseHTML")
    return typeof html === "string" ? html : undefined
  }

  get previewDependencies() {
    if(this.#peerDependencies !== undefined) return clone(this.#peerDependencies)
    return clone(this.#meta.get("previewDependencies") as LiveSessionPreviewDependencies | undefined)
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

  get feedback() {
    return [...this.#feedbackMessages.values()].map(message => clone(message))
  }

  sendFeedback(participant: string, text: string): LiveSessionFeedback | null {
    if(this.#destroyed || this.role !== "host" || this.status !== "connected"
      || !this.learners.some(learner => learner.id === participant && learner.connected)
      || typeof text !== "string" || !text.trim() || text.length > 4000) return null
    const message = {id: identifier("feedback"), participant, text: text.trim(), time: Date.now()}
    if(this.#peer) {
      const peer = [...this.#peerLearners].find(([, learner]) => learner === participant)?.[0]
      if(!peer || !this.#peer.send(peer, {type: "feedback", message})) return null
    }
    else if(this.#provider) {
      if(!this.#provider.wsconnected || !this.#provider.ws) return null
      try { this.#provider.ws.send(encodeLiveSessionFeedback(message)) }
      catch { return null }
    }
    else {
      for(const peer of transportSessions.get(this.id) ?? []) {
        if(peer.#token === this.#token && (peer.role === "host" || peer.#learner?.id === participant)) peer.#receiveFeedback(message)
      }
    }
    this.#receiveFeedback(message)
    return clone(message)
  }

  #receiveFeedback(message: LiveSessionFeedback) {
    if(this.#destroyed || this.#feedbackMessages.has(message.id)
      || this.role !== "host" && message.participant !== this.#learner?.id) return
    this.#feedbackMessages.set(message.id, clone(message))
    this.#queueNotify()
  }

  #receivePeerMessage(peer: string, value: unknown) {
    if(this.#destroyed || this.#status === "stopped" || !value || typeof value !== "object") return
    const message = value as any
    if(this.role === "learner") {
      if(message.type === "welcome" && typeof message.html === "string") {
        this.#peerBaseHTML = message.html
        this.#peerDependencies = message.dependencies
        this.#queueNotify()
      }
      else if(message.type === "feedback" && message.message?.participant === this.#learner?.id
        && typeof message.message.id === "string" && typeof message.message.text === "string" && Number.isFinite(message.message.time)) this.#receiveFeedback(message.message)
      else if(message.type === "stop") this.stop()
      return
    }
    if(message.type === "hello" && isLearnerIdentity(message.learner)) {
      const key = this.#peerKeys.get(peer)
      const previousKey = this.#learnerKeys.get(message.learner.id)
      if(this.#peerLearners.has(peer) || !key || previousKey && key !== previousKey || [...this.#peerLearners.values()].includes(message.learner.id)) {
        this.#peer?.disconnect(peer)
        return
      }
      this.#learnerKeys.set(message.learner.id, key)
      this.#peerLearners.set(peer, message.learner.id)
      this.#upsertLearner(message.learner, true)
      for(const feedback of this.#feedbackMessages.values()) {
        if(feedback.participant === message.learner.id) this.#peer?.send(peer, {type: "feedback", message: feedback})
      }
    }
    const learner = this.#peerLearners.get(peer)
    if(!learner || !["hello", "update"].includes(message.type) || typeof message.update !== "string" || message.update.length > 12 * 1024 * 1024) return
    try {
      const update = decodeLiveBytes(message.update)
      if(acceptLearnerUpdate(this.doc, update, learner, this.#validateDocument)) this.#applyUpdate(update)
    }
    catch { /* Ignore malformed or unauthorized learner updates. */ }
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
        if(step.htmlCheckpoint !== undefined) delete state.html
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
    if(!this.#provider && !this.#peer && this.role === "host") {
      for(const peer of transportSessions.get(this.id) ?? []) {
        if(peer !== this && peer.#token === this.#token && peer.role === "learner") peer.stop()
      }
    }
    if(this.#peer && this.role === "host") for(const peer of this.#peerLearners.keys()) this.#peer.send(peer, {type: "stop"})
    this.#peer?.destroy(this.role === "host")
    this.#provider?.destroy()
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
    if(this.#peer) {
      if(this.role === "learner" && this.#peerConnection) this.#peer.send(this.#peerConnection, {type: "update", update: encodeLiveBytes(update)})
      return
    }
    const peers = [...(transportSessions.get(this.id) ?? [])].filter(peer => peer.#token === this.#token)
    const host = peers.find(peer => peer.role === "host")
    // Learners cannot authorize one another. Keep their local changes so they
    // can be validated when a host reconnects, but never relay them hostless.
    if(this.role === "learner" && (!host || !acceptLearnerUpdate(host.doc, update, this.#learner!.id, host.#validateDocument))) return
    if(this.role === "learner" && host && host !== this) host.#applyUpdate(update)
  }

  #sendSync(target: LiveSession) {
    target.#peerBaseHTML = this.baseHTML
    target.#peerDependencies = this.previewDependencies
    for(const message of this.#feedbackMessages.values()) {
      if(target.role === "host" || message.participant === target.#learner?.id) target.#receiveFeedback(message)
    }
    target.#queueNotify()
  }

  #sendLearnerHistory(target: LiveSession) {
    if(this.role !== "learner" || !this.#learner) return
    try {
      // Reuse the learner's original Yjs structs. Re-creating equivalent
      // map/array values under a fresh client ID would break later deltas,
      // whose causal clocks refer to these structs.
      const update = Y.encodeStateAsUpdate(this.doc, Y.encodeStateVector(target.doc))
      if(acceptLearnerUpdate(target.doc, update, this.#learner.id, target.#validateDocument)) {
        target.#applyUpdate(update)
        for(const message of this.#feedbackMessages.values()) target.#receiveFeedback(message)
      }
    }
    catch {
      // A malformed local peer must not prevent a host from reconnecting.
    }
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
    if(this.#peer) return
    const update = encodeAwarenessUpdate(this.awareness, clientIds)
    transportSessions.get(this.id)?.forEach(peer => {
      if(peer !== this && peer.#token === this.#token && this.role === "learner" && peer.role === "host") peer.#applyAwareness(update)
    })
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
