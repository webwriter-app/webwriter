import workerURL from "./live-session-replay-worker.ts?worker&url"
import type {LiveSessionReplay} from "./live-session-replay"
import type {ReplaySaveHandle, ReplaySeekResult, ReplayWorkerRequest, ReplayWorkerResponse} from "./live-session-replay-worker"
import type {LrsConfiguration} from "./live-session-lrs"
import type {ReplayLrsProgress} from "./live-session-replay-lrs"

type ReplayOperation = Omit<Extract<ReplayWorkerRequest, {type: "open"}>, "id">
  | Omit<Extract<ReplayWorkerRequest, {type: "save-start"}>, "id">
  | Omit<Extract<ReplayWorkerRequest, {type: "save-add"}>, "id">
  | Omit<Extract<ReplayWorkerRequest, {type: "save-finish"}>, "id">
  | Omit<Extract<ReplayWorkerRequest, {type: "seek"}>, "id">
  | Omit<Extract<ReplayWorkerRequest, {type: "export-xapi"}>, "id">
  | Omit<Extract<ReplayWorkerRequest, {type: "send-lrs"}>, "id">
type PendingSeek = {time: number, knownRevision: number, resolve: (result: ReplaySeekResult) => void, reject: (error: Error) => void}
const maxBatchEstimate = 4 * 1024 * 1024

/** Estimate the clone size without constructing a second serialized copy. */
function estimateStepSize(step: unknown) {
  const pending = [step]
  let size = 0
  while(pending.length && size < maxBatchEstimate) {
    const value = pending.pop()
    if(typeof value === "string") size += value.length * 2
    else if(value && typeof value === "object") {
      for(const key in value) {
        if(!Object.hasOwn(value, key)) continue
        size += key.length * 2 + 8
        if(size >= maxBatchEstimate) break
        pending.push((value as Record<string, unknown>)[key])
      }
    }
    else size += 8
  }
  return size
}

/** Keeps file parsing, compression and Yjs playback off the editor thread. */
export class LiveSessionReplayClient {
  private readonly worker = new Worker(new URL(workerURL, import.meta.url), {type: "module"})
  private sequence = 0
  private stopped: Error | null = null
  private pending = new Map<number, {resolve: (result: any) => void, reject: (error: Error) => void, timer?: ReturnType<typeof setTimeout>, progress?: (value: ReplayLrsProgress) => void}>()
  private seeking = false
  private queuedSeek: PendingSeek | null = null

  constructor() {
    this.worker.onmessage = (event: MessageEvent<ReplayWorkerResponse>) => {
      const pending = this.pending.get(event.data?.id)
      if(!pending) return
      if(event.data.progress) { pending.progress?.(event.data.progress); return }
      this.pending.delete(event.data.id); clearTimeout(pending.timer)
      if(event.data.error) pending.reject(new Error(event.data.error))
      else pending.resolve(event.data.result)
    }
    this.worker.onerror = event => { event.preventDefault(); this.close(new Error("Could not start or communicate with the replay worker")) }
    this.worker.onmessageerror = () => this.close(new Error("Could not read replay worker results"))
  }

  private request<T>(operation: ReplayOperation, timeout = 120000, progress?: (value: ReplayLrsProgress) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      if(this.stopped) { reject(this.stopped); return }
      const id = ++this.sequence
      const timer = timeout ? setTimeout(() => this.close(new Error("Replay processing timed out")), timeout) : undefined
      this.pending.set(id, {resolve, reject, timer, progress})
      try { this.worker.postMessage({...operation, id} satisfies ReplayWorkerRequest) }
      catch(error) { this.close(error instanceof Error ? error : new Error(String(error))) }
    })
  }

  open(file: Blob) { return this.request<LiveSessionReplay>({type: "open", file}) }
  exportXapi(handle?: ReplaySaveHandle) { return this.request<Blob | undefined>({type: "export-xapi", ...(handle ? {handle} : {})}, 600000) }
  sendLrs(config: LrsConfiguration, progress: (value: ReplayLrsProgress) => void) { return this.request<number>({type: "send-lrs", config}, 0, progress) }
  async save(replay: LiveSessionReplay, handle?: ReplaySaveHandle) {
    await this.request<void>({type: "save-start", replay: {...replay, steps: []}, ...(handle ? {handle} : {})})
    for(let offset = 0; offset < replay.steps.length;) {
      let end = offset, size = 0
      while(end < replay.steps.length && end - offset < 128) {
        const next = estimateStepSize(replay.steps[end])
        if(end > offset && size + next > maxBatchEstimate) break
        size += next; end++
      }
      await this.request<void>({type: "save-add", steps: replay.steps.slice(offset, end)})
      offset = end
    }
    return this.request<Blob | undefined>({type: "save-finish"})
  }

  /** Allow at most one in-flight seek and one latest waiting seek. */
  seek(time: number, knownRevision: number) {
    return new Promise<ReplaySeekResult>((resolve, reject) => {
      if(this.stopped) { reject(this.stopped); return }
      this.queuedSeek?.reject(new DOMException("Replay seek superseded", "AbortError"))
      this.queuedSeek = {time, knownRevision, resolve, reject}
      this.pumpSeek()
    })
  }

  private pumpSeek() {
    if(this.seeking || !this.queuedSeek || this.stopped) return
    const job = this.queuedSeek; this.queuedSeek = null; this.seeking = true
    void this.request<ReplaySeekResult>({type: "seek", time: job.time, knownRevision: job.knownRevision})
      .then(job.resolve, job.reject).finally(() => { this.seeking = false; this.pumpSeek() })
  }

  close(error = new Error("Replay processing closed")) {
    if(this.stopped) return
    this.stopped = error
    this.worker.terminate()
    this.queuedSeek?.reject(error); this.queuedSeek = null
    for(const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error) }
    this.pending.clear()
  }
}
