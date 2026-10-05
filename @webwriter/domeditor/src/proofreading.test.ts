import { beforeEach, describe, expect, it, vi } from "vitest"

const harness = vi.hoisted(() => ({
  setupError: null as Error | null,
  setupPending: false,
  instance: undefined as unknown as {
    setup: ReturnType<typeof vi.fn>
    setDialect: ReturnType<typeof vi.fn>
    clearWords: ReturnType<typeof vi.fn>
    importWords: ReturnType<typeof vi.fn>
    lint: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
    terminate: ReturnType<typeof vi.fn>
    worker: EventTarget
  }
}))

vi.mock("harper.js", () => ({
  Dialect: { American: 0, British: 1, Australian: 2, Canadian: 3, Indian: 4 },
  SuggestionKind: { Replace: 0, Remove: 1, InsertAfter: 2 },
  WorkerLinter: class {
    worker = Object.assign(new EventTarget(), {terminate: vi.fn()})
    disposed = false
    constructor() {
      harness.instance = {
        setup: vi.fn(async () => {
          if(harness.setupError) throw harness.setupError
          if(harness.setupPending) await new Promise(() => {})
        }),
        setDialect: vi.fn(async () => {}),
        clearWords: vi.fn(async () => {}),
        importWords: vi.fn(async () => {}),
        lint: vi.fn(async () => []),
        dispose: vi.fn(async () => {}),
        terminate: this.worker.terminate,
        worker: this.worker,
      }
      Object.assign(this, harness.instance)
    }
  },
}))
vi.mock("harper.js/binary", () => ({ binary: {} }))

import { createProofreader } from "./proofreading.js"

function lint({ start, end, problem, kind = "Spelling" }: {
  start: number
  end: number
  problem: string
  kind?: string
}) {
  const span = { start, end, free: vi.fn() }
  const suggestions = [
    { kind: () => 0, get_replacement_text: () => "the", free: vi.fn() },
    { kind: () => 1, get_replacement_text: () => "", free: vi.fn() },
    { kind: () => 2, get_replacement_text: () => "!", free: vi.fn() },
  ]
  const item = {
    span: () => span,
    get_problem_text: () => problem,
    lint_kind: () => kind,
    message: () => "Example issue",
    suggestions: () => suggestions,
    free: vi.fn(),
  }
  return { item, span, suggestions }
}

