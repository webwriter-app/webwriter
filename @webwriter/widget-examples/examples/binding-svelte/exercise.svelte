<svelte:options
  customElement={{
    tag: "ww-b-exercise",
    shadow: "open",
    extend: (Base) =>
      class Quiz extends withExercise(withDeclarations(withWidgetRuntime(Base))) {
        static actions = { clear: { label: (widget) => ({ _: `Clear ${widget.noun}` }) } }
        noun = "answer"
        clear() {}
      },
  }}
/>

<script module>
  import { withDeclarations, withWidgetRuntime } from "@webwriter/svelte"
  import { exerciseStore, scoreOf, withExercise } from "@webwriter/svelte/exercise"
</script>

<script>
  const host = $host()
  let response = $state(undefined)
  let solution = $state("b")

  const exercise = exerciseStore(host, {
    response: () => response,
    respond: (value) => (response = value),
    solution: () => solution,
    record: (value) => (solution = value),
    score: (value, expected) => scoreOf([value === expected]),
  })
  host.exercise = exercise
</script>

{#each ["a", "b", "c"] as choice}
  <button class="choice" disabled={$exercise.locked} onclick={() => exercise.answer(choice)}>{choice}</button>
{/each}
<button class="check" onclick={() => exercise.check()}>Check</button>
<output>{$exercise.summary}</output>
<p class="state">{$exercise.locked ? "locked" : "open"} {response ?? "-"}</p>
