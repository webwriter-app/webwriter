// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import * as Y from "yjs"
import {DOMEditor} from "../domeditor"
import {createProofreader, type ProofreadingIssue} from "../proofreading"
import {proofreadingRuns} from "./proofreading"
import {proofreadingStateChangeEvent} from "../editor-bridge"

vi.mock("../proofreading", () => ({createProofreader: vi.fn()}))

let editor: DOMEditor
let highlights: Map<string, unknown>
let check: ReturnType<typeof vi.fn<(text: string, language: string) => Promise<ProofreadingIssue[]>>>
let dispose: ReturnType<typeof vi.fn<() => Promise<void>>>

const spelling = (start = 0, end = 3, text = "the"): ProofreadingIssue => ({
  start, end, kind: "spelling", message: "Check this spelling.", suggestions: [{kind: "replace", text}],
})

beforeEach(() => {
  document.head.replaceChildren()
  const body = document.createElement("body")
  body.innerHTML = "<p>teh example.</p>"
  document.body.replaceWith(body)
  document.documentElement.setAttribute("lang", "en-US")
  check = vi.fn(async () => [spelling()])
  dispose = vi.fn(async () => {})
  vi.mocked(createProofreader).mockResolvedValue({check, dispose})
  editor = new DOMEditor()
  highlights = new Map()
  vi.stubGlobal("CSS", {highlights, supports: CSS.supports, escape: CSS.escape})
  vi.stubGlobal("Highlight", class extends Set<Range> {
    type = "highlight"
    constructor(...ranges: Range[]) { super(ranges) }
  })
})

afterEach(() => {
  editor.destroy()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  document.documentElement.removeAttribute("lang")
})

async function start(kind: "spelling" | "grammar" | "all" = "all") {
  editor.features.proofreading.open(kind)
  await editor.features.proofreading.checkNow()
  return editor.features.proofreading.state().issues
}

function content(html: string) {
  document.body.innerHTML = html
  editor.doc.syncFromDOM()
  editor.doc.stopCapturing()
}

describe("proofreading prose extraction", () => {
  it("joins inline text without merging block, line break or atomic boundaries", () => {
    content('<section>Loose <b>prose</b><p>One<br>Two <em>words</em></p><unknown-widget>Private</unknown-widget>After<!--keep--><aside>Aside</aside></section>')
    expect(proofreadingRuns(document.body, editor.schema).map(run => run.text)).toEqual([
      "Loose prose", "One", "Two words", "After", "Aside",
    ])
  })

  it("honours inherited languages and excludes non-prose and invisible content", () => {
    content('<p>English<span lang="de">Deutsch</span>Again<span lang="en-GB">Colour</span></p><pre>code</pre><p hidden>hidden</p><p style="display:none">hidden</p><p contenteditable="false">protected</p><svg><text>graphic</text></svg><math><mi>x</mi></math><textarea>input</textarea><template>inert</template>')
    expect(proofreadingRuns(document.body, editor.schema).map(({text, language}) => ({text, language}))).toEqual([
      {text: "English", language: "en-US"}, {text: "Again", language: "en-US"}, {text: "Colour", language: "en-GB"},
    ])
    document.documentElement.setAttribute("lang", "de")
    expect(proofreadingRuns(document.body, editor.schema).map(run => run.text)).toEqual(["Colour"])
  })

  it("checks declared widget light DOM but never enters widget shadow DOM", () => {
    content('<content-widget>Light</content-widget><atomic-widget>Skip</atomic-widget>')
    editor.schema.extendWidgets([{tagName: "content-widget", editingConfig: {content: "#text*"}}])
    document.querySelector("content-widget")!.attachShadow({mode: "open"}).innerHTML = "Private<slot></slot>"
    expect(proofreadingRuns(document.body, editor.schema).map(run => run.text)).toEqual(["Light"])
  })
})

