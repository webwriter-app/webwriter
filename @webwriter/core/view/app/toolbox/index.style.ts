import {css} from "lit"; export default css`

sl-icon {
  width: unset;
  height: unset;
}

:host {
  user-select: none;
  -webkit-user-select: none;
  background: var(--sl-color-gray-100);
  display: flex;
  flex-direction: column;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  user-select: none;
  -webkit-user-select: none;
  font-size: 0.95rem;
  align-items: flex-start;
  padding-left: 9px;
  margin-left: 1px;
  padding-bottom: 1ch;
  overflow: visible;
  scrollbar-width: thin;
  box-sizing: border-box;
  position: relative;
  min-width: 250px;
}

:host > * {
  max-width: 230px;
  grid-column: 1;
}

#name:hover {
  color: var(--sl-color-primary-600);
}

.delete:hover::part(base) {
  color: var(--sl-color-danger-600);
}

sl-icon-button::part(base) {
  padding: var(--sl-spacing-3x-small);
}

.inline-commands {
  font-size: 1.25rem;
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  --icon-size: 20px;
}

:host(:not([advancedinline])) .inline-commands.advanced {
  display: none;
}

:host(:not([advancedstyling])) .layout-command.advanced {
  display: none;
}

:is(.layout-command, #_comment)[data-active]:not([disabled]) {
  border: 2px solid var(--sl-color-gray-600);
  border-radius: 5px;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  z-index: 100;
  background: white;
  position: relative;
  &::after {
    content: "";
    display: block;
    position: absolute;
    width: 100%;
    height: 4px;
    left: -2px;
    bottom: -4px;
    background: white;
    z-index: 1000;
    border-left: inherit;
    border-right: inherit;
  }
}

.inline-commands:not(.more-inline-commands).applied {
  background: var(--sl-color-primary-200) !important;
  border-radius: 4px;
}

.more-inline-commands {
  color: var(--sl-color-gray-700);
}

:host(:not([advancedinline])) .more-inline-commands.applied {
  background: var(--sl-color-primary-200) !important;
  border-radius: 4px;
}

.color sl-button::part(base) {
  padding-bottom: 0;
}

.color {
  display: flex;
  flex-direction: column;
  font-size: 0px;
}

.color:hover sl-color-picker::part(trigger)::before, .color:hover sl-color-picker::part(trigger) {
  height: 12px;
  border-bottom: none;
} 

.color sl-color-picker::part(trigger) {
  font-size: 0px;
  height: 6px;
  width: 20px;
  background: transparent;
}

.color sl-color-picker::part(base) {
  background: var(--sl-color-gray-300);
}

.color sl-color-picker::part(trigger)::before {
  border-radius: 2px;
  border: none;
  width: 20x;
  box-shadow: none;
}

:is(.inline-commands, .block-command):not(.color) sl-color-picker {
  display: none;
}

div[part=inline-commandss] {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 3px;
}

.inline-commands:not(.applied) .field {
  display: none;
}

.field, .field::part(base), .field::part(input) {
  height: 25px;
  font-size: 0.65rem;
}

.field::part(input) {
  padding: 1ch;
}

.block-toolbox {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
}

.block-header {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  gap: 1ch;
  box-sizing: border-box;
  height: 2rem;
  border-bottom: 2px solid var(--sl-color-gray-600);
  color: var(--sl-color-gray-800);
  align-self: stretch;
  padding-right: 5px;
  --icon-size: 24px;
  font-size: 1.125rem;
  padding-bottom: 5px;
}

.container-picker-select sl-option::part(checked-icon) {
  display: none;
}

.container-picker-select sl-option::part(base) {
  padding: 0;
}

.container-picker-select sl-option::part(label) {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  padding: 0.25rem;
  gap: 1rem;
}

.container-picker:has(.container-picker-select[open]) {
  background-color: white;
  transition: background-color 0.1s;
  box-shadow: var(--sl-shadow-medium);
  border: 1px solid var(--sl-color-neutral-800);
  border-radius: var(--sl-border-radius-small);
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.container-picker-select:not([open]) {
  background: white;
  box-shadow: var(--sl-shadow-medium);
  border: 1px solid var(--sl-color-neutral-800);
  border-radius: var(--sl-border-radius-small);
}

.container-picker-select::part(combobox) {
  border: 1px solid transparent;
  box-shadow: unset;
  min-height: unset;
  height: 32px;
  width: 32px;
  padding: 4px;
  --icon-size: 24px;
}

.container-picker #name {
  padding: 0.25rem;
  padding-right: 1rem;
  flex-grow: 1;
}

.container-picker:has(.container-picker-select[open]) #name {
  margin-left: 0.75px;
}

.container-picker-select::part(listbox) {
  min-width: 300px;
  padding: 0;
  width: max-content;
  border: 1px solid var(--sl-color-neutral-800);
  border-top-left-radius: 0;
  border-top-right-radius: 0;
  margin-left: -1px;
  margin-top: 1px;
}

.container-picker-select::part(display-input) {
  display: none;
}


div[part=inline-commands] {
  display: flex;
  justify-content: space-between;
}

div[part=block-commands] {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
  grid-auto-rows: 1fr;
  margin-top: 2px;
  gap: 4px;
}

div[part=block-commands] #name {
  margin-right: auto;
}

.widget-name {
  text-decoration: solid underline var(--sl-color-primary-400) 2px;
  cursor: pointer;
}

.block-command {
  border: 2px solid transparent;
}

.block-command.applied {
  background: var(--sl-color-primary-200);
  border-radius: 4px;
}

.block-command ww-button::part(icon) {
  width: 24px;
  height: 24px;
  --icon-size: 24px;
}

.block-command ww-button {
  width: 100%;
  height: 100%;
}

.block-command ww-button::part(base) {
  padding: 0;
}

.block-option:not([data-secondary])::part(base) {
  height: 3rem;
}

.block-option:not([data-secondary]) > sl-icon {
  --icon-size: 28px;
}

.block-option[data-secondary] > sl-icon {
  --icon-size: 20px;
}


.block-option[data-secondary]::part(label) {
  padding: 0.5rem;
}

.block-option[data-secondary] span {
  display: none;
}

.secondary-options {
  margin-left: auto;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
}

.block-option[aria-selected=true] .block-option[aria-selected=false]:not(:hover)::part(label) {
  color: white;
}

.block-option[data-secondary] .secondary-options {
  display: none;
}

.block-option[data-secondary]::part(base):hover {
  background: var(--sl-color-gray-200);
}

.divider {
  display: none;
  width: calc(100% - 10px);
  border-bottom: 1px solid var(--sl-color-gray-600);
  border-left: 0;
  border-right: 0;
  margin-top: 10px;
  margin-bottom: 9px;
  margin-left: 5px;
  margin-right: 5px;
}

.pickers-popup::part(popup) {
  z-index: 10;
  border: 2px solid var(--sl-color-gray-600);
  padding: 10px;
  padding-right: 5px;
  padding-top: 0;
  border-radius: 5px;
  background: white;
  overflow-y: auto;
  scrollbar-width: thin;
  width: 230px;
  box-sizing: border-box;
  margin-top: -2px;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 230px;
  overflow-x: clip;
  overflow-y: scroll;
}

.pickers-popup > h3 {
  display: flex;
  flex-direction: row;
  align-items: center;
  color: var(--sl-color-gray-600);
  margin: 0;
  margin-left: -10px;
  padding: 10px 0;
  padding-left: 10px;
  position: sticky;
  top: 0;
  left: 0;
  z-index: 10;
  background: white;

  & > sl-icon {
    margin-right: 1ch;
  }

  & > span {
    font-size: 0.875rem;
  }

  & > sl-icon-button {
    margin-left: auto;
  }
}

.picker#blockBorder, .picker#blockTextAlign {
  grid-column: span 2;
}

.picker {
  border: 1px solid var(--sl-color-gray-800);
  padding: 4px;
  border-radius: var(--sl-border-radius-small);
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
}

.picker > * {
  --sl-input-focus-ring-color: transparent;
}

.picker:focus-within {
  outline: var(--sl-focus-ring);
  outline-color: var(--sl-input-focus-ring-color);
}

.picker:focus-within .picker-icon {
  color: var(--sl-color-primary-700);
}

.picker-icon {
  position: absolute;
  top: -15px;
  left: 5px;
  --icon-size: 20px;
  width: 20px;
  height: 20px;
  background: var(--sl-color-gray-100);
  color: var(--sl-color-primary-600);
}

.inline-toolbox {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
  grid-template-rows: min-content min-content min-content;
  position: relative;
  gap: 4px;
  grid-column: 1;
}

.inline-toolbox ww-fontpicker {
  grid-column: span 4;
  grid-row: span 2;
  order: 0;
}


.inline-toolbox .inline-commands.color {
  order: 0;
  height: 32px;
  width: min-content;
  overflow: visible;
  justify-content: flex-start;
  flex-direction: column-reverse;
  justify-self: center;
}

.inline-toolbox .inline-field-group {
  grid-column: span 6;
  order: 3;
  color: var(--sl-color-primary-600);
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.5ch;
  margin-top: 0.5ch;

  & ww-button::part(base) {
    padding: 0;
  }
}

.inline-toolbox .inline-field-group sl-input {
  flex-grow: 1;
}

.inline-toolbox .inline-field-group sl-input::part(base):not(:active):not(:focus-within) {
  background: none;
}

.inline-toolbox .inline-commands {
  order: 2;
  justify-content: center;
}

.block-options {
  display: flex;
  flex-direction: column;
}

ww-fontpicker[inert], .inline-commands.color[inert] {
  opacity: 0.5;
}

#element-breadcrumb::part(base) {
  border-bottom: 2px solid var(--sl-color-gray-600);
  min-height: 45px;
  width: 100%;
}

#element-breadcrumb sl-tree {
  width: 100%;
}

#element-breadcrumb sl-tree-item {
  --indent-size: var(--sl-spacing-small);
}

#element-breadcrumb sl-tree-item[data-selected] > sl-breadcrumb-item > ww-button::part(label) {
  text-decoration: 2px underline var(--sl-color-primary-400);
}

#element-breadcrumb sl-tree-item::part(expand-button) {
  padding: 0;
}

#element-breadcrumb sl-tree-item::part(item--selected) {
  border-color: transparent;
}

#element-breadcrumb sl-tree-item::part(label) {
  width: 100%;
  flex-wrap: wrap;
}

#element-breadcrumb sl-breadcrumb-item ww-button::part(base)
{
  display: flex;
  flex-direction: row;
  align-items: center;
}

#element-breadcrumb sl-breadcrumb-item::part(label)
{
  display: flex;
  flex-direction: row;
  align-items: center;
  color: inherit;
}

#element-breadcrumb sl-breadcrumb-item:last-of-type ww-button::part(base) {
  gap: 0.5ch;
}

#element-breadcrumb sl-breadcrumb-item::part(separator) {
  margin: -4px;
  display: inline flex;
}

#element-breadcrumb .separator-button {
  transform: rotate(-12.5deg);
}

#element-breadcrumb ww-button::part(base) {
  padding: 0;
}

.children-dropdown[data-no-siblings] .dropdown-trigger {
  visibility: hidden;
}

.media-toolbox {
  width: 100%;

  & .switches {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-auto-rows: 1fr;
    gap: 4px;
    & sl-switch {
      font-size: smaller;
    }
  }
  [data-hidden] {
    display: none;
  }

  & .capture-pane {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    margin-top: 2px;
    margin-bottom: 4px;
    gap: 2px;

    & > * {
      flex-grow: 1;
    }
  }
}

.details-toolbox {
  & sl-switch {
    font-size: smaller;
  }
}

.math-toolbox {
  & sl-input::part(input) {
    font-family: monospace;
  }
  & sl-input::part(input)::placeholder {
    color: var(--sl-color-gray-400);
  }
}

.heading-toolbox, .paragraph-toolbox, .list-toolbox {
  width: 100%;

  & sl-radio-group::part(button-group), & sl-radio-group::part(button-group__base) {
    width: 100%;
  }

  & sl-radio-button {
    flex-grow: 1;

    &::part(label) {
      padding: 0;
      width: 18px;
      height: 18px;
      margin: auto auto;
    }
  }
}

.dropdown-trigger {
  width: 18px;
  margin-left: 2px;
}

.dropdown-trigger::part(icon) {
  width: 16px;
  height: 16px;
}

.children-dropdown::part(trigger) {
  margin-bottom: -5px;
}

.children-dropdown[data-empty] {
  display: none;
}

.children-dropdown-menu {
  // background: var(--sl-color-gray-100);
  padding: 2px 1ch;
  font-size: var(--sl-button-font-size-medium);
  color: var(--sl-color-gray-700);

  & sl-menu-item::part(checked-icon) {
    display: none;
  }

  & sl-menu-item::part(submenu-icon) {
    display: none;
  }

  & sl-menu-item::part(label) {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5ch;
    font-size: 0.9rem;
    font-family: var(--sl-font-sans);
    font-weight: 500;
  }

  & sl-menu-item sl-icon {
    width: 20px;
  }
}

.embeddings-explainer {
  
  padding-bottom: 1em;

  & .embeddings-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-auto-rows: 1fr;
    gap: 0.25rem;

    & > * {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 1ch;
      pointer-events: all;
      color: var(--sl-color-blue-200);
    }
  }
}

.context-toolbox {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

#comment-toolbox {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.5ch;
  overflow-y: auto;
  scrollbar-width: thin;
  padding: 4px;
  box-sizing: border-box;

  --sl-input-focus-ring-color: hsla(50, 100%, 50%, 30%);
  --sl-input-border-color-focus: hsla(50, 100%, 50%, 100%);

  & sl-textarea::part(form-control-label) {
    display: flex;
    align-items: center;
    width: 100%;
    justify-content: space-between;
  }

  & .comment:not(:focus-within):not(:hover) ww-button {
    display: none;
  }

  & .comment-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 0.5ch;
    font-size: 0.7rem;
    color: var(--sl-color-gray-600);
    position: relative;

    & ww-button {
      position: absolute;
      right: 0;
      top: 100%;
      margin-top: 8px;
      z-index: 10;
    }

    & ww-button::part(icon) {
      font-size: 0.5rem;
      width: 16px;
      height: 16px;
    }
  }

  & .comment-add {
    margin-left: 2ch;
  }

  & sl-textarea::part(textarea) {
    font-size: 0.75rem;
  }

  & sl-textarea:not([data-first]) {
    margin-left: 2ch;
  }
}

.table-toolbox {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
  grid-template-rows: 1fr;
  border: 2px solid var(--sl-color-primary-800);
  border-radius: var(--sl-border-radius-medium);
  padding: 2px;
  color: var(--sl-color-primary-800);
  position: relative;
  margin-top: 0.5em;

  & .table-label {
    position: absolute;
    top: -0.8em;
    left: 3px;
    background: #f4f4f5;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    padding: 0 3px;
    gap: 3px;

    & sl-icon {
      width: 1.1em;
      height: 1.1em;
    }
  }
}

.style-picker:not([data-active]) {
  display: none;
}

.pickers-popup:not([data-active]) {
  display: none;
}

.inline-toolbox:not([data-active]) {
  display: none;
}

#close-button {
  position: absolute;
  right: 0;
  top: 0;
  &::part(base) {
    padding: var(--sl-spacing-small);
  }
}

#emoji-trigger {
  border: 2px solid transparent;
}

#emoji-trigger[data-active] {
  background: var(--sl-color-primary-200);
  border-radius: 4px;
  border: 2px solid var(--sl-color-gray-800);
}
    
:host(.intro-target) * {
  animation: blink-color 1.5s linear infinite;
}

@keyframes blink-color {
  50% {
    color: var(--sl-color-primary-600);
  }
}

.test-list {
    display: flex;
    flex-direction: column;
    gap: 1ch;
    height: 100%;

    & .test-header {
        align-self: flex-start;
        display: flex;
        flex-direction: column;
        gap: 1ch;
        background: white;
        border: 1px solid var(--sl-color-gray-300);
        border-radius: 5px;
        padding: 10px;

        & sl-select::part(combobox) {
            padding-right: var(--sl-spacing-2x-small);
        }
    }

    & .test-actions {
        display: flex;
        align-items: center;
        align-self: flex-start;
        gap: 1ch;

        & sl-button::part(label) {
            display: flex;
            align-items: center;
            gap: 0.5ch;
            padding: 0 var(--sl-spacing-x-small);
            padding-left: var(--sl-spacing-2x-small);
        }
    }

    & sl-tree {
        --indent-size: var(--sl-spacing-small);
        height: 100%;
        overflow-y: auto;
        scrollbar-width: thin;
        width: 100%;
        padding-right: 5px;
    }

    & sl-tree-item::part(label) {
        display: flex;
        align-items: center;
        gap: 0.5ch;
    }

    & sl-tree-item::part(item) {
        border-inline-start: none;
        cursor: default;
    }

    & sl-tree-item.test-root::part(label) {
        font-weight: bold;
    }

    & sl-tree-item:not(.test-root)::part(label) {
        font-size: var(--sl-font-size-small);
    }

    & sl-tree-item:not(.test-root):not(:has(sl-tree-item))::part(label) {
        font-size: var(--sl-font-size-x-small);
    }

    & sl-tree-item:is(.result[data-passed], :has(.result[data-passed]))::part(label) {
        color: var(--sl-color-success-700);
    }

    & sl-tree-item:is(.result:not([data-passed]), :has(.result:not([data-passed])))::part(label) {
        color: var(--sl-color-danger-700);
    }

    & sl-tree-item.result::part(expand-button) {
        width: 0px;
    }

    & .test-passed {
        width: 1.25rem;
        height: 1.25rem;
        font-size: 1.25rem;
        min-width: 1.25rem;
    }
}

:host([testmode]) > * {
  max-width: 460px;
}
`