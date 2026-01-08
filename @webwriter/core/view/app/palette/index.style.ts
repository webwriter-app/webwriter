import {css} from "lit"; export default css`

:host {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  grid-auto-rows: 40px;
  max-width: 500px;
  margin-left: auto;
  padding-bottom: 5px;
  gap: 4px;
  grid-auto-flow: row dense;
  max-height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  scrollbar-width: thin;
  scrollbar-gutter: stable;
  box-sizing: border-box;
}

:host([data-no-scrollbar-gutter]) {
  padding-right: 11px;
}

.inline-commands-wrapper {
  display: contents;
}

.package-card {

  &.local {
    font-style: italic;
  }

  &::part(base) {
    --padding: 10px;
    min-width: 180px;
    height: 100%;
    position: relative;
    display: block;
  }

  &::part(body) {
    height: 100%;
    overflow-y: hidden;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  & .title {
    display: flex;
    gap: 0.5ch;
    flex-direction: row;
    align-items: center;
    font-size: 0.9rem;
    height: 2ch;
    user-select: none;
    width: 100%;
    height: 100%;
    padding: 5px;
    box-sizing: border-box;
    & span {
      overflow: hidden;
      text-overflow: ellipsis;
      /*text-wrap: nowrap;*/
      width: calc(100%);
      display: block;
      box-sizing: border-box;
    }

    & .package-icon {
      font-size: 1.25rem;
      width: 24px;
      height: 24px;
      filter: grayscale(1);
    }
  }

  &:hover {
    cursor: pointer;
    z-index: 100000;
  }

  &.error .title {
    color: var(--sl-color-danger-600);
  }

  & .error-button {
    color: var(--sl-color-danger-800);

    &:hover {
      color: var(--sl-color-danger-600);
    }
  } 

  &.error sl-tooltip {
    --max-width: 500px;
  }

  &:not(.error) .error-button {
    display: none;
  }

  & sl-progress-bar {
    width: 100%;
    --height: 2px;
    position: absolute;
    bottom: 0;
    left: 0;
  }

  & .package-tooltip {
    --show-delay: 1000;
    --max-width: 400px;
    word-wrap: break-word;
  }

  & .package-tooltip::part(base__arrow) {
    color: var(--sl-color-gray-950);
    background: var(--sl-color-gray-950);
  }

  & .package-tooltip::part(body) {
    background: rgba(241, 241, 241, 0.95);
    border: 2px solid var(--sl-color-gray-400);
    color: var(--sl-color-gray-950);
    z-index: 100000;
  }

  & .package-tooltip > [slot=content] {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
}

.inline-card {
  order: 2;
  &::part(base) {
    --padding: 10px;
    min-width: 100%;
    min-height: 100%;
    box-sizing: border-box;
  }

  & .title {
    justify-content: center;
  }
}

.block-card, .snippet-card {
  order: 1;
  grid-column: span 6;

  &::part(body) {
    justify-content: flex-start;
    position: relative;
  }

  &:not(.installed):not(.snippet-card):not(:hover) {
    color: var(--sl-color-gray-400);
    &::part(base) {
      background: var(--sl-color-gray-50);
      box-shadow: none;
    }
    & .package-icon {
      opacity: 0.5;
    }
  }

  &:is(.installed, .snippet-card):not(.error) .title:hover {
    color: var(--sl-color-primary-600);

    & .package-icon {
      filter: grayscale(1) invert(33%) sepia(98%) saturate(869%) hue-rotate(169deg) brightness(101%) contrast(102%);
    }
  }

  &:not(.installed):not(.error):not(.snippet-card):hover {
    color: var(--sl-color-success-700);

    & .package-icon {
      filter: grayscale(1) invert(34%) sepia(12%) saturate(4549%) hue-rotate(99deg) brightness(101%) contrast(84%);
    }
  }

  &:not(.outdated) .update {
    display: none;
  }

  &:is(.installed, :hover) .manage-controls {
    background: rgba(255, 255, 255, 0.85);
  }

  & .manage-controls {
    position: absolute;
    right: 0;
    top: 0;
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    align-items: stretch;
    height: 100%;
    margin-right: 5px;
  }

  & .manage::part(icon) {
    font-size: 20px;
    padding: 2px;
  }

  & .pin::part(base) {
    padding: 0;
  }

  &.installed .pin::part(base):hover, &.installed:has(.pin:hover) .title {
    color: var(--sl-color-danger-700) !important;

    & .package-icon {
      filter: grayscale(1) invert(11%) sepia(98%) saturate(3672%) hue-rotate(352deg) brightness(107%) contrast(92%);
    }
  }

  &:not(.installed):not(.error):not(.snippet-card) .pin::part(base):hover, &:not(.installed):has(.pin:hover) .title {
    color: var(--sl-color-success-700) !important;
  }

  & .update::part(base):hover, &:is(:has(.update:hover), :has(.unpin:hover)) .title {
    color: var(--sl-color-warning-700) !important;
  }

  &:not(.installed):not(.error):not(.snippet-card):hover :is(.title, .pin::part(base):hover) {
    color: var(--sl-color-success-700) !important;
  }

  &.snippet-card .unpin::part(base):hover {
    color: var(--sl-color-danger-700) !important;
  }

  &.adding sl-progress-bar {
    --indicator-color: var(--sl-color-success-700);
  }

  &.updating sl-progress-bar {
    --indicator-color: var(--sl-color-warning-700);
  }

  &.removing sl-progress-bar {
    --indicator-color: var(--sl-color-danger-700);
  }

  &.found .title {
    font-weight: bold;
  }

  &:not(.local) .watch-button {
    display: none;
  }

  &.error .dropdown-trigger {
    display: none;
  }

  & .dropdown-trigger {
    &::part(base) {
      padding: 0;
      margin-right: 5px;
    }
  }
}

.container-card {
  order: 0;
  grid-row: span 2;

  &:hover {
    color: var(--sl-color-primary-600);
  }

  &::part(base) {
    min-width: unset;
  }

  & .title {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;

    & .container-icon {
      --icon-size: 24px;
      width: 24px;
      height: 24px;
    }

    & .dropdown-trigger {
      position: absolute;
      bottom: 4px;
    }

    & .dropdown-trigger::part(icon) {
      --icon-size: 16px;
      width: 16px;
      height: 16px;
      color: var(--sl-color-gray-600);
    }
  }

  & .sub-command {

    &::part(label) {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 1ch;
      padding-right: 0.5ch;
    }

    & .container-icon {
      --icon-size: 20px;
      width: 20px;
      height: 20px;
    }
  }
}

.snippet-card {
  grid-column: span 6;

  & .snippet-label, & .title {
    justify-content: space-between;
  }

  & .snippet-label::part(base) {
    border: none;
    align-items: center;
    height: calc(var(--sl-input-height-small) - 6px);
    background: none;
    margin-left: -2px;
  }

  & .snippet-label::part(input) {
    padding-left: 2px;
    font-size: 0.9rem;
    color: black;
  }

  & .unpin:not(:hover)::part(base) {
    color: black !important;
  }
}

:host(:not([managing])) {
  & .snippet-label::part(base) {
    cursor: pointer;
    opacity: 1;
    user-select: none;
  }
}

#pin-preview {
  background: none;
  font-weight: bold;
  color: var(--sl-color-primary-700);
  grid-column: span 6;

  & .title {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
  }
}

#package-toolbar {
  background: var(--sl-color-gray-100);
  z-index: 100;
  position: sticky;
  top: 0;
  left: 0;
  grid-row: 1;
  grid-column: span 12;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  align-items: center;
  gap: 1ch;


  & #package-search {

    width: 100%;
    --sl-input-spacing-small: 3px;

    cursor: text;

    &::part(base) {
      background: none;
      padding: 0;
      position: relative;
    }

    &::part(clear-button) {
      font-size: 1.15rem;
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      margin: auto 0;
    }

    &::part(input) {
      width: 100%;
    }

    &:not(:focus-within) #filter-button {
      display: none;
    }
  }

  & #package-button {
    position: relative;
    & #packages-spinner {
      font-size: 1.75rem;
      position: absolute;
      top: 0;
      left: 0;
    }
  }

  & sl-icon {
    cursor: text;
  }
}

.local-package-dialog {
  position: relative;
  & ww-button {
    align-self: center;
  }
}

:host([managing]) #package-button {
  background: var(--sl-color-primary-200);
  border-radius: 100%;
}

:host(:not([managing])) :is(#add-local, .package-card:not(.watching) .watch-button, .manage:not(.watch-button), .block-card:not(.installed)) {
  display: none;
}

:host(:not([managing])) .watch-button {
  margin-right: 2ch;
}

:host(:is([managing], :not(:hover))) .dropdown-trigger {
  visibility: hidden;
}

.container-card:not(.multiple) .dropdown-trigger {
  visibility: hidden,
}

.package-card:not(.multiple) .dropdown-trigger {
  display: none;
}

.other-insertables-menu {
  padding: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  max-height: var(--auto-size-available-height);

  & .applied-theme::part(label) {
    font-weight: bolder;
  }
}

.other-insertables-menu sl-menu-item::part(checked-icon) {
  display: none;
}

.other-insertables-menu sl-menu-item::part(submenu-icon) {
  display: none;
}

.other-insertables-menu sl-menu-item::part(base) {
  font-size: 0.9rem;
}

#semantic-mark-card {
  grid-row: span 1;
}

#clipboard-card {

  grid-row: span 2;

  &::part(base) {
    min-width: unset;
    color: var(--sl-color-gray-600);
  }

  &::part(base):hover {
    color: var(--sl-color-primary-600);
  }
}

#add-local {
  order: 1000001;
  grid-column: span 6;
  user-select: none;

  &:hover {
    color: var(--sl-color-indigo-700);
  }

  &:not(:hover)::part(base) {
    background: none;
    box-shadow: none;
  }

  &[data-disabled] {
    cursor: not-allowed;
    opacity: 0.75;
  }

  &::part(body) {
    display: flex;
    flex-direction: row;
    justify-content: center;
    gap: 1ch;
    font-size: 0.9rem;
    color: var(--sl-color-gray-800);
    padding-left: 0.5ch;
    padding-right: 0.5ch;
  }
}

.package-context-menu {
  z-index: 1000000;
  background: var(--sl-color-gray-100);
}

.error-pane {
  font-size: 0.75rem;
  margin-bottom: 1.5rem;
}

.error-content {
  padding-right: 1ch;
}

@media only screen and (max-width: 1830px) {
  :host {
    grid-template-columns: repeat(6, 1fr);
  }

  #package-toolbar {
    grid-column: span 6;
  }
}

@media only screen and (max-width: 1380px) {
  :host {
            display: flex;
            flex-direction: row;
            align-items: stretch;
            background: #f1f1f1;
    padding-top: 5px;
            height: 60px;
    width: 100%;
            border-top: 1px solid lightgray;
            border-right: 1px solid lightgray;
            box-shadow: 0 -1px 2px hsl(240 3.8% 46.1% / 12%);;
            box-sizing: border-box;
            gap: 0.5rem;
            padding-right: 0;
    max-width: unset;
    overflow-x: scroll;
    scrollbar-width: thin;
    // overflow-y: hidden;
  }

  :host(:not([managing])) .watch-button {
    display: none;
  }

  .package-card {
    flex-shrink: 0;

    &::part(base) {
      min-width: unset;
    }

    & .manage::part(icon) {
      font-size: 16px;
    }

    &:not(:hover) .manage {
      display: none;
    }

    &.error {
      cursor: help;
    }

    &.error .pin {
      display: none;
    }
    
    & .dropdown-trigger {
      transform: rotate(180deg);
    }
  }

  .container-card {
    & .title {
      & sl-icon {
        --icon-size: 16px;
        width: 16px;
        height: 16px;
      }
    }

    & .dropdown-trigger::part(icon) {
      visibility: hidden;
    }
  }
  #add-local {
    margin-right: 1ch;
  }

  #package-toolbar {
    padding-left: 5px;
  }

  #package-search:not(:focus-within)[data-invalid] {
    width: 2.125ch !important;
  }

  :host([managing]) #package-search {
    min-width: 200px;
  }
  
  #package-search:is(:focus-within, :not([data-invalid])) {
    min-width: 200px;
  }
}

@media only screen and (min-width: 1130px) {
  #toggleToolbox {
    display: none;
  }
}

#toggleToolbox[data-active] {
  background: var(--sl-color-primary-200);
  border-radius: 100%;
}

#toggleToolbox {
  width: 30px;
  height: 30px;
  align-self: center;
}

.package-keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.package-keyword {
  border: 1px solid var(--sl-color-gray-950);
  border-radius: 5px;
  background: var(--sl-color-gray-200);
  padding: 0 5px;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.9em;

  & sl-icon {
    font-size: 20px;
  }

  &.package-programme {
    background: var(--sl-color-green-100);
  }

  &.package-field {
    background: white;
  }

  &.package-widget-type {
    background: var(--sl-color-orange-100);
  }

  &.package-online-status {
    background: var(--sl-color-blue-100);
  }

  &.package-locale {
    background: var(--sl-color-red-100);
  }
    
  &.package-ww-ai-tested {
    background: var(--sl-color-blue-100);
  }
}

:host(.intro-target) *, .intro-target {
  animation: blink-color 1.5s linear infinite;
} 

@keyframes blink-color {
  50% {
    color: var(--sl-color-primary-600);
  }
}
`