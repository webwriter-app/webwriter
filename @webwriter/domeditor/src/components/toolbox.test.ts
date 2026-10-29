// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {DomEditorToolbox} from "./toolbox"
import type {ElementStyleEditor} from "./element-style-editor"
import type {RibbonButton} from "./ribbon-button"
import {RibbonDrawer} from "./ribbon-drawer"
import {AIProviderStore} from "../ai-provider"
import {emptyProofreadingState, emptyVersionHistoryState} from "../editor-bridge"
import {emptyDocumentHeadState} from "../document-head"
import type {DistributionConfig, DistributionItem} from "../distribution.js"
import type {DistributionSelectionState} from "./distribution-controls"

it("combines document options without exposing a root widget or separate language attribute", async () => {
  const toolbox = await mountToolbox()
  toolbox.documentSelected = true
  toolbox.elementAttributes = {path: [0], localName: "my-document", namespaceURI: "http://www.w3.org/1999/xhtml", name: "My document", attributes: {lang: "de"}}
  toolbox.widgetOptions = {path: [0], localName: "my-document", options: [{name: "layout", label: "Widget layout", type: "string", attribute: "layout", value: "custom"}], actions: []}
  toolbox.selectTool("Edit")
  await toolbox.updateComplete
  const drawers = [...toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer")]
  expect(drawers.map(drawer => drawer.label)).toEqual(["Style", "Document"])
  const drawer = drawers[1]
  await drawer.updateComplete
  expect(drawer.icon).toBe("Document")
  expect(drawer.showPaneIcon).toBe(true)
  expect(drawer.expandable).toBe(true)
  expect(drawer.querySelector('button[slot="heading-action"]')?.getAttribute("aria-label")).toBe("Reset document options")
  expect(drawer.querySelector("element-attribute-editor, .specialized-widget-primary, .widget-sharing")).toBeNull()
  expect(drawer.querySelector('[action^="set-document-template:"]')).toBeNull()
  expect(drawer.querySelector('.document-primary document-head-editor[mode="common"]')).not.toBeNull()
  expect(drawer.querySelector('[slot="more"] document-head-editor[mode="advanced"]')).not.toBeNull()
  expect(drawer.querySelector('.layout-preview-toggle, .document-layout-zoom')).toBeNull()
  expect(drawer.querySelectorAll('.document-primary .document-layout-change')).toHaveLength(4)
})

it("resets configured document metadata and layout through the existing commands", async () => {
  const toolbox = await mountToolbox()
  toolbox.documentSelected = true
  toolbox.selectTool("Edit")
  await toolbox.updateComplete
  const reset = () => toolbox.shadowRoot!.querySelector<HTMLButtonElement>(".document-reset")!
  expect(reset().disabled).toBe(true)
  toolbox.documentHead = {...emptyDocumentHeadState(), title: "Lesson", language: "de", description: "A lesson",
    elements: [{id: "unknown", tagName: "meta", label: "Custom", attributes: [{name: "name", value: "custom"}], canMoveUp: false, canMoveDown: false}]}
  toolbox.documentLayout = {mode: "board", canConvert: true, zoom: 125}
  await toolbox.updateComplete
  const metadata = vi.fn()
  const layout = vi.fn()
  toolbox.addEventListener("document-head-action", metadata)
  toolbox.addEventListener("document-layout-change", layout)
  reset().click()
  expect(metadata.mock.calls.map(([event]) => event.detail)).toEqual([
    {type: "setDocumentHeadField", field: "title", value: ""},
    {type: "setDocumentHeadField", field: "language", value: ""},
    {type: "setDocumentHeadField", field: "description", value: ""},
  ])
  expect(layout.mock.calls[0][0].detail).toEqual({mode: "document"})
  expect(toolbox.documentHead.elements[0].id).toBe("unknown")
  toolbox.documentHead = emptyDocumentHeadState()
  toolbox.documentLayout = {...toolbox.documentLayout, canConvert: false}
  await toolbox.updateComplete
  expect(reset().disabled).toBe(true)
})

afterEach(() => {
  document.body.replaceChildren()
})

async function mountToolbox(showStyleToolbox = true) {
  const toolbox = new DomEditorToolbox()
  toolbox.showStyleToolbox = showStyleToolbox
  document.body.append(toolbox)
  await toolbox.updateComplete
  return toolbox
}

const toolButton = (toolbox: DomEditorToolbox, label: string) =>
  toolbox.shadowRoot!.querySelector<HTMLButtonElement>(`button[data-tool="${label}"]`)!

describe("toolbox", () => {
  it("collapses to unselected tabs without clearing the current tool or its contents", async () => {
    const toolbox = await mountToolbox()
    toolbox.selectTool("Review")
    await toolbox.updateComplete
    const content = toolbox.shadowRoot!.querySelector(".review-section")
    const changes = vi.fn()
    const clearPreview = vi.fn()
    toolbox.addEventListener("toolbox-change", changes)
    toolbox.addEventListener("history-preview-clear", clearPreview)
    toolbox.collapsed = true
    await toolbox.updateComplete
    expect(toolbox.activeTool).toBe("Review")
    expect(toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane")!.hidden).toBe(true)
    expect(toolbox.shadowRoot!.querySelector('[aria-selected="true"]')).toBeNull()
    expect(changes).not.toHaveBeenCalled()
    expect(clearPreview).not.toHaveBeenCalled()
    toolbox.selectTool("Review")
    expect(changes).not.toHaveBeenCalled()
    toolButton(toolbox, "Review").click()
    expect(changes.mock.calls.at(-1)![0].detail).toEqual({tool: "Review"})
    toolbox.collapsed = false
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane")!.hidden).toBe(false)
    expect(toolbox.shadowRoot!.querySelector(".review-section")).toBe(content)
    expect(toolButton(toolbox, "Review").getAttribute("aria-selected")).toBe("true")
  })

  it("keeps developer console controls available beside Versions in Review and locks them during pending HTML edits", async () => {
    const toolbox = await mountToolbox()
    toolbox.consoleOpen = true
    toolbox.selectTool("Review")
    await toolbox.updateComplete
    const change = vi.fn()
    toolbox.addEventListener("developer-console-change", change)
    const close = () => toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Close developer console"]')!
    expect(toolbox.shadowRoot!.querySelector(".versions-console-toggle")).not.toBeNull()
    expect(close().disabled).toBe(false)
    close().click()
    expect(change.mock.calls[0][0].detail).toEqual({enabled: false})
    toolbox.htmlPending = true
    await toolbox.updateComplete
    expect(close().disabled).toBe(true)
    close().click()
    expect(change).toHaveBeenCalledTimes(1)
  })

  it("puts Comments above Issues with independent thin scroll areas and a Versions footer", async () => {
    const toolbox = await mountToolbox()
    const changes = vi.fn()
    toolbox.addEventListener("versions-console-change", changes)
    toolbox.selectTool("Review")
    await toolbox.updateComplete
    const content = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane-content")!
    expect(getComputedStyle(content).overflow).toBe("hidden")
    const sections = Array.from(content.querySelectorAll<HTMLElement>(".review-section"))
    expect(sections.map(section => section.classList.contains("review-comments"))).toEqual([true, false])
    for(const section of sections) {
      expect(getComputedStyle(section).overflow).toBe("hidden")
      expect(getComputedStyle(section).flexBasis).toBe("50%")
    }
    expect(content.querySelector('ribbon-drawer[label="Versions"]')).toBeNull()
    const button = toolbox.shadowRoot!.querySelector<HTMLButtonElement>(".versions-console-toggle")!
    expect(button.closest("footer")).not.toBeNull()
    expect(button.getAttribute("aria-pressed")).toBe("false")
    expect(button.textContent?.trim()).toBe("Versions")
    expect(button.getAttribute("aria-label")).toBe("Versions")
    const issues = sections[1].querySelector<HTMLElement>(".proofreading-content")!
    expect(getComputedStyle(issues).overflowY).toBe("auto")
    button.click()
    expect(changes.mock.calls.at(-1)![0].detail).toEqual({enabled: true})
    toolbox.versionsOpen = true
    await toolbox.updateComplete
    expect(button.getAttribute("aria-pressed")).toBe("true")
    expect(toolbox.hasAttribute("versions-open")).toBe(true)
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Close versions"]')!.click()
    expect(changes.mock.calls.at(-1)![0].detail).toEqual({enabled: false})
  })

  it("reuses toolbox tabs and pane for Feedback in preview and restores the normal tool", async () => {
    const toolbox = await mountToolbox()
    toolbox.selectTool("Edit")
    toolbox.preview = true
    await toolbox.updateComplete
    expect(toolbox.activeTool).toBeNull()
    expect(toolButton(toolbox, "Distribute")).toBeNull()
    expect(Array.from(toolbox.shadowRoot!.querySelectorAll('[role="tab"]'), tab => tab.getAttribute("data-tool"))).toEqual(["Feedback"])
    const tab = toolButton(toolbox, "Feedback")
    expect(tab.closest(".toolbox-tab")!.hasAttribute("data-available")).toBe(true)
    expect(tab.querySelector("svg")).not.toBeNull()
    tab.click()
    await toolbox.updateComplete
    expect(toolbox.activeTool).toBe("Feedback")
    expect(tab.getAttribute("aria-selected")).toBe("true")
    expect(toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane")!.hidden).toBe(false)
    expect(toolbox.shadowRoot!.querySelector(".feedback-content")!.textContent).toContain("Start sharing")
    expect(toolbox.shadowRoot!.querySelector("ribbon-drawer")).toBeNull()
    toolbox.consoleOpen = true
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".edit-mode-footer")).toBeNull()
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Close Feedback"]')!.click()
    await toolbox.updateComplete
    expect(toolbox.activeTool).toBeNull()
    expect(toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane")!.hidden).toBe(true)
    toolbox.preview = false
    await toolbox.updateComplete
    expect(toolbox.activeTool).toBe("Edit")
    expect(toolButton(toolbox, "Feedback")).toBeNull()
  })

  it("sends feedback to a selected connected participant and preserves drafts after rejected delivery", async () => {
    const toolbox = await mountToolbox()
    toolbox.preview = true
    toolbox.feedbackActive = true
    toolbox.feedbackRole = "host"
    toolbox.feedbackParticipants = [{id: "ada", name: "Ada", connected: true}]
    await toolbox.updateComplete
    toolbox.selectTool("Feedback")
    await toolbox.updateComplete
    const participant = toolbox.shadowRoot!.querySelector<HTMLSelectElement>('select[aria-label="Feedback participant"]')!
    participant.value = "ada"
    participant.dispatchEvent(new Event("change", {bubbles: true}))
    const input = toolbox.shadowRoot!.querySelector<HTMLTextAreaElement>("textarea")!
    input.value = "Great work <b>Ada</b>"
    input.dispatchEvent(new Event("input", {bubbles: true}))
    await toolbox.updateComplete
    const send = vi.fn((event: Event) => event.preventDefault())
    toolbox.addEventListener("live-feedback-send", send)
    const form = toolbox.shadowRoot!.querySelector("form")!
    form.dispatchEvent(new Event("submit", {cancelable: true}))
    await toolbox.updateComplete
    expect(send.mock.calls[0][0]).toMatchObject({detail: {participant: "ada", text: "Great work <b>Ada</b>"}})
    expect(input.value).toBe("Great work <b>Ada</b>")
    expect(toolbox.shadowRoot!.querySelector('[role="alert"]')).not.toBeNull()
    toolbox.removeEventListener("live-feedback-send", send)
    form.dispatchEvent(new Event("submit", {cancelable: true}))
    await toolbox.updateComplete
    expect(input.value).toBe("")
    toolbox.feedbackParticipants = [{id: "ada", name: "Ada", connected: false}]
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true)
  })

  it("shows received feedback as plain text without participant sending controls", async () => {
    const toolbox = await mountToolbox()
    toolbox.preview = true
    toolbox.feedbackActive = true
    toolbox.feedbackRole = "learner"
    toolbox.feedbackMessages = [{id: "one", participant: "ada", time: Date.now(), text: "Try <script>this</script> next"}]
    await toolbox.updateComplete
    toolbox.selectTool("Feedback")
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector("form")).toBeNull()
    expect(toolbox.shadowRoot!.querySelector(".feedback-messages p")!.textContent).toBe("Try <script>this</script> next")
    expect(toolbox.shadowRoot!.querySelector(".feedback-messages script")).toBeNull()
  })

  it("offers a document proofreading toggle even when the checker is loading or failed", async () => {
    const toolbox = await mountToolbox()
    toolbox.selectTool("Review")
    const actions = vi.fn()
    toolbox.addEventListener("proofreading-action", actions)
    await toolbox.updateComplete
    const toggle = toolbox.shadowRoot!.querySelector<HTMLInputElement>(".proofreading-toggle input")!
    expect(toggle.parentElement!.textContent?.trim()).toBe("")
    expect(toggle.getAttribute("aria-label")).toBe("Check for issues automatically")
    expect(toggle.closest("h2")?.id).toBe("proofreading-title")
    expect(toggle.checked).toBe(true)
    expect(toggle.disabled).toBe(false)
    toggle.click()
    expect(actions.mock.calls.at(-1)![0].detail).toEqual({type: "setDocumentProofreadingEnabled", enabled: false})
    toolbox.proofreadingState = {...emptyProofreadingState(), enabled: false, documentEnabled: false}
    await toolbox.updateComplete
    expect(toggle.checked).toBe(false)
    expect(toolbox.shadowRoot!.querySelector(".proofreading-section")!.textContent).toContain("disabled for this document")
    expect(toolbox.shadowRoot!.querySelector(".proofreading-spinner")).toBeNull()
    toggle.click()
    expect(actions.mock.calls.at(-1)![0].detail).toEqual({type: "setDocumentProofreadingEnabled", enabled: true})
    toolbox.proofreadingState = {...emptyProofreadingState(), error: "Could not load"}
    await toolbox.updateComplete
    expect(toggle.disabled).toBe(false)
    toolbox.htmlPending = true
    await toolbox.updateComplete
    expect(toggle.disabled).toBe(true)
  })

  it("reuses the proof-reading section for unrelated updates and refreshes it when Review reopens", async () => {
    const toolbox = await mountToolbox()
    const renderIssues = vi.spyOn(toolbox as unknown as {renderProofreadingSection: () => unknown}, "renderProofreadingSection")
    toolbox.selectTool("Review")
    await toolbox.updateComplete
    expect(renderIssues).toHaveBeenCalledTimes(1)

    toolbox.consoleOpen = true
    await toolbox.updateComplete
    expect(renderIssues).toHaveBeenCalledTimes(1)

    toolbox.proofreadingState = {...emptyProofreadingState(), enabled: false, documentEnabled: false}
    await toolbox.updateComplete
    expect(renderIssues).toHaveBeenCalledTimes(2)
    expect(toolbox.shadowRoot!.querySelector(".proofreading-status")?.textContent)
      .toContain("Automatic checking is disabled for this document")

    toolbox.selectTool(null)
    await toolbox.updateComplete
    toolbox.proofreadingState = {...emptyProofreadingState(), ready: true}
    await toolbox.updateComplete
    toolbox.selectTool("Review")
    await toolbox.updateComplete
    expect(renderIssues).toHaveBeenCalledTimes(3)
    expect(toolbox.shadowRoot!.querySelector(".proofreading-status")?.textContent)
      .toContain("No issues found")
  })

  it("offers a manual check beside Issues even when automatic checking is off, with busy and editing locks", async () => {
    const toolbox = await mountToolbox()
    toolbox.selectTool("Review")
    toolbox.proofreadingState = {...emptyProofreadingState(), enabled: false, documentEnabled: false}
    const actions = vi.fn()
    toolbox.addEventListener("proofreading-action", actions)
    await toolbox.updateComplete
    const button = toolbox.shadowRoot!.querySelector<HTMLButtonElement>("#proofreading-title .proofreading-check")!
    expect(button.getAttribute("aria-label")).toBe("Check for issues")
    expect(button.querySelector("svg")).not.toBeNull()
    expect(button.disabled).toBe(false)
    button.click()
    expect(actions.mock.calls.at(-1)![0].detail).toEqual({type: "checkProofreading"})
    for(const state of [{loading: true}, {checking: true}]) {
      toolbox.proofreadingState = {...emptyProofreadingState(), ...state}
      await toolbox.updateComplete
      expect(button.disabled).toBe(true)
    }
    toolbox.proofreadingState = {...emptyProofreadingState(), error: "Failed"}
    await toolbox.updateComplete
    expect(button.disabled).toBe(false)
    toolbox.htmlPending = true
    await toolbox.updateComplete
    expect(button.disabled).toBe(true)
    toolbox.htmlPending = false
    toolbox.historyState = {...emptyVersionHistoryState(), preview: {checkpointId: "version", isCurrent: false, added: 0, removed: 0, modified: 0}}
    await toolbox.updateComplete
    expect(button.disabled).toBe(true)
    toolbox.historyState = emptyVersionHistoryState()
    await toolbox.updateComplete
    expect(button.disabled).toBe(false)
  })

  it("allows explicit document proofreading even when automatic checking is off", async () => {
    const toolbox = await mountToolbox()
    toolbox.selectTool("Review")
    toolbox.proofreadingState = {...emptyProofreadingState(), enabled: false, documentEnabled: false}
    await toolbox.updateComplete
    const toggle = toolbox.shadowRoot!.querySelector<HTMLInputElement>(".proofreading-toggle input")!
    expect(toggle.disabled).toBe(false)
    expect(toggle.checked).toBe(false)
    expect(toolbox.shadowRoot!.querySelector(".proofreading-section")!.textContent).toContain("Automatic checking is disabled for this document")
    expect(toolbox.shadowRoot!.querySelector(".proofreading-spinner")).toBeNull()
    const actions = vi.fn()
    toolbox.addEventListener("proofreading-action", actions)
    toggle.click()
    expect(actions.mock.calls.at(-1)![0].detail).toEqual({type: "setDocumentProofreadingEnabled", enabled: true})
    toolbox.proofreadingState = {...emptyProofreadingState(), ready: true}
    await toolbox.updateComplete
    expect(toggle.checked).toBe(true)
    expect(toggle.disabled).toBe(false)
    expect(toolbox.shadowRoot!.querySelector(".proofreading-section")!.textContent).not.toContain("disabled")
  })

  it("disables Issues controls and explains the global Settings gate", async () => {
    const toolbox = await mountToolbox()
    toolbox.selectTool("Review")
    toolbox.proofreadingState = {...emptyProofreadingState(), allowed: false, enabled: false}
    await toolbox.updateComplete
    const check = toolbox.shadowRoot!.querySelector<HTMLButtonElement>(".proofreading-check")!
    const toggle = toolbox.shadowRoot!.querySelector<HTMLInputElement>(".proofreading-toggle input")!
    const content = toolbox.shadowRoot!.querySelector<HTMLElement>(".proofreading-content")!
    expect(check.disabled).toBe(true)
    expect(toggle.disabled).toBe(true)
    expect(content.textContent).toContain("Issue checking is disabled in Settings.")
    expect(content.textContent).not.toContain("disabled for this document")

    toolbox.proofreadingState = {...emptyProofreadingState(), documentEnabled: false}
    await toolbox.updateComplete
    expect(check.disabled).toBe(false)
    expect(toggle.disabled).toBe(false)
    expect(content.textContent).toContain("Automatic checking is disabled for this document.")
    expect(content.textContent).not.toContain("Issue checking is disabled in Settings.")
  })


  it("shows a generic proofreading loading failure and dispatches a retry", async () => {
    const toolbox = await mountToolbox()
    toolbox.proofreadingState = {...emptyProofreadingState(), error: "worker stack trace", loading: false}
    await toolbox.updateComplete

    const review = toolButton(toolbox, "Review")
    expect(review.getAttribute("aria-label")).toBe("Review. Issue checker unavailable")
    expect(review.title).toBe("Issue checker unavailable")
    expect(review.querySelector(".proofreading-error-badge")?.textContent).toBe("!")

    review.click()
    await toolbox.updateComplete
    const failure = toolbox.shadowRoot!.querySelector<HTMLElement>(".proofreading-error")!
    expect(failure.getAttribute("role")).toBe("alert")
    expect(failure.textContent).toContain("Could not load the issue checker.")
    expect(failure.textContent).not.toContain("worker stack trace")

    const retryRequest = vi.fn()
    toolbox.addEventListener("proofreading-action", retryRequest)
    failure.querySelector<HTMLButtonElement>("button")!.click()
    expect(retryRequest).toHaveBeenCalledOnce()
    expect(retryRequest.mock.calls[0][0]).toMatchObject({
      detail: {type: "retryProofreading"},
      bubbles: true,
      composed: true,
    })

    toolbox.proofreadingState = {...emptyProofreadingState(), ready: true}
    await toolbox.updateComplete
    expect(toolButton(toolbox, "Review").querySelector(".proofreading-error-badge")).toBeNull()
    expect(toolbox.shadowRoot!.querySelector(".proofreading-error")).toBeNull()
  })

  it("counts accessibility issues in the Review bubble while Issues is enabled, open or closed", async () => {
    const toolbox = await mountToolbox()
    const review = () => toolButton(toolbox, "Review")
    const issues = [{id: "a11y", start: 0, end: 1, kind: "accessibility" as const, message: "Needs alt text", text: "x", suggestions: []}]
    expect(review().querySelector(".toolbox-tab-accessibility-badge")).toBeNull()

    toolbox.proofreadingState = {...emptyProofreadingState(), enabled: true, issues}
    await toolbox.updateComplete
    const badge = review().querySelector<HTMLElement>(".toolbox-tab-accessibility-badge")!
    expect(badge).not.toBeNull()
    expect(badge.getAttribute("aria-hidden")).toBe("true")
    expect(badge.textContent).toBe("1")
    expect(getComputedStyle(badge).height).toBe("16px")
    expect(review().getAttribute("aria-description")).toContain("1 accessibility issue")

    toolbox.selectTool("Review")
    await toolbox.updateComplete
    expect(review().querySelector(".toolbox-tab-accessibility-badge")).not.toBeNull()
    toolbox.selectTool(null)
    await toolbox.updateComplete
    expect(review().querySelector(".toolbox-tab-accessibility-badge")).not.toBeNull()

    toolbox.proofreadingState = {...toolbox.proofreadingState, issues: [
      ...issues, {...issues[0], id: "a11y-2"}, {...issues[0], id: "spelling", kind: "spelling"},
    ]}
    await toolbox.updateComplete
    expect(review().querySelector(".toolbox-tab-accessibility-badge")?.textContent).toBe("2")
    expect(review().getAttribute("aria-description")).toContain("2 accessibility issues")

    toolbox.proofreadingState = {...toolbox.proofreadingState, enabled: false}
    await toolbox.updateComplete
    expect(review().querySelector(".toolbox-tab-accessibility-badge")).toBeNull()
    toolbox.proofreadingState = {...emptyProofreadingState(), enabled: true, issues: [{...issues[0], kind: "spelling"}]}
    await toolbox.updateComplete
    expect(review().querySelector(".toolbox-tab-accessibility-badge")).toBeNull()
    toolbox.proofreadingState = {...emptyProofreadingState(), enabled: true, issues, error: "failed"}
    await toolbox.updateComplete
    expect(review().querySelector(".toolbox-tab-accessibility-badge")).not.toBeNull()
    expect(review().getAttribute("aria-label")).toContain("Issue checker unavailable")
    expect(review().getAttribute("aria-description")).toContain("1 accessibility issue")
    expect(review().getAttribute("aria-description")).toContain("Issue checker unavailable")
    expect(review().querySelector(".proofreading-error-badge")).not.toBeNull()

    toolbox.commentState = {...toolbox.commentState, count: 3}
    await toolbox.updateComplete
    expect(review().getAttribute("aria-description")).toContain("3 comments")
    expect(review().querySelector(".toolbox-tab-comment-count")?.textContent).toBe("3")
    expect(review().querySelector(".toolbox-tab-accessibility-badge")).not.toBeNull()
  })

  it("lists issues as cards with selection, suggestions, and ignore actions", async () => {
    const toolbox = await mountToolbox()
    toolbox.selectTool("Review")
    toolbox.proofreadingState = {
      ...emptyProofreadingState(), ready: true,
      issues: [{id: "issue-1", start: 4, end: 7, kind: "spelling", message: "Possible spelling mistake", text: "teh",
        suggestions: [{kind: "replace", text: "the"}]}],
    }
    await toolbox.updateComplete
    const card = toolbox.shadowRoot!.querySelector(".proofreading-card")!
    expect(toolbox.shadowRoot!.querySelector(".proofreading-section h2")?.textContent?.trim()).toBe("Issues")
    expect(card.textContent).toContain("Possible spelling mistake")
    expect(card.textContent).toContain("teh")
    const action = vi.fn()
    toolbox.addEventListener("proofreading-action", action)
    card.querySelector<HTMLButtonElement>(".proofreading-issue")!.click()
    card.querySelector<HTMLButtonElement>(".proofreading-suggestion")!.click()
    card.querySelector<HTMLButtonElement>(".proofreading-ignore")!.click()
    expect(action.mock.calls.map(([event]) => event.detail)).toEqual([
      {type: "selectProofreadingIssue", id: "issue-1"},
      {type: "applyProofreadingSuggestion", id: "issue-1", index: 0},
      {type: "ignoreProofreadingIssue", id: "issue-1"},
    ])
  })

  it("renders style issue labels and hover state with only the Ignore card action", async () => {
    const toolbox = await mountToolbox()
    toolbox.selectTool("Review")
    toolbox.proofreadingState = {
      ...emptyProofreadingState(), ready: true, hoveredIssueId: "style-1",
      issues: [{id: "style-1", start: 0, end: 3, kind: "style", message: "Consider a clearer phrase", text: "abc",
        suggestions: [{kind: "replace", text: "xyz"}]}],
    }
    await toolbox.updateComplete
    const card = toolbox.shadowRoot!.querySelector<HTMLElement>(".proofreading-card")!
    expect(card.querySelector(".proofreading-kind")?.textContent).toBe("Style")
    expect(card.getAttribute("data-hover-kind")).toBe("style")
    const article = card.querySelector("article") ?? card
    expect(article.lastElementChild?.classList.contains("proofreading-actions")).toBe(true)
    expect(article.querySelector(".proofreading-suggestions")?.nextElementSibling).toBe(article.lastElementChild)
    expect(article.querySelector(".proofreading-add-word")).toBeNull()
    expect(article.querySelector(".proofreading-ignore")).not.toBeNull()

    const action = vi.fn()
    toolbox.addEventListener("proofreading-action", action)
    card.querySelector<HTMLButtonElement>(".proofreading-issue")!.click()
    card.querySelector<HTMLButtonElement>(".proofreading-suggestion")!.click()
    card.querySelector<HTMLButtonElement>(".proofreading-ignore")!.click()
    expect(action.mock.calls.map(([event]) => event.detail)).toEqual([
      {type: "selectProofreadingIssue", id: "style-1"},
      {type: "applyProofreadingSuggestion", id: "style-1", index: 0},
      {type: "ignoreProofreadingIssue", id: "style-1"},
    ])
  })

  it("renders accessibility issues with selection and ignore, suppresses fixes, and links safely to rule help", async () => {
    const toolbox = await mountToolbox()
    toolbox.selectTool("Review")
    toolbox.proofreadingState = {
      ...emptyProofreadingState(), ready: true, hoveredIssueId: "a11y-1",
      issues: [{id: "a11y-1", start: 0, end: 3, kind: "accessibility", message: "Image needs alternative text", text: "Image",
        suggestions: [{kind: "replace", text: "Decorative image"}], helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt"}],
    }
    await toolbox.updateComplete
    const card = toolbox.shadowRoot!.querySelector<HTMLElement>(".proofreading-card")!
    expect(card.getAttribute("data-hover-kind")).toBe("accessibility")
    expect(card.querySelector(".proofreading-kind")?.textContent).toBe("Accessibility")
    expect(card.querySelector(".proofreading-suggestions")).toBeNull()
    const help = card.querySelector<HTMLAnchorElement>(".proofreading-help")!
    expect(help.href).toBe("https://dequeuniversity.com/rules/axe/4.10/image-alt")
    expect(help.target).toBe("_blank")
    expect(help.rel).toContain("noopener")
    const action = vi.fn()
    toolbox.addEventListener("proofreading-action", action)
    card.querySelector<HTMLButtonElement>(".proofreading-issue")!.click()
    card.querySelector<HTMLButtonElement>(".proofreading-ignore")!.click()
    expect(action.mock.calls.map(([event]) => event.detail)).toEqual([
      {type: "selectProofreadingIssue", id: "a11y-1"},
      {type: "ignoreProofreadingIssue", id: "a11y-1"},
    ])

    toolbox.proofreadingState = {...toolbox.proofreadingState, issues: [{...toolbox.proofreadingState.issues[0], helpUrl: "javascript:alert(1)"}]}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".proofreading-help")).toBeNull()
  })

  it("indicates the hovered issue on the Review icon or matching card", async () => {
    const toolbox = await mountToolbox()
    const issues = [
      {id: "spell", start: 0, end: 3, kind: "spelling" as const, message: "Spelling", text: "teh", suggestions: []},
      {id: "grammar", start: 4, end: 7, kind: "grammar" as const, message: "Grammar", text: "is", suggestions: []},
    ]
    toolbox.proofreadingState = {...emptyProofreadingState(), issues, hoveredIssueId: "spell"}
    await toolbox.updateComplete
    expect(toolButton(toolbox, "Review").closest(".toolbox-tab")?.getAttribute("data-hover-kind")).toBe("spelling")
    expect(toolbox.shadowRoot!.querySelector('[data-tool="Review"] .toolbox-tab-label')?.getAttribute("data-hover-kind")).toBeNull()

    toolbox.selectTool("Review")
    await toolbox.updateComplete
    expect(toolButton(toolbox, "Review").closest(".toolbox-tab")?.hasAttribute("data-hover-kind")).toBe(false)
    expect(toolbox.shadowRoot!.querySelector('[data-hover-kind="spelling"].proofreading-card')).not.toBeNull()
    expect(toolbox.shadowRoot!.querySelector('[data-hover-kind="grammar"].proofreading-card')).toBeNull()

    toolbox.proofreadingState = {...toolbox.proofreadingState, hoveredIssueId: "grammar"}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector('[data-hover-kind="grammar"].proofreading-card')).not.toBeNull()
    expect(toolbox.shadowRoot!.querySelector('[data-hover-kind="spelling"].proofreading-card')).toBeNull()
    toolbox.selectTool(null)
    await toolbox.updateComplete
    expect(toolButton(toolbox, "Review").closest(".toolbox-tab")?.getAttribute("data-hover-kind")).toBe("grammar")
    toolbox.selectTool("Review")
    await toolbox.updateComplete

    toolbox.proofreadingState = {...toolbox.proofreadingState, hoveredIssueId: "missing"}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".proofreading-card[data-hover-kind]")).toBeNull()
    toolbox.proofreadingState = {...toolbox.proofreadingState, hoveredIssueId: null}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".proofreading-card[data-hover-kind]")).toBeNull()
  })

  it("reveals a newly hovered issue inside the Issues scroll area only while Review is open", async () => {
    const toolbox = await mountToolbox()
    const issues = [
      {id: "first", start: 0, end: 3, kind: "spelling" as const, message: "First", text: "one", suggestions: []},
      {id: "second", start: 4, end: 7, kind: "grammar" as const, message: "Second", text: "two", suggestions: []},
    ]
    toolbox.selectTool("Review")
    toolbox.proofreadingState = {...emptyProofreadingState(), issues, hoveredIssueId: null}
    await toolbox.updateComplete
    const scrollArea = toolbox.shadowRoot!.querySelector<HTMLElement>(".proofreading-content")!
    const cards = toolbox.shadowRoot!.querySelectorAll<HTMLElement>(".proofreading-card")
    const card = cards[1]
    scrollArea.scrollTop = 0
    vi.spyOn(scrollArea, "getBoundingClientRect").mockReturnValue({top: 10, bottom: 110} as DOMRect)
    vi.spyOn(cards[0], "getBoundingClientRect").mockReturnValue({top: 0, bottom: 5} as DOMRect)
    vi.spyOn(card, "getBoundingClientRect").mockImplementation(() => ({top: 120 - scrollArea.scrollTop, bottom: 150 - scrollArea.scrollTop} as DOMRect))

    toolbox.proofreadingState = {...toolbox.proofreadingState, hoveredIssueId: "second"}
    await toolbox.updateComplete
    expect(scrollArea.scrollTop).toBe(40)

    toolbox.proofreadingState = {...toolbox.proofreadingState, checking: true}
    await toolbox.updateComplete
    expect(scrollArea.scrollTop).toBe(40)

    toolbox.proofreadingState = {...toolbox.proofreadingState, hoveredIssueId: null}
    await toolbox.updateComplete
    scrollArea.scrollTop = 0
    toolbox.proofreadingState = {...toolbox.proofreadingState, hoveredIssueId: "second"}
    await toolbox.updateComplete
    expect(scrollArea.scrollTop).toBe(40)

    toolbox.selectTool(null)
    await toolbox.updateComplete
    toolbox.proofreadingState = {...toolbox.proofreadingState, hoveredIssueId: "first"}
    await toolbox.updateComplete
    expect(scrollArea.scrollTop).toBe(40)

    toolbox.selectTool("Review")
    await toolbox.updateComplete
    expect(scrollArea.scrollTop).toBe(40)
    expect(toolbox.shadowRoot!.querySelector<HTMLElement>(".proofreading-content")?.scrollTop).toBe(0)
  })

  it("shows an accessible heading spinner while loading or checking and preserves cards", async () => {
    const toolbox = await mountToolbox()
    toolbox.selectTool("Review")
    toolbox.proofreadingState = {...emptyProofreadingState(), loading: true}
    await toolbox.updateComplete
    let spinner = toolbox.shadowRoot!.querySelector<HTMLElement>(".proofreading-section h2 .proofreading-spinner")!
    expect(spinner.getAttribute("role")).toBe("status")
    expect(spinner.getAttribute("aria-label")).toBe("Loading issue checker")

    const issue = {id: "stable-issue", start: 0, end: 3, kind: "spelling" as const, message: "Possible spelling mistake", text: "teh", suggestions: []}
    toolbox.proofreadingState = {...emptyProofreadingState(), ready: true, checking: true, issues: [issue]}
    await toolbox.updateComplete
    const card = toolbox.shadowRoot!.querySelector(".proofreading-card")
    spinner = toolbox.shadowRoot!.querySelector<HTMLElement>(".proofreading-section h2 .proofreading-spinner")!
    expect(spinner.getAttribute("aria-label")).toBe("Checking for issues")
    expect(toolbox.shadowRoot!.querySelector(".proofreading-status[role=status]")).toBeNull()

    toolbox.proofreadingState = {...emptyProofreadingState(), ready: true, issues: [issue]}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".proofreading-spinner")).toBeNull()
    expect(toolbox.shadowRoot!.querySelector(".proofreading-card")).toBe(card)

    toolbox.proofreadingState = {...emptyProofreadingState(), ready: true}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".proofreading-section")?.textContent).toContain("No issues found.")

    toolbox.proofreadingState = {...emptyProofreadingState(), error: "unavailable"}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".proofreading-spinner")).toBeNull()
    expect(toolbox.shadowRoot!.querySelector(".proofreading-error")).not.toBeNull()
  })

  it("reserves both scrollbar gutters and matching side padding in Edit", async () => {
    const toolbox = await mountToolbox()
    toolbox.documentSelected = true
    toolbox.elementAttributes = {path: [], localName: "body", namespaceURI: "http://www.w3.org/1999/xhtml", name: "Document", attributes: {}}
    toolbox.selectTool("Edit")
    await toolbox.updateComplete
    const content = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane-content")!
    expect(getComputedStyle(content).getPropertyValue("scrollbar-gutter")).toBe("stable both-edges")
    expect(getComputedStyle(content).paddingLeft).toBe("8px")
    expect(getComputedStyle(content).paddingRight).toBe("8px")
    const drawers = Array.from(content.querySelectorAll<RibbonDrawer>("ribbon-drawer"))
    expect(drawers.length).toBeGreaterThan(1)
    for(const drawer of drawers) {
      await drawer.updateComplete
      const style = getComputedStyle(drawer.shadowRoot!.querySelector(".drawer")!)
      expect(style.paddingLeft).toBe("0px")
      expect(style.paddingRight).toBe("0px")
      expect(style.paddingBottom).toBe("12px")
    }
    const layouts = content.querySelector(".document-layout-controls")!
    expect(getComputedStyle(layouts).paddingLeft).toBe("0px")
    expect(getComputedStyle(layouts).paddingRight).toBe("0px")

    toolbox.selectTool("Style")
    await toolbox.updateComplete
    expect(getComputedStyle(content).getPropertyValue("scrollbar-gutter")).not.toBe("stable both-edges")
    const drawer = content.querySelector<RibbonDrawer>("ribbon-drawer")!
    await drawer.updateComplete
    expect(getComputedStyle(drawer.shadowRoot!.querySelector(".drawer")!).paddingLeft).toBe("11.2px")
    expect(getComputedStyle(drawer.shadowRoot!.querySelector(".drawer")!).paddingRight).toBe("11.2px")
  })

  it("offers the palette Style drawer for custom elements and reflects current styles", async () => {
    const toolbox = await mountToolbox(false)
    toolbox.selectTool("Edit")
    toolbox.elementAttributes = {
      path: [0], localName: "my-widget", namespaceURI: "http://www.w3.org/1999/xhtml",
      name: "Widget", attributes: {},
    }
    toolbox.elementStyle = {
      target: {localName: "my-widget", namespaceURI: "http://www.w3.org/1999/xhtml"},
      inline: {width: {value: "123px", priority: ""}}, computed: {},
      context: {display: "block", parentDisplay: "block"},
    }
    await toolbox.updateComplete
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Style"]')!
    await drawer.updateComplete
    expect(drawer.shadowRoot!.querySelector(".pane-icon .icon-tabler-palette")).not.toBeNull()
    const advanced = drawer.querySelector<ElementStyleEditor>('element-style-editor[slot="more"]')!
    await advanced.updateComplete
    expect(advanced.propertyNames).toEqual(["background-color", "color", "border-width", "border-radius", "padding", "width", "height", "margin", "opacity", "box-shadow", "filter"])
    expect(advanced.shadowRoot!.querySelector('[data-property="rotate"], [data-property="scale"]')).toBeNull()
    const compactCombos = advanced.shadowRoot!.querySelectorAll<HTMLElement>('style-combobox[id^="compact-"]')
    expect(compactCombos.length).toBeGreaterThan(0)
    expect(Array.from(compactCombos).every(combo => combo.shadowRoot?.querySelector("input"))).toBe(true)
    expect(drawer.expandable).toBe(true)
    expect(drawer.shadowRoot!.querySelector('slot[name="more"]')!.hasAttribute("hidden")).toBe(true)
    drawer.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!.click()
    await drawer.updateComplete
    expect(drawer.shadowRoot!.querySelector('slot[name="more"]')!.hasAttribute("hidden")).toBe(false)

    const basic = drawer.querySelector<ElementStyleEditor>("element-style-editor")!
    await basic.updateComplete
    expect(basic.shadowRoot!.querySelectorAll(".style-gallery button")).toHaveLength(8)
    expect(Array.from(basic.shadowRoot!.querySelectorAll("[data-property]"), row => row.getAttribute("data-property")))
      .toEqual([])
    const editor = advanced
    const widthCombo = editor.shadowRoot!.querySelector<HTMLElement>("style-combobox#compact-width")!
    expect(widthCombo.shadowRoot!.querySelector<HTMLInputElement>("input")!.value).toBe("123")
    toolbox.elementStyle = {...toolbox.elementStyle, inline: {width: {value: "250px", priority: ""}}}
    await toolbox.updateComplete
    await editor.updateComplete
    expect(widthCombo.shadowRoot!.querySelector<HTMLInputElement>("input")!.value).toBe("250")
  })

  it("hides Style by default and closes its panel when disabled", async () => {
    expect(new DomEditorToolbox().showStyleToolbox).toBe(false)
    const toolbox = await mountToolbox(false)
    expect(toolButton(toolbox, "Style")).toBeNull()
    toolbox.selectTool("Style")
    expect(toolbox.activeTool).toBeNull()
    toolbox.showStyleToolbox = true
    await toolbox.updateComplete
    toolButton(toolbox, "Style").click()
    await toolbox.updateComplete
    expect(toolbox.activeTool).toBe("Style")
    toolbox.showStyleToolbox = false
    await toolbox.updateComplete
    expect(toolButton(toolbox, "Style")).toBeNull()
    expect(toolbox.activeTool).toBeNull()
    expect(toolbox.shadowRoot!.querySelector("element-style-editor")).toBeNull()
    expect(toolbox.shadowRoot!.querySelector<HTMLElement>("#toolbox-pane")!.hidden).toBe(true)
  })

  it("renders Edit, Style, Ask AI, Review, and Distribute as icon-only tabs on the breadcrumb baseline", async () => {
    const toolbox = await mountToolbox()
    const tablist = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-tabs")!
    const tabs = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLElement>(".toolbox-tab"))
    const buttons = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLButtonElement>(".toolbox-tab-button"))
    const labels = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLElement>(".toolbox-tab-label"))

    expect(buttons.map(button => button.getAttribute("aria-label"))).toEqual([
      "Edit", "Style", "Ask AI", "Review", "Distribute",
    ])
    expect(buttons.map(button => button.getAttribute("aria-selected"))).toEqual([
      "false", "false", "false", "false", "false",
    ])
    expect(labels.map(label => label.textContent)).toEqual(["Edit", "Style", "Ask AI", "Review", "Distribute"])
    expect(labels.every(label => getComputedStyle(label).opacity === "0")).toBe(true)
    expect(tabs.every(tab => getComputedStyle(tab).width === "28px")).toBe(true)
    expect(getComputedStyle(tablist).borderBottomWidth).toBe("0.5px")
    expect(getComputedStyle(tablist).borderBottomColor).toBe("#a8a8a8")
    expect(buttons[0].querySelector(".icon-tabler-pencil")).not.toBeNull()
    expect(buttons[1].querySelector("svg")).not.toBeNull()
    expect(buttons[1].querySelector(".icon-tabler-palette")).not.toBeNull()
    expect(buttons[3].querySelector(".icon-tabler-text-grammar")).not.toBeNull()
    expect(buttons[4].querySelector(".icon-tabler-users-group")).not.toBeNull()
  })

  it("shows distribution controls with host state and pending status, without authoring drawers", async () => {
    const toolbox = await mountToolbox()
    const local: DistributionConfig = {
      version: 1,
      target: "element-1",
      scope: "group",
      permissions: ["edit"],
      add: ["user-snippet:quote"],
      items: [{id: "user-snippet:quote", label: "Quote", html: "<blockquote></blockquote>"}],
    }
    const state: DistributionSelectionState = {
      target: "element-1",
      local,
      effective: local,
      inheritedFrom: null,
    }
    const items: DistributionItem[] = [
      {id: "element:section", label: "Section", html: "<section></section>"},
      {id: "user-snippet:quote", label: "Quote", html: "<blockquote></blockquote>"},
    ]
    toolbox.distributionGeneral = state
    toolbox.distribution = state
    toolbox.elementAttributes = {path: [0], localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml", name: "Paragraph", icon: "Paragraph", attributes: {}}
    toolbox.elementSelected = true
    toolbox.distributionItems = items
    toolbox.distributionPending = true
    toolbox.distributionInsertDragActive = true
    toolButton(toolbox, "Distribute").click()
    await toolbox.updateComplete
    const controls = Array.from(toolbox.shadowRoot!.querySelectorAll("distribution-controls")) as Array<HTMLElement & {
      state: DistributionSelectionState | null
      items: DistributionItem[]
      pending: boolean
      insertDragActive: boolean
      view: string
      compact: boolean
      disabled: boolean
    }>
    await Promise.all(controls.map((control) => (control as unknown as {updateComplete: Promise<unknown>}).updateComplete))
    expect(controls).toHaveLength(3)
    expect(controls[0].state).toBe(state)
    expect(controls[0].items).toBe(items)
    expect(controls[0].pending).toBe(true)
    expect(controls[0].insertDragActive).toBe(true)
    expect(controls[1].state).toBe(state)
    expect(controls[1].items).toBe(items)
    expect(controls[1].pending).toBe(true)
    expect(controls[1].view).toBe("grouping")
    expect(controls[2].state).toBe(state)
    expect(controls[2].view).toBe("permissions")
    expect(controls[2].compact).toBe(true)
    expect(controls[2].insertDragActive).toBe(true)
    const permissionsDrawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Document permissions"]')!
    expect(permissionsDrawer).not.toBeNull()
    expect(permissionsDrawer.icon).toBe("Document")
    expect(permissionsDrawer.iconBadge).toBe("Checkbox")
    expect(permissionsDrawer.layout).toBe("distribution")
    expect(permissionsDrawer.showPaneIcon).toBe(true)
    expect(permissionsDrawer.querySelector("distribution-controls")).toBe(controls[0])
    const sharingDrawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Paragraph permissions"]')!
    expect(sharingDrawer).not.toBeNull()
    expect(sharingDrawer.icon).toBe("Paragraph")
    expect(sharingDrawer.iconBadge).toBe("Checkbox")
    expect(sharingDrawer.layout).toBe("distribution")
    expect(sharingDrawer.showPaneIcon).toBe(true)
    expect(sharingDrawer.querySelector("distribution-controls")).toBe(controls[1])
    expect(controls[1].shadowRoot!.querySelector("h2")?.textContent).toBe("Grouping")
    expect(controls[2].shadowRoot!.querySelector("h2")?.textContent).toBe("Permissions")
    expect(sharingDrawer.hasAttribute("data-selected")).toBe(true)
    expect([...sharingDrawer.querySelectorAll("distribution-controls")]).toEqual([controls[1], controls[2]])
    expect(toolbox.shadowRoot!.querySelector("details")).toBeNull()
    toolbox.elementSelected = false
    await toolbox.updateComplete
    expect(sharingDrawer.label).toBe("Permissions")
    expect(sharingDrawer.hasAttribute("data-selected")).toBe(false)
    expect(controls[1].disabled).toBe(true)
    expect(controls[2].disabled).toBe(true)
    expect(toolbox.shadowRoot!.querySelector("element-style-editor, .widget-sharing, .specialized-widget-primary")).toBeNull()
    expect(toolbox.activeTool).toBe("Distribute")
  })

  it.each([
    ["document", "Document", "Document"], ["canvas", "Canvas", "Canvas"],
    ["slides", "Slides", "KeywordPresentation"], ["board", "Board", "Columns"],
  ] as const)("uses the %s layout name and icon for document distribution", async (mode, label, icon) => {
    const toolbox = await mountToolbox()
    toolbox.documentLayout = {mode, canConvert: true, zoom: 100}
    toolButton(toolbox, "Distribute").click()
    await toolbox.updateComplete
    const drawers = [...toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>('ribbon-drawer[layout="distribution"]')]
    expect(drawers).toHaveLength(2)
    expect(drawers[0].label).toBe(`${label} permissions`)
    expect(drawers[0].icon).toBe(icon)
    expect(drawers[0].iconBadge).toBe("Checkbox")
    expect(drawers[1].label).toBe("Permissions")
    expect(drawers[1].iconBadge).toBe("Checkbox")
  })

  it("keeps the Grouping control visible and disabled when no element is selected", async () => {
    const toolbox = await mountToolbox()
    toolButton(toolbox, "Distribute").click()
    await toolbox.updateComplete
    const grouping = toolbox.shadowRoot!.querySelector<HTMLElement & {disabled: boolean, updateComplete: Promise<unknown>}>('distribution-controls[view="grouping"]')!
    await grouping.updateComplete
    expect(grouping.disabled).toBe(true)
    const control = grouping.shadowRoot!.querySelector('.grouping')!
    expect(control.getAttribute("aria-disabled")).toBe("true")
    expect(grouping.shadowRoot!.textContent).toContain("single")
    expect(grouping.shadowRoot!.textContent).not.toContain("Select an element")
    expect([...grouping.shadowRoot!.querySelectorAll("button")].every(button => button.disabled)).toBe(true)
  })

  it("does not install app-only AI or resize listeners across reconnects", async () => {
    const aiListener = vi.spyOn(AIProviderStore.prototype, "addEventListener")
    const windowListener = vi.spyOn(window, "addEventListener")
    try {
      const toolbox = await mountToolbox()
      document.body.replaceChildren()
      document.body.append(toolbox)
      await toolbox.updateComplete

      expect(aiListener).not.toHaveBeenCalled()
      expect(windowListener.mock.calls.filter(([type]) => type === "resize")).toHaveLength(0)

      const styleStateRequest = vi.fn()
      const toolboxChange = vi.fn()
      toolbox.addEventListener("element-style-state-request", styleStateRequest)
      toolbox.addEventListener("toolbox-change", toolboxChange)
      toolbox.selectTool("Style")
      await toolbox.updateComplete
      expect(styleStateRequest).toHaveBeenCalledTimes(1)
      expect(toolboxChange).toHaveBeenCalledTimes(1)
    }
    finally {
      aiListener.mockRestore()
      windowListener.mockRestore()
    }
  })

  it("can hide the tabs underline without changing tab sizing", async () => {
    const toolbox = await mountToolbox()
    const tabs = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-tabs")!

    toolbox.style.setProperty("--toolbox-tabs-border-color", "transparent")
    expect(getComputedStyle(tabs).borderBottomColor).toBe("transparent")
    expect(getComputedStyle(tabs).borderBottomWidth).toBe("0.5px")
    expect(getComputedStyle(tabs).height).toBe("30px")

    toolbox.style.removeProperty("--toolbox-tabs-border-color")
    expect(getComputedStyle(tabs).borderBottomColor).toBe("#a8a8a8")
  })

  it("widens the active tab and narrows it when switching or closing", async () => {
    const toolbox = await mountToolbox()
    const edit = toolButton(toolbox, "Edit")
    const style = toolButton(toolbox, "Style")
    const tablist = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-tabs")!
    const editTab = edit.closest<HTMLElement>(".toolbox-tab")!
    const styleTab = style.closest<HTMLElement>(".toolbox-tab")!

    expect(toolbox.activeTool).toBeNull()
    expect(toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane")!.hidden).toBe(true)

    edit.click()
    await toolbox.updateComplete
    expect(toolbox.activeTool).toBe("Edit")
    expect(toolbox.getAttribute("active-tool")).toBe("Edit")
    expect(getComputedStyle(toolbox).width).toBe("216px")
    expect(edit.getAttribute("aria-selected")).toBe("true")
    expect(style.getAttribute("aria-selected")).toBe("false")
    expect(getComputedStyle(editTab).width).toBe("128px")
    expect(getComputedStyle(editTab).height).toBe("30px")
    expect(getComputedStyle(editTab).marginBottom).toBe("-1px")
    expect(getComputedStyle(editTab).backgroundColor).toBe("#f2f2f2")
    expect(getComputedStyle(editTab).borderLeftColor).toBe("#a8a8a8")
    expect(getComputedStyle(editTab).borderBottomColor).toBe("#f2f2f2")
    expect(getComputedStyle(edit).justifyContent).toBe("flex-start")
    expect(getComputedStyle(tablist).paddingRight).toBe("4px")
    expect(getComputedStyle(tablist).paddingLeft).toBe("0px")
    expect(Array.from(tablist.querySelectorAll<HTMLElement>(".toolbox-tab"))
      .map(tab => getComputedStyle(tab).flexGrow)).toEqual(["1", "0", "0", "0", "0"])
    expect(getComputedStyle(style).width).toBe("28px")
    expect(getComputedStyle(editTab).transition).toContain("width")
    expect(getComputedStyle(edit.querySelector<HTMLElement>(".toolbox-tab-label")!).opacity).toBe("1")
    const editClose = editTab.querySelector<HTMLButtonElement>(".toolbox-tab-close")!
    expect(editClose.disabled).toBe(false)
    expect(getComputedStyle(editClose).width).toBe("24px")
    expect(toolbox.shadowRoot!.querySelector(".pane-header")).toBeNull()

    style.click()
    await toolbox.updateComplete
    expect(toolbox.activeTool).toBe("Style")
    expect(edit.getAttribute("aria-selected")).toBe("false")
    expect(style.getAttribute("aria-selected")).toBe("true")
    expect(getComputedStyle(editTab).width).toBe("28px")
    expect(getComputedStyle(styleTab).width).toBe("128px")
    expect(Array.from(tablist.querySelectorAll<HTMLElement>(".toolbox-tab"))
      .map(tab => getComputedStyle(tab).flexGrow)).toEqual(["0", "1", "0", "0", "0"])
    expect(editClose.disabled).toBe(true)

    const pane = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane")!
    expect(getComputedStyle(toolbox).width).toBe("216px")
    expect(getComputedStyle(pane).width).toBe("100%")

    styleTab.querySelector<HTMLButtonElement>(".toolbox-tab-close")!.click()
    await toolbox.updateComplete
    expect(toolbox.activeTool).toBeNull()
    expect(toolbox.hasAttribute("active-tool")).toBe(false)
    expect(getComputedStyle(styleTab).width).toBe("28px")
    expect(getComputedStyle(toolbox).width).toBe("122px")
  })

  it("opens one developer console from Edit and locks its toggle during pending HTML edits", async () => {
    const toolbox = await mountToolbox()
    toolButton(toolbox, "Edit").click()
    await toolbox.updateComplete
    const footer = toolbox.shadowRoot!.querySelector(".edit-mode-footer")!
    const toggle = toolbox.shadowRoot!.querySelector<HTMLButtonElement>(".developer-console-toggle")!
    const change = vi.fn()
    toolbox.addEventListener("developer-console-change", change)
    expect(toggle.textContent).toContain("Developer console")
    expect(toolbox.shadowRoot!.querySelector(".html-mode-toggle, .develop-mode-toggle")).toBeNull()
    toggle.click()
    expect(change).toHaveBeenCalledWith(expect.objectContaining({detail: {enabled: true}}))
    toolbox.consoleOpen = true
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".edit-mode-footer")).toBe(footer)
    expect(toggle.getAttribute("aria-pressed")).toBe("true")
    expect(toolbox.shadowRoot!.querySelector(".console-pin")).toBeNull()
    const close = toolbox.shadowRoot!.querySelector<HTMLButtonElement>(".console-close")!
    expect(close.disabled).toBe(false)
    close.click()
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({detail: {enabled: false}}))
    expect(toolbox.shadowRoot!.querySelector("ribbon-drawer")).not.toBeNull()
    toolbox.consoleOpen = false
    toolbox.htmlPending = true
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector<HTMLButtonElement>(".developer-console-toggle")!.disabled).toBe(true)
    expect(toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane-content")!.inert).toBe(true)
    toolbox.selectTool("Style")
    expect(toolbox.activeTool).toBe("Edit")
  })

  it("names element-specific Edit tools in the active blue", async () => {
    const toolbox = await mountToolbox()
    const edit = toolButton(toolbox, "Edit")
    const editTab = edit.closest<HTMLElement>(".toolbox-tab")!
    const label = edit.querySelector<HTMLElement>(".toolbox-tab-label")!
    toolbox.table = {
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
    await toolbox.updateComplete
    expect(label.textContent).toBe("Table")
    expect(edit.getAttribute("aria-label")).toBe("Edit Table")
    expect(label.hasAttribute("data-contextual")).toBe(true)
    expect(getComputedStyle(label).color).toBe("#0ea5e9")
    expect(getComputedStyle(label).opacity).toBe("1")
    expect(getComputedStyle(edit).color).toBe("#0ea5e9")
    expect(getComputedStyle(editTab).width).toBe("100px")

    edit.click()
    await toolbox.updateComplete
    expect(getComputedStyle(editTab).width).toBe("128px")

    toolButton(toolbox, "Style").click()
    await toolbox.updateComplete
    expect(label.textContent).toBe("Table")
    expect(getComputedStyle(label).opacity).toBe("0")
    expect(getComputedStyle(edit).color).toBe("#0ea5e9")
    expect(getComputedStyle(editTab).width).toBe("28px")

    toolbox.table = null
    toolbox.graphic = {active: true, capture: false}
    await toolbox.updateComplete
    expect(label.textContent).toBe("Graphic")
    toolbox.graphic = null
    toolbox.selectionPath = [
      {path: [], name: "Document"},
      {path: [0], name: "Demo widget", icon: "Packages"},
    ]
    await toolbox.updateComplete
    expect(label.textContent).toBe("Demo widget")
    expect(edit.getAttribute("aria-label")).toBe("Edit Demo widget")

    toolbox.selectionPath = [{path: [], name: "Document"}, {path: [0], name: "Paragraph"}]
    await toolbox.updateComplete
    expect(label.textContent).toBe("Edit")
    expect(label.hasAttribute("data-contextual")).toBe(false)
    expect(edit.getAttribute("aria-label")).toBe("Edit")
  })

  it("offers layout switching in the Document toolbox for a selected document root", async () => {
    const toolbox = await mountToolbox()
    toolbox.selectionPath = [{path: [0], name: "Graphic", icon: "Graphic"}]
    toolbox.documentSelected = true
    await toolbox.updateComplete

    const edit = toolButton(toolbox, "Edit")
    expect(edit.getAttribute("aria-label")).toBe("Edit Document")
    expect(edit.querySelector(".toolbox-tab-label")?.textContent).toBe("Document")

    edit.click()
    await toolbox.updateComplete
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Document"]')!
    const buttons = Array.from(drawer.querySelectorAll<RibbonButton>("ribbon-button"))
    expect(buttons).toHaveLength(0)
    expect(drawer.querySelector('document-head-editor[mode="common"]')).not.toBeNull()
  })

  it("shows four layout cards with the active layout selected and emits conversion requests", async () => {
    const toolbox = await mountToolbox()
    toolbox.documentSelected = true
    toolbox.selectTool("Edit")
    await toolbox.updateComplete

    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[data-specialized="document"]')!
    expect(drawer.label).toBe("Document")
    expect(drawer.querySelector("details")).toBeNull()
    expect(drawer.querySelector(".layout-preview-toggle, .document-layout-zoom")).toBeNull()
    const choices = Array.from(drawer.querySelectorAll<HTMLButtonElement>(".document-layout-change"))
    expect(choices.map(button => button.dataset.mode)).toEqual(["document", "canvas", "slides", "board"])
    expect(choices.filter(button => button.getAttribute("aria-pressed") === "true").map(button => button.dataset.mode)).toEqual(["document"])
    expect(choices[0].disabled).toBe(true)
    expect(choices.every(button => button.querySelector('.document-layout-preview[aria-hidden="true"]'))).toBe(true)
    const request = vi.fn()
    toolbox.addEventListener("document-layout-change", request)
    choices[1].click()
    expect(request).toHaveBeenCalledWith(expect.objectContaining({detail: {mode: "canvas"}}))

    toolbox.documentLayout = {mode: "canvas", canConvert: true, zoom: 125}
    await toolbox.updateComplete
    expect(drawer.querySelector('[data-mode="canvas"]')!.getAttribute("aria-pressed")).toBe("true")
    expect(drawer.querySelector<HTMLButtonElement>('[data-mode="canvas"]')!.disabled).toBe(true)
    expect(drawer.querySelector<HTMLButtonElement>('[data-mode="slides"]')!.disabled).toBe(false)

    toolbox.documentLayout = {mode: "canvas", canConvert: false, zoom: 125}
    await toolbox.updateComplete
    expect(drawer.querySelector<HTMLButtonElement>('[data-mode="document"]')!.disabled).toBe(true)
    expect(drawer.querySelector<HTMLButtonElement>('[data-mode="slides"]')!.disabled).toBe(true)
    expect(drawer.querySelector<HTMLButtonElement>('[data-mode="slides"]')!.title).toContain("cannot be converted automatically")

    toolbox.documentLayout = {mode: "document", canConvert: true, zoom: 100, conversions: {slides: "Slides require sectioned content"}}
    await toolbox.updateComplete
    const slides = drawer.querySelector<HTMLButtonElement>('[data-mode="slides"]')!
    expect(slides.disabled).toBe(true)
    expect(slides.title).toBe("Slides require sectioned content")
    toolbox.htmlPending = true
    await toolbox.updateComplete
    expect(drawer.querySelector<HTMLButtonElement>('[data-mode="canvas"]')!.disabled).toBe(true)
  })

  it("offers universal attributes alongside specialized tools and for uncommon elements", async () => {
    const toolbox = await mountToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.media = {type: "img", attributes: {alt: "Diagram"}}
    toolbox.elementAttributes = {
      path: [0],
      localName: "img",
      namespaceURI: "http://www.w3.org/1999/xhtml",
      name: "Image",
      icon: "Image",
      attributes: {alt: "Diagram", fetchpriority: "high"},
    }
    await toolbox.updateComplete

    expect(Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer"), drawer => drawer.label))
      .toEqual(["Style", "Image"])
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Image"] element-attribute-editor')).not.toBeNull()

    toolbox.media = null
    toolbox.elementAttributes = {
      path: [1],
      localName: "blockquote",
      namespaceURI: "http://www.w3.org/1999/xhtml",
      name: "Quote",
      icon: "Quote",
      attributes: {cite: "source.html"},
    }
    await toolbox.updateComplete
    expect(toolButton(toolbox, "Edit").getAttribute("aria-label")).toBe("Edit Quote")
    expect(toolbox.shadowRoot!.querySelectorAll("ribbon-drawer")).toHaveLength(2)
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Quote"] element-attribute-editor')).not.toBeNull()
  })

  it("offers specialized paragraph and heading controls", async () => {
    const toolbox = await mountToolbox()
    toolbox.selectTool("Edit")
    for(const tag of ["p", "pre", "p"]) {
      toolbox.elementAttributes = {
        path: [0], localName: tag, namespaceURI: "http://www.w3.org/1999/xhtml",
        name: tag === "p" ? "Paragraph" : "Preformatted Text", attributes: {},
      }
      await toolbox.updateComplete
      expect(toolButton(toolbox, "Edit").getAttribute("aria-label")).toBe("Edit")
      expect(toolButton(toolbox, "Edit").closest(".toolbox-tab")!.hasAttribute("data-contextual")).toBe(false)
      expect(Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer"), drawer => drawer.label))
        .toEqual(["Style", toolbox.elementAttributes.name])
      expect(toolbox.shadowRoot!.querySelector('.paragraph-format-switch')).toBeNull()
    }
    toolbox.elementAttributes = {...toolbox.elementAttributes!, localName: "h1", name: "Heading"}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector('input[role="switch"]')).toBeNull()
  })

  it.each(["p", "pre", "figure", "span", "demo-widget", "unfamiliar-element"])("advertises explicitly selected %s and clears the indication when selection ends", async localName => {
    const toolbox = await mountToolbox()
    toolbox.elementAttributes = {path: [0], localName, namespaceURI: "http://www.w3.org/1999/xhtml", name: localName, attributes: {}}
    toolbox.elementSelected = true
    await toolbox.updateComplete
    const edit = toolButton(toolbox, "Edit")
    const tab = edit.closest(".toolbox-tab")!
    expect(edit.getAttribute("aria-label")).toBe(`Edit ${localName}`)
    expect(tab.hasAttribute("data-contextual")).toBe(true)
    expect(tab.hasAttribute("data-available")).toBe(true)
    edit.click()
    await toolbox.updateComplete
    expect(edit.getAttribute("aria-selected")).toBe("true")
    toolbox.elementSelected = false
    toolbox.elementAttributes = null
    toolbox.selectTool(null)
    await toolbox.updateComplete
    expect(edit.getAttribute("aria-label")).toBe("Edit")
    expect(tab.hasAttribute("data-available")).toBe(false)
  })

  it("offers understandable disclosure and heading-group tools alongside universal attributes", async () => {
    const toolbox = await mountToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.elementAttributes = {
      path: [0],
      localName: "details",
      namespaceURI: "http://www.w3.org/1999/xhtml",
      name: "Details",
      icon: "Details",
      attributes: {name: "faq", open: ""},
    }
    await toolbox.updateComplete

    expect(Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer")).map(drawer => drawer.label))
      .toEqual(["Style", "Details"])
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Disclosure"]')).toBeNull()

    toolbox.elementAttributes = null
    toolbox.headingGroup = {heading: "h2", beforeCount: 1, afterCount: 1}
    await toolbox.updateComplete
    expect(toolButton(toolbox, "Edit").getAttribute("aria-label")).toBe("Edit Heading group")
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Heading group"]')).not.toBeNull()
  })

  it("exposes a selected block quotation citation in the section tools", async () => {
    const toolbox = await mountToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.sectionSelected = true
    toolbox.sectionType = "blockquote"
    toolbox.elementAttributes = {
      path: [0],
      localName: "blockquote",
      namespaceURI: "http://www.w3.org/1999/xhtml",
      name: "Quote",
      icon: "Quote",
      attributes: {cite: "source.html"},
    }
    await toolbox.updateComplete

    const citation = toolbox.shadowRoot!.querySelector<HTMLInputElement>(
      'ribbon-drawer[label="Quote"] input[type="url"]',
    )!
    expect(citation.value).toBe("source.html")
    const changed = vi.fn()
    toolbox.addEventListener("element-attribute-change", changed)
    citation.value = "https://example.test/source"
    citation.dispatchEvent(new Event("change"))
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({name: "cite", value: "https://example.test/source"}),
    }))
  })

  it("omits a Figure drawer and contextual label for an active or explicitly selected figure", async () => {
    const toolbox = await mountToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.sectionType = "figure"
    toolbox.figure = {hasCaption: false}
    await toolbox.updateComplete

    expect(toolButton(toolbox, "Edit").getAttribute("aria-label")).toBe("Edit")
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Section"], ribbon-drawer[label="Figure"]')).toBeNull()

    toolbox.sectionSelected = true
    toolbox.figure = {hasCaption: true}
    await toolbox.updateComplete
    expect(toolButton(toolbox, "Edit").getAttribute("aria-label")).toBe("Edit")
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Section"], ribbon-drawer[label="Figure"]')).toBeNull()
  })

  it("separates Edit, Review, Style, and Develop into their pane-specific controls", async () => {
    const toolbox = await mountToolbox()

    toolButton(toolbox, "Edit").click()
    await toolbox.updateComplete
    let drawers = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer"))
    await Promise.all(drawers.map(drawer => drawer.updateComplete))
    expect(drawers.map(drawer => drawer.label)).toEqual(["Style", "Attributes"])
    expect(drawers.every(drawer => drawer.pane && !drawer.collapsed)).toBe(true)
    const defaultAttributes = drawers[1].querySelector("element-attribute-editor")!
    await defaultAttributes.updateComplete
    expect(defaultAttributes.disabled).toBe(true)
    expect(Array.from(defaultAttributes.shadowRoot!.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
      "input, select, button",
    )).every(control => control.disabled)).toBe(true)

    toolButton(toolbox, "Review").click()
    await toolbox.updateComplete
    drawers = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer"))
    expect(drawers.map(drawer => drawer.label)).toEqual(["Comments"])
    expect(drawers.every(drawer => drawer.pane && !drawer.collapsed)).toBe(true)
    expect(toolbox.shadowRoot!.querySelector(".proofreading-section h2")?.textContent?.trim()).toBe("Issues")
    expect(drawers.find(drawer => drawer.label === "Comments")!
      .querySelector('textarea[aria-label="New comment"]')).not.toBeNull()

    toolButton(toolbox, "Style").click()
    await toolbox.updateComplete
    drawers = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>('ribbon-drawer[layout="element-style"]'))
    expect(drawers.map(drawer => drawer.label)).toEqual([
      "Position & Form",
      "Layout",
      "Text",
      "Color & Visibility",
      "Interaction & Motion",
      "Other",
    ])
    expect(drawers.every(drawer => drawer.querySelectorAll("element-style-editor").length === 2)).toBe(true)
    await Promise.all(drawers.map(drawer => drawer.updateComplete))
    const position = drawers[0]
    const controls = position.shadowRoot!.querySelector<HTMLElement>(".controls")!
    const basic = position.querySelector<ElementStyleEditor>("element-style-editor[mode=basic]")!
    const basicGrid = basic.shadowRoot!.querySelector<HTMLElement>(".basic-grid")!
    expect(basic.orientation).toBe("vertical")
    expect(getComputedStyle(controls).display).toBe("flex")
    expect(getComputedStyle(controls).flexDirection).toBe("column")
    expect(getComputedStyle(basicGrid).gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))")
    expect(getComputedStyle(basicGrid).gridTemplateRows).toBe("repeat(3, minmax(2.6rem, auto))")
    expect(RibbonDrawer.styles.toString()).toMatch(
      /:host\(\[pane\]\[layout="element-style"\]\) ::slotted\(element-style-editor\)\s*\{[\s\S]*?width:\s*100%;/,
    )
    const toggle = position.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!
    expect(toggle.parentElement).toBe(controls)
    expect(toggle.querySelector(".drawer-toggle-label")?.textContent).toBe("Options")
    expect(toggle.nextElementSibling?.getAttribute("name")).toBe("more")
    expect(getComputedStyle(toggle).position).toBe("static")
    expect(getComputedStyle(toggle).width).toBe("100%")
    expect(getComputedStyle(toggle).backgroundColor).toBe("transparent")
    expect(getComputedStyle(toggle).borderColor).toBe("transparent")
    toggle.click()
    await position.updateComplete
    const advanced = position.querySelector<ElementStyleEditor>("element-style-editor[mode=advanced]")!
    const advancedContent = advanced.shadowRoot!.querySelector<HTMLElement>(".advanced")!
    expect(position.hasAttribute("drawer-open")).toBe(true)
    expect(toggle.querySelector(".drawer-toggle-label")?.textContent).toBe("Options")
    expect(advanced.orientation).toBe("vertical")
    expect(getComputedStyle(advancedContent).overflow).toBe("visible")
    expect(getComputedStyle(advanced.shadowRoot!.querySelector<HTMLElement>(".advanced-divider")!).display).toBe("none")

    toolButton(toolbox, "Edit").click()
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".developer-console-toggle")).not.toBeNull()
    drawers = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer"))
    expect(drawers.map(drawer => drawer.label)).toEqual(["Style", "Attributes"])
  })
})


