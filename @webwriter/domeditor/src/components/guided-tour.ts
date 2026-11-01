import {LitElement, css, html} from "lit"
import {ribbonIcon} from "../ribbon-icons"
import {uiMotionDisabled} from "../utility"
import type {WebWriterPackage} from "../packages"
import {editorInteractionStyles} from "./editing-controls.styles"
import {popupAnchorCSS} from "./popup-position"
import "./ribbon-drawer"
import "./ribbon-button"
import "./ribbon-combobox"
import "./package-search"
import "./distribution-controls"
import {documentLayoutModes, documentLayoutPreviewStyles, renderDocumentLayoutCard} from "./layout-preview"
import {createAnchorPositioner} from "../anchor-positioning.js"

const steps = [
  {title: "Content", text: "Write and make changes here."},
  {title: "Formatting", text: "Format your text with these buttons."},
  {title: "Elements", text: "Structure your content and add media elements."},
  {title: "Widgets", text: "Find and add interactive elements."},
  {title: "Edit", text: "Style and change what you currently selected."},
  {title: "Ask AI", text: "Ask AI to make any change."},
  {title: "Review", text: "Find language/accessibility issues and make comments."},
  {title: "Distribute", text: "Decide how readers can use your content."},
  {title: "Layouts", text: "Make any kind of content."},
]

/** Host UI only: the tour never touches the authored document or selection. */
export class GuidedTour extends LitElement {
  static properties = {
    anchor: {attribute: false},
    packages: {attribute: false},
    step: {state: true},
  }

