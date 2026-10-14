import {LocalLinter, Dialect, SuggestionKind} from "harper.js"
import {slimBinary} from "harper.js/slimBinary"
import type {Proofreader, ProofreadingIssue, ProofreadingText, ProofreadingWorkerRequest, ProofreadingWorkerResponse} from "./proofreading"

function dialectForLanguage(language: string) {
  if(!/^en(?:-|$)/i.test(language)) return Dialect.American
  switch(language.replaceAll("_", "-").split("-")[1]?.toUpperCase()) {
    case "GB": return Dialect.British
    case "AU": return Dialect.Australian
    case "CA": return Dialect.Canadian
    case "IN": return Dialect.Indian
    default: return Dialect.American
  }
}

/** Public Harper APIs, confined to this worker so WASM never reaches the frame. */
export async function createLocalProofreader(): Promise<Proofreader> {
  const linter = new LocalLinter({binary: slimBinary})
  await linter.setup()
  let currentDialect: number | undefined
  let dictionaryKey = "[]"
  let disposed = false
  const checkBatch = async (runs: readonly ProofreadingText[], dictionary: readonly string[] = []) => {
    if(disposed) throw new Error("Proofreader has been disposed")
    const wordSet = new Set(dictionary.map(word => word.toLowerCase()))
    const nextDictionaryKey = JSON.stringify(dictionary)
    const results: ProofreadingIssue[][] = []
    for(const run of runs) {
      const dialect = dialectForLanguage(run.language)
      if(currentDialect !== dialect) await linter.setDialect(dialect)
      if(currentDialect !== dialect || dictionaryKey !== nextDictionaryKey) {
        await linter.clearWords()
        if(dictionary.length) await linter.importWords([...dictionary])
        currentDialect = dialect
        dictionaryKey = nextDictionaryKey
      }
      // The one-to-one projection keeps native DOM UTF-16 offsets intact.
      const source = run.text.replaceAll("\u00a0", " ")
      const lints = await linter.lint(source, {language: "plaintext"})
      const issues: ProofreadingIssue[] = []
      let lintIndex = 0
      try {
        for(; lintIndex < lints.length; lintIndex++) {
          const lint = lints[lintIndex]
          let span: ReturnType<typeof lint.span> | undefined
          let suggestions: ReturnType<typeof lint.suggestions> = []
          try {
            span = lint.span()
            const problemText = lint.get_problem_text()
            const {start, end} = span
            if(!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > source.length
              || source.slice(start, end) !== problemText) continue
            const lintKind = lint.lint_kind().toLowerCase()
            const kind = ["spelling", "typo"].includes(lintKind) ? "spelling"
              : ["style", "wordchoice", "miscellaneous"].includes(lintKind) ? "style" : "grammar"
            if(kind === "spelling" && wordSet.has(problemText.toLowerCase())) continue
            suggestions = lint.suggestions()
            issues.push({start, end, kind, message: lint.message(), suggestions: suggestions.map(suggestion => ({
              kind: suggestion.kind() === SuggestionKind.Remove ? "remove"
                : suggestion.kind() === SuggestionKind.InsertAfter ? "insertAfter" : "replace",
              text: suggestion.get_replacement_text(),
            }))})
          }
          finally {
            suggestions.forEach(suggestion => suggestion.free())
            span?.free()
            lint.free()
          }
        }
      }
      catch(error) {
        lints.slice(lintIndex + 1).forEach(lint => lint.free())
        throw error
      }
      results.push(issues)
    }
    return results
  }
  return {
    async check(text, language, dictionary = []) {return (await checkBatch([{text, language}], dictionary))[0]},
    checkBatch,
    async dispose() {if(!disposed) {disposed = true; await linter.dispose()}},
  }
}

if(typeof document === "undefined" && typeof self !== "undefined") {
  const scope = self as unknown as {
    addEventListener(type: "message", listener: (event: MessageEvent<ProofreadingWorkerRequest>) => void): void
    postMessage(message: ProofreadingWorkerResponse): void
  }
  let reader: Promise<Proofreader> | null = null
  let queue: Promise<void> = Promise.resolve()
  scope.addEventListener("message", event => {
    const request = event.data
    queue = queue.then(async () => {
      try {
        reader ??= createLocalProofreader()
        const instance = await reader
        const result = request.type === "setup" ? [] : await instance.checkBatch!(request.runs, request.dictionary)
        scope.postMessage({id: request.id, result})
      }
      catch(error) {scope.postMessage({id: request.id, error: error instanceof Error ? error.message : String(error)})}
    })
  })
}
