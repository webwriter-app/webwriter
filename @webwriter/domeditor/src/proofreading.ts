export type ProofreadingIssue = {
  start: number
  end: number
  kind: "spelling" | "grammar"
  message: string
  suggestions: { kind: "replace" | "remove" | "insertAfter"; text: string }[]
}

export interface Proofreader {
  check(text: string, language: string, dictionary?: readonly string[]): Promise<ProofreadingIssue[]>
  dispose(): Promise<void>
}

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

type HarperApi = typeof import("harper.js")
const REQUEST_TIMEOUT_MS = 30_000

function dialectForLanguage(language: string, Dialect: HarperApi["Dialect"]) {
  if (!/^en(?:-|$)/i.test(language)) return Dialect.American
  const region = language.replaceAll("_", "-").split("-")[1]?.toUpperCase()

  switch (region) {
    case "GB":
      return Dialect.British
    case "AU":
      return Dialect.Australian
    case "CA":
      return Dialect.Canadian
    case "IN":
      return Dialect.Indian
    default:
      return Dialect.American
  }
}

export async function createProofreader(signal?: AbortSignal): Promise<Proofreader> {
  const [{ WorkerLinter, Dialect, SuggestionKind }, { binary }] = await Promise.all([
    import("harper.js"),
    import("harper.js/binary"),
  ])
  signal?.throwIfAborted()
  const linter = new WorkerLinter({ binary })
  let disposed = false
  let queue: Promise<void> = Promise.resolve()
  let currentDialect: number | undefined
  let dictionaryKey = "[]"
  let resolveStopped: () => void = () => undefined
  const stopped = new Promise<void>((resolve) => {
    resolveStopped = resolve
  })
  const worker = (linter as unknown as { worker: Worker }).worker
  let rejectWorkerFailure: (error: Error) => void = () => undefined
  const workerFailure = new Promise<never>((_, reject) => { rejectWorkerFailure = reject })
  // A worker can fail between requests; the next request still sees the error.
  void workerFailure.catch(() => {})
  const onWorkerError = (event: Event) => {
    event.preventDefault()
    rejectWorkerFailure(new Error("Could not start or communicate with the Harper worker"))
  }
  const terminateWorker = () => {
    // WorkerLinter 2.10.0 leaves RPCs pending after a worker error. Its dispose
    // method is also an RPC, so terminate the pinned-version worker directly.
    worker.removeEventListener("error", onWorkerError)
    worker.removeEventListener("messageerror", onWorkerError)
    signal?.removeEventListener("abort", onAbort)
    worker.terminate()
  }
  const onAbort = () => {
    if (disposed) return
    disposed = true
    terminateWorker()
    resolveStopped()
  }
  worker.addEventListener("error", onWorkerError)
  worker.addEventListener("messageerror", onWorkerError)
  signal?.addEventListener("abort", onAbort, {once: true})
  const withTimeout = async <T>(operation: Promise<T>): Promise<T> => {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        operation,
        workerFailure,
        stopped.then(() => { throw new Error("Proofreader has been disposed") }),
        new Promise<T>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Harper request timed out")), REQUEST_TIMEOUT_MS)
        }),
      ])
    } catch (error) {
      if (!disposed) {
        disposed = true
        terminateWorker()
        resolveStopped()
      }
      throw error
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
    }
  }

  try {
    // Resolve only once the bundled WASM and the worker are ready to check.
    await withTimeout(linter.setup())
  } catch (error) {
    if (!disposed) {
      disposed = true
      terminateWorker()
      resolveStopped()
    }
    throw error
  }

  return {
    check(text, language, dictionary = []) {
      if (disposed) return Promise.reject(new Error("Proofreader has been disposed"))
      const words = normalizeProofreadingDictionary(dictionary)
      const wordSet = new Set(words.map(word => word.toLowerCase()))
      const nextDictionaryKey = JSON.stringify(words)

      const check = queue.then(() => {
        if (disposed) throw new Error("Proofreader has been disposed")
        return withTimeout((async () => {
          const dialect = dialectForLanguage(language, Dialect)
          await linter.setDialect(dialect)
          // Harper rebuilds its dictionary when the dialect changes.
          if(currentDialect !== dialect || dictionaryKey !== nextDictionaryKey) {
            await linter.clearWords()
            if(words.length) await linter.importWords(words)
            currentDialect = dialect
            dictionaryKey = nextDictionaryKey
          }
          const lints = await linter.lint(text, { language: "plaintext" })
          const issues: ProofreadingIssue[] = []
          let lintIndex = 0
          try {
            for (; lintIndex < lints.length; lintIndex++) {
              const lint = lints[lintIndex]
              let span: ReturnType<typeof lint.span> | undefined
              let suggestions: ReturnType<typeof lint.suggestions> = []
              try {
                span = lint.span()
                const problemText = lint.get_problem_text()
                const { start, end } = span
                if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > text.length || text.slice(start, end) !== problemText) continue
                const kind = ["spelling", "typo"].includes(lint.lint_kind().toLowerCase()) ? "spelling" : "grammar"
                // Named typo rules can still flag an explicitly accepted word.
                if(kind === "spelling" && wordSet.has(problemText.toLowerCase())) continue

                suggestions = lint.suggestions()
                issues.push({
                  start,
                  end,
                  kind,
                  message: lint.message(),
                  suggestions: suggestions.map((suggestion) => ({
                    kind: suggestion.kind() === SuggestionKind.Remove
                      ? "remove"
                      : suggestion.kind() === SuggestionKind.InsertAfter
                        ? "insertAfter"
                        : "replace",
                    text: suggestion.get_replacement_text(),
                  })),
                })
              } finally {
                for (const suggestion of suggestions) suggestion.free()
                span?.free()
                lint.free()
              }
            }
          } catch (error) {
            // Lints after the failing item still own WASM allocations.
            for (const remaining of lints.slice(lintIndex + 1)) remaining.free()
            throw error
          }
          return issues
        })())
      })
      queue = check.then(() => undefined, () => undefined)
      return check
    },
    async dispose() {
      if (disposed) return
      disposed = true
      terminateWorker()
      resolveStopped()
      await queue
    },
  }
}
