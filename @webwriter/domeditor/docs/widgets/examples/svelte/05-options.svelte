<svelte:options
  customElement={{
    tag: "ww-quiz",
    props: {answer: {type: "String", reflect: true}},
    extend: (Base) => class extends Base {
      static options = {
        answer: {
          type: "select",
          label: {_: "Correct answer"},
          options: [
            {value: "true", label: {_: "True"}},
            {value: "false", label: {_: "False"}},
          ],
        },
      }
      static actions = {resetAnswer: {label: {_: "Reset correct answer"}}}

      resetAnswer() { this.setAttribute("answer", "false") }
    },
  }}
/>

<script>
  import {onMount} from "svelte"

  let {answer = "false"} = $props()
  let choice = $state("")
  let anchor
  let host
  let editing = $state(false)
  let message = $derived(choice ? (choice === answer ? "Correct!" : "Try again.") : "")

  function choose(value) {
    if(editing) return
    choice = value
  }

  onMount(() => {
    host = anchor.getRootNode().host
    const updateEditing = () => { editing = host.isContentEditable }
    const observer = new MutationObserver(updateEditing)
    observer.observe(host, {attributes: true, attributeFilter: ["contenteditable"]})
    updateEditing()
    return () => observer.disconnect()
  })
</script>

<slot><p>Add a question.</p></slot>
<div class="controls" hidden={editing}>
  <button type="button" value="true" onclick={() => choose("true")}>True</button>
  <button type="button" value="false" onclick={() => choose("false")}>False</button>
</div>
<p class="author-hint" hidden={!editing}>Edit the question and correct answer, then use Preview.</p>
<output bind:this={anchor} aria-live="polite">{message}</output>

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
  .controls[hidden], .author-hint[hidden] { display: none; }
  button { font: inherit; padding: .5rem .9rem; max-inline-size: 100%; }
  button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
  output { display: block; min-block-size: 1.5em; margin-block-start: .75rem; }
</style>
