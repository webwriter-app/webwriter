import type {LiveSessionStep} from "./live-session"
import type {LiveSessionReplay} from "./live-session-replay"
import {createXapiMapper} from "./live-session-xapi"

export type LrsStatus = {state: "sending" | "waiting" | "error", queued: number, message?: string, canRetry?: boolean}
export type LrsConfiguration = {endpoint: string, username: string, password: string}

/** Validate the destination and construct credentials without persisting either. */
export function createLrsConnection(config: LrsConfiguration) {
  const url = new URL(config.endpoint)
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if((url.protocol !== "https:" && !(url.protocol === "http:" && local)) || url.username || url.password || url.search || url.hash)
    throw new Error("Enter an HTTPS LRS endpoint without credentials, query or fragment")
  if(!config.username || !config.password || config.username.includes(":")) throw new Error("Enter an LRS key and secret")
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/statements`
  const bytes = new TextEncoder().encode(`${config.username}:${config.password}`)
  let binary = ""
  for(const byte of bytes) binary += String.fromCharCode(byte)
  return {endpoint: url.href, authorization: `Basic ${btoa(binary)}`}
}

/** The host talks directly to the chosen LRS. No credentials or queue are persisted. */
export class LiveSessionLrs {
  private readonly endpoint: string
  private authorization: string
  private readonly mapper: ReturnType<typeof createXapiMapper>
  private readonly queue: LiveSessionStep[] = []
  private readonly seen = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private controller: AbortController | null = null
  private active = true
  private running = false
  private paused = false
  private overflow = false
  private failures = 0

  constructor(config: LrsConfiguration, replay: LiveSessionReplay, private readonly notify: (status: LrsStatus) => void,
    private readonly send: typeof fetch = fetch) {
    const connection = createLrsConnection(config)
    this.endpoint = connection.endpoint
    this.authorization = connection.authorization
    this.mapper = createXapiMapper(replay)
    // Avoid an unhandled rejection if crypto is unavailable before the first event.
    void this.mapper.catch(() => {})
    this.report("waiting")
  }

  add(steps: readonly LiveSessionStep[]) {
    if(!this.active || this.overflow) return
    for(const step of steps) {
      if(!step.learner || this.seen.has(step.id) || !(step.kind === "widget" || step.kind === "click"
        || step.kind === "document" && (step.htmlUpdate !== undefined || step.html !== undefined))) continue
      if(this.queue.length >= 1000) {
        this.overflow = true; this.paused = true
        this.report("error", "LRS queue is full. Later activity was not queued; use the replay to recover it.")
        return
      }
      this.seen.add(step.id)
      // Delivery needs event metadata, never the recorded HTML or widget snapshots.
      this.queue.push({id: step.id, time: step.time, learner: step.learner, kind: step.kind,
        ...(step.kind === "document" ? {htmlUpdate: ""} : {}), ...(step.analytics ? {analytics: step.analytics} : {})})
    }
    if(this.queue.length && !this.running && !this.timer && !this.paused) void this.pump()
  }

  /** Exclude activity already present when the host opts in. */
  markExisting(steps: readonly LiveSessionStep[]) { for(const step of steps) this.seen.add(step.id) }

  retry() {
    if(!this.active || this.overflow || !this.paused && !this.timer) return
    clearTimeout(this.timer); this.timer = undefined
    this.paused = false; this.failures = 0
    void this.pump()
  }

  /** Stop immediately; the caller can tell the host how many events remained. */
  stop() {
    if(!this.active) return 0
    this.active = false
    clearTimeout(this.timer); this.timer = undefined
    this.controller?.abort(); this.controller = null
    this.authorization = ""
    const unsent = this.queue.length
    this.queue.length = 0; this.seen.clear()
    return unsent
  }

  private report(state: LrsStatus["state"], message?: string) {
    if(this.active) this.notify({state, queued: this.queue.length, ...(message ? {message} : {}),
      ...(state === "error" && !this.overflow ? {canRetry: true} : {})})
  }

  private async pump() {
    if(!this.active || this.running || this.paused || !this.queue.length) return
    this.running = true
    try {
      const map = await this.mapper
      const batch = this.queue.slice(0, 25)
      const statements = (await Promise.all(batch.map(step => map(step)))).filter(Boolean)
      if(!this.active) return
      if(statements.length) {
        this.report("sending")
        this.controller = new AbortController()
        const controller = this.controller
        const timeout = setTimeout(() => controller.abort(), 30000)
        let response: Response
        try {
          response = await this.send(this.endpoint, {method: "POST", redirect: "error", credentials: "omit", referrerPolicy: "no-referrer",
            headers: {"Content-Type": "application/json", "X-Experience-API-Version": "1.0.3", Authorization: this.authorization},
            body: JSON.stringify(statements), signal: controller.signal})
        }
        finally { clearTimeout(timeout) }
        if(!response.ok) {
          if(response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
            this.paused = true
            throw new Error(`LRS rejected the statements (HTTP ${response.status}). Check the endpoint and credentials.`)
          }
          throw new Error(`LRS unavailable (HTTP ${response.status}).`)
        }
      }
      if(!this.active) return
      this.queue.splice(0, batch.length)
      this.failures = 0
      if(this.overflow) this.report("error", "LRS queue is full. Later activity was not queued; use the replay to recover it.")
      else this.report("waiting")
    }
    catch(error) {
      if(!this.active) return
      const message = error instanceof Error ? error.message : "LRS delivery failed"
      if(this.paused) this.report("error", message)
      else {
        this.failures++
        this.report("error", `${message} Retrying; activity remains in the host queue.`)
        this.timer = setTimeout(() => { this.timer = undefined; void this.pump() }, Math.min(30000, 1000 * 2 ** Math.min(this.failures - 1, 5)))
      }
    }
    finally {
      this.controller = null; this.running = false
      if(this.active && this.queue.length && !this.timer && !this.paused) void this.pump()
    }
  }
}
