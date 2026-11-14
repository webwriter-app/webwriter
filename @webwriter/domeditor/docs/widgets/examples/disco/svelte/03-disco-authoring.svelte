<script module>
import {withAuthoring} from "#disco-authoring"
</script>

<svelte:options customElement={{ tag: "ww-ghost-disco", extend: Base => withAuthoring(Base) }} />

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

<section class="stage" data-lighting="moonlight" aria-label="Ghost Disco">
  <h2>Ghost Disco</h2>
  <span class="ghost" aria-hidden="true">👻</span>
  <slot><p>Join the midnight dance party.</p></slot>
  <div class="controls" hidden={editing}>
    <button type="button" value="float">Float</button>
    <button type="button" value="twirl">Twirl</button>
  </div>
  <p class="author-hint" hidden={!editing}><button type="button" data-edit-invitation>Edit invitation text</button></p>
  <output aria-live="polite">Pick a dance move.</output>
</section>

<style>
  :host { display: block; }
  .stage {
    box-sizing: border-box;
    max-inline-size: var(--ww-widget-max, var(--ww-prose-max, 45rem));
    margin-inline: auto;
    padding: 1rem;
    border-radius: .75rem;
    background: #e5edff;
    color: #172c5a;
    text-align: center;
    overflow-wrap: anywhere;
  }
  .ghost { display: inline-block; font-size: 3rem; line-height: 1.5; }
  .controls { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; }
  button {
    font: inherit;
    padding: .4rem .8rem;
    border: 1px solid currentColor;
    border-radius: 1rem;
    color: inherit;
    background: transparent;
  }
  button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  output { display: block; margin-block-start: .75rem; }
</style>
