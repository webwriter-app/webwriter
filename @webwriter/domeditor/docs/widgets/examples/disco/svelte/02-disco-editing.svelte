<svelte:options customElement={{ tag: "ww-ghost-disco" }} />

<script>
  const host = $host()
  let editing = $state(false)
  $effect(() => {
    const update = () => { editing = host.isContentEditable }
    const observer = new MutationObserver(update)
    observer.observe(host, {attributes: true, attributeFilter: ["contenteditable"]})
    update()
    return () => observer.disconnect()
  })
</script>

<div class="stage">
  <slot><p>Join the midnight dance party.</p></slot>
  <span class="ghost" aria-hidden="true">👻</span>
  <div class="controls" hidden={editing}>
    <button type="button" value="float">Float</button>
    <button type="button" value="twirl">Twirl</button>
  </div>
  <p class="author-hint" hidden={!editing}>Edit the invitation in the document.</p>
  <output aria-live="polite">Pick a dance move.</output>
</div>

<style>
  :host { display: block; }
  .stage { padding: 1rem; border: 1px solid #90a6cd; border-radius: .75rem; background: #e5edff; color: #172c5a; text-align: center; }
  .ghost { display: block; margin-block: .75rem; font-size: 2.75rem; }
  .controls { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; }
  .controls[hidden] { display: none; }
  button { font: inherit; padding: .375rem .75rem; }
  output { display: block; margin-block-start: .75rem; }
</style>
