import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

const harness = vi.hoisted(() => ({
  binary: undefined as unknown,
  linterOptions: undefined as unknown,
  results: [] as unknown[][],
  instance: undefined as unknown as {
    setup: ReturnType<typeof vi.fn>
    setDialect: ReturnType<typeof vi.fn>
    clearWords: ReturnType<typeof vi.fn>
    importWords: ReturnType<typeof vi.fn>
    lint: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
  },
}))

vi.mock("harper.js", () => ({
  Dialect: {American: 0, British: 1, Australian: 2, Canadian: 3, Indian: 4},
  SuggestionKind: {Replace: 0, Remove: 1, InsertAfter: 2},
  LocalLinter: class {
    constructor(options: unknown) {
      harness.linterOptions = options
      harness.instance = {
        setup: vi.fn(async () => {}),
        setDialect: vi.fn(async () => {}),
        clearWords: vi.fn(async () => {}),
        importWords: vi.fn(async () => {}),
        lint: vi.fn(async () => harness.results.shift() ?? []),
        dispose: vi.fn(async () => {}),
      }
      Object.assign(this, harness.instance)
    }
  },
}))
vi.mock("harper.js/slimBinary", () => ({slimBinary: harness.binary = {name: "slim-binary"}}))

import {createLocalProofreader} from "./proofreading-worker.js"

function lint({start, end, problem, kind = "Spelling"}: {
  start: number
  end: number
  problem: string
  kind?: string
}) {
  const span = {start, end, free: vi.fn()}
  const suggestions = [
    {kind: () => 0, get_replacement_text: () => "the", free: vi.fn()},
    {kind: () => 1, get_replacement_text: () => "", free: vi.fn()},
    {kind: () => 2, get_replacement_text: () => "!", free: vi.fn()},
  ]
  const item = {
    span: () => span,
    get_problem_text: () => problem,
    lint_kind: () => kind,
    message: () => "Example issue",
    suggestions: () => suggestions,
    free: vi.fn(),
  }
  return {item, span, suggestions}
}

describe("Harper worker engine", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    harness.results = []
    harness.binary = {name: "slim-binary"}
  })

  afterEach(() => vi.restoreAllMocks())

  it("converts Harper lints to plain issues, retains UTF-16 offsets, and frees wrappers", async () => {
    const record = lint({start: 3, end: 6, problem: "teh", kind: "Typo"})
    harness.results = [[record.item]]
    const proofreader = await createLocalProofreader()

    expect(await proofreader.check("😀 teh", "en-GB")).toEqual([{
      start: 3,
      end: 6,
      kind: "spelling",
      message: "Example issue",
      suggestions: [
        {kind: "replace", text: "the"},
        {kind: "remove", text: ""},
        {kind: "insertAfter", text: "!"},
      ],
    }])
    expect(harness.linterOptions).toEqual({binary: harness.binary})
    expect(harness.instance.setDialect).toHaveBeenCalledWith(1)
    expect(harness.instance.lint).toHaveBeenCalledWith("😀 teh", {language: "plaintext"})
    expect(record.span.free).toHaveBeenCalledOnce()
    expect(record.suggestions.every(suggestion => suggestion.free.mock.calls.length === 1)).toBe(true)
    expect(record.item.free).toHaveBeenCalledOnce()
    await proofreader.dispose()
    expect(harness.instance.dispose).toHaveBeenCalledOnce()
  })

  it("checks a batch in order across dialects and updates the dictionary only when needed", async () => {
    const proofreader = await createLocalProofreader()
    const runs = [
      {text: "first", language: "en-GB"},
      {text: "second", language: "en-GB"},
      {text: "third", language: "en-AU"},
      {text: "fourth", language: "en-AU"},
    ]
    expect(await proofreader.checkBatch!(runs, ["WebWriter"])).toEqual([[], [], [], []])
    expect(harness.instance.lint.mock.calls.map(([text]) => text)).toEqual(["first", "second", "third", "fourth"])
    expect(harness.instance.setDialect.mock.calls).toEqual([[1], [2]])
    expect(harness.instance.clearWords).toHaveBeenCalledTimes(2)
    expect(harness.instance.importWords.mock.calls).toEqual([[["WebWriter"]], [["WebWriter"]]])
    await proofreader.dispose()
  })

  it("normalizes NBSP for Harper while keeping the original source offsets", async () => {
    const record = lint({start: 3, end: 10, problem: "the the", kind: "Repetition"})
    harness.results = [[record.item]]
    const proofreader = await createLocalProofreader()
    const text = "😀\u00a0the\u00a0the"
    const issues = await proofreader.check(text, "en-US")
    expect(harness.instance.lint).toHaveBeenCalledWith("😀 the the", {language: "plaintext"})
    expect(issues).toMatchObject([{start: 3, end: 10, kind: "grammar"}])
    expect(text.slice(issues[0].start, issues[0].end)).toBe("the\u00a0the")
    expect(record.span.free).toHaveBeenCalledOnce()
    expect(record.item.free).toHaveBeenCalledOnce()
    await proofreader.dispose()
  })

  it("suppresses accepted spelling case-insensitively and keeps grammar issues", async () => {
    const typo = lint({start: 0, end: 3, problem: "Teh", kind: "Typo"})
    const grammar = lint({start: 0, end: 3, problem: "Teh", kind: "Agreement"})
    harness.results = [[typo.item, grammar.item]]
    const proofreader = await createLocalProofreader()

    expect((await proofreader.check("Teh", "en", ["teh"])).map(value => value.kind)).toEqual(["grammar"])
    expect(typo.item.free).toHaveBeenCalledOnce()
    expect(typo.span.free).toHaveBeenCalledOnce()
    await proofreader.dispose()
  })

  it("frees all WASM wrappers when converting a suggestion fails", async () => {
    const failing = lint({start: 0, end: 3, problem: "teh"})
    const remaining = lint({start: 0, end: 3, problem: "teh"})
    failing.suggestions[0].get_replacement_text = () => {throw new Error("conversion failed")}
    harness.results = [[failing.item, remaining.item]]
    const proofreader = await createLocalProofreader()
    await expect(proofreader.check("teh", "en")).rejects.toThrow("conversion failed")
    expect(failing.suggestions.every(suggestion => suggestion.free.mock.calls.length === 1)).toBe(true)
    expect(failing.span.free).toHaveBeenCalledOnce()
    expect(failing.item.free).toHaveBeenCalledOnce()
    expect(remaining.item.free).toHaveBeenCalledOnce()
    await proofreader.dispose()
  })

  it("uses the installed slim Harper binary for UTF-16 spans and user dictionary updates", async () => {
    const {LocalLinter} = await vi.importActual<typeof import("harper.js")>("harper.js")
    const {slimBinary} = await vi.importActual<typeof import("harper.js/slimBinary")>("harper.js/slimBinary")
    const linter = new LocalLinter({binary: slimBinary})
    await linter.setup()
    try {
      const lints = await linter.lint("😀 teh", {language: "plaintext"})
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
        lints.forEach(value => value.free())
      }

      const spellingCount = async () => {
        const values = await linter.lint("Quuxblorple", {language: "plaintext"})
        try {return values.filter(value => value.lint_kind() === "Spelling").length}
        finally {values.forEach(value => value.free())}
      }
      expect(await spellingCount()).toBe(1)
      await linter.importWords(["Quuxblorple"])
      expect(await spellingCount()).toBe(0)
      await linter.clearWords()
      expect(await spellingCount()).toBe(1)
    } finally {
      await linter.dispose()
    }
  })
})
