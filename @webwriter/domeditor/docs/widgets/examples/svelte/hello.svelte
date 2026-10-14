<svelte:options customElement={{ tag: "ww-hello" }} />

<p>Hello, <slot>world</slot>!</p>

<style>
  :host { display: block; }
</style>
