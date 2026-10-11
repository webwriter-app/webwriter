import {css} from "lit"

/** Shared grid, joined-button corners, and interaction states for compact choice groups. */
export const choiceGroupStyles = css`
  .choice-group,
  .specialized-choice-group {
    display: grid;
    grid-template-columns: repeat(var(--choice-columns), minmax(0, 1fr));
    gap: 0;
    padding: 0 .5px .5px 0;
    background: transparent;
    min-width: 0;
    border: 0;
    border-radius: 0;
    overflow: visible;
  }

  .choice-group button,
  .specialized-choice-group button {
    box-sizing: border-box;
    margin: 0 -.5px -.5px 0;
    min-width: 0;
    border: var(--editor-control-border-width, .5px) solid #c5ccd5;
    background: #f2f2f2;
    color: inherit;
    cursor: pointer;
  }

  .choice-group button:first-child,
  .specialized-choice-group button:first-child {border-top-left-radius: 4px;}
  .choice-group button:last-child,
  .specialized-choice-group button:last-child {border-bottom-right-radius: 4px;}
  .choice-group button[data-top-right],
  .specialized-choice-group button[data-top-right] {border-top-right-radius: 4px;}
  .choice-group button[data-bottom-left],
  .specialized-choice-group button[data-bottom-left] {border-bottom-left-radius: 4px;}
  .choice-group button[aria-pressed="true"],
  .specialized-choice-group button[aria-pressed="true"] {background: #e2edf8; color: #375d84;}
  .choice-group button:hover,
  .specialized-choice-group button:hover {background: #edf3f9;}
  .choice-group button:focus-visible,
  .specialized-choice-group button:focus-visible {outline: 2px solid #8eb6df; outline-offset: -2px;}
`
