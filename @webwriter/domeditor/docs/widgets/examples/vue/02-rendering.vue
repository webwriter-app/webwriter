<template>
  <section>
    <p>The Moon is a star.</p>
    <div class="controls">
      <button type="button" value="true">True</button>
      <button type="button" value="false">False</button>
    </div>
    <output aria-live="polite"></output>
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
button { font: inherit; padding: .5rem .9rem; max-inline-size: 100%; }
button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
output { display: block; min-block-size: 1.5em; margin-block-start: .75rem; }
</style>
