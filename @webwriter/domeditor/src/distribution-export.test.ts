// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import {appendSerializedAssets} from "./serialization"
import type {WebWriterPackage} from "./packages"
import {writeDistributionConfig} from "./distribution-dom"
import {emptyDistributionConfig} from "./distribution.js"

const setup = (permissions: ("edit" | "move" | "delete" | "duplicate" | "style" | "insert")[], add: string[] = [], items: {id: string; label: string; html: string}[] = [], body = "") => {
  const root = new DOMParser().parseFromString(`<html><head></head><body>${body}</body></html>`, "text/html")
  const target = root.createElement("div")
  target.id = "distribution-target"
  root.body.append(target)
  writeDistributionConfig(target, {...emptyDistributionConfig(target.id), permissions, add, items})
  return root
}

const pkg = (members: {tagName: string; scriptUrl: string; styleUrl: string}[]) => ({
  scripts: members.map(member => member.scriptUrl),
  styles: members.map(member => member.styleUrl),
  members: members.map(member => ({kind: "widget", ...member})),
}) as unknown as WebWriterPackage

describe("distribution export", () => {
  it("omits the reader when permissions are empty, even with dormant templates", () => {
    const item = {id: "element:x-unused", label: "Unused", html: "<x-unused></x-unused>"}
    const root = setup([], [item.id], [item])
    appendSerializedAssets(root, [pkg([{tagName: "x-unused", scriptUrl: "/unused.js", styleUrl: "/unused.css"}])])
    expect(root.querySelector("#webwriter-distribution-reader")).toBeNull()
    expect(root.querySelector('[src="/unused.js"], [href="/unused.css"]')).toBeNull()
  })

  it("emits the optional insert action once when insert permission is present", () => {
    const root = setup(["insert"])
    appendSerializedAssets(root, [])
    const runtime = root.querySelector<HTMLScriptElement>("#webwriter-distribution-reader")!
    expect(root.querySelectorAll("#webwriter-distribution-reader")).toHaveLength(1)
    expect(runtime.textContent?.match(/Reader palette/g)).toHaveLength(1)
  })

  it("includes resources for inserted and authored widgets, but omits unused template widget resources", () => {
    const chosen = {id: "element:x-chosen", label: "Chosen", html: "<x-chosen></x-chosen>"}
    const unused = {id: "element:x-unused", label: "Unused", html: "<x-unused></x-unused>"}
    const resources = pkg([
      {tagName: "x-chosen", scriptUrl: "/chosen.js", styleUrl: "/chosen.css"},
      {tagName: "x-unused", scriptUrl: "/unused.js", styleUrl: "/unused.css"},
      {tagName: "x-authored", scriptUrl: "/authored.js", styleUrl: "/authored.css"},
    ])
    const root = setup(["insert"], [chosen.id], [chosen], "<x-authored></x-authored>")
    const dormant = root.createElement("div")
    dormant.id = "dormant-target"
    root.body.append(dormant)
    writeDistributionConfig(dormant, {...emptyDistributionConfig(dormant.id), add: [unused.id], items: [unused]})
    appendSerializedAssets(root, [resources])
    expect(root.querySelector('script[src="/chosen.js"]')).not.toBeNull()
    expect(root.querySelector('link[href="/chosen.css"]')).not.toBeNull()
    expect(root.querySelector('script[src="/authored.js"]')).not.toBeNull()
    expect(root.querySelector('link[href="/authored.css"]')).not.toBeNull()
    expect(root.querySelector('script[src="/unused.js"]')).toBeNull()
    expect(root.querySelector('link[href="/unused.css"]')).toBeNull()
  })

  it("keeps authored widget resources when insertion is disabled", () => {
    const dormant = {id: "element:x-unused", label: "Unused", html: "<x-unused></x-unused>"}
    const root = setup([], [dormant.id], [dormant], "<x-authored></x-authored>")
    appendSerializedAssets(root, [pkg([
      {tagName: "x-unused", scriptUrl: "/unused.js", styleUrl: "/unused.css"},
      {tagName: "x-authored", scriptUrl: "/authored.js", styleUrl: "/authored.css"},
    ])])
    expect(root.querySelector("#webwriter-distribution-reader")).toBeNull()
    expect(root.querySelector('script[src="/authored.js"]')).not.toBeNull()
    expect(root.querySelector('link[href="/authored.css"]')).not.toBeNull()
    expect(root.querySelector('script[src="/unused.js"]')).toBeNull()
    expect(root.querySelector('link[href="/unused.css"]')).toBeNull()
  })
  it("bundles widget editing declarations for authored and insertable widgets with the shared engine", () => {
    const root = setup(["edit"], [], [], '<x-authored></x-authored>')
    const resources = pkg([{tagName: "x-authored", scriptUrl: "/authored.js", styleUrl: "/authored.css"}])
    resources.members[0].editingConfig = {content: "p*", inline: false}
    appendSerializedAssets(root, [resources])
    const script = root.querySelector("#webwriter-distribution-reader")!.textContent!
    expect(script).toContain('"widgets":[{"tagName":"x-authored","editingConfig":{"content":"p*","inline":false}}]')
  })

  it("uses one shared canvas viewer when reader editing is enabled", () => {
    const root = setup(["move", "delete"])
    root.body.className = "ww-canvas"
    appendSerializedAssets(root, [])
    expect(root.querySelector("#webwriter-distribution-reader")).not.toBeNull()
    expect(root.querySelector("#webwriter-layout-print")).not.toBeNull()
    expect(root.querySelector("#webwriter-canvas-viewer")).toBeNull()
  })

})
