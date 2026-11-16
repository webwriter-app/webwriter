import {test} from "node:test"
import assert from "node:assert/strict"
import "./dom.js"

const {ariaShortcut, formatShortcut, isReservedShortcut, matchesShortcut} = await import("../shortcuts.js")
const {loadMessages} = await import("../messages.js")
const {shortcutsMessages} = await import("../shortcuts.js")

/** A keydown. happy-dom reports AltGraph whenever Alt is down; a browser reports it for the AltGr key only. */
function key(name, {altGraph = false, ...init} = {}) {
  const event = new KeyboardEvent("keydown", {key: name, ...init})
  event.getModifierState = modifier => (modifier === "AltGraph" ? altGraph : !!init[`${modifier.toLowerCase()}Key`])
  return event
}

test("modifiers must match exactly and letters ignore case", () => {
  assert.equal(matchesShortcut("Mod+D", key("d", {ctrlKey: true}), false), true)
  assert.equal(matchesShortcut("Mod+D", key("D", {ctrlKey: true}), false), true)
  assert.equal(matchesShortcut("Mod+D", key("d", {metaKey: true}), false), false)
  assert.equal(matchesShortcut("Mod+D", key("d", {metaKey: true}), true), true)
  assert.equal(matchesShortcut("Mod+D", key("d", {ctrlKey: true}), true), false)
  assert.equal(matchesShortcut("Mod+D", key("d", {ctrlKey: true, shiftKey: true}), false), false)
  assert.equal(matchesShortcut("Mod+Shift+D", key("D", {ctrlKey: true, shiftKey: true}), false), true)
  assert.equal(matchesShortcut("D", key("d"), false), true)
  assert.equal(matchesShortcut("D", key("d", {altKey: true}), false), false)
})

test("named keys, the space bar and symbols are matched by what the key produces", () => {
  assert.equal(matchesShortcut("Delete", key("Delete"), false), true)
  assert.equal(matchesShortcut("Delete", key("Delete", {shiftKey: true}), false), false)
  assert.equal(matchesShortcut("Space", key(" "), false), true)
  assert.equal(matchesShortcut("ArrowRight", key("ArrowRight"), false), true)
  // Shift is part of typing a symbol, so it is not compared for one.
  assert.equal(matchesShortcut("?", key("?", {shiftKey: true}), false), true)
  assert.equal(matchesShortcut("Mod+Plus", key("+", {ctrlKey: true}), false), true)
  assert.equal(matchesShortcut("Mod++", key("+", {ctrlKey: true, shiftKey: true}), false), true)
})

test("a letter also matches its position on another script's layout and with Alt on a Mac", () => {
  // Cyrillic layout: the key at the position of D produces "в".
  assert.equal(matchesShortcut("Mod+D", key("в", {ctrlKey: true, code: "KeyD"}), false), true)
  assert.equal(matchesShortcut("Mod+D", key("в", {ctrlKey: true, code: "KeyF"}), false), false)
  // A Latin layout that puts another letter there does not match by position.
  assert.equal(matchesShortcut("Mod+Z", key("y", {ctrlKey: true, code: "KeyZ"}), false), false)
  // Alt+D on a Mac produces "∂".
  assert.equal(matchesShortcut("Alt+D", key("∂", {altKey: true, code: "KeyD"}), true), true)
  assert.equal(matchesShortcut("Alt+1", key("¡", {altKey: true, code: "Digit1"}), true), true)
  // AltGr types text and never runs a shortcut.
  assert.equal(matchesShortcut("Alt+D", key("ð", {altKey: true, altGraph: true, code: "KeyD"}), false), false)
})

test("undo, redo and save stay with the editor", () => {
  for(const shortcut of ["Mod+Z", "Ctrl+z", "Meta+Shift+Z", "Mod+Y", "Mod+S"]) assert.equal(isReservedShortcut(shortcut), true, shortcut)
  for(const shortcut of ["Z", "Mod+Alt+Z", "Mod+D", "Shift+S"]) assert.equal(isReservedShortcut(shortcut), false, shortcut)
})

test("a shortcut is shown as a person reads it on the platform, with translated key names", async () => {
  assert.equal(formatShortcut("Mod+Shift+D", {apple: true}), "⇧⌘D")
  assert.equal(formatShortcut("Mod+Shift+D", {apple: false}), "Ctrl+Shift+D")
  assert.equal(formatShortcut("Alt+ArrowLeft", {apple: false}), "Alt+←")
  assert.equal(formatShortcut("Delete", {apple: true}), "⌦")
  assert.equal(formatShortcut("Delete", {apple: false}), "Delete")
  assert.equal(formatShortcut("Space", {apple: false}), "Space")
  const names = await loadMessages(shortcutsMessages, "de")
  assert.equal(formatShortcut("Mod+Shift+Delete", {apple: false, names}), "Strg+Umschalt+Entf")
  assert.equal(formatShortcut("Space", {apple: false, names}), "Leertaste")
  assert.equal(ariaShortcut("Mod+D", false), "Control+D")
  assert.equal(ariaShortcut("Mod+D", true), "Meta+D")
  assert.equal(ariaShortcut("Shift+Space", false), "Shift+Space")
  assert.equal(ariaShortcut("Mod+Plus", false), "Control+Plus")
})
