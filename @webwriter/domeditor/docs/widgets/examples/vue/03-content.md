Keep the question in the light DOM. Use a native slot in the Vue template to display the question.

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

The slot displays its default paragraph when the widget has no question. Vue custom-element compilation keeps the slot in the shadow DOM.
