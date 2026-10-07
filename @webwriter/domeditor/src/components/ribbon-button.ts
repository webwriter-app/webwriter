import {dropdownContentStyles} from "./dropdown-content.styles"
import {LitElement, css, html, nothing, type TemplateResult} from "lit"
import { ribbonIcon } from "../ribbon-icons"
import type {PackageKeywordPresentation} from "../package-keywords"
import "./ribbon-menu"
import "./qr-code"
import type {RibbonMenu, RibbonMenuButton, RibbonMenuGroup} from "./ribbon-menu"
import {ribbonElementInsertionAction, ribbonElementTag, ribbonInsertionAction, startElementDrag, startRibbonInsertionDrag} from "./insertion-menu"

export type RibbonButtonDetails = {
  heading: string
  subheading?: string
  description?: string
  authors?: string[]
  fields?: Array<{label: string, value: string}>
  keywords?: PackageKeywordPresentation[]
}

/** A compact action used inside a ribbon group. */
export class RibbonButton extends LitElement {
  static properties = {
    label: {type: String},
    action: {type: String},
    dragHTML: {attribute: false},
    iconAction: {type: String, attribute: "icon-action"},
    iconActionLabel: {type: String, attribute: "icon-action-label"},
    active: {type: Boolean, reflect: true},
    compact: {type: Boolean, reflect: true},
    disabled: {type: Boolean, reflect: true},
    loading: {type: Boolean, reflect: true},
    icon: {type: String},
    hoverIcon: {type: String, attribute: "hover-icon"},
    iconUrl: {type: String, attribute: "icon-url"},
    iconPath: {type: String, attribute: "icon-path"},
    iconOnly: {type: Boolean, attribute: "icon-only", reflect: true},
    qrValue: {type: String, attribute: "qr-value"},
    shortcut: {type: String},
    submenu: {attribute: false},
    submenuGroups: {attribute: false},
    dropdown: {attribute: false},
    dropdownOnClick: {type: Boolean, attribute: "dropdown-on-click"},
    lazyDropdown: {type: Boolean, attribute: "lazy-dropdown"},
    dropdownNoScroll: {type: Boolean, attribute: "dropdown-no-scroll"},
    dropdownCompact: {type: Boolean, attribute: "dropdown-compact"},
    submenuOpen: {state: true},
    corner: {type: String},
    cornerLabel: {type: String, attribute: "corner-label"},
    cornerAction: {type: String, attribute: "corner-action"},
    keepDrawerOpen: {type: Boolean, attribute: "keep-drawer-open"},
    openDrawer: {type: Boolean, attribute: "open-drawer"},
    management: {type: Boolean, reflect: true},
    muted: {type: Boolean, reflect: true},
    details: {attribute: false},
    detailsOpen: {type: Boolean, attribute: "details-open", reflect: true},
    selectionCount: {type: Number, attribute: "selection-count"},
    toggle: {type: Boolean, reflect: true},
    variant: {type: String, reflect: true},
    notification: {attribute: false},
    notificationVisible: {state: true},
  }

