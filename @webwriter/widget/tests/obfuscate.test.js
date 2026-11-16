import {test} from "node:test"
import assert from "node:assert/strict"
import {isObfuscated, obfuscate, obfuscated, reveal} from "../obfuscate.js"

test("a value comes back from its obfuscated text, which does not show it", () => {
  const solution = {order: ["b", "a", "c"], note: "Überraschung ✓", count: 3}
  const text = obfuscate(solution)
  assert.deepEqual(reveal(text), solution)
  assert.equal(isObfuscated(text), true)
  assert.match(text, /^[A-Za-z0-9+/]+=*$/)
  assert.equal(text.includes("order"), false)
  assert.equal(atob(text).includes("order"), false)
  // The key is random, so the same value is written differently each time.
  assert.notEqual(obfuscate(solution), obfuscate(solution))
  for(const value of [0, "", false, null, [1, 2], "text"]) assert.deepEqual(reveal(obfuscate(value)), value)
})

test("plain JSON is accepted, and anything else gives undefined", () => {
  assert.deepEqual(reveal('["a","b"]'), ["a", "b"])
  assert.equal(isObfuscated('["a","b"]'), false)
  assert.equal(reveal("not json"), undefined)
  assert.equal(reveal(""), undefined)
  assert.equal(reveal(null), undefined)
  assert.equal(isObfuscated(null), false)
})

test("the attribute converter writes obfuscated text and no attribute for no value", () => {
  assert.equal(obfuscated.toAttribute(undefined), null)
  assert.equal(obfuscated.toAttribute(null), null)
  const text = obfuscated.toAttribute(["x"])
  assert.equal(isObfuscated(text), true)
  assert.deepEqual(obfuscated.fromAttribute(text), ["x"])
  assert.equal(obfuscated.fromAttribute(null), undefined)
})
