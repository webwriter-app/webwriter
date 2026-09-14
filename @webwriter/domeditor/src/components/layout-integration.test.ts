// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {DomEditor} from "./dom-editor"
import type {DomEditorToolbox} from "./toolbox"
import type {AppRibbon} from "./ribbon"
import type {RibbonDrawer} from "./ribbon-drawer"
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
  selectedRowGroup: "tbody" as const,
  rowGroups: [],
  canAddHeaderGroup: true,
  canAddFooterGroup: true,
  columnGroups: [],
  cellSemantics: {role: "data" as const, headers: "", abbr: ""},
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
      .toBe("Edit Grid layout")

    sendSelection(editor, editorWindow, {layout: layoutState("flex")})
    toolbox = await settle(editor)
    expect(toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[data-tool="Edit"]')!.getAttribute("aria-label"))
      .toBe("Edit Flex layout")

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

  it("forwards each layout action to the host executor once", async () => {
    const {editor, editorWindow} = await mountEditor()
    sendSelection(editor, editorWindow, {inserted: true, layout: layoutState("grid")})
    const toolbox = await settle(editor)
    const layoutEditor = toolbox.shadowRoot!.querySelector<HTMLElement>("layout-editor")!
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(true)
    const action = {
      type: "setLayoutStyles" as const,
      styles: {gap: {value: "2rem", priority: "" as const}},
      target: "container" as const,
    }

    layoutEditor.dispatchEvent(new CustomEvent("layout-action", {
      detail: action,
      bubbles: true,
      composed: true,
    }))
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
    expect(execute).toHaveBeenCalledWith(action)
  })

  it("executes a preset insertion and keeps the gallery open with an error on failure", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Elements"]')!
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(false)

    drawer.openDrawer(true)
    await drawer.updateComplete
    drawer.querySelector<HTMLButtonElement>('[data-layout-id="two-columns"]')!.click()
    await vi.waitFor(() => expect(ribbon.layoutInsertionError).toContain("valid insertion point"))
    expect(drawer.hasAttribute("drawer-open")).toBe(true)
    expect(drawer.querySelector('[role="alert"]')?.textContent).toContain("valid insertion point")

    execute.mockResolvedValue(true)
    drawer.querySelector<HTMLButtonElement>('[data-layout-id="two-columns"]')!.click()
    await vi.waitFor(() => expect(execute).toHaveBeenLastCalledWith({type: "insertLayout", preset: "two-columns"}))
  })
})
