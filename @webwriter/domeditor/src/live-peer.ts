/** Host-authenticated WebRTC channels. The WebSocket transports only encrypted
 * SDP/ICE messages; session data is carried exclusively by data channels. */
export const encodeLiveBytes = (bytes: Uint8Array) => {
  let binary = ""
  for(let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}
export const decodeLiveBytes = (value: string) => Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0))
const b64 = encodeLiveBytes, unb64 = decodeLiveBytes
const randomId = () => b64(crypto.getRandomValues(new Uint8Array(24)))
const encode = new TextEncoder()
const decode = new TextDecoder()

export async function createLiveHostIdentity() {
  const keys = await crypto.subtle.generateKey({name: "ECDH", namedCurve: "P-256"}, true, ["deriveBits"])
  return {privateKey: keys.privateKey, publicKey: b64(new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey))), secret: randomId()}
}

type PeerOptions = {
  room: string
  signaling: string
  role: "host" | "learner"
  hostPublicKey: string
  secret: string
  hostPrivateKey?: CryptoKey
  learnerKeyId?: string
  onOpen: (peer: string, remoteKey: string) => void
  onMessage: (peer: string, message: unknown) => void
  onClose: (peer: string) => void
  onStatus: (connected: boolean) => void
}
type Connection = {
  pc: RTCPeerConnection
  key: CryptoKey
  channel?: RTCDataChannel
  sendSignals: Promise<void>
  receiveSignals: Promise<void>
  candidates: RTCIceCandidateInit[]
  localReady: boolean
  queue: string[]
  queuedBytes: number
  incoming: Map<string, {parts: string[], next: number, size: number}>
  opened: boolean
  remoteKey: string
  timeout?: ReturnType<typeof setTimeout>
}

export class LivePeerTransport {
  private socket?: WebSocket
  private peers = new Map<string, Connection>()
  private stopped = false
  private retry?: ReturnType<typeof setTimeout>
  private learnerId = randomId()
  private learnerKeys?: CryptoKeyPair
  constructor(private readonly options: PeerOptions) { void this.connect() }

  private async connect() {
    if(this.stopped) return
    try {
      if(this.options.role === "learner" && !this.learnerKeys) {
        const storageKey = `webwriter-live-peer-key:${this.options.room}:${this.options.learnerKeyId ?? "learner"}`
        try {
          const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null")
          if(saved) {
            const privateKey = await crypto.subtle.importKey("jwk", saved.privateKey, {name: "ECDH", namedCurve: "P-256"}, true, ["deriveBits"])
            const publicKey = await crypto.subtle.importKey("jwk", saved.publicKey, {name: "ECDH", namedCurve: "P-256"}, true, [])
            this.learnerKeys = {privateKey, publicKey}
          }
        }
        catch { /* Storage may be unavailable or contain an obsolete key. */ }
        if(!this.learnerKeys) {
          this.learnerKeys = await crypto.subtle.generateKey({name: "ECDH", namedCurve: "P-256"}, true, ["deriveBits"])
          try {
            sessionStorage.setItem(storageKey, JSON.stringify({privateKey: await crypto.subtle.exportKey("jwk", this.learnerKeys.privateKey), publicKey: await crypto.subtle.exportKey("jwk", this.learnerKeys.publicKey)}))
          }
          catch { /* The connection remains usable for this page's lifetime. */ }
        }
      }
      if(this.stopped) return
      const endpoint = new URL(this.options.signaling)
      endpoint.pathname = "/live-signaling"
      endpoint.search = ""
      endpoint.hash = ""
      const socket = this.socket = new WebSocket(endpoint)
      socket.onopen = async () => {
        if(this.stopped || socket !== this.socket) return
        const registration = this.options.role === "host" ? {type: "host", room: this.options.room} : {
          type: "join", room: this.options.room, peer: this.learnerId,
          key: b64(new Uint8Array(await crypto.subtle.exportKey("raw", this.learnerKeys!.publicKey))),
        }
        if(socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(registration))
      }
      let messages = Promise.resolve()
      socket.onmessage = event => { messages = messages.then(() => socket === this.socket ? this.signalingMessage(JSON.parse(String(event.data))) : undefined).catch(() => socket.close()) }
      socket.onerror = () => socket.close()
      socket.onclose = () => {
        if(socket !== this.socket) return
        this.socket = undefined
        this.options.onStatus(false)
        for(const id of [...this.peers.keys()]) this.closePeer(id)
        if(!this.stopped) this.retry = setTimeout(() => void this.connect(), 1500)
      }
    }
    catch {
      this.options.onStatus(false)
      if(!this.stopped) this.retry = setTimeout(() => void this.connect(), 1500)
    }
  }

