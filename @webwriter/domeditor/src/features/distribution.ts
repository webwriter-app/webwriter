import {insertionMenuItems} from "../insertion"
import {graphicShapeOptions} from "../graphic"
import {mathStructureOptions} from "../math"
import {EditorFeature} from "."
import {getDistributionSelection, hydrateDistributionInstructions, keepDistributionInstructionLast, writeDistributionConfig} from "../distribution-dom"
import {supportsDistribution, validateDistributionConfig, type DistributionConfig} from "../distribution.js"
import {elementAttributeTargetId} from "../element-attributes"
import {observePrivateDistributionRegions} from "../distribution-presentation"
import {nodeAtPath, pathFromNode} from "../utility"
import type {WidgetPermissionState} from "../widget-options"

export type DistributionSelection = ReturnType<typeof getDistributionSelection> & {
  path: number[] | null
  identity: string
  widgetPermissions?: WidgetPermissionState[]
}

/** Authored session policy. Reading selection state never changes the document. */
export class DistributionFeature extends EditorFeature {
  private stopPrivateMarkers?: () => void
  private readonly orderObserver = new MutationObserver(records => {
    for(const record of records) if(record.target.nodeType === 1) keepDistributionInstructionLast(record.target as Element)
  })

  enable() {
    if(this.isEnabled) return
    hydrateDistributionInstructions(document)
    super.enable()
    this.stopPrivateMarkers = observePrivateDistributionRegions(document, layer => this.editor.addAppendix(layer))
    this.orderObserver.observe(document.body, {childList: true, subtree: true})
  }

  disable() {
    this.stopPrivateMarkers?.()
    this.stopPrivateMarkers = undefined
    this.orderObserver.disconnect()
    super.disable()
  }

  getState(element: Element | null): DistributionSelection | null {
    if(!element || !supportsDistribution(element.localName, element.namespaceURI)) return null
    const widgetPermissions = this.editor.features.widget.getPermissions(element)
    return {...getDistributionSelection(element),
      path: element === document.documentElement ? null : pathFromNode(document.body, element),
      identity: elementAttributeTargetId(element),
      ...(widgetPermissions.length ? {widgetPermissions} : {})}
  }

  actions = {
    setWidgetPermission: ({path, identity, name, value}: {
      type: "setWidgetPermission", path: number[], identity: string, name: string, value: boolean,
    }) => {
      const element = nodeAtPath(document.body, path)
      if(!(element instanceof Element) || !element.isConnected || elementAttributeTargetId(element) !== identity) return false
      const {local, effective, hiddenByAncestor, error} = getDistributionSelection(element)
      if(error || hiddenByAncestor || (local ?? effective)?.view === false) return false
      return this.editor.features.widget.setPermission(element, name, value)
    },
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
      if(!(element instanceof Element) || !element.isConnected || elementAttributeTargetId(element) !== identity
        || !supportsDistribution(element.localName, element.namespaceURI)) return false
      // Validate before writing any authored state.
      const checked = config === null ? null : validateDistributionConfig(config)
      if(checked) for(const item of checked.items) {
        const prepared = this.editor.parseHTMLFragment(item.html, false, false)
        if(prepared.removedUnsafeItems) throw new TypeError("Palette templates cannot contain executable content")
      }
      const end = this.editor.doc.beginUndoGroup()
      try { writeDistributionConfig(element, checked) }
      finally { end() }
      this.editor.postSelectionPath()
      return true
    },
  } as const
}
