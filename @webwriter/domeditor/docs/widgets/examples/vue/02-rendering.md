The template contains the question, answer buttons, and output. The build puts the styles in the custom element's shadow root.

~~~vue
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
:host { display: block; padding: 1rem; border: 1px solid #cbd5e1; }
.controls { display: flex; flex-wrap: wrap; gap: .5rem; }
button { font: inherit; padding: .5rem .9rem; }
</style>
~~~

The registration module imports the component. It passes the component to `defineCustomElement`.
