import {test} from "node:test"
import assert from "node:assert/strict"
import {mount} from "./dom.js"

const {
  SettingsCore, formatDuration, localized, normalizeSetting, parseDuration, parseSetting, sameSetting, serializeSetting, settingAttribute, settingChoices, settingDefault, settingKind,
} = await import("../settings.js")

const population = {type: Number, default: 200, min: 10, max: 2000}
const showChart = {type: Boolean, default: true}
const speed = {type: "number", default: 1, steps: [0.5, 1, 2, 4]}
const layout = {type: "select", default: "grid", options: [{value: "grid"}, {label: "Lists", children: [{value: "rows"}, {value: "columns"}]}]}
const tags = {type: "select", multiple: true, options: [{value: "a"}, {value: "b"}, {value: "c"}]}

test("the kind, default and attribute of a setting follow its declaration", () => {
  assert.equal(settingKind(population), "number")
  assert.equal(settingKind(showChart), "boolean")
  assert.equal(settingKind(layout), "string")
  assert.equal(settingKind(tags), "list")
  assert.equal(settingKind({}), "string")
  assert.equal(settingDefault(population), 200)
  assert.equal(settingDefault({type: Boolean}), false)
  assert.deepEqual(settingDefault(tags), [])
  assert.equal(settingDefault({type: String}), undefined)
  assert.equal(settingAttribute("stepSize", population), "step-size")
  // A boolean that defaults to true is stored by the presence of its negative attribute.
  assert.equal(settingAttribute("showChart", showChart), "no-show-chart")
  assert.equal(settingAttribute("showChart", {type: Boolean}), "show-chart")
  assert.equal(settingAttribute("showChart", {...showChart, attribute: "hide-chart"}), "hide-chart")
  assert.deepEqual(settingChoices(layout).map(choice => choice.value), ["grid", "rows", "columns"])
})

test("an attribute is parsed into a valid value, and what does not fit gives the default", () => {
  assert.equal(parseSetting(population, "500"), 500)
  assert.equal(parseSetting(population, "5"), 10)
  assert.equal(parseSetting(population, "99999"), 2000)
  assert.equal(parseSetting(population, "many"), 200)
  assert.equal(parseSetting(population, null), 200)
  assert.equal(parseSetting(speed, "3.1"), 4)
  assert.equal(parseSetting(speed, "1.4"), 1)
  assert.equal(parseSetting(showChart, null), true)
  assert.equal(parseSetting(showChart, ""), false)
  assert.equal(parseSetting({type: Boolean}, ""), true)
  assert.equal(parseSetting(layout, "rows"), "rows")
  assert.equal(parseSetting(layout, "circle"), "grid")
  assert.deepEqual(parseSetting(tags, '["c","a","x"]'), ["a", "c"])
  assert.deepEqual(parseSetting(tags, "not json"), [])
  assert.deepEqual(parseSetting(tags, '"a"'), [])
  assert.equal(parseSetting({type: "color", default: "#000000"}, "#FFAA00"), "#ffaa00")
  assert.equal(parseSetting({type: "color", default: "#000000"}, "red"), "#000000")
  assert.equal(parseSetting({type: "date"}, "2026-02-30"), "2026-02-30")
  assert.equal(parseSetting({type: "date"}, "30.02.2026"), undefined)
  assert.equal(parseSetting({type: String, pattern: "[a-z]+", maxlength: 3}, "abc"), "abc")
  assert.equal(parseSetting({type: String, pattern: "[a-z]+", maxlength: 3}, "abcd"), undefined)
  assert.equal(parseSetting({type: String, pattern: "[a-z]+"}, "a1"), undefined)
})

test("a value is serialized for its attribute, and the default is never written", () => {
  assert.equal(serializeSetting(population, 500), "500")
  assert.equal(serializeSetting(population, 200), null)
  assert.equal(serializeSetting(population, 5), "10")
  assert.equal(serializeSetting(population, null), null)
  assert.equal(serializeSetting(showChart, false), "")
  assert.equal(serializeSetting(showChart, true), null)
  assert.equal(serializeSetting({type: Boolean}, true), "")
  assert.equal(serializeSetting({type: Boolean}, false), null)
  assert.equal(serializeSetting(tags, ["c", "a"]), '["a","c"]')
  assert.equal(serializeSetting(tags, []), null)
  assert.equal(serializeSetting(layout, "columns"), "columns")
  assert.equal(serializeSetting(layout, "circle"), null)
})

