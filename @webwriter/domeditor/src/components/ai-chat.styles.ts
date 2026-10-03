import {css} from "lit"

export const aiChatStyles = css`
    .ai-chat-panel [hidden] {display: none !important}

    .ai-prompt-input {
      box-sizing: border-box;
      flex: 1 1 auto;
      width: 100%;
      min-width: 0;
      height: 100%;
      min-height: 0;
      padding: 2px 43px 2px 1.7rem;
      border: 0;
      outline: 0;
      color: #2f3742;
      background: transparent;
      font: inherit;
      font-size: 0.75rem;
      line-height: 16px;
      overflow: hidden;
      resize: none;
      transition: var(--ww-ui-transition,
        min-height 220ms ease,
        padding 220ms ease,
        border-color 220ms ease,
        border-radius 220ms ease);
    }

    .ai-prompt-input::placeholder {
      color: #7d8998;
    }

    .ai-prompt-submit,
    .ai-prompt-expand {
      box-sizing: border-box;
      display: grid;
      position: absolute;
      z-index: 2;
      place-items: center;
      width: 18px;
      height: 18px;
      padding: 3px;
      border: 0;
      border-radius: 50%;
      color: #ffffff;
      background: #3977c7;
      cursor: pointer;
      transition: var(--ww-ui-transition, background-color 120ms ease, color 120ms ease);
    }

    .ai-prompt-submit {
      right: 22px;
      bottom: 1px;
    }

    .ai-prompt-expand {
      right: 2px;
      bottom: 1px;
      padding: 0;
      color: #526b86;
      background: transparent;
    }

    .ai-prompt-submit:hover {
      background: #1e4f87;
    }

    .ai-prompt-expand:hover {
      color: #1e4f87;
      background: #e8eef5;
    }

    .ai-prompt-submit:focus-visible,
    .ai-prompt-expand:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: 2px;
    }

    .ai-prompt-submit:disabled {
      color: #7d8998;
      background: #e0e5eb;
      cursor: default;
    }

    .ai-prompt-submit svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .ai-prompt-expand-chevron {
      display: block;
      width: 0.32rem;
      height: 0.32rem;
      border-right: 1.5px solid currentColor;
      border-bottom: 1.5px solid currentColor;
      transform: translateY(-1px) rotate(45deg);
      transition: var(--ww-ui-transition, transform 120ms ease);
    }

    .ai-prompt-expand[aria-expanded="true"] .ai-prompt-expand-chevron {
      transform: translateY(1px) rotate(225deg);
    }

    .ai-chat-panel {
      box-sizing: border-box;
      display: block;
      position: absolute;
      z-index: 10;
      top: 8px;
      right: 7rem;
      width: min(600px, calc(100vw - 1rem));
      min-width: 24px;
      max-width: 600px;
      height: min(32rem, calc(100vh - 1rem));
      max-height: var(--ribbon-compact-bar-height);
      overflow: hidden;
      border: 1px solid #c8d2df;
      border-radius: 1rem;
      color: #2f3742;
      background: #ffffff;
      box-shadow: 0 0 0 rgb(0 0 0 / 0%);
      container-type: inline-size;
      transition: var(--ww-ui-transition, border-color 120ms ease);
    }

    .ai-chat-panel:hover,
    .ai-chat-panel:focus-within {
      border-color: #3977c7;
    }

    .ai-chat-panel:focus-within {
      box-shadow: 0 0 0 1px #3977c7;
    }

    .ai-chat-panel[hidden] {
      display: none;
    }

    @container (max-width: 124px) {
      .ai-chat-panel:not([data-open]) .ai-chat-composer {
        visibility: hidden;
        opacity: 0;
        pointer-events: none;
      }
    }

    @supports (top: anchor(top)) {
      .ai-chat-panel {
        position-anchor: --ai-bar-slot;
        top: calc(anchor(top) + 8px);
        right: anchor(right);
        left: auto;
        width: anchor-size(width);
      }

    }

    .ai-chat-brand-button {
      box-sizing: border-box;
      display: grid;
      position: absolute;
      z-index: 3;
      top: 1px;
      left: 2px;
      place-items: center;
      width: 20px;
      height: 20px;
      padding: 2px;
      border: 0;
      border-radius: 50%;
      color: #3977c7;
      background: transparent;
      cursor: pointer;
      transition: var(--ww-ui-transition,
        top 220ms ease,
        left 220ms ease,
        width 220ms ease,
        height 220ms ease,
        background-color 120ms ease);
    }

    .ai-chat-brand-button:hover {
      color: #1e4f87;
      background: #e8eef5;
    }

    .ai-chat-brand-button:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: 1px;
    }

    .ai-chat-brand-icon,
    .ai-chat-brand-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .ai-chat-panel[data-open] .ai-chat-brand-button {
      top: 0.55rem;
      left: 0.55rem;
      width: 2rem;
      height: 2rem;
      padding: 0.4rem;
      border: 0;
      border-radius: 50%;
      background: transparent;
    }

    .ai-chat-header {
      box-sizing: border-box;
      display: flex;
      position: absolute;
      top: 0;
      right: 0;
      left: 0;
      align-items: center;
      gap: 0.4rem;
      height: 3.25rem;
      min-width: 0;
      padding: 0.55rem 0.55rem 0.55rem 3rem;
      border-bottom: 1px solid #d8dee6;
      background: #f7f9fb;
      opacity: 0;
      pointer-events: none;
      transform: translateY(-0.5rem);
      transition: var(--ww-ui-transition, opacity 150ms ease, transform 220ms ease);
    }

    .ai-chat-panel[data-open] .ai-chat-header {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }

    .ai-chat-switcher {
      box-sizing: border-box;
      flex: 1 1 auto;
      min-width: 0;
      height: 2rem;
      appearance: none;
      padding: 0 2.35rem 0 0.55rem;
      border: 1px solid #c8d2df;
      border-radius: 0.35rem;
      color: #2f3742;
      background: #ffffff;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='m4 6 4 4 4-4' stroke='%23526b86' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-position: right 0.75rem center;
      background-repeat: no-repeat;
      background-size: 1rem;
      font: inherit;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
    }

    .ai-chat-switcher:focus {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .ai-chat-header-button {
      box-sizing: border-box;
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
      gap: 0.3rem;
      height: 2rem;
      padding: 0 0.55rem;
      border: 1px solid #c8d2df;
      border-radius: 0.35rem;
      color: #526b86;
      background: #ffffff;
      font: inherit;
      font-size: 0.68rem;
      font-weight: 600;
      cursor: pointer;
    }

    .ai-chat-header-button:hover {
      color: #1e4f87;
      border-color: #8eb6df;
      background: #eef4fb;
    }

    .ai-chat-header-button:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: 1px;
    }

    .ai-chat-header-button:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .ai-chat-new-icon,
    .ai-chat-new-icon svg,
    .ai-chat-settings-icon,
    .ai-chat-settings-icon svg {
      display: block;
      width: 0.9rem;
      height: 0.9rem;
    }

    .ai-chat-messages {
      display: flex;
      flex-direction: column;
      position: absolute;
      top: 3.25rem;
      right: 0;
      bottom: 7rem;
      left: 0;
      gap: 0.75rem;
      min-height: 0;
      overflow: auto;
      padding: 1rem;
      scrollbar-width: thin;
      background: #ffffff;
      opacity: 0;
      pointer-events: none;
      transition: var(--ww-ui-transition, opacity 140ms ease 40ms);
    }

    .ai-chat-panel[data-open] .ai-chat-messages {
      opacity: 1;
      pointer-events: auto;
    }

    .ai-chat-empty {
      display: grid;
      flex: 1 1 auto;
      place-items: center;
      min-height: 8rem;
      color: #7d8998;
      font-size: 0.75rem;
      text-align: center;
    }

    .ai-chat-message {
      box-sizing: border-box;
      max-width: 85%;
      padding: 0.55rem 0.7rem;
      border: 1px solid #d8dee6;
      border-radius: 0.65rem;
      color: #2f3742;
      background: #f5f7fa;
      font-size: 0.76rem;
      line-height: 1.35;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .ai-chat-message[data-role="user"] {
      align-self: flex-end;
      color: #163f70;
      border-color: #bdd5ef;
      background: #eaf3fd;
      border-bottom-right-radius: 0.2rem;
    }

    .ai-chat-message[data-role="assistant"] {
      align-self: flex-start;
      border-bottom-left-radius: 0.2rem;
    }

    .ai-chat-message[data-role="event"] {
      align-self: stretch;
      max-width: none;
      color: #4c1d95;
      border-color: #c4b5fd;
      background: #faf5ff;
    }

    .ai-chat-message-role {
      display: block;
      margin-bottom: 0.25rem;
      color: #667085;
      font-size: 0.58rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .ai-message-attachments {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      margin-top: 0.45rem;
    }

    .ai-message-attachment {
      max-width: 12rem;
      overflow: hidden;
      padding: 0.15rem 0.35rem;
      border-radius: 999px;
      color: #526b86;
      background: rgb(255 255 255 / 68%);
      font-size: 0.62rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ai-chat-error,
    .ai-edit-approval {
      align-self: stretch;
      padding: 0.65rem 0.75rem;
      border: 1px solid #fecaca;
      border-radius: 0.55rem;
      color: #991b1b;
      background: #fef2f2;
      font-size: 0.72rem;
      line-height: 1.4;
    }

    .ai-edit-approval {
      border-color: #facc15;
      color: #713f12;
      background: #fefce8;
    }

    .ai-edit-approval strong,
    .ai-edit-approval span {
      display: block;
    }

    .ai-edit-preview {
      margin: 0.5rem 0;
    }

    .ai-edit-preview summary {
      cursor: pointer;
      font-weight: 600;
    }

    .ai-edit-preview pre {
      max-height: 10rem;
      overflow: auto;
      margin: 0.4rem 0 0;
      padding: 0.5rem;
      border-radius: 0.35rem;
      color: #334155;
      background: #ffffff;
      font: 0.65rem/1.4 ui-monospace, SFMono-Regular, Consolas, monospace;
      white-space: pre-wrap;
    }

    .ai-edit-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.4rem;
      margin-top: 0.55rem;
    }

    .ai-edit-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.3rem;
      min-height: 1.8rem;
      padding: 0.25rem 0.55rem;
      border: 1px solid #d6a80d;
      border-radius: 0.35rem;
      color: #713f12;
      background: #ffffff;
      font: inherit;
      font-size: 0.68rem;
      font-weight: 600;
      cursor: pointer;
    }

    .ai-edit-action[data-kind="approve"] {
      border-color: #2563eb;
      color: #ffffff;
      background: #2563eb;
    }

    .ai-edit-action[data-kind="undo"] {
      border-color: #7c3aed;
      color: #ffffff;
      background: #7c3aed;
    }

    .ai-edit-action svg {
      width: 0.85rem;
      height: 0.85rem;
    }

    .ai-edit-action:disabled {
      opacity: 0.55;
      cursor: default;
    }

    .ai-chat-working {
      align-self: flex-start;
      color: #64748b;
      font-size: 0.68rem;
    }

    .ai-prompt-review-actions {
      box-sizing: border-box;
      display: flex;
      position: absolute;
      z-index: 2;
      right: 22px;
      bottom: 1px;
      gap: 2px;
      height: 18px;
    }

    .ai-prompt-review-action {
      box-sizing: border-box;
      display: grid;
      place-items: center;
      width: 18px;
      height: 18px;
      padding: 2px;
      border: 0;
      border-radius: 50%;
      color: #6b21a8;
      background: transparent;
      cursor: pointer;
    }

    .ai-prompt-review-action[data-kind="approve"] {
      color: #ffffff;
      background: #7c3aed;
    }

    .ai-prompt-review-action:hover,
    .ai-prompt-review-action:focus-visible {
      background: #ede9fe;
      outline: none;
    }

    .ai-prompt-review-action[data-kind="approve"]:hover,
    .ai-prompt-review-action[data-kind="approve"]:focus-visible {
      background: #6d28d9;
    }

    .ai-prompt-review-action:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .ai-prompt-review-action svg {
      width: 100%;
      height: 100%;
    }

    .ai-composer-surface[data-review-pending] .ai-prompt-input {
      padding-right: 82px;
      color: #6b21a8;
      background: #faf5ff;
    }

    .ai-chat-composer {
      box-sizing: border-box;
      display: flex;
      position: absolute;
      right: 0;
      bottom: 0;
      left: 0;
      align-items: center;
      height: 22px;
      padding: 0;
      border-top: 0 solid transparent;
      background: #ffffff;
      visibility: visible;
      opacity: 1;
      transition: var(--ww-ui-transition,
        height 220ms ease,
        padding 220ms ease,
        border-color 220ms ease,
        background-color 220ms ease,
        visibility 120ms ease,
        opacity 120ms ease);
    }

    .ai-chat-panel[data-open] .ai-chat-composer {
      align-items: stretch;
      height: 7rem;
      padding: 0.65rem 2.35rem 0.65rem 0.65rem;
      border-top-width: 1px;
      border-top-color: #d8dee6;
      background: #f7f9fb;
    }

    .ai-composer-surface {
      box-sizing: border-box;
      display: flex;
      flex: 1 1 auto;
      position: relative;
      min-width: 0;
      height: 100%;
      overflow: hidden;
      border: 1px solid transparent;
      border-radius: 0.5rem;
      background: transparent;
      transition: var(--ww-ui-transition, border-color 220ms ease, background-color 220ms ease);
    }

    .ai-chat-panel[data-open] .ai-composer-surface {
      border: 1px solid #c8d2df;
      background: #ffffff;
    }

    .ai-chat-panel[data-open] .ai-composer-surface:focus-within {
      border-color: #3977c7;
      box-shadow: 0 0 0 1px #3977c7;
    }

    .ai-chat-panel[data-open] .ai-prompt-input {
      padding: 0.55rem 0.65rem 2.2rem;
      line-height: 1.35;
      overflow: auto;
    }

    .ai-chat-panel[data-open] .ai-composer-surface[data-has-attachments] .ai-prompt-input {
      padding-top: 2.15rem;
    }

    .ai-chat-panel[data-open] .ai-prompt-submit {
      right: 0.35rem;
      bottom: 0.35rem;
      width: 18px;
      height: 18px;
      padding: 3px;
    }

    .ai-chat-panel[data-open] .ai-prompt-expand {
      right: 0.35rem;
      bottom: 0.75rem;
    }

    .ai-composer-toolbar {
      box-sizing: border-box;
      display: flex;
      position: absolute;
      right: 0;
      bottom: 0;
      left: 0;
      align-items: center;
      gap: 0.2rem;
      height: 1.9rem;
      min-width: 0;
      padding: 0.2rem 1.9rem 0.25rem 0.35rem;
      opacity: 0;
      pointer-events: none;
      transform: translateY(0.25rem);
      transition: var(--ww-ui-transition, opacity 140ms ease 40ms, transform 220ms ease);
    }

    .ai-pending-attachments {
      display: flex;
      position: absolute;
      top: 0.25rem;
      right: 0.3rem;
      left: 0.3rem;
      gap: 0.25rem;
      min-width: 0;
      overflow-x: auto;
      scrollbar-width: thin;
      z-index: 1;
    }

    .ai-pending-attachment {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      max-width: 11rem;
      height: 1.45rem;
      padding: 0 0.15rem 0 0.4rem;
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      color: #475569;
      background: #f8fafc;
      font-size: 0.62rem;
    }

    .ai-pending-attachment-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ai-attachment-remove {
      display: grid;
      flex: 0 0 1.1rem;
      place-items: center;
      width: 1.1rem;
      height: 1.1rem;
      margin-left: 0.15rem;
      padding: 0;
      border: 0;
      border-radius: 50%;
      color: #64748b;
      background: transparent;
      font: inherit;
      cursor: pointer;
    }

    .ai-attachment-remove:hover,
    .ai-attachment-remove:focus-visible {
      color: #0f172a;
      background: #e2e8f0;
      outline: none;
    }

    .ai-attachment-input {
      display: none;
    }

    .ai-chat-panel[data-open] .ai-composer-toolbar {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }

    .ai-composer-attachment {
      box-sizing: border-box;
      display: grid;
      flex: 0 0 1.45rem;
      place-items: center;
      width: 1.45rem;
      height: 1.45rem;
      padding: 0.25rem;
      border: 0;
      border-radius: 0.3rem;
      color: #526b86;
      background: transparent;
      cursor: pointer;
    }

    .ai-composer-attachment:hover {
      color: #1e4f87;
      background: #e8eef5;
    }

    .ai-composer-attachment:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: 0;
    }

    .ai-composer-attachment:disabled,
    .ai-composer-select:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .ai-composer-attachment-icon,
    .ai-composer-attachment-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .ai-composer-select {
      box-sizing: border-box;
      flex: 0 1 auto;
      min-width: 0;
      max-width: 8rem;
      height: 1.45rem;
      padding: 0 1.15rem 0 0.3rem;
      border: 0;
      border-radius: 0.3rem;
      color: #526b86;
      background: transparent;
      font: inherit;
      font-size: 0.62rem;
      cursor: pointer;
    }

    .ai-composer-model-control {
      display: flex;
      position: relative;
      flex: 0 1 auto;
      min-width: 0;
      max-width: 8rem;
    }

    .ai-composer-selects {
      display: flex;
      flex: 0 1 auto;
      align-items: center;
      gap: 0.2rem;
      min-width: 0;
      margin-left: auto;
    }

    .ai-composer-model-control .ai-composer-select {
      width: 100%;
      max-width: none;
      appearance: none;
      color: transparent;
    }

    .ai-composer-model-control::after {
      box-sizing: border-box;
      display: block;
      position: absolute;
      top: 50%;
      right: 0.35rem;
      width: 0.32rem;
      height: 0.32rem;
      border-right: 1.5px solid #526b86;
      border-bottom: 1.5px solid #526b86;
      content: "";
      pointer-events: none;
      transform: translateY(-65%) rotate(45deg);
    }

    .ai-composer-model-control .ai-composer-select option {
      color: #526b86;
    }

    .ai-composer-model-label {
      display: flex;
      position: absolute;
      inset: 0 1.15rem 0 0.3rem;
      align-items: center;
      overflow: hidden;
      color: #526b86;
      font: inherit;
      font-size: 0.62rem;
      pointer-events: none;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ai-composer-model-control[data-disabled] .ai-composer-model-label {
      opacity: 0.5;
    }

    .ai-composer-model-control[data-disabled]::after {
      opacity: 0.5;
    }

    .ai-composer-select[data-kind="effort"] {
      max-width: 7rem;
    }

    .ai-composer-select:focus {
      outline: 1px solid #3977c7;
    }

    .ai-stop-icon {
      display: block;
      width: 0.55rem;
      height: 0.55rem;
      border-radius: 0.08rem;
      background: currentColor;
    }

    @media (max-width: 42rem) {
      .ai-chat-header-button-label {
        display: none;
      }

      .ai-chat-header-button {
        width: 2rem;
        padding: 0;
      }
    }

    @media (max-width: 28rem) {
      .ribbon-top {
        gap: 0;
      }

      .ai-chat-header {
        gap: 0.25rem;
      }

      .ai-chat-header-button,
      .ai-chat-panel[data-open] .ai-chat-brand-button {
        width: 1.75rem;
        height: 1.75rem;
      }

      .ai-chat-switcher {
        height: 1.75rem;
      }

      .ai-composer-toolbar {
        gap: 0.1rem;
      }
    }

`
