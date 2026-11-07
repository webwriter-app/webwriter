import {hasPresentationState} from "./presentation-state.js"

type AnchorBinding = {control: Element, target: Element, name: string}

export function hasAnchorTarget(element: Element) {
  const doc = element.ownerDocument
  const state = (doc as Document & {[key: symbol]: {bindings?: Set<AnchorBinding>}})[Symbol.for("webwriter.anchor-positioning")]
  return Array.from(state?.bindings ?? []).some(binding => {
    if(binding.target !== element) return false
    const index = binding.name.match(/--ww-ui-anchor-(\d+)$/)?.[1]
    return Boolean(index && (hasPresentationState(element, `anchor-target-${index}`)
      || (element.getAttribute("part") ?? "").split(/\s+/).includes(`anchor-target-${index}`)))
  })
}

export function hasAnchorControl(element: Element) {
  const doc = element.ownerDocument
  const state = (doc as Document & {[key: symbol]: {bindings?: Set<AnchorBinding>}})[Symbol.for("webwriter.anchor-positioning")]
  return Array.from(state?.bindings ?? []).some(binding => {
    if(binding.control !== element) return false
    const index = binding.name.match(/--ww-ui-anchor-(\d+)$/)?.[1]
    return Boolean(index && (hasPresentationState(element, `anchor-control-${index}`)
      || (element.getAttribute("part") ?? "").split(/\s+/).includes(`anchor-control-${index}`)))
  })
}
