import { LitElement, html, css } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { localized, msg, str } from "@lit/localize";
import { Combobox } from "#view";
import { emitCustomEvent, idle } from "#utility";

import {marshal, clients, DocumentClient, DocumentMetadata} from "#model"

// @accounts

@localized()
@customElement("ww-save-form")
export class SaveForm extends LitElement {
  static readonly formats = Object.keys(marshal) as (keyof typeof marshal)[];
  static readonly protocols = Object.keys(clients) as (keyof typeof clients)[];

  get client() {
    return this.clients.find(
      ([type, name]) => `${type} ${name}` === this.clientName
    )![2];
  }

  get parserSerializer() {
    return new marshal[this.format]();
  }

  static protocolIcons = {
    file: "device-laptop",
    pocketbase: "cloud",
  };

  static get protocolLabels() {
    return {
      file: msg("This Device"),
      pocketbase: msg("WebWriter Cloud"),
    };
  }

  static get styles() {
    return css`
      form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      sl-select[name="format"] {
        & sl-option::part(base) {
          padding-inline: var(--sl-input-spacing-medium);
        }
        & sl-option::part(checked-icon) {
          display: none;
        }
        &::part(display-input) {
          display: none;
        }
      }

      .location-group {
        &::part(button-group) {
          width: 100%;
        }
      }

      .location {
        flex-grow: 1;
        --sl-color-primary-500: var(--sl-color-neutral-500);
        --sl-color-primary-600: var(--sl-color-neutral-600);
        --sl-color-primary-700: var(--sl-color-neutral-700);

        &::part(button) {
          height: 80px;
          line-height: unset !important;
        }

        &[data-isfile] {
          & .location-icon {
            align-self: center;
            grid-row: span 2;
          }

          & .location-label {
            align-self: center;
            grid-row: span 2;
          }

          & .location-identity {
            display: none;
          }
        }

        &::part(label) {
          display: grid;
          grid-template-columns: max-content 1fr;
          grid-template-rows: 1fr 1fr;
          gap: 0.5rem;
          margin-top: 0.25rem;
        }

        & .location-identity {
          align-self: start;
          grid-row: 2;
          grid-column: span 2;
          font-size: 0.8rem;
        }

        & .location-icon {
          width: 32px;
          height: 32px;
        }
      }

      .tree {
        z-index: 10000;
        position: relative;

        & > header {
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          align-items: center;
        }

        &::part(body) {
          overflow-y: scroll;
          scrollbar-width: thin;
          height: 300px;
          padding: 0;
          padding-top: 0.5rem;
        }

        &::part(footer) {
          padding: 0;
          display: flex;
          flex-direction: row;
          align-items: center;
        }

        & .filename {
          padding-left: 1ch;
          width: 60%;
        }

        & .updated {
          width: 30%;
        }

        & .delete {
          margin-left: auto;
          width: 10%;

          &[disabled] {
            visibility: hidden;
          }
        }

        & .no-documents {
          padding: 1ch;
        }

        & sl-tree-item {
          &::part(label) {
            width: 100%;
          }

          &::part(expand-button) {
            display: none;
          }

          .filename-input-container {
            display: contents;
          }
        }
      }

      .filename-input {
        flex-grow: 1;
        flex-basis: 100%;

        &::part(base) {
          border: none;
          background: transparent;
          margin: 4px;
          padding-left: calc(1ch - 4px);
        }
        &::part(input) {
          padding: 0;
          font-size: 1rem;
        }
      }

      :host([url]) .filename-input {
        width: 0px;
        flex-basis: 0;
        flex-grow: 0;
        height: 0px;
        overflow: hidden;
      }

      .add-document-icon,
      .add-document-icon::part(base) {
        color: var(--sl-color-primary-600);
        margin-right: 1ch;
        display: flex;
        justify-content: center;
        min-width: 32px;
        min-height: 55px;
        flex-grow: 1;
      }

      .header-title {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 0.5ch;
      }

      #filter {
        display: inline-block;
        &::part(combobox) {
          border: none;
          padding: var(--sl-spacing-2x-small);
        }
      }

      footer {
        display: flex;
        justify-content: flex-end;
        gap: 1ch;
      }

      [hidden] {
        display: none;
      }
    `;
  }

  @property({ type: String, attribute: true, reflect: true })
  filename = "Unnamed.html";

  get metadata() {
    return {filename: this.filename, access: this.filterWithDefault}
  }

  @property({ type: String, attribute: true, reflect: true })
  format: keyof typeof marshal = "text/html";

