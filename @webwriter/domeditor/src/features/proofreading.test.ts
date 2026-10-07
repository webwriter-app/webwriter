// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import * as Y from "yjs"
import {DOMEditor} from "../domeditor"
import {createProofreader, type ProofreadingIssue} from "../proofreading"
import {proofreadingRuns} from "./proofreading"
import {proofreadingStateChangeEvent} from "../editor-bridge"

vi.mock("../proofreading", async importOriginal => ({...await importOriginal<typeof import("../proofreading")>(), createProofreader: vi.fn()}))

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
  document.documentElement.removeAttribute("spellcheck")
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
  document.documentElement.removeAttribute("spellcheck")
})

async function start() {
  editor.features.proofreading.retry()
  await editor.features.proofreading.checkNow()
  return editor.features.proofreading.state().issues
}

function content(html: string) {
  document.body.innerHTML = html
  editor.doc.syncFromDOM()
  editor.doc.stopCapturing()
}

function issueRects(rects = [new DOMRect(20, 30, 40, 20)], kind: "spelling" | "grammar" | "style" = "spelling") {
  const range = [...highlights.get(`webwriter-${kind}`) as Set<Range>][0]
  vi.spyOn(range, "getClientRects").mockReturnValue(rects as unknown as DOMRectList)
}

function contextMenu(target: Element = document.querySelector("p")!, clientX = 25, clientY = 35) {
  const event = new MouseEvent("contextmenu", {bubbles: true, composed: true, cancelable: true, button: 2, clientX, clientY})
  target.dispatchEvent(event)
  return event
}

