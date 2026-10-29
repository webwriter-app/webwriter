import {insertionMenuItems} from "../insertion"
import {graphicShapeOptions} from "../graphic"
import {mathStructureOptions} from "../math"
import {EditorFeature} from "."
import {getDistributionSelection, ensureDistributionTarget, hydrateDistributionInstructions, writeDistributionConfig} from "../distribution-dom"
import {validateDistributionConfig, type DistributionConfig} from "../distribution.js"
import {elementAttributeTargetId} from "../element-attributes"
import {nodeAtPath, pathFromNode} from "../utility"

export type DistributionSelection = ReturnType<typeof getDistributionSelection> & {
  path: number[] | null
  identity: string
}

/** Authored session policy. Reading selection state never changes the document. */
export class DistributionFeature extends EditorFeature {
  enable() {
    if(this.isEnabled) return
    hydrateDistributionInstructions(document)
    super.enable()
  }

  getState(element: Element | null): DistributionSelection | null {
    if(!element) return null
    return {...getDistributionSelection(element),
      path: element === document.documentElement ? null : pathFromNode(document.body, element),
      identity: elementAttributeTargetId(element)}
  }

  actions = {
    getDistributionInsertionItems: ({}: {type: "getDistributionInsertionItems"}) => [
      ...insertionMenuItems.filter(item => item.tag).map(item => ({id: `element:${item.tag}`, label: item.name,
        html: this.editor.features.manipulation.ribbonElement(item.tag!).outerHTML})),
      ...graphicShapeOptions.map(shape => ({id: `insert-graphic-shape:${shape.type}`, label: shape.label,
        html: this.editor.features.graphic.createGraphic(shape.type).outerHTML})),
      ...mathStructureOptions.map(option => ({id: `insert-math:${option.command.slice(10)}`, label: option.title,
        html: this.editor.features.math.create(option.command.slice(10))!.outerHTML})),
      ...(["ul", "ol"] as const).flatMap(tag => (tag === "ul" ? ["disc", "circle", "square", "none"]
        : ["decimal", "decimal-leading-zero", "lower-alpha", "upper-alpha", "lower-roman", "upper-roman", "none"]).map(style => {
          const element = this.editor.features.manipulation.ribbonElement(tag) as HTMLElement
          element.style.listStyleType = style
          return {id: `list-style:${tag}:${style}`, label: `${tag === "ol" ? "Enumeration" : "List"}: ${style}`, html: element.outerHTML}
        })),
    ],
    setDistributionConfig: ({path, identity, config}: {
      type: "setDistributionConfig", path: number[] | null, identity: string, config: DistributionConfig | null,
    }) => {
      if(this.editor.isEditingLocked) return false
      const element = path === null ? document.documentElement : nodeAtPath(document.body, path)
      if(!(element instanceof Element) || !element.isConnected || elementAttributeTargetId(element) !== identity) return false
      // Validate before assigning an identity or writing any authored state.
      const checked = config === null ? null : validateDistributionConfig(config)
      if(checked) for(const item of checked.items) {
        const prepared = this.editor.parseHTMLFragment(item.html, false, false)
        if(prepared.removedUnsafeItems) throw new TypeError("Palette templates cannot contain executable content")
      }
      const end = this.editor.doc.beginUndoGroup()
      try {
        if(checked) checked.target = ensureDistributionTarget(element)
        writeDistributionConfig(element, checked)
      }
      finally { end() }
      this.editor.postSelectionPath()
      return true
    },
  } as const
}
