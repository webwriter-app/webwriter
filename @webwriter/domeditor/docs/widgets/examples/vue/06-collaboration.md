The final component keeps the current JSON data block in the authored DOM. Its Vue setup reads the current direct-child block for display and checks it again before every write. The registration class captures data events, accepts only events from that current block, and clears readiness when shared mode or the block changes.

The component uses useHost() to reach the widget and listens for the bridge’s view refresh event:

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

The registration module owns early data-event capture, native answer access, readiness invalidation, and listener/observer cleanup. See 06-collaboration.js for the complete bridge and 06-collaboration.vue for the complete component.
