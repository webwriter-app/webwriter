import {describe, expect, it} from "vitest"
import {
  aiEditReviewEvent,
  executeCompleteEvent,
  executeFailureEvent,
  initializeEditorMessage,
  isAIEditReviewMessage,
  isExecuteResponse,
  isInitializeEditorMessage,
  isLoadWidgetsMessage,
  isMarkStateChangeMessage,
  isPresenceChangeMessage,
  isSelectionChangeMessage,
  loadWidgetsMessage,
  markStateChangeEvent,
  presenceChangeEvent,
  selectionChangeEvent,
} from "./editor-bridge"

type MessageGuard = (value: unknown) => boolean

function expectAllRejected(guard: MessageGuard, values: unknown[]) {
  for(const value of values) {
    expect(guard(value), `unexpectedly accepted ${JSON.stringify(value)}`).toBe(false)
  }
}

describe("editor bridge message guards", () => {
  it("accepts only complete AI review decisions", () => {
    expect(isAIEditReviewMessage({
      type: aiEditReviewEvent,
      detail: {editId: "edit-1", action: "accept"},
    })).toBe(true)
    expect(isAIEditReviewMessage({
      type: aiEditReviewEvent,
      detail: {editId: "edit-1", action: "reject"},
    })).toBe(true)

    expectAllRejected(isAIEditReviewMessage, [
      null,
      {type: aiEditReviewEvent},
      {type: aiEditReviewEvent, detail: {editId: 1, action: "accept"}},
      {type: aiEditReviewEvent, detail: {editId: "edit-1", action: "preview"}},
    ])
  })

  it("requires initial-state updates to contain byte values", () => {
    expect(isInitializeEditorMessage({
      type: initializeEditorMessage,
      syncUrl: "ws://localhost/session",
    })).toBe(true)
    expect(isInitializeEditorMessage({
      type: initializeEditorMessage,
      syncUrl: "ws://localhost/session",
      initialState: {update: [0, 127, 255]},
    })).toBe(true)

    expectAllRejected(isInitializeEditorMessage, [
      {type: initializeEditorMessage, syncUrl: 42},
      {type: initializeEditorMessage, syncUrl: "", initialState: null},
      {type: initializeEditorMessage, syncUrl: "", initialState: {update: "0,1"}},
      {type: initializeEditorMessage, syncUrl: "", initialState: {update: [-1]}},
      {type: initializeEditorMessage, syncUrl: "", initialState: {update: [1.5]}},
      {type: initializeEditorMessage, syncUrl: "", initialState: {update: [256]}},
    ])
  })

  it("validates widget references and supplied package collections", () => {
    expect(isLoadWidgetsMessage({
      type: loadWidgetsMessage,
      widgets: [{name: "@webwriter/example", version: "1.2.3"}],
      packages: [{
        name: "@webwriter/example",
        version: "1.2.3",
        members: [],
        scripts: [],
        styles: [],
      }],
    })).toBe(true)

    expectAllRejected(isLoadWidgetsMessage, [
      {type: loadWidgetsMessage, widgets: null},
      {type: loadWidgetsMessage, widgets: [null]},
      {type: loadWidgetsMessage, widgets: [{name: "example", version: 1}]},
      {type: loadWidgetsMessage, widgets: [], packages: {}},
      {type: loadWidgetsMessage, widgets: [], packages: [null]},
      {type: loadWidgetsMessage, widgets: [], packages: [{
        name: "example",
        version: "1.0.0",
        members: {},
        scripts: [],
        styles: [],
      }]},
    ])
  })

  it("recognizes execution responses by event type and request id", () => {
    expect(isExecuteResponse({
      type: executeCompleteEvent,
      detail: {requestId: "request-1", result: {ok: true}},
    })).toBe(true)
    expect(isExecuteResponse({
      type: executeFailureEvent,
      detail: {requestId: "request-2", error: {name: "Error", message: "Failed"}},
    })).toBe(true)

    expectAllRejected(isExecuteResponse, [
      {type: "dom-editor-execute-progress", detail: {requestId: "request-1"}},
      {type: executeCompleteEvent},
      {type: executeCompleteEvent, detail: {requestId: 1}},
    ])
  })

  it("validates every optional selection-state payload", () => {
    const message = {
      type: selectionChangeEvent,
      detail: {
        path: [
          {path: [], name: "Document", icon: "Document"},
          {path: [0], name: "Example widget", iconUrl: "https://example.test/icon.svg"},
        ],
        nodeSelected: true,
        capture: false,
        gap: {parentPath: [0], offset: 1},
        list: {type: "menu", style: "square"},
        media: {type: "picture", attributes: {src: "photo.png", alt: "Photo"}},
        graphic: {
          active: true,
          capture: true,
          selectionCount: 1,
          shape: "rectangle",
          parameters: {width: "800", fill: "#60a5fa"},
          options: {grid: true, snap: true, guides: false},
          layers: [{
            index: 0,
            label: "Milestone",
            type: "rectangle",
            selected: true,
            primary: true,
            visible: true,
            locked: false,
          }],
          viewport: {zoom: 150},
        },
      },
    }
    expect(isSelectionChangeMessage(message)).toBe(true)

    expectAllRejected(isSelectionChangeMessage, [
      {...message, detail: {...message.detail, path: [{path: [0, -1], name: "Paragraph"}]}},
      {...message, detail: {...message.detail, path: [{path: [0.5], name: "Paragraph"}]}},
      {...message, detail: {...message.detail, nodeSelected: "true"}},
      {...message, detail: {...message.detail, gap: {parentPath: [0], offset: -1}}},
      {...message, detail: {...message.detail, list: {type: "table", style: ""}}},
      {...message, detail: {...message.detail, media: {type: "canvas", attributes: {}}}},
      {...message, detail: {...message.detail, media: {type: "img", attributes: []}}},
      {...message, detail: {...message.detail, media: {type: "img", attributes: {width: 640}}}},
      {...message, detail: {...message.detail, graphic: {active: true, capture: true, shape: "path"}}},
      {...message, detail: {...message.detail, graphic: {active: true, capture: "true"}}},
      {...message, detail: {...message.detail, graphic: {active: true, capture: true, parameters: {width: 800}}}},
      {...message, detail: {...message.detail, graphic: {active: true, capture: true, selectionCount: -1}}},
      {...message, detail: {...message.detail, graphic: {active: true, capture: true, selectionCount: 1.5}}},
      {...message, detail: {...message.detail, graphic: {active: true, capture: true, options: {grid: true, snap: "true", guides: true}}}},
      {...message, detail: {...message.detail, graphic: {active: true, capture: true, layers: [{index: 0, label: "Shape"}]}}},
      {...message, detail: {...message.detail, graphic: {active: true, capture: true, layers: [{
        index: -1, label: "Shape", type: "rectangle", selected: false, primary: false, visible: true, locked: false,
      }]}}},
      {...message, detail: {...message.detail, graphic: {active: true, capture: true, viewport: {zoom: 10}}}},
      {...message, detail: {...message.detail, graphic: {active: true, capture: true, viewport: {zoom: "150"}}}},
    ])
  })

  it("rejects noncanonical marks, unsupported styles, and unsafe attributes", () => {
    const message = {
      type: markStateChangeEvent,
      detail: {
        canMark: true,
        marks: ["b", "a"],
        styles: {"font-family": "serif", color: "#123456"},
        attributes: {a: {href: "https://example.test", target: "_blank"}},
      },
    }
    expect(isMarkStateChangeMessage(message)).toBe(true)

    expectAllRejected(isMarkStateChangeMessage, [
      {...message, detail: {...message.detail, marks: ["strong"]}},
      {...message, detail: {...message.detail, styles: {"font-weight": "bold"}}},
      {...message, detail: {...message.detail, styles: {color: 123}}},
      {...message, detail: {...message.detail, attributes: {strong: {href: "https://example.test"}}}},
      {...message, detail: {...message.detail, attributes: {a: {onclick: "alert(1)"}}}},
      {...message, detail: {...message.detail, attributes: {a: {href: 42}}}},
    ])
  })

  it("requires complete presence-user records with integer client ids", () => {
    const message = {
      type: presenceChangeEvent,
      detail: {users: [{clientId: 7, name: "Ada", initials: "AL", color: "#336699"}]},
    }
    expect(isPresenceChangeMessage(message)).toBe(true)
    expect(isPresenceChangeMessage({type: presenceChangeEvent, detail: {users: []}})).toBe(true)

    expectAllRejected(isPresenceChangeMessage, [
      {type: presenceChangeEvent, detail: {users: null}},
      {type: presenceChangeEvent, detail: {users: [null]}},
      {...message, detail: {users: [{clientId: 7.5, name: "Ada", initials: "AL", color: "#336699"}]}},
      {...message, detail: {users: [{clientId: 7, name: "Ada", initials: "AL"}]}},
    ])
  })
})
