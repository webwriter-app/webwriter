import {LitElement, css, html, nothing, svg} from "lit"
import {appIconUrl, ribbonIcon} from "../ribbon-icons"
import {t, SiteLanguageController} from "../site-language"
import {userInitials} from "../user-identity"

export type LiveShowcaseStep = "share" | "groups" | "permissions"
const steps: LiveShowcaseStep[] = ["share", "groups", "permissions"]

// Live sessions name anonymous learners "Learner XXXX" and give each a color;
// the landing page uses muted tones of that palette.
const learners = ["7F2K", "K2MD", "Q9XA", "M4TR", "B8NC", "T3HW"].map((code, index) => ({
  initials: userInitials(`Learner ${code}`),
  color: ["#b26d7c", "#5b7fb2", "#5c937d", "#8673a8", "#b8865b", "#4f8d9c"][index],
}))
const maxGroupSize = 4

/** A decorative, deterministic QR-like pattern with the three finder squares. */
const qrPattern = (() => {
  const size = 21, cells: string[] = []
  let seed = 7
  for(let y = 0; y < size; y++) for(let x = 0; x < size; x++) {
    const fx = x >= size - 7 ? x - size + 7 : x, fy = y >= size - 7 ? y - size + 7 : y
    let on: boolean
    if((x < 7 || x >= size - 7) && y < 7 || x < 7 && y >= size - 7) {
      on = fx === 0 || fx === 6 || fy === 0 || fy === 6 || fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4
    }
    else if(x === 7 || y === 7 || x === size - 8 && y < 8 || y === size - 8 && x < 8) on = false
    else { seed = (seed * 1103515245 + 12345) & 0x7fffffff; on = (seed >> 16) % 2 === 0 }
    if(on) cells.push(`M${x} ${y}h1v1h-1z`)
  }
  return cells.join("")
})()
const qrCode = svg`<svg viewBox="-1 -1 23 23"><path d=${qrPattern}/></svg>`
const cursor = svg`<svg viewBox="0 0 12 16"><path d="M1 1v12l3.2-3 2.3 5 2-1-2.3-4.8H11z" fill="currentColor" stroke="white" stroke-width="1.2" stroke-linejoin="round"/></svg>`
const minus = svg`<svg viewBox="0 0 10 10" fill="none"><path d="M2 5h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`

/**
 * An interactive miniature of a live session: the host's preview with its
 * sharing, grouping, and permission controls, beside one learner's tablet.
 * The explanatory cards stay in the page as slotted, translatable content.
 */
export class LiveSessionShowcase extends LitElement {
  static properties = {
    shared: {state: true},
    groupSize: {state: true},
    everyone: {state: true},
    notesVisible: {state: true},
    canEdit: {state: true},
    canMove: {state: true},
    active: {state: true},
  }

  shared = false
  groupSize = 2
  everyone = false
  notesVisible = false
  canEdit = true
  canMove = false
  active: LiveShowcaseStep | null = null
  private language = new SiteLanguageController(this)
  private observer?: IntersectionObserver
  private introTimer?: ReturnType<typeof setTimeout>

  connectedCallback() {
    super.connectedCallback()
    if(this.shared || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || typeof IntersectionObserver === "undefined") {
      this.shared = true
      return
    }
    // Start sharing once the section is seen, so learners visibly join.
    this.observer = new IntersectionObserver(entries => {
      if(!entries.some(entry => entry.isIntersecting)) return
      this.stopIntro()
      this.introTimer = setTimeout(() => { this.shared = true }, 600)
    }, {threshold: .4})
    this.observer.observe(this)
  }

  disconnectedCallback() {
    this.stopIntro()
    clearTimeout(this.introTimer)
    super.disconnectedCallback()
  }

  private stopIntro() {
    this.observer?.disconnect()
    this.observer = undefined
  }

  constructor() {
    super()
    this.addEventListener("pointerover", this.highlight)
    this.addEventListener("focusin", this.highlight)
    this.addEventListener("pointerleave", this.clear)
    this.addEventListener("focusout", this.clear)
  }

  /** Cards name their step by slot; scene controls by data-step. */
  private highlight = (event: Event) => {
    const step = event.composedPath().map(node => !(node instanceof HTMLElement) ? ""
      : node.parentElement === this ? node.slot : node.dataset.step ?? "").find(Boolean)
    this.active = steps.includes(step as LiveShowcaseStep) ? step as LiveShowcaseStep : null
  }

