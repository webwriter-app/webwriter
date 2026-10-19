Put authored question content in the light DOM and project it with a native slot in the Vue template:

~~~vue
<template>
  <section>
    <slot><p>Add a question.</p></slot>
    <div class="controls">
      <button type="button" value="true">True</button>
      <button type="button" value="false">False</button>
    </div>
    <output aria-live="polite"></output>
  </section>
</template>
~~~

The fallback paragraph appears when no authored question is present. The build uses Vue custom-element compilation so the slot remains a native shadow-DOM slot.
