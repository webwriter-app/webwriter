import workerModuleURL from "./proofreading-worker.ts?worker&url"

export type ProofreadingIssue = {
  start: number
  end: number
  kind: "spelling" | "grammar" | "style"
  message: string
  suggestions: { kind: "replace" | "remove" | "insertAfter"; text: string }[]
}

export type ProofreadingText = {text: string, language: string}

export interface Proofreader {
  check(text: string, language: string, dictionary?: readonly string[]): Promise<ProofreadingIssue[]>
  checkBatch?(runs: readonly ProofreadingText[], dictionary?: readonly string[]): Promise<ProofreadingIssue[][]>
  dispose(): Promise<void>
}

export type ProofreadingWorkerOperation = {type: "setup"}
  | {type: "check", runs: readonly ProofreadingText[], dictionary: readonly string[]}
export type ProofreadingWorkerRequest = ProofreadingWorkerOperation & {id: number}
export type ProofreadingWorkerResponse = {id: number, result?: ProofreadingIssue[][], error?: string}

export function normalizeProofreadingDictionary(value: unknown): string[] {
  if(!Array.isArray(value)) return []
  const words = new Map<string, string>()
  for(const entry of value) {
    if(typeof entry !== "string") continue
    const word = entry.trim()
    if(word && !/\s/u.test(word) && !words.has(word.toLowerCase())) words.set(word.toLowerCase(), word)
  }
  return [...words.values()]
}

/** Keep Harper and its WASM wrappers in one worker; only plain results cross. */
export async function createProofreader(signal?: AbortSignal): Promise<Proofreader> {
  signal?.throwIfAborted()
  const moduleURL = new URL(workerModuleURL, import.meta.url).href
  const worker = new Worker(moduleURL, {type: "module"})
  const pending = new Map<number, {resolve: (value: ProofreadingIssue[][]) => void, reject: (error: Error) => void, timer: ReturnType<typeof setTimeout>}>()
  let sequence = 0
  let stopped: Error | null = null
  const stop = (error: Error) => {
    if(stopped) return
    stopped = error
    worker.removeEventListener("message", onMessage)
    worker.removeEventListener("error", onError)
    worker.removeEventListener("messageerror", onError)
    signal?.removeEventListener("abort", onAbort)
    worker.terminate()
    for(const request of pending.values()) {clearTimeout(request.timer); request.reject(error)}
    pending.clear()
  }
  const onMessage = (event: MessageEvent<ProofreadingWorkerResponse>) => {
    const data = event.data
    const request = pending.get(data?.id)
    if(!request) return
    pending.delete(data.id)
    clearTimeout(request.timer)
    if(data.error) {
      const error = new Error(data.error)
      request.reject(error)
      stop(error)
    }
    else request.resolve(data.result ?? [])
  }
  const onError = (event: Event) => {
    event.preventDefault()
    stop(new Error("Could not start or communicate with the Harper worker"))
  }
  const onAbort = () => stop(new Error("Proofreader has been disposed"))
  worker.addEventListener("message", onMessage)
  worker.addEventListener("error", onError)
  worker.addEventListener("messageerror", onError)
  signal?.addEventListener("abort", onAbort, {once: true})
  const request = (operation: ProofreadingWorkerOperation) => new Promise<ProofreadingIssue[][]>((resolve, reject) => {
    if(stopped) {reject(stopped); return}
    const id = ++sequence
    const timer = setTimeout(() => stop(new Error("Harper request timed out")), 30_000)
    pending.set(id, {resolve, reject, timer})
    try { worker.postMessage({...operation, id} satisfies ProofreadingWorkerRequest) }
    catch(error) {stop(error instanceof Error ? error : new Error(String(error)))}
  })
  try { await request({type: "setup"}) }
  catch(error) {stop(error instanceof Error ? error : new Error(String(error))); throw error}
  const checkBatch = async (runs: readonly ProofreadingText[], dictionary: readonly string[] = []) => {
    if(stopped) throw stopped
    const words = normalizeProofreadingDictionary(dictionary)
    const results: ProofreadingIssue[][] = []
    // Bound each RPC's work and payload while avoiding one round trip per run.
    for(let index = 0; index < runs.length; index += 256) {
      const texts = runs.slice(index, index + 256).map(({text, language}) => ({text, language}))
      results.push(...await request({type: "check", runs: texts, dictionary: words}))
    }
    return results
  }
  return {
    async check(text, language, dictionary = []) {return (await checkBatch([{text, language}], dictionary))[0]},
    checkBatch,
    async dispose() {stop(new Error("Proofreader has been disposed"))},
  }
}
