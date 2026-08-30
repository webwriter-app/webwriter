// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import "@testing-library/jest-dom/vitest"
import {DOMEditor} from "../domeditor"
import {formElementTypes, inputTypes} from "../form"
import {$} from "../utility"

let editor: DOMEditor

beforeEach(() => {
  document.body.replaceChildren()
  editor = new DOMEditor()
  document.body.replaceChildren()
  $.selectDocumentStart()
})

afterEach(() => editor.destroy())

describe("form editing", () => {
  it("covers every HTML form element and input type", () => {
    expect(formElementTypes).toEqual([
      "form", "fieldset", "legend", "label", "input", "textarea", "select",
      "datalist", "optgroup", "option", "button", "output", "meter", "progress",
      "selectedcontent",
    ])
    expect(inputTypes).toEqual([
      "hidden", "text", "search", "tel", "url", "email", "password", "date",
      "month", "week", "time", "datetime-local", "number", "range", "color",
      "checkbox", "radio", "file", "submit", "image", "reset", "button",
    ])
  })

  it("inserts a visible semantic form default and selects it", () => {
    editor.features.form.actions.insertFormElement({type: "insertFormElement", element: "form"})

    const form = document.querySelector("form")!
    expect(form.querySelector("label")?.textContent).toContain("Field")
    expect(form.querySelector("input")).toHaveAttribute("placeholder", "Enter a value")
    expect(form.querySelector("button")).toHaveTextContent("Submit")
    expect($.selectedElement).toBe(form)
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("gives every standalone control a visible placeholder or authored value", () => {
    const expected = {
      input: "Enter a value",
      textarea: "Enter text",
      select: "Choose an option",
      button: "Button",
      output: "Output",
      meter: "50%",
      progress: "50%",
    } as const

    for(const [type, visible] of Object.entries(expected)) {
      document.body.replaceChildren()
      $.selectDocumentStart()
      editor.features.form.actions.insertFormElement({
        type: "insertFormElement",
        element: type as keyof typeof expected,
      })
      const element = document.body.firstElementChild!
      const presentation = element.getAttribute("placeholder") ?? element.textContent ?? ""
      expect(presentation).toContain(visible)
    }
  })

  it("edits standard and custom attributes while preserving editor markers", () => {
    document.body.innerHTML = '<input class="authored" placeholder="Before">'
    const input = document.querySelector("input")!
    $.selectElement(input)
    editor.features.selection.processSelection()

    editor.features.form.actions.setFormAttribute({type: "setFormAttribute", name: "required", value: ""})
    editor.features.form.actions.setFormAttribute({type: "setFormAttribute", name: "data-answer", value: "42"})
    editor.features.form.actions.setFormAttribute({type: "setFormAttribute", name: "class", value: "updated"})

    expect(input).toHaveAttribute("required")
    expect(input).toHaveAttribute("data-answer", "42")
    expect(input).toHaveClass("updated", "◆", "◆element-selected")
    expect(editor.toHTML(true)).toBe('<input class="updated" placeholder="Before" required="" data-answer="42">')
  })

  it("edits a label without deleting its nested control", () => {
    document.body.innerHTML = '<label>Old label <input placeholder="Field"></label>'
    const label = document.querySelector("label")!
    $.selectElement(label)
    editor.features.selection.processSelection()

    expect(editor.features.form.getState()?.text).toBe("Old label ")
    editor.features.form.actions.setFormText({type: "setFormText", value: "New label "})

    expect(label.childNodes[0]).toHaveTextContent("New label")
    expect(label.querySelector("input")).toHaveAttribute("placeholder", "Field")
  })

  it("adds valid nonempty form structure in the current live DOM", () => {
    document.body.innerHTML = '<form><fieldset></fieldset><select><option value="">Choose</option></select></form>'

    const fieldset = document.querySelector("fieldset")!
    $.selectElement(fieldset)
    editor.features.selection.processSelection()
    editor.features.form.actions.addFormLegend({type: "addFormLegend"})
    expect(fieldset.firstElementChild).toHaveTextContent("Legend")

    $.selectElement(fieldset)
    editor.features.selection.processSelection()
    editor.features.form.actions.addFormField({type: "addFormField"})
    expect(fieldset.querySelector("input")).toHaveAttribute("placeholder", "Enter a value")

    const select = document.querySelector("select")!
    $.selectElement(select)
    editor.features.selection.processSelection()
    editor.features.form.actions.addFormOption({type: "addFormOption"})
    editor.features.form.actions.addFormOptionGroup({type: "addFormOptionGroup"})
    editor.features.form.actions.customizeFormSelect({type: "customizeFormSelect"})

    expect(select.querySelectorAll("option")).toHaveLength(3)
    expect(select.querySelector("optgroup")).toHaveAttribute("label", "Option group")
    expect(select.firstElementChild?.localName).toBe("button")
    expect(select.querySelector("button > selectedcontent")).not.toBeNull()
  })

  it("capture-selects and focuses a text input without intercepting native typing", () => {
    document.body.innerHTML = '<form><input placeholder="Field"><button type="submit">Send</button></form>'
    const input = document.querySelector("input")!
    const pointer = new PointerEvent("pointerdown", {button: 0, bubbles: true, cancelable: true})
    input.dispatchEvent(pointer)

    expect(pointer.defaultPrevented).toBe(false)
    expect($.selectedElement).toBe(input)
    expect(editor.features.selection.captureSelectedElement).toBe(input)
    expect(input).toHaveClass("◆element-selected", "◆element-capture-selected")

    input.focus()
    const keydown = new KeyboardEvent("keydown", {key: "x", bubbles: true, cancelable: true})
    const beforeinput = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      data: "x",
      inputType: "insertText",
    })
    input.dispatchEvent(keydown)
    input.dispatchEvent(beforeinput)

    expect(document.activeElement).toBe(input)
    expect(keydown.defaultPrevented).toBe(false)
    expect(beforeinput.defaultPrevented).toBe(false)
    expect(input.isConnected).toBe(true)

    // Native controls may project their internal caret to an outer document
    // point; capture remains the authoritative form selection in that case.
    document.getSelection()?.setPosition(document.body, 0)
    expect(editor.features.form.getState()?.type).toBe("input")

    input.value = "typed value"
    input.dispatchEvent(new InputEvent("input", {bubbles: true, data: "e", inputType: "insertText"}))
    expect(input).toHaveAttribute("value", "typed value")
    expect(editor.toHTML(true)).toContain('value="typed value"')

    const submit = new SubmitEvent("submit", {bubbles: true, cancelable: true})
    document.querySelector("form")!.dispatchEvent(submit)
    expect(submit.defaultPrevented).toBe(true)
  })

  it("captures an associated control when its label is clicked", () => {
    document.body.innerHTML = '<label for="name">Name</label><input id="name" placeholder="Name">'
    const input = document.querySelector("input")!
    const pointer = new PointerEvent("pointerdown", {button: 0, bubbles: true, cancelable: true})

    document.querySelector("label")!.dispatchEvent(pointer)

    expect(pointer.defaultPrevented).toBe(false)
    expect(editor.features.selection.captureSelectedElement).toBe(input)
  })

  it("mirrors textarea, checkbox, radio, and select UI state into authored HTML", () => {
    document.body.innerHTML = `
      <textarea>Before</textarea>
      <input type="checkbox">
      <input type="radio" name="choice" checked>
      <input type="radio" name="choice">
      <select><option>First</option><option>Second</option></select>
    `
    const textarea = document.querySelector("textarea")!
    textarea.focus()
    textarea.value = "After"
    textarea.dispatchEvent(new InputEvent("input", {bubbles: true, data: "r", inputType: "insertText"}))
    expect(textarea.textContent).toBe("After")

    const checkbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    checkbox.checked = true
    checkbox.dispatchEvent(new Event("input", {bubbles: true}))
    expect(checkbox).toHaveAttribute("checked")

    const radios = document.querySelectorAll<HTMLInputElement>('input[type="radio"]')
    radios[0].checked = false
    radios[1].checked = true
    radios[1].dispatchEvent(new Event("input", {bubbles: true}))
    expect(radios[0]).not.toHaveAttribute("checked")
    expect(radios[1]).toHaveAttribute("checked")

    const select = document.querySelector("select")!
    select.selectedIndex = 1
    select.dispatchEvent(new Event("change", {bubbles: true}))
    expect(select.options[0]).not.toHaveAttribute("selected")
    expect(select.options[1]).toHaveAttribute("selected")
  })
})