  private async key(privateKey: CryptoKey, publicKey: string) {
    const remote = await crypto.subtle.importKey("raw", unb64(publicKey), {name: "ECDH", namedCurve: "P-256"}, false, [])
    const shared = await crypto.subtle.deriveBits({name: "ECDH", public: remote}, privateKey, 256)
    const material = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"])
    return crypto.subtle.deriveKey({name: "HKDF", hash: "SHA-256", salt: unb64(this.options.secret), info: encode.encode(`webwriter-live:${this.options.room}`)}, material, {name: "AES-GCM", length: 256}, false, ["encrypt", "decrypt"])
  }

  private async signalingMessage(message: any) {
    if(this.stopped || !message || typeof message !== "object") return
    if(message.type === "ready") {
      if(this.options.role === "host") this.options.onStatus(true)
      else {
        const key = await this.key(this.learnerKeys!.privateKey, this.options.hostPublicKey)
        if(this.stopped || !this.socket) return
        const peer = this.createPeer(this.learnerId, key, this.options.hostPublicKey)
        this.attachChannel(this.learnerId, peer, peer.pc.createDataChannel("live"))
        await peer.pc.setLocalDescription(await peer.pc.createOffer())
        await this.signal(this.learnerId, {description: peer.pc.localDescription})
        peer.localReady = true
        for(const candidate of peer.candidates.splice(0)) void this.signal(this.learnerId, {candidate})
      }
    }
    else if(message.type === "join" && this.options.role === "host" && typeof message.peer === "string" && typeof message.key === "string") {
      const key = await this.key(this.options.hostPrivateKey!, message.key)
      if(this.stopped || !this.socket) return
      if(!this.peers.has(message.peer)) this.createPeer(message.peer, key, message.key)
    }
    else if(message.type === "leave" && this.options.role === "host") this.closePeer(message.peer)
    else if(message.type === "signal" && typeof message.data === "string") {
      const id = this.options.role === "host" ? message.peer : this.learnerId
      const peer = this.peers.get(id)
      if(!peer) return
      peer.receiveSignals = peer.receiveSignals.then(async () => {
        const payload = unb64(message.data)
        const plain = await crypto.subtle.decrypt({name: "AES-GCM", iv: payload.slice(0, 12)}, peer.key, payload.slice(12))
        const signal = JSON.parse(decode.decode(plain))
        if(signal.description) {
          await peer.pc.setRemoteDescription(signal.description)
          if(signal.description.type === "offer" && this.options.role === "host") {
            await peer.pc.setLocalDescription(await peer.pc.createAnswer())
            await this.signal(id, {description: peer.pc.localDescription})
            peer.localReady = true
            for(const candidate of peer.candidates.splice(0)) void this.signal(id, {candidate})
          }
        }
        else if(signal.candidate) await peer.pc.addIceCandidate(signal.candidate)
      }).catch(() => this.closePeer(id))
    }
  }

  private createPeer(id: string, key: CryptoKey, remoteKey: string) {
    const pc = new RTCPeerConnection({iceServers: []})
    const peer: Connection = {pc, key, remoteKey, sendSignals: Promise.resolve(), receiveSignals: Promise.resolve(), candidates: [], localReady: false, queue: [], queuedBytes: 0, incoming: new Map(), opened: false}
    this.peers.set(id, peer)
    peer.timeout = setTimeout(() => { if(!peer.opened) this.closePeer(id) }, 15000)
    pc.onicecandidate = event => {
      if(!event.candidate) return
      const candidate = event.candidate.toJSON()
      if(peer.localReady) void this.signal(id, {candidate})
      else peer.candidates.push(candidate)
    }
    pc.ondatachannel = event => this.attachChannel(id, peer, event.channel)
    pc.onconnectionstatechange = () => {
      if(["failed", "closed"].includes(pc.connectionState)) this.closePeer(id)
    }
    return peer
  }

