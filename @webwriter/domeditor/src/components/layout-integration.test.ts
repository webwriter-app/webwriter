// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {DomEditor} from "./dom-editor"
import type {DomEditorToolbox} from "./toolbox"
import {
  executeCompleteEvent,
  loadWidgetsMessage,
  selectionChangeEvent,
  type ElementStyleState,
} from "../editor-bridge"
import type {LayoutSelectionState} from "../layouts"
import {WebWriterPackageRegistry} from "../packages"

const styleState = (display: "grid" | "flex"): ElementStyleState => ({
  target: {localName: "section", namespaceURI: "http://www.w3.org/1999/xhtml"},
  inline: {display: {value: display, priority: ""}},
  computed: {display},
  context: {display, parentDisplay: "block"},
})

const layoutState = (kind: "grid" | "flex" = "grid", item = false): LayoutSelectionState => ({
  kind,
  item,
  columns: {tracks: ["minmax(0, 1fr)", "1fr"], automatic: 0, reason: null},
  rows: {tracks: ["auto"], automatic: 1, reason: null},
  style: styleState(kind),
})

const tableState = {
  active: true,
  cellSelection: false,
  rows: 2,
  columns: 2,
  selectedCells: 1,
  canMerge: false,
  canSplit: false,
  hasCaption: false,
  hasHeader: false,
  hasFooter: false,
}

const completePackageLoad = (editorWindow: Window) => {
  const postMessage = vi.spyOn(editorWindow, "postMessage").mockImplementation((message: any) => {
    if(message?.type !== loadWidgetsMessage || typeof message.requestId !== "string") return
    queueMicrotask(() => window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: executeCompleteEvent,
        detail: {requestId: message.requestId, result: undefined},
        bridgeNonce: message.bridgeNonce,
      },
      source: editorWindow,
      origin: window.location.origin,
    })))
  })
  return postMessage
}

const mountEditor = async () => {
  const editor = new DomEditor()
  Object.assign(editor, {frameStarted: true})
  document.body.append(editor)
  await editor.updateComplete
  const iframe = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.editor-frame")!
  const editorWindow = iframe.contentWindow!
  completePackageLoad(editorWindow)
  iframe.dispatchEvent(new Event("load"))
  return {editor, editorWindow}
}

const sendSelection = (
  editor: DomEditor,
  editorWindow: Window,
  detail: Record<string, unknown>,
) => window.dispatchEvent(new MessageEvent("message", {
  data: {
    type: selectionChangeEvent,
    bridgeNonce: (editor as any).bridgeNonce,
    detail: {
      path: [{path: [], name: "Document"}, {path: [0], name: "Section"}],
      ...detail,
    },
  },
  source: editorWindow,
  origin: window.location.origin,
}))

const settle = async (editor: DomEditor) => {
  await editor.updateComplete
  const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
  await toolbox.updateComplete
  await Promise.resolve()
  await toolbox.updateComplete
  return toolbox
}

afterEach(async () => {
  const frames = [
    ...document.body.querySelectorAll<HTMLIFrameElement>("iframe"),
    ...Array.from(document.body.querySelectorAll<DomEditor>("dom-editor"))
      .flatMap(editor => Array.from(editor.shadowRoot?.querySelectorAll<HTMLIFrameElement>("iframe") ?? [])),
  ]
  frames.forEach(frame => frame.remove())
  document.body.replaceChildren()
  vi.restoreAllMocks()
  await (window as unknown as {happyDOM: {abort(): Promise<void>}}).happyDOM.abort()
})

beforeEach(() => {
  vi.spyOn(WebWriterPackageRegistry.prototype, "search").mockResolvedValue([])
})

