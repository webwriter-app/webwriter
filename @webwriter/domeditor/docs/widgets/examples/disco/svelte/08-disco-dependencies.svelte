<script module>
import {withAuthoring} from "#disco-authoring"
import {withParticipation} from "#disco-participation"
import {withDependencies} from "#disco-dependencies"
import "#disco-scoreboard"
import {widgetStore, withWidgetRuntime} from "@webwriter/svelte"
import {readDance, chooseDance} from "#disco-dance"
</script>

<svelte:options
  customElement={{
    tag: "ww-ghost-disco",
    extend: Base => withDependencies(withParticipation(withAuthoring(class extends withWidgetRuntime(Base) {
      static widgetAttributes = ["lighting"]

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

      get lighting() { return this.getAttribute("lighting") === "neon" ? "neon" : "moonlight" }
      set lighting(value) {
        if(value == null) this.removeAttribute("lighting")
        else this.setAttribute("lighting", value === "neon" ? "neon" : "moonlight")
      }

      resetLighting() { this.lighting = "moonlight" }
    }))),
  }}
/>

<script>
  const host = $host()
  const widget = widgetStore(host)
  const lighting = $derived($widget.attributes.lighting === "neon" ? "neon" : "moonlight")
  const {move, ready, error} = $derived(readDance($widget))
  const editing = $derived($widget.editable)
  const message = $derived(error || (move === "float" ? "The ghost floats!" : move === "twirl" ? "The ghost twirls!" : "Pick a dance move."))
  const choose = move => chooseDance(host, move)
</script>

<section class="stage" data-lighting={lighting} aria-label="Ghost Disco">
  <h2><span class="locale-label" part="title"><span lang="en">Dance party</span><span lang="de">Tanzparty</span></span></h2>
  <span class="ghost" part="ghost" aria-hidden="true" data-move={move}>👻</span>
  <slot><p>Join the midnight dance party.</p></slot>
  <div class="controls" hidden={editing}>
    <button type="button" value="float" aria-pressed={move === "float"} onclick={() => choose("float")} disabled={!ready}>Float</button>
    <button type="button" value="twirl" aria-pressed={move === "twirl"} onclick={() => choose("twirl")} disabled={!ready}>Twirl</button>
  </div>
  <p hidden={!editing}><button type="button" data-edit-invitation>Edit invitation text</button></p>
  <p class="dance-tip"><button type="button" data-dance-tip>Show a dance tip</button><output></output></p>
  <p class="print-line">Circle a dance move: Float / Twirl</p>
  <output aria-live="polite">{message}</output>
</section>

<style>
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
    @media print { .dance-tip { display: none; } }
</style>
