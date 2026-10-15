import {css} from "lit"

export const cardOverlayStyles = css`
  [data-card-overlay] {position: relative}
  [data-card-overlay]::after {content: attr(data-card-overlay); position: absolute; inset: 0; display: grid; place-items: center; border-radius: inherit; background: #17203399; color: white; font: 600 1rem/1.5 system-ui, sans-serif; opacity: 0; pointer-events: none}
  [data-card-overlay]:is(:hover, :focus-visible):not(:disabled)::after {opacity: 1}
`
