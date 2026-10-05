import {css} from "lit"

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
