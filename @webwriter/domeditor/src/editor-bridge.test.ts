import {describe, expect, it} from "vitest"
import {
  aiEditReviewEvent,
  executeCompleteEvent,
  executeFailureEvent,
  initializeEditorMessage,
  isAIEditReviewMessage,
  isExecuteResponse,
  isDocumentHeadStateChangeMessage,
  isHistoryStateChangeMessage,
  isInitializeEditorMessage,
  isLoadWidgetsMessage,
  isMarkStateChangeMessage,
  isCommentStateChangeMessage,
  isPresenceChangeMessage,
  isSelectionChangeMessage,
  loadWidgetsMessage,
  markStateChangeEvent,
  commentStateChangeEvent,
  presenceChangeEvent,
  selectionChangeEvent,
  documentHeadStateChangeEvent,
  historyStateChangeEvent,
} from "./editor-bridge"
import {emptyDocumentHeadState} from "./document-head"

type MessageGuard = (value: unknown) => boolean

function expectAllRejected(guard: MessageGuard, values: unknown[]) {
  for(const value of values) {
    expect(guard(value), `unexpectedly accepted ${JSON.stringify(value)}`).toBe(false)
  }
}

describe("editor bridge message guards", () => {
  it("validates complete in-document comment state", () => {
    const message = {
      type: commentStateChangeEvent,
      detail: {
        canComment: true,
        active: true,
        text: "Review",
        activeCount: 2,
        count: 3,
        highlighting: true,
      },
    }
    expect(isCommentStateChangeMessage(message)).toBe(true)
    expectAllRejected(isCommentStateChangeMessage, [
      {...message, detail: {...message.detail, canComment: "yes"}},
      {...message, detail: {...message.detail, activeCount: -1}},
      {...message, detail: {...message.detail, activeCount: 4}},
      {...message, detail: {...message.detail, count: 1.5}},
      {...message, detail: {...message.detail, text: null}},
      {...message, detail: {...message.detail, highlighting: "yes"}},
    ])
  })

  it("validates version history together with the active user identifier", () => {
    const message = {
      type: historyStateChangeEvent,
      detail: {
        checkpoints: [{
          id: "checkpoint-1",
          timestamp: 1,
          label: "Document created",
          user: {clientId: 7, name: "Ada", initials: "AD", color: "#2563eb"},
          changes: {added: 0, removed: 0, modified: 0},
          commentCount: 0,
        }],
        comments: [],
        preview: null,
        currentCheckpointId: "checkpoint-1",
        currentUserId: 7,
      },
    }
    expect(isHistoryStateChangeMessage(message)).toBe(true)
    expect(isHistoryStateChangeMessage({...message, detail: {...message.detail, currentUserId: null}})).toBe(true)
    expectAllRejected(isHistoryStateChangeMessage, [
      {...message, detail: {...message.detail, currentCheckpointId: undefined}},
      {...message, detail: {...message.detail, currentCheckpointId: 1}},
      {...message, detail: {...message.detail, currentUserId: undefined}},
      {...message, detail: {...message.detail, currentUserId: "7"}},
      {...message, detail: {...message.detail, currentUserId: 7.5}},
    ])
  })

  it("validates document-head state down to attributes and move flags", () => {
    const message = {
      type: documentHeadStateChangeEvent,
      detail: {
        ...emptyDocumentHeadState(),
        title: "Lesson",
        elements: [{
          id: "head-1",
          tagName: "script",
          label: "Script",
          attributes: [{name: "type", value: "module"}],
          content: "start()",
          canMoveUp: false,
          canMoveDown: true,
        }],
      },
    }
    expect(isDocumentHeadStateChangeMessage(message)).toBe(true)
    expectAllRejected(isDocumentHeadStateChangeMessage, [
      {...message, detail: {...message.detail, language: 4}},
      {...message, detail: {...message.detail, elements: [{...message.detail.elements[0], canMoveDown: "yes"}]}},
      {...message, detail: {...message.detail, elements: [{...message.detail.elements[0], attributes: [{name: "src", value: 4}]}]}},
    ])
  })

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
      bridgeNonce: "0123456789abcdef",
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
      {type: initializeEditorMessage, syncUrl: "file:///etc/passwd"},
      {type: initializeEditorMessage, syncUrl: "http://localhost/session"},
      {type: initializeEditorMessage, syncUrl: "https://localhost/session"},
      {type: initializeEditorMessage, syncUrl: "ws://localhost/session", bridgeNonce: "short"},
    ])
  })

  it("validates widget references and supplied package collections", () => {
    expect(isLoadWidgetsMessage({
      type: loadWidgetsMessage,
      widgets: [{name: "@webwriter/example", version: "1.2.3"}],
      packages: [{
        name: "@webwriter/example",
        version: "1.2.3",
        members: [{
          id: "@webwriter/example@1.2.3:./widget",
          packageName: "@webwriter/example",
          packageVersion: "1.2.3",
          exportName: "./widget",
          kind: "widget",
          label: "Example",
          insertable: true,
          tagName: "webwriter-example",
        }],
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
      {type: loadWidgetsMessage, widgets: [], packages: [{
        name: "example",
        version: "1.0.0",
        members: [null],
        scripts: [],
        styles: [],
      }]},
      {type: loadWidgetsMessage, widgets: [], packages: [{
        name: "example",
        version: "1.0.0",
        members: [{}],
        scripts: [],
        styles: [],
      }]},
      {type: loadWidgetsMessage, widgets: [], packages: [{
        name: "example",
        version: "1.0.0",
        members: [{}],
        scripts: [null],
        styles: [],
      }]},
      {type: loadWidgetsMessage, widgets: [], packages: [{
        name: "example",
        version: "1.0.0",
        members: [{}],
        scripts: [],
        styles: [{}],
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
      {type: executeFailureEvent, detail: {requestId: "request-3"}},
      {type: executeFailureEvent, detail: {requestId: "request-4", error: {name: "Error"}}},
    ])
  })

  it("validates every optional selection-state payload", () => {
    const message = {
      type: selectionChangeEvent,
      detail: {
        path: [
          {path: [], name: "Document", icon: "Document"},
          {
            path: [0],
            name: "Example widget",
            iconUrl: "https://example.test/icon.svg",
            sections: [{path: [0, 0], type: "article", name: "Article", icon: "Article"}],
          },
        ],
        inserted: true,
        canSection: true,
        nodeSelected: true,
        capture: false,
        gap: {parentPath: [0], offset: 1},
        section: {path: [0, 0], type: "article"},
        list: {
          type: "ol",
          style: "upper-roman",
          ordered: {start: "3", reversed: true, numbering: "I", itemValue: "7"},
        },
        headingGroup: {heading: "h2", beforeCount: 1, afterCount: 2},
        figure: {hasCaption: true},
        element: {
          path: [0],
          localName: "blockquote",
          namespaceURI: "http://www.w3.org/1999/xhtml",
          name: "Quote",
          icon: "Quote",
          attributes: {cite: "source.html", hidden: ""},
        },
        media: {
          type: "video",
          attributes: {src: "movie.mp4", controls: ""},
          sources: [{index: 0, attributes: {src: "movie.webm", type: "video/webm"}}],
          tracks: [{index: 1, attributes: {src: "captions.vtt", kind: "captions"}}],
          fallbackHTML: "<p>Download the movie.</p>",
        },
        form: {
          type: "input",
          attributes: {type: "email", required: ""},
          canAddOption: false,
        },
        dialog: {
          attributes: {id: "notice", closedby: "any"},
          initiallyOpen: false,
          closedBy: "any",
          openerCount: 1,
          closeControlCount: 1,
          hasDialogForm: false,
        },
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
      {...message, detail: {...message.detail, inserted: "true"}},
      {...message, detail: {...message.detail, canSection: "true"}},
      {...message, detail: {...message.detail, nodeSelected: "true"}},
      {...message, detail: {...message.detail, gap: {parentPath: [0], offset: -1}}},
      {...message, detail: {...message.detail, section: {path: [0, -1], type: "article"}}},
      {...message, detail: {...message.detail, section: {path: [0], type: "legend"}}},
      {...message, detail: {...message.detail, path: [{path: [0], name: "Paragraph", sections: [{path: [0], type: "legend", name: "Legend"}]}]}},
      {...message, detail: {...message.detail, list: {type: "table", style: ""}}},
      {...message, detail: {...message.detail, list: {type: "ol", style: "", ordered: {start: 2, reversed: false, numbering: ""}}}},
      {...message, detail: {...message.detail, list: {type: "ol", style: "", ordered: {start: "", reversed: false, numbering: "decimal"}}}},
      {...message, detail: {...message.detail, headingGroup: {heading: "header", beforeCount: 0, afterCount: 0}}},
      {...message, detail: {...message.detail, headingGroup: {heading: "h1", beforeCount: -1, afterCount: 0}}},
      {...message, detail: {...message.detail, figure: {hasCaption: "yes"}}},
      {...message, detail: {...message.detail, element: {...message.detail.element, path: [-1]}}},
      {...message, detail: {...message.detail, element: {...message.detail.element, localName: 4}}},
      {...message, detail: {...message.detail, element: {...message.detail.element, attributes: {hidden: true}}}},
      {...message, detail: {...message.detail, media: {type: "canvas", attributes: {}}}},
      {...message, detail: {...message.detail, media: {type: "img", attributes: []}}},
      {...message, detail: {...message.detail, media: {type: "img", attributes: {width: 640}}}},
      {...message, detail: {...message.detail, media: {type: "img", attributes: {}, sources: []}}},
      {...message, detail: {...message.detail, media: {type: "video", attributes: {}, sources: [{index: -1, attributes: {}}]}}},
      {...message, detail: {...message.detail, media: {type: "video", attributes: {}, tracks: [{index: 0, attributes: {src: 4}}]}}},
      {...message, detail: {...message.detail, media: {type: "audio", attributes: {}, fallbackHTML: 4}}},
      {...message, detail: {...message.detail, form: {type: "unknown", attributes: {}}}},
      {...message, detail: {...message.detail, form: {type: "input", attributes: []}}},
      {...message, detail: {...message.detail, form: {type: "input", attributes: {required: true}}}},
      {...message, detail: {...message.detail, form: {type: "input", attributes: {}, canAddField: "yes"}}},
      {...message, detail: {...message.detail, dialog: {...message.detail.dialog, closedBy: "outside"}}},
      {...message, detail: {...message.detail, dialog: {...message.detail.dialog, initiallyOpen: "false"}}},
      {...message, detail: {...message.detail, dialog: {...message.detail.dialog, openerCount: -1}}},
      {...message, detail: {...message.detail, dialog: {...message.detail.dialog, attributes: []}}},
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
