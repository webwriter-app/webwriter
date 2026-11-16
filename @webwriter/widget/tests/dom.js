// A DOM for the tests that need one. Import it before the module under test.
import {GlobalRegistrator} from "@happy-dom/global-registrator"

if(!globalThis.document) GlobalRegistrator.register()

/** Resolves after pending microtasks and mutation observers have run. */
export const settled = () => new Promise(resolve => setTimeout(resolve, 0))

/** A host element in the document, inside an optional wrapper markup: `mount('<section lang="de">')`. */
export function mount(wrapper = "<div>", tag = "div") {
  const template = document.createElement("template")
  template.innerHTML = wrapper
  const outer = template.content.firstElementChild
  const host = document.createElement(tag)
  outer.append(host)
  document.body.append(outer)
  return {outer, host, remove: () => outer.remove()}
}