function hover(target: Element = document.querySelector("p")!, clientX = 25, clientY = 35) {
  target.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, composed: true, clientX, clientY}))
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
  it("checks manually with automatic checking off without changing the preference or scheduling later checks", async () => {
    editor.features.proofreading.setDocumentChecking(false)
    const before = editor.toHTML()
    editor.features.proofreading.actions.checkProofreading({type: "checkProofreading"})
    await editor.features.proofreading.checkNow()
    const state = editor.features.proofreading.state()
    expect(state).toMatchObject({enabled: true, documentEnabled: false, ready: true, checking: false})
    expect(state.issues).toHaveLength(1)
    expect(editor.toHTML()).toBe(before)
    expect(editor.features.proofreading.selectIssue(state.issues[0].id)).toBe(true)
    check.mockClear()
    document.querySelector("p")!.textContent = "New prose."
    expect(editor.features.proofreading.state()).toMatchObject({enabled: false, documentEnabled: false, issues: []})
    await new Promise(resolve => setTimeout(resolve, 550))
    expect(check).not.toHaveBeenCalled()
    editor.features.proofreading.actions.checkProofreading({type: "checkProofreading"})
    await editor.features.proofreading.checkNow()
    expect(check).toHaveBeenCalledWith("New prose.", "en-US", [])
  })

  it("rejects manual checks while globally disabled or editing is locked", async () => {
    editor.features.proofreading.setDocumentChecking(false)
    const lock = {}
    editor.lockEditing(lock)
    editor.features.proofreading.actions.checkProofreading({type: "checkProofreading"})
    editor.unlockEditing(lock)
    editor.features.proofreading.setChecking(false)
    editor.features.proofreading.actions.checkProofreading({type: "checkProofreading"})
    await editor.features.proofreading.checkNow()
    expect(createProofreader).not.toHaveBeenCalled()
    expect(editor.features.proofreading.state()).toMatchObject({enabled: false, documentEnabled: false})
  })

  it("retries a failed manual check with automatic checking off", async () => {
    editor.features.proofreading.setDocumentChecking(false)
    vi.mocked(createProofreader).mockRejectedValueOnce(new Error("Unavailable"))
    editor.features.proofreading.actions.checkProofreading({type: "checkProofreading"})
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().error).toBe("Unavailable")
    editor.features.proofreading.retry()
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state()).toMatchObject({documentEnabled: false, ready: true, error: null})
    expect(editor.features.proofreading.state().issues).toHaveLength(1)
  })

  it("does not load the checker for globally disabled initialization, even with dictionary words", async () => {
    editor.features.proofreading.setChecking(false)
    editor.features.proofreading.setDictionary(["Teh"])
    await editor.features.proofreading.checkNow()
    expect(createProofreader).not.toHaveBeenCalled()
    expect(document.documentElement.hasAttribute("spellcheck")).toBe(false)
    expect(editor.features.proofreading.state()).toMatchObject({enabled: false, documentEnabled: true, issues: []})
    editor.features.proofreading.setChecking(true)
    await editor.features.proofreading.checkNow()
    expect(createProofreader).toHaveBeenCalledOnce()
    expect(check).toHaveBeenCalledWith("teh example.", "en-US", ["Teh"])
    expect(editor.features.proofreading.state().issues).toEqual([])
  })

  it("stores the document preference without changing its content, with undo and redo", async () => {
    const [issue] = await start()
    issueRects()
    contextMenu()
    const before = document.body.innerHTML
    expect(editor.features.proofreading.actions.setDocumentProofreadingEnabled({type: "setDocumentProofreadingEnabled", enabled: false}))
      .toMatchObject({enabled: false, documentEnabled: false, loading: false, checking: false, issues: []})
    expect(document.body.innerHTML).toBe(before)
    expect(editor.toHTML()).toContain('spellcheck="false"')
    expect(editor.doc.documentAttributes!.getAttribute("spellcheck")).toBe("false")
    expect(highlights.has("webwriter-spelling")).toBe(false)
    expect(editor.appendix.querySelector(".◆proofreading-popup")).toBeNull()
    expect(editor.features.proofreading.selectIssue(issue.id)).toBe(false)
    const calls = check.mock.calls.length
    editor.features.proofreading.retry()
    await editor.features.proofreading.checkNow()
    expect(check).toHaveBeenCalledTimes(calls)
    editor.doc.undo()
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state()).toMatchObject({enabled: true, documentEnabled: true})
    expect(editor.features.proofreading.state().issues).toHaveLength(1)
    editor.doc.redo()
    expect(editor.features.proofreading.state()).toMatchObject({enabled: false, documentEnabled: false, issues: []})
    expect(editor.features.proofreading.setDocumentChecking(true)).toMatchObject({enabled: true, documentEnabled: true})
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().issues).toHaveLength(1)
  })

  it("honours saved and remote document preferences, including while globally disabled", async () => {
    editor.destroy()
    document.documentElement.setAttribute("spellcheck", "false")
    editor = new DOMEditor()
    await start()
    expect(createProofreader).not.toHaveBeenCalled()
    expect(editor.features.proofreading.state()).toMatchObject({enabled: false, documentEnabled: false})
    editor.doc.doc.transact(() => editor.doc.documentAttributes!.removeAttribute("spellcheck"), "remote-peer")
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().issues).toHaveLength(1)
    editor.features.proofreading.setChecking(false)
    expect(document.documentElement.hasAttribute("spellcheck")).toBe(false)
    editor.doc.doc.transact(() => editor.doc.documentAttributes!.setAttribute("spellcheck", "false"), "remote-peer")
    expect(editor.features.proofreading.state()).toMatchObject({enabled: false, documentEnabled: false})
    editor.features.proofreading.setChecking(true)
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state()).toMatchObject({enabled: false, documentEnabled: false, issues: []})
    editor.doc.doc.transact(() => editor.doc.documentAttributes!.removeAttribute("spellcheck"), "remote-peer")
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().issues).toHaveLength(1)
  })

  it("rejects locked document preference changes and cancels globally disabled loading", async () => {
    let finish!: (reader: Awaited<ReturnType<typeof createProofreader>>) => void
    vi.mocked(createProofreader).mockImplementation(() => new Promise(resolve => { finish = resolve }))
    editor.features.proofreading.retry()
    await vi.waitFor(() => expect(finish).toBeDefined())
    const lock = {}
    editor.lockEditing(lock)
    expect(editor.features.proofreading.setDocumentChecking(false)).toBe(false)
    expect(document.documentElement.hasAttribute("spellcheck")).toBe(false)
    editor.unlockEditing(lock)
    const pending = editor.features.proofreading.checkNow()
    editor.features.proofreading.setChecking(false)
    editor.features.proofreading.retry()
    finish({check, dispose})
    await pending
    expect(check).not.toHaveBeenCalled()
    expect(editor.features.proofreading.state()).toMatchObject({enabled: false, documentEnabled: true, loading: false, checking: false, issues: []})
    expect(dispose).toHaveBeenCalledOnce()
  })

  it("anchors popups below the clicked issue line rather than at the pointer", async () => {
    await start()
    issueRects([new DOMRect(20, 30, 40, 20), new DOMRect(5, 60, 20, 20)])
    contextMenu(document.querySelector("p")!, 10, 65)
    const popup = editor.appendix.querySelector<HTMLElement>(".◆proofreading-popup")!
    expect(popup.style.left).toBe("6px")
    expect(popup.style.top).toBe("86px")
  })

  it("keeps popups inside the viewport and flips above when there is no room below", async () => {
    await start()
    const left = innerWidth - 45, top = innerHeight - 30
    issueRects([new DOMRect(left, top, 40, 20)])
    const original = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
      return this.classList.contains("◆proofreading-popup") ? new DOMRect(0, 0, 270, 150) : original.call(this)
    })
    try {
      contextMenu(document.querySelector("p")!, left + 5, top + 5)
      const popup = editor.appendix.querySelector<HTMLElement>(".◆proofreading-popup")!
      expect(popup.style.left).toBe(`${innerWidth - 270 - 6}px`)
      expect(popup.style.top).toBe(`${top - 150 - 6}px`)
    }
    finally { vi.restoreAllMocks() }
  })

  it("keeps opening suggestions on repeated right-clicks without authored artifacts", async () => {
    content('<p>te<!--keep--><em>h</em> example.</p>')
    await start()
    issueRects()
    const before = editor.toHTML(true), shared = editor.doc.body.toString()
    expect(contextMenu().defaultPrevented).toBe(true)
    const popup = editor.appendix.querySelector<HTMLElement>(".◆proofreading-popup")!
    expect(popup.getAttribute("role")).toBe("menu")
    expect(popup.textContent).toContain("Check this spelling.")
    expect(popup.querySelector("button")?.textContent).toBe("the")
    expect(editor.toHTML(true)).toBe(before)
    expect(editor.doc.body.toString()).toBe(shared)
    expect(document.body.querySelector(".◆proofreading-popup")).toBeNull()
    expect(contextMenu().defaultPrevented).toBe(true)
    expect(popup.isConnected).toBe(false)
    expect(editor.appendix.querySelector(".◆proofreading-popup")).not.toBeNull()
    expect(editor.appendix.querySelector(".◆proofreading-popup")!.textContent).not.toContain("Right-click again")
    editor.appendix.querySelector<HTMLButtonElement>(".◆proofreading-popup button")!.click()
    expect(document.querySelector("p")!.textContent).toBe("the example.")
    expect(document.body.innerHTML).toContain("<!--keep-->")
    expect(document.querySelector("em")).not.toBeNull()
    expect(editor.appendix.querySelector(".◆proofreading-popup")).toBeNull()
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(before)
  })

  it("allows the native menu after ignoring a popup issue and keeps it ignored on recheck", async () => {
    await start()
    issueRects()
    const before = editor.toHTML(true)
    hover()
    expect(contextMenu().defaultPrevented).toBe(true)
    const ignore = Array.from(editor.appendix.querySelectorAll<HTMLButtonElement>(".◆proofreading-popup button"))
      .find(button => button.textContent === "Ignore")!
    ignore.click()
    expect(editor.appendix.querySelector(".◆proofreading-popup")).toBeNull()
    expect(editor.features.proofreading.state()).toMatchObject({issues: [], hoveredIssueId: null})
    expect(highlights.has("webwriter-spelling")).toBe(false)
    expect(contextMenu().defaultPrevented).toBe(false)
    await editor.features.proofreading.checkNow()
    expect(contextMenu().defaultPrevented).toBe(false)
    expect(editor.toHTML(true)).toBe(before)
  })

  it("publishes hovered issues only over actual issue rectangles, including wrapped text", async () => {
    const [issue] = await start()
    issueRects([new DOMRect(20, 30, 40, 20), new DOMRect(5, 60, 20, 20)])
    hover()
    expect(editor.features.proofreading.state().hoveredIssueId).toBe(issue.id)
    hover(document.querySelector("p")!, 10, 65)
    expect(editor.features.proofreading.state().hoveredIssueId).toBe(issue.id)
    hover(document.querySelector("p")!, 10, 40)
    expect(editor.features.proofreading.state().hoveredIssueId).toBeNull()
    expect(contextMenu(document.querySelector("p")!, 10, 40).defaultPrevented).toBe(false)
    hover()
    document.querySelector("p")!.dispatchEvent(new PointerEvent("pointerout", {bubbles: true, relatedTarget: null}))
    expect(editor.features.proofreading.state().hoveredIssueId).toBeNull()
  })

  it("dismisses the popup with Escape, outside clicks, scrolling, and window blur", async () => {
    await start()
    issueRects()
    contextMenu()
    const first = editor.appendix.querySelector<HTMLButtonElement>(".◆proofreading-popup button")!
    const escape = new KeyboardEvent("keydown", {key: "Escape", bubbles: true, composed: true, cancelable: true})
    first.dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(true)
    expect(editor.appendix.querySelector(".◆proofreading-popup")).toBeNull()
    contextMenu()
    const outside = new PointerEvent("pointerdown", {button: 0, bubbles: true, cancelable: true})
    outside.preventDefault() // This synthetic DOM has no native caret hit testing.
    document.querySelector("p")!.dispatchEvent(outside)
    expect(editor.appendix.querySelector(".◆proofreading-popup")).toBeNull()
    contextMenu()
    document.dispatchEvent(new Event("scroll"))
    expect(editor.appendix.querySelector(".◆proofreading-popup")).toBeNull()
    hover()
    contextMenu()
    window.dispatchEvent(new Event("blur"))
    expect(editor.appendix.querySelector(".◆proofreading-popup")).toBeNull()
    expect(editor.features.proofreading.state().hoveredIssueId).toBeNull()
  })

  it("ignores widget shadow and unrelated appendix interactions, and native clicks outside issues", async () => {
    content('<p>teh example.</p><atomic-widget></atomic-widget>')
    await start()
    issueRects()
    hover()
    const widget = document.querySelector("atomic-widget")!
    widget.attachShadow({mode: "open"}).innerHTML = "<button>Private</button>"
    const button = widget.shadowRoot!.querySelector("button")!
    hover(button)
    expect(editor.features.proofreading.state().hoveredIssueId).toBeNull()
    expect(contextMenu(button).defaultPrevented).toBe(false)
    const overlay = document.createElement("button")
    editor.addAppendix(overlay)
    expect(contextMenu(overlay).defaultPrevented).toBe(false)
    expect(contextMenu(document.querySelector("p")!, 200, 200).defaultPrevented).toBe(false)
    expect(editor.appendix.querySelector(".◆proofreading-popup")).toBeNull()
  })

  it("cleans stale hover and popup state and rejects disconnected suggestion buttons", async () => {
    await start()
    issueRects()
    hover()
    contextMenu()
    const button = editor.appendix.querySelector<HTMLButtonElement>(".◆proofreading-popup button")!
    document.querySelector("p")!.textContent = "changed remotely"
    expect(editor.features.proofreading.state().hoveredIssueId).toBeNull()
    expect(editor.appendix.querySelector(".◆proofreading-popup")).toBeNull()
    button.click()
    expect(document.querySelector("p")!.textContent).toBe("changed remotely")
  })

  it("dismisses outdated popup suggestions when a recheck changes their order or content", async () => {
    const [issue] = await start()
    issueRects()
    contextMenu()
    const button = editor.appendix.querySelector<HTMLButtonElement>(".◆proofreading-popup button")!
    check.mockResolvedValueOnce([spelling(0, 3, "ten")])
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().issues[0].id).toBe(issue.id)
    expect(editor.appendix.querySelector(".◆proofreading-popup")).toBeNull()
    button.click()
    expect(document.querySelector("p")!.textContent).toBe("teh example.")
  })

  it("forbids popup actions while locked and removes popup and hover state when disabled", async () => {
    await start()
    issueRects()
    const lock = {}
    editor.lockEditing(lock)
    expect(contextMenu().defaultPrevented).toBe(false)
    editor.unlockEditing(lock)
    hover()
    contextMenu()
    editor.features.proofreading.disable()
    expect(editor.appendix.querySelector(".◆proofreading-popup")).toBeNull()
    expect(editor.features.proofreading.state().hoveredIssueId).toBeNull()
    expect(contextMenu().defaultPrevented).toBe(false)
  })

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
      expect(check).toHaveBeenCalledWith("teh changed document.", "en-US", [])
      expect(editor.features.proofreading.state()).toMatchObject({enabled: true, loading: false, ready: true, error: null})
      expect(status.mock.calls.map(([event]) => event.detail)).toContainEqual(expect.objectContaining({enabled: true, loading: false, ready: true, error: null}))
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
      editor.features.proofreading.retry()
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

  it("retains unchanged issue IDs and highlight ranges throughout a recheck", async () => {
    const [issue] = await start()
    const painted = highlights.get("webwriter-spelling") as Set<Range>
    const range = [...painted][0]
    let finish!: (issues: ProofreadingIssue[]) => void
    check.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    editor.features.proofreading.retry()
    const pending = editor.features.proofreading.checkNow()
    await vi.waitFor(() => expect(finish).toBeDefined())
    expect(editor.features.proofreading.state()).toMatchObject({checking: true, issues: [issue]})
    expect(highlights.get("webwriter-spelling")).toBe(painted)
    expect([...painted]).toEqual([range])
    expect(editor.features.proofreading.selectIssue(issue.id)).toBe(true)
    finish([spelling()])
    await pending
    expect(editor.features.proofreading.state()).toMatchObject({checking: false, issues: [issue]})
    expect(highlights.get("webwriter-spelling")).toBe(painted)
    expect([...painted][0]).toBe(range)
  })

  it("keeps all cards until replacement results are ready while removing stale underlines", async () => {
    content('<p>teh first.</p><aside><p>te<!--keep--><em>h</em> second.</p></aside>')
    check.mockImplementation(async text => text.startsWith("teh") ? [spelling()] : [])
    const [changed, unchanged] = await start()
    const painted = highlights.get("webwriter-spelling") as Set<Range>
    const range = [...painted][1]
    document.querySelector("p")!.firstChild!.textContent = "the first."
    expect(editor.features.proofreading.state().issues).toEqual([changed, unchanged])
    expect(editor.features.proofreading.selectIssue(changed.id)).toBe(false)
    expect(highlights.get("webwriter-spelling")).toBe(painted)
    expect([...painted]).toEqual([range])
    let finish!: (issues: ProofreadingIssue[]) => void
    check.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = editor.features.proofreading.checkNow()
    await vi.waitFor(() => expect(finish).toBeDefined())
    expect(editor.features.proofreading.state()).toMatchObject({checking: true, issues: [changed, unchanged]})
    expect(editor.features.proofreading.selectIssue(unchanged.id)).toBe(true)
    finish([])
    await pending
    expect(editor.features.proofreading.state().issues).toEqual([unchanged])
    expect([...painted][0]).toBe(range)
    expect(editor.features.proofreading.applySuggestion(unchanged.id, 0)).toBe(true)
    expect(document.querySelector("aside p")!.textContent).toBe("the second.")
    expect(document.body.innerHTML).toContain("<!--keep-->")
  })

  it("reconciles changed results without retaining resolved issues", async () => {
    const [issue] = await start()
    check.mockResolvedValueOnce([])
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().issues).toEqual([])
    expect(highlights.has("webwriter-spelling")).toBe(false)
    expect(editor.features.proofreading.applySuggestion(issue.id, 0)).toBe(false)
  })

  it("keeps ineligible cards until rechecked and clears retained results when disabled", async () => {
    content('<p>teh first.</p><p>teh second.</p>')
    const [changed, unchanged] = await start()
    document.querySelector("p")!.setAttribute("lang", "de")
    expect(editor.features.proofreading.state().issues).toEqual([changed, unchanged])
    expect(editor.features.proofreading.selectIssue(changed.id)).toBe(false)
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().issues).toHaveLength(1)
    editor.features.proofreading.setChecking(false)
    expect(editor.features.proofreading.state()).toMatchObject({enabled: false, issues: []})
    expect(highlights.has("webwriter-spelling")).toBe(false)
  })

  it("keeps cards and repairs live ranges when intact paragraphs are moved", async () => {
    content('<p>te<!--keep--><em>h</em> first.</p><p>teh second.</p>')
    const [issue] = await start()
    const paragraph = document.querySelector("p")!
    document.body.append(paragraph)
    expect(editor.features.proofreading.state().issues).toContainEqual(issue)
    const painted = highlights.get("webwriter-spelling") as Set<Range>
    const range = [...painted].find(range => range.startContainer === paragraph.firstChild)!
    expect(range.toString()).toBe("teh")
    expect(range.endContainer).toBe(paragraph.querySelector("em")!.firstChild)
    expect(editor.features.proofreading.applySuggestion(issue.id, 0)).toBe(true)
    expect(paragraph.textContent).toBe("the first.")
  })

  it("rejects stale responses after document changes", async () => {
    let finish!: (issues: ProofreadingIssue[]) => void
    check.mockImplementation(() => new Promise<ProofreadingIssue[]>(resolve => { finish = resolve }))
    editor.features.proofreading.retry()
    await vi.waitFor(() => expect(check).toHaveBeenCalled())
    document.querySelector("p")!.firstChild!.textContent = "the example."
    finish([spelling()])
    await vi.waitFor(() => expect(editor.features.proofreading.state().checking).toBe(false))
    expect(editor.features.proofreading.state().issues).toEqual([])
    expect(highlights.has("webwriter-spelling")).toBe(false)
  })

  it("invalidates results after remote collaboration changes", async () => {
    content("<p>teh example.</p><p>teh untouched.</p>")
    const [issue, unchanged] = await start()
    const paragraph = editor.doc.body.firstChild as Y.XmlElement
    const text = paragraph.firstChild as Y.XmlText
    editor.doc.doc.transact(() => { text.delete(0, 3); text.insert(0, "the") }, "remote-peer")
    expect(document.querySelector("p")!.textContent).toBe("the example.")
    expect(editor.features.proofreading.applySuggestion(issue.id, 0)).toBe(false)
    expect(editor.features.proofreading.state().issues).toEqual([issue, unchanged])
    expect(editor.features.proofreading.selectIssue(unchanged.id)).toBe(true)
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

  it("uses the shared style card in the appendix popup and removes its stylesheet on close and disable", async () => {
    content("<p>teh example.</p><p>outside</p>")
    check.mockResolvedValue([{...spelling(), kind: "style"}])
    await start()
    issueRects(undefined, "style")
    const baseSheets = [...editor.appendix.adoptedStyleSheets]
    contextMenu()
    let popup = editor.appendix.querySelector<HTMLElement>(".◆proofreading-popup")!
    const card = popup.querySelector<HTMLElement>(".proofreading-card")!
    const article = card.querySelector("article") ?? card
    expect(popup.getAttribute("aria-label")).toBe("Style suggestions")
    expect(card.querySelector(".proofreading-kind")?.textContent).toBe("Style")
    expect(article.lastElementChild?.classList.contains("proofreading-actions")).toBe(true)
    expect(article.querySelector(".proofreading-suggestions")?.nextElementSibling).toBe(article.lastElementChild)
    expect(article.querySelector(".proofreading-add-word")).toBeNull()
    expect(article.querySelector(".proofreading-ignore")).not.toBeNull()
    expect(editor.appendix.adoptedStyleSheets.length).toBeGreaterThan(baseSheets.length)

    contextMenu(document.querySelectorAll("p")[1], 500, 500)
    expect(editor.appendix.querySelector(".◆proofreading-popup")).toBeNull()
    expect([...editor.appendix.adoptedStyleSheets]).toEqual(baseSheets)

    issueRects(undefined, "style")
    contextMenu()
    popup = editor.appendix.querySelector<HTMLElement>(".◆proofreading-popup")!
    expect(popup).not.toBeNull()
    editor.features.proofreading.disable()
    expect(editor.appendix.querySelector(".◆proofreading-popup")).toBeNull()
    expect([...editor.appendix.adoptedStyleSheets]).toEqual(baseSheets)
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

  it("publishes live issues for Review and removes ignored issues without document UI", async () => {
    const status = vi.spyOn(editor, "postProofreadingState")
    const [issue] = await start()
    expect(status).toHaveBeenLastCalledWith(expect.objectContaining({checking: false, issues: [issue]}))
    expect(editor.features.proofreading.ignore(issue.id)).toBe(true)
    expect(status).toHaveBeenLastCalledWith(expect.objectContaining({issues: []}))
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().issues).toEqual([])
    expect(document.body.innerHTML).not.toContain("button")
    expect(editor.appendix.querySelector(".◆proofreading-panel")).toBeNull()
  })

  it("keeps only the ignored occurrence suppressed when surrounding paragraph text changes", async () => {
    content("<p>teh example and teh again.</p>")
    check.mockImplementation(async text => [...text.matchAll(/\bteh\b/g)].map(match => spelling(match.index, match.index + 3)))
    const [issue] = await start()
    const before = editor.toHTML(true), shared = editor.doc.body.toString()
    expect(editor.features.proofreading.ignore(issue.id)).toBe(true)
    expect(editor.toHTML(true)).toBe(before)
    expect(editor.doc.body.toString()).toBe(shared)
    const text = document.querySelector("p")!.firstChild as Text
    text.insertData(0, "Here is ")
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().issues).toHaveLength(1)
    text.replaceData(text.data.indexOf("example"), 7, "another example")
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().issues).toMatchObject([{start: text.data.lastIndexOf("teh"), text: "teh"}])
    text.appendData(" More prose.")
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().issues).toHaveLength(1)
    expect(editor.toHTML(true)).not.toContain("◆")
    expect(editor.doc.body.toString()).not.toContain("◆")
  })

  it("keeps an ignored phrase across inline formatting after remote edits and undo", async () => {
    content('<p>Intro te<!--keep--><em>h</em> example.</p><p>teh elsewhere.</p>')
    check.mockImplementation(async text => {
      const start = text.indexOf("teh")
      return start < 0 ? [] : [spelling(start, start + 3)]
    })
    const [issue] = await start()
    expect(editor.features.proofreading.ignore(issue.id)).toBe(true)
    const paragraph = editor.doc.body.firstChild as Y.XmlElement
    const text = paragraph.firstChild as Y.XmlText
    editor.doc.doc.transact(() => { text.insert(0, "Remote ") }, "remote-peer")
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().issues).toMatchObject([{text: "teh"}])
    expect(document.querySelectorAll("p")[0].textContent).toBe("Remote Intro teh example.")
    const localText = document.querySelector("p")!.firstChild as Text
    localText.insertData(0, "Local ")
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().issues).toHaveLength(1)
    editor.doc.undo()
    await editor.features.proofreading.checkNow()
    expect(document.querySelector("p")!.textContent).toBe("Remote Intro teh example.")
    expect(editor.features.proofreading.state().issues).toHaveLength(1)
    editor.doc.redo()
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().issues).toHaveLength(1)
    expect(document.querySelector("em")!.textContent).toBe("h")
    expect(document.querySelector("p")!.innerHTML).toContain("<!--keep-->")
  })

  it("reviews changed ignored text and new occurrences after the original is removed", async () => {
    const [issue] = await start()
    expect(editor.features.proofreading.ignore(issue.id)).toBe(true)
    const text = document.querySelector("p")!.firstChild as Text
    text.replaceData(0, 3, "tih")
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().issues).toMatchObject([{text: "tih"}])
    document.querySelector("p")!.remove()
    const paragraph = document.createElement("p")
    paragraph.textContent = "teh example."
    document.body.append(paragraph)
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().issues).toMatchObject([{text: "teh"}])
  })

  it("reviews a different rule on ignored text and clears ignores when disabled", async () => {
    const [issue] = await start()
    expect(editor.features.proofreading.ignore(issue.id)).toBe(true)
    check.mockResolvedValue([{...spelling(), message: "Another spelling rule."}])
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().issues).toHaveLength(1)
    editor.features.proofreading.disable()
    check.mockResolvedValue([spelling()])
    editor.features.proofreading.enable()
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().issues).toHaveLength(1)
  })

  it("adds words from the appendix popup without authored artifacts and rechecks after removal", async () => {
    content('<p>te<!--keep--><em>h</em> example.</p><p>Teh again.</p>')
    const before = editor.toHTML(true), shared = editor.doc.body.toString()
    const [issue] = await start()
    issueRects()
    contextMenu()
    const post = vi.spyOn(editor, "postHostMessage")
    const add = Array.from(editor.appendix.querySelectorAll<HTMLButtonElement>(".◆proofreading-popup button"))
      .find(button => button.textContent === "Add to dictionary")!
    add.click()
    expect(post).toHaveBeenCalledWith({type: "dom-editor-proofreading-dictionary-add", word: "teh"})
    expect(editor.features.proofreading.state().issues).toEqual([])
    expect(editor.appendix.querySelector(".◆proofreading-popup")).toBeNull()
    await editor.features.proofreading.checkNow()
    expect(check).toHaveBeenLastCalledWith("Teh again.", "en-US", ["teh"])
    expect(editor.features.proofreading.state().issues).toEqual([])
    editor.features.proofreading.setDictionary([])
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().issues).toHaveLength(2)
    expect(editor.features.proofreading.addWord(issue.id)).toBe(false)
    expect(editor.toHTML(true)).toBe(before)
    expect(editor.doc.body.toString()).toBe(shared)
  })

  it("rejects dictionary additions for stale, grammar, and locked issues", async () => {
    let [issue] = await start()
    const lock = {}
    editor.lockEditing(lock)
    expect(editor.features.proofreading.addWord(issue.id)).toBe(false)
    editor.unlockEditing(lock)
    document.querySelector("p")!.textContent = "replaced"
    expect(editor.features.proofreading.addWord(issue.id)).toBe(false)
    check.mockResolvedValue([{...spelling(0, 3), kind: "grammar"}])
    ;[issue] = await start()
    expect(editor.features.proofreading.addWord(issue.id)).toBe(false)
    expect(editor.features.proofreading.setDictionary([1] as unknown as string[])).toBe(false)
  })

  it("does not restore accepted words from an in-flight result and restores checking when cleared", async () => {
    const [issue] = await start()
    let finish!: (issues: ProofreadingIssue[]) => void
    check.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = editor.features.proofreading.checkNow()
    await vi.waitFor(() => expect(finish).toBeDefined())
    expect(editor.features.proofreading.addWord(issue.id)).toBe(true)
    finish([spelling()])
    await pending
    expect(editor.features.proofreading.state().issues).toEqual([])
    expect(check).toHaveBeenLastCalledWith("teh example.", "en-US", ["teh"])
    editor.features.proofreading.setDictionary([])
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().issues).toHaveLength(1)
  })

  it("selects current issue ranges across formatting and rejects stale or locked issues", async () => {
    content('<p>te<!--keep--><em>h</em> example.</p>')
    const [issue] = await start()
    const scroll = vi.spyOn(document.querySelector("p")!, "scrollIntoView")
    expect(editor.features.proofreading.selectIssue(issue.id)).toBe(true)
    const selected = document.getSelection()!.getRangeAt(0)
    expect([selected.startContainer, selected.startOffset, selected.endContainer, selected.endOffset])
      .toEqual([document.querySelector("p")!.firstChild, 0, document.querySelector("em")!.firstChild, 1])
    expect(scroll).toHaveBeenCalledWith({block: "nearest"})
    const lock = {}
    editor.lockEditing(lock)
    expect(editor.features.proofreading.selectIssue(issue.id)).toBe(false)
    editor.unlockEditing(lock)
    document.querySelector("p")!.textContent = "changed"
    expect(editor.features.proofreading.selectIssue(issue.id)).toBe(false)
    expect(editor.features.proofreading.state().issues).toEqual([issue])
  })

  it("reports unsupported languages and checking failures, and can retry", async () => {
    document.documentElement.setAttribute("lang", "de-DE")
    await start()
    expect(createProofreader).toHaveBeenCalledOnce()
    expect(editor.features.proofreading.state()).toMatchObject({ready: true, issues: []})
    document.documentElement.setAttribute("lang", "en-US")
    check.mockRejectedValueOnce(new Error("Cannot load checker"))
    await start()
    expect(editor.features.proofreading.state().error).toBe("Cannot load checker")
    await editor.features.proofreading.checkNow()
    expect(editor.features.proofreading.state().error).toBeNull()
    expect(editor.features.proofreading.state().issues).toHaveLength(1)
  })

  it("cleans up its own highlights, observers and checker on destruction", async () => {
    await start()
    highlights.set("webwriter-comments", "preserve")
    editor.features.proofreading.disable()
    expect(highlights.has("webwriter-spelling")).toBe(false)
    expect(highlights.has("webwriter-grammar")).toBe(false)
    expect(highlights.get("webwriter-comments")).toBe("preserve")
    expect(editor.appendix.querySelector(".◆proofreading-panel")).toBeNull()
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce())
    check.mockClear()
    document.querySelector("p")!.textContent = "Changed"
    await editor.features.proofreading.checkNow()
    expect(check).not.toHaveBeenCalled()
  })
})
