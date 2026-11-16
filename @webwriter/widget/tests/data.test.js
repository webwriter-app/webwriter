import {test} from "node:test"
import assert from "node:assert/strict"
import {settled} from "./dom.js"

const {JsonDataCore, fromDataURL, sameJson, toDataURL} = await import("../data.js")
const {withWidgetRuntime} = await import("../index.js")

test("JSON values are compared whatever the order of their keys", () => {
  assert.equal(sameJson({a: 1, b: [1, {c: 2}]}, {b: [1, {c: 2}], a: 1}), true)
  assert.equal(sameJson({a: 1}, {a: 1, b: undefined}), true)
  assert.equal(sameJson({a: undefined}, {}), true)
  assert.equal(sameJson({a: 1}, {a: 1, b: null}), false)
  assert.equal(sameJson([1, 2], [2, 1]), false)
  assert.equal(sameJson([1, 2], {0: 1, 1: 2}), false)
  assert.equal(sameJson(null, {}), false)
  assert.equal(sameJson("1", 1), false)
  assert.equal(sameJson(0, 0), true)
})

test("a small file goes into the JSON as a data URL and comes back", async () => {
  const text = fromDataURL("data:text/plain;base64,SGVsbG8=")
  assert.equal(text.type, "text/plain")
  assert.equal(await text.text(), "Hello")
  assert.equal(await fromDataURL("data:text/plain,a%20b").text(), "a b")
  assert.throws(() => fromDataURL("https://example.com/"), /Not a data URL/)
  const url = await toDataURL(new Blob(["Hello"], {type: "text/plain"}))
  assert.match(url, /^data:text\/plain;base64,/)
  assert.equal(await fromDataURL(url).text(), "Hello")
})

class DataWidget extends withWidgetRuntime(HTMLElement) {}
customElements.define("data-test-widget", DataWidget)

function widget(html = "") {
  const host = document.createElement("data-test-widget")
  host.innerHTML = html
  host.attachShadow({mode: "open"})
  document.body.append(host)
  return host
}

test("the helper reads the block through the widget runtime, over the defaults", async () => {
  const host = widget('<script type="application/json">{"count": 3, "kept": true}</script>')
  const core = new JsonDataCore(host, {defaults: {count: 0, label: "none"}, editing: () => false})
  try {
    core.connect()
    assert.deepEqual(core.get(), {count: 3, label: "none", kept: true})
    assert.equal(core.getSnapshot().unsaved, false)
    // A change from outside, such as undo or a collaborator.
    const changes = []
    core.subscribe(() => changes.push(core.get().count))
    host.querySelector("script").textContent = '{"kept": true, "count": 4}'
    await settled()
    assert.deepEqual(changes, [4])
    assert.equal(core.get().label, "none")
  }
  finally { core.disconnect(); host.remove() }
})

test("a change is visible at once and written once per task, with unknown keys kept", async () => {
  const host = widget('<script type="application/json">{"count": 3, "kept": true}</script>')
  const core = new JsonDataCore(host, {defaults: {count: 0, label: "none"}, editing: () => false})
  const transactions = []
  host.addEventListener("ww-transactionstart", () => transactions.push("start"))
  try {
    core.connect()
    core.set({count: 5})
    core.set({label: "five"})
    assert.deepEqual(core.get(), {count: 5, label: "five", kept: true})
    assert.equal(core.getSnapshot().unsaved, true)
    assert.equal(host.widgetRuntime.data, '{"count": 3, "kept": true}')
    await settled()
    assert.deepEqual(JSON.parse(host.widgetRuntime.data), {count: 5, kept: true, label: "five"})
    assert.equal(core.getSnapshot().unsaved, false)
    assert.deepEqual(transactions, ["start"])
    // Setting the same value again writes nothing.
    core.set({count: 5})
    await settled()
    assert.deepEqual(transactions, ["start"])
  }
  finally { core.disconnect(); host.remove() }
})

test("the first write creates the block of the declared kind", async () => {
  const participant = widget()
  const document_ = widget()
  const own = new JsonDataCore(participant, {defaults: {done: false}, editing: () => false})
  const shared = new JsonDataCore(document_, {defaults: {done: false}, block: "document", editing: () => false})
  try {
    own.connect()
    shared.connect()
    assert.equal(participant.widgetRuntime.data, null)
    own.set({done: true})
    shared.set({done: true})
    own.flush()
    shared.flush()
    assert.equal(participant.querySelector("script").getAttribute("slot"), "data")
    assert.equal(participant.querySelector("script").type, "application/json")
    assert.equal(document_.querySelector("script").hasAttribute("slot"), false)
    assert.deepEqual(JSON.parse(document_.widgetRuntime.data), {done: true})
  }
  finally { own.disconnect(); shared.disconnect(); participant.remove(); document_.remove() }
})

test("a block the widget cannot read is reported and not overwritten unless forced", async () => {
  const host = widget('<script type="application/json">[1, 2]</script>')
  const core = new JsonDataCore(host, {defaults: {count: 0}, editing: () => false})
  const errors = []
  host.addEventListener("ww-dataerror", event => errors.push(event.detail.text))
  try {
    core.connect()
    assert.deepEqual(errors, ["[1, 2]"])
    assert.equal(core.getSnapshot().invalid, true)
    assert.deepEqual(core.get(), {count: 0})
    core.set({count: 1})
    core.flush()
    assert.equal(host.widgetRuntime.data, "[1, 2]")
    assert.equal(core.get().count, 1)
    core.set({count: 2}, {force: true})
    assert.deepEqual(JSON.parse(host.widgetRuntime.data), {count: 2})
    assert.equal(core.getSnapshot().invalid, false)
  }
  finally { core.disconnect(); host.remove() }
})
