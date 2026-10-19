<script setup>
import {computed, onBeforeUnmount, onMounted, ref, useHost} from "vue/dist/vue.runtime.esm-browser.js"

const host = useHost()
const readyBlock = ref(host?._readyBlock ?? null)
const dataError = ref(host?._dataError ?? "")
const answer = ref(host?.answer ?? "false")
const viewRevision = ref(0)
const block = () => host?.querySelector(':scope > script[type="application/json"][slot="data"]:not([src])') ?? null
const choice = computed(() => {
  viewRevision.value
  try {
    const value = JSON.parse(block()?.textContent || "{}").choice
    return value === "true" || value === "false" ? value : ""
  }
  catch { return "" }
})
const editing = computed(() => {
  viewRevision.value
  return Boolean(host?.isContentEditable)
})
const ready = computed(() => {
  viewRevision.value
  const current = block()
  return Boolean(current && current === readyBlock.value)
})
const result = computed(() => {
  viewRevision.value
  return dataError.value || (!ready.value
    ? "Loading answers…"
    : (choice.value ? (choice.value === answer.value ? "Correct!" : "Try again.") : ""))
})
const refresh = () => {
  readyBlock.value = host?._readyBlock ?? null
  dataError.value = host?._dataError ?? ""
  answer.value = host?.answer ?? "false"
  viewRevision.value++
}
const choose = value => {
  const data = block()
  if(editing.value || !data || data !== readyBlock.value) return
  try {
    const state = JSON.parse(data.textContent || "{}")
    data.textContent = JSON.stringify({...state, choice: value})
    dataError.value = ""
    host._dataError = ""
    host._notifyView()
  }
  catch(exception) {
    dataError.value = exception.message
    host._dataError = exception.message
    host._notifyView()
  }
}

onMounted(() => host?.addEventListener("quizrefresh", refresh))
onBeforeUnmount(() => host?.removeEventListener("quizrefresh", refresh))
</script>

<template>
  <section>
    <slot><p>Add a question.</p></slot>
    <div class="controls" :hidden="editing">
      <button type="button" value="true" :disabled="!ready" @click="choose('true')">True</button>
      <button type="button" value="false" :disabled="!ready" @click="choose('false')">False</button>
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
