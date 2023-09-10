import { localized, msg } from "@lit/localize"
import {LitElement, html, css, PropertyValueMap} from "lit"
import {customElement, property, query, queryAssignedElements} from "lit/decorators.js"
import { spreadProps } from "@open-wc/lit-helpers"

import { CommandEntry, CommandEvent } from "../../viewmodel"

const PROTOCOL_ICONS = {
	"file": "folder",
	"http": "cloud",
	"https": "cloud"
}

@localized()
@customElement("ww-head")
export class Head extends LitElement {
  
  @property({type: String, attribute: true})
  filename: string

  @property({type: String, attribute: true})
  url: string

	@property({type: Boolean, attribute: true, reflect: true})
	pendingChanges: boolean = false

  @property({type: Array, attribute: false})
  resourceCommands: CommandEntry[] = []

  @property({type: Array, attribute: false})
  allResourceCommands: CommandEntry[] = []

  get emptyFilename() {
    return msg("Unsaved File")
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: row;
      justify-content: center;
      --icon-size: 24px;
      height: 50px;
      width: 100%;
      align-items: center;
      color: var(--sl-color-gray-700);
      gap: 1ch;
    }

    #filename {
      font-weight: bold;
    }

    #pending-indicator {
      visibility: hidden;
    }

    :host([pendingChanges]) #pending-indicator {
      visibility: visible;
    }

    #resource-commands {
      --icon-size: 20px;
    }

    

  `

  IconicURL = () => {
    let url
    try {
      url = new URL(this.filename)
    }
    catch(e) {
      return null
    }
    const unsaved = url.protocol === "memory:"
		const iconName = (PROTOCOL_ICONS as any)[url.protocol.slice(0, -1)]
		const filename = unsaved? this.emptyFilename: url.pathname.slice(url.pathname.lastIndexOf("/") + 1).split("#")[0]
		return html`
			${!unsaved? html`<sl-icon name=${iconName}></sl-icon>`: null}
			<span>${filename}<span id="pending-indicator">*</span></span>
		`
	}
  
  render() {
    return html`
      <div id="filename">
        ${this.IconicURL()}
      </div>
      <div id="resource-commands">
        ${this.resourceCommands.map(v => html`<ww-button variant="icon" 
          ${spreadProps(v)} @click=${() => this.dispatchEvent(CommandEvent(v.id))}></ww-button>`)}
      </div>
      <slot></slot>
    `
  }
}