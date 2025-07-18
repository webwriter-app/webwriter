import "@shoelace-style/shoelace/dist/themes/light.css";
import 'emoji-picker-element';
import { spreadProps } from "@open-wc/lit-helpers";
import { LitElement, html, css } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { localized, msg } from "@lit/localize";
import { SlAlert } from "@shoelace-style/shoelace";
import scopedCustomElementsRegistryString from "@webcomponents/scoped-custom-element-registry/scoped-custom-element-registry.min.js?raw";
import { querySelectorDeep } from "query-selector-shadow-dom"

import { escapeHTML } from "#utility";
import { ViewModelMixin } from "#viewmodel";
import { ExplorableEditor, SaveForm } from "#view";

import appIconString from "../assets/app-icon.svg?raw";
import { ifDefined } from "lit/directives/if-defined.js";
import { cache } from "lit/directives/cache.js";

export const APPICON = `data:image/svg+xml;base64,${btoa(appIconString)}`;

export interface SlAlertAttributes {
  message: string;
  variant?: SlAlert["variant"];
  icon?: string;
  duration?: number;
}

@localized()
@customElement("ww-app")
export class App extends ViewModelMixin(LitElement) {
  async connectedCallback() {
    super.connectedCallback();
    document.addEventListener("dragenter", (e: DragEvent) => {
      e.preventDefault();
    });
    document.addEventListener("dragover", (e: DragEvent) => {
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "none";
      }
      e.preventDefault();
    });
    document.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
    });
  }

  @property({type: String})
  activeHelp: keyof App["helpSequence"] | null = Object.keys(this.helpSequence)[0] as keyof App["helpSequence"]

  get activeHelpSpec() {
    return this.activeHelp? this.helpSequence[this.activeHelp]: undefined
  }

  nextHelp(backwards=false) {
    const i = !this.activeHelp? -1: Object.keys(this.helpSequence).indexOf(this.activeHelp)
    if(!backwards && i + 1 >= Object.keys(this.helpSequence).length) {
      return this.endHelp()
    }
    const oldTargetEl = querySelectorDeep(this.helpSequence[this.activeHelp!].selector, this)
    oldTargetEl!.classList.remove("intro-target")
    this.activeHelp = Object.keys(this.helpSequence)[backwards? i - 1: i + 1] as keyof App["helpSequence"]
    Object.keys(query)
    if(this.helpSequence[this.activeHelp].highlight) {
      const targetEl = querySelectorDeep(this.helpSequence[this.activeHelp].selector, this)
      targetEl?.classList.add("intro-target")
    }
  }

  endHelp() {
    this.activeHelp = null
    Object.values(this.helpSequence).map(({selector}) => querySelectorDeep(selector, this)).forEach(el => el?.classList.remove("intro-target"))
    this.settings.setAndPersist("ui", "hideIntro", true)
  }

  get helpSequence() {return {
    "welcome": {
      selector: "ww-head",
      title: msg("Welcome to WebWriter"),
      description: msg("Want a short, guided tour?"),
      icon: "info-square-rounded",
      highlight: false
    },
    "explorable": {
      selector: "ww-head",
      title: msg("Explorable"),
      description: msg("Your explorable document. You can write text and copy/paste, edit, etc. here."),
      icon: "notes",
      distance: 300,
      highlight: false
    },
    "palette": {
      selector: "ww-palette",
      title: msg("Palette"),
      description: msg("Everything you can insert. At the start are non-interactive elements like lists or images, next are interactive elements called widgets. You can get new ones by clicking the search bar."),
      icon: "palette",
      highlight: true
    },
    "toolbox": {
      selector: this.activeEditor?.isInNarrowLayout? "ww-button#toggleToolbox": "ww-toolbox",
      title: msg("Toolbox"),
      description: msg("See what you have selected and change it. Copy, cut, paste, pin, or make layout changes. Offers different options depending on your selection, i.e. formatting for text."),
      icon: "tools",
      highlight: true
    },
    "editing-commands": {
      selector: "#header-right",
      title: msg("Editing commands"),
      description: msg("Undo/redo your changes or preview from the learner's perspective."),
      icon: "command",
      highlight: true
    },
    "document-commands": {
      selector: "ww-head[slot=nav]",
      title: msg("Document commands"),
      description: msg("Save, share or print your explorable. Edit information such as the title, language or license."),
      icon: "command",
      highlight: true
    },
    "app-commands": {
      selector: "#header-left",
      title: msg("App commands"),
      description: msg("Access the settings, open an explorable or create a new one."),
      icon: "command",
      highlight: true
    },
  }}

  static get styles() {
    return css`
      :host {
        background: var(--sl-color-gray-100);
        overflow: hidden;
        display: block;
        height: 100vh;
        width: 100vw;
      }

      .save-button::part(base) {
        padding: 0;
        margin-right: 20px;
      }

      :host(.noResources) {
        background-color: white;
        transition: none;
      }

      #settings-button {
        margin-top: 1px;
        height: 48px;
        margin-right: auto;
        user-select: none;
        display: flex;
        flex-direction: row;
        align-items: center;
        text-overflow: ellipsis;
        overflow: hidden;
        box-sizing: border-box;
        z-index: 101;
        --icon-size: 20px;
      }

      #settings-button > * {
        flex-shrink: 0;
      }

      :host(.noResources) #settings-button {
        grid-column: 1 / 4;
      }

      #settings-button:hover,
      #settings-button:hover *::part(base) {
        cursor: pointer;
        color: var(--sl-color-primary-600);
      }

      #settings-button:active,
      #settings-button:active *::part(base) {
        color: var(--sl-color-primary-800);
      }

      #settings-button .text {
        font-size: 0.8rem;
      }

      #settings-button:not(:hover):not(:active) .text {
        color: var(--sl-color-neutral-600);
      }

      ww-layout::part(drawer-left) {
        --size: clamp(600px, 50vw, 800px);
        --header-spacing: var(--sl-spacing-x-small);
      }

      ww-layout::part(drawer-left-title) {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 1rem;
      }

      ww-layout::part(drawer-left-body) {
        padding: 0;
        height: 100%;
      }

      ww-layout::part(drawer-left-footer) {
        display: none;
      }

      ww-layout::part(drawer-left-header-actions) {
        align-items: center;
        gap: 2ch;
      }

      ww-layout.preview #header-left {
        display: none;
      }

      ww-layout.preview #header-right > :not(#preview) {
        display: none;
      }

      ww-layout:not(.preview) #preview-label {
        display: none;
      }

      ww-layout.preview #header-right #preview {
        z-index: 1000;
      }

      ww-layout.preview #header-right #preview.active {
        z-index: 1000;
      }

      .title-button::part(base) {
        height: var(--sl-input-height-small);
        line-height: calc(
          var(--sl-input-height-small) - var(--sl-input-border-width) * 2
        );
      }

      #header-left,
      #header-right {
        display: flex;
        flex-direction: row;
        align-items: center;
        --icon-size: 20px;
        color: var(--sl-color-gray-700);
      }

      #header-left {
        padding-right: 1.5ch;
      }

      #header-right {
        padding-left: 1.5ch;
        justify-content: flex-end;
      }

      #header-right ww-button[data-active] {
        background: var(--sl-color-warning-200);
        color: var(--sl-color-warning-900);
        border-radius: var(--sl-border-radius-medium);
      }

      #preview-label {
        margin-right: 0.5ch;
      }

      #editHead {
        transition: cubic-bezier(0.23, 1, 0.32, 1) 0.75s;
      }

      :host([foldOpen]) #editHead {
        transform: rotate(90deg);
        color: var(--sl-color-primary-600);
      }

      .dialog {
        .dialog-label {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 1ch;
        }
      }

      #intro-tour {

        &::part(popup) {
          max-width: 400px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 15px;
          background: white;
          border: 2px solid var(--sl-color-gray-800);
          box-shadow: 5px 5px 15px 5px rgba(0, 0, 0, 0.25);
          border-radius: 5px;
          z-index: 10000000;
          transition: top 0.25s linear, left 0.25s ease-in;
        }

        & .intro-tour-title {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 0.5ch;
          font-size: 1.25rem;
        }

        & .intro-tour-description {
          font-size: 1rem;
          line-height: 1.25rem;
          text-align: justify;
        }

        & .intro-tour-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }
      }

      .intro-target * {
        animation: blink-color 1.5s linear infinite;
      }

      @keyframes blink-color {
        50% {
          color: var(--sl-color-primary-600);
        }
      }


      @media only screen and (max-width: 1300px) {
        :host(:not(.noResources)) #settings-button .text {
          display: none;
        }
      }
    `;
  }

  @property({ type: Boolean, attribute: true, reflect: true })
  foldOpen: boolean = false;

  @property({ type: String, attribute: true, reflect: true })
  dialog: undefined | "save" | "share" | "open";

  @query("ww-explorable-editor[data-active]")
  activeEditor: ExplorableEditor | null;

  async notify({ message, variant = "primary" }: SlAlertAttributes) {
    const duration = 5000;
    const icon = {
      primary: "info-circle",
      success: "circle-check",
      neutral: "help-circle",
      warning: "alert-circle",
      danger: "circle-x",
    }[variant];
    const alert = Object.assign(document.createElement("sl-alert"), {
      variant,
      closable: true,
      duration,
      innerHTML: `
				<sl-icon name="${icon}" slot="icon"></sl-icon>
				${typeof message === "string" ? escapeHTML(message) : JSON.stringify(message)}
			`,
    });
    this.appendChild(alert);
    return alert.toast();
  }

  Content = () => {
    if (this.initializing) {
      return null;
    }
    const {
      changed,
      set,
      setHead,
      url,
      editorState,
      codeState,
      ioState,
      filename,
    } = this.store.document;
    const { bundleID, testBundleID, changingID, testState, setTestState } = this.store.packages;
    const { locale } = this.store.ui;
    const {
      documentCommands,
      commands: { setDocAttrs, editHead },
    } = this.commands;
    const head = html`<ww-head
      .documentCommands=${documentCommands.filter(cmd => cmd.id !== "editHead")}
      ioState=${ioState}
      slot="nav"
      .filename=${this.activeEditor?.mode === "test"? this.store.packages?.testBundleID?.split("!").at(0): filename}
      ?pendingChanges=${this.activeEditor?.mode !== "test" && changed}
    >
      <ww-button
        style=${this.activeEditor?.mode === "test"? "display: none": ""}
        variant="icon"
        ${spreadProps(editHead.toObject())}
        @click=${() => editHead.run()}
      ></ww-button>
    </ww-head>
    `;
    const metaeditor = this.store
      ? html`<ww-metaeditor
          .app=${this}
          .editorState=${editorState}
          .head$=${(editorState as any).head$}
          .bodyAttrs=${editorState.doc.attrs}
          @ww-change-body-attrs=${(e: any) =>
            setDocAttrs.run(e.target.bodyAttrs)}
          @ww-update=${(e: any) => setHead(e.detail.state)}
          @ww-update-lang=${(e: any) => this.activeEditor?.updateWidgetsLang(e.detail.value)}
          @ww-click-tab=${(e: any) => (this.foldOpen = true)}
          slot="fold"
        >
        </ww-metaeditor>`
      : null;
    const editor = this.store
      ? html`<ww-explorable-editor
          .app=${this}
          slot="main"
          docID=${String(url)}
          data-active
          @focus=${() => (this.foldOpen = false)}
          .bundleID=${testBundleID ?? bundleID}
          .changingID=${changingID}
          .editorState=${editorState}
          .codeState=${codeState}
          .testState=${testState}
          .testStatus=${this.store.packages.testStatus}
          @update=${(e: any) => this.activeEditor?.mode === "test"? setTestState(e.detail.editorState): set(e.detail.editorState)}
          @ww-open=${(e: any) => open(e.detail.url)}
          ?loadingPackages=${this.store.packages.loading}
          ?controlsVisible=${!this.foldOpen}
          lang=${locale}
        >
        </ww-explorable-editor>`
      : null;
    return [head, metaeditor, editor];
  };

  HeaderLeft = () => {
    if (this.initializing) {
      return null;
    }
    const { appCommands } = this.commands;
    return html`<div id="header-left" slot="header-left">
      ${appCommands.map(
        (v) => html`
          <ww-button
            variant="icon"
            ${spreadProps(v.toObject())}
            @click=${() => v.run()}
          ></ww-button>
        `
      )}
    </div>`;
  };

  HeaderRight = () => {
    if (this.initializing) {
      return null;
    }
    const { queryCommands } = this.commands;
    return html`<div id="header-right" slot="header-right">
      ${queryCommands({ category: "editor", tags: ["general"] }).filter(cmd => cmd.id !== "toggleSourceMode" && cmd.id !== "toggleTestMode" || this.store.ui.showSourceEditor).map(
        (v) => html`
          <ww-button
            variant="icon"
            ${spreadProps(v.toObject())}
            ?data-active=${v.active}
            @click=${() => v.run()}
            ?reverse=${v.id === "preview"}
            >${v.id === "preview"
              ? html`<span id="preview-label">${v.label}</span>`
              : null}</ww-button
          >
        `
      )}
    </div>`;
  };

  Notification() {
    const { dequeueNotification } = this.store.ui;
    const nextNotification = dequeueNotification();
    nextNotification &&
      this.notify(nextNotification).then(() => this.requestUpdate());
  }

  IntroTour() {
    const anchor = !this.activeHelpSpec
      ? null
      : querySelectorDeep(this.activeHelpSpec.selector)
    return anchor? html`<sl-popup id="intro-tour" shift-padding="20" placement="bottom" flip shift strategy="fixed" ?active=${!!this.activeHelp && !this.store?.ui.hideIntro} .anchor=${anchor} distance=${ifDefined(this.activeHelpSpec? (this.activeHelpSpec as any)?.distance: undefined)}>
      <h2 class="intro-tour-title">
        <sl-icon class="intro-tour-icon" name=${ifDefined(!this.activeHelpSpec? undefined: this.activeHelpSpec.icon)}></sl-icon>
        ${!this.activeHelpSpec? null: this.activeHelpSpec.title}
        <ww-button variant="icon" icon="x" style="margin-left: auto;" @click=${this.endHelp}></ww-button>
      </h2>
      <div class="intro-tour-description">${!this.activeHelpSpec? null: this.activeHelpSpec.description}</div>
      <div class="intro-tour-actions">
        ${this.activeHelp === Object.keys(this.helpSequence).at(-1)? null: html`<ww-button variant="neutral" size="small" @click=${this.endHelp} outline>${msg("Dismiss tour")}</ww-button>`}
        ${this.activeHelp === Object.keys(this.helpSequence).at(0)? null: html`<ww-button variant="primary" outline size="small" @click=${() => this.nextHelp(true)}>${msg("Go back")}</ww-button>`}
        <ww-button variant="primary" size="small" @click=${() => this.nextHelp()}>
          ${this.activeHelp === Object.keys(this.helpSequence).at(-1)? msg("Finish tour"): msg("Continue")}
        </ww-button>
      </div>
    </sl-popup>`: null
  }

  closeDialog = () => {
    this.dialog = undefined;
  };

  static get dialogLabel() {
    return {
      save: msg("Save as..."),
      share: msg("Share..."),
      open: msg("Open..."),
      "": "",
    };
  }

  static get dialogIcon() {
    return {
      save: "file-export",
      share: "share",
      open: "file-symlink",
      "": "",
    };
  }

  @query(".dialog > ww-save-form")
  activeDialogSaveForm: SaveForm;

  Dialog() {
    let content = undefined;
    if (this.dialog === "save") {
      content = html`<ww-save-form
        .clients=${this.store.accounts.clientTriples as any}
        @ww-delete-document=${(e: any) =>
          this.commands.deleteDocumentCommand.run({
            url: e.detail.url,
            client: this.activeDialogSaveForm.client,
          })}
        filename=${(this.store.document.provisionalTitle || msg("Unnamed")) +
        ".html"}
        @ww-cancel=${() => (this.dialog = undefined)}
        @ww-confirm=${(e: any) =>
          this.commands.saveCommand.run({
            client: e.target.client,
            serializer: e.target.parserSerializer,
            metadata: e.target.metadata,
            url: e.target.url,
            saveAs: !e.target.url,
          })}
        ?loading=${this.store.document.ioState !== "idle"}
        .url=${this.store.document.url}
        .clientName=${this.store.document.url
          ? this.store.accounts.clientNameFromURL(this.store.document.url as URL) ?? "file file"
          : "file file"}
      ></ww-save-form>`;
    } else if (this.dialog === "share") {
      content = html`<ww-share-form
        url=${String(this.store.document.url)}
        .client=${this.store.document.client as any}
        @ww-cancel=${() => (this.dialog = undefined)}
      ></ww-share-form>`;
    } else if (this.dialog === "open") {
      content = html`<ww-save-form
        mode="open"
        .clients=${this.store.accounts.clientTriples.filter((client) => {
          return client[0] !== "llm";
        }) as any}
        @ww-delete-document=${(e: any) =>
          this.commands.deleteDocumentCommand.run({
            url: e.detail.url,
            client: this.activeDialogSaveForm.client,
          })}
        @ww-cancel=${() => (this.dialog = undefined)}
        @ww-confirm=${(e: any) =>
          this.commands.openCommand.run({
            url: e.target.url,
            parser: e.target.parserSerializer,
            client: e.target.client,
          })}
        ?loading=${this.store.document.ioState === "loading"}
      ></ww-save-form>`;
    }
    return html`<sl-dialog
      class="dialog"
      ?open=${!!this.dialog}
      @sl-after-hide=${(e: CustomEvent) =>
        e.target === e.currentTarget && this.closeDialog()}
    >
      <div slot="label" class="dialog-label">
        <sl-icon name=${App.dialogIcon[this.dialog ?? ""]}></sl-icon>
        <b>${App.dialogLabel[this.dialog ?? ""]}</b>
      </div>
      ${content}
    </sl-dialog>`;
  }

  render() {
    if (!this.initializing) {
      this.Notification();
      this.localization.setLocale(this.store.ui.locale);
    }
    return html`<ww-layout
        openTab
        activeTabName=${String(this.store?.document.url)}
        @click=${() =>
          this.activeEditor?.pmEditor?.document?.fullscreenElement &&
          this.activeEditor?.pmEditor?.document?.exitFullscreen()}
        ?loading=${this.initializing}
        ?foldOpen=${this.foldOpen}
      >
        ${this.HeaderLeft()} ${this.HeaderRight()} ${this.Content()}
      </ww-layout>
      <div
        style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 1000000; pointer-events: none;"
      ></div>
      ${cache(this.store?.ui?.hideIntro? undefined: this.IntroTour())}
      ${this.Dialog()} `;
  }
}