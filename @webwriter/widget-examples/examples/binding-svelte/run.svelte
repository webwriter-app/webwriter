<svelte:options customElement={{ tag: "ww-b-run", shadow: "open", extend: (Base) => withWidgetRuntime(Base) }} />

<script module>
  import { withWidgetRuntime } from "@webwriter/svelte"
</script>

<script>
  import { jsonDataStore } from "@webwriter/svelte/data"
  import { localizeStore } from "@webwriter/svelte/localize"
  import { playbackStore } from "@webwriter/svelte/playback"

  const host = $host()
  const names = ["one", "two", "three", "four"]

  let shown = $state(0)
  const playback = playbackStore(host, { steps: () => names.length, show: (index) => (shown = index), interval: 1 })
  const data = jsonDataStore(host, { defaults: { count: 0 }, block: "document" })
  const l10n = localizeStore(host, {
    sourceLocale: "en",
    targetLocales: ["de"],
    load: async () => ({ templates: { greeting: "Hallo" } }),
  })
  host.playback = playback
  host.data = data
  host.l10n = l10n
</script>

<p class="step">{names[shown]} {$playback.paused ? "paused" : "playing"} {$playback.step}/{$playback.steps}</p>
<button data-ww-playback="toggle">Play</button>
<button data-ww-playback="step">Step</button>
<button data-ww-playback="back">Back</button>
<button data-ww-playback="reset">Reset</button>
<button class="count" onclick={() => data.set({ count: $data.value.count + 1 })}>Count {$data.value.count}</button>
<p class="locale">{$l10n.locale}</p>
