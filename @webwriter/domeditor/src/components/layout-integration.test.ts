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
  target: {localName: "section", namespaceURI: "http://www.w3.org/1999/xhtml", canMoveUp: true, canMoveDown: true},
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
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[data-specialized="table"]')).not.toBeNull()
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
    toolbox.elementStyle = {
      ...styleState("flex"),
      inline: {"margin-right": {value: "var(--ww-float-outset)", priority: ""}},
      computed: {display: "flex", float: "right"},
    }
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Arrangement"]')).toBeNull()
    const group = toolbox.shadowRoot!.querySelector('[role="group"][aria-label="Placement"]')!
    expect(group).not.toBeNull()
    const actions: Array<{type: "setFloat", side: "far-left" | "none" | "far-right", alignment?: "left" | "center" | "right"} | {type: "moveFloat", direction: "up" | "down"}> = []
    toolbox.addEventListener("layout-action", (event: Event) => actions.push((event as CustomEvent).detail))
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(true)
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Style"] [aria-label="Placement"]')).not.toBeNull()
    const allButtons = Array.from(group.querySelectorAll<HTMLButtonElement>("button"))
    expect(allButtons.map(button => button.getAttribute("aria-label")))
      .toEqual(["Move down", "Float left", "No float, align left", "No float, align center", "No float, align right", "Float right", "Move up"])
    expect(allButtons.every(button => button.querySelector("svg") && !button.textContent?.trim())).toBe(true)
    expect(getComputedStyle(group).width).toBe("100%")
    expect(getComputedStyle(group.parentElement!).paddingLeft).toBe("0px")
    expect(getComputedStyle(group.parentElement!).paddingRight).toBe("0px")
    expect(getComputedStyle(allButtons[0]).flexGrow).toBe("0")
    expect(getComputedStyle(allButtons[6]).flexGrow).toBe("0")
    for(const button of [allButtons[0], allButtons[6]]) {
      expect(parseFloat(getComputedStyle(button).paddingLeft))
        .toBeLessThan(parseFloat(getComputedStyle(allButtons[1]).paddingLeft))
      expect(parseFloat(getComputedStyle(button).paddingRight))
        .toBeLessThan(parseFloat(getComputedStyle(allButtons[1]).paddingRight))
      expect(getComputedStyle(button).minHeight).toBe(getComputedStyle(allButtons[1]).minHeight)
      const iconStyle = getComputedStyle(button.querySelector("svg")!)
      const placementIconStyle = getComputedStyle(allButtons[1].querySelector("svg")!)
      expect(parseFloat(iconStyle.width)).toBeLessThan(parseFloat(placementIconStyle.width))
      expect(parseFloat(iconStyle.height)).toBeLessThan(parseFloat(placementIconStyle.height))
    }
    const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"))
    for(const button of buttons) {
      expect(getComputedStyle(button).flexGrow).toBe("1")
      expect(getComputedStyle(button).flexBasis).toBe("0px")
    }
    expect(buttons.map(button => button.textContent?.trim())).toEqual(["", "", "", "", ""])
    expect(buttons.map(button => button.getAttribute("aria-label"))).toEqual(["Float left", "No float, align left", "No float, align center", "No float, align right", "Float right"])
    expect(buttons.every(button => button.querySelector("svg"))).toBe(true)
    expect(group.classList.contains("float-button-group")).toBe(true)
    expect(buttons.map(button => button.getAttribute("aria-pressed"))).toEqual(["false", "false", "false", "false", "true"])
    for(const button of buttons) button.click()
    expect(actions).toEqual([
      {type: "setFloat", side: "far-left"},
      ...["left", "center", "right"].map(alignment => ({type: "setFloat", side: "none", alignment})),
      {type: "setFloat", side: "far-right"},
    ])
    const executed = execute.mock.calls.map(([action]) => action as Record<string, unknown>)
    expect(executed).toEqual(actions.map(action => ({...action, topLevel: true})))
    const down = allButtons[0], up = allButtons[6]
    expect(down.querySelector(".icon-tabler-arrow-down")).not.toBeNull()
    expect(up.querySelector(".icon-tabler-arrow-up")).not.toBeNull()
    up.click(); down.click()
    expect(actions.slice(-2)).toEqual([{type:"moveFloat", direction:"up"}, {type:"moveFloat", direction:"down"}])
    expect(execute.mock.calls.slice(-2).map(([action]) => action as Record<string, unknown>))
      .toEqual(actions.slice(-2).map(action => ({...action, topLevel: true})))
  })

  it("keeps an inline float selection visible when a narrow style overrides it", async () => {
    const {editor, editorWindow} = await mountEditor()
    sendSelection(editor, editorWindow, {inserted: true, layout: layoutState("flex", true)})
    const toolbox = await settle(editor)
    toolbox.elementStyle = {
      ...styleState("flex"),
      inline: {
        float: {value: "right", priority: ""},
        "margin-right": {value: "var(--ww-float-outset)", priority: ""},
      },
      computed: {display: "flex", float: "none"},
    }
    await toolbox.updateComplete
    let buttons = Array.from(toolbox.shadowRoot!.querySelector('[role="group"][aria-label="Placement"]')!
      .querySelectorAll<HTMLButtonElement>("button[aria-pressed]"))
    expect(buttons.map(button => button.getAttribute("aria-pressed")))
      .toEqual(["false", "false", "false", "false", "true"])

    toolbox.elementStyle = {
      ...toolbox.elementStyle!,
      inline: {"margin-right": {value: "var(--ww-float-outset)", priority: ""}},
    }
    await toolbox.updateComplete
    buttons = Array.from(toolbox.shadowRoot!.querySelector('[role="group"][aria-label="Placement"]')!
      .querySelectorAll<HTMLButtonElement>("button[aria-pressed]"))
    expect(buttons.map(button => button.getAttribute("aria-pressed")))
      .toEqual(["false", "false", "true", "false", "false"])
  })

  it.each(["none", "far-right"] as const)("refreshes Placement arrow availability from live sibling state for %s placement", async float => {
    const {editor, editorWindow} = await mountEditor()
    sendSelection(editor, editorWindow, {inserted: true, layout: layoutState("flex", true)})
    const toolbox = await settle(editor)
    const state: ElementStyleState = {...styleState("flex"), target: {...styleState("flex").target!, float}}
    vi.spyOn(editor, "execute").mockResolvedValue(state)
    for(const [canMoveUp, canMoveDown] of [[false, true], [true, true], [true, false], [false, false], [undefined, undefined]]) {
      Object.assign(state.target!, {canMoveUp, canMoveDown})
      await (editor as any).refreshElementStyleState()
      await settle(editor)
      const group = toolbox.shadowRoot!.querySelector('[aria-label="Placement"]')!
      expect(group.querySelector<HTMLButtonElement>('button[aria-label="Move up"]')!.disabled).toBe(!canMoveUp)
      expect(group.querySelector<HTMLButtonElement>('button[aria-label="Move down"]')!.disabled).toBe(!canMoveDown)
      for(const button of group.querySelectorAll<HTMLButtonElement>(".float-move")) {
        expect(Number(getComputedStyle(button).opacity || "1")).toBe(button.disabled ? .4 : 1)
        expect(getComputedStyle(button).cursor).toBe(button.disabled ? "default" : "pointer")
      }
    }
  })

  it.each(["left", "center", "right"] as const)("reflects refreshed no-float %s alignment and moves only the icon square", async alignment => {
    const {editor, editorWindow} = await mountEditor()
    sendSelection(editor, editorWindow, {inserted: true, layout: layoutState("flex", true)})
    const toolbox = await settle(editor)
    vi.spyOn(editor, "execute").mockResolvedValue({...styleState("flex"), target: {...styleState("flex").target!, float: "none", alignment}})
    await (editor as any).refreshElementStyleState()
    await settle(editor)
    const group = toolbox.shadowRoot!.querySelector('[aria-label="Placement"]')!
    expect(group.querySelector('[aria-pressed="true"]')!.getAttribute("aria-label")).toBe(`No float, align ${alignment}`)
    const icons = ["left", "center", "right"].map(side => group.querySelector(`button[aria-label="No float, align ${side}"] svg`)!)
    const paths = icons.map(icon => Array.from(icon.querySelectorAll("path"), path => path.getAttribute("d")))
    expect(new Set(paths.map(path => path[1])).size).toBe(3)
    expect(paths[1].slice(2)).toEqual(paths[0].slice(2))
    expect(paths[2].slice(2)).toEqual(paths[0].slice(2))
    toolbox.htmlPending = true
    await toolbox.updateComplete
    expect(Array.from(group.querySelectorAll<HTMLButtonElement>("button")).every(button => button.disabled)).toBe(true)
  })

  it("places layout controls inside Style below the presets without a separate drawer", async () => {
    const {editor, editorWindow} = await mountEditor()
    sendSelection(editor, editorWindow, {inserted: true, layout: layoutState("flex", true)})
    const toolbox = await settle(editor)
    toolbox.elementStyle = {...styleState("flex"), target: {...styleState("flex").target!, float: "far-left"}}
    await toolbox.updateComplete
    const drawer = toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Style"]')!
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Layout"]')).toBeNull()
    const controls = drawer.querySelector(".float-action-controls")!
    expect(controls.previousElementSibling?.matches("element-style-editor[show-presets]")).toBe(true)
    expect(controls.nextElementSibling?.getAttribute("slot")).toBe("more")
    expect(controls.querySelector(".float-button-group")!.previousElementSibling?.textContent).toBe("Placement")
    const actions: unknown[] = []
    toolbox.addEventListener("layout-action", (event: Event) => actions.push((event as CustomEvent).detail))
    vi.spyOn(editor, "execute").mockResolvedValue(true)
    controls.querySelector<HTMLButtonElement>('button[aria-label="No float, align center"]')!.click()
    expect(actions).toEqual([{type: "setFloat", side: "none", alignment: "center"}])
    toolbox.elementStyle = {...toolbox.elementStyle, target: {...toolbox.elementStyle.target!, float: "none"}}
    await toolbox.updateComplete
    for(const label of ["Move down", "Move up"]) {
      const button = controls.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
      expect(button.disabled).toBe(false)
      button.click()
    }
    expect(actions.slice(-2)).toEqual([{type: "moveFloat", direction: "down"}, {type: "moveFloat", direction: "up"}])
    toolbox.historyState = {...toolbox.historyState, preview: {checkpointId: "version", isCurrent: false, added: 0, removed: 0, modified: 0}}
    await toolbox.updateComplete
    for(const button of controls.querySelectorAll<HTMLButtonElement>(".float-move")) expect(button.disabled).toBe(true)
  })

  it.each(["none", "right"])("keeps class-authored left placement selected when the responsive float is %s", async float => {
    const {editor, editorWindow} = await mountEditor()
    sendSelection(editor, editorWindow, {inserted: true, layout: layoutState("flex", true)})
    const toolbox = await settle(editor)
    toolbox.elementStyle = {
      ...styleState("flex"),
      target: {...styleState("flex").target!, float: "far-left"},
      inline: {},
      computed: {display: "flex", float},
    }
    await toolbox.updateComplete
    const buttons = Array.from(toolbox.shadowRoot!.querySelector('[role="group"][aria-label="Placement"]')!
      .querySelectorAll<HTMLButtonElement>("button[aria-pressed]"))
    expect(buttons.map(button => button.getAttribute("aria-pressed"))).toEqual(["true", "false", "false", "false", "false"])
  })

  it.each(["none", "right"])("preserves the chosen placement through host style refresh when responsive CSS computes %s", async float => {
    const {editor, editorWindow} = await mountEditor()
    sendSelection(editor, editorWindow, {inserted: true, layout: layoutState("flex", true)})
    const toolbox = await settle(editor)
    const state: ElementStyleState = {
      ...styleState("flex"),
      target: {...styleState("flex").target!, float: "far-right"},
      computed: {display: "flex", float},
    }
    vi.spyOn(editor, "execute").mockImplementation(async action => {
      if(action.type === "getStyleState") return state
      if(action.type === "setFloat") {
        state.target!.float = action.side as "none" | "far-left" | "far-right"
        return true
      }
      return null
    })
    await (editor as any).refreshElementStyleState()
    await settle(editor)
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Float left"]')!.click()
    await Promise.resolve()
    await (editor as any).refreshElementStyleState()
    await settle(editor)
    const buttons = Array.from(toolbox.shadowRoot!.querySelector('[role="group"][aria-label="Placement"]')!
      .querySelectorAll<HTMLButtonElement>("button[aria-pressed]"))
    expect(buttons.map(button => button.getAttribute("aria-pressed"))).toEqual(["true", "false", "false", "false", "false"])
  })

  it("offers layout choices in the Document drawer and reflects the current layout", async () => {
    const {editor} = await mountEditor()
    const toolbox = await settle(editor)
    toolbox.activeTool = "Edit"
    toolbox.documentSelected = true
    await toolbox.updateComplete

    toolbox.documentLayout = {mode: "document", canConvert: true, zoom: 100}
    await toolbox.updateComplete
    const drawer = toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Document"]')!
    expect(drawer).not.toBeNull()
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Layouts"]')).toBeNull()
    const choices = drawer.querySelector('[role="group"][aria-label="Layouts"]')!
    const buttons = Array.from(choices.querySelectorAll<HTMLButtonElement>("button[data-mode]"))
    expect(buttons.map(button => button.dataset.mode)).toEqual(["document", "canvas", "slides", "board"])
    expect(buttons.map(button => button.getAttribute("aria-pressed"))).toEqual(["true", "false", "false", "false"])
    expect(buttons.map(button => button.disabled)).toEqual([true, false, false, false])

    const changes: unknown[] = []
    toolbox.addEventListener("document-layout-change", (event: Event) => changes.push((event as CustomEvent).detail))
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(false)
    buttons[1].click()
    expect(changes).toEqual([{mode: "canvas"}])
    expect(execute).toHaveBeenCalledWith({type: "setDocumentLayout", mode: "canvas", expectedMode: "document"})
    await settle(editor)

    toolbox.documentLayout = {...toolbox.documentLayout, mode: "canvas"}
    await toolbox.updateComplete
    expect(buttons.map(button => button.getAttribute("aria-pressed"))).toEqual(["false", "true", "false", "false"])
    expect(buttons.map(button => button.disabled)).toEqual([false, true, false, false])
  })

  it.each(["board", "slides"] as const)("offers layout switching for the selected %s document", async mode => {
    const {editor, editorWindow} = await mountEditor()
    sendSelection(editor, editorWindow, {
      path: [{path: [], name: mode === "board" ? "Board" : "Slides"}],
      nodeSelected: true,
      documentLayout: {mode, canConvert: true, zoom: 100},
    })
    const toolbox = await settle(editor)
    toolbox.selectTool("Edit")
    await toolbox.updateComplete

    expect(toolbox.documentSelected).toBe(true)
    const choices = toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Document"] [aria-label="Layouts"]')!
    expect(choices.querySelectorAll("button[data-mode]")).toHaveLength(4)
    expect(choices.querySelector(`[data-mode="${mode}"]`)!.getAttribute("aria-pressed")).toBe("true")
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(false)
    choices.querySelector<HTMLButtonElement>('[data-mode="document"]')!.click()
    expect(execute).toHaveBeenCalledWith({type: "setDocumentLayout", mode: "document", expectedMode: mode})
    await settle(editor)
  })

  it.each(["canvas", "slides"] as const)("withholds float and former block controls in %s", async mode => {
    const {editor} = await mountEditor()
    const toolbox = await settle(editor)
    toolbox.activeTool = "Edit"
    toolbox.elementStyle = styleState("grid")
    toolbox.documentLayout = {...toolbox.documentLayout, mode}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector('[role="group"][aria-label="Placement"]')).toBeNull()
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Block layout"]')).toBeNull()
  })
})
