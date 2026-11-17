// The bench of bench.ts on the Pixi renderer. Only this file pulls in pixi.js.
import { PixiScene } from "@webwriter/widget/scene/pixi";
import { Bench } from "./bench";

export class PixiBench extends Bench {
    static scopedElements = { ...Bench.scopedElements, "ww-scene": PixiScene };
}
customElements.define("ww-bench-pixi", PixiBench);
