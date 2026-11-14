<script setup>
defineProps({editing: Boolean})
</script>

<template>
  <section class="stage" data-lighting="moonlight">
    <h2>Ghost Disco</h2>
    <span class="ghost" aria-hidden="true">👻</span>
    <slot><p>Join the midnight dance party.</p></slot>
    <div class="controls" :hidden="editing">
      <button type="button" value="float">Float</button>
      <button type="button" value="twirl">Twirl</button>
    </div>
    <p class="author-hint" :hidden="!editing"><button type="button" data-edit-invitation>Edit invitation text</button></p>
    <output aria-live="polite">Pick a dance move.</output>
  </section>
</template>

<style>
  :host {
    display: block;
    max-inline-size: var(--ww-widget-max, var(--ww-prose-max, 45rem));
    margin-inline: auto;
  }
  .stage {
    box-sizing: border-box;
    padding: 1rem;
    border: 1px solid currentColor;
    border-radius: .75rem;
    background: #e5edff;
    color: #172c5a;
    text-align: center;
    overflow-wrap: anywhere;
  }
  h2 { margin: 0; font: inherit; font-weight: bold; }
  .ghost { display: block; margin-block: .75rem; font-size: 3rem; line-height: 1.25; }
  .controls { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; }
  button {
    font: inherit;
    padding: .4rem .75rem;
    border: 1px solid currentColor;
    border-radius: .4rem;
    color: inherit;
    background: transparent;
  }
  button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  output { display: block; margin-block-start: .75rem; }
</style>
