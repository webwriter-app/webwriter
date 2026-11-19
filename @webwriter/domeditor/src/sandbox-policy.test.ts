// @vitest-environment happy-dom
import {createHash} from "node:crypto"
import {describe, expect, it} from "vitest"
import {sandboxBootstrapSource, sandboxScriptHash} from "../../widget/sandbox.js"
import {clearEditorArtifacts, isEditorOnlyNode, registerFrameArtifacts} from "./editor-artifacts"
import {editorFrameHTML, previewFrameHTML, type EditorFrameOptions, type PreviewFrameOptions} from "./frame-document"
import type {WebWriterPackage} from "./packages"

const hostOrigin = "https://app.example"
const frameOrigin = "https://editor.example"
const bridgeNonce = "sandbox-policy-bridge-nonce"
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html")
const policySelector = 'meta[http-equiv="Content-Security-Policy"]'
const editorOptions = (packages: WebWriterPackage[] = []): EditorFrameOptions => ({
  bridgeNonce, hostOrigin, packages, revision: 1, language: "en", executeScripts: true,
  entryURL: `${frameOrigin}/assets/editor-entry.js`,
})
const previewOptions = (changes: Partial<PreviewFrameOptions> = {}): PreviewFrameOptions => ({
  bridgeNonce, hostOrigin, frameOrigin, packages: [], importMap: null, executeScripts: true,
  entryURL: `${frameOrigin}/assets/preview-entry.js`, ...changes,
})
const scriptSources = (root: Document) => root.querySelector<HTMLMetaElement>(policySelector)!.content
  .split(";").map(directive => directive.trim()).find(directive => directive.startsWith("script-src "))!
  .split(/\s+/).slice(1)

describe("shared sandbox bootstrap authorization", () => {
  it("pins the SHA-256 digest of the exact bootstrap bytes shipped to widgets", () => {
    const digest = createHash("sha256").update(sandboxBootstrapSource, "utf8").digest("base64")
    expect(sandboxScriptHash).toBe(`sha256-${digest}`)
  })

  it.each([false, true])("authorizes only the fixed bootstrap hash in editing (installed widgets: %s)", installed => {
    const packages: WebWriterPackage[] = installed ? [{
      name: "fixture", version: "1", label: "Fixture", authors: [], keywords: [], links: {},
      scripts: ["https://cdn.example/widget.js"], styles: [], members: [],
    }] : []
    const root = parse(editorFrameHTML('<p id="authored">Content</p>', editorOptions(packages)))
    const sources = scriptSources(root)

    expect(sources).toContain(`'${sandboxScriptHash}'`)
    expect(sources.filter(source => source.startsWith("'sha256-"))).toEqual([`'${sandboxScriptHash}'`])
    expect(sources).toContain(`'nonce-${bridgeNonce}'`)
    expect(sources).toContain("'strict-dynamic'")
    expect(sources).not.toContain("'unsafe-inline'")
    expect(root.querySelector("#authored")?.textContent).toBe("Content")
    expect(root.querySelectorAll("script")).not.toContainEqual(expect.objectContaining({textContent: sandboxBootstrapSource}))
  })

  it("retains the hash across repeated preview preparation with fresh script nonces", () => {
    let root = parse(editorFrameHTML('<article><!--keep--><p>Content</p></article>', editorOptions()))
    let previousNonce = bridgeNonce
    for(let pass = 0; pass < 3; pass++) {
      root = parse(previewFrameHTML(root, previewOptions()))
      const nonce = root.querySelector<HTMLScriptElement>('script[src$="preview-entry.js"]')!.getAttribute("nonce")!

      expect(root.querySelectorAll(policySelector)).toHaveLength(1)
      expect(scriptSources(root).filter(source => source === `'${sandboxScriptHash}'`)).toHaveLength(1)
      expect(scriptSources(root)).toContain(`'nonce-${nonce}'`)
      expect(nonce).not.toBe(previousNonce)
      expect(nonce).not.toBe(bridgeNonce)
      expect(root.querySelector('meta[name="webwriter-preview-bridge"]')?.getAttribute("data-nonce")).toBe(bridgeNonce)
      expect(root.querySelector("article")?.innerHTML).toBe("<!--keep--><p>Content</p>")
      previousNonce = nonce
    }
  })

  it("authorizes the same widget bootstrap in standalone learner documents", () => {
    const root = parse(previewFrameHTML(parse("<p>Standalone</p>"), previewOptions({
      standalone: true, learnerEntryURL: `${frameOrigin}/assets/learner-entry.js`,
    })))
    const learner = root.querySelector<HTMLScriptElement>("#webwriter-live-learner")!
    const nonce = learner.getAttribute("nonce")!

    expect(scriptSources(root)).toContain(`'${sandboxScriptHash}'`)
    expect(scriptSources(root)).toContain("'strict-dynamic'")
    expect(scriptSources(root)).toContain(`'nonce-${nonce}'`)
    expect(nonce).not.toBe(bridgeNonce)
    expect(root.querySelector('meta[name="webwriter-preview-bridge"]')).toBeNull()
    expect(root.body.innerHTML).toBe("<p>Standalone</p>")
  })

  it.each(["editing", "preview"])("keeps the authorized %s policy out of authored serialization", mode => {
    const html = '<head><meta name="description" content="Authored"></head><body><section><!--keep--><unfamiliar-element data-authored="yes">Content</unfamiliar-element></section></body>'
    const root = mode === "editing"
      ? parse(editorFrameHTML(html, editorOptions()))
      : parse(previewFrameHTML(parse(html), previewOptions()))
    const policy = root.querySelector<HTMLMetaElement>(policySelector)!
    const body = root.body.innerHTML

    registerFrameArtifacts(root, mode === "editing" ? bridgeNonce : undefined)
    expect(isEditorOnlyNode(policy)).toBe(true)
    clearEditorArtifacts(root)

    expect(root.querySelector(policySelector)).toBeNull()
    expect(root.querySelector('meta[name="webwriter-editor-bridge"], meta[name="webwriter-preview-bridge"], script[nonce]')).toBeNull()
    expect(root.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("Authored")
    expect(root.body.innerHTML).toBe(body)
  })
})
