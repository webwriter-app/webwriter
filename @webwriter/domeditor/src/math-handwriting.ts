import workerURL from "./math-handwriting-worker.ts?worker&url"
import type {Stroke} from "./math-handwriting-ocr"
import type {HandwritingRequest, HandwritingResponse} from "./math-handwriting-worker"

/** Created only while the handwriting tab is open. */
export class MathHandwritingRecognizer {
  private worker = new Worker(new URL(workerURL, import.meta.url), {type: "module"})
  private sequence = 0
  private pending = new Map<number, {resolve: (mathml: string) => void, reject: (error: Error) => void, timer: ReturnType<typeof setTimeout>}>()
  private stopped = false

  constructor() {
    this.worker.onmessage = (event: MessageEvent<HandwritingResponse>) => {
      const request = this.pending.get(event.data?.id)
      if(!request) return
      this.pending.delete(event.data.id)
      clearTimeout(request.timer)
      if(event.data.error) request.reject(new Error(event.data.error))
      else request.resolve(event.data.mathml ?? "")
    }
    this.worker.onerror = event => {
      event.preventDefault()
      this.dispose(new Error("Could not load handwriting recognition. Reopen the tab to retry."))
    }
    this.worker.onmessageerror = () => this.dispose(new Error("Could not read handwriting recognition results."))
  }

  load() { return this.request() }
  recognize(strokes: Stroke[]) { return this.request(strokes) }

  private request(strokes?: Stroke[]) {
    return new Promise<string>((resolve, reject) => {
      if(this.stopped) { reject(new Error("Handwriting recognition closed")); return }
      const id = ++this.sequence
      const timer = setTimeout(() => this.dispose(new Error("Handwriting recognition timed out. Reopen the tab to retry.")), 120_000)
      this.pending.set(id, {resolve, reject, timer})
      try { this.worker.postMessage({id, strokes} satisfies HandwritingRequest) }
      catch(error) { this.dispose(error instanceof Error ? error : new Error(String(error))) }
    })
  }

  dispose(error = new Error("Handwriting recognition closed")) {
    this.stopped = true
    this.worker.terminate()
    for(const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error) }
    this.pending.clear()
  }
}
