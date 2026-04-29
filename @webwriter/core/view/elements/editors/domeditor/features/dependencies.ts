import { EditorFeature } from "."
import { DOMEditor } from "../domeditor"

export class DependencyFeature extends EditorFeature {
  constructor(editor: DOMEditor) {
    super(editor)
    this.#replaceCustomElementsDefine()
  }

  #replaceCustomElementsDefine() {
    const define = customElements.define
    customElements.define = function(tagName: string, constructor: CustomElementConstructor, options?: {extends: string}) {
      if(customElements.get(tagName)) {
        console.warn(`Attempted to re-register custom element tag name '${tagName}'`)
      }
      else {
        define.call(this, tagName, constructor, options)
      }
    }
  }
}