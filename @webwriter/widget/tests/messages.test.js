import {test} from "node:test"
import assert from "node:assert/strict"
import {mount, settled} from "./dom.js"

const {defineMessages, languageOf, loadMessages, messageLocale, Messages, resolveMessages, SOURCE_LOCALE} = await import("../messages.js")
const {withWidgetRuntime} = await import("../index.js")
const {dragMessages} = await import("../drag.js")

const defaults = {hello: "Hello", count: n => `${n} items`}

/** A table whose catalogs are loaded by hand: `arrive("de")` delivers one, `fail("de")` rejects it. */
function lazy(catalogs = {de: {hello: "Hallo", count: n => `${n} Elemente`}, fr: {hello: "Bonjour"}}) {
  const calls = []
  const waiting = {}
  const loaders = Object.fromEntries(Object.keys(catalogs).map(locale => [locale, () => {
    calls.push(locale)
    return new Promise((resolve, reject) => (waiting[locale] = {resolve, reject}))
  }]))
  return {
    source: defineMessages(defaults, loaders),
    calls,
    arrive: async locale => { waiting[locale].resolve({default: catalogs[locale]}); await settled() },
    fail: async locale => { waiting[locale].reject(new Error("offline")); await settled() },
  }
}

test("a table resolves the override, then the catalog, then the English defaults", () => {
  const source = defineMessages(defaults, {de: {hello: "Hallo"}})
  assert.equal(SOURCE_LOCALE, "en")
  assert.deepEqual(source.locales, ["de"])
  assert.equal(messageLocale(source, "de-AT"), "de")
  assert.equal(messageLocale(source, "fr"), "en")
  assert.equal(resolveMessages(source, "de").hello, "Hallo")
  assert.equal(resolveMessages(source, "de").count(2), "2 items")
  assert.equal(resolveMessages(source, "fr").hello, "Hello")
  assert.equal(resolveMessages(source, "de", {hello: "Servus"}).hello, "Servus")
  assert.equal(resolveMessages(source, "de", () => ({hello: "Moin"})).hello, "Moin")
})

test("a catalog is loaded on demand, once for every user of the table", async () => {
  const {source, calls, arrive} = lazy()
  assert.deepEqual(source.locales, ["de", "fr"])
  assert.deepEqual(source.catalogs, {})
  assert.equal(resolveMessages(source, "de").hello, "Hello")
  const first = source.load("de")
  const second = source.load("de")
  assert.deepEqual(calls, ["de"])
  await arrive("de")
  assert.equal((await first).hello, "Hallo")
  assert.equal(await first, await second)
  assert.equal(resolveMessages(source, "de-CH").count(3), "3 Elemente")
  await source.load("de")
  assert.deepEqual(calls, ["de"])
  assert.equal(await source.load("it"), undefined)
})

test("loadMessages waits for the catalog of a language", async () => {
  const source = defineMessages(defaults, {de: async () => ({default: {hello: "Hallo"}})})
  assert.equal((await loadMessages(source, "de-DE")).hello, "Hallo")
  assert.equal((await loadMessages(source, "ja")).hello, "Hello")
})

test("a failed load is not kept, and a loader that throws rejects", async () => {
  let attempts = 0
  const source = defineMessages(defaults, {de: () => {
    if(++attempts === 1) throw new Error("no network")
    return Promise.resolve({default: {hello: "Hallo"}})
  }})
  await assert.rejects(source.load("de"), /no network/)
  assert.equal((await source.load("de")).hello, "Hallo")
  assert.equal(attempts, 2)
})

test("an instance shows English until the catalog of its language has arrived", async () => {
  const {source, calls, arrive} = lazy()
  const {host, remove} = mount('<section lang="de-AT">')
  try {
    const messages = new Messages(host, source)
    let changes = 0
    const stop = messages.follow(() => changes++)
    assert.equal(messages.language, "de-AT")
    assert.equal(messages.locale, "de")
    assert.equal(messages.loaded, false)
    assert.equal(messages.current.hello, "Hello")
    assert.deepEqual(calls, ["de"])
    await arrive("de")
    assert.equal(changes, 1)
    assert.equal(messages.loaded, true)
    assert.equal(messages.current.hello, "Hallo")
    assert.equal(messages.current, messages.current)
    stop()
  }
  finally { remove() }
})