  private signal(id: string, value: object) {
    const peer = this.peers.get(id)
    if(!peer) return Promise.resolve()
    peer.sendSignals = peer.sendSignals.then(async () => {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const encrypted = new Uint8Array(await crypto.subtle.encrypt({name: "AES-GCM", iv}, peer.key, encode.encode(JSON.stringify(value))))
      const data = new Uint8Array(iv.length + encrypted.length)
      data.set(iv); data.set(encrypted, iv.length)
      if(this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({type: "signal", peer: id, data: b64(data)}))
    }).catch(() => this.closePeer(id))
    return peer.sendSignals
  }

  private attachChannel(id: string, peer: Connection, channel: RTCDataChannel) {
    if(peer.channel) { channel.close(); return }
    peer.channel = channel
    channel.bufferedAmountLowThreshold = 256 * 1024
    channel.onbufferedamountlow = () => this.flush(peer)
    channel.onopen = () => {
      if(peer.timeout) clearTimeout(peer.timeout)
      peer.opened = true
      if(this.options.role === "learner") this.options.onStatus(true)
      this.options.onOpen(id, peer.remoteKey)
      this.flush(peer)
    }
    channel.onclose = () => this.closePeer(id)
    channel.onmessage = event => {
      try {
        const frame = JSON.parse(String(event.data))
        if(typeof frame.id !== "string" || !Number.isInteger(frame.index) || !Number.isInteger(frame.total)
          || frame.total < 1 || frame.total > 2048 || typeof frame.part !== "string" || frame.part.length > 16384) throw Error("Invalid frame")
        let message = peer.incoming.get(frame.id)
        if(!message && frame.index === 0 && peer.incoming.size < 4) {
          message = {parts: [], next: 0, size: 0}; peer.incoming.set(frame.id, message)
        }
        if(!message || frame.index !== message.next++ || frame.index >= frame.total) throw Error("Out of order frame")
        message.parts.push(frame.part); message.size += frame.part.length
        if(message.size > 16 * 1024 * 1024) throw Error("Oversized message")
        if(message.next === frame.total) {
          peer.incoming.delete(frame.id)
          this.options.onMessage(id, JSON.parse(message.parts.join("")))
        }
      }
      catch { this.closePeer(id) }
    }
  }

  send(id: string, value: unknown) {
    const peer = this.peers.get(id)
    if(!peer?.opened || !peer.channel || peer.channel.readyState !== "open") return false
    const text = JSON.stringify(value)
    if(text.length > 16 * 1024 * 1024) { this.closePeer(id); return false }
    if(peer.queuedBytes + text.length > 32 * 1024 * 1024) { this.closePeer(id); return false }
    const messageId = randomId(), total = Math.max(1, Math.ceil(text.length / 16384))
    for(let index = 0; index < total; index++) {
      const frame = JSON.stringify({id: messageId, index, total, part: text.slice(index * 16384, (index + 1) * 16384)})
      peer.queue.push(frame); peer.queuedBytes += frame.length
    }
    this.flush(peer)
    return true
  }

  private flush(peer: Connection) {
    const channel = peer.channel
    if(!channel || channel.readyState !== "open") return
    try {
      while(peer.queue.length && channel.bufferedAmount < 1024 * 1024) {
        const frame = peer.queue.shift()!
        peer.queuedBytes -= frame.length
        channel.send(frame)
      }
    }
    catch { channel.close() }
  }

  private closePeer(id: string) {
    const peer = this.peers.get(id)
    if(!peer) return
    this.peers.delete(id)
    if(peer.timeout) clearTimeout(peer.timeout)
    peer.channel?.close(); peer.pc.close()
    if(peer.opened && !this.stopped) this.options.onClose(id)
    if(this.options.role === "learner" && !this.stopped) this.socket?.close()
  }

  disconnect(id: string) { this.closePeer(id) }

  destroy(graceful = false) {
    this.stopped = true
    if(this.retry) clearTimeout(this.retry)
    const close = () => {
      this.socket?.close()
      for(const id of [...this.peers.keys()]) this.closePeer(id)
    }
    // Allow the host's final stop frame to leave the data channels before
    // closing the signaling socket, which also disconnects learners.
    if(graceful && this.peers.size) setTimeout(close, 500)
    else close()
  }
}
