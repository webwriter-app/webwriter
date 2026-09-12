// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {html, nothing, render} from "lit"
import {bindEditingUI, type EditingUIProperties, type EditingUIListeners} from "./editing-ui-bindings"
import {AppRibbon} from "./ribbon"
import {DomEditorToolbox} from "./toolbox"
import "./ribbon"
import "./toolbox"
import {emptyVersionHistoryState} from "../editor-bridge"
import {emptyRubyState} from "../marks"

const containers: HTMLElement[] = []
afterEach(() => {
  containers.forEach(container => render(nothing, container))
  containers.length = 0
  document.body.replaceChildren()
})

const properties = (): EditingUIProperties => ({
  canMark: false,
  canSection: false,
  sectionType: "section",
  sectionActive: false,
  sectionSelected: false,
  marks: [],
  markStyles: {},
  markAttributes: {},
  ruby: {...emptyRubyState},
  commentState: {canComment: false, active: false, text: "", activeCount: 0, count: 0, highlighting: true},
  listType: null,
  listStyle: "",
  orderedList: undefined,
  headingGroup: null,
  figure: null,
  media: null,
  dialog: null,
  graphic: null,
  layout: null,
  layoutError: "",
  elementAttributes: null,
  elementStyle: {target: null, inline: {}, computed: {}, context: {display: "", parentDisplay: ""}},
  historyState: emptyVersionHistoryState(),
  historyLoading: false,
  historyError: "",
})

const view = (state: EditingUIProperties, listeners: EditingUIListeners) => html`
  <app-ribbon ${bindEditingUI(state, listeners)}></app-ribbon>
  <dom-editor-toolbox ${bindEditingUI(state, listeners)}></dom-editor-toolbox>
`

const mount = (state: EditingUIProperties, listeners: EditingUIListeners) => {
  const container = document.createElement("div")
  containers.push(container)
  document.body.append(container)
  const part = render(view(state, listeners), container)
  const surfaces = [container.querySelector<AppRibbon>("app-ribbon")!, container.querySelector<DomEditorToolbox>("dom-editor-toolbox")!]
  return {container, part, surfaces}
}

const command = (surfaces: (AppRibbon | DomEditorToolbox)[]) => surfaces.forEach(surface => {
  surface.dispatchEvent(new CustomEvent("ribbon-button-click", {detail: {label: "mark:b"}}))
})

describe("shared editing UI bindings", () => {
  it("updates both surfaces and forwards each command once across rerenders", async () => {
    const listener = vi.fn()
    const listeners = {"ribbon-button-click": listener}
    const state = properties()
    const {container, surfaces} = mount(state, listeners)
    await Promise.all(surfaces.map(surface => surface.updateComplete))
    command(surfaces)
    expect(listener).toHaveBeenCalledTimes(2)

    const next: EditingUIProperties = {...state, canMark: true, marks: ["b"], media: {type: "img", attributes: {alt: "New description"}}}
    render(view(next, listeners), container)
    await Promise.all(surfaces.map(surface => surface.updateComplete))
    surfaces.forEach(surface => {
      expect(surface.canMark).toBe(true)
      expect(surface.marks).toEqual(["b"])
      expect(surface.media?.attributes.alt).toBe("New description")
    })
    command(surfaces)
    expect(listener).toHaveBeenCalledTimes(4)
    expect(listener.mock.calls.every(([event]) => event.detail.label === "mark:b")).toBe(true)
  })

  it("replaces handlers and removes them while disconnected or removed", () => {
    const oldListener = vi.fn()
    const listener = vi.fn()
    const state = properties()
    const {container, part, surfaces} = mount(state, {"ribbon-button-click": oldListener})
    render(view(state, {"ribbon-button-click": listener}), container)
    command(surfaces)
    expect(oldListener).not.toHaveBeenCalled()
    expect(listener).toHaveBeenCalledTimes(2)

    part.setConnected(false)
    command(surfaces)
    expect(listener).toHaveBeenCalledTimes(2)
    part.setConnected(true)
    command(surfaces)
    expect(listener).toHaveBeenCalledTimes(4)

    render(nothing, container)
    command(surfaces)
    expect(listener).toHaveBeenCalledTimes(4)
  })
})