test("a catalog that arrives for a language that is no longer current changes nothing", async () => {
  const {source, calls, arrive} = lazy()
  const {outer, host, remove} = mount('<section lang="de">')
  try {
    const messages = new Messages(host, source)
    let changes = 0
    const stop = messages.follow(() => changes++)
    outer.lang = "fr"
    await settled()
    assert.deepEqual(calls, ["de", "fr"])
    assert.equal(messages.locale, "fr")
    // Another catalog answers now, although the texts are still English while it is on its way.
    assert.equal(changes, 1)
    await arrive("de")
    assert.equal(changes, 1)
    assert.equal(messages.current.hello, "Hello")
    await arrive("fr")
    assert.equal(changes, 2)
    assert.equal(messages.current.hello, "Bonjour")
    assert.equal(messages.current.count(1), "1 items")
    // Back to German: its catalog is there, so the texts change at once and nothing is loaded again.
    outer.lang = "de"
    await settled()
    assert.equal(changes, 3)
    assert.equal(messages.current.hello, "Hallo")
    assert.deepEqual(calls, ["de", "fr"])
    outer.lang = "en"
    await settled()
    assert.equal(changes, 4)
    assert.equal(messages.current.hello, "Hello")
    stop()
    outer.lang = "de"
    await settled()
    assert.equal(changes, 4)
  }
  finally { remove() }
})

test("the override wins in every language and a function is asked on every read", async () => {
  const {source, arrive} = lazy()
  const {host, remove} = mount('<section lang="de">')
  try {
    let own = "Eins"
    const messages = new Messages(host, source, () => ({hello: own}))
    assert.equal(messages.current.hello, "Eins")
    await arrive("de")
    own = "Zwei"
    assert.equal(messages.current.hello, "Zwei")
    assert.equal(messages.current.count(2), "2 Elemente")
    assert.equal(new Messages(host, source, {hello: "Fest"}).current.hello, "Fest")
  }
  finally { remove() }
})

test("a failed load is reported on the host and tried again when the page is back online", async () => {
  const {source, calls, fail, arrive} = lazy()
  const {host, remove} = mount('<section lang="de">')
  try {
    const errors = []
    host.addEventListener("localizationerror", event => errors.push(event.detail))
    const messages = new Messages(host, source)
    let changes = 0
    const stop = messages.follow(() => changes++)
    await fail("de")
    assert.equal(errors.length, 1)
    assert.equal(errors[0].locale, "de")
    assert.match(String(errors[0].error), /offline/)
    // Reading the texts does not ask again by itself.
    assert.equal(messages.current.hello, "Hello")
    assert.deepEqual(calls, ["de"])
    window.dispatchEvent(new Event("online"))
    assert.deepEqual(calls, ["de", "de"])
    await arrive("de")
    assert.equal(changes, 1)
    assert.equal(messages.current.hello, "Hallo")
    stop()
  }
  finally { remove() }
})

test("the language is that of the widget runtime, and of the tree around a shadow root", async () => {
  class Widget extends withWidgetRuntime(HTMLElement) {}
  customElements.define("messages-test-widget", Widget)
  const {outer, host, remove} = mount('<section lang="de">', "messages-test-widget")
  try {
    assert.equal(host.widgetRuntime.lang, "de")
    assert.equal(languageOf(host), "de")
    // A component in the widget's shadow tree has the widget's language.
    const inner = document.createElement("span")
    host.attachShadow({mode: "open"}).append(inner)
    assert.equal(languageOf(inner), "de")
    const source = defineMessages(defaults, {de: {hello: "Hallo"}, fr: {hello: "Bonjour"}})
    const messages = new Messages(inner, source)
    let changes = 0
    const stop = messages.follow(() => changes++)
    assert.equal(messages.current.hello, "Hallo")
    outer.lang = "fr"
    await settled()
    assert.equal(changes, 1)
    assert.equal(messages.current.hello, "Bonjour")
    // A `lang` inside the shadow tree is nearer, and an empty one ends the search.
    const part = document.createElement("div")
    part.lang = "de"
    part.append(inner)
    host.shadowRoot.append(part)
    await settled()
    assert.equal(messages.current.hello, "Hallo")
    part.setAttribute("lang", "")
    await settled()
    assert.equal(languageOf(inner), "")
    assert.equal(messages.current.hello, "Hello")
    stop()
  }
  finally { remove() }
})

test("a widget inside the shadow tree of another element has the language around that element", () => {
  const {host, remove} = mount('<section lang="de">')
  try {
    const nested = document.createElement("messages-test-widget")
    host.attachShadow({mode: "open"}).append(nested)
    // The runtime's own lookup goes on from the shadow root's host, as HTML's does.
    assert.equal(nested.widgetRuntime.lang, "de")
    assert.equal(languageOf(nested), "de")
    nested.setAttribute("lang", "")
    assert.equal(languageOf(nested), "")
  }
  finally { remove() }
})

test("the shipped catalogs load through the same mechanism", async () => {
  assert.ok(dragMessages.locales.includes("de"))
  assert.equal(resolveMessages(dragMessages, "en").dropped("A", "B"), "Dropped A on B.")
  const german = await loadMessages(dragMessages, "de-DE")
  assert.equal(german.dropped("A", "B"), "A abgelegt: B.")
  assert.equal(german.cancelled(), "Abgebrochen.")
})
