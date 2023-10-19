import { LitElement, html, css } from "lit"
import { customElement, property } from "lit/decorators.js"
import { localized, msg } from "@lit/localize"

import { Command } from "../../viewmodel"
import { capitalizeWord, groupBy, sameMembers } from "../../utility"
import { classMap } from "lit/directives/class-map.js"
import { styleMap } from "lit/directives/style-map.js"
import { ifDefined } from "lit/directives/if-defined.js"

@localized()
@customElement("ww-keymap-manager")
export class KeymapManager extends LitElement {

	@property({attribute: false})
	commands: Record<string, Command> = {}

  @property({attribute: false})
	categoryLabels: Record<string, string> = {}

  @property({state: true})
  reassigningCommand: string | null = null

  @property({type: Array, state: true})
  pendingShortcut: string[] = []

  static get keyLabels() {return {
    "command": msg("⌘ Command/Win", {id: "keyCommand"}),
    "meta": msg("⌘ Command/Win", {id: "keyCommand"}),
    "shift": msg("⇧ Shift", {id: "keyShift"}),
    "⇧": msg("⇧ Shift", {id: "keyShift"}),
    "control": msg("^ Control", {id: "keyControl"}),
    "ctrl": msg("^ Control", {id: "keyControl"}),
    "option": msg("⌥ Option/Alt", {id: "keyOption"}),
    "alt": msg("⌥ Option/Alt", {id: "keyOption"}),
    "⌥": msg("⌥ Option/Alt", {id: "keyOption"}),
    "capslock": msg("⇪ Caps Lock"),
    "backspace": msg("⟵", {id: "backspaceKey"}),
    "tab": msg("⭾ Tab", {id: "tabKey"}),
    "clear": msg("⎚ Clear", {id: "clearKey"}),
    "enter": msg("↩ Enter", {id: "enterKey"}),
    "return": msg("↩ Enter", {id: "enterKey"}),
    "escape": msg("⎋ Escape", {id: "escapeKey"}),
    "esc": msg("⎋ Escape", {id: "escapeKey"}),
    "space": msg("Space", {id: "spaceKey"}),
    " ": msg("Space", {id: "spaceKey"}),
    "up": msg("↑ Up", {id: "upKey"}),
    "down": msg("↓ Down", {id: "downKey"}),
    "left": msg("← Left", {id: "leftKey"}),
    "right": msg("→ Right", {id: "rightKey"}),
    "arrowup": msg("↑ Up", {id: "upKey"}),
    "arrowdown": msg("↓ Down", {id: "downKey"}),
    "arrowleft": msg("← Left", {id: "leftKey"}),
    "arrowright": msg("→ Right", {id: "rightKey"}),
    "home": msg("⤒ Home", {id: "homeKey"}),
    "end": msg("⤓ End", {id: "endKey"}),
    "pageup": msg("▲ Pageup", {id: "pageupKey"}),
    "pagedown": msg("▼ Pagedown", {id: "pagedownKey"}),
    "delete": msg("⌦ Delete", {id: "deleteKey"}),
    "del": msg("⌦ Delete", {id: "deleteKey"}),
    "f1": msg("F1", {id: "f1Key"}),
    "f2": msg("F2", {id: "f2Key"}),
    "f3": msg("F3", {id: "f3Key"}),
    "f4": msg("F4", {id: "f4Key"}),
    "f5": msg("F5", {id: "f5Key"}),
    "f6": msg("F6", {id: "f6Key"}),
    "f7": msg("F7", {id: "f7Key"}),
    "f8": msg("F8", {id: "f8Key"}),
    "f9": msg("F9", {id: "f9Key"}),
    "f10": msg("F10", {id: "f10Key"}),
    "f11": msg("F11", {id: "f11Key"}),
    "f12": msg("F12", {id: "f12Key"}),
    "f13": msg("F13", {id: "f13Key"}),
    "f14": msg("F14", {id: "f14Key"}),
    "f15": msg("F15", {id: "f15Key"}),
    "f16": msg("F16", {id: "f16Key"}),
    "f17": msg("F17", {id: "f17Key"}),
    "f18": msg("F18", {id: "f18Key"}),
    "f19": msg("F19", {id: "f19Key"}),
  }}

  static get keyLabelsTextOnly() {
    return Object.fromEntries(Object.entries(this.keyLabels).map(([k, v]) => {
      return [k, v.replaceAll(/[^a-zA-Z0-9 ]/g, "").trim()]
    }))
  }

  static modifiers = ["command", "meta", "shift", "⇧", "control", "ctrl", "option", "alt", "⌥"]

  static sortKeys(a: string, b: string) {
    if(KeymapManager.modifiers.includes(a)) {
      return -1
    }
    else if(KeymapManager.modifiers.includes(b)) {
      return 1
    }
    else {
      return Number(b) - Number(a)
    }
  }

