import {css} from "lit"

/** File-source buttons shared with empty media input affordances. */
export const mediaSourceButtonStyles = css`
  .file-options {
    display: flex;
    flex: 0 0 auto;
    pointer-events: auto;
    overflow: hidden;
    border: 1px solid #c7c9ce;
    border-radius: .35rem;
    background: white;
  }
  .file-options button {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    gap: .4rem;
    height: calc(var(--control-height) - 2px);
    min-width: calc(1.125rem + .375rem + 1px);
    padding: 0 .65rem;
    border: 0;
    color: #343740;
    background: white;
    font-weight: 600;
    cursor: pointer;
  }
  .file-options button + button {border-inline-start: 1px solid #c7c9ce;}
  .file-options button:hover {background: #eef4fb;}
  .file-options button:active {color: #1e4f87; background: #c4dcf4;}
  .file-options button:focus-visible {outline: 2px solid #60a5fa; outline-offset: -2px;}
  .file-options .label {white-space: nowrap;}
  .file-options .icon {display: flex; flex: 0 0 auto;}
  .file-options .icon svg {display: block; width: 1.125rem; height: 1.125rem;}
`