  private clear = () => { this.active = null }

  private toggleShare = () => {
    this.stopIntro()
    clearTimeout(this.introTimer)
    this.shared = !this.shared
  }

  private resize(change: number) {
    this.everyone = false
    this.groupSize = Math.min(maxGroupSize, Math.max(1, this.groupSize + change))
  }

  private chip(label: string, icon: string, pressed: boolean, toggle: () => void) {
    return html`<button class="chip" type="button" aria-pressed=${String(pressed)} @click=${toggle}><span class="icon" aria-hidden="true">${ribbonIcon(icon)}</span>${t(label)}</button>`
  }

  static styles = css`
    :host {display: block; container-type: inline-size; color: #263142; font-family: system-ui, sans-serif}
    * {box-sizing: border-box}
    button {font: inherit; color: inherit; cursor: pointer}
    button:focus-visible {outline: 2px solid #155e9b; outline-offset: 2px}
    .icon, .icon svg {display: block; width: 1.4em; height: 1.4em}

    /* One em is 1/64 of the width, so the 16:9 scene scales as a whole. */
    .showcase {position: relative; font-size: calc(100cqi / 64); --window-x: 2.2em; --page-x: 14.2em; --tablet-x: 40.8em; --tablet-y: 4.4em}
    .stage {position: relative; aspect-ratio: 16 / 9; overflow: hidden; border: 1px solid #dfe5ed; border-radius: .6rem; background-color: #f7f9fc;
      background-image: linear-gradient(rgb(21 94 155 / .04) 1px, transparent 1px), linear-gradient(90deg, rgb(21 94 155 / .04) 1px, transparent 1px);
      background-size: 4em 4em}
    .bar {display: block; height: .5em; margin-block: .45em; border-radius: .25em; background: #e3e8ef}
    .bar.heading {width: 55%; height: .9em; margin-block-end: .7em; background: #c9d3df}
    .bar.short {width: 72%}
    .marker {display: grid; flex: none; place-items: center; width: 1.9em; height: 1.9em; border-radius: 50%; background: #155e9b; color: white; font-size: .58em; font-weight: 700}
    .hot {display: flex; align-items: center; gap: .45em; border-radius: .45em; transition: box-shadow 160ms ease}
    .showcase:is([data-active="share"]) .hot[data-step="share"],
    .showcase:is([data-active="groups"]) .hot[data-step="groups"],
    .showcase:is([data-active="permissions"]) .hot[data-step="permissions"] {box-shadow: 0 0 0 .2em white, 0 0 0 .38em #3977c7}
    .showcase[data-active="share"] .hot[data-step="share"] .marker,
    .showcase[data-active="groups"] .hot[data-step="groups"] .marker,
    .showcase[data-active="permissions"] .hot[data-step="permissions"] .marker {animation: pulse 1.2s ease-out infinite}

    .window {position: absolute; left: var(--window-x); top: 2.4em; width: 43em; height: 31.2em; display: grid; grid-template-rows: 2.4em 3.6em minmax(0, 1fr); overflow: hidden; border: 1px solid #cfd8e3; border-radius: .7em; background: #eef1f5; box-shadow: 0 .6em 2em rgb(23 32 51 / .1)}
    .titlebar {display: flex; align-items: center; gap: .6em; padding-inline: .9em; border-bottom: 1px solid #dfe5ed; background: white}
    .titlebar img {width: 1.3em; height: 1.3em}
    .titlebar .bar {width: 7em; height: .55em; margin: 0}
    .preview {display: grid; place-items: center; width: 1.8em; height: 1.5em; margin-inline-start: auto; border: 1px solid #c8dced; border-radius: .3em; background: #eaf2fb; color: #155e9b}
    .preview svg {width: 1em; height: 1em}
    .drawer {display: flex; align-items: center; gap: .7em; padding-inline: .8em; border-bottom: 1px solid #dfe5ed; background: white; color: #334155}
    .sharing {padding: .25em}
    .sharing > .icon {font-size: .7em}
    .switch {position: relative; flex: none; width: 2.1em; height: 1.15em; padding: 0; border: 0; border-radius: 1em; background: #c6ced8; transition: background-color 200ms ease}
    .switch::after {position: absolute; top: .15em; left: .15em; width: .85em; height: .85em; border-radius: 50%; background: white; content: ""; transition: transform 200ms ease}
    .switch[aria-checked="true"] {background: #3977c7}
    .switch[aria-checked="true"]::after {transform: translateX(.95em)}
    .label {font-size: .62em}
    .link {width: 20em; height: 2.6em; padding: .55em .7em; overflow: hidden; border: 1px solid #c8d2df; border-radius: .5em; background: white; color: #526b86; font-size: .56em; line-height: 1.4; white-space: nowrap; text-overflow: ellipsis}
    .link:empty {background: #f7f9fc}
    .qr {position: relative; display: grid; place-items: center; width: 1.5em; height: 1.5em; border: 1px solid #c8d2df; border-radius: .3em; color: #334155}
    .qr > svg {width: 1em; height: 1em}
    .qr-popover {position: absolute; z-index: 2; top: calc(100% + .5em); left: 50%; width: 7.5em; padding: .7em; border: 1px solid #dfe5ed; border-radius: .5em; background: white; box-shadow: 0 .5em 1.4em rgb(23 32 51 / .16); translate: -50% 0; animation: appear 200ms ease both}
    .qr-popover svg {display: block; width: 100%; fill: #263142}
    .sharing:not(:has([aria-checked="true"])) .qr {opacity: .45}
    .divider {width: 1px; height: 1.9em; background: #dfe5ed}
    .seats {display: flex; align-items: center}
    .seat {padding: .15em .08em}
    .seat[data-grouped] {background: #e2edf8}
    .seat[data-start] {margin-inline-start: .45em; padding-inline-start: .15em; border-start-start-radius: 1em; border-end-start-radius: 1em}
    .seat[data-end] {padding-inline-end: .15em; border-start-end-radius: 1em; border-end-end-radius: 1em}
    .seat:first-child {margin-inline-start: 0}
    .avatar {display: grid; place-items: center; width: 2.6em; height: 2.6em; border: .15em solid white; border-radius: 50%; background: var(--color); color: white; font-size: .5em; font-weight: 700; letter-spacing: .02em}
    .seats .avatar {animation: join 420ms cubic-bezier(.3, 1.5, .6, 1) both; animation-delay: calc(var(--i) * 170ms + 150ms)}

    .canvas {position: relative; overflow: hidden}
    .page {position: absolute; left: var(--page-x); top: 1.3em; bottom: -1em; width: 26em; padding: 1.4em 1.6em; border: 1px solid #e0e4e9; border-radius: .3em .3em 0 0; background: white; box-shadow: 0 .2em .8em rgb(23 32 51 / .05)}
    .block {margin-block-start: 1.1em; overflow: hidden; border: 1px solid #cfd8e3; border-radius: .45em}
    .tools {display: flex; align-items: center; gap: .45em; padding: .35em .45em; border-bottom: 1px solid #dfe5ed; background: #f7f9fc}
    .tools .hot:last-child {margin-inline-start: auto}
    .counter {display: inline-flex; align-items: stretch; height: 2.6em; overflow: hidden; border: 1px solid #c5ccd5; border-radius: .5em; background: #f7f7f7; font-size: .56em}
    .counter button {display: grid; place-items: center; width: 2.4em; padding: 0; border: 0; background: transparent; color: #627586}
    .counter button svg {width: 1em; height: 1em}
    .counter button:disabled {cursor: default; opacity: .35}
    .counter .all {width: auto; padding-inline: .8em; border-inline-start: 1px solid #c5ccd5; color: inherit}
    .counter .all[aria-pressed="true"], .counter:not(:has(.all[aria-pressed="true"])) .size {background: #dbe7f2}
    .size {display: flex; align-items: center; gap: .3em; padding-inline: .3em; white-space: nowrap}
    .size .icon {width: 1.3em; height: 1.3em}
    .size .icon svg {width: 100%; height: 100%}
    .chip {display: inline-flex; align-items: center; gap: .4em; height: 2.6em; padding: 0 .7em; border: 1px solid #c5ccd5; border-radius: .5em; background: #f7f7f7; font-size: .56em; white-space: nowrap}
    .chip .icon {width: 1.3em; height: 1.3em}
    .chip[aria-pressed="true"] {border-color: #8eb6df; background: #e2edf8; color: #375d84}
    .chip:hover {background: #edf3f9}
    .chip[aria-pressed="true"]:hover {background: #d5e5f5}
    .area {position: relative; height: 7.2em; background: radial-gradient(circle, #d3dbe5 .06em, transparent .08em) 0 0 / .9em .9em, white}
    .note {position: absolute; width: 4.2em; height: 4.2em; padding: .55em .5em; border-radius: .2em; box-shadow: 0 .15em .35em rgb(23 32 51 / .12)}
    .note .bar {height: .35em; margin-block: .3em; background: rgb(23 32 51 / .11)}
    .note:nth-child(1) {left: 1em; top: 1.1em; background: #f1e3b8; rotate: -2deg}
    .note:nth-child(2) {left: 6em; top: 1.6em; background: #d6e2f0; rotate: 2deg}
    .note:nth-child(3) {left: 11em; top: .9em; background: #d5e7dc; rotate: -1deg}
    .notes {padding-block-end: .6em; border-style: dashed}
    .notes .tools {border-bottom-style: dashed}
    .notes > .bar {margin-inline: .6em}
    .notes[data-hidden] {background: repeating-linear-gradient(135deg, #f3f5f8 0 .35em, white .35em .7em)}
    .notes[data-hidden] > .bar {opacity: .55}
    .hidden-icon {color: #8792a2}
    .hidden-icon svg {width: .95em; height: .95em}

    .tablet-label {position: absolute; left: var(--tablet-x); top: calc(var(--tablet-y) - 1.5em); width: 16.4em; text-align: center}
    .tablet-label span {color: #617084; font-size: .55em; font-weight: 600; letter-spacing: .06em; text-transform: uppercase}
    /* A small portrait tablet that overlaps the host's window a little. */
    .tablet {position: absolute; z-index: 1; left: var(--tablet-x); top: var(--tablet-y); width: 16.4em; height: 21.8em; padding: .75em .65em; border-radius: 1.3em; background: #1f2937; box-shadow: 0 .8em 2.2em rgb(23 32 51 / .24)}
    .tablet::before {position: absolute; top: .27em; left: 50%; width: .26em; height: .26em; border-radius: 50%; background: #4b5563; translate: -50% 0; content: ""}
    .screen {position: relative; height: 100%; overflow: hidden; padding: 1.2em 1.2em .9em; border-radius: .6em; background: white}
    .learner {animation: appear 300ms ease both}
    .learner .block {margin-block-start: .8em}
    .mini-tools {display: flex; align-items: center; justify-content: space-between; height: 1.6em; padding-inline: .35em; border-bottom: 1px solid #dfe5ed; background: #f7f9fc}
    .mates {display: flex}
    .mates .avatar {width: 2.5em; height: 2.5em; margin-inline-end: -.7em; font-size: .4em}
    .lock {color: #8792a2}
    .lock svg {display: block; width: .9em; height: .9em}
    .learner .area {height: 7.2em}
    .learner .note {width: 3.6em; height: 3.6em; padding: .45em}
    .learner .note:nth-child(1) {left: .7em; top: .9em}
    .learner .note:nth-child(2) {left: 5em; top: 1.5em}
    .learner .note:nth-child(3) {left: 9.3em; top: .8em}
    .note[data-moving] {animation: slide 3.2s ease-in-out infinite}
    .typed {display: flex; align-items: center; height: .5em}
    .typed::before {display: block; height: .35em; border-radius: .2em; background: rgb(23 32 51 / .3); content: ""; animation: type 3s steps(6, end) infinite}
    .typed::after {display: block; width: .08em; height: .7em; margin-inline-start: .05em; background: #263142; content: ""; animation: blink 1s steps(1) infinite}
    .cursor {position: absolute; left: calc(2em + var(--i) * 2.6em); top: calc(3.3em - var(--i) * .9em); width: .75em; color: var(--color); animation: drift calc(3.4s + var(--i) * .7s) ease-in-out infinite}
    .cursor svg {display: block; width: 100%}
    .learner .notes {padding: .3em 0 .4em}
    .learner .notes > .bar {margin-inline: .5em}
    .join {display: grid; place-items: center; align-content: center; gap: 1em; height: 100%}
    .viewfinder {position: relative; width: 7em; height: 7em; padding: .8em}
    .viewfinder::before {position: absolute; inset: 0; border: .25em solid #3977c7; content: "";
      mask: conic-gradient(at 1.4em 1.4em, transparent 75%, black 0) 0 0 / calc(100% - 1.4em) calc(100% - 1.4em)}
    .viewfinder svg {display: block; width: 100%; height: 100%; fill: #263142}
    .join .bar {width: 6em}

    /* A page notice, such as availability, rests on top of the scene. */
    .status {position: absolute; z-index: 3; top: 1rem; left: 50%; display: flex; justify-content: center; width: max-content; max-width: calc(100% - 2rem); translate: -50% 0}
    .callouts {position: absolute; z-index: 2; inset: 0; pointer-events: none}
    .callout {position: absolute; width: 15.6em; pointer-events: auto}
    .callout[data-step="share"] {left: 1.2em; top: 9.2em}
    .callout[data-step="groups"] {left: 1.2em; bottom: 1.4em}
    .callout[data-step="permissions"] {left: 45.4em; bottom: 1.4em; width: 17.4em}
    ::slotted(article) {display: block; padding: .85rem 1rem .9rem; border: 1px solid #dfe5ed; border-radius: .6rem; background: rgb(255 255 255 / .97); box-shadow: 0 .5rem 1.5rem rgb(23 32 51 / .12); transition: border-color 160ms ease, box-shadow 160ms ease}
    .callout[data-active] ::slotted(article) {border-color: #8eb6df; box-shadow: 0 .5rem 1.5rem rgb(23 32 51 / .12), 0 0 0 3px rgb(57 119 199 / .2)}
    .number {position: absolute; top: -.6rem; left: -.6rem; z-index: 1; display: grid; place-items: center; width: 1.45rem; height: 1.45rem; border: 2px solid white; border-radius: 50%; background: #155e9b; color: white; font: 700 .72rem/1 system-ui, sans-serif}

    /* Without room for overlays, the cards follow the scene. */
    @container (max-width: 62rem) {
      .showcase {--window-x: 8em; --page-x: 7em; --tablet-x: 39.4em; --tablet-y: 8.8em}
      .window {width: 40em}
      .callouts {position: static; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.5rem; margin-block-start: 1.75rem}
      .callout, .callout[data-step] {position: relative; inset: auto; width: auto}
      ::slotted(article) {height: 100%; box-shadow: none}
    }
    @container (max-width: 40rem) {.callouts {grid-template-columns: minmax(0, 1fr); gap: 1.25rem} .status {top: .5rem; max-width: calc(100% - 1rem)}}

    @keyframes join {from {opacity: 0; transform: scale(.3)} to {opacity: 1; transform: none}}
    @keyframes appear {from {opacity: 0; transform: translateY(.6em)}}
    @keyframes pulse {from {box-shadow: 0 0 0 0 rgb(57 119 199 / .55)} to {box-shadow: 0 0 0 .8em rgb(57 119 199 / 0)}}
    @keyframes slide {0%, 15%, 100% {translate: 0 0} 45%, 70% {translate: .4em 1.6em}}
    @keyframes type {from {width: 0} to {width: 2em}}
    @keyframes blink {50% {opacity: 0}}
    @keyframes drift {0%, 100% {translate: 0 0} 50% {translate: 1.2em -.6em}}
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {animation: none !important; transition: none !important}
    }
  `

