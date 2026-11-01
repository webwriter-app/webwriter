// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import {isAuthoredMutation, widgetEditableMarker} from "./editor-artifacts"

async function recordMutation(target: Node, mutate: () => void, options: MutationObserverInit) {
  const records = await recordMutations(target, mutate, options)
  expect(records).toHaveLength(1)
  return records[0]!
}

async function recordMutations(target: Node, mutate: () => void, options: MutationObserverInit) {
  const records: MutationRecord[] = []
  const observer = new MutationObserver(mutations => records.push(...mutations))
  observer.observe(target, options)
  mutate()
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  observer.disconnect()
  return records
}

describe("isAuthoredMutation", () => {
  it("ignores editor marker-only class changes and detects authored classes", async () => {
    const element = document.createElement("div")
    element.className = "authored"
    document.body.append(element)
    const marker = await recordMutation(element, () => element.classList.add("◆selection"),
      {attributes: true, attributeOldValue: true})
    expect(isAuthoredMutation(marker)).toBe(false)
    const authored = await recordMutation(element, () => element.classList.add("changed"),
      {attributes: true, attributeOldValue: true})
    expect(isAuthoredMutation(authored)).toBe(true)
    element.remove()
  })

  it("ignores same-value attributes and the widget editable contract", async () => {
    const element = document.createElement("div")
    element.setAttribute("title", "same")
    const sameValue = await recordMutation(element, () => element.setAttribute("title", "same"),
      {attributes: true, attributeOldValue: true})
    element.classList.add(widgetEditableMarker)
    const editable = await recordMutation(element, () => element.setAttribute("contenteditable", ""),
      {attributes: true, attributeOldValue: true})
    expect(isAuthoredMutation(sameValue)).toBe(false)
    expect(isAuthoredMutation(editable)).toBe(false)

    for(const value of ["false", "plaintext-only"]) {
      element.setAttribute("contenteditable", "")
      const authoredEditable = await recordMutation(element, () => element.setAttribute("contenteditable", value),
        {attributes: true, attributeOldValue: true})
      expect(isAuthoredMutation(authoredEditable)).toBe(true)
    }

    const authored = await recordMutation(element, () => element.setAttribute("data-authored", "yes"),
      {attributes: true, attributeOldValue: true})
    const namespaced = await recordMutation(element,
      () => element.setAttributeNS("urn:authored", "a:state", "changed"),
      {attributes: true, attributeOldValue: true})
    expect(isAuthoredMutation(authored)).toBe(true)
    expect(isAuthoredMutation(namespaced)).toBe(true)
  })

  it("ignores installing the widget marker and empty editable attribute in one batch", async () => {
    const element = document.createElement("div")
    const records = await recordMutations(element, () => {
      element.classList.add(widgetEditableMarker)
      element.setAttribute("contenteditable", "")
    }, {attributes: true, attributeOldValue: true})
    expect(records).toHaveLength(2)
    expect(records.every(isAuthoredMutation)).toBe(false)
  })

  it("distinguishes temporary Details toggles from authored open changes", async () => {
    const details = document.createElement("details")
    details.classList.add("◆details-temporary-open")
    const temporary = await recordMutation(details, () => details.setAttribute("open", ""),
      {attributes: true, attributeOldValue: true})
    expect(isAuthoredMutation(temporary)).toBe(false)
    details.classList.remove("◆details-temporary-open")
    details.removeAttribute("open")
    const authored = await recordMutation(details, () => details.setAttribute("open", ""),
      {attributes: true, attributeOldValue: true})
    expect(isAuthoredMutation(authored)).toBe(true)
  })

  it("detects text, comments, and authored child changes while ignoring editor UI", async () => {
    const root = document.createElement("div")
    const text = document.createTextNode("before")
    root.append(text)
    const characterData = await recordMutation(text, () => { text.data = "after" },
      {characterData: true, characterDataOldValue: true})
    const commentText = document.createComment("before")
    const commentData = await recordMutation(commentText, () => { commentText.data = "after" },
      {characterData: true, characterDataOldValue: true})
    const comment = document.createComment("authored")
    const childList = await recordMutation(root, () => root.append(comment), {childList: true})
    const ui = document.createElement("span")
    ui.className = "◆editor-only"
    const editorUi = await recordMutation(root, () => root.append(ui), {childList: true})
    const uiInternal = await recordMutation(ui, () => ui.append(document.createTextNode("toolbar")), {childList: true})
    expect(isAuthoredMutation(characterData)).toBe(true)
    expect(isAuthoredMutation(commentData)).toBe(true)
    expect(isAuthoredMutation(childList)).toBe(true)
    expect(isAuthoredMutation(editorUi)).toBe(false)
    expect(isAuthoredMutation(uiInternal)).toBe(false)
  })
})
