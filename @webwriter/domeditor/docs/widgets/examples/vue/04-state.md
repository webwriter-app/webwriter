Use a Vue ref for the reader's temporary choice. Read `isContentEditable` on the host element. The widget uses preview mode when the host has `contenteditable="false"`.

~~~vue
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
~~~

The registration module supplies the `answer` attribute. It sends a notification to the component when the answer or edit state changes.
