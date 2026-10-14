The template describes the question, answer buttons, and live output directly. The style block is compiled into the custom element’s shadow root:

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

The paired registration module imports this component and passes it to defineCustomElement.