  static styles = css`
    :host([variant="package"][developer-package]) .button-label-text { font-style: italic; }
    :host([icon-only]) .button-label { display: none; }
    :host([icon-only]) .main-button { padding: 0.3rem; justify-content: center; }
    :host([icon-only]) .button-icon { width: 1.6rem; height: 1.6rem; }

    :host {
      display: block;
      flex: 1 1 3rem;
      min-width: 3rem;
    }

    :host([compact]) {
      flex: 0 0 1.75rem;
      min-width: 1.75rem;
      width: 1.75rem;
    }

    :host([compact]) .button-row {
      box-sizing: border-box;
      height: 1.75rem;
    }

    .button-row {
      box-sizing: border-box;
      position: relative;
      display: flex;
      align-items: stretch;
      width: 100%;
      min-width: 0;
      border: 1px solid transparent;
      border-radius: 0.35rem;
    }

    .button-row:not(.has-icon-action):not([data-connected]):hover {
      border-color: #c8d2df;
      background: #eef4fb;
    }

    .button-row.has-icon-action:not([data-connected]):hover,
    .button-row.has-icon-action:not([data-connected]):focus-within {
      border-color: transparent;
      background: #d7e7f7;
    }

    .button-row.has-icon-action:not([data-connected]):hover .main-button,
    .button-row.has-icon-action:not([data-connected]):hover .submenu-trigger,
    .button-row.has-icon-action:not([data-connected]):has(.main-button:hover, .submenu-trigger:hover, .main-button:focus-visible, .submenu-trigger:focus-visible) .main-button,
    .button-row.has-icon-action:not([data-connected]):has(.main-button:hover, .submenu-trigger:hover, .main-button:focus-visible, .submenu-trigger:focus-visible) .submenu-trigger {
      color: var(--ribbon-control-color, #1e4f87);
      background: #d7e7f7;
    }

    .button-row.has-icon-action:not([data-connected]):has(.main-button:active, .submenu-trigger:active) .main-button,
    .button-row.has-icon-action:not([data-connected]):has(.main-button:active, .submenu-trigger:active) .submenu-trigger {
      color: var(--ribbon-control-color, #1e4f87);
      background: #c4dcf4;
    }

    .button-row:not([data-connected]) button:active {
      color: var(--ribbon-control-color, #1e4f87);
      background: #c4dcf4;
    }

    .icon-action-trigger {
      box-sizing: border-box;
      flex: 0 0 auto;
      width: 1.65rem;
      min-height: 1.65rem;
      padding: 0.25rem;
      border: 1px solid transparent;
      color: #526b86;
      background: transparent;
    }

    .icon-action-trigger:hover,
    .icon-action-trigger:focus-visible {
      color: #1e5d9d;
      background: #c4dcf4;
    }

    :host([variant="package"]) .icon-action-trigger {
      flex-basis: 1.8rem;
      width: 1.8rem;
      min-height: 1.8rem;
    }

    .button-notification {
      box-sizing: border-box;
      position: absolute;
      z-index: 2;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 0.3rem 0.4rem;
      border: 1px solid #8eb6df;
      border-radius: 0.3rem;
      color: #1e4f87;
      background: rgb(255 255 255 / 94%);
      font-size: 0.64rem;
      font-weight: 600;
      line-height: 0.85rem;
      text-align: center;
      opacity: 0;
      pointer-events: none;
      transition: var(--ww-ui-transition, opacity 180ms ease);
    }

    .button-notification.visible {
      opacity: 1;
    }

    :host([active]:not([variant="package"])) .button-row:not(.has-icon-action):not([data-connected]) {
      border-color: #8eb6df;
      background: #dcecff;
      box-shadow: inset 0 0 0 1px rgb(57 119 199 / 12%);
    }

    :host([disabled]) .button-row,
    :host([disabled]) .button-row:hover {
      border-color: transparent;
      background: transparent;
      box-shadow: none;
    }

    button {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.2rem;
      width: 100%;
      min-height: 1.75rem;
      padding: 0.05rem 0.3rem;
      border: 0;
      border-radius: 0.25rem;
      color: var(--ribbon-control-color, #2f3742);
      background: transparent;
      font: inherit;
      font-size: 0.6rem;
      cursor: pointer;
    }

    button:disabled {
      color: #9aa4b1;
      cursor: default;
      opacity: 0.55;
    }

    :host([compact]) .button-row > button {
      width: 100%;
      min-height: 0;
      height: 100%;
      padding: 0.25rem;
    }

    :host([compact]) .button-label {
      display: none;
    }

    .main-button {
      flex: 1 1 auto;
      min-width: 0;
    }

    :host([variant="insertion"]) .main-button {
      padding-inline: calc(0.3rem - 2px);
    }

    .submenu-toggle {
      position: absolute;
      top: 0.15rem;
      right: 0.15rem;
      width: 1rem;
      height: 1rem;
      min-height: 0;
      display: grid;
      place-items: center;
      padding: 0.25rem;
    }

    .submenu-toggle:hover {
      color: var(--ribbon-control-color, #1e4f87);
      background: #d7e7f7;
    }

    button:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .submenu-chevron {
      display: block;
      width: 0.25rem;
      height: 0.25rem;
      border-right: 1.25px solid currentColor;
      border-bottom: 1.25px solid currentColor;
      transform: rotate(45deg);
      transition: var(--ww-ui-transition, transform 120ms ease);
    }

    .submenu-toggle[aria-expanded="true"] .submenu-chevron {
      transform: rotate(225deg);
    }

    .button-icon {
      display: block;
      width: 1rem;
      height: 1rem;
      color: var(--ribbon-control-color, #526b86);
    }

    :host([active]) .button-icon {
      color: var(--ribbon-control-color, #1e5d9d);
    }

    :host([disabled]) .button-icon {
      color: currentColor;
    }

    .button-icon webwriter-qr-code {
      filter: var(--ribbon-qr-filter, none);
    }

    .button-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .button-icon-default,
    .button-icon-hover {
      display: block;
      width: 100%;
      height: 100%;
    }

    .button-icon-hover {
      display: none;
    }

    .button-row:not(.has-icon-action):hover .button-icon-default,
    .button-row:not(.has-icon-action):focus-within .button-icon-default,
    .icon-action-trigger:hover .button-icon-default,
    .icon-action-trigger:focus-visible .button-icon-default {
      display: none;
    }

    .button-row:not(.has-icon-action):hover .button-icon-hover,
    .button-row:not(.has-icon-action):focus-within .button-icon-hover,
    .icon-action-trigger:hover .button-icon-hover,
    .icon-action-trigger:focus-visible .button-icon-hover {
      display: block;
    }

    .button-icon.image-icon {
      position: relative;
    }

    .button-icon.image-icon svg {
      visibility: hidden;
    }

    .button-icon img {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .icon-loading {
      display: grid;
      place-items: center;
      pointer-events: none;
    }

    .icon-loading::after {
      content: "";
      box-sizing: border-box;
      width: 0.85rem;
      height: 0.85rem;
      border: 2px solid #526b86;
      border-right-color: transparent;
      border-radius: 50%;
      animation: ribbon-icon-spin 0.8s linear infinite;
    }

    @keyframes ribbon-icon-spin {
      to { transform: rotate(360deg); }
    }

    .corner-icon {
      width: 0.65rem;
      height: 0.65rem;
    }

    .button-label {
      display: flex;
      align-items: baseline;
      line-height: 0.8rem;
      min-width: 0;
      max-width: 100%;
      white-space: nowrap;
    }

    .button-label-text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .selection-count {
      flex: 0 0 auto;
      margin-left: 0.15rem;
      color: #526b86;
      font-size: 0.56rem;
      font-weight: 600;
    }

    .button-dropdown-content {
      color: #2f3742;
      font-size: 0.7rem;
    }

    .snippet-empty-hint {
      padding: 0.4rem;
      color: #64748b;
      font-size: 0.66rem;
      line-height: 1rem;
    }

    ${dropdownContentStyles}

    .graphic-layers-dropdown {
      width: min(18rem, calc(100vw - 2rem));
    }

    .graphic-layer-list {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      max-height: min(18rem, calc(100vh - 10rem));
      overflow: auto;
    }

    .button-dropdown-empty {
      padding: 0.4rem;
      color: #64748b;
      font-size: 0.66rem;
    }

    .graphic-layer-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 1.7rem 1.7rem;
      gap: 0.1rem;
      align-items: center;
      min-height: 1.8rem;
      padding: 0.1rem;
      border: 1px solid transparent;
      border-radius: 0.25rem;
    }

    .graphic-layer-row[data-selected="true"] {
      border-color: #93b8df;
      background: #eef5fc;
    }

    .graphic-layer-select,
    .graphic-layer-action,
    .graphic-layer-order,
    .graphic-zoom-action {
      box-sizing: border-box;
      border: 0;
      border-radius: 0.2rem;
      color: #334155;
      background: transparent;
      font: inherit;
      cursor: pointer;
    }

    .graphic-layer-select {
      display: flex;
      flex-direction: row;
      gap: 0.4rem;
      align-items: center;
      justify-content: flex-start;
      min-width: 0;
      height: 1.55rem;
      padding: 0 0.3rem;
      font-size: 0.66rem;
      line-height: 1rem;
      text-align: left;
    }

    .graphic-layer-select span:last-child {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .graphic-layer-icon,
    .graphic-layer-action,
    .graphic-layer-order,
    .graphic-zoom-action {
      display: grid;
      place-items: center;
    }

    .graphic-layer-icon {
      flex: 0 0 auto;
      width: 1rem;
      height: 1rem;
    }

    .graphic-layer-icon svg,
    .graphic-layer-action svg {
      width: 1rem;
      height: 1rem;
    }

    .graphic-layer-action {
      width: 1.55rem;
      height: 1.55rem;
    }

    .graphic-layer-select:hover,
    .graphic-layer-action:hover,
    .graphic-layer-order:hover,
    .graphic-zoom-action:hover {
      color: #1e5d9d;
      background: #dfeefc;
    }

    .graphic-layer-select:focus-visible,
    .graphic-layer-action:focus-visible,
    .graphic-layer-order:focus-visible,
    .graphic-zoom-action:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .graphic-layer-select:disabled,
    .graphic-layer-order:disabled {
      color: #9aa4b1;
      cursor: default;
    }

    .graphic-layer-toolbar {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.2rem;
      padding-top: 0.4rem;
      border-top: 1px solid #dce4ee;
    }

    .graphic-layer-order {
      min-height: 1.65rem;
      padding: 0.15rem 0.25rem;
      border: 1px solid #c8d2df;
      background: #fff;
      font-size: 0.62rem;
    }

    .graphic-zoom-dropdown {
      width: 12rem;
    }

    .graphic-zoom-stepper {
      display: grid;
      grid-template-columns: 1.8rem 1fr 1.8rem;
      gap: 0.25rem;
      align-items: center;
    }

    .graphic-zoom-action {
      min-height: 1.65rem;
      border: 1px solid #c8d2df;
      background: #fff;
      font-size: 0.8rem;
    }

    .graphic-zoom-value {
      color: #1e4f80;
      font-weight: 600;
      text-align: center;
    }

    .graphic-zoom-dropdown input[type="range"] {
      width: 100%;
      margin: 0;
      accent-color: #3977c7;
    }

    .graphic-zoom-presets {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.25rem;
    }

    .graphic-navigation-hint {
      margin: 0;
      color: #64748b;
      font-size: 0.6rem;
      line-height: 0.85rem;
      text-align: center;
    }

    .sharing-dropdown {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      min-width: 0;
    }

    .sharing-dropdown webwriter-qr-code[hidden] {
      display: none;
    }

    .sharing-document-actions,
    .sharing-qr-group {
      border: 1px solid #c8d2df;
      border-radius: 0.25rem;
      overflow: hidden;
    }

    .sharing-document-actions {
      display: flex;
      padding: 0.15rem;
    }

    .sharing-document-actions ribbon-button {
      flex: 1;
    }

    .sharing-document-actions ribbon-button + ribbon-button {
      border-left: 1px solid #c8d2df;
    }

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

    .sharing-dropdown-qr {
      box-sizing: border-box;
      width: 100%;
      min-height: 0;
      display: flex;
      justify-content: center;
      padding: 0.35rem;
    }

    .sharing-dropdown-qr-code {
      width: 100%;
      aspect-ratio: 1 / 1;
      height: auto;
      max-width: 100%;
      display: block;
      object-fit: contain;
    }

    .sharing-dropdown-actions {
      display: flex;
      border-top: 1px solid #c8d2df;
    }

    .sharing-dropdown-action {
      width: 50%;
      min-height: 1.5rem;
      padding: 0.35rem;
      display: inline-grid;
      place-items: center;
      border: 0;
      border-radius: 0;
    }

    .sharing-dropdown-action + .sharing-dropdown-action {
      border-left: 1px solid #c8d2df;
    }

    .sharing-dropdown-action svg {
      width: 1.25rem;
      height: 1.25rem;
    }

    .sharing-dropdown-action.is-active,
    .sharing-dropdown-action[aria-pressed="true"] {
      color: #174f8b;
      border-color: #8eb6df;
      background: #eef4fb;
    }

    .sharing-dropdown-action.is-success {
      color: #0f7a43;
      border-color: #66ad78;
      background: #e2f4ea;
    }

    .sharing-dropdown-action:focus:not(:focus-visible) {
      outline: none;
    }

    .form-attribute-boolean input {
      width: auto !important;
      height: auto !important;
      accent-color: #3977c7;
    }

    .details {
      box-sizing: border-box;
      display: none;
      position: fixed;
      z-index: 2147483647;
      width: min(17rem, calc(100vw - 1rem));
      max-height: min(18rem, calc(100vh - 1rem));
      padding: 0.55rem;
      overflow: auto;
      border: 1px solid #a8a8a8;
      border-radius: 0.4rem;
      color: #2f3742;
      background: #fff;
      box-shadow: 0 0.45rem 1rem rgb(0 0 0 / 18%);
      font-size: 0.7rem;
      line-height: 1.3;
      margin: 0;
    }

    :host([details-open]) .details { display: block; }
    .details h3 { margin: 0; font-size: 0.8rem; }
    .details-subheading { color: #667085; font-size: 0.63rem; }
    .details-authors {
      overflow: hidden;
      margin-top: 0.1rem;
      color: #667085;
      font-size: 0.64rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .details-description { margin: 0.4rem 0; }
    .details dl { display: grid; grid-template-columns: auto 1fr; gap: 0.2rem 0.55rem; margin: 0; }
    .details dt { color: #667085; font-weight: 600; }
    .details dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    .details-keywords {
      display: flex;
      flex-wrap: wrap;
      gap: 0.2rem 0.45rem;
      margin-top: 0.4rem;
      color: #667085;
      font-size: 0.63rem;
    }
    .details-keyword {
      display: inline-flex;
      align-items: center;
      gap: 0.18rem;
    }
    .details-keyword-icon {
      display: inline-flex;
      flex: 0 0 0.72rem;
      width: 0.72rem;
      height: 0.72rem;
      color: #526b86;
    }
    .details-keyword-icon svg { display: block; width: 100%; height: 100%; }

    :host([variant="package"]) {
      grid-column: span 2;
      min-width: 0;
    }

    :host([variant="toolbar"]) {
      flex: 1 1 0;
      min-width: 0;
    }

    :host([variant="tab"]) .button-row {
      height: 40px;
      transform: translateY(1px);
    }

    /* Keep the popover shadow outside the connected button. */
    ribbon-menu[data-connected="below"] {
      clip-path: inset(0 -2rem -2rem -2rem);
    }

    ribbon-menu[data-connected="above"] {
      clip-path: inset(-2rem -2rem 0 -2rem);
    }

    /* The popover is in the top layer, so cover its shared border there. */
    ribbon-menu[data-connected]::before {
      content: "";
      position: absolute;
      z-index: 1;
      top: 0;
      left: var(--ribbon-menu-join-left);
      width: var(--ribbon-menu-join-width);
      height: 1px;
      background: #ffffff;
      pointer-events: none;
    }

    ribbon-menu[data-connected="above"]::before {
      top: auto;
      bottom: 0;
    }

    :host([variant="toolbar"]) .button-row,
    :host([variant="toolbar"]) .main-button {
      height: 1.55rem;
      min-height: 1.55rem;
    }

    :host([variant="toolbar"]) .main-button {
      flex-direction: row;
      gap: 0.3rem;
      padding: 0 0.45rem;
    }

    :host([variant="toolbar"]) .button-icon {
      flex: 0 0 0.85rem;
      width: 0.85rem;
      height: 0.85rem;
    }

    :host([package-add]) {height: 100%}
    :host([package-add]) .button-row {height: 100%; min-height: 0; border: 0; border-radius: 0}
    :host([package-add]) .main-button {height: 100%; min-height: 0; justify-content: flex-start; padding: 0 .65rem; border-radius: 0}
    :host([package-add]) .submenu-trigger {position: static; flex: 0 0 auto; align-self: stretch; width: auto; height: 100%; min-height: 0; aspect-ratio: 1; transform: none; border: 0; border-left: 1px solid #c8c8c8; border-radius: 0; padding: 0}

    :host([variant="qr"]) {
      grid-column: span 1;
      grid-row: span 2;
      min-width: 0;
      min-height: 0;
    }

    :host([variant="qr"]) .button-row,
    :host([variant="qr"]) .main-button {
      height: 100%;
    }

    :host([variant="qr"]) .main-button {
      gap: 0.1rem;
      padding: 0 1.15rem 0 0.15rem;
    }

    :host([variant="qr"]) .button-icon {
      width: 3.5rem;
      height: 3.5rem;
    }

    :host([variant="qr"]) .submenu-trigger {
      top: 50%;
      transform: translateY(-50%);
    }

    :host([variant="package"]) .button-row {
      box-sizing: border-box;
      height: 100%;
    }

    :host([variant="package"][active]) .button-row:not([data-connected]) {
      border-color: transparent;
      background: transparent;
      box-shadow: none;
    }

    :host([variant="package"][active]) .button-row:not(.has-icon-action):not([data-connected]):hover {
      border-color: #c8d2df;
      background: #eef4fb;
    }

    :host([variant="package"][active]) .button-icon {
      color: #526b86;
    }

    :host([variant="package"]) .main-button {
      flex-direction: row;
      justify-content: flex-start;
      gap: 0.4rem;
      height: 100%;
      padding: 0.15rem 1.35rem 0.15rem 0.4rem;
      text-align: left;
    }

    :host([variant="package"]) .button-icon {
      flex: 0 0 1rem;
    }

    :host([variant="package"]) .submenu-toggle:not(.submenu-trigger):not(.corner-trigger) {
      top: 50%;
      transform: translateY(-50%);
    }

    :host([variant="package"]) .button-row.has-submenu .main-button,
    :host([variant="package"]) .button-row.has-corner .main-button {
      padding-right: 0.4rem;
    }

    :host([variant="package"]) .submenu-trigger,
    :host([variant="package"]) .corner-trigger {
      position: static;
      flex: 0 0 auto;
      align-self: stretch;
      width: auto;
      height: 100%;
      min-height: 100%;
      aspect-ratio: 1 / 1;
      transform: none;
    }

    :host([variant="package"]) .has-icon-action .icon-action-trigger,
    :host([variant="package"]) .has-icon-action .main-button,
    :host([variant="package"]) .has-icon-action .submenu-trigger {
      align-self: stretch;
      height: auto;
      min-height: 0;
      margin: 0;
    }

    :host([variant="package"]) .has-icon-action .main-button {
      padding-left: 0;
      border-radius: 0.25rem 0 0 0.25rem;
    }

    :host([variant="package"]) .has-icon-action .submenu-trigger {
      border-radius: 0 0.25rem 0.25rem 0;
    }

    :host([variant="package"]) .button-label {
      display: -webkit-box;
      flex: 1 1 auto;
      line-height: 1.1;
      font-size: calc(0.6rem + 1px);
      overflow: clip;
      overflow-clip-margin: 0.2em;
      white-space: normal;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    :host([variant="package"]) .button-label-text {
      overflow: visible;
      overflow-wrap: anywhere;
      text-overflow: clip;
      white-space: normal;
    }

    :host([variant="package"][muted]) .button-row:not([data-connected]) {
      color: #7c8794;
      opacity: 0.55;
    }

    :host([variant="package"][muted]) .button-row:not([data-connected]):hover {
      opacity: 0.8;
    }

    :host([variant="package"][console-selected]) .button-row,
    :host([variant="package"][console-selected]) .button-row:hover {
      color: #153b5c;
      opacity: 1;
    }

    :host([variant="package"][console-selected]) .button-label-text {
      text-decoration-line: underline;
      text-decoration-color: #8eb6df;
      text-decoration-thickness: 2px;
      text-underline-offset: 2px;
      text-decoration-skip-ink: none;
    }

    :host([variant="package"][management][active]) .corner-trigger:hover {
      background: #fee2e2;
      color: #991b1b;
    }

    :host([variant="package"][management][active]) .corner-trigger:hover .corner-icon {
      color: #991b1b;
    }

    .button-row[data-connected],
    :host([package-add]) .button-row[data-connected] {
      border: 1px solid #a8a8a8;
      border-bottom-color: #ffffff;
      border-radius: 0.45rem 0.45rem 0 0;
      background: #ffffff;
      box-shadow: none;
    }

    .button-row[data-connected="above"],
    :host([package-add]) .button-row[data-connected="above"] {
      border-top-color: #ffffff;
      border-bottom-color: #a8a8a8;
      border-radius: 0 0 0.45rem 0.45rem;
    }

    .button-row[data-connected] > button {
      background: transparent;
    }

    .button-row[data-connected] .button-icon {
      color: #1e4f87;
    }

  `

