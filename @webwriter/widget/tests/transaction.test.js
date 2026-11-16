import {test} from "node:test"
import assert from "node:assert/strict"
import {mount, settled} from "./dom.js"

const {transaction, transactionOpen} = await import("../transaction.js")

/** The transaction events that reach the document, as `type` or `type:host` for the one a former ancestor sends. */
function record() {
  const seen = []
  const listener = event => seen.push(event.detail?.host ? `${event.type}:${event.detail.host.localName}` : event.type)
  for(const type of ["ww-transactionstart", "ww-transactionend"]) document.addEventListener(type, listener)
  return {seen, stop: () => ["ww-transactionstart", "ww-transactionend"].forEach(type => document.removeEventListener(type, listener))}
}

test("a change is wrapped in one bubbling, composed pair of events", () => {
  const {host, remove} = mount()
  const {seen, stop} = record()
  try {
    const events = []
    host.addEventListener("ww-transactionstart", event => events.push(event))
    const result = transaction(host, () => {
      assert.equal(transactionOpen(host), true)
      seen.push("change")
      return 42
    })
    assert.equal(result, 42)
    assert.equal(transactionOpen(host), false)
    assert.deepEqual(seen, ["ww-transactionstart", "change", "ww-transactionend"])
    assert.equal(events[0].bubbles && events[0].composed, true)
  }
  finally { stop(); remove() }
})

test("nested calls for one host send only the outermost pair, and a throw still ends it", () => {
  const {host, remove} = mount()
  const {seen, stop} = record()
  try {
    transaction(host, () => transaction(host, () => seen.push("inner")))
    assert.deepEqual(seen, ["ww-transactionstart", "inner", "ww-transactionend"])
    seen.length = 0
    assert.throws(() => transaction(host, () => { throw new Error("failed") }), /failed/)
    assert.deepEqual(seen, ["ww-transactionstart", "ww-transactionend"])
    assert.equal(transactionOpen(host), false)
  }
  finally { stop(); remove() }
})

test("a promise keeps the transaction open until it settles", async () => {
  const {host, remove} = mount()
  const {seen, stop} = record()
  try {
    let finish
    const done = transaction(host, () => new Promise(resolve => (finish = resolve)))
    assert.deepEqual(seen, ["ww-transactionstart"])
    assert.equal(transactionOpen(host), true)
    finish("value")
    assert.equal(await done, "value")
    assert.deepEqual(seen, ["ww-transactionstart", "ww-transactionend"])
    assert.equal(transactionOpen(host), false)
    await assert.rejects(transaction(host, () => Promise.reject(new Error("later"))), /later/)
    assert.equal(transactionOpen(host), false)
  }
  finally { stop(); remove() }
})

test("a host that leaves the document ends its transaction, and its former place says so", async () => {
  const {host, outer, remove} = mount("<section>")
  const {seen, stop} = record()
  try {
    let finish
    const done = transaction(host, () => new Promise(resolve => (finish = resolve)))
    const own = []
    host.addEventListener("ww-transactionend", () => own.push("end"))
    host.remove()
    await settled()
    assert.equal(transactionOpen(host), false)
    assert.deepEqual(own, ["end"])
    // The host's own event no longer reaches the document, so the second one carries the host.
    assert.deepEqual(seen, ["ww-transactionstart", "ww-transactionend:div"])
    finish()
    await done
    assert.deepEqual(seen, ["ww-transactionstart", "ww-transactionend:div"])
    assert.equal(outer.isConnected, true)
  }
  finally { stop(); remove() }
})
