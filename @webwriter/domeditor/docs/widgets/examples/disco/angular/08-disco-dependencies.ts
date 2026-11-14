import {withAuthoring} from "#disco-authoring"
import {withParticipation} from "#disco-participation"
import {withDependencies} from "#disco-dependencies"
import "#disco-scoreboard"

import "@angular/compiler"
import {Component, computed} from "@angular/core"
import {createAngularWidget, injectWidget, injectWidgetHost} from "@webwriter/angular"
import {readDance, chooseDance} from "#disco-dance"

type Lighting = "moonlight" | "neon"

@Component({
  selector: "ww-ghost-disco-view",
  standalone: true,
  template: `
    <section class="stage" [attr.data-lighting]="lighting()" aria-label="Ghost Disco">
      <h2><span class="locale-label" part="title"><span lang="en">Dance party</span><span lang="de">Tanzparty</span></span></h2>
      <span class="ghost" part="ghost" aria-hidden="true" [attr.data-move]="dance().move">👻</span>
      <slot><p>Join the midnight dance party.</p></slot>
      <div class="controls" [hidden]="widget().editable">
        <button type="button" value="float" [attr.aria-pressed]="dance().move === 'float'" (click)="choose('float')" [disabled]="!dance().ready">Float</button>
        <button type="button" value="twirl" [attr.aria-pressed]="dance().move === 'twirl'" (click)="choose('twirl')" [disabled]="!dance().ready">Twirl</button>
      </div>
      <p [hidden]="!widget().editable"><button type="button" data-edit-invitation>Edit invitation text</button></p>
      <p class="dance-tip"><button type="button" data-dance-tip>Show a dance tip</button><output></output></p>
      <p class="print-line">Circle a dance move: Float / Twirl</p>
      <output aria-live="polite">{{message()}}</output>
    </section>
  `,
})
class GhostDisco {
  private readonly host = injectWidgetHost()
  readonly widget = injectWidget()
  readonly lighting = computed(() => this.widget().attributes.lighting === "neon" ? "neon" : "moonlight")
  readonly dance = computed(() => readDance(this.widget()))
  readonly message = computed(() => {
    const {move, error} = this.dance()
    return error || (move === "float" ? "The ghost floats!" : move === "twirl" ? "The ghost twirls!" : "Pick a dance move.")
  })

  choose(move: "float" | "twirl"): void { chooseDance(this.host, move) }
}

const styles = `
  :host { display: block; }
  .stage {
    box-sizing: border-box;
    max-inline-size: var(--ww-widget-max, var(--ww-prose-max, 45rem));
    margin-inline: auto;
    padding: 1rem;
    border-radius: .75rem;
    background: #e5edff;
    color: #172c5a;
    text-align: center;
    overflow-wrap: anywhere;
  }
  .stage[data-lighting="neon"] { background: #321952; color: #fcf1ff; }
  .ghost { display: inline-block; font-size: 3rem; line-height: 1.5; }
  .ghost[data-move="float"] { transform: translateY(-.25em); }
  .ghost[data-move="twirl"] { transform: rotate(-25deg) scale(1.1); }
  .controls { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; }
  .controls[hidden] { display: none; }
  button {
    font: inherit;
    padding: .4rem .8rem;
    border: 1px solid currentColor;
    border-radius: 1rem;
    color: inherit;
    background: transparent;
  }
  button[aria-pressed="true"] { font-weight: bold; }
  button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  output { display: block; margin-block-start: .75rem; }
  :host { container-type: inline-size; overflow-wrap: anywhere; }
  .controls { display: grid; }
  .controls[hidden] { display: none; }
  @container (min-width: 24rem) {
    .controls { display: flex; justify-content: center; }
  }
  :host { font-family: var(--ww-font-family, inherit); }
  .stage[data-lighting="moonlight"] { color: var(--ww-text-color, #172c5a); }
  .ghost { text-shadow: 0 0 .6rem var(--ww-theme-accent-1, #b4c9fb); }
  .print-line { display: none; }
  @media print {
    .stage[data-lighting] { color: #000; background: #fff; }
    .controls, .author-hint, [data-edit-invitation], output { display: none; }
    .print-line { display: block; }
  }
  .locale-label > [lang="de"], :host(:lang(de)) .locale-label > [lang="en"] { display: none; }
  :host(:lang(de)) .locale-label > [lang="de"] { display: inline; }
  :host(:not([allow-tips])) .dance-tip, :host([contenteditable]) .dance-tip { display: none; }
  @media print { .dance-tip { display: none; } }`

class GhostDiscoElement extends await createAngularWidget(GhostDisco, {styles}) {
  static widgetAttributes = ["lighting"]

  get lighting(): Lighting { return this.getAttribute("lighting") === "neon" ? "neon" : "moonlight" }
  set lighting(value: string | null | undefined) {
    if(value == null) this.removeAttribute("lighting")
    else this.setAttribute("lighting", value === "neon" ? "neon" : "moonlight")
  }

  static options = {
    lighting: {
      type: "select",
      label: {_: "Lighting"},
      group: "disco",
      options: [
        {value: "moonlight", label: {_: "Moonlight"}},
        {value: "neon", label: {_: "Neon"}},
      ],
    },
  }
  static optionGroups = {disco: {label: {_: "Disco settings"}}}
  static actions = {resetLighting: {group: "disco", label: {_: "Reset lighting"}}}

  resetLighting(): void { this.lighting = "moonlight" }
}

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", withDependencies(withParticipation(withAuthoring(GhostDiscoElement))))
