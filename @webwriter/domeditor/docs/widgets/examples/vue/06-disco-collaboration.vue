<script setup>
import {computed, onMounted, onBeforeUnmount, ref, useHost} from "vue/dist/vue.runtime.esm-browser.js"

const host = useHost()
const lighting = ref(host.lighting)
const move = ref(host.move)
const editing = ref(host.isContentEditable)
const ready = ref(host.ready)
const error = ref(host.dataError)
const result = computed(() => move.value === "float" ? "The ghost floats!" : move.value === "twirl" ? "The ghost twirls!" : "Pick a dance move.")
const refresh = () => {
  lighting.value = host.lighting
  move.value = host.move
  editing.value = host.isContentEditable
  ready.value = host.ready
  error.value = host.dataError
}
const choose = move => host.choose(move)

onMounted(() => host.addEventListener("discorefresh", refresh))
onBeforeUnmount(() => host.removeEventListener("discorefresh", refresh))
</script>

<template>
  <section class="stage" :data-lighting="lighting">
    <h2>Ghost Disco</h2>
    <span class="ghost" aria-hidden="true" :data-move="move">👻</span>
    <slot><p>Join the midnight dance party.</p></slot>
    <div class="controls" :hidden="editing">
      <button type="button" value="float" :disabled="!ready" :aria-pressed="move === 'float'" @click="choose('float')">Float</button>
      <button type="button" value="twirl" :disabled="!ready" :aria-pressed="move === 'twirl'" @click="choose('twirl')">Twirl</button>
    </div>
    <p :hidden="!editing">Edit the invitation and lighting, then try the moves in Preview.</p>
    <output aria-live="polite">{{ error || result }}</output>
  </section>
</template>

<style>
  :host {
    display: block;
    max-inline-size: var(--ww-widget-max, var(--ww-prose-max, 45rem));
    margin-inline: auto;
  }
  .stage {
    box-sizing: border-box;
    padding: 1rem;
    border: 1px solid currentColor;
    border-radius: .75rem;
    background: #e5edff;
    color: #172c5a;
    text-align: center;
    overflow-wrap: anywhere;
  }
  .stage[data-lighting="neon"] { background: #321952; color: #fcf1ff; }
  h2 { margin: 0; font: inherit; font-weight: bold; }
  .ghost { display: block; margin-block: .75rem; font-size: 3rem; line-height: 1.25; }
  .ghost[data-move="float"] { transform: translateY(-.3rem) rotate(-12deg); }
  .ghost[data-move="twirl"] { transform: rotate(24deg); }
  .controls { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; }
  .controls[hidden] { display: none; }
  button {
    font: inherit;
    padding: .4rem .75rem;
    border: 1px solid currentColor;
    border-radius: .4rem;
    color: inherit;
    background: transparent;
  }
  button[aria-pressed="true"] { box-shadow: inset 0 0 0 1px currentColor; font-weight: bold; }
  button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  output { display: block; margin-block-start: .75rem; }
</style>