  label = "Placeholder"
  action = ""
  dragHTML: string | undefined
  iconAction = ""
  iconActionLabel = ""
  active = false
  compact = false
  disabled = false
  icon = ""
  hoverIcon = ""
  loading = false
  iconUrl = ""
  iconOnly = false
  iconPath = ""
  qrValue = ""
  shortcut = ""
  submenu: RibbonMenuButton[] = []
  submenuGroups: RibbonMenuGroup[] | undefined
  dropdown: TemplateResult | null = null
  dropdownOnClick = false
  lazyDropdown = false
  dropdownNoScroll = false
  dropdownCompact = false
  corner = ""
  cornerLabel = ""
  cornerAction = ""
  keepDrawerOpen = false
  openDrawer = false
  management = false
  muted = false
  details: RibbonButtonDetails | null = null
  toggle = false
  selectionCount = 0
  variant = "default"
  notification = ""
  private submenuOpen = false
  private notificationVisible = false
  private notificationTimer: ReturnType<typeof setTimeout> | undefined
  private detailsOpen = false
  private detailsPosition = {left: 8, top: 8}
  private submenuTrigger: HTMLButtonElement | null = null
  private insertionHoverPointer = false
  private insertionHoverFocus = false
  private insertionHoverActive = false

  private showPopoverElement(element: HTMLElement | null) {
    if(typeof element?.showPopover !== "function") return
    try {
      element.showPopover()
    }
    catch {
      // The element may already be open while pointer and focus events overlap.
    }
  }