describe("layout host and toolbox integration", () => {
  it("mirrors valid layout state and labels grid, flex, and table contexts", async () => {
    const {editor, editorWindow} = await mountEditor()
    const grid = layoutState("grid")
    sendSelection(editor, editorWindow, {layout: grid})
    let toolbox = await settle(editor)

    expect((editor as any).layoutSelection).toEqual(grid)
    expect(toolbox.layout).toEqual(grid)
    expect(toolbox.activeTool).toBeNull()
    expect(toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[data-tool="Edit"]')!.getAttribute("aria-label"))
      .toBe("Edit")

    sendSelection(editor, editorWindow, {layout: layoutState("flex")})
    toolbox = await settle(editor)
    expect(toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[data-tool="Edit"]')!.getAttribute("aria-label"))
      .toBe("Edit")

    sendSelection(editor, editorWindow, {table: tableState})
    toolbox = await settle(editor)
    expect((editor as any).layoutSelection).toBeNull()
    expect(toolbox.layout).toBeNull()
    toolbox.selectTool("Edit")
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[data-tool="Edit"]')!.getAttribute("aria-label"))
      .toBe("Edit Table")
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Layout"]')).not.toBeNull()
  })

  it("opens Edit only for the local inserted selection", async () => {
    const {editor, editorWindow} = await mountEditor()
    let toolbox = await settle(editor)
    sendSelection(editor, editorWindow, {layout: layoutState("grid")})
    toolbox = await settle(editor)
    expect(toolbox.activeTool).toBeNull()

    sendSelection(editor, editorWindow, {inserted: true, layout: layoutState("grid")})
    toolbox = await settle(editor)
    expect(toolbox.activeTool).toBe("Edit")

    toolbox.selectTool(null)
    sendSelection(editor, editorWindow, {layout: layoutState("grid")})
    toolbox = await settle(editor)
    expect(toolbox.activeTool).toBeNull()
  })

  it("withholds the old layout editor and insertion presets", async () => {
    const {editor, editorWindow} = await mountEditor()
    sendSelection(editor, editorWindow, {inserted: true, layout: layoutState("grid")})
    const toolbox = await settle(editor)
    expect(toolbox.shadowRoot!.querySelector("layout-editor")).toBeNull()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    expect(ribbon.shadowRoot!.querySelector(".layout-gallery, .layout-opener")).toBeNull()
  })

  it("uses float controls for authored content instead of arrangement controls", async () => {
    const {editor, editorWindow} = await mountEditor()
    sendSelection(editor, editorWindow, {inserted: true, layout: layoutState("flex", true)})
    const toolbox = await settle(editor)
    toolbox.elementStyle = {...styleState("flex"), computed: {display: "flex", float: "right"}}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Arrangement"]')).toBeNull()
    const group = toolbox.shadowRoot!.querySelector('[role="group"][aria-label="Float"]')!
    expect(group).not.toBeNull()
    const actions: unknown[] = []
    toolbox.addEventListener("layout-action", (event: Event) => actions.push((event as CustomEvent).detail))
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(true)
    const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>("button"))
    expect(buttons.map(button => button.getAttribute("aria-pressed"))).toEqual(["false", "false", "true"])
    for(const button of buttons) button.click()
    expect(actions).toEqual(["left", "none", "right"].map(side => ({type: "setFloat", side})))
    expect(execute.mock.calls.map(([action]) => action)).toEqual(actions)
  })

  it("exposes narrow preview in the document layout drawer", async () => {
    const {editor} = await mountEditor()
    const toolbox = await settle(editor)
    toolbox.activeTool = "Edit"
    toolbox.documentSelected = true
    await toolbox.updateComplete

    const drawer = toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Layouts"]')!
    const button = drawer.querySelector<HTMLButtonElement>('button[aria-label="Narrow preview (360 px)"]')!
    expect(button.title).toBe("Narrow preview (360 px)")
    expect(button.getAttribute("aria-pressed")).toBe("false")

    const changes: unknown[] = []
    toolbox.addEventListener("document-width-preview-change", (event: Event) => changes.push((event as CustomEvent).detail))
    button.click()
    expect(changes).toEqual([{narrow: true}])

    toolbox.narrowLayoutPreview = true
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Layouts"] button[aria-label="Narrow preview (360 px)"]')!
      .getAttribute("aria-pressed")).toBe("true")
  })

  it.each(["canvas", "slides"] as const)("withholds float and former block controls in %s", async mode => {
    const {editor} = await mountEditor()
    const toolbox = await settle(editor)
    toolbox.activeTool = "Edit"
    toolbox.elementStyle = styleState("grid")
    toolbox.documentLayout = {...toolbox.documentLayout, mode}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector('[role="group"][aria-label="Float"]')).toBeNull()
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Block layout"]')).toBeNull()
  })
})
