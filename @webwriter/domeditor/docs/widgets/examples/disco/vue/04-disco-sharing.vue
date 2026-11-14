<script setup>
import {computed, useHost} from "vue"
import {useWidget} from "@webwriter/vue"
import {readDance, chooseDance} from "#disco-reading"

const host = useHost()
const widget = useWidget(host)
const editing = computed(() => widget.value.editable)
const dance = computed(() => {
  const {data, dataReady, dataError} = widget.value
  return readDance(data, dataReady, dataError)
})
const status = computed(() => dance.value.status)
const choose = move => chooseDance(host.widgetRuntime, move)
</script>

<template>
  <div class="stage">
    <slot><p>Join the midnight dance party.</p></slot>
    <span class="ghost" aria-hidden="true" :data-move="dance.move">👻</span>
    <div class="controls" :hidden="editing">
      <button type="button" value="float" :disabled="!dance.ready" :aria-pressed="dance.move === 'float'" @click="choose('float')">Float</button>
      <button type="button" value="twirl" :disabled="!dance.ready" :aria-pressed="dance.move === 'twirl'" @click="choose('twirl')">Twirl</button>
    </div>
    <p class="author-hint" :hidden="!editing">Edit the invitation in the document.</p>
    <output aria-live="polite">{{ status }}</output>
  </div>
</template>

<style>
  :host { display: block; }
  .stage { padding: 1rem; border: 1px solid #90a6cd; border-radius: .75rem; background: #e5edff; color: #172c5a; text-align: center; }
  .ghost { display: block; margin-block: .75rem; font-size: 2.75rem; }
  .controls { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; }
  .controls[hidden] { display: none; }
  button { font: inherit; padding: .375rem .75rem; }
  output { display: block; margin-block-start: .75rem; }

  :host { container-type: inline-size; }
  .controls { display: grid; }
  .controls[hidden] { display: none; }
  @container (min-width: 24rem) {
    .controls { display: flex; justify-content: center; }
  }

  .ghost[data-move="float"] { transform: translateY(-.3rem); }
  .ghost[data-move="twirl"] { transform: rotate(24deg); }
  button[aria-pressed="true"] { outline: 2px solid currentColor; outline-offset: 2px; }
</style>