  @property({ type: String, attribute: true, reflect: true })
  mode: "save" | "open" = "save";

  @property({ type: Boolean, attribute: true, reflect: true })
  loading = false;

  @property({ attribute: false })
  clients: [string, string, DocumentClient][];

  @property({ attribute: false })
  clientName: string = "file file";

  static get formatLabels() {
    return {
      "text/html": "HTML",
      "application/zip": "ZIP",
    } as const;
  }

  static get formatIcons() {
    return {
      "text/html": "file-type-html",
      "application/zip": "file-type-zip",
    } as const;
  }

  static get accessIcons() {
    return {
      "public": "world",
      "community": "users-group",
      "private": "lock"
    }
  }

  static get accessLabels() {
    return {
      "public": msg("Public access"),
      "community": msg("Community access"),
      "private": msg("Private access")
    }
  }

  @property({attribute: false})
  documents: {url: URL, metadata?: DocumentMetadata}[] = [];

  @property({ type: Object, attribute: true, reflect: true })
  url: URL | FileSystemFileHandle | undefined;

  @property()
  filter: "private" | "community" | "public"

  @query("ww-combobox[name=filename]")
  combobox: Combobox;

  get filterWithDefault() {
    return this.filter ?? (this.mode === "save"? "community": "private")
  }

  get filteredDocuments() {
    return this.documents.filter(({url, metadata}) => {
      if(this.filterWithDefault === "private" && this.mode === "open") {
        return metadata?.owner === (this.client.account as any)?.model.id
      }
      else if(this.filterWithDefault === "private") {
        return metadata?.owner === (this.client.account as any)?.model.id && metadata?.access === "private"
      }
      else if(this.filterWithDefault === "community" && this.mode === "open") {
        return metadata?.owner !== (this.client.account as any)?.model.id && metadata?.access === "community"
      }
      else if(this.filterWithDefault === "community" && this.mode === "save") {
        return metadata?.owner === (this.client.account as any)?.model.id && metadata?.access === "community"
      }
      else if(this.filterWithDefault === "public" && this.mode === "open") {
        return metadata?.access === "public"
      }
      else if(this.filterWithDefault === "public" && this.mode === "save") {
        return metadata?.owner === (this.client.account as any)?.model.id && metadata?.access === "public"
      }
    })
  }

  Tree() {
    const selectFilter = html`<sl-select id="filter" size="small" value=${this.filterWithDefault} @sl-change=${(e: any) => this.filter = e.target.value}>
      <sl-option value="private">${this.client.account?.id ?? (this.client.account as any).email}</sl-option>
      <sl-option value="community">${msg("Community")}</sl-option>
      <sl-option value="public">${msg("Public")}</sl-option>
    </sl-select>`
    return html`<sl-card class="tree">
      <header slot="header">
        <span class="header-title">${msg("Files of ")} ${selectFilter}</span>
        <ww-button
          variant="icon"
          icon="refresh"
          @click=${this.refreshDocuments}
          ?loading=${this.loadingState === "loading"}
          ?disabled=${this?.loadingState === "loading"}
        ></ww-button>
      </header>
      <sl-tree
        selection="leaf"
        @sl-selection-change=${(e: any) =>
          (this.url = e.detail.selection[0]?.id
            ? new URL(e.detail.selection[0].id)
            : undefined)}
      >
        ${this.filteredDocuments.map(
          ({url, metadata}) => html`<sl-tree-item
            id=${String(url)}
            ?selected=${String(url) === String(this.url)}
            @dblclick=${() => !this.loading && this.handleConfirm()}
          >
            <span class="filename"
              >${url.searchParams
                .get("filename")
                ?.replace(/\_\w{10}\.(\w+)/, ".$1")}</span
            >
            <sl-icon name=${metadata?.access? SaveForm.accessIcons[metadata?.access]: ""} title=${metadata?.access? SaveForm.accessLabels[metadata?.access]: ""}></sl-icon>
            <sl-format-date
              class="updated"
              date=${url.searchParams.get("updated") ?? ""}
              year="numeric"
              month="numeric"
              day="numeric"
              hour="numeric"
              minute="numeric"
            ></sl-format-date>
            <sl-icon-button
              name="trash"
              class="delete"
              ?disabled=${metadata?.owner !== (this.client.account as any)?.model.id}
              @click=${() => this.handleDeleteDocument(url)}
            ></sl-icon-button>
          </sl-tree-item>`
        )}
        ${!this.documents.length
          ? html`<sl-tree-item disabled>
              <span class="no-documents">
                ${this.loadingState === "idle"
                  ? msg("No documents found")
                  : null}
                ${this.loadingState === "error"
                  ? msg("Error connecting")
                  : null}
              </span>
            </sl-tree-item>`
          : null}
      </sl-tree>
      ${this.mode === "save"
        ? html`
            ${this.Filename()}
            <sl-icon-button
              slot="footer"
              name="file-plus"
              class="add-document-icon"
              @click=${() => {
                this.url = undefined;
                this.combobox.focus();
              }}
            ></sl-icon-button>
          `
        : null}
    </sl-card>`;
  }

