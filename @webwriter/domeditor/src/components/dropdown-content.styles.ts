import {css} from "lit"

/** Font controls share the white, connected surface used by ribbon buttons. */
export const connectedComboboxStyles = css`
  .option-group {scrollbar-width: thin;}
  .control {border-width: 1px;}
  input::placeholder {font-size: inherit; color: #6b7787; opacity: 1;}
  .control:focus-within {outline-offset: -2px;}
  :host([disabled]) .control {
    color: #9aa4b1;
    background: #f7f7f7;
    border-color: #c5ccd5;
    opacity: .6;
  }
  :host([disabled]) input, :host([disabled]) .toggle {cursor: default;}
  :host([open]:not([disabled])) .control {background: #fff;}
  :host([open]:not([disabled])) .control[data-connected] {
    border: 1px solid var(--connected-popup-border-color, #a8a8a8);
    border-bottom-color: #fff;
    border-radius: 4px 4px 0 0;
    background: #fff;
    outline: none;
    box-shadow: none;
  }
  :host([open]:not([disabled])) .control[data-connected="above"] {
    border-top-color: #fff;
    border-bottom-color: var(--connected-popup-border-color, #a8a8a8);
    border-radius: 4px;
  }
  .listbox[data-connected] {
    border: 1px solid var(--connected-popup-border-color, #a8a8a8);
    border-radius: var(--popup-border-radius);
  }
  .listbox[data-connected="below"] {border-top-width: 0; padding-top: 1px; clip-path: inset(0 -2rem -2rem -2rem);}
  .listbox[data-connected="above"] {border-bottom-width: 0; padding-bottom: 1px; clip-path: inset(-2rem -2rem 0 -2rem);}
  .listbox[data-connected]::before {
    content: "";
    position: absolute;
    z-index: 2;
    top: 0;
    left: 0;
    width: 100%;
    height: 1px;
    /* Draw the remaining edge inside the clipped popup, leaving the join white. */
    background: linear-gradient(to right,
      var(--connected-popup-border-color, #a8a8a8) 0 var(--popup-join-left),
      #fff var(--popup-join-left) calc(var(--popup-join-left) + var(--popup-join-width)),
      var(--connected-popup-border-color, #a8a8a8) calc(var(--popup-join-left) + var(--popup-join-width)) 100%);
    pointer-events: none;
  }
  .listbox[data-connected="above"]::before {top: auto; bottom: 0;}
`

/** Controls shared by ribbon button popovers and File submenus. */
export const dropdownContentStyles = css`
    .button-dropdown-form > fieldset {
      border: 0;
      margin: 0;
      padding: 0;
      min-width: 0;
    }

    .mark-dropdown-list {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .mark-dropdown-option {
      box-sizing: border-box;
      display: grid;
      grid-template-columns: auto 1rem minmax(0, 1fr) auto auto;
      align-items: center;
      gap: 0.35rem;
      min-height: 2rem;
      padding: 0.25rem 0.3rem;
      border-radius: 0.25rem;
    }

    .mark-dropdown-option:hover,
    .mark-dropdown-option[aria-selected="true"] {
      background: #eef4fb;
    }

    .mark-dropdown-option > input[type="checkbox"] {
      margin: 0;
      accent-color: #3977c7;
    }

    .mark-dropdown-option-icon {
      display: block;
      width: 1rem;
      height: 1rem;
      color: #526b86;
    }

    .mark-dropdown-option-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .mark-dropdown-option-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mark-dropdown-shortcut {
      grid-column: 5;
      justify-self: end;
      color: #687383;
      font-size: 0.66rem;
      white-space: nowrap;
    }

    .mark-dropdown-attributes {
      grid-column: 4;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .mark-dropdown-attributes[aria-hidden="true"] {
      visibility: hidden;
    }

    .mark-dropdown-attribute {
      width: 7rem;
    }

    .button-dropdown-form {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .button-dropdown-content .mark-attribute {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.4rem;
    }

    .button-dropdown-content .mark-attribute > span {
      color: #526b86;
      font-size: 0.62rem;
      white-space: nowrap;
    }

    .button-dropdown-content .mark-attribute input,
    .button-dropdown-content .mark-attribute select,
    .mark-dropdown-attribute {
      box-sizing: border-box;
      width: 9rem;
      min-width: 0;
      height: 1.45rem;
      padding: 0 0.3rem;
      border: 1px solid #c8d2df;
      border-radius: 0.2rem;
      color: #2f3742;
      background: #fff;
      font: inherit;
      font-size: 0.66rem;
    }

    .button-dropdown-content .mark-attribute input[type="checkbox"] {
      width: auto;
      height: auto;
      padding: 0;
    }

    .button-dropdown-content .mark-attribute input:focus,
    .button-dropdown-content .mark-attribute select:focus,
    .mark-dropdown-attribute:focus {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .mark-dropdown-option.mark-dropdown-option-link {
      grid-template-columns: auto 1rem auto minmax(0, 1fr) auto;
    }

    .mark-dropdown-link-url {
      min-width: 9rem;
    }

    .mark-dropdown-link-url .mark-dropdown-attribute {
      width: 100%;
    }

    .button-dropdown-more {
      box-sizing: border-box;
      align-self: flex-start;
      min-height: 1.5rem;
      padding: 0.2rem 0.35rem;
      border: 1px solid #c8d2df;
      border-radius: 0.2rem;
      color: #526b86;
      background: #fff;
      font: inherit;
      font-size: 0.66rem;
      cursor: pointer;
    }

    .button-dropdown-more:hover,
    .button-dropdown-more[aria-expanded="true"] {
      border-color: #8eb6df;
      color: #1e5d9d;
      background: #eef4fb;
    }

    .button-dropdown-more:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .button-dropdown-more:disabled {
      color: #9aa4b1;
      background: #f3f4f6;
      cursor: default;
    }

    .table-size-picker {
      display: grid;
      gap: 0.35rem;
      width: 11.5rem;
    }

    .table-size-label {
      color: #526b86;
      font-size: 0.66rem;
      font-weight: 600;
    }

    .table-size-grid {
      display: grid;
      grid-template-columns: repeat(10, 1fr);
      gap: 0.15rem;
    }

    .table-size-cell {
      box-sizing: border-box;
      min-height: 0;
      width: 1rem;
      height: 1rem;
      padding: 0;
      border: 1px solid #9aa4b1;
      border-radius: 0.05rem;
      background: #fff;
    }

    .table-size-cell[data-selected] {
      border-color: #3977c7;
      background: #dcecff;
    }

    .table-size-cell:focus-visible {
      position: relative;
      z-index: 1;
      outline: 2px solid #3977c7;
      outline-offset: 0;
    }

    .link-options {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.35rem;
      padding-top: 0.35rem;
    }

    .button-dropdown-content .link-options > .mark-attribute {
      justify-content: flex-end;
      text-align: right;
    }

    .link-download-filename {
      grid-column: 1 / -1;
    }

`

