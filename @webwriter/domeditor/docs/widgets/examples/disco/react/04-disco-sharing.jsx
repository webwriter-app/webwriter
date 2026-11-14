import {createReactWidget, useWidget} from "@webwriter/react"
import {readDance, chooseDance} from "#disco-reading"

const styles = `
  :host { display: block; }
  .stage { padding: 1rem; border: 1px solid #90a6cd; border-radius: .75rem; background: #e5edff; color: #172c5a; text-align: center; }
  .ghost { display: block; margin-block: .75rem; font-size: 2.75rem; }
  .controls { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; }
  .controls[hidden] { display: none; }
  button { font: inherit; padding: .375rem .75rem; }
  output { display: block; margin-block-start: .75rem; }

  :host { container-type: inline-size; }
  .controls { display: grid; }
  .controls[hidden] { display: none; }
  @container (min-width: 24rem) {
    .controls { display: flex; justify-content: center; }
  }

  .ghost[data-move="float"] { transform: translateY(-.3rem); }
  .ghost[data-move="twirl"] { transform: rotate(24deg); }
  button[aria-pressed="true"] { outline: 2px solid currentColor; outline-offset: 2px; }
`

function GhostDisco({host}) {
  const {editable: editing, data, dataReady, dataError} = useWidget(host)
  const {move, ready, status} = readDance(data, dataReady, dataError)
  const choose = move => chooseDance(host.widgetRuntime, move)
  return (
    <div className="stage">
      <style>{styles}</style>
      <slot><p>Join the midnight dance party.</p></slot>
      <span className="ghost" aria-hidden="true" data-move={move}>👻</span>
      <div className="controls" hidden={editing}>
        <button type="button" value="float" disabled={!ready} aria-pressed={move === "float"} onClick={() => choose("float")}>Float</button>
        <button type="button" value="twirl" disabled={!ready} aria-pressed={move === "twirl"} onClick={() => choose("twirl")}>Twirl</button>
      </div>
      <p className="author-hint" hidden={!editing}>Edit the invitation in the document.</p>
      <output aria-live="polite">{status}</output>
    </div>
  )
}

customElements.define("ww-ghost-disco", createReactWidget(GhostDisco))