describe("Harper proofreader adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    harness.setupError = null
    harness.setupPending = false
  })

  it("warms the worker before resolving and terminates it if setup fails", async () => {
    harness.setupError = new Error("WASM load failed")
    await expect(createProofreader()).rejects.toThrow("WASM load failed")
    expect(harness.instance.setup).toHaveBeenCalledOnce()
    expect(harness.instance.terminate).toHaveBeenCalledOnce()
  })

  it("can cancel background setup and terminate the worker immediately", async () => {
    harness.setupPending = true
    const abort = new AbortController()
    const pending = createProofreader(abort.signal)
    await vi.waitFor(() => expect(harness.instance.setup).toHaveBeenCalledOnce())
    abort.abort()
    await expect(pending).rejects.toThrow("Proofreader has been disposed")
    expect(harness.instance.terminate).toHaveBeenCalledOnce()
  })

  it("rejects worker failures without waiting for the timeout", async () => {
    const proofreader = await createProofreader()
    harness.instance.setDialect.mockImplementation(() => new Promise(() => {}))
    const pending = proofreader.check("text", "en")
    await Promise.resolve()
    harness.instance.worker.dispatchEvent(new Event("error"))
    await expect(pending).rejects.toThrow("Harper worker")
    expect(harness.instance.terminate).toHaveBeenCalledOnce()
  })

  it("preserves Harper UTF-16 spans after astral characters and releases all WASM values", async () => {
    const record = lint({ start: 3, end: 6, problem: "teh" })
    const proofreader = await createProofreader()
    harness.instance.lint.mockResolvedValue([record.item])

    expect(await proofreader.check("😀 teh", "en-GB")).toEqual([{
      start: 3,
      end: 6,
      kind: "spelling",
      message: "Example issue",
      suggestions: [
        { kind: "replace", text: "the" },
        { kind: "remove", text: "" },
        { kind: "insertAfter", text: "!" },
      ],
    }])
    expect(harness.instance.setDialect).toHaveBeenCalledWith(1)
    expect(harness.instance.lint).toHaveBeenCalledWith("😀 teh", { language: "plaintext" })
    expect(record.span.free).toHaveBeenCalledOnce()
    expect(record.suggestions.map((suggestion) => suggestion.free)).toSatisfy((frees: ReturnType<typeof vi.fn>[]) => frees.every((free) => free.mock.calls.length === 1))
    expect(record.item.free).toHaveBeenCalledOnce()
    await proofreader.dispose()
    expect(harness.instance.terminate).toHaveBeenCalledOnce()
  })

  it("uses American English for non-English and unspecified regions and discards mismatched spans", async () => {
    const invalid = lint({ start: 2, end: 5, problem: "wrong" })
    const proofreader = await createProofreader()
    harness.instance.lint.mockResolvedValue([invalid.item])

    expect(await proofreader.check("😀 teh", "en-US")).toEqual([])
    expect(await proofreader.check("😀 teh", "fr-GB")).toEqual([])
    expect(harness.instance.setDialect.mock.calls).toEqual([[0], [0]])
    expect(invalid.item.free).toHaveBeenCalledTimes(2)
    await proofreader.dispose()
  })


  it("confirms Harper 2.10.0 worker-facing WASM spans use UTF-16 offsets", async () => {
    const { LocalLinter } = await vi.importActual<typeof import("harper.js")>("harper.js")
    const { binary } = await vi.importActual<typeof import("harper.js/binary")>("harper.js/binary")
    const linter = new LocalLinter({ binary })
    const lints = await linter.lint("😀 teh", { language: "plaintext" })
    try {
      expect(lints).toHaveLength(1)
      expect(lints[0].lint_kind()).toBe("Typo")
      const span = lints[0].span()
      try {
        expect([span.start, span.end]).toEqual([3, 6])
        expect("😀 teh".slice(span.start, span.end)).toBe(lints[0].get_problem_text())
      } finally {
        span.free()
      }
    } finally {
      for (const lint of lints) lint.free()
      await linter.dispose()
    }
  })

  it("maps the other supported English regions to their dialects", async () => {
    const proofreader = await createProofreader()
    for (const [language, dialect] of [["en-AU", 2], ["en-CA", 3], ["en-IN", 4]] as const) {
      await proofreader.check("", language)
      expect(harness.instance.setDialect).toHaveBeenLastCalledWith(dialect)
    }
    await proofreader.dispose()
  })

  it("imports local words, retains them across dialect changes, and replaces removed words", async () => {
    const proofreader = await createProofreader()
    await proofreader.check("WebWriter", "en-US", ["WebWriter"])
    await proofreader.check("WebWriter", "en-US", ["WebWriter"])
    expect(harness.instance.importWords).toHaveBeenCalledTimes(1)
    await proofreader.check("WebWriter", "en-GB", ["WebWriter"])
    expect(harness.instance.importWords).toHaveBeenCalledTimes(2)
    await proofreader.check("WebWriter", "en-GB", [])
    expect(harness.instance.clearWords).toHaveBeenCalledTimes(3)
    expect(harness.instance.importWords).toHaveBeenCalledTimes(2)
    await proofreader.dispose()
  })

  it("suppresses accepted spelling and typo words case-insensitively while preserving grammar", async () => {
    const proofreader = await createProofreader()
    const typo = lint({start: 0, end: 3, problem: "Teh", kind: "Typo"})
    const grammar = lint({start: 0, end: 3, problem: "Teh", kind: "Agreement"})
    harness.instance.lint.mockResolvedValue([typo.item, grammar.item])
    expect((await proofreader.check("Teh", "en", ["teh"])).map(issue => issue.kind)).toEqual(["grammar"])
    expect(typo.item.free).toHaveBeenCalledOnce()
    expect(typo.span.free).toHaveBeenCalledOnce()
    await proofreader.dispose()
  })

  it("uses Harper's real dictionary to accept unknown words and flag them again after removal", async () => {
    const {LocalLinter} = await vi.importActual<typeof import("harper.js")>("harper.js")
    const {binary} = await vi.importActual<typeof import("harper.js/binary")>("harper.js/binary")
    const linter = new LocalLinter({binary})
    const spellingCount = async () => {
      const lints = await linter.lint("Quuxblorple", {language: "plaintext"})
      try { return lints.filter(lint => lint.lint_kind() === "Spelling").length }
      finally { lints.forEach(lint => lint.free()) }
    }
    try {
      expect(await spellingCount()).toBe(1)
      await linter.importWords(["Quuxblorple"])
      expect(await spellingCount()).toBe(0)
      await linter.clearWords()
      expect(await spellingCount()).toBe(1)
    }
    finally { await linter.dispose() }
  })

  it("includes Harper's common typo rules in spelling and other rules in grammar", async () => {
    const proofreader = await createProofreader()
    const typo = lint({start: 0, end: 3, problem: "teh", kind: "Typo"})
    const grammar = lint({start: 4, end: 6, problem: "is", kind: "Agreement"})
    harness.instance.lint.mockResolvedValue([typo.item, grammar.item])
    expect((await proofreader.check("teh is", "en")).map(issue => issue.kind)).toEqual(["spelling", "grammar"])
    await proofreader.dispose()
  })

  it("terminates promptly when disposed during an in-flight worker request", async () => {
    const proofreader = await createProofreader()
    harness.instance.setDialect.mockImplementation(() => new Promise(() => undefined))
    const pendingCheck = proofreader.check("text", "en")
    await Promise.resolve()

    await proofreader.dispose()
    await expect(pendingCheck).rejects.toThrow("Proofreader has been disposed")
    expect(harness.instance.terminate).toHaveBeenCalledOnce()
    expect(harness.instance.lint).not.toHaveBeenCalled()
  })

  it("terminates the worker when a request times out", async () => {
    vi.useFakeTimers()
    try {
      const proofreader = await createProofreader()
      harness.instance.setDialect.mockImplementation(() => new Promise(() => undefined))
      const pendingCheck = proofreader.check("text", "en")
      await Promise.resolve()

      await vi.advanceTimersByTimeAsync(30_000)
      await expect(pendingCheck).rejects.toThrow("Harper request timed out")
      expect(harness.instance.terminate).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})
