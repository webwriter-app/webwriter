<svelte:options
  customElement={{
    tag: "ww-b-world",
    shadow: "open",
    extend: (Base) =>
      class World extends withDeclarations(withWidgetRuntime(Base)) {
        static actions = {
          fit: { label: { _: "Fit" }, shortcut: "F" },
          remove: { label: { _: "Remove the last chip" }, shortcut: "Delete" },
        }
        // The Delete key has nothing to do without a chip: the action declines it.
        remove() {
          return this.removeLast()
        }
        fit() {
          void this.viewport.fit()
        }
      },
  }}
/>

<script module>
  import { withDeclarations, withWidgetRuntime } from "@webwriter/svelte"
</script>

<script>
  import { dragStore } from "@webwriter/svelte/drag"
  import { shortcutsStore } from "@webwriter/svelte/shortcuts"
  import { viewportStore } from "@webwriter/svelte/viewport"

  const host = $host()

  const BOARD = { x: 0, y: 0, width: 1200, height: 800 }
  let chips = $state([])

  // The options of Viewport that the checks vary come from attributes of the host: the wheel, what a resize keeps still,
  // the first view and the follow of a fit (a function is asked when the window first has a size, and at every fit).
  const viewport = viewportStore(host, {
    bounds: () => BOARD,
    margin: 2000,
    wheel: host.getAttribute("wheel") ?? undefined,
    resize: host.getAttribute("resize") ?? undefined,
    start: () => (host.hasAttribute("start-x") ? { centre: { x: Number(host.getAttribute("start-x")), y: Number(host.getAttribute("start-y")) }, scale: 1 } : undefined),
    fit: () => ({ follow: host.getAttribute("follow") ?? undefined }),
  })
  // The viewport converts the pointer's place into the world's.
  const drag = dragStore(host, { viewport: viewport.core })
  const shortcuts = shortcutsStore(host)
  host.viewport = viewport
  host.drag = drag
  host.shortcuts = shortcuts
  host.chips = () => $state.snapshot(chips)
  host.lastDrop = null
  host.removeLast = () => {
    if (!chips.length) return false
    chips.pop()
    return true
  }

  function drop(event) {
    const { x, y, key } = event.detail
    host.lastDrop = { x, y, key }
    if (x === null || y === null) return
    chips.push({ id: `c${chips.length}`, x, y })
  }
</script>

<div class="side">
  <div class="chip" data-ww-drag="chip" data-ww-drag-effect="copy" data-ww-key="and" data-ww-label="AND" tabindex="0">AND</div>
  <button data-ww-shortcut="fit" onclick={() => host.fit()}>Fit</button>
</div>
<div
  class="board"
  data-ww-viewport="canvas"
  data-ww-viewport-zoom="0.25 4"
  data-ww-drop="chip"
  data-ww-drop-position="point"
  data-ww-drop-space="world"
  aria-label="Board"
  tabindex="0"
  onww-dragcommit={drop}
>
  <div class="world" style:transform="translate({$viewport.x}px, {$viewport.y}px) scale({$viewport.scale})">
    {#each chips as chip (chip.id)}
      <div class="placed" style:left="{chip.x}px" style:top="{chip.y}px"></div>
    {/each}
  </div>
</div>

<style>
  :host { display: flex; width: 640px; height: 260px; }
  .side { width: 120px; padding: 6px; box-sizing: border-box; border: 1px solid #c8c8c8; }
  .chip { width: 60px; padding: 4px; margin-bottom: 4px; border: 1px solid #555; background: #fff; cursor: grab; touch-action: none; }
  .board { position: relative; flex: 1; min-width: 0; overflow: hidden; border: 1px solid #c8c8c8; background: #f4f4f5; }
  .world { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; }
  .placed { position: absolute; width: 60px; height: 30px; box-sizing: border-box; border: 1px solid #555; background: #bfdbfe; }
</style>