  static styles = css`
    ${editorInteractionStyles}
    ${documentLayoutPreviewStyles}
    :host {
      position: fixed;
      z-index: 8;
      display: block;
      box-sizing: border-box;
      width: min(17rem, calc(100vw - 1rem));
      max-height: calc(100dvh - 1rem);
      overflow: auto;
      padding: .75rem;
      border: 1px solid #b9c5d2;
      border-radius: .45rem;
      background: #fff;
      box-shadow: 0 3px 14px rgb(32 42 54 / 12%);
      color: #2f3742;
      font: .75rem/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header, footer { display: flex; align-items: center; gap: .4rem; }
    header { justify-content: space-between; }
    h2 { margin: 0; font-size: .8rem; font-weight: 650; }
    p { margin: .4rem 0 .75rem; color: #687383; }
    .progress { margin-right: auto; color: #687383; font-size: .65rem; }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 1.8rem;
      padding: .25rem .55rem;
      border: 1px solid #c4ccd6;
      border-radius: .3rem;
      color: inherit;
      background: #f7f8fa;
      font: inherit;
      font-size: .7rem;
      cursor: pointer;
    }
    button:hover { background: #eef4fb; border-color: #93b9e8; }
    button:focus-visible { outline: 2px solid #3977c7; outline-offset: 2px; }
    button:disabled { opacity: .45; cursor: default; }
    .next { border-color: #3977c7; color: #fff; background: #3977c7; }
    .next:hover { background: #2e65ad; }
    .close { min-width: 1.8rem; padding: .25rem; border: 0; background: transparent; color: #687383; }
    .close svg { width: 1rem; height: 1rem; }
    .demo { height: 9rem; margin: .55rem 0 .75rem; border: 1px solid #d4dde7; border-radius: .3rem; background: #f4f5f7; position: relative; overflow: hidden; color: #2f3742; font-size: .63rem; }
    .demo * { box-sizing: border-box; }
    .ribbon-window { height: 3.65rem; overflow: hidden; border-bottom: 1px solid #d8dee6; background: #f2f2f2; }
    .ribbon-scale { display: flex; width: 200%; height: 7.3rem; transform: scale(.5); transform-origin: top left; font: .75rem/1.4 system-ui, sans-serif; pointer-events: none; }
    .ribbon-scale ribbon-drawer { height: 7.3rem; }
    .ribbon-scale ribbon-button.activate { border-radius: .3rem; animation: activate 5s infinite; }
    .mock-icon svg { display: block; width: .9rem; height: .9rem; }
    .mock-document { position: absolute; inset: 3.65rem .6rem .45rem; padding: .55rem .7rem; border: 1px solid #e0e4e9; background: white; color: #30343b; }
    .mock-document.content-document { top: .6rem; }
    .mock-document p { margin: 0 0 .3rem; color: inherit; font: .65rem/1.4 system-ui, sans-serif; }
    .mock-document h3 { margin: 0 0 .25rem; font: 600 .8rem/1.2 system-ui, sans-serif; }
    .typing { display: inline-block; overflow: hidden; white-space: nowrap; vertical-align: bottom; width: 0; border-right: 1px solid #2f3742; animation: typing 5s steps(18, end) infinite; }
    .selected-text { animation: select-text 5s infinite; }
    .bold-text { animation: make-bold 5s infinite; }
    .activate { animation: activate 5s infinite; }
    .insert-heading { animation: reveal 5s infinite; }
    .package-search-stage { position: relative; height: 100%; min-width: 0; }
    .package-search-stage package-search { position: absolute; inset: 0; }
    .package-search-stage package-search { visibility: hidden; animation-duration: 7s; animation-timing-function: steps(1, end); animation-iteration-count: infinite; }
    .search-empty { animation-name: search-empty; }
    .search-q { animation-name: search-q; }
    .search-qu { animation-name: search-qu; }
    .search-qui { animation-name: search-qui; }
    .search-query { animation-name: search-query; }
    .package-other { animation: package-other 7s steps(1, end) infinite; }
    .package-selected { animation: package-click 7s infinite; }
    .package-unavailable { padding: .4rem; color: #667085; }
    .widget-result { padding: .25rem .4rem; border: 1px solid #c8d2df; border-radius: .25rem; animation: quiz-insert 7s infinite; }
    .quiz-question { margin-bottom: .2rem; font-weight: 600; }
    .quiz-option { display: flex; align-items: center; gap: .3rem; line-height: 1.25; }
    .quiz-checkbox { width: .65rem; height: .65rem; border: 1px solid #9baabc; border-radius: .12rem; background: white; }
    .mock-tabs { position: absolute; top: 0; right: 0; z-index: 1; width: 8rem; height: 15px; overflow: hidden; }
    .mock-tabs.wide { width: 8rem; }
    .mock-tabs.wider { width: 9rem; }
    .mock-tabs-inner { box-sizing: border-box; display: flex; align-items: flex-end; justify-content: flex-end; width: 200%; height: 30px; padding: 0 4px; border-bottom: .5px solid #a8a8a8; background: #ededed; transform: scale(.5); transform-origin: top left; }
    .mock-tabs-inner.has-active { padding-left: 0; }
    .mock-tab { box-sizing: border-box; display: flex; align-items: center; flex: 0 0 28px; width: 28px; height: 28px; border-radius: .2rem; overflow: hidden; color: #526b86; }
    .mock-tab.active { flex: 1 0 128px; width: 128px; height: 30px; margin-bottom: -1px; border: 1px solid #a8a8a8; border-bottom-color: #f2f2f2; border-radius: .2rem .2rem 0 0; background: #f2f2f2; color: #243447; }
    .mock-tab-button { box-sizing: border-box; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 28px; height: 28px; padding: .35rem; }
    .mock-tab.active .mock-tab-button { justify-content: flex-start; width: calc(100% - 24px); }
    .mock-tab-icon { display: block; flex: 0 0 17px; width: 17px; height: 17px; }
    .mock-tab-icon svg, .mock-tab-close svg { display: block; width: 100%; height: 100%; }
    .mock-tab-label { overflow: hidden; margin-left: .3rem; font-size: .72rem; font-weight: 600; line-height: 1; white-space: nowrap; text-overflow: ellipsis; }
    .mock-tab-close { box-sizing: border-box; flex: 0 0 24px; width: 24px; height: 28px; padding: .3rem; }
    .toolbox-demo .mock-document, .toolbox-demo .mock-pane { top: 15px; }
    .edit-document { right: 8rem; }
    .edit-selected { padding: .25rem; outline: 1px solid #3977c7; }
    .edit-selected h3 { animation: heading-level 5s infinite; }
    .heading-choices { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: .15rem; border: 1px solid #c8d2df; border-radius: .2rem; overflow: hidden; }
    .heading-choice { display: grid; place-items: center; height: 1rem; background: white; border: 1px solid #e1e7ee; }
    .heading-choice svg { width: .8rem; height: .8rem; }
    .heading-choice:first-child { animation: heading-one 5s infinite; }
    .heading-choice:nth-child(2) { animation: heading-two 5s infinite; }
    .mock-pane { position: absolute; top: 3.65rem; right: 0; bottom: 0; width: 8rem; padding: .3rem .4rem; background: #f2f2f2; border-left: 1px solid #d5dce5; }
    .pane-title { display: flex; align-items: center; gap: .2rem; padding-bottom: .25rem; border-bottom: 1px solid #d5dce5; }
    .pane-title svg { width: .75rem; height: .75rem; }
    .pane-field { margin-top: .25rem; color: #667085; font-size: .55rem; }
    .ai-document { right: 8rem; }
    .ai-heading { animation: ai-change 5s infinite; }
    .ai-pane { width: 8rem; display: flex; flex-direction: column; }
    .ai-prompt { margin-top: auto; padding: .25rem; border: 1px solid #c8d2df; border-radius: .3rem; background: white; }
    .ai-review { display: flex; gap: .15rem; margin-top: .25rem; animation: reveal 5s infinite; }
    .ai-review span { padding: .1rem .2rem; border: 1px solid #c8d2df; border-radius: .2rem; background: white; }
    .review-pane, .distribution-pane { width: 9rem; }
    .review-issue, .review-comment { margin-top: .25rem; padding: .2rem .3rem; border: 1px solid #d8dee6; border-radius: .2rem; background: white; animation: reveal 5s infinite; }
    .review-issue { color: #a15300; }
    .review-comment { animation-delay: .7s; }
    .issue-text { text-decoration: underline wavy #d25a4a; animation: select-text 5s infinite; }
    .distribution-scale { width: 166.7%; transform: scale(.6); transform-origin: top left; pointer-events: none; }
    .distribution-pane { overflow: hidden; }
    .distribution-before { animation: before-change 5s infinite; }
    .distribution-after { display: none; animation: after-change 5s infinite; }
    .layouts-demo { padding: 1.2rem .4rem .4rem; background: #f2f2f2; }
    .layouts-label { margin-bottom: .3rem; font-weight: 650; }
    .layouts-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); gap: .3rem; height: 5.6rem; pointer-events: none; }
    .layouts-cards .layout-preset { position: relative; min-height: 0; padding: 0; gap: 0; font-size: .58rem; }
    .layouts-cards .document-layout-preview { position: absolute; inset: 0; width: 100%; height: 100%; min-height: 0; border: 0; border-radius: inherit; }
    .layouts-cards .layout-preset-name { position: absolute; z-index: 1; top: 50%; left: 50%; transform: translate(-50%, -50%); max-width: calc(100% - .5rem); padding: .1rem .25rem; border-radius: .2rem; background: rgb(255 255 255 / 85%); }
    .layouts-cards .layout-preset[data-mode="canvas"] { animation: layout-select 5s infinite; }
    .layouts-cards .layout-preset[data-mode="document"] { animation: layout-deselect 5s infinite; }
    @keyframes layout-select { 0%, 30%, 100% { border-color: #c8d2df; } 45%, 90% { border-color: #3977c7; } }
    @keyframes layout-deselect { 0%, 30%, 100% { border-color: #3977c7; } 45%, 90% { border-color: #c8d2df; } }
    @keyframes typing { 0%, 10% { width: 0; } 55%, 85% { width: 13ch; } 100% { width: 0; } }
    @keyframes select-text { 0%, 10%, 95%, 100% { background: transparent; } 20%, 85% { background: #b9d7f5; } }
    @keyframes make-bold { 0%, 43%, 100% { font-weight: 400; } 48%, 90% { font-weight: 700; } }
    @keyframes activate { 0%, 35%, 90%, 100% { background: transparent; border-color: transparent; } 43%, 80% { background: #d7e7f7; border-color: #8eb6df; } }
    @keyframes reveal { 0%, 42% { opacity: 0; } 50%, 90% { opacity: 1; } 100% { opacity: 0; } }
    @keyframes search { 0%, 10% { width: 0; } 35%, 90% { width: 4ch; } 100% { width: 0; } }
    @keyframes search-empty { 0% { visibility: visible; } 24% { visibility: hidden; } 100% { visibility: visible; } }
    @keyframes search-q { 0% { visibility: hidden; } 24% { visibility: visible; } 30% { visibility: hidden; } }
    @keyframes search-qu { 0% { visibility: hidden; } 30% { visibility: visible; } 36% { visibility: hidden; } }
    @keyframes search-qui { 0% { visibility: hidden; } 36% { visibility: visible; } 42% { visibility: hidden; } }
    @keyframes search-query { 0% { visibility: hidden; } 42% { visibility: visible; } 100% { visibility: hidden; } }
    @keyframes package-other { 0% { opacity: 1; } 24% { opacity: 0; } 100% { opacity: 1; } }
    @keyframes package-click { 0%, 54%, 90%, 100% { background: transparent; } 62%, 85% { background: #d7e7f7; } }
    @keyframes quiz-insert { 0%, 60% { opacity: 0; } 68%, 95% { opacity: 1; } 100% { opacity: 0; } }
    @keyframes heading-level { 0%, 42%, 100% { font-size: .8rem; } 50%, 90% { font-size: .65rem; } }
    @keyframes heading-one { 0%, 42%, 100% { background: #e2edf8; color: #375d84; } 50%, 90% { background: white; color: inherit; } }
    @keyframes heading-two { 0%, 42%, 100% { background: white; color: inherit; } 50%, 90% { background: #e2edf8; color: #375d84; } }
    @keyframes before-change { 0%, 42%, 100% { display: inline; } 50%, 90% { display: none; } }
    @keyframes after-change { 0%, 42%, 100% { display: none; } 50%, 90% { display: inline; } }
    @keyframes ai-change { 0%, 42%, 100% { font-size: .65rem; font-weight: 400; } 50%, 90% { font-size: .8rem; font-weight: 600; } }
    @media (prefers-reduced-motion: reduce) {
      .demo * { animation: none !important; }
      .typing { width: 13ch; }
      .package-other { visibility: hidden; }
      .package-search-stage .search-query { visibility: visible; }
    }
    .target { position: fixed; inset: auto; pointer-events: none; box-sizing: border-box; border: 1px solid #3977c7; border-radius: .3rem; }
    .target[hidden] { display: none; }
  `