/** Shared switch appearance, sized by each control through custom properties. */
export const switchInputStyles = css`
    .live-session-switch input, .sharing-toggle .sharing-switch, input.editor-switch {
      appearance: none;
      position: relative;
      box-sizing: border-box;
      flex-shrink: 0;
      margin: 0;
      width: var(--switch-width, 1.9rem);
      height: var(--switch-height, 1.05rem);
      border: 1px solid #9aa9b8;
      border-radius: 999px;
      background: #d8dee6;
      cursor: pointer;
    }

    .live-session-switch input::after, .sharing-toggle .sharing-switch::after, input.editor-switch::after {
      position: absolute;
      top: 0.12rem;
      left: 0.12rem;
      width: var(--switch-knob-size, 0.69rem);
      height: var(--switch-knob-size, 0.69rem);
      border-radius: 50%;
      background: white;
      box-shadow: 0 1px 2px rgb(0 0 0 / 18%);
      content: "";
      transition: var(--ww-ui-transition, transform 120ms ease);
    }

    .live-session-switch input:checked, .sharing-toggle .sharing-switch[data-checked], input.editor-switch:checked {
      border-color: #3977c7;
      background: #3977c7;
    }

    .live-session-switch input:checked::after, .sharing-toggle .sharing-switch[data-checked]::after, input.editor-switch:checked::after {
      transform: translateX(var(--switch-travel, 0.83rem));
    }

    .live-session-switch input:focus-visible, input.editor-switch:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: 2px;
    }

    .live-session-switch input:disabled, input.editor-switch:disabled {
      opacity: 0.5;
      cursor: default;
    }
    @media (prefers-reduced-motion: reduce) {input.editor-switch::after {transition: none;}}
`

/** Link fields shared by reader controls and sharing popovers. */
export const sharingLinkStyles = css`
    .sharing-link-field {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      position: relative;
    }

    .sharing-link-label {
      color: #526b86;
      font-size: 0.62rem;
    }

    .sharing-link-input {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      height: 1.55rem;
      padding: 0 2rem 0 0.3rem;
      border: 1px solid #c8d2df;
      border-radius: 0.2rem;
      color: #2f3742;
      background: transparent;
      font: inherit;
      font-size: 0.66rem;
    }

    .sharing-link-input:focus {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .sharing-link-input-row {
      display: block;
      position: relative;
      width: 100%;
    }

    .sharing-link-copy {
      position: absolute;
      top: 50%;
      right: 0.28rem;
      transform: translateY(-50%);
      display: inline-grid;
      place-items: center;
      width: 1.15rem;
      min-height: 0;
      height: 1.15rem;
      padding: 0;
      border: 0;
      color: #526b86;
      background: rgba(255, 255, 255, 0.5);
      cursor: pointer;
    }

    .sharing-link-copy svg {
      width: 0.72rem;
      height: 0.72rem;
    }

    .sharing-link-copy:hover {
      color: #1e5d9d;
    }

    .sharing-link-copy.is-active,
    .sharing-link-copy[aria-pressed="true"] {
      color: #174f8b;
      background: #dbeafe;
    }

    .sharing-link-copy.is-success {
      color: #0f7a43;
      background: #e2f4ea;
    }

    .sharing-link-copy:focus:not(:focus-visible) {
      outline: none;
    }

    .sharing-link-copy:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

`