it("limits the document Style drawer to Background", async () => {
  const toolbox = await mountToolbox()
  toolbox.documentSelected = true
  toolbox.elementStyle = {
    target: {localName: "my-document", namespaceURI: "http://www.w3.org/1999/xhtml", documentRoot: true},
    inline: {}, computed: {}, context: {display: "block", parentDisplay: "block"},
  }
  toolbox.selectTool("Edit")
  await toolbox.updateComplete
  const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Style"]')!
  await drawer.updateComplete
  expect(drawer.expandable).toBe(true)
  const controls = drawer.querySelector<ElementStyleEditor>('element-style-editor[slot="more"]')!
  await controls.updateComplete
  expect(Array.from(controls.shadowRoot!.querySelectorAll("[data-property]"), row => row.getAttribute("data-property"))).toEqual(["background-color"])
})


it("enables heading Reset only for authored drawer styles and resets them together", async () => {
  const toolbox = await mountToolbox()
  toolbox.selectTool("Edit")
  await toolbox.updateComplete
  const reset = () => toolbox.shadowRoot!.querySelector<HTMLButtonElement>('.style-reset')!
  expect(reset().slot).toBe("heading-action")
  expect(reset().disabled).toBe(true)
  toolbox.elementStyle = {
    target: {localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml"},
    inline: {"font-family": {value: "serif", priority: ""}, rotate: {value: "30deg", priority: ""}, scale: {value: "1.5", priority: ""}},
    computed: {width: "400px"}, context: {display: "block", parentDisplay: "block"},
  }
  await toolbox.updateComplete
  expect(reset().disabled).toBe(true)
  toolbox.elementStyle = {...toolbox.elementStyle, inline: {
    ...toolbox.elementStyle.inline,
    width: {value: "100px", priority: ""},
    opacity: {value: "0.5", priority: ""},
    color: {value: "red", priority: ""},
    "padding-top": {value: "4px", priority: "important"},
    "border-top-left-radius": {value: "4px", priority: ""},
    "border-left-color": {value: "blue", priority: ""},
  }}
  await toolbox.updateComplete
  expect(reset().disabled).toBe(false)
  const changes: unknown[] = []
  toolbox.addEventListener("element-style-change", event => changes.push((event as CustomEvent).detail))
  reset().click()
  expect(changes).toEqual([{styles: {color: null, width: null, padding: null, "border-radius": null, "border-color": null, opacity: null,
    "padding-top": null, "border-top-left-radius": null, "border-left-color": null}}])
  toolbox.documentSelected = true
  await toolbox.updateComplete
  expect(reset().disabled).toBe(true)
  toolbox.elementStyle = {...toolbox.elementStyle, inline: {...toolbox.elementStyle.inline, "background-color": {value: "red", priority: ""}}}
  await toolbox.updateComplete
  reset().click()
  expect(changes.at(-1)).toEqual({styles: {"background-color": null}})
  toolbox.elementStyle = {...toolbox.elementStyle, inline: {}}
  await toolbox.updateComplete
  expect(reset().disabled).toBe(true)
})


it("counts authored advanced fields once each in the Advanced options pill", async () => {
  const toolbox = await mountToolbox()
  toolbox.selectTool("Edit")
  await toolbox.updateComplete
  const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Style"]')!
  await drawer.updateComplete
  expect(drawer.shadowRoot!.querySelector(".advanced-count")!.textContent).toBe("0")
  toolbox.elementStyle = {
    target: {localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml"},
    inline: {
      width: {value: "100px", priority: ""},
      "margin-top": {value: "2px", priority: ""},
      "margin-bottom": {value: "4px", priority: ""},
      "border-top-left-radius": {value: "4px", priority: ""},
      "background-color": {value: "red", priority: ""},
      "box-shadow": {value: "0 4px 8px black", priority: ""},
      filter: {value: "sepia(1)", priority: ""},
    }, computed: {height: "300px"}, context: {display: "block", parentDisplay: "block"},
  }
  await toolbox.updateComplete
  await drawer.updateComplete
  expect(drawer.shadowRoot!.querySelector(".advanced-count")!.textContent).toBe("6")
  toolbox.elementStyle = {...toolbox.elementStyle, inline: {}}
  await toolbox.updateComplete
  await drawer.updateComplete
  expect(drawer.shadowRoot!.querySelector(".advanced-count")!.textContent).toBe("0")
})

it("retains Style advanced options through selection changes and outside clicks", async () => {
  const toolbox = await mountToolbox()
  toolbox.selectTool("Edit")
  await toolbox.updateComplete
  const drawer = () => toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Style"]')!
  await drawer().updateComplete
  drawer().shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!.click()
  document.body.dispatchEvent(new Event("pointerdown", {bubbles: true}))
  toolbox.elementAttributes = {
    path: [0], localName: "my-widget", namespaceURI: "http://www.w3.org/1999/xhtml", name: "Widget", attributes: {},
  }
  await toolbox.updateComplete
  await drawer().updateComplete
  await drawer().updateComplete
  expect(drawer().shadowRoot!.querySelector(".drawer-toggle")!.getAttribute("aria-expanded")).toBe("true")
  toolbox.documentSelected = true
  await toolbox.updateComplete
  await drawer().updateComplete
  toolbox.documentSelected = false
  await toolbox.updateComplete
  await drawer().updateComplete
  await drawer().updateComplete
  expect(drawer().shadowRoot!.querySelector(".drawer-toggle")!.getAttribute("aria-expanded")).toBe("true")
})

it("remembers advanced options until explicitly collapsed or the toolbox closes", async () => {
  const toolbox = await mountToolbox()
  toolbox.selectTool("Edit")
  await toolbox.updateComplete
  const drawer = () => toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Style"]')!
  const settle = async () => {
    await toolbox.updateComplete
    await drawer().updateComplete
    await drawer().updateComplete
  }
  await settle()
  const toggle = () => drawer().shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!.click()
  const isOpen = () => drawer().shadowRoot!.querySelector(".drawer-toggle")!.getAttribute("aria-expanded")
  toggle()
  toolbox.dismissDrawers()
  drawer().dispatchEvent(new CustomEvent("ribbon-button-click", {detail: {}, bubbles: true}))
  toolbox.selectTool("Review")
  await toolbox.updateComplete
  toolbox.selectTool("Edit")
  await settle()
  expect(isOpen()).toBe("true")
  toggle()
  toolbox.elementStyle = {...toolbox.elementStyle, inline: {width: {value: "20px", priority: ""}}}
  await settle()
  expect(isOpen()).toBe("false")
  toggle()
  toolbox.selectTool(null)
  await toolbox.updateComplete
  toolbox.selectTool("Edit")
  await settle()
  expect(isOpen()).toBe("false")
})

describe("widget options drawer", () => {
  it("edits declared options and runs actions", async () => {
    const toolbox = await mountToolbox(false)
    toolbox.selectTool("Edit")
    toolbox.widgetOptions = {
      path: [0],
      localName: "demo-quiz",
      options: [
        {name: "count", type: "number", label: "Count", attribute: "count", value: 3, min: 0},
        {name: "shuffled", type: "boolean", label: "Shuffled", attribute: "shuffled", value: true},
        {name: "mode", type: "select", label: "Mode", attribute: "mode", value: "b", choices: [{value: "a", label: "A"}, {value: "b", label: "B"}]},
        {name: "data", type: "object", label: "Data", attribute: "data", value: {a: 1}},
      ],
      actions: [{name: "reset", label: "Reset"}],
    }
    await toolbox.updateComplete
    const drawer = toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Quiz"]')!
    const changes: unknown[] = []
    toolbox.addEventListener("widget-option-change", event => changes.push((event as CustomEvent).detail))
    const actions: unknown[] = []
    toolbox.addEventListener("widget-action", event => actions.push((event as CustomEvent).detail))

    const number = drawer.querySelector('style-combobox')!
    expect(number.value).toBe("3")
    number.dispatchEvent(new CustomEvent("combobox-change", {detail: {value: "7"}}))
    const checkbox = drawer.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(checkbox.checked).toBe(true)
    checkbox.checked = false
    checkbox.dispatchEvent(new Event("change"))
    const choices = drawer.querySelectorAll<HTMLButtonElement>(".specialized-choice-group button")
    expect(choices[1].getAttribute("aria-pressed")).toBe("true")
    choices[0].click()
    const json = drawer.querySelector<HTMLTextAreaElement>("textarea[data-json]")!
    json.value = "{broken"
    json.dispatchEvent(new Event("change"))
    json.value = '{"a": 2}'
    json.dispatchEvent(new Event("change"))
    const button = drawer.querySelector<RibbonButton>(".widget-action")!
    await button.updateComplete
    button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()

    expect(changes).toEqual([
      {name: "count", value: 7},
      {name: "shuffled", value: false},
      {name: "mode", value: "a"},
      {name: "data", value: {a: 2}},
    ])
    expect(actions).toEqual([{name: "reset"}])
  })
})

describe("widget sharing toolbox", () => {
  it("places Share after style options, toggles sharing and removes a grouping", async () => {
    const {defaultGroupingRules} = await import("../widget-grouping.js")
    const toolbox = await mountToolbox()
    toolbox.selectTool("Edit")
    toolbox.elementAttributes = {path: [0], localName: "my-widget", namespaceURI: "http://www.w3.org/1999/xhtml", name: "Widget", attributes: {}}
    toolbox.widgetOptions = {path: [0], localName: "my-widget", options: [], actions: [], sharing: {widgetId: "widget", mode: "individual", grouping: null}}
    await toolbox.updateComplete
    const controls = toolbox.shadowRoot!.querySelector(".toolbox-pane-content")!
    const style = controls.querySelector('ribbon-drawer[label="Style"]')!
    const sharing = controls.querySelector(".widget-sharing")!
    expect(getComputedStyle(sharing).paddingLeft).toBe("0px")
    expect(getComputedStyle(sharing).paddingRight).toBe("0px")
    expect(style.compareDocumentPosition(sharing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const listener = vi.fn()
    toolbox.addEventListener("widget-sharing-change", listener)
    const toggle = sharing.querySelector<HTMLInputElement>('input[role="switch"]')!
    expect(toggle.checked).toBe(false)
    toggle.checked = true; toggle.dispatchEvent(new Event("change"))
    expect(listener.mock.calls[0][0].detail).toEqual({path: [0], localName: "my-widget", widgetId: "widget", enabled: true})
    toolbox.widgetOptions = {...toolbox.widgetOptions, sharing: {widgetId: "widget", mode: "all", grouping: null}}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".add-grouping")?.textContent).toBe("Add grouping")
    toolbox.widgetOptions = {...toolbox.widgetOptions, sharing: {widgetId: "widget", mode: "group", grouping: defaultGroupingRules("card")}}
    const removed = vi.fn(); toolbox.addEventListener("widget-grouping-change", removed)
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".grouping-summary")?.textContent).toContain("members per group")
    expect(toolbox.shadowRoot!.querySelector(".add-grouping")).toBeNull()
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Remove grouping"]')!.click()
    expect(removed.mock.calls[0][0].detail.grouping).toBeNull()
    expect(toolbox.shadowRoot!.querySelector("widget-grouping-dialog")).not.toBeNull()
  })
})