  anchor: (step: number) => HTMLElement | null = () => null
  packages: WebWriterPackage[] = []
  private step = 0
  private resizeObserver: ResizeObserver | null = null
  private anchorPositioner = createAnchorPositioner(document)
  private positionedAnchor: HTMLElement | null = null
  private positionedStep = -1
  private moveAnimation: Animation | null = null

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener("resize", this.position)
    window.addEventListener("scroll", this.position, true)
    this.resizeObserver = new ResizeObserver(this.position)
    this.resizeObserver.observe(this)
  }

  disconnectedCallback() {
    this.moveAnimation?.cancel()
    this.moveAnimation = null
    this.anchorPositioner.destroy()
    this.positionedAnchor = null
    this.positionedStep = -1
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    window.removeEventListener("resize", this.position)
    window.removeEventListener("scroll", this.position, true)
    super.disconnectedCallback()
  }

  protected updated() {
    this.resizeObserver?.disconnect()
    this.resizeObserver?.observe(this)
    const anchor = this.anchor(this.step)
    if(anchor) this.resizeObserver?.observe(anchor)
    this.position()
  }

  private position = () => {
    const anchor = this.anchor(this.step)
    if(!anchor?.isConnected) {
      this.moveAnimation?.cancel()
      this.moveAnimation = null
      const target = this.renderRoot.querySelector<HTMLElement>(".target")
      if(target) target.hidden = true
      this.anchorPositioner.release(this)
      if(target) this.anchorPositioner.release(target)
      this.positionedAnchor = null
      this.positionedStep = -1
      this.anchorPositioner.refresh()
      return
    }
    if(this.positionedAnchor !== anchor || this.positionedStep !== this.step) {
      const moving = this.positionedStep >= 0 && this.positionedStep !== this.step
      const previous = moving ? this.getBoundingClientRect() : null
      this.moveAnimation?.cancel()
      this.moveAnimation = null
      const target = this.renderRoot.querySelector<HTMLElement>(".target")
      this.anchorPositioner.release(this)
      if(target) this.anchorPositioner.release(target)
      if(target && this.step !== 0) {
        this.anchorPositioner.bind(target, anchor,
          "left:calc(anchor(left) - 3px);top:calc(anchor(top) - 3px);width:calc(anchor-size(width) + 6px);height:calc(anchor-size(height) + 6px);")
      }
      this.anchorPositioner.bind(this, anchor, this.step === 0
        ? "position-area:center;justify-self:center;align-self:center;width:min(17rem,calc(100vw - 1rem));max-height:calc(100dvh - 1rem);"
        : popupAnchorCSS(10))
      this.positionedAnchor = anchor
      this.positionedStep = this.step
      this.anchorPositioner.refresh()
      if(previous && !uiMotionDisabled(this) && !this.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        const current = this.getBoundingClientRect()
        const x = previous.left - current.left, y = previous.top - current.top
        if((x || y) && typeof this.animate === "function") {
          this.moveAnimation = this.animate([
            {transform: `translate(${x}px, ${y}px)`},
            {transform: "translate(0, 0)"},
          ], {duration: 240, easing: "ease-out"})
        }
      }
    }
    const rect = anchor.getBoundingClientRect()
    const target = this.renderRoot.querySelector<HTMLElement>(".target")
    if(target) {
      target.hidden = this.step === 0 || !rect.width || !rect.height
    }
  }

  private dismiss() {
    this.dispatchEvent(new CustomEvent("tour-dismiss", {bubbles: true, composed: true}))
  }

  private renderDemo() {
    const marks = html`<ribbon-drawer label="Marks" icon="MarkBold" layout="marks" ?collapsed=${this.step !== 1}>
      <ribbon-combobox class="font-family" name="font-family" label="Font family" default-value-label="Font"></ribbon-combobox>
      <ribbon-combobox class="font-size" name="font-size" label="Font size" default-value-label="Size"></ribbon-combobox>
      <ribbon-button compact label="Increase font size" icon="IncreaseFontSize"></ribbon-button>
      <ribbon-button compact label="Decrease font size" icon="DecreaseFontSize"></ribbon-button>
      <ribbon-combobox class="mark-text-color" style="grid-column: 1; grid-row: 2" name="color" label="Text color" variant="color"></ribbon-combobox>
      <ribbon-combobox class="mark-background-color" style="grid-column: 2; grid-row: 2" name="background-color" label="Text background color" variant="color"></ribbon-combobox>
      <ribbon-button compact toggle label="Bold" icon="MarkBold" class=${this.step === 1 ? "activate" : ""}></ribbon-button>
      <ribbon-button compact toggle label="Italic" icon="MarkItalic"></ribbon-button>
      <ribbon-button compact toggle label="Underline" icon="MarkUnderline"></ribbon-button>
      <ribbon-button compact toggle label="Strikethrough" icon="MarkStrikethrough"></ribbon-button>
      <ribbon-button compact label="Remove formatting" icon="RemoveMarks" class="mark-remove" style="grid-column: 7; grid-row: 2"></ribbon-button>
      <ribbon-button label="Formula" icon="Formula" class="mark-formula" style="grid-column: 8; grid-row: 1"></ribbon-button>
      <ribbon-button label="Link…" icon="MarkLink" class="mark-span" style="grid-column: 8; grid-row: 2"></ribbon-button>
    </ribbon-drawer>`
    const elements = html`<ribbon-drawer label="Elements" icon="Paragraph" layout="elements" ?collapsed=${this.step !== 2}>
      <ribbon-button variant="insertion" label="Paragraph" icon="Paragraph"></ribbon-button>
      <ribbon-button variant="insertion" label="Heading" icon="Heading" class="activate"></ribbon-button>
      <ribbon-button variant="insertion" label="List" icon="List"></ribbon-button>
      <ribbon-button variant="insertion" label="Details" icon="Details"></ribbon-button>
      <ribbon-button variant="insertion" label="Table" icon="Table"></ribbon-button>
      <ribbon-button variant="insertion" label="Image" icon="Image"></ribbon-button>
      <ribbon-button variant="insertion" label="Graphic" icon="Graphic"></ribbon-button>
      <ribbon-button variant="insertion" label="Audio" icon="Audio"></ribbon-button>
      <ribbon-button variant="insertion" label="Website" icon="Website"></ribbon-button>
      <ribbon-button variant="insertion" label="Video" icon="Video"></ribbon-button>
    </ribbon-drawer>`
    const quiz = this.packages.find(pkg => pkg.name === "@webwriter/quiz")
    const otherPackages = this.packages.filter(pkg => pkg.name !== quiz?.name && (!quiz || ![pkg.name, pkg.label, pkg.description, ...pkg.keywords ?? []].filter(Boolean).join(" ").toLowerCase().includes("q"))).slice(0, quiz ? 4 : 5)
    const packageButton = (pkg: WebWriterPackage, className: string) => html`<ribbon-button variant="package"
      label=${pkg.label} icon="Packages" .iconUrl=${pkg.iconUrl ?? ""} class=${className}></ribbon-button>`
    const packages = html`<ribbon-drawer label="Packages" icon="Packages" layout="packages" ?collapsed=${this.step !== 3}>
      <div class="package-search-stage">
        <package-search class="search-empty"></package-search>
        <package-search class="search-q" query="q"></package-search>
        <package-search class="search-qu" query="qu"></package-search>
        <package-search class="search-qui" query="qui"></package-search>
        <package-search class="search-query" query="quiz"></package-search>
      </div>
      ${quiz ? packageButton(quiz, "package-selected") : ""}
      ${otherPackages.map(pkg => packageButton(pkg, quiz ? "package-other" : ""))}
    </ribbon-drawer>`
    const tabNames = [{name: "Edit", icon: "Pencil"}, {name: "Style", icon: "Theme"}, {name: "AI", icon: "AI"}, {name: "Review", icon: "Grammar"}, {name: "Distribute", icon: "users-group"}]
    const activeTab = ["Edit", "AI", "Review", "Distribute"][this.step - 4]
    const tabs = html`<div class=${`mock-tabs ${this.step === 5 ? "wide" : this.step >= 6 ? "wider" : ""}`}><div class=${`mock-tabs-inner ${activeTab ? "has-active" : ""}`}>
      ${tabNames.map(tab => html`<span class=${`mock-tab ${tab.name === activeTab ? "active" : ""}`} data-tool=${tab.name}>
        <span class="mock-tab-button"><span class="mock-tab-icon">${ribbonIcon(tab.icon)}</span>${tab.name === activeTab ? html`<span class="mock-tab-label">${tab.name === "Edit" ? "Heading" : tab.name === "AI" ? "Ask AI" : tab.name}</span>` : ""}</span>
        ${tab.name === activeTab ? html`<span class="mock-tab-close">${ribbonIcon("Reject")}</span>` : ""}
      </span>`)}
    </div></div>`
    const ribbon = html`<div class="ribbon-window"><div class="ribbon-scale" inert>${marks}${elements}${packages}</div></div>`
    switch(this.step) {
      case 0: return html`<div class="mock-document content-document"><p><span class="typing">Write an idea</span></p></div>`
      case 1: return html`${ribbon}<div class="mock-document"><p><span class="selected-text bold-text">A useful idea</span></p><p>More text follows here.</p></div>`
      case 2: return html`${ribbon}<div class="mock-document"><h3 class="insert-heading">Heading</h3><p>Start writing here.</p></div>`
      case 3: return html`${ribbon}<div class="mock-document">${quiz ? html`<div class="widget-result"><div class="quiz-question">What is 2 + 2?</div><div class="quiz-option"><span class="quiz-checkbox"></span>3</div><div class="quiz-option"><span class="quiz-checkbox"></span>4</div></div>` : html`<div class="package-unavailable">Quiz package unavailable</div>`}</div>`
      case 4: return html`<div class="toolbox-demo">${tabs}<div class="mock-document edit-document"><div class="edit-selected"><h3>My heading</h3></div></div><div class="mock-pane"><div class="pane-title">${ribbonIcon("Heading")} Heading</div><div class="pane-field">Level</div><div class="heading-choices">${[1, 2, 3, 4, 5, 6].map(level => html`<span class="heading-choice">${ribbonIcon(`Heading ${level}`)}</span>`)}</div></div></div>`
      case 5: return html`<div class="toolbox-demo">${tabs}<div class="mock-document ai-document"><p class="ai-heading">My heading</p></div><div class="mock-pane ai-pane"><div class="pane-title">${ribbonIcon("AI")} Ask AI</div><div class="ai-review"><span>Accept</span><span>Reject</span></div><div class="ai-prompt">Make this a heading</div></div></div>`
      case 6: return html`<div class="toolbox-demo">${tabs}<div class="mock-document ai-document"><p><span class="issue-text">A sentance</span></p></div><div class="mock-pane review-pane"><div class="pane-title">${ribbonIcon("Comments")} Comments</div><div class="review-comment">Add a comment…</div><div class="pane-title">${ribbonIcon("Spelling")} Issues</div><div class="review-issue">sentence</div></div></div>`
      case 7: return html`<div class="toolbox-demo">${tabs}<div class="mock-document ai-document"><p>Reader content</p></div><div class="mock-pane distribution-pane"><div class="pane-title">${ribbonIcon("Document")} Document permissions</div><div class="distribution-scale" inert>${[[], ["edit"]].map((permissions, index) => html`<div class=${index ? "distribution-after" : "distribution-before"}><distribution-controls general hide-heading .state=${{target: "document", local: {version: 1, target: "document", scope: "individual", permissions, add: [], items: []}, effective: null, inheritedFrom: null}}></distribution-controls></div>`)}</div></div></div>`
      default: return html`${tabs}<div class="layouts-demo"><div class="layouts-label">Layouts</div><div class="layouts-cards" inert>${documentLayoutModes.map(mode => renderDocumentLayoutCard(mode, {mode: "document", canConvert: true, zoom: 100}, false, () => {}))}</div></div>`
    }
  }

  render() {
    const step = steps[this.step]
    return html`
      <section aria-label="Guided tour" @keydown=${(event: KeyboardEvent) => {
        if(event.key === "Escape") { event.stopPropagation(); this.dismiss() }
      }}>
        <div class="target" hidden aria-hidden="true"></div>
        <div aria-live="polite" aria-atomic="true">
          <header>
            <h2>${step.title}</h2>
            <button class="close" type="button" aria-label="Dismiss tour" title="Dismiss tour"
              @click=${this.dismiss}>${ribbonIcon("Reject")}</button>
          </header>
          <p>${step.text}</p>
        </div>
        <div class="demo" aria-hidden="true">${this.renderDemo()}</div>
        <footer>
          <span class="progress" aria-label=${`Step ${this.step + 1} of ${steps.length}`}>${this.step + 1} / ${steps.length}</span>
          <button type="button" ?disabled=${this.step === 0} @click=${() => this.step--}>Back</button>
          <button class="next" type="button" @click=${() => this.step === steps.length - 1 ? this.dismiss() : this.step++}>
            ${this.step === steps.length - 1 ? "Done" : "Next"}
          </button>
        </footer>
      </section>`
  }
}

if(!customElements.get("guided-tour")) customElements.define("guided-tour", GuidedTour)

declare global {
  interface HTMLElementTagNameMap {
    "guided-tour": GuidedTour
  }
}
