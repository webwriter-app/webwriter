export interface AnchorPositioner {
  bind(control: Element, target: Element, css?: string, pseudo?: "" | "::before" | "::after"): void
  release(control: Element): void
  refresh(): void
  destroy(): void
}
export function createAnchorPositioner(doc?: Document): AnchorPositioner
