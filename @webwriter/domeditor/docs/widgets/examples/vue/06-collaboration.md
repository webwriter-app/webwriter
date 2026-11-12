Keep the JSON data block in the document. The component reads the current direct child block to update the display. It checks the current block again before each write. The registration class accepts data events only from the current block. The widget waits for new data when `shared` or the block changes.

The component uses `useHost()` to get the host element. It listens for an event from the host element to update the view.

~~~vue
<script setup>
import {computed, onBeforeUnmount, onMounted, ref, useHost} from "vue/dist/vue.runtime.esm-browser.js"

const host = useHost()
const readyBlock = ref(host?._readyBlock ?? null)
const dataError = ref(host?._dataError ?? "")
const revision = ref(0)
const block = () => host?.querySelector(
  ':scope > script[type="application/json"][slot="data"]:not([src])') ?? null
const choice = computed(() => {
  revision.value
  try {
    const value = JSON.parse(block()?.textContent || "{}").choice
    return value === "true" || value === "false" ? value : ""
  }
  catch { return "" }
})
const refresh = () => {
  readyBlock.value = host?._readyBlock ?? null
  dataError.value = host?._dataError ?? ""
  revision.value++
}
onMounted(() => host?.addEventListener("quizrefresh", refresh))
onBeforeUnmount(() => host?.removeEventListener("quizrefresh", refresh))
</script>
~~~

The registration module in `06-collaboration.js` receives data events, supplies the `answer` property, and waits for new data when necessary. It removes the listeners and observer when the element disconnects. The component is in `06-collaboration.vue`.
