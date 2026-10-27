import {css} from "lit"

/** Shared grid, joined-button corners, and interaction states for compact choice groups. */
export const choiceGroupStyles = css`
  .choice-group,
  .specialized-choice-group {
    display: grid;
    grid-template-columns: repeat(var(--choice-columns), minmax(0, 1fr));
    gap: 1px;
    padding: 0;
    background: #f7f7f7;
    min-width: 0;
    border: 1px solid #c5ccd5;
    border-radius: 4px;
    overflow: hidden;
  }

  .choice-group button,
  .specialized-choice-group button {
    box-sizing: border-box;
    margin: 0;
    min-width: 0;
    border: 0;
    border-radius: 0;
    box-shadow: 0 0 0 1px #c5ccd5;
    background: #f7f7f7;
    color: inherit;
    cursor: pointer;
  }

  .choice-group button[aria-pressed="true"],
  .specialized-choice-group button[aria-pressed="true"] {background: #e2edf8; color: #375d84;}
  .choice-group[data-default] button[aria-pressed="true"],
  .specialized-choice-group[data-default] button[aria-pressed="true"] {background: #e5e5e5; color: inherit;}
  .choice-group button:hover,
  .specialized-choice-group button:hover {background: #edf3f9;}
  .choice-group button:focus-visible,
  .specialized-choice-group button:focus-visible {outline: 2px solid #8eb6df; outline-offset: -2px;}
`