  private hidePopoverElement(element: HTMLElement | null) {
    if(typeof element?.hidePopover !== "function") return
    try {
      element.hidePopover()
    }
    catch {
      // The element may already be closed during teardown or rerendering.
    }
  }

  private closeSubmenuPopover(restoreFocus = false) {
    const trigger = this.submenuTrigger
    this.submenuTrigger = null
    const submenu = this.renderRoot.querySelector<RibbonMenu>("ribbon-menu")
    submenu?.closeSubmenus()
    this.hidePopoverElement(submenu)
    submenu?.removeAttribute("data-connected")
    this.submenuOpen = false
    this.renderRoot.querySelector(".button-row")?.removeAttribute("data-connected")
    if(restoreFocus && trigger?.isConnected) trigger.focus()
  }

  private readonly handleDocumentPointerDown = (event: PointerEvent) => {
    if(!this.submenuOpen || event.composedPath().includes(this)) return
    this.closeSubmenuPopover()
  }

  private readonly handleDocumentKeydown = (event: KeyboardEvent) => {
    if(this.submenuOpen && event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      this.closeSubmenuPopover(true)
    }
  }

  connectedCallback() {
    super.connectedCallback()
    document.addEventListener("pointerdown", this.handleDocumentPointerDown)
    document.addEventListener("keydown", this.handleDocumentKeydown)
  }

