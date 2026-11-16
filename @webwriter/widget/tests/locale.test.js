import {test} from "node:test"
import assert from "node:assert/strict"
import {LOCALE_ALIASES, matchLocale} from "../locale.js"

const match = (tag, targets, prefer) => matchLocale(tag, "en", targets, prefer)

test("matchLocale takes the tag itself, in any case and with underscores", () => {
  assert.equal(match("de", ["de", "fr"]), "de")
  assert.equal(match("PT_br", ["pt-BR", "pt-PT"]), "pt-BR")
  assert.equal(match("en", ["de"]), "en")
})

test("matchLocale drops subtags from the end before it falls back to the bare language", () => {
  assert.equal(match("de-AT", ["de"]), "de")
  assert.equal(match("de-Latn-AT", ["de-Latn", "de"]), "de-Latn")
  assert.equal(match("zh-Hant-TW", ["zh-Hant", "zh-Hans"]), "zh-Hant")
})

test("matchLocale uses the likely script and region of a tag", () => {
  assert.equal(match("zh-HK", ["zh-Hans", "zh-Hant"]), "zh-Hant")
  assert.equal(match("zh", ["zh-Hans", "zh-Hant"]), "zh-Hans")
  assert.equal(match("de", ["de-DE", "de-AT"]), "de-DE")
  assert.equal(match("pt", ["pt-PT", "pt-BR"]), "pt-BR")
})

test("matchLocale lets the widget's preferences decide before the likely subtags", () => {
  assert.equal(match("pt", ["pt-PT", "pt-BR"], {pt: "pt-PT"}), "pt-PT")
  assert.equal(match("pt-AO", ["pt-PT", "pt-BR"], {pt: "pt-PT"}), "pt-PT")
  assert.equal(match("zh-HK", ["zh-Hans", "zh-Hant"], {"zh-HK": "zh-Hans"}), "zh-Hans")
})

test("matchLocale takes any locale of the language, then its alias, then the source", () => {
  assert.equal(match("fr", ["fr-CA"]), "fr-CA")
  assert.deepEqual(LOCALE_ALIASES, {no: "nb", nb: "no"})
  assert.equal(match("no", ["nb"]), "nb")
  assert.equal(match("nb-NO", ["no"]), "no")
  assert.equal(match("iw", ["he"]), "he")
  assert.equal(match("xx", ["de"]), "en")
  assert.equal(match("", ["de"]), "en")
  assert.equal(match("not a tag!", ["de"]), "en")
})

test("matchLocale gives Montenegrin its own catalog, and Serbian when there is none", () => {
  assert.equal(match("cnr", ["sr", "sr-Latn", "sr-ME"]), "sr-ME")
  assert.equal(match("cnr-ME", ["sr", "sr-Latn", "sr-ME"]), "sr-ME")
  assert.equal(match("cnr", ["sr", "sr-Latn"]), "sr-Latn")
  assert.equal(match("cnr", ["sr", "sr-ME"], {cnr: "sr"}), "sr")
})
