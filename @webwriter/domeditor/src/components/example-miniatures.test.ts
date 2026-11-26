// @vitest-environment happy-dom
import {afterEach, expect, it} from "vitest"
import {html, render} from "lit"
import {Excerpt, exampleMiniature, hasMiniature} from "./example-miniatures"
import {exampleDocuments, loadExampleDocument} from "../example-documents"
import {setLanguage} from "../site-language"

afterEach(() => { setLanguage("en", false); document.body.replaceChildren() })

const compact = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, "")
const parse = (markup: string) => new DOMParser().parseFromString(markup, "text/html")

it.each(exampleDocuments.flatMap(example => ["en", "de"].map(language => ({...example, language}))))("draws $id in $language from the lesson's own words", async ({id, language}) => {
  setLanguage(language as "en" | "de", false)
  const source = await loadExampleDocument(id)
  expect(source.documentElement.lang).toMatch(new RegExp(`^${language}`))
  const miniature = exampleMiniature(id, source)!
  expect(miniature.missing).toEqual([])
  const container = document.createElement("div")
  document.body.append(container)
  render(html`<div class="hero">${miniature.hero}</div><div class="mini">${miniature.mini}</div>`, container)
  const textual = [".label", ".heading", ".step", "h4", "h5", "p", "figcaption", "time", ".order span", ".summary", "small", "th", "td", ".node", ".disclosure", ".box", ".card > b"]
  const words = [...container.querySelectorAll(textual.map(selector => `.mini ${selector}`).join(", "))].map(element => compact(element.textContent)).filter(Boolean)
  expect(words.length).toBeGreaterThan(4)
  const lesson = compact(source.documentElement.textContent)
  for(const text of words) expect(lesson).toContain(text)
  const pictures = [...container.querySelectorAll("img")].map(image => image.getAttribute("src"))
  expect(pictures.every(Boolean)).toBe(true)
  const sources = new Set([...source.querySelectorAll("img")].map(image => image.getAttribute("src")))
  expect(pictures.every(picture => sources.has(picture) || picture!.startsWith("data:image/") && source.documentElement.textContent!.includes(picture!))).toBe(true)
})

it("has a miniature for every example and none for unknown ids", () => {
  expect(exampleDocuments.every(example => hasMiniature(example.id))).toBe(true)
  expect(exampleMiniature("unknown", parse("<p>x</p>"))).toBeUndefined()
})

it("shows the lesson's notation names and decimal style in its own language", async () => {
  setLanguage("de", false)
  const german = exampleMiniature("intervals-and-rhythms", await loadExampleDocument("intervals-and-rhythms"))!
  const lab = exampleMiniature("heartburn", await loadExampleDocument("heartburn"))!
  const container = document.createElement("div")
  render(html`${german.hero}${german.mini}${lab.hero}`, container)
  expect([...container.querySelectorAll(".staff .name")].map(name => name.textContent)).toContain("ü4")
  expect([...container.querySelectorAll(".score small")].map(title => title.textContent)).toEqual(["Stufe 1", "Stufe 2", "Stufe 3", "Stufe 4"])
  expect(container.querySelector(".lab-hero")?.textContent).toContain("0,1 M HCl")
})

it("keeps inline formatting, line breaks, and formulas but drops layout styles and scripts", () => {
  const source = parse(`<p style="padding: 9px"><br><b style="font-size: 30px">Bold</b> <span style="color: red; font-size: 40px; position: fixed">red</span><br>next
    <script>alert(1)</script><math style="color: red" onclick="alert(1)"><mi>T</mi></math><br></p>`)
  const container = document.createElement("p")
  render(html`${new Excerpt(source).rich("p", 0, ["color"])}`, container)
  expect(container.querySelector("b")?.getAttribute("style")).toBeNull()
  expect(container.querySelector("span")?.getAttribute("style")).toBe("color: red;")
  expect(container.querySelectorAll("br")).toHaveLength(1)
  expect(container.textContent).not.toContain("alert")
  const math = container.querySelector("math")!
  expect(math.hasAttribute("style") || math.hasAttribute("onclick")).toBe(false)
  expect(math.textContent).toBe("T")
  const formula = document.createElement("span")
  render(html`${new Excerpt(source).rich("math")}`, formula)
  expect(formula.firstElementChild?.localName).toBe("math")
  expect(formula.querySelector("mi")?.textContent).toBe("T")
})

it("keeps words apart at line breaks and records selectors that no longer match", () => {
  const excerpt = new Excerpt(parse("<p>One.<br>Two<span>three</span></p>"))
  expect(excerpt.text("p")).toBe("One. Twothree")
  expect(excerpt.text("h2")).toBe("")
  expect(excerpt.scope("section").text("p")).toBe("")
  expect(excerpt.missing).toEqual(["h2 [0]", "section [0]", "p [0]"])
})