  disconnectedCallback() {
    this.clearInsertionHover()
    document.removeEventListener("pointerdown", this.handleDocumentPointerDown)
    document.removeEventListener("keydown", this.handleDocumentKeydown)
    this.closeSubmenuPopover()
    this.hideDetails()
    if(this.notificationTimer !== undefined) clearTimeout(this.notificationTimer)
    super.disconnectedCallback()
  }

  protected updated(changedProperties: Map<PropertyKey, unknown>) {
    if(changedProperties.has("disabled") && this.disabled) this.clearInsertionHover()
    if(changedProperties.has("disabled") && this.disabled && this.submenuOpen) {
      this.closeSubmenuPopover()
    }
  }

  showNotification(message: string, duration = 1800) {
    if(this.notificationTimer !== undefined) clearTimeout(this.notificationTimer)
    this.notification = message
    this.notificationVisible = true
    this.notificationTimer = setTimeout(() => {
      this.notificationVisible = false
      this.notificationTimer = undefined
    }, duration)
  }

  private dispatchClick(action: string, closeSubmenu = true) {
    if(closeSubmenu) this.closeSubmenuPopover()
    this.dispatchEvent(new CustomEvent<{label: string, keepDrawerOpen?: boolean, openDrawer?: boolean}>("ribbon-button-click", {
      detail: {
        label: action || this.label,
        keepDrawerOpen: this.keepDrawerOpen,
        ...(this.openDrawer ? {openDrawer: true} : {}),
      },
      bubbles: true,
      composed: true,
    }))
  }

