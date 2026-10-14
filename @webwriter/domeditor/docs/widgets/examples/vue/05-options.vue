<script setup>
import {computed, onBeforeUnmount, onMounted, ref, useHost} from "vue/dist/vue.runtime.esm-browser.js"

const host = useHost()
const choice = ref("")
const revision = ref(0)
const editing = computed(() => {
  revision.value
  return Boolean(host?.isContentEditable)
})
const result = computed(() => {
  revision.value
  return choice.value ? (choice.value === (host?.answer ?? "false") ? "Correct!" : "Try again.") : ""
})
const refresh = () => { revision.value++ }
const choose = value => {
  if(!editing.value) choice.value = value
}

onMounted(() => host?.addEventListener("quizrefresh", refresh))
onBeforeUnmount(() => host?.removeEventListener("quizrefresh", refresh))
</script>

<template>
  <section>
    <slot><p>Add a question.</p></slot>
    <div class="controls" :hidden="editing">
      <button type="button" value="true" @click="choose('true')">True</button>
      <button type="button" value="false" @click="choose('false')">False</button>
    </div>
    <p class="author-hint" :hidden="!editing">Edit the question and correct answer, then use Preview.</p>
    <output aria-live="polite">{{ result }}</output>
  </section>
</template>

<style>
:host {
  display: block; box-sizing: border-box;
  max-inline-size: var(--ww-widget-max, var(--ww-prose-max, 45rem));
  min-inline-size: 0; margin-inline: auto; padding: 1rem;
  border: 1px solid #cbd5e1; border-radius: .5rem;
  background: white; color: #1f2937; container-type: inline-size;
  overflow-wrap: anywhere;
}
.controls { display: flex; flex-wrap: wrap; gap: .5rem; }
.controls[hidden] { display: none; }
button { font: inherit; padding: .5rem .9rem; max-inline-size: 100%; }
button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
output { display: block; min-block-size: 1.5em; margin-block-start: .75rem; }
</style>
