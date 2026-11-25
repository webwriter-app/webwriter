import {test} from "node:test"
import assert from "node:assert/strict"
import {mount} from "./dom.js"

const {render} = await import("lit")
const {LanguagePicker, defineLanguagePicker} = await import("@webwriter/widget/language-picker")
const {renderWidgetOptionField} = await import("@webwriter/widget/widget-option-controls")
const {defineWidgetOptionElements} = await import("@webwriter/widget/widget-option-elements")
const {widgetOptionState} = await import("@webwriter/widget/widget-options")

defineLanguagePicker()
defineWidgetOptionElements()

test("a language picker works through its markup, properties and change event", () => {
  const {host, remove} = mount()
  try {
    host.innerHTML = '<ww-language-picker label="Recording language" value="en-US-x-recording"></ww-language-picker>'
    const picker = host.firstElementChild
    const select = picker.shadowRoot.querySelector("select")
    assert.ok(picker instanceof LanguagePicker)
    assert.equal(select.getAttribute("aria-label"), "Recording language")
    assert.equal(select.value, "en-US-x-recording")

    const changes = []
    host.addEventListener("change", event => changes.push([event.target.value, event.composed]))
    select.value = "fr-CA"
    select.dispatchEvent(new Event("change"))
    assert.equal(picker.getAttribute("value"), "fr-CA")
    select.value = ""
    select.dispatchEvent(new Event("change"))
    assert.equal(picker.hasAttribute("value"), false)
    assert.deepEqual(changes, [["fr-CA", true], ["", true]])

    picker.value = "de-AT"
    picker.placeholder = "From the document"
    picker.disabled = true
    assert.equal(select.value, "de-AT")
    assert.equal(select.options[0].textContent, "From the document")
    assert.equal(select.disabled, true)
  }
  finally {remove()}
})

test("the Lit option adapter uses the same language picker", () => {
  const {host, remove} = mount()
  try {
    const changes = []
    const option = widgetOptionState("language", {type: "string", control: "language", label: "Language"}, "de-AT", "en")
    render(renderWidgetOptionField(option, (name, value) => changes.push([name, value])), host)
    const picker = host.querySelector("ww-language-picker")
    assert.ok(picker instanceof LanguagePicker)
    assert.equal(picker.value, "de-AT")
    const select = picker.shadowRoot.querySelector("select")
    select.value = ""
    select.dispatchEvent(new Event("change"))
    assert.deepEqual(changes, [["language", null]])
    render(renderWidgetOptionField({...option, disabled: true}, () => assert.fail("disabled option changed")), host)
    assert.equal(picker.disabled, true)
  }
  finally {remove()}
})

test("a single option field exposes the shared renderer through properties and events", async () => {
  const {host, remove} = mount()
  try {
    const field = document.createElement("ww-option-field")
    field.option = widgetOptionState("score", {type: "number", min: 0, label: "Score"}, 2, "en")
    host.append(field)
    await field.updateComplete
    const input = field.shadowRoot.querySelector("input")
    assert.equal(input.value, "2")
    const changes = []
    host.addEventListener("widget-option-change", event => changes.push([event.detail, event.composed]))
    input.value = "3"
    input.dispatchEvent(new Event("change"))
    assert.deepEqual(changes, [[{name: "score", value: 3}, true]])
    field.option = {...field.option, disabled: true}
    await field.updateComplete
    assert.equal(input.disabled, true)
  }
  finally {remove()}
})

test("the grouped options element renders fields and emits action requests", async () => {
  const {host, remove} = mount()
  try {
    const panel = document.createElement("ww-widget-options")
    panel.groups = [{name: "recording", label: "Recording", collapsible: true}]
    panel.options = [
      widgetOptionState("language", {type: "string", control: "language", group: "recording"}, "fr-CA", "en"),
      widgetOptionState("hidden", {type: "boolean", hidden: true}, true, "en"),
    ]
    panel.actions = [{name: "transcribe", label: "Transcribe", group: "recording"}]
    host.append(panel)
    await panel.updateComplete
    const group = panel.shadowRoot.querySelector("section[data-group=recording]")
    assert.equal(group.querySelector("summary").textContent, "Recording")
    const fields = panel.shadowRoot.querySelectorAll("ww-option-field")
    assert.equal(fields.length, 1)
    await fields[0].updateComplete
    const picker = fields[0].shadowRoot.querySelector("ww-language-picker")
    assert.equal(picker.value, "fr-CA")

    const changes = []
    const actions = []
    host.addEventListener("widget-option-change", event => changes.push(event.detail))
    host.addEventListener("widget-option-action", event => actions.push(event.detail))
    const select = picker.shadowRoot.querySelector("select")
    select.value = "en-GB"
    select.dispatchEvent(new Event("change"))
    group.querySelector("button").click()
    assert.deepEqual(changes, [{name: "language", value: "en-GB"}])
    assert.deepEqual(actions, [{name: "transcribe"}])
  }
  finally {remove()}
})
