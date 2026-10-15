// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import type {PackageMember, WebWriterPackage} from "./packages"
import {galleryDocument, galleryExample, galleryPreviewPackages, galleryPackages} from "./widget-gallery"

const member = (tagName: string, label = tagName, insertable = true): PackageMember => ({
  id: `pkg@1.0.0:./widgets/${tagName}`,
  packageName: "pkg",
  packageVersion: "1.0.0",
  exportName: `./widgets/${tagName}`,
  kind: "widget",
  label,
  insertable,
  tagName,
})

const pkg = (name: string, label: string, members: PackageMember[], keywords: string[] = []): WebWriterPackage => ({
  name,
  version: "1.0.0",
  label,
  authors: [],
  keywords,
  links: {},
  members,
  scripts: [],
  styles: [],
})

describe("widget gallery helpers", () => {
  it("lists one card per WebWriter package and searches its widgets and snippets", () => {
    const official = pkg("@webwriter/official", "Official", [
      member("z-widget", "Zebra", false),
      {...member("a-widget", "Alpha snippet"), kind: "snippet", tagName: undefined},
      member("m-widget", "Middle"),
    ], ["science"])
    const community = pkg("@webwriter/community", "Community", [member("lesson-widget", "Alpha")], ["learning"])
    const other = pkg("@school/other", "Other", [member("other-widget")])
    expect(galleryPackages([official, community, other])).toEqual([community, official])
    expect(galleryPackages([official, community], "science zebra")).toEqual([official])
    expect(galleryPackages([official, community], "science alpha snippet")).toEqual([official])
  })

  it("keeps the nearest outer same-package activity and unfamiliar valid descendants", () => {
    const activity = pkg("@webwriter/activity", "Activity", [member("ww-activity"), member("ww-question")])
    const html = "<ww-activity><section><x-unfamiliar data-kept='yes'><ww-question><p>Question</p></ww-question></x-unfamiliar></section></ww-activity>"

    expect(galleryExample(html, {pkg: activity, member: activity.members[1]})).toBe(
      "<ww-activity><section><x-unfamiliar data-kept=\"yes\"><ww-question><p>Question</p></ww-question></x-unfamiliar></section></ww-activity>",
    )
    expect(galleryExample("<p>nothing here</p>", {pkg: activity, member: activity.members[1]})).toBeNull()
  })

  it("builds an inert learner document with editable attributes and active content removed", () => {
    const customTag = `ww-gallery-probe-${crypto.randomUUID().slice(0, 8)}`
    const html = `<${customTag} contenteditable="true" onclick="run()"><script>run()</script><script type="application/json" slot="data">{"answer":42}</script><p contenteditable="plaintext-only">Hello</p></${customTag}>`

    const result = galleryDocument(html, "Learner activity")
    const widget = result.body.firstElementChild!

    expect(result.title).toBe("Learner activity")
    expect(result.designMode).toBe("off")
    expect(result.body.contentEditable).toBe("false")
    expect(widget.hasAttribute("contenteditable")).toBe(false)
    expect(widget.hasAttribute("onclick")).toBe(false)
    expect(widget.querySelector("p")?.hasAttribute("contenteditable")).toBe(false)
    expect(widget.querySelector("script:not([type='application/json'])")).toBeNull()
    expect(widget.querySelector("script[type='application/json'][slot='data']")?.textContent).toBe('{"answer":42}')
    class GalleryProbe extends HTMLElement {}
    customElements.define(customTag, GalleryProbe)
    expect(widget).not.toBeInstanceOf(GalleryProbe)
  })

  it("selects packages used by widgets nested anywhere in the example", () => {
    const outer = pkg("@school/outer", "Outer", [member("school-activity")])
    const nested = pkg("@other/nested", "Nested", [member("other-control")])
    const unused = pkg("@unused/package", "Unused", [member("unused-widget")])
    const source = new DOMParser().parseFromString(
      "<school-activity><section><other-control></other-control></section></school-activity>", "text/html",
    )

    expect(galleryPreviewPackages(source, [outer, nested, unused])).toEqual([outer, nested])
  })
})

it("lists snippet-only simulation collections and preserves their learner embeds", () => {
  const first = {...member("unused", "Energy"), kind: "snippet" as const, tagName: undefined, htmlUrl: "https://cdn.example/energy.html"}
  const collection = pkg("@webwriter/phet", "PhET simulations", [first, {...first, id: "motion", label: "Motion"}])
  expect(galleryPackages([collection], "motion")).toEqual([collection])
  const example = galleryExample('<iframe src="https://phet.colorado.edu/simulation" title="Energy"></iframe>', {pkg: collection, member: first})!
  expect(example).toContain('sandbox="allow-scripts"')
  expect(galleryPreviewPackages(galleryDocument(example, "Energy"), [collection])).toEqual([])
})

it("uses the selected publisher when another package declares the same widget tag", () => {
  const original = pkg("@webwriter/original", "Original", [member("shared-widget")])
  const selected = pkg("@webwriter/replacement", "Selected", [member("shared-widget")])
  const source = galleryDocument("<shared-widget></shared-widget>", "Demo")
  expect(galleryPreviewPackages(source, [original, selected], selected)).toEqual([selected])
})

it("leaves unused widget scripts out of the learner preview dependency graph", () => {
  const first = {...member("first-widget"), scriptUrl: "https://cdn.example/first.js"}
  const unused = {...member("unused-widget"), scriptUrl: "https://cdn.example/broken-unused.js"}
  const owner = {...pkg("@webwriter/collection", "Collection", [first, unused]), scripts: [first.scriptUrl, unused.scriptUrl]}
  const [preview] = galleryPreviewPackages(galleryDocument("<first-widget></first-widget>", "Demo"), [owner])
  expect(preview.scripts).toEqual([first.scriptUrl])
  expect(owner.scripts).toEqual([first.scriptUrl, unused.scriptUrl])
})