  render() {
    const size = this.everyone ? learners.length : this.groupSize
    const mates = learners.slice(0, size)
    const sizeLabel = this.groupSize === 1 ? t("single") : this.groupSize === 2 ? t("pair") : t("groups")
    return html`<div class="showcase" data-active=${this.active ?? nothing}>
      <div class="status"><slot name="status"></slot></div>
      <div class="stage" role="group" aria-label=${t("Live session preview")}>
        <div class="window">
          <div class="titlebar" aria-hidden="true"><img src=${appIconUrl} alt=""><span class="bar"></span><span class="preview">${ribbonIcon("Preview")}</span></div>
          <div class="drawer">
            <div class="hot sharing" data-step="share">
              <span class="icon" aria-hidden="true">${ribbonIcon("Share")}</span>
              <button class="switch" type="button" role="switch" aria-checked=${String(this.shared)} aria-label=${t("Share")} @click=${this.toggleShare}></button>
              <span class="label" aria-hidden="true">${t("Share")}</span>
              <span class="link" aria-hidden="true" translate="no">${this.shared ? "webwriter.app/join/…" : ""}</span>
              <span class="qr" aria-hidden="true">${ribbonIcon("QR")}${this.shared && this.active === "share" ? html`<span class="qr-popover">${qrCode}</span>` : nothing}</span>
              <span class="marker" aria-hidden="true">1</span>
            </div>
            <span class="divider" aria-hidden="true"></span>
            <div class="seats" aria-hidden="true">${this.shared ? learners.map((learner, index) => html`<span class="seat"
              ?data-grouped=${size > 1} ?data-start=${index % size === 0} ?data-end=${index % size === size - 1 || index === learners.length - 1}
              ><span class="avatar" style="--i: ${index}; --color: ${learner.color}">${learner.initials}</span></span>`) : nothing}</div>
          </div>
          <div class="canvas">
            <div class="page">
              <span class="bar heading" aria-hidden="true"></span><span class="bar" aria-hidden="true"></span><span class="bar short" aria-hidden="true"></span>
              <div class="block board">
                <div class="tools">
                  <div class="hot" data-step="groups">
                    <span class="counter">
                      <button type="button" aria-label=${t("Smaller group")} ?disabled=${!this.everyone && this.groupSize === 1} @click=${() => this.resize(-1)}>${minus}</button>
                      <span class="size" aria-live="polite"><span class="icon" aria-hidden="true">${ribbonIcon("KeywordDistributable")}</span>${this.groupSize > 2 ? html`<b>×${this.groupSize}</b>` : nothing}<span>${sizeLabel}</span></span>
                      <button type="button" aria-label=${t("Bigger group")} ?disabled=${!this.everyone && this.groupSize === maxGroupSize} @click=${() => this.resize(1)}>${ribbonIcon("Plus")}</button>
                      <button class="all" type="button" aria-pressed=${String(this.everyone)} @click=${() => { this.everyone = !this.everyone }}>${t("All")}</button>
                    </span>
                    <span class="marker" aria-hidden="true">2</span>
                  </div>
                  <div class="hot" data-step="permissions">
                    ${this.chip("Edit", "Pencil", this.canEdit, () => { this.canEdit = !this.canEdit })}
                    ${this.chip("Move", "Position", this.canMove, () => { this.canMove = !this.canMove })}
                  </div>
                </div>
                <div class="area" aria-hidden="true">${[0, 1, 2].map(() => html`<span class="note"><span class="bar"></span><span class="bar short"></span></span>`)}</div>
              </div>
              <div class="block notes" ?data-hidden=${!this.notesVisible}>
                <div class="tools">
                  <div class="hot" data-step="permissions">
                    ${this.chip("View", "Visible", this.notesVisible, () => { this.notesVisible = !this.notesVisible })}
                    <span class="marker" aria-hidden="true">3</span>
                  </div>
                  ${this.notesVisible ? nothing : html`<span class="hidden-icon" aria-hidden="true">${ribbonIcon("Hidden")}</span>`}
                </div>
                <span class="bar" aria-hidden="true"></span><span class="bar short" aria-hidden="true"></span>
              </div>
              <span class="bar" aria-hidden="true"></span><span class="bar short" aria-hidden="true"></span>
            </div>
          </div>
        </div>
        <div class="tablet-label" aria-hidden="true"><span>${t("Learner view")}</span></div>
        <div class="tablet" aria-hidden="true"><div class="screen">${this.shared ? html`<div class="learner">
          <span class="bar heading"></span><span class="bar"></span>
          <div class="block board">
            <div class="mini-tools"><span class="mates">${mates.map(learner => html`<span class="avatar" style="--color: ${learner.color}">${learner.initials}</span>`)}</span>${this.canEdit ? nothing : html`<span class="lock">${ribbonIcon("Lock")}</span>`}</div>
            <div class="area">
              <span class="note"><span class="bar"></span>${this.canEdit ? html`<span class="typed"></span>` : html`<span class="bar short"></span>`}</span>
              <span class="note" ?data-moving=${this.canMove}><span class="bar"></span><span class="bar short"></span></span>
              <span class="note"><span class="bar"></span><span class="bar short"></span></span>
              ${mates.slice(1, 4).map((learner, index) => html`<span class="cursor" style="--i: ${index}; --color: ${learner.color}">${cursor}</span>`)}
            </div>
          </div>
          ${this.notesVisible ? html`<div class="block notes"><span class="bar"></span><span class="bar short"></span></div>` : nothing}
          <span class="bar"></span><span class="bar"></span><span class="bar short"></span>
        </div>` : html`<div class="join"><span class="viewfinder">${qrCode}</span><span class="bar"></span></div>`}</div></div>
      </div>
      <div class="callouts">${steps.map((step, index) => html`<div class="callout" data-step=${step} ?data-active=${this.active === step}>
        <span class="number" aria-hidden="true">${index + 1}</span><slot name=${step}></slot>
      </div>`)}</div>
    </div>`
  }
}

if(!customElements.get("live-session-showcase")) customElements.define("live-session-showcase", LiveSessionShowcase)
