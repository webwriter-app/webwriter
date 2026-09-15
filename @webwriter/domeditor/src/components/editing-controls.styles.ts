import {css} from "lit"

export const editingControlStyles = css`
    :host {
      -webkit-user-select: none;
      user-select: none;
    }

    .math-controls {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      grid-column: 1 / -1;
      grid-row: 1 / -1;
      gap: 0.3rem;
      width: 100%;
      min-width: 0;
      min-height: 0;
      padding: 0.25rem;
    }

    .math-control-row {
      box-sizing: border-box;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(2.45rem, 1fr));
      gap: 0.15rem;
      width: 100%;
      min-width: 0;
    }

    .math-tool-groups {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      min-width: 0;
      min-height: 0;
      padding-top: 0.25rem;
    }

    .math-tool-group {
      min-width: 0;
    }

    .math-tool-group h3 {
      margin: 0 0 0.15rem;
      color: #526b86;
      font-size: 0.62rem;
      font-weight: 650;
      line-height: 1.1;
    }

    .math-tool-grid {
      box-sizing: border-box;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(2.45rem, 1fr));
      gap: 0.15rem;
      min-width: 0;
    }

    .math-button {
      box-sizing: border-box;
      display: grid;
      place-items: center;
      min-width: 0;
      min-height: 1.75rem;
      padding: 0.18rem 0.22rem;
      border: 1px solid transparent;
      border-radius: 0.25rem;
      color: #2f3742;
      background: transparent;
      font: inherit;
      font-size: 0.72rem;
      line-height: 1.05;
      cursor: pointer;
    }

    .math-button:hover {
      border-color: #c8d2df;
      background: #eef4fb;
    }

    .math-button[aria-pressed="true"] {
      border-color: #8eb6df;
      color: #1e5d9d;
      background: #dcecff;
      box-shadow: inset 0 0 0 1px rgb(57 119 199 / 12%);
    }

    .math-button:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .math-button:active {
      color: #1e4f87;
      background: #c4dcf4;
    }

    .math-tool-grid .math-button,
    .math-control-row .math-button {
      min-width: 0;
    }

    input, textarea {
      -webkit-user-select: text;
      user-select: text;
    }

    .history-timeline {
      box-sizing: border-box;
      display: flex;
      grid-row: 1 / 3;
      grid-column: 1 / -1;
      align-self: stretch;
      align-items: stretch;
      gap: 0.35rem;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 0.35rem 0;
      scrollbar-color: #aab6c5 transparent;
      scrollbar-width: thin;
    }

    .history-version-card {
      box-sizing: border-box;
      display: grid;
      flex: 0 0 9rem;
      grid-template-rows: minmax(0, 1fr) 1.35rem;
      height: 100%;
      min-width: 0;
      overflow: hidden;
      border: 1px solid #c8d2df;
      border-radius: 0.45rem;
      color: #2f3742;
      background: #ffffff;
    }

    .history-version-card:hover {
      border-color: #8eb6df;
      background: #eef4fb;
    }

    .history-version-card[data-selected] {
      border-color: #3977c7;
      background: #dcecff;
      box-shadow: inset 0 0 0 1px rgb(57 119 199 / 12%);
    }

    .history-version-card[data-after-current] {
      border-color: #d3d8df;
      color: #7a818b;
      background: #eef0f2;
      filter: grayscale(0.8);
      opacity: 0.55;
    }

    .history-version-card[data-after-current]:hover,
    .history-version-card[data-after-current][data-selected] {
      border-color: #aeb6c1;
      background: #e5e8ec;
      opacity: 0.72;
    }

    .history-checkpoint {
      box-sizing: border-box;
      display: grid;
      grid-template-columns: 1.35rem minmax(0, 1fr);
      grid-template-rows: auto auto 1fr;
      column-gap: 0.35rem;
      align-content: center;
      width: 100%;
      min-width: 0;
      min-height: 0;
      padding: 0.3rem 0.45rem 0.2rem;
      overflow: hidden;
      border: 0;
      color: #2f3742;
      background: transparent;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .history-checkpoint:focus-visible,
    .history-card-restore-button:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -2px;
    }

    .history-checkpoint-avatar {
      box-sizing: border-box;
      display: grid;
      place-items: center;
      border: 2px solid #ffffff;
      border-radius: 50%;
      color: #ffffff;
      background: var(--history-user-color, #64748b);
      box-shadow: 0 1px 3px rgb(0 0 0 / 18%);
      font-weight: 750;
      line-height: 1;
      grid-row: 1 / 3;
      width: 1.35rem;
      height: 1.35rem;
      font-size: 0.46rem;
    }

    .history-checkpoint-label {
      overflow: hidden;
      font-size: 0.64rem;
      font-weight: 700;
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .history-checkpoint-meta {
      overflow: hidden;
      color: #667085;
      font-size: 0.56rem;
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .history-checkpoint-counts {
      display: flex;
      grid-column: 1 / 3;
      align-items: end;
      gap: 0.25rem;
      min-width: 0;
      padding-top: 0.2rem;
      color: #667085;
      font-size: 0.54rem;
      font-weight: 700;
      line-height: 1;
    }

    .history-count[data-kind="added"] { color: #157347; }
    .history-count[data-kind="removed"] { color: #b42336; }
    .history-count[data-kind="modified"] { color: #9a6700; }
    .history-count[data-kind="comments"] { margin-left: auto; color: #526b86; }

    .history-empty,
    .history-loading,
    .history-error {
      display: grid;
      flex: 1 0 100%;
      place-items: center;
      min-width: 12rem;
      padding: 0.5rem;
      color: #667085;
      font-size: 0.68rem;
      text-align: center;
    }

    .history-error {
      color: #b42336;
    }

    .history-card-restore-button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      width: 100%;
      min-height: 0;
      padding: 0.15rem 0.35rem;
      border: 0;
      border-top: 1px solid #d8dee6;
      color: #526b86;
      background: rgb(255 255 255 / 55%);
      font: inherit;
      font-size: 0.56rem;
      font-weight: 700;
      cursor: pointer;
    }

    .history-card-restore-button:hover:not(:disabled) {
      color: #1e4f87;
      background: #ffffff;
    }

    .history-card-restore-button:disabled {
      color: #9aa4b1;
      cursor: default;
      opacity: 0.65;
    }

    .history-card-restore-icon,
    .history-card-restore-icon svg {
      display: block;
      flex: 0 0 0.7rem;
      width: 0.7rem;
      height: 0.7rem;
    }

    .local-packages-drawer {
      --ribbon-drawer-expanded-width: 12rem;
      flex-grow: 0;
    }

    .package-status {
      align-self: center;
      padding: 0.25rem;
      color: #667085;
      font-size: 0.66rem;
      white-space: nowrap;
    }

    .local-package-select {
      box-sizing: border-box;
      flex: 1 1 auto;
      width: auto;
      min-width: 0;
      height: 1.55rem;
      padding: 0 0.25rem;
      border: 1px solid #c8d2df;
      border-radius: 0.25rem;
      color: #2f3742;
      background: #ffffff;
      font: inherit;
      font-size: 0.7rem;
      cursor: pointer;
    }

    .local-package-select:hover {
      border-color: #8eb6df;
      background: #ffffff;
    }

    .local-package-select:focus {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .local-package-select:disabled {
      color: #667085;
      background: #f7f8fa;
      cursor: default;
    }

    .local-package-selection {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 0.25rem;
      width: 100%;
      min-width: 0;
      padding: 0.2rem 0.3rem;
      border: 1px solid #d8dee6;
      border-radius: 0.35rem;
      background: #e8eef5;
    }

    .local-package-selection-icon {
      display: block;
      flex: 0 0 1rem;
      width: 1rem;
      height: 1rem;
      color: #526b86;
    }

    .local-package-selection-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .local-package-actions {
      display: flex;
      align-items: stretch;
      gap: 0.15rem;
      width: 100%;
      min-width: 0;
    }

    .local-package-actions > ribbon-button {
      flex: 1 1 0;
      min-width: 0;
    }

    .develop-field.local-package-auto-reload {
      flex-direction: row;
      align-items: center;
      min-height: 1.45rem;
      padding: 0 0.25rem;
      color: #465465;
      font-size: 0.68rem;
      white-space: nowrap;
    }

    .develop-fields {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
      width: 100%;
      min-width: 0;
      padding: 0.2rem 0 0.35rem;
    }

    .develop-section {
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
      min-width: 0;
      padding-bottom: 0.9rem;
      border-bottom: 1px solid #d8dee6;
    }

    .develop-section:last-child {
      padding-bottom: 0;
      border-bottom: 0;
    }

    .develop-section-title {
      color: #465465;
      font-size: 0.68rem;
      font-weight: 700;
      line-height: 1;
    }

    .develop-section-title-row,
    .develop-export-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.4rem;
    }

    .develop-icon-button {
      box-sizing: border-box;
      display: inline-grid;
      flex: 0 0 1.55rem;
      place-items: center;
      width: 1.55rem;
      height: 1.55rem;
      padding: 0.28rem;
      border: 1px solid transparent;
      border-radius: 0.25rem;
      color: #526b86;
      background: transparent;
      cursor: pointer;
    }

    .develop-icon-button:hover {
      border-color: #c8d2df;
      color: #1e4f87;
      background: #eef4fb;
    }

    .develop-icon-button:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: 1px;
    }

    .develop-icon-button svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .develop-export-list {
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
    }

    .develop-export-card {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      min-width: 0;
      padding: 0.5rem;
      border: 1px solid #d8dee6;
      border-radius: 0.4rem;
      background: rgb(255 255 255 / 55%);
    }

    .develop-export-card-title {
      min-width: 0;
      color: #52606d;
      font-size: 0.61rem;
      font-weight: 650;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .develop-field {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 0.2rem;
      min-width: 0;
      color: #526b86;
      font-size: 0.65rem;
    }

    .develop-field-label {
      font-weight: 600;
      line-height: 0.85rem;
    }

    .develop-field-help {
      color: #748094;
      font-size: 0.58rem;
      line-height: 0.78rem;
    }

    .develop-field input[type="text"],
    .develop-field textarea,
    .develop-field select,
    .develop-contributor-row input {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      min-height: 1.75rem;
      padding: 0.3rem 0.4rem;
      border: 1px solid #c8d2df;
      border-radius: 0.25rem;
      color: #2f3742;
      background: #ffffff;
      font: inherit;
      font-size: 0.65rem;
    }

    .develop-field input[type="text"]:invalid {
      border-color: #c2413a;
      box-shadow: 0 0 0 1px rgb(194 65 58 / 10%);
    }

    .develop-field textarea {
      min-height: 3.6rem;
      line-height: 1.3;
      resize: vertical;
    }

    .develop-field textarea[data-json] {
      min-height: 6.5rem;
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 0.6rem;
      tab-size: 2;
    }

    .develop-field input[type="text"]:focus,
    .develop-field textarea:focus,
    .develop-field select:focus,
    .develop-contributor-row input:focus {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .develop-export-source-row {
      display: flex;
      align-items: center;
      gap: 0.2rem;
    }

    .develop-export-source-row input {
      flex: 1 1 auto;
    }

    .develop-compact-details {
      min-width: 0;
      border: 1px solid #d8dee6;
      border-radius: 0.3rem;
      background: rgb(255 255 255 / 45%);
    }

    .develop-compact-details summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 1.7rem;
      padding: 0 0.4rem;
      color: #526b86;
      font-size: 0.65rem;
      font-weight: 600;
      cursor: pointer;
      list-style: none;
    }

    .develop-compact-details summary::-webkit-details-marker {
      display: none;
    }

    .develop-compact-details summary::after {
      content: "›";
      font-size: 0.9rem;
      transform: rotate(90deg);
      transition: var(--ww-ui-transition, transform 120ms ease);
    }

    .develop-compact-details[open] summary::after {
      transform: rotate(270deg);
    }

    .develop-compact-details .develop-field {
      padding: 0 0.4rem 0.4rem;
    }

    .develop-compact-details textarea {
      min-height: 3rem;
    }

    .develop-contributors {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
    }

    .develop-contributor-row {
      display: flex;
      align-items: center;
      gap: 0.2rem;
    }

    .develop-contributor-row input {
      flex: 1 1 auto;
    }

    .develop-empty {
      align-self: center;
      padding: 0.25rem;
      color: #667085;
      font-size: 0.66rem;
    }

    .comment-editor {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      min-width: 0;
      padding: 0.15rem 0.2rem 0.1rem 0;
      gap: 0.15rem;
      color: #536171;
      font-size: 0.65rem;
    }

    .comment-editor-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .comment-highlight-toggle {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      white-space: nowrap;
    }

    .comment-highlight-toggle input {
      margin: 0;
    }

    .comment-editor textarea {
      box-sizing: border-box;
      flex: 1 1 auto;
      width: 100%;
      min-height: 0;
      resize: none;
      padding: 0.25rem 0.35rem;
      border: 1px solid #b9c3cf;
      border-radius: 0.25rem;
      color: #26313d;
      background: #ffffff;
      font: inherit;
      font-size: 0.7rem;
      line-height: 1.25;
    }

    .comment-editor textarea:focus {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .table-caption-toggle {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.2rem;
      min-width: 0;
      min-height: 1.75rem;
      padding: 0.05rem 0.25rem;
      border: 1px solid transparent;
      border-radius: 0.35rem;
      color: #2f3742;
      font-size: 0.6rem;
      cursor: pointer;
    }

    .table-caption-toggle:hover {
      border-color: #c8d2df;
      background: #eef4fb;
    }

    .table-caption-toggle:has(input:checked) {
      border-color: #8eb6df;
      color: #1e4f87;
      background: #dcecff;
    }

    .table-caption-toggle:has(input:disabled) {
      border-color: transparent;
      color: #9aa4b1;
      background: transparent;
      cursor: default;
      opacity: 0.55;
    }

    .table-caption-toggle > span:last-child {
      display: flex;
      align-items: center;
      gap: 0.15rem;
      white-space: nowrap;
    }

    .table-caption-toggle input {
      width: 0.75rem;
      height: 0.75rem;
      margin: 0;
      accent-color: #3977c7;
    }

    .table-caption-icon {
      display: block;
      width: 1.1rem;
      height: 1.1rem;
    }

    .table-caption-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .table-inline-controls {
      box-sizing: border-box;
      display: grid;
      grid-column: 1 / -1;
      grid-row: 1 / -1;
      align-items: end;
      gap: 0.25rem;
      width: 100%;
      min-width: 0;
      min-height: 0;
      height: 100%;
      color: #2f3742;
      font-size: 0.62rem;
    }

    .table-border-controls {
      grid-template-columns: minmax(4.5rem, 1.4fr) minmax(3.25rem, 0.8fr) 2.5rem minmax(4.75rem, 1fr);
    }

    .table-background-controls {
      grid-template-columns: 2.5rem minmax(5.5rem, 1fr);
    }

    .table-parameter {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 0.08rem;
      min-width: 0;
    }

    .table-parameter > span {
      overflow: hidden;
      color: #526b86;
      font-size: 0.56rem;
      line-height: 0.7rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .table-parameter input,
    .table-parameter select,
    .table-clear-button {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      height: 1.45rem;
      padding: 0 0.25rem;
      border: 1px solid #c8d2df;
      border-radius: 0.2rem;
      color: #2f3742;
      background: #fff;
      font: inherit;
      font-size: 0.62rem;
    }

    .table-parameter input[type="color"] {
      padding: 0.1rem;
    }

    .table-clear-button {
      color: #526b86;
      cursor: pointer;
    }

    .table-parameter input:focus,
    .table-parameter select:focus,
    .table-clear-button:focus-visible {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .table-clear-button:hover {
      border-color: #8eb6df;
      color: #1e5d9d;
      background: #eef4fb;
    }

    .table-parameter input:disabled,
    .table-parameter select:disabled,
    .table-clear-button:disabled {
      color: #9aa4b1;
      background: #edf0f3;
      cursor: default;
    }

    ribbon-drawer[pane] .table-inline-controls {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      height: auto;
    }

    ribbon-drawer[pane] .table-semantic-controls,
    ribbon-drawer[pane] element-attribute-editor {
      grid-column: 1 / -1;
    }

    .table-semantic-controls,
    .table-semantic-section,
    .table-semantic-card {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      width: 100%;
      min-width: 0;
    }

    .table-semantic-section {
      padding-top: 0.35rem;
      border-top: 1px solid #d8e0e9;
    }

    .table-semantic-section:first-child { padding-top: 0; border-top: 0; }

    .table-semantic-heading,
    .table-semantic-card-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.25rem;
      color: #526b86;
      font-size: 0.64rem;
      font-weight: 600;
    }

    .table-semantic-card {
      padding: 0.35rem;
      border: 1px solid #d8e0e9;
      border-radius: 0.25rem;
      background: #f7f9fb;
    }

    .table-semantic-actions,
    .table-semantic-add-grid {
      display: flex;
      gap: 0.15rem;
    }

    .table-semantic-add-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }

    .table-semantic-button {
      box-sizing: border-box;
      min-width: 0;
      min-height: 1.35rem;
      padding: 0.15rem 0.3rem;
      border: 1px solid #c8d2df;
      border-radius: 0.2rem;
      color: #526b86;
      background: #fff;
      font: inherit;
      font-size: 0.58rem;
      cursor: pointer;
    }

    .table-semantic-button.icon { min-width: 1.35rem; padding: 0.1rem 0.2rem; }
    .table-semantic-button:hover:not(:disabled) { color: #243447; background: #e8eef5; }
    .table-semantic-button:focus-visible { outline: 2px solid #3977c7; outline-offset: -1px; }
    .table-semantic-button:disabled { opacity: 0.45; cursor: default; }

    .table-semantic-field {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 0.08rem;
      min-width: 0;
      color: #526b86;
      font-size: 0.56rem;
      line-height: 0.7rem;
    }

    .table-semantic-field input,
    .table-semantic-field select {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      height: 1.55rem;
      padding: 0 0.3rem;
      border: 1px solid #c8d2df;
      border-radius: 0.2rem;
      color: #2f3742;
      background: #fff;
      font: inherit;
      font-size: 0.66rem;
    }

    .table-semantic-field input:focus,
    .table-semantic-field select:focus { border-color: #3977c7; outline: 1px solid #3977c7; }
    .table-semantic-field input:disabled { color: #8b96a4; background: #edf0f3; }

    .table-semantic-note {
      margin: 0;
      color: #6d7d8f;
      font-size: 0.56rem;
      line-height: 0.72rem;
    }

    .graphic-inline-controls {
      box-sizing: border-box;
      grid-column: 1 / -1;
      grid-row: 1 / -1;
      width: 100%;
      min-width: 0;
      min-height: 0;
      height: 100%;
      color: #2f3742;
      font-size: 0.66rem;
    }

    .graphic-inline-controls .graphic-parameter {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: center;
      gap: 0.08rem;
      min-width: 0;
      min-height: 0;
    }

    .graphic-inline-controls .graphic-parameter > span {
      overflow: hidden;
      color: #526b86;
      font-size: 0.56rem;
      line-height: 0.7rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .graphic-inline-controls .graphic-parameter input,
    .graphic-inline-controls .graphic-parameter select,
    .graphic-inline-controls .graphic-parameter textarea {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      height: 1.35rem;
      padding: 0 0.22rem;
      border: 1px solid #c8d2df;
      border-radius: 0.2rem;
      color: #2f3742;
      background: #fff;
      font: inherit;
      font-size: 0.62rem;
    }

    .graphic-inline-controls .graphic-parameter input:focus,
    .graphic-inline-controls .graphic-parameter select:focus,
    .graphic-inline-controls .graphic-parameter textarea:focus {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .graphic-inline-controls .graphic-parameter input:disabled,
    .graphic-inline-controls .graphic-parameter select:disabled,
    .graphic-inline-controls .graphic-parameter textarea:disabled {
      color: #8b96a4;
      background: #edf0f3;
    }

    .graphic-inline-controls .graphic-parameter input[type="color"] {
      padding: 0.1rem;
    }

    .graphic-inline-controls .graphic-parameter input[type="checkbox"] {
      align-self: center;
      width: 1rem;
      height: 1rem;
      margin: 0.15rem 0 0;
      padding: 0;
      accent-color: #3977c7;
    }

    .media-toolbox-controls {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      width: 100%;
      min-width: 0;
    }

    .media-toolbox-controls .media-attribute {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 0.08rem;
      min-width: 0;
      color: #526b86;
      font-size: 0.56rem;
      line-height: 0.7rem;
    }

    .media-toolbox-controls .media-attribute input,
    .media-toolbox-controls .media-attribute select {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      height: 1.55rem;
      padding: 0 0.3rem;
      border: 1px solid #c8d2df;
      border-radius: 0.2rem;
      color: #2f3742;
      background: #fff;
      font: inherit;
      font-size: 0.66rem;
    }

    .media-toolbox-controls .media-attribute input:focus,
    .media-toolbox-controls .media-attribute select:focus {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .media-toolbox-controls .media-attribute-boolean {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      min-height: 1.55rem;
    }

    .media-toolbox-controls .media-attribute-boolean input {
      width: auto;
      height: auto;
      margin: 0;
      accent-color: #3977c7;
    }

    .paragraph-format-switch {
      display: flex;
      grid-column: 1 / -1;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      font-size: 0.75rem;
      cursor: pointer;
    }

    .paragraph-format-switch input {
      appearance: none;
      flex: 0 0 auto;
      width: 2rem;
      height: 1.125rem;
      margin: 0;
      padding: 2px;
      border: 1px solid #94a3b8;
      border-radius: 1rem;
      background: #e2e8f0;
      cursor: pointer;
    }

    .paragraph-format-switch input::before {
      display: block;
      width: 0.75rem;
      height: 0.75rem;
      border-radius: 50%;
      background: #fff;
      content: "";
    }

    .paragraph-format-switch input:checked {
      border-color: #2563eb;
      background: #2563eb;
    }

    .paragraph-format-switch input:checked::before {
      transform: translateX(0.875rem);
    }

    .media-type-switch {
      box-sizing: border-box;
      width: 100%;
      min-height: 1.55rem;
      padding: 0.25rem 0.4rem;
      border: 1px solid #c8d2df;
      border-radius: 0.2rem;
      color: #526b86;
      background: #fff;
      font: inherit;
      font-size: 0.64rem;
      cursor: pointer;
    }

    .media-type-switch:hover {
      color: #243447;
      background: #e8eef5;
    }

    .media-type-switch:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .media-resource-editor {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      padding-top: 0.35rem;
      border-top: 1px solid #d8e0e9;
    }

    .media-resource-heading,
    .media-resource-card-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.25rem;
      color: #526b86;
      font-size: 0.64rem;
      font-weight: 600;
    }

    .media-resource-add,
    .media-resource-action {
      box-sizing: border-box;
      min-height: 1.35rem;
      padding: 0.15rem 0.35rem;
      border: 1px solid #c8d2df;
      border-radius: 0.2rem;
      color: #526b86;
      background: #fff;
      font: inherit;
      font-size: 0.6rem;
      cursor: pointer;
    }

    .media-resource-action {
      min-width: 1.35rem;
      padding: 0.1rem 0.2rem;
    }

    .media-resource-add:hover,
    .media-resource-action:hover:not(:disabled) {
      color: #243447;
      background: #e8eef5;
    }

    .media-resource-add:focus-visible,
    .media-resource-action:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .media-resource-action:disabled {
      opacity: 0.45;
      cursor: default;
    }

    .media-resource-card {
      display: flex;
      flex-direction: column;
      gap: 0.28rem;
      padding: 0.35rem;
      border: 1px solid #d8e0e9;
      border-radius: 0.25rem;
      background: #f7f9fb;
    }

    .media-resource-card-actions {
      display: flex;
      gap: 0.15rem;
    }

    .media-fallback-help {
      margin: -0.15rem 0 0;
      color: #6d7d8f;
      font-size: 0.56rem;
      line-height: 0.72rem;
    }

    .media-toolbox-controls .media-fallback-input {
      box-sizing: border-box;
      width: 100%;
      min-height: 3.5rem;
      resize: vertical;
      padding: 0.3rem;
      border: 1px solid #c8d2df;
      border-radius: 0.2rem;
      color: #2f3742;
      background: #fff;
      font: 0.62rem/0.8rem ui-monospace, SFMono-Regular, Consolas, monospace;
    }

    .media-toolbox-controls .media-fallback-input:focus {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .image-map-draw-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.2rem;
    }

    .image-map-draw {
      box-sizing: border-box;
      min-width: 0;
      min-height: 2.2rem;
      padding: 0.2rem;
      border: 1px solid #c8d2df;
      border-radius: 0.2rem;
      color: #526b86;
      background: #fff;
      font: inherit;
      font-size: 0.58rem;
      line-height: 0.7rem;
      cursor: pointer;
    }

    .image-map-draw:hover {
      color: #243447;
      background: #e8eef5;
    }

    .image-map-draw:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .image-map-note {
      margin: 0;
      color: #6d7d8f;
      font-size: 0.56rem;
      line-height: 0.72rem;
    }

    .graphic-geometry-controls {
      display: grid;
      grid-template-rows: repeat(2, minmax(0, 1fr));
      grid-auto-flow: column;
      grid-auto-columns: minmax(3.25rem, 1fr);
      gap: 0.12rem 0.28rem;
      align-items: stretch;
      padding: 0.08rem 0;
    }

    .graphic-text-controls {
      display: grid;
      grid-template-columns: minmax(6.5rem, 1fr) 4rem;
      grid-template-rows: repeat(2, minmax(0, 1fr));
      gap: 0.12rem 0.35rem;
      padding: 0.08rem 0;
    }

    .graphic-text-controls .graphic-label-parameter {
      grid-row: 1 / 3;
    }

    .graphic-text-controls .graphic-label-parameter textarea {
      flex: 1 1 auto;
      height: auto;
      min-height: 0;
      padding-block: 0.18rem;
      resize: none;
    }

    .graphic-connector-controls {
      display: grid;
      grid-template-columns: minmax(5rem, 1fr) 3rem 3rem;
      gap: 0.3rem;
      align-items: center;
      padding: 0.08rem 0;
    }

    .graphic-connector-controls .graphic-boolean-parameter > span {
      text-align: center;
    }

    .graphic-arrange-controls {
      display: grid;
      grid-template-columns: auto minmax(10rem, 1fr);
      gap: 0.45rem;
      align-items: stretch;
      padding: 0.08rem 0;
    }

    .graphic-arrange-actions {
      display: grid;
      grid-template-columns: repeat(3, auto);
      gap: 0.3rem;
      align-items: center;
      min-width: 0;
    }

    .graphic-arrange-action-group {
      display: grid;
      gap: 0.08rem;
      align-content: center;
    }

    .graphic-align-actions {
      grid-template-columns: repeat(3, 1.75rem);
    }

    .graphic-distribute-actions {
      grid-template-columns: 1.75rem;
    }

    .graphic-order-actions {
      grid-template-columns: repeat(2, 1.75rem);
    }

    .graphic-layers-inline {
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 0.15rem;
      min-width: 0;
      min-height: 0;
      padding-inline-start: 0.4rem;
      border-inline-start: 1px solid #d8dee6;
    }

    .graphic-layer-list {
      display: flex;
      flex-direction: column;
      gap: 0.08rem;
      min-height: 0;
      overflow: auto;
    }

    .graphic-layer-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 1.35rem 1.35rem;
      gap: 0.08rem;
      align-items: center;
      min-height: 1.4rem;
      padding: 0.03rem;
      border: 1px solid transparent;
      border-radius: 0.2rem;
    }

    .graphic-layer-row[data-selected="true"] {
      border-color: #93b8df;
      background: #eef5fc;
    }

    .graphic-layer-select,
    .graphic-layer-action,
    .graphic-layer-order {
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
      align-items: center;
      gap: 0.25rem;
      min-width: 0;
      height: 1.25rem;
      padding: 0 0.2rem;
      font-size: 0.58rem;
      text-align: left;
    }

    .graphic-layer-select span:last-child {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .graphic-layer-icon,
    .graphic-layer-action {
      display: grid;
      place-items: center;
    }

    .graphic-layer-icon {
      flex: 0 0 auto;
      width: 0.75rem;
      height: 0.75rem;
    }

    .graphic-layer-icon svg,
    .graphic-layer-action svg {
      display: block;
      width: 0.75rem;
      height: 0.75rem;
    }

    .graphic-layer-action {
      width: 1.25rem;
      height: 1.25rem;
    }

    .graphic-layer-select:hover,
    .graphic-layer-action:hover,
    .graphic-layer-order:hover {
      color: #1e5d9d;
      background: #dfeefc;
    }

    .graphic-layer-select:focus-visible,
    .graphic-layer-action:focus-visible,
    .graphic-layer-order:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .graphic-layer-select:disabled,
    .graphic-layer-action:disabled,
    .graphic-layer-order:disabled {
      color: #9aa4b1;
      cursor: default;
    }

    .graphic-layer-toolbar {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.12rem;
    }

    .graphic-layer-order {
      min-height: 1.25rem;
      padding: 0.05rem 0.15rem;
      border: 1px solid #c8d2df;
      background: #fff;
      font-size: 0.54rem;
    }

    .button-dropdown-empty {
      align-self: center;
      color: #64748b;
      font-size: 0.58rem;
    }

    ribbon-drawer[pane] .graphic-inline-controls {
      grid-row: auto;
      height: auto;
    }

    ribbon-drawer[pane] .graphic-geometry-controls {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: none;
      grid-auto-flow: row;
      grid-auto-columns: auto;
      grid-auto-rows: minmax(2.25rem, auto);
      gap: 0.2rem 0.35rem;
    }

    ribbon-drawer[pane] .graphic-text-controls {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: none;
      grid-auto-rows: minmax(2.25rem, auto);
      gap: 0.2rem 0.35rem;
    }

    ribbon-drawer[pane] .graphic-text-controls .graphic-label-parameter {
      grid-column: 1 / -1;
      grid-row: auto;
      min-height: 4rem;
    }

    ribbon-drawer[pane] .graphic-connector-controls {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.25rem 0.35rem;
    }

    ribbon-drawer[pane] .graphic-connector-controls .graphic-parameter:first-child {
      grid-column: 1 / -1;
    }

    ribbon-drawer[pane] .graphic-arrange-controls {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.4rem;
    }

    ribbon-drawer[pane] .graphic-arrange-actions {
      justify-content: space-between;
      gap: 0.2rem;
    }

    ribbon-drawer[pane] .graphic-layers-inline {
      min-height: 4.25rem;
      padding-block-start: 0.4rem;
      padding-inline-start: 0;
      border-block-start: 1px solid #d8dee6;
      border-inline-start: 0;
    }
  `