  private dispatchIconAction() {
    this.dispatchClick(this.iconAction, false)
    if(!this.submenuOpen && this.hasDropdown) {
      const trigger = this.renderRoot.querySelector<HTMLButtonElement>(".submenu-trigger")
      if(trigger) this.openSubmenu(trigger)
    }
  }

  private dispatchIconHover(hovered: boolean) {
    this.dispatchEvent(new CustomEvent<{hovered: boolean}>("ribbon-icon-hover", {
      detail: {hovered}, bubbles: true, composed: true,
    }))
  }

  private dispatchInsertionHover(hovered: boolean, source: "pointer" | "focus") {
    if(source === "pointer") this.insertionHoverPointer = hovered
    else this.insertionHoverFocus = hovered
    const action = this.action || this.label
    const insertable = !action.startsWith("insert-math:") && !action.startsWith("list-style:") && action !== "element:math"
      && ((this.variant === "insertion" && Boolean(ribbonElementTag(this.label, action)))
        || ribbonInsertionAction(action) || ribbonElementInsertionAction(action))
    const active = insertable && !this.disabled && (this.insertionHoverPointer || this.insertionHoverFocus)
    if(active === this.insertionHoverActive) return
    this.insertionHoverActive = active
    const tag = active ? ribbonElementTag(this.label, action) : null
    this.dispatchEvent(new CustomEvent<{hovered: boolean, tag?: string}>("insertion-hover-change", {
      detail: {hovered: active, ...(tag ? {tag} : {})}, bubbles: true, composed: true,
    }))
  }

  private clearInsertionHover() {
    this.insertionHoverPointer = false
    this.insertionHoverFocus = false
    if(!this.insertionHoverActive) return
    this.insertionHoverActive = false
    this.dispatchEvent(new CustomEvent<{hovered: boolean}>("insertion-hover-change", {
      detail: {hovered: false}, bubbles: true, composed: true,
    }))
  }

  private handleClick(event: Event) {
    if(this.dropdownOnClick && this.hasDropdown) {
      this.toggleSubmenu(event)
      return
    }
    this.dispatchClick(this.action)
  }

  private handleCornerClick() {
    this.dispatchClick(this.cornerAction || this.action)
  }

  private toggleSubmenu(event: Event) {
    if(this.submenuOpen) {
      this.closeSubmenuPopover()
    }
    else {
      this.openSubmenu(event.currentTarget as HTMLButtonElement)
    }
  }

  private openSubmenu(trigger: HTMLButtonElement) {
    if(this.submenuOpen) return
    this.submenuTrigger = trigger
    this.submenuOpen = true
    this.dispatchEvent(new CustomEvent("ribbon-dropdown-open", {bubbles: true, composed: true}))
    void this.updateComplete.then(async () => {
        const submenu = this.renderRoot.querySelector<RibbonMenu>("ribbon-menu")
        if(!submenu || !this.submenuOpen || !this.isConnected) return
        if(submenu instanceof LitElement) await submenu.updateComplete
        if(!this.submenuOpen || !this.isConnected) return
        this.showPopoverElement(submenu)
        const row = this.renderRoot.querySelector<HTMLElement>(".button-row")!
        const button = row.getBoundingClientRect()
        submenu.style.minWidth = `${Math.min(button.width, window.innerWidth - 16)}px`
        const menu = submenu.getBoundingClientRect()
        const margin = 8
        const left = Math.min(
          Math.max(margin, button.left),
          Math.max(margin, window.innerWidth - menu.width - margin),
        )
        const below = button.bottom - 1
        const opensBelow = below + menu.height <= window.innerHeight - margin
        const top = opensBelow
          ? below
          : Math.max(margin, button.top - menu.height + 1)
        submenu.style.left = `${left}px`
        submenu.style.top = `${top}px`
        submenu.focusEditingLabel()
        if(opensBelow || top + menu.height === button.top + 1) {
          const placement = opensBelow ? "below" : "above"
          row.setAttribute("data-connected", placement)
          submenu.setAttribute("data-connected", placement)
          submenu.style.setProperty("--ribbon-menu-join-left", `${button.left - left + 1}px`)
          submenu.style.setProperty("--ribbon-menu-join-width", `${button.width - 2}px`)
          const joinsLeft = left === button.left
          const joinsRight = left + menu.width === button.right
          submenu.style.setProperty("--ribbon-menu-border-radius", opensBelow
            ? `${joinsLeft ? "0" : "0.35rem"} ${joinsRight ? "0" : "0.35rem"} 0.35rem 0.35rem`
            : `0.35rem 0.35rem ${joinsRight ? "0" : "0.35rem"} ${joinsLeft ? "0" : "0.35rem"}`)
        }
    })
  }