  Filename() {
    return html`<ww-combobox
      placement="top"
      autofocus
      suggestions
      slot="footer"
      hoist
      name="filename"
      class="filename-input"
      .value=${this.filename}
      @sl-input=${(e: any) => (this.filename = e.target.value)}
    >
      ${SaveForm.formats.map(
        (format) => html`
          <sl-option
            value=${`${this.filename.split(".")[0]}.${
              marshal[format].extensions[0]
            }`}
          >
            <span
              >${`${this.filename.split(".")[0]}.${
                marshal[format].extensions[0]
              }`}</span
            >
            <sl-icon
              slot="suffix"
              name=${(SaveForm.formatIcons as any)[format]}
            ></sl-icon>
          </sl-option>
        `
      )}
    </ww-combobox>`;
  }

  @property({ type: String, attribute: true })
  loadingState: "idle" | "loading" | "error" = "idle";

  async refreshDocuments() {
    if (this.client.searchDocuments) {
      this.loadingState = "loading";
      let clientName = this.clientName;
      try {
        const willBeDocuments = this.client.searchDocuments!({});
        const [documents] = await Promise.all([
          willBeDocuments,
          await idle(300),
        ]);
        this.documents = documents;
        this.loadingState = "idle";
      } catch (err) {
        if (clientName === this.clientName) {
          this.loadingState = "error";
        }
      }
    }
  }

  handleLocationChange = (e: any) => {
    this.loadingState = "idle";
    this.clientName = e.target.value;
    this.url = undefined;
    this.refreshDocuments();
  };

  connectedCallback(): void {
    super.connectedCallback();
    this.refreshDocuments();
  }

  handleDeleteDocument = async (url: URL) => {
    const confirmed = await confirm(
      msg(
        str`${
          url.searchParams.get("filename") ?? "This file"
        } will be deleted permanently. Are you sure?`
      )
    );
    if (confirmed) {
      this.dispatchEvent(
        new CustomEvent("ww-delete-document", {
          bubbles: true,
          composed: true,
          detail: { url },
        })
      );
      setTimeout(() => this.refreshDocuments(), 500);
    }
  };

  handleConfirm = async () => {
    if (
      this.mode === "open" ||
      !this.url ||
      (await confirm(
        msg(
          str`${
            (this.url instanceof FileSystemFileHandle? this.url.name: this.url.searchParams.get("filename")) ?? "This file"
          } will be overwritten. Are you sure?`
        )
      ))
    ) {
      emitCustomEvent(this, "ww-confirm");
    }
  };

  render() {
    return html`<form>
      <sl-radio-group
        label=${msg("Location")}
        class="location-group"
        .value=${this.clientName}
        @sl-change=${this.handleLocationChange}
      >
        ${this.clients
          // .filter((client) => true) //filter out llm clients
          .map(
            ([protocol, name, client]) => html`<sl-radio-button
              variant="neutral"
              size="large"
              class="location"
              .value=${`${protocol} ${name}`}
              ?data-isfile=${protocol === "file"}
            >
              <sl-icon
                name=${(SaveForm.protocolIcons as any)[protocol]}
                class="location-icon"
              ></sl-icon>
              <span class="location-label"
                >${(SaveForm.protocolLabels as any)[protocol]}</span
              >
              <span class="location-identity">${client?.account?.id ?? (client?.account as any)?.email}</span>
            </sl-radio-button>`
          )}
      </sl-radio-group>
      ${this.client.searchDocuments
        ? this.Tree()
        : null}
      <footer>
        <sl-button
          variant="neutral"
          outline
          @click=${() => emitCustomEvent(this, "ww-cancel")}
          >${msg("Cancel")}</sl-button
        >
        <sl-button
          variant="primary"
          ?disabled=${this?.loadingState !== "idle" || this.loading}
          ?loading=${this.loading}
          @click=${this.handleConfirm}
          >${this.mode === "save" ? msg("Save") : msg("Open")}</sl-button
        >
      </footer>
    </form>`;
  }
}