  static get styles() {
    return css`
      kbd {
        border: 0;
        outline: 0;
        vertical-align: baseline;
        background: transparent;
        padding: 0 5px;
        background-color: #f7f7f7;
        border: 1px solid #ccc;
        border-radius: 3px;
        box-shadow: 0 1px 0 rgba(0, 0, 0, 0.2), 0 0 0 2px #fff inset;
        color: #333;
        display: inline-block;
        font-family: monospace, sans-serif;
        font-size: 0.75rem;
        font-weight: 600;
        line-height: 1.25;
        margin: 0 0.1em;
        padding: 0.1em 0.6em;
        text-shadow: 0 1px 0 #fff;
        user-select: none;
      }
      label {
        display: flex;
        flex-direction: column;
        font-size: 0.9rem;
        align-items: flex-start;
        gap: var(--sl-spacing-3x-small);

      }

      .base {
        display: grid;
        grid-template-columns: 4fr 3fr;
        gap: 2ch;
      }

      .key-cmd {
        display: contents;
      }

      .key-input {
        display: block;
        cursor: pointer;
        width: 100%;
        height: 50px;
        overflow-y: auto;
      }

      .key-input:focus, .key-input:active {
        border-color: var(--sl-color-primary-600);
        border-style: solid;
        border-radius: var(--sl-border-radius-small);
        outline: none;
        
      }

      .command-label {
        font-weight: bold;
        display: inline-flex;
        gap: 1ch;
        align-items: center;
      }

      .command-label > sl-icon {
        font-size: 1rem;
      }

      .reassigning .command-label {
        text-decoration: 2px underline var(--sl-color-primary-600);
      }

      .command-description {
        font-size: var(--sl-font-size-small);
        color: var(--sl-color-neutral-500);
      }

      .group-title {
        grid-column: 1 / 3;
        margin-bottom: 0;
      }

      .group-title:first-child {
        margin-top: 0;
      }

      .reassigning-text {
        font-size: var(--sl-font-size-x-small);
        color: var(--sl-color-primary-700);
      }

      .key-controls {
        display: flex;
        flex-direction: row;
        justify-content: stretch;
        align-items: center;
      }
    `
  }

  static normalizeShortcut(shortcut: string | string[], capitalize=false) {
    let normalized = Array.isArray(shortcut)
      ? shortcut
      : shortcut.split(",")[0].split("+")
    normalized = normalized
      .map(key => key.toLowerCase())
      .sort(KeymapManager.sortKeys)
      .map(key => KeymapManager.keyLabels[key as keyof typeof KeymapManager.keyLabels] ?? key)
      .map(key => capitalize? capitalizeWord(key): key)
    return normalized
  }

  static Shortcut(shortcut: string | string[] | undefined) {
    return shortcut
      ? KeymapManager.normalizeShortcut(shortcut, true).map(key => html`<kbd>${key}</kbd>`)
      : undefined
  }

  emitShortcutChange(name: string, shortcut: string) {
    this.dispatchEvent(new CustomEvent("ww-shortcut-change", {composed: true, bubbles: true, detail: {name, shortcut}}))
  }

  emitShortcutReset(name: string) {
    this.dispatchEvent(new CustomEvent("ww-shortcut-reset", {composed: true, bubbles: true, detail: {name}}))
  }
  
  handleKeyInputKeyDown = (e: KeyboardEvent) => {
    if(e.key === "Escape") {
      (e.target as HTMLElement).blur()
    }
    e.preventDefault()
    e.stopPropagation()
    if(this.reassigningCommand) {
      this.pendingShortcut = [...new Set([...this.pendingShortcut, e.key])]
      if(!KeymapManager.modifiers.includes(e.key.toLowerCase())) {
        const pending = KeymapManager.normalizeShortcut(this.pendingShortcut)
        const existing = KeymapManager.normalizeShortcut(this.commands[this.reassigningCommand].shortcut!)
        console.log(pending, existing)
        if(sameMembers(pending, existing)) {
          this.emitShortcutReset(this.reassigningCommand)
        }
        else {
          this.emitShortcutChange(this.reassigningCommand, this.pendingShortcut.join("+"));
        }
        (e.target as HTMLElement).blur()
      }
    }
  }

  handleKeyInputKeyUp = (e: KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    this.pendingShortcut = this.pendingShortcut.filter(key => key !== e.key)
  }

  handleKeyInputFocus = (e: FocusEvent, key: string) => {
    this.reassigningCommand = key
  }

  handleKeyInputBlur = (e: FocusEvent) => {
    this.pendingShortcut = []
    this.reassigningCommand = null
  }

  KeyInput(key: string, cmd: Command) {
    const {reassigningCommand, pendingShortcut} = this
    const isPending = reassigningCommand === key && pendingShortcut.length > 0
    return html`<div ?inert=${cmd.fixedShortcut} class=${classMap({"key-cmd": true, reassigning: key === this.reassigningCommand})}>
      <label>
        <span class="command-label">
          ${cmd.icon? html`<sl-icon name=${cmd.icon}></sl-icon>`: null}
          <span>${cmd.label ?? key}</span>
        </span>
        <span class="command-description">${cmd.description}</span>
      </label>
      <div class="key-controls">
        <sl-icon-button style=${styleMap({visibility: cmd.modified? "visible": "hidden"})} name="arrow-back-up" @click=${() => this.emitShortcutReset(key)}></sl-icon-button>
        <sl-tooltip trigger="manual" ?open=${reassigningCommand === key} content=${msg("Press new key combination...")}>
          <button class="key-input" title=${msg("Reassign shortcut")} @focus=${(e: FocusEvent) => this.handleKeyInputFocus(e, key)} @blur=${this.handleKeyInputBlur}  @keydown=${this.handleKeyInputKeyDown} @keyup=${this.handleKeyInputKeyUp}>
            ${KeymapManager.Shortcut(isPending? this.pendingShortcut: cmd.shortcut)}
          </button>
        </sl-tooltip>
      </div>
    </div>`
  }


  render() {
    const groupedEntries = groupBy(Object.entries(this.commands), ([key, entry]) => entry.category)
    return html`<div class="base" part="base">
      ${Object.keys(groupedEntries).map(key => html`
        <h2 class="group-title">${this.categoryLabels[key] ?? key}</h2>
        ${groupedEntries[key]
          .filter(([key, entry]) => entry.shortcut)
          .map(([key, entry]) => this.KeyInput(key, entry))
        }
      `)}
    </div>`
  }
}