  private handleSubmenuClick(event: CustomEvent<{keepDrawerOpen?: boolean}>) {
    if(!event.detail.keepDrawerOpen) this.closeSubmenuPopover()
  }

  closeSubmenu() {
    this.closeSubmenuPopover()
  }

  private renderIcon() {
    if(this.loading) return html`<span class="button-icon icon-loading" aria-hidden="true"></span>`
    if(this.variant === "qr") return html`
      <span class="button-icon" aria-hidden="true">
        <webwriter-qr-code .value=${this.qrValue} .size=${56}></webwriter-qr-code>
      </span>
    `
    const icon = this.icon || this.action || this.label
    if(this.iconPath) return html`<span class="button-icon shape-preview" aria-hidden="true">
      <svg viewBox="-10 -10 120 120" focusable="false"><path d=${this.iconPath} fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"></path></svg>
    </span>`
    return html`<span class=${`button-icon${this.iconUrl ? " image-icon" : ""}`} aria-hidden="true">
      ${this.hoverIcon ? html`<span class="button-icon-default">${ribbonIcon(icon)}</span>` : ribbonIcon(icon)}
      ${this.hoverIcon ? html`<span class="button-icon-hover">${ribbonIcon(this.hoverIcon)}</span>` : nothing}
      ${this.iconUrl ? html`<img
        src=${this.iconUrl}
        alt=""
        draggable="false"
        @error=${(event: Event) => {
          const image = event.currentTarget as HTMLImageElement
          image.parentElement?.classList.remove("image-icon")
          image.remove()
        }}
      />` : ""}
    </span>`
  }

  private showDetails = () => {
    if(!this.details) return
    const rect = this.getBoundingClientRect()
    const viewportWidth = Math.max(1, window.innerWidth)
    const width = Math.min(272, Math.max(1, viewportWidth - 16))
    const margin = 8
    const gap = 6
    const buttonRight = Number.isFinite(rect.right) ? rect.right : rect.left + rect.width
    const leftPosition = rect.left - width - gap
    const rightPosition = buttonRight + gap
    const leftSpace = rect.left - margin - gap
    const rightSpace = viewportWidth - buttonRight - margin - gap
    const fitsLeft = leftPosition >= margin
    const fitsRight = rightPosition + width <= viewportWidth - margin
    let left = leftPosition
    if(!fitsLeft && fitsRight) left = rightPosition
    else if(!fitsLeft && !fitsRight && leftSpace < rightSpace) {
      left = rightPosition
    }
    const top = Math.max(8, rect.top)
    this.detailsPosition = {left, top}
    this.detailsOpen = true
    void this.updateComplete.then(() => {
      this.showPopoverElement(this.renderRoot.querySelector<HTMLElement>(".details"))
    })
  }

  private hideDetails = () => {
    this.hidePopoverElement(this.renderRoot.querySelector<HTMLElement>(".details"))
    this.detailsOpen = false
  }

  private get hasDropdown() {
    return this.submenu.length > 0 || Boolean(this.submenuGroups?.length) || this.dropdown !== null
  }

  render() {
    const hasDropdown = this.hasDropdown
    const dragAction = this.action || this.label
    const dragTag = this.variant === "insertion" || dragAction === "Formula" ? ribbonElementTag(this.label, dragAction) : null
    const dragPackageInsertion = this.variant === "package" && ribbonInsertionAction(dragAction)
    const shapeGallery = this.submenu.some(item => typeof item !== "string" && item.category)
    const title = `${this.label}${this.selectionCount > 0 ? ` +${this.selectionCount}`: ""}${this.shortcut ? ` (${this.shortcut})`: ""}`
    return html`
      <div class=${`button-row${hasDropdown || this.openDrawer ? " has-submenu" : ""}${this.corner ? " has-corner" : ""}${this.iconAction ? " has-icon-action" : ""}`} @mouseenter=${this.showDetails} @mouseleave=${this.hideDetails}>
        ${this.iconAction ? html`
          <button
            class="icon-action-trigger"
            type="button"
            aria-label=${this.iconActionLabel || this.iconAction}
            title=${this.iconActionLabel || this.iconAction}
            ?disabled=${this.disabled}
            @mouseenter=${() => this.dispatchIconHover(true)}
            @mouseleave=${() => this.dispatchIconHover(false)}
            @focus=${() => this.dispatchIconHover(true)}
            @blur=${() => this.dispatchIconHover(false)}
            @click=${this.dispatchIconAction}
          >${this.renderIcon()}</button>
        ` : nothing}
        <button
          class="main-button"
          type="button"
          draggable=${String(Boolean(dragTag || dragPackageInsertion) && !this.disabled)}
          aria-label=${this.label}
          aria-busy=${this.loading ? "true" : nothing}
          aria-pressed=${this.toggle? String(this.active): nothing}
          aria-haspopup=${this.dropdownOnClick && hasDropdown ? this.dropdown !== null ? "dialog" : "menu" : nothing}
          aria-expanded=${this.dropdownOnClick && hasDropdown ? String(this.submenuOpen) : nothing}
          title=${title}
          ?disabled=${this.disabled}
          @mouseenter=${() => this.dispatchInsertionHover(true, "pointer")}
          @mouseleave=${() => this.dispatchInsertionHover(false, "pointer")}
          @focus=${() => { this.showDetails(); this.dispatchInsertionHover(true, "focus") }}
          @blur=${() => { this.hideDetails(); this.dispatchInsertionHover(false, "focus") }}
          @click=${this.handleClick}
          @dragstart=${(event: DragEvent) => {
            this.clearInsertionHover()
            const icon = (event.currentTarget as HTMLElement).querySelector(".button-icon")
            if(dragTag) startElementDrag(event, dragTag, icon)
            else if(dragPackageInsertion) startRibbonInsertionDrag(event, dragAction, icon, this.dragHTML)
          }}
        >
          ${this.iconAction ? nothing : this.renderIcon()}
          <span class="button-label">
            <span class="button-label-text">${this.label}</span>
            ${this.selectionCount > 0 ? html`<small class="selection-count">+${this.selectionCount}</small>`: ""}
          </span>
        </button>
        ${this.corner === "close" ? html`
          <button
            class="submenu-toggle corner-trigger"
            type="button"
            aria-label=${this.cornerLabel || `Manage ${this.label}`}
            title=${this.cornerLabel || `Manage ${this.label}`}
            ?disabled=${this.disabled}
            @click=${this.handleCornerClick}
          >
            <span class="button-icon corner-icon" aria-hidden="true">${ribbonIcon("Reject")}</span>
          </button>
        ` : (hasDropdown || this.openDrawer) && (!this.dropdownOnClick || Boolean(this.iconAction)) ? html`
          <button
            class="submenu-toggle submenu-trigger"
            type="button"
            aria-label=${`Show more ${this.label} options`}
            title=${`Show more ${this.label} options`}
            aria-haspopup=${this.openDrawer ? nothing : this.dropdown !== null ? "dialog" : "menu"}
            aria-expanded=${this.openDrawer ? nothing : this.submenuOpen}
            ?disabled=${this.disabled}
            @click=${this.openDrawer ? this.handleClick : this.toggleSubmenu}
          >
            <span class="submenu-chevron" aria-hidden="true"></span>
          </button>
        ` : ""}
        ${this.notification ? html`
          <span
            class=${`button-notification${this.notificationVisible ? " visible" : ""}`}
            role="status"
            aria-live="polite"
            aria-hidden=${this.notificationVisible ? "false" : "true"}
          >${this.notification}</span>
        ` : nothing}
      </div>
      ${this.corner !== "close" && hasDropdown ? html`
        <ribbon-menu
          variant="button"
          popover="manual"
          .groups=${this.dropdown === null && (!shapeGallery || this.submenuOpen) ? this.submenuGroups ?? [{label: `${this.label} options`, buttons: this.submenu}] : []}
          .customContent=${this.dropdown !== null}
          .label=${`${this.label} options`}
          ?no-scroll=${this.dropdownNoScroll}
          ?compact-content=${this.dropdownCompact}
          ?hidden=${!this.submenuOpen}
          @ribbon-button-click=${this.handleSubmenuClick}
        >
          ${this.dropdown !== null && (!this.lazyDropdown || this.submenuOpen) ? html`
            <div class="button-dropdown-content">${this.dropdown}</div>
          ` : ""}
        </ribbon-menu>
      ` : ""}
      ${this.details ? html`
        <aside
          class="details"
          role="tooltip"
          popover="manual"
          style=${`left:${this.detailsPosition.left}px;top:${this.detailsPosition.top}px`}
        >
          <h3>${this.details.heading}</h3>
          ${this.details.subheading ? html`<div class="details-subheading">${this.details.subheading}</div>` : ""}
          ${this.details.authors?.length ? html`
            <div class="details-authors" title=${this.details.authors.join(", ")}>By ${this.details.authors.join(", ")}</div>
          ` : ""}
          ${this.details.description ? html`<p class="details-description">${this.details.description}</p>` : ""}
          ${this.details.fields?.length ? html`<dl>${this.details.fields.map(field => html`<dt>${field.label}</dt><dd>${field.value}</dd>`)}</dl>` : ""}
          ${this.details.keywords?.length ? html`
            <div class="details-keywords">
              ${this.details.keywords.map(keyword => html`
                <span class="details-keyword">
                  ${keyword.icon ? html`<span class="details-keyword-icon" aria-hidden="true">${ribbonIcon(keyword.icon)}</span>` : ""}
                  <span>${keyword.label}</span>
                </span>
              `)}
            </div>
          ` : ""}
        </aside>
      ` : ""}
    `
  }
}

if(!customElements.get("ribbon-button")) {
  customElements.define("ribbon-button", RibbonButton)
}

declare global {
  interface HTMLElementTagNameMap {
    "ribbon-button": RibbonButton
  }
}
