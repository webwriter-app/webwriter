import { localized, msg } from "@lit/localize";
import { LitElement, html, css, PropertyValueMap } from "lit";
import {
  customElement,
  property,
  query,
  queryAssignedElements,
} from "lit/decorators.js";
import { spreadProps } from "@open-wc/lit-helpers";

import { Command } from "../../viewmodel";

const PROTOCOL_ICONS = {
  file: "folder",
  http: "cloud",
  https: "cloud",
};

@localized()
@customElement("ww-head")
export class Head extends LitElement {
  @property({ type: String, attribute: true })
  filename: string;

  @property({ type: Boolean, attribute: true, reflect: true })
  pendingChanges: boolean = false;

  @property({ type: String, attribute: true, reflect: true })
  ioState: "idle" | "loading" | "saving" = "idle";

  @property({ type: Array, attribute: false })
  documentCommands: Command[] = [];

  get emptyFilename() {
    return msg("Unsaved File");
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
      gap: 0.625ch;
    }

    #filename {
      font-weight: bold;
      user-select: none;
      display: inline flex;
      flex-direction: row;
      align-items: center;
      overflow: hidden;
    }

    #filename :first-child {
      display: flex;
      align-items: center;
      gap: 0.25ch;
      overflow: hidden;
      text-wrap: nowrap;
    }

    #pending-indicator {
      visibility: hidden;
      font-size: 1.5rem;
      flex-shrink: 0;
      display: block;
    }

    :host(:is([pendingChanges], [iostate="loading"], [iostate="saving"]))
      #pending-indicator {
      visibility: visible;
    }

    #pending-indicator sl-spinner {
      font-size: 0.7rem;
      --track-width: 3px;
      --indicator-color: var(--sl-color-gray-800);
      transform: translateY(-50%);
    }

    #document-commands {
      --icon-size: 20px;
      flex-shrink: 0;
    }
  `;

  IconicURL = () => {
    let unsaved = !this.filename;
    let url: string | URL = this.filename;
    try {
      url = new URL(this.filename);
    } catch (e) {}
    let iconName, filename, prettyFilename;
    if (unsaved) {
      filename = this.emptyFilename;
    } else if (url instanceof URL) {
      iconName = (PROTOCOL_ICONS as any)[url.protocol.slice(0, -1)];
      filename =
        url.searchParams.get("filename") ??
        url.pathname.slice(url.pathname.lastIndexOf("/") + 1).split("#")[0];
      prettyFilename = filename.replace(/\_[a-zA-Z0-9]{10}\.[a-zA-Z0-9]+/, "");
    } else {
      filename = url;
    }
    return html`
      ${!unsaved ? html`<sl-icon name=${iconName}></sl-icon>` : null}
      <span id="filename">
        <span title=${filename}>${prettyFilename ?? filename}</span>
        <span
          title=${msg("This explorable has unsaved changes.")}
          id="pending-indicator"
          >${this.ioState === "idle"
            ? "*"
            : html`<sl-spinner></sl-spinner>`}</span
        >
      </span>
    `;
  };

  render() {
    return html`
      ${this.IconicURL()}
      <div id="document-commands">
        ${this.documentCommands.map(
          (v) => html`<ww-button
            variant="icon"
            ${spreadProps(v.toObject())}
            @click=${() => v.run()}
          ></ww-button>`
        )}
      </div>
      <slot></slot>
    `;
  }
}
