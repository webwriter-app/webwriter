/** Legacy scoped-registry API backed by the browser's standard implementation.
 * Keep this a standalone classic script: editing frames and saved documents
 * must install it before loading widget modules, including old bundled Lit.
 */
(() => {
  "use strict"
  const installed = Symbol.for("webwriter.scoped-registry-adapter")
  if(ShadowRoot.prototype[installed]) return
  if(!("customElementRegistry" in ShadowRoot.prototype)
    || document.customElementRegistry !== globalThis.customElements) {
    throw new Error("WebWriter requires native scoped custom element registries without the legacy registry polyfill")
  }

  const attachShadow = Element.prototype.attachShadow
  Element.prototype.attachShadow = function(init) {
    // Leave standard calls unchanged, including an explicit null registry.
    if(init && !("customElementRegistry" in init) && ("registry" in init || "customElements" in init)) {
      const registry = init.registry === undefined ? init.customElements : init.registry
      // Preserve inherited dictionary members and do not change the caller's options.
      init = Object.assign(Object.create(init), {customElementRegistry: registry})
    }
    return attachShadow.call(this, init)
  }

  Object.defineProperties(ShadowRoot.prototype, {
    registry: {
      configurable: true,
      get() { return this.customElementRegistry },
    },
    customElements: {
      configurable: true,
      get() { return this.customElementRegistry },
    },
    createElement: {
      configurable: true,
      writable: true,
      value(name, options = {}) {
        return this.ownerDocument.createElement(name, {
          ...(typeof options === "string" ? {is: options} : options),
          customElementRegistry: this.customElementRegistry,
        })
      },
    },
    createElementNS: {
      configurable: true,
      writable: true,
      value(namespace, name, options = {}) {
        return this.ownerDocument.createElementNS(namespace, name, {
          ...(typeof options === "string" ? {is: options} : options),
          customElementRegistry: this.customElementRegistry,
        })
      },
    },
    importNode: {
      configurable: true,
      writable: true,
      value(node, deep = false) {
        // Lit's old creationScope calls importNode(template.content, true).
        // Native importNode uses an options dictionary with inverted depth.
        return this.ownerDocument.importNode(node, {
          selfOnly: !deep,
          customElementRegistry: this.customElementRegistry,
        })
      },
    },
    [installed]: {value: true},
  })
})()