describe("proofreading feature", () => {
  it("keeps editing usable while loading and checks the current DOM once ready", async () => {
    let finish!: (reader: Awaited<ReturnType<typeof createProofreader>>) => void
    vi.mocked(createProofreader).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const status = vi.fn()
    window.addEventListener(proofreadingStateChangeEvent, status)
    try {
      const loading = editor.features.proofreading.checkNow()
      expect(editor.features.proofreading.state()).toMatchObject({enabled: true, loading: true, ready: false, error: null})
      expect(editor.appendix.querySelector(".◆proofreading-panel")).toBeNull()
      expect(check).not.toHaveBeenCalled()
      content("<p>teh changed document.</p>")
      finish({check, dispose})
      await loading
      expect(check).toHaveBeenCalledWith("teh changed document.", "en-US")
      expect(editor.features.proofreading.state()).toMatchObject({enabled: true, loading: false, ready: true, error: null})
      expect(status.mock.calls.map(([event]) => event.detail)).toContainEqual({enabled: true, loading: false, ready: true, error: null})
      expect(editor.appendix.querySelector(".◆proofreading-panel")).toBeNull()
    }
    finally { window.removeEventListener(proofreadingStateChangeEvent, status) }
  })

  it("reports a background load failure without opening UI or repeatedly retrying", async () => {
    vi.useFakeTimers()
    const status = vi.fn()
    window.addEventListener(proofreadingStateChangeEvent, status)
    try {
      let fail!: (error: Error) => void
      vi.mocked(createProofreader).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
      const loading = editor.features.proofreading.checkNow()
      content("<p>teh edit during loading.</p>")
      editor.features.proofreading.state()
      fail(new Error("WASM unavailable"))
      await loading
      expect(editor.features.proofreading.state()).toMatchObject({enabled: true, loading: false, ready: false, error: "WASM unavailable"})
      expect(status.mock.calls.at(-1)![0].detail.error).toBe("WASM unavailable")
      expect(editor.appendix.querySelector(".◆proofreading-panel")).toBeNull()
      content("<p>teh changed.</p>")
      editor.features.proofreading.state()
      await vi.advanceTimersByTimeAsync(1000)
      expect(createProofreader).toHaveBeenCalledOnce()
      editor.features.proofreading.open()
      await editor.features.proofreading.checkNow()
      expect(createProofreader).toHaveBeenCalledTimes(2)
      expect(editor.features.proofreading.state().error).toBeNull()
      expect(editor.features.proofreading.state().issues).toHaveLength(1)
    }
    finally {
      window.removeEventListener(proofreadingStateChangeEvent, status)
      vi.useRealTimers()
    }
  })

  it("cancels a background load when the feature is disabled", async () => {
    vi.mocked(createProofreader).mockImplementationOnce(signal => new Promise((_, reject) => {
      signal!.addEventListener("abort", () => reject(new Error("Canceled")), {once: true})
    }))
    const loading = editor.features.proofreading.checkNow()
    const signal = vi.mocked(createProofreader).mock.calls.at(-1)![0]!
    editor.features.proofreading.disable()
    expect(signal.aborted).toBe(true)
    await loading
    expect(editor.features.proofreading.state()).toMatchObject({enabled: false, loading: false, ready: false, error: null})
  })

  it("loads silently in the background and paints ranges without authored or shared artifacts", async () => {
    expect(createProofreader).not.toHaveBeenCalled()
    content('<p>te<!--authored--><em class="meaning">h</em> example.</p>')
    const before = editor.toHTML(true)
    const shared = editor.doc.body.toString()
    await vi.waitFor(() => expect(editor.features.proofreading.state().ready).toBe(true))
    const issues = editor.features.proofreading.state().issues
    expect(issues).toHaveLength(1)
    const painted = highlights.get("webwriter-spelling") as Set<Range> & {type: string}
    expect(painted.type).toBe("spelling-error")
    expect([...painted][0].toString()).toBe("teh")
    expect(editor.toHTML(true)).toBe(before)
    editor.doc.syncFromDOM()
    expect(editor.doc.body.toString()).toBe(shared)
    expect(editor.toHTML(true)).not.toContain("proofreading")
    expect(editor.appendix.querySelector(".◆proofreading-panel")).toBeNull()
    expect(editor.appendix.querySelector("slot")).not.toBeNull()
  })

  it("uses minimal character edits to retain formatting and authored comments, with undo and redo", async () => {
    content('<p>misp<!--authored--><em class="meaning">elt</em> example.</p>')
    check.mockResolvedValue([spelling(0, 7, "misspelt")])
    const emphasis = document.querySelector("em")!
    const before = editor.toHTML(true)
    const [issue] = await start()
    expect(editor.features.proofreading.applySuggestion(issue.id, 0)).toBe(true)
    expect(document.querySelector("p")!.textContent).toBe("misspelt example.")
    expect(document.querySelector("em")).toBe(emphasis)
    expect(emphasis.textContent).toBe("elt")
    expect(document.body.innerHTML).toContain("<!--authored-->")
    expect(emphasis.className).toBe("meaning")
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(before)
    editor.doc.redo()
    expect(document.querySelector("p")!.textContent).toBe("misspelt example.")
  })

  it("supports removal and insertion-after suggestions without removing elements", async () => {
    content('<p><b>te</b><!--keep--><i>h</i> end.</p>')
    check.mockResolvedValue([{...spelling(), suggestions: [{kind: "remove", text: ""}]}])
    let [issue] = await start()
    expect(editor.features.proofreading.applySuggestion(issue.id, 0)).toBe(true)
    expect(document.querySelector("p")!.textContent).toBe(" end.")
    expect(document.querySelector("b")).not.toBeNull()
    expect(document.querySelector("i")).not.toBeNull()
    expect(document.body.innerHTML).toContain("<!--keep-->")
    check.mockResolvedValue([{...spelling(1, 4), suggestions: [{kind: "insertAfter", text: "!"}]}])
    ;[issue] = await start()
    expect(editor.features.proofreading.applySuggestion(issue.id, 0)).toBe(true)
    expect(document.querySelector("p")!.textContent).toBe(" end!.")
  })

  it("rejects replaced endpoints and edits made before observer delivery", async () => {
    const [issue] = await start()
    document.querySelector("p")!.textContent = "teh example."
    expect(editor.features.proofreading.applySuggestion(issue.id, 0)).toBe(false)
    expect(highlights.has("webwriter-spelling")).toBe(false)
  })

  it("rejects stale responses after document changes", async () => {
    let finish!: (issues: ProofreadingIssue[]) => void
    check.mockImplementation(() => new Promise<ProofreadingIssue[]>(resolve => { finish = resolve }))
    editor.features.proofreading.open()
    await vi.waitFor(() => expect(check).toHaveBeenCalled())
    document.querySelector("p")!.firstChild!.textContent = "the example."
    finish([spelling()])
    await vi.waitFor(() => expect(editor.features.proofreading.state().checking).toBe(false))
    expect(editor.features.proofreading.state().issues).toEqual([])
    expect(highlights.has("webwriter-spelling")).toBe(false)
  })

  it("invalidates results after remote collaboration changes", async () => {
    const [issue] = await start()
    const paragraph = editor.doc.body.firstChild as Y.XmlElement
    const text = paragraph.firstChild as Y.XmlText
    editor.doc.doc.transact(() => { text.delete(0, 3); text.insert(0, "the") }, "remote-peer")
    expect(document.querySelector("p")!.textContent).toBe("the example.")
    expect(editor.features.proofreading.applySuggestion(issue.id, 0)).toBe(false)
  })

  it("does not recheck presentation marker changes or incidental widget shadow input", async () => {
    const [issue] = await start()
    document.querySelector("p")!.classList.add("◆selected")
    expect(editor.features.proofreading.state().issues[0].id).toBe(issue.id)
    const widget = document.createElement("proof-widget")
    document.body.append(widget)
    await start()
    widget.attachShadow({mode: "open"}).innerHTML = "<input>"
    widget.shadowRoot!.querySelector("input")!.dispatchEvent(new CompositionEvent("compositionstart", {bubbles: true, composed: true}))
    expect(editor.features.proofreading.state().issues).toHaveLength(1)
  })

  it("defers checking during composition and forbids suggestions while editing is locked", async () => {
    const [issue] = await start()
    const lock = {}
    editor.lockEditing(lock)
    expect(editor.features.proofreading.applySuggestion(issue.id, 0)).toBe(false)
    editor.unlockEditing(lock)
    document.querySelector("p")!.dispatchEvent(new CompositionEvent("compositionstart", {bubbles: true}))
    const count = check.mock.calls.length
    await editor.features.proofreading.checkNow()
    expect(check).toHaveBeenCalledTimes(count)
    document.querySelector("p")!.dispatchEvent(new CompositionEvent("compositionend", {bubbles: true}))
    await editor.features.proofreading.checkNow()
    expect(check.mock.calls.length).toBeGreaterThan(count)
  })

  it("offers corrections and ignore controls only in the appendix", async () => {
    await start()
    const panel = editor.appendix.querySelector(".◆proofreading-panel")!
    const ignore = Array.from(panel.querySelectorAll("button")).find(button => button.textContent === "Ignore")!
    ignore.click()
    expect(editor.features.proofreading.state().issues).toEqual([])
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().issues).toEqual([])
    expect(document.body.innerHTML).not.toContain("button")
  })

  it("reports unsupported languages and checking failures, and can retry", async () => {
    document.documentElement.setAttribute("lang", "de-DE")
    await start()
    expect(createProofreader).toHaveBeenCalledOnce()
    expect(editor.appendix.querySelector(".◆proofreading-panel")!.textContent).toContain("Harper checks English")
    document.documentElement.setAttribute("lang", "en-US")
    check.mockRejectedValueOnce(new Error("Cannot load checker"))
    await start()
    expect(editor.features.proofreading.state().error).toBe("Cannot load checker")
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().error).toBeNull()
    expect(editor.features.proofreading.state().issues).toHaveLength(1)
  })

  it("cleans up its own highlights, styles, observers and checker on destruction", async () => {
    await start()
    highlights.set("webwriter-comments", "preserve")
    const panelStyles = [...editor.appendix.adoptedStyleSheets]
    editor.features.proofreading.disable()
    expect(highlights.has("webwriter-spelling")).toBe(false)
    expect(highlights.has("webwriter-grammar")).toBe(false)
    expect(highlights.get("webwriter-comments")).toBe("preserve")
    expect(editor.appendix.querySelector(".◆proofreading-panel")).toBeNull()
    expect(editor.appendix.adoptedStyleSheets.length).toBeLessThan(panelStyles.length)
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce())
    check.mockClear()
    document.querySelector("p")!.textContent = "Changed"
    await editor.features.proofreading.checkNow()
    expect(check).not.toHaveBeenCalled()
  })
})