test("normalizing keeps the fallback for a refused value and resets on an empty one", () => {
  assert.equal(normalizeSetting(population, "abc", 700), 700)
  assert.equal(normalizeSetting(population, "", 700), 200)
  assert.equal(normalizeSetting(population, "150"), 150)
  assert.equal(normalizeSetting(showChart, "yes", false), false)
  assert.equal(normalizeSetting(layout, 5, "rows"), "rows")
  assert.deepEqual(normalizeSetting(tags, ["b", "b", "a"]), ["a", "b"])
  assert.deepEqual(normalizeSetting(tags, ["x"], ["a"]), ["a"])
  assert.equal(sameSetting(["a", "b"], ["a", "b"]), true)
  assert.equal(sameSetting(["a", "b"], ["b", "a"]), false)
  assert.equal(sameSetting(1, 1), true)
  assert.equal(sameSetting(undefined, false), false)
})

test("durations are read and shown as the editor's duration control does", () => {
  assert.equal(formatDuration(90), "1:30")
  assert.equal(formatDuration(3600), "1:00:00")
  assert.equal(formatDuration(5.5), "0:05.5")
  assert.equal(formatDuration(-1), "")
  assert.equal(parseDuration("90"), 90)
  assert.equal(parseDuration("1:30"), 90)
  assert.equal(parseDuration("1:00:00"), 3600)
  assert.equal(parseDuration("0:05.5"), 5.5)
  assert.equal(parseDuration("1:75"), undefined)
  assert.equal(parseDuration("1:2:3:4"), undefined)
  assert.equal(parseDuration("soon"), undefined)
  assert.equal(parseSetting({type: Number, control: "duration"}, "-5"), 0)
})

test("localized text is picked by the exact tag, then the language, then the fallback", () => {
  const text = {_: "Size", de: "Größe", "pt-BR": "Tamanho"}
  assert.equal(localized(text, "de-AT"), "Größe")
  assert.equal(localized(text, "PT-br"), "Tamanho")
  assert.equal(localized(text, "fr"), "Size")
  assert.equal(localized("Plain", "de"), "Plain")
  assert.equal(localized(undefined, "de"), undefined)
})

test("the generated editor options name the stored attribute, inverted for a negative boolean", () => {
  const declarations = {
    population: {...population, label: {_: "Population"}, group: "model"},
    showChart,
    speed: {...speed, disabled: widget => (widget.hasAttribute("locked") ? {_: "Locked"} : false)},
  }
  const {host, remove} = mount()
  try {
    host.attachShadow({mode: "open"})
    const core = new SettingsCore(host, {declarations})
    assert.deepEqual(core.editorOptions(), {
      population: {type: Number, min: 10, max: 2000, label: {_: "Population"}, group: "model", attribute: "population"},
      showChart: {type: Boolean, attribute: "no-show-chart", inverted: true},
      speed: {type: "number", steps: [0.5, 1, 2, 4], attribute: "speed"},
    })
    host.setAttribute("locked", "")
    assert.deepEqual(core.editorOptions().speed, {type: "number", steps: [0.5, 1, 2, 4], attribute: "speed", disabled: true, disabledReason: {_: "Locked"}})
    // The form for an editor that cannot write a negative attribute.
    const property = new SettingsCore(host, {declarations, negativeBooleans: "property"})
    assert.deepEqual(property.editorOptions().showChart, {type: Boolean, attribute: false})
    // The attribute is the state: reading and writing go through it.
    assert.equal(core.get("showChart"), true)
    assert.equal(core.set("showChart", false), true)
    assert.equal(host.hasAttribute("no-show-chart"), true)
    assert.equal(core.get("showChart"), false)
    assert.equal(core.set("population", "many"), false)
    assert.equal(core.set("population", 5000), true)
    assert.equal(host.getAttribute("population"), "2000")
    assert.equal(core.set("population", null), true)
    assert.equal(host.hasAttribute("population"), false)
  }
  finally { remove() }
})
