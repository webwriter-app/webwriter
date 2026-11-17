<svelte:options customElement={{ tag: "ww-b-scene", shadow: "open", extend: (Base) => withWidgetRuntime(Base) }} />

<script module>
  import { withWidgetRuntime } from "@webwriter/svelte"
</script>

<script>
  import { listen } from "@webwriter/svelte/base"
  import { sceneStore } from "@webwriter/svelte/scene"

  const host = $host()

  let places = $state({ a: { x: 40, y: 40 }, b: { x: 300, y: 60 }, c: { x: 300, y: 200 } })
  let wires = $state([{ id: "w1", from: "a:out", to: "b:in" }])

  // What the checks read: every event of the scene as it was sent, and the names of ports that start no wire.
  host.seen = []
  host.refused = []
  // `can` is asked with the port as its third argument for a connection that starts or ends at one.
  const scene = sceneStore(host, {
    can: (action, item, port) => !(action === "connect" && !!port && host.refused.includes(port.dataset.wwPort)),
  })
  host.scene = scene
  host.places = () => $state.snapshot(places)

  const record = (event) => host.seen.push(event)
  const handlers = {
    "ww-move": (event) => {
      record(event)
      for (const { key, x, y } of event.detail.items) places[key] = { x, y }
    },
    "ww-connect": (event) => {
      record(event)
      const { from, to } = event.detail
      wires.push({ id: `w${wires.length + 1}`, from, to })
    },
    "ww-moving": record,
    "ww-ready": record,
  }
</script>

<ww-scene use:listen={handlers} aria-label="Board">
  {#each Object.entries(places) as [key, at] (key)}
    <ww-node data-ww-key={key} x={at.x} y={at.y} width="100" height="60" selectable movable>
      {key}
      <span class="port right" data-ww-port="out" data-ww-link="sig"></span>
      <span class="port left" data-ww-port="in" data-ww-accept="sig"></span>
    </ww-node>
  {/each}
  {#each wires as wire (wire.id)}
    <ww-path data-ww-key={wire.id} from={wire.from} to={wire.to} selectable></ww-path>
  {/each}
</ww-scene>
<p class="marquee">{$scene.marquee ? "marquee" : "no marquee"}</p>

<style>
  :host { display: block; font: 12px system-ui, sans-serif; }
  ww-scene { display: block; width: 520px; height: 320px; color: rgb(60, 60, 70); }
  ww-node { box-sizing: border-box; background: #fff; border: 1px solid #555; padding: 4px; }
  .port { position: absolute; width: 14px; height: 14px; border-radius: 50%; background: rgb(0, 120, 255); }
  .right { right: -7px; top: 23px; }
  .left { left: -7px; top: 23px; }
  ww-path { stroke: rgb(40, 40, 40); stroke-width: 2px; }
</style>
