import {runInNewContext} from "node:vm"
import {describe, expect, it, vi} from "vitest"
import source from "./scoped-custom-element-registry.js?raw"

function environment() {
  const registry = {}
  const document = {
    customElementRegistry: registry,
    createElement: vi.fn(),
    createElementNS: vi.fn(),
    importNode: vi.fn(),
  }
  class ShadowRoot {
    ownerDocument = document
    get customElementRegistry(): unknown { return registry }
  }
  const attachShadow = vi.fn(function(this: Element, options: Record<string, unknown>) {
    return options
  })
  class Element {}
  Object.assign(Element.prototype, {attachShadow})
  const context = {ShadowRoot, Element, document, customElements: registry, HTMLElement: class {}, CustomElementRegistry: class {}}
  const install = () => runInNewContext(source, context)
  return {context, install, document, registry, attachShadow}
}

describe("native scoped registry compatibility", () => {
  it("translates both old option names while preserving inherited options and native globals", () => {
    const {context, install, attachShadow} = environment()
    const originals = {...context}
    install()
    const element = new context.Element() as Element
    const registry = {}
    const init = Object.freeze(Object.assign(Object.create({mode: "open"}), {customElements: registry}))
    const translated = element.attachShadow(init) as unknown as ShadowRootInit & {customElementRegistry: object}
    expect(translated.mode).toBe("open")
    expect(translated.customElementRegistry).toBe(registry)
    expect(init).not.toHaveProperty("customElementRegistry")
    element.attachShadow({mode: "open", registry} as ShadowRootInit)
    expect(attachShadow.mock.lastCall?.[0].customElementRegistry).toBe(registry)
    for(const key of ["HTMLElement", "CustomElementRegistry", "customElements"] as const) {
      expect(context[key]).toBe(originals[key])
    }
  })

  it("passes standard calls through unchanged and installs only once", () => {
    const {context, install, attachShadow} = environment()
    install()
    const patched = (context.Element.prototype as Element).attachShadow
    install()
    expect((context.Element.prototype as Element).attachShadow).toBe(patched)
    const init = {mode: "open", customElementRegistry: null, registry: {}} as const
    const element = new context.Element() as Element
    element.attachShadow(init as unknown as ShadowRootInit)
    expect(attachShadow).toHaveBeenLastCalledWith(init)
    expect(attachShadow.mock.lastCall?.[0]).toBe(init)
  })

  it("routes scoped creation and both import depths through the owning document", () => {
    const {context, install, document, registry} = environment()
    install()
    const root = new context.ShadowRoot() as unknown as {
      registry: unknown, customElements: unknown,
      createElement(name: string, options?: object | string): void,
      createElementNS(namespace: string, name: string): void,
      importNode(node: object, deep?: boolean): void,
    }
    expect(root.registry).toBe(registry)
    expect(root.customElements).toBe(registry)
    root.createElement("legacy-child", {is: "example"})
    expect(document.createElement).toHaveBeenLastCalledWith("legacy-child", {is: "example", customElementRegistry: registry})
    root.createElement("button", "example")
    expect(document.createElement).toHaveBeenLastCalledWith("button", {is: "example", customElementRegistry: registry})
    root.createElementNS("http://www.w3.org/2000/svg", "svg")
    expect(document.createElementNS).toHaveBeenLastCalledWith("http://www.w3.org/2000/svg", "svg", {customElementRegistry: registry})
    const node = {}
    root.importNode(node, true)
    expect(document.importNode).toHaveBeenLastCalledWith(node, {selfOnly: false, customElementRegistry: registry})
    root.importNode(node)
    expect(document.importNode).toHaveBeenLastCalledWith(node, {selfOnly: true, customElementRegistry: registry})
  })

  it("rejects missing native support or an already replaced global registry before patching", () => {
    const {context, install, attachShadow} = environment()
    context.customElements = {}
    expect(install).toThrow("requires native scoped custom element registries")
    expect((context.Element.prototype as Element).attachShadow).toBe(attachShadow)
    delete (context.ShadowRoot.prototype as {customElementRegistry?: unknown}).customElementRegistry
    expect(install).toThrow("requires native scoped custom element registries")
  })
})
