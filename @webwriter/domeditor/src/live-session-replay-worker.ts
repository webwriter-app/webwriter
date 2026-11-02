import * as Y from "yjs"
import {advanceCheckpoint, LiveSessionReplayWriter, LiveSessionReplayReader, restoreReplayCheckpoint, type LiveSessionReplay, type ReplayWindow} from "./live-session-replay"
import type {LiveSessionLearnerState, LiveSessionStep} from "./live-session"
import type {RecentFileHandle} from "./recent-documents"
import {createXapiMapper} from "./live-session-xapi"
import {sendReplayToLrs, type ReplayLrsProgress} from "./live-session-replay-lrs"
import type {LrsConfiguration} from "./live-session-lrs"

export type ReplaySaveHandle = Pick<RecentFileHandle, "createWritable">

export type ReplayWorkerRequest = {id: number} & (
  | {type: "open", file: Blob}
  | {type: "seek", time: number, knownRevision: number}
  | {type: "save-start", replay: LiveSessionReplay, handle?: ReplaySaveHandle}
  | {type: "save-add", steps: LiveSessionStep[]}
  | {type: "save-finish"}
  | {type: "export-xapi", handle?: ReplaySaveHandle}
  | {type: "send-lrs", config: LrsConfiguration}
)
export type ReplaySeekResult = {index: number, stepCount: number, revision: number, states?: LiveSessionLearnerState[]}
export type ReplayWorkerResponse = {id: number, result?: LiveSessionReplay | ReplaySeekResult | Blob | number, error?: string, progress?: ReplayLrsProgress}

/** One playback window and its reconstructed documents live in the worker. */
export class ReplayPlayback {
  private window: ReplayWindow | null = null
  private states = new Map<string, LiveSessionLearnerState>()
  private documents = new Map<string, Y.Doc>()
  private count = 0
  private revision = 0
  constructor(readonly reader: LiveSessionReplayReader) {}

  async seek(time: number, knownRevision: number): Promise<ReplaySeekResult> {
    const window = await this.reader.readAt(time)
    let count = 0
    while(count < window.steps.length && window.steps[count].time <= time) count++
    const changed = !this.window || this.window.index !== window.index || count !== this.count
    if(changed) {
      if(!this.window || this.window.index !== window.index || count < this.count) {
        this.documents.forEach(doc => doc.destroy())
        const restored = restoreReplayCheckpoint(window.checkpoint)
        this.documents = restored.documents; this.states = restored.states; this.count = 0
      }
      this.window = window
      try {
        while(this.count < count) advanceCheckpoint(this.states, this.documents, window.steps[this.count++])
      }
      catch(error) {
        this.documents.forEach(doc => doc.destroy()); this.documents.clear(); this.states.clear(); this.window = null; this.count = 0
        throw error
      }
      this.revision++
    }
    return {index: window.index, stepCount: count, revision: this.revision,
      ...(knownRevision !== this.revision ? {states: [...this.states.values()]} : {})}
  }

  close() { this.reader.close(); this.documents.forEach(doc => doc.destroy()); this.documents.clear(); this.states.clear(); this.window = null }
}

/** The handler also permits exercising the worker protocol without a browser. */
export function createReplayWorkerHandler(onProgress?: (id: number, progress: ReplayLrsProgress) => void) {
  let playback: ReplayPlayback | null = null
  let replayFile: Blob | null = null
  let lrsDelivery: AbortController | null = null
  let saving: {writer: LiveSessionReplayWriter, writable?: Awaited<ReturnType<ReplaySaveHandle["createWritable"]>>, parts: Blob[]} | null = null
  const abortSave = async () => {
    if(!saving) return
    const current = saving; saving = null
    current.writer.close()
    await (current.writable as typeof current.writable & {abort?: () => Promise<void>})?.abort?.().catch(() => {})
  }
  return {
    async handle(request: ReplayWorkerRequest): Promise<ReplayWorkerResponse> {
      try {
        if(request.type === "save-start") {
          if(saving) throw new Error("Replay export is already active")
          const writable = await request.handle?.createWritable(), parts: Blob[] = []
          try {
            const writer = await LiveSessionReplayWriter.create(request.replay, async part => { if(writable) await writable.write(part); else parts.push(part) })
            saving = {writer, writable, parts}
          }
          catch(error) { await (writable as typeof writable & {abort?: () => Promise<void>})?.abort?.().catch(() => {}); throw error }
          return {id: request.id}
        }
        if(request.type === "save-add") {
          if(!saving) throw new Error("No replay export is active")
          await saving.writer.append(request.steps)
          return {id: request.id}
        }
        if(request.type === "save-finish") {
          if(!saving) throw new Error("No replay export is active")
          const current = saving
          await current.writer.finish()
          await current.writable?.close()
          saving = null
          return {id: request.id, ...(current.writable ? {} : {result: new Blob(current.parts, {type: "application/octet-stream"})})}
        }
        if(request.type === "open") {
          playback?.close()
          playback = new ReplayPlayback(await LiveSessionReplayReader.open(request.file))
          replayFile = request.file
          return {id: request.id, result: playback.reader.metadata}
        }
        if(request.type === "export-xapi") {
          if(!replayFile) throw new Error("No replay is open")
          const reader = await LiveSessionReplayReader.open(replayFile)
          let writable: Awaited<ReturnType<ReplaySaveHandle["createWritable"]>> | undefined
          const parts: Blob[] = []
          try {
            writable = await request.handle?.createWritable()
            const map = await createXapiMapper(reader.metadata)
            let steps: LiveSessionStep[] | null
            while((steps = await reader.readNext())) {
              const lines: string[] = []
              for(const step of steps) {
                const statement = await map(step)
                if(statement) lines.push(JSON.stringify(statement) + "\n")
              }
              if(lines.length) {
                const part = new Blob(lines, {type: "application/x-ndjson"})
                if(writable) await writable.write(part)
                else parts.push(part)
              }
            }
            await writable?.close()
            return {id: request.id, ...(writable ? {} : {result: new Blob(parts, {type: "application/x-ndjson"})})}
          }
          catch(error) { await (writable as typeof writable & {abort?: () => Promise<void>})?.abort?.().catch(() => {}); throw error }
          finally { reader.close() }
        }
        if(request.type === "send-lrs") {
          if(!replayFile) throw new Error("No replay is open")
          const controller = new AbortController()
          lrsDelivery = controller
          try {
            const count = await sendReplayToLrs(replayFile, request.config, controller.signal, progress => onProgress?.(request.id, progress))
            return {id: request.id, result: count}
          }
          finally { if(lrsDelivery === controller) lrsDelivery = null }
        }
        if(!playback) throw new Error("No replay is open")
        return {id: request.id, result: await playback.seek(request.time, request.knownRevision)}
      }
      catch(error) { await abortSave(); return {id: request.id, error: error instanceof Error ? error.message : String(error)} }
    },
    close() { playback?.close(); playback = null; replayFile = null; lrsDelivery?.abort(); lrsDelivery = null; void abortSave() },
  }
}

if(typeof document === "undefined" && typeof self !== "undefined") {
  const handler = createReplayWorkerHandler((id, progress) => self.postMessage({id, progress} satisfies ReplayWorkerResponse))
  let queue = Promise.resolve()
  self.addEventListener("message", (event: MessageEvent<ReplayWorkerRequest>) => {
    queue = queue.then(async () => { self.postMessage(await handler.handle(event.data)) })
  })
}