it("defaults caption choices to below and switches their icons with the Top checkbox", async () => {
  const toolbox = await mountToolbox()
  toolbox.selectTool("Edit")
  toolbox.elementStyle = {target: {localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml"}, inline: {}, computed: {}, context: {display: "block", parentDisplay: "block"}}
  const actions = vi.fn()
  toolbox.addEventListener("layout-action", actions)
  await toolbox.updateComplete
  const controls = toolbox.shadowRoot!.querySelector(".float-action-controls")!
  const top = controls.querySelector<HTMLInputElement>('.caption-top input')!
  const buttons = () => [...controls.querySelectorAll<HTMLButtonElement>('.caption-button-group button')]
  expect(top.closest("label")!.textContent).toBe("Top")
  expect(top.checked).toBe(false)
  expect(top.disabled).toBe(true)
  expect(buttons()).toHaveLength(4)
  expect(buttons()[0].getAttribute("aria-pressed")).toBe("true")
  buttons()[3].click()
  expect(actions.mock.calls.at(-1)![0].detail).toEqual({type: "setCaption", position: "below", alignment: "right"})
  toolbox.captionPosition = "below"
  toolbox.captionAlignment = "right"
  await toolbox.updateComplete
  expect(top.disabled).toBe(false)
  expect(buttons()[3].getAttribute("aria-pressed")).toBe("true")
  top.click()
  expect(actions.mock.calls.at(-1)![0].detail).toEqual({type: "setCaption", position: "above"})
  toolbox.captionPosition = "above"
  await toolbox.updateComplete
  expect(top.checked).toBe(true)
  expect(buttons()[3].getAttribute("aria-label")).toBe("Caption above, align right")
  expect(buttons()[3].querySelector("svg line")!.getAttribute("y1")).toBe("3")
  buttons()[2].click()
  expect(actions.mock.calls.at(-1)![0].detail).toEqual({type: "setCaption", position: "above", alignment: "center"})
  top.click()
  expect(actions.mock.calls.at(-1)![0].detail).toEqual({type: "setCaption", position: "below"})
  toolbox.captionPosition = "below"
  await toolbox.updateComplete
  expect(top.checked).toBe(false)
  expect(buttons()[3].querySelector("svg line")!.getAttribute("y1")).toBe("21")
  toolbox.htmlPending = true
  await toolbox.updateComplete
  expect(top.disabled).toBe(true)
  expect(buttons().every(button => button.disabled)).toBe(true)
  toolbox.htmlPending = false
  toolbox.historyState = {...emptyVersionHistoryState(), preview: {checkpointId: "version", isCurrent: false, added: 0, removed: 0, modified: 0}}
  await toolbox.updateComplete
  expect(top.disabled).toBe(true)
  toolbox.historyState = emptyVersionHistoryState()
  toolbox.captionPosition = "none"
  await toolbox.updateComplete
  expect(top.checked).toBe(false)
  expect(top.disabled).toBe(true)
})

it("reflects an existing table caption's top placement", async () => {
  const toolbox = await mountToolbox()
  toolbox.selectTool("Edit")
  toolbox.elementStyle = {target: {localName: "table", namespaceURI: "http://www.w3.org/1999/xhtml"}, inline: {}, computed: {}, context: {display: "table", parentDisplay: "block"}}
  toolbox.table = {active: true, cellSelection: false, rows: 1, columns: 1, selectedCells: 1,
    canMerge: false, canSplit: false, hasCaption: true, hasHeader: false, hasFooter: false}
  await toolbox.updateComplete
  const top = toolbox.shadowRoot!.querySelector<HTMLInputElement>('.caption-top input')!
  expect(top.checked).toBe(true)
  expect(top.disabled).toBe(false)
})

it("opens attribution below Caption and clears a configured caption with its label action", async () => {
  const toolbox = await mountToolbox()
  toolbox.selectTool("Edit")
  toolbox.elementStyle = {target: {localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml"}, inline: {}, computed: {}, context: {display: "block", parentDisplay: "block"}}
  const actions = vi.fn()
  toolbox.addEventListener("layout-action", actions)
  await toolbox.updateComplete
  const controls = toolbox.shadowRoot!.querySelector(".float-action-controls")!
  const clear = () => controls.querySelector<HTMLButtonElement>('[aria-label="Clear Caption"]')!
  expect(clear().style.visibility).toBe("hidden")
  const attribution = controls.querySelector<HTMLButtonElement>('[aria-label="Edit attribution"]')!
  expect(controls.querySelector('[aria-label="Caption"]')!.compareDocumentPosition(attribution) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  attribution.click()
  expect(actions.mock.calls.at(-1)![0].detail).toEqual({type: "openAttribution"})
  toolbox.captionPosition = "below"
  await toolbox.updateComplete
  expect(clear().style.visibility).toBe("")
  clear().click()
  expect(actions.mock.calls.at(-1)![0].detail).toEqual({type: "setCaption", position: "none"})
  toolbox.htmlPending = true
  await toolbox.updateComplete
  expect(clear().disabled).toBe(true)
  expect(attribution.disabled).toBe(true)
  toolbox.htmlPending = false
  toolbox.elementStyle = {...toolbox.elementStyle, target: {localName: "body", namespaceURI: "http://www.w3.org/1999/xhtml", documentRoot: true}}
  toolbox.selectedElementTypes = [{element: {localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml", path: null, name: "Paragraph", attributes: {}}, count: 2, style: toolbox.elementStyle, styleProperties: [], configuredWidgetOptions: []}]
  await toolbox.updateComplete
  expect(toolbox.shadowRoot!.querySelector('[aria-label="Edit attribution"]')).not.toBeNull()
})

it("uses the current text target inside a table for specialized style controls", async () => {
  const toolbox = await mountToolbox()
  toolbox.activeTool = "Edit"
  toolbox.table = {
    active: true, cellSelection: false, rows: 1, columns: 1, selectedCells: 1,
    canMerge: false, canSplit: false, hasCaption: false, hasHeader: false, hasFooter: false,
  }
  toolbox.elementAttributes = {
    path: [0, 0, 0, 0, 0], localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml",
    name: "Paragraph", attributes: {},
  }
  toolbox.elementStyle = {
    target: {localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml"},
    inline: {}, computed: {}, context: {display: "block", parentDisplay: "table-cell"},
  }
  await toolbox.updateComplete
  const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[data-specialized="p"]')!
  expect(drawer).not.toBeNull()
  expect(drawer.label).toBe("Paragraph")
  const editors = Array.from(drawer.querySelectorAll<ElementStyleEditor>("element-style-editor"))
  expect(editors.flatMap(editor => editor.propertyNames ?? [])).toContain("text-align")
  expect(editors.flatMap(editor => editor.propertyNames ?? [])).not.toContain("table-layout")
})

it.each(["td", "th"])("keeps %s style presets available without cell placement actions", async localName => {
  const toolbox = await mountToolbox()
  toolbox.activeTool = "Edit"
  toolbox.elementStyle = {
    target: {localName, namespaceURI: "http://www.w3.org/1999/xhtml"},
    inline: {}, computed: {}, context: {display: "table-cell", parentDisplay: "table-row"},
  }
  await toolbox.updateComplete
  const drawer = toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Style"]')!
  expect(drawer.querySelector('element-style-editor[show-presets]')).not.toBeNull()
  expect(drawer.querySelector('[aria-label="Placement"], [aria-label="Caption"]')).toBeNull()
  toolbox.elementStyle = {...toolbox.elementStyle, target: {localName: "table", namespaceURI: "http://www.w3.org/1999/xhtml"}}
  await toolbox.updateComplete
  expect(drawer.querySelector('[aria-label="Placement"]')).not.toBeNull()
  expect(drawer.querySelector('[aria-label="Caption"]')).not.toBeNull()
})


it("keeps every style option visible and disables the whole drawer at a top-level gap", async () => {
  const toolbox = await mountToolbox()
  toolbox.selectTool("Edit")
  toolbox.elementStyle = {target: null, inline: {}, computed: {}, context: {display: "", parentDisplay: ""}}
  await toolbox.updateComplete
  const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Style"]')!
  expect(drawer.hasAttribute("inert")).toBe(true)
  expect(drawer.getAttribute("aria-disabled")).toBe("true")
  expect(drawer.style.opacity).toBe("0.5")
  const advanced = drawer.querySelector<ElementStyleEditor>('element-style-editor[slot="more"]')!
  expect(drawer.querySelector('[aria-label="Placement"]')).not.toBeNull()
  expect(advanced.propertyNames).toContain("padding")
  expect(advanced.propertyNames).toContain("background-color")
  expect(drawer.querySelector<HTMLButtonElement>(".style-reset")!.disabled).toBe(true)
  toolbox.elementStyle = {...toolbox.elementStyle, target: {localName: "section", namespaceURI: "http://www.w3.org/1999/xhtml"}}
  await toolbox.updateComplete
  expect(drawer.hasAttribute("inert")).toBe(false)
  expect(drawer.style.opacity).toBe("")
})
