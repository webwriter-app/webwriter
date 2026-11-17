// Checks of what a scene gives besides its drawing: a picture of itself (toSVG, toImage) and its print
// support (`printing`, and the picture that stands in for a WebGL canvas on paper), on the SVG renderer
// and on Pixi.
import { assert, check, equal, frame, mount, settled, until } from "../../test/harness";
import type { SceneBase } from "@webwriter/widget/scene";
import { Scene } from "@webwriter/widget/scene";
import type { Draw } from "./index";

type Name = "svg" | "pixi";
type PixiLike = SceneBase & { render(): boolean; readonly contextLost: boolean };

const sceneOf = (widget: Element) => widget.shadowRoot!.querySelector("ww-scene") as unknown as SceneBase;
const isPixi = (scene: SceneBase): scene is PixiLike => "render" in scene;

/** The number of pixels in a canvas that are not transparent. */
function inked(canvas: HTMLCanvasElement | ImageBitmap): number {
    const copy = Object.assign(document.createElement("canvas"), { width: canvas.width, height: canvas.height });
    const context = copy.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(canvas, 0, 0);
    const { data } = context.getImageData(0, 0, copy.width, copy.height);
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count++;
    return count;
}

function exportChecks(name: Name) {
    const tag = `ww-draw-${name}`;
    const draw = async (): Promise<Draw> => {
        const widget = await mount<Draw>(`<${tag} contenteditable></${tag}>`);
        const scene = sceneOf(widget);
        if (isPixi(scene)) await until(() => !scene.contextLost, "no WebGL context", 8000);
        await settled(widget);
        await frame(2);
        return widget;
    };
    const both = (title: string, fn: () => unknown) => check(`export (${name}): ${title}`, fn);

    both("toSVG: a standalone SVG document of the scene, with every drawn element", async () => {
        const scene = sceneOf(await draw());
        const markup = scene.toSVG()!;
        assert(typeof markup === "string" && markup.startsWith("<svg"), "a string that starts with the svg element");
        const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
        assert(!parsed.querySelector("parsererror"), "it is well-formed XML");
        const root = parsed.documentElement;
        const extent = scene.extent()!;
        const [x, y, width, height] = root.getAttribute("viewBox")!.split(" ").map(Number);
        assert(Math.abs(width - (extent.width + 16)) < 1 && Math.abs(height - (extent.height + 16)) < 1, `the view box is the extent with the padding: ${width} x ${height}`);
        assert(Math.abs(x - (extent.x - 8)) < 1 && Math.abs(y - (extent.y - 8)) < 1, "and starts at its corner");
        assert(parsed.querySelectorAll("path").length >= 5, "the paths are in it");
        assert(parsed.querySelectorAll("text").length >= 5, "and the texts, with their font");
        assert(!!parsed.querySelector("text")!.style.font, "a text has its font, so that nothing is estimated");
        assert(parsed.querySelectorAll("foreignObject").length > 0, "the HTML of the nodes is in foreign objects");
        const plain = scene.toSVG({ nodes: false, padding: 0, background: "white" })!;
        assert(!plain.includes("foreignObject"), "nodes: false leaves the nodes out");
        assert(plain.includes('fill="white"'), "background paints a rect below everything");
    });

    both("toSVG: both renderers give the same picture", async () => {
        const [first, second] = [await draw(), await draw()];
        equal(sceneOf(first).toSVG(), sceneOf(second).toSVG(), "the markup does not depend on the widget instance");
        // The other renderer is checked against this one in the cross check below.
    });

    both("toImage: a PNG of the scene at the scale that is asked for", async () => {
        const scene = sceneOf(await draw());
        const extent = scene.extent()!;
        const png = await scene.toImage({ scale: 1 });
        equal(png.type, "image/png", "PNG is the default");
        const bitmap = await createImageBitmap(png);
        assert(Math.abs(bitmap.width - (extent.width + 16)) <= 1 && Math.abs(bitmap.height - (extent.height + 16)) <= 1, `scale 1 is the size of the scene: ${bitmap.width} x ${bitmap.height}`);
        assert(inked(bitmap) > 1000, "the picture has the drawing in it, on a transparent ground");
        assert(inked(bitmap) < bitmap.width * bitmap.height, "and is not covered by a background");
        const double = await createImageBitmap(await scene.toImage({ scale: 2 }));
        assert(Math.abs(double.width - 2 * bitmap.width) <= 2, "scale 2 doubles it");
        const jpeg = await scene.toImage({ type: "image/jpeg", scale: 0.5 });
        equal(jpeg.type, "image/jpeg", "another type");
        const flat = await createImageBitmap(jpeg);
        equal(inked(flat), flat.width * flat.height, "a JPEG has no transparency: it is painted on white");
    });

    both("print: the scene knows when the document is printed, by event and by the editor's class", async () => {
        const widget = await draw();
        const scene = sceneOf(widget);
        equal(scene.printing, false, "not printing at first");
        window.dispatchEvent(new Event("beforeprint"));
        equal(scene.printing, true, "beforeprint");
        window.dispatchEvent(new Event("afterprint"));
        equal(scene.printing, false, "afterprint");
        widget.classList.add("ww-beforeprint");
        await frame();
        equal(scene.printing, true, "the editor's class on the widget");
        widget.classList.remove("ww-beforeprint");
        await frame();
        equal(scene.printing, false, "and without it");
    });

    both("print: a scene stops watching when it is removed", async () => {
        const widget = await draw();
        const scene = sceneOf(widget);
        widget.remove();
        window.dispatchEvent(new Event("beforeprint"));
        equal(scene.printing, false, "a removed scene does not follow the print events");
        window.dispatchEvent(new Event("afterprint"));
    });

    if (name === "pixi") {
        both("print: a Pixi scene prints a picture at print resolution in the canvas's place", async () => {
            const widget = await draw();
            const scene = sceneOf(widget) as PixiLike;
            const canvas = scene.shadowRoot!.querySelector<HTMLCanvasElement>("canvas:not([part~=print])")!;
            const screenWidth = canvas.width;
            window.dispatchEvent(new Event("beforeprint"));
            try {
                const sheet = scene.shadowRoot!.querySelector<HTMLCanvasElement>("canvas[part~=print]");
                assert(sheet, "a canvas stands in on paper");
                assert(sheet.width >= 2.5 * scene.clientWidth && sheet.width > screenWidth, `at about 300 ppi, not at the resolution of the screen: ${sheet.width} px for ${scene.clientWidth} CSS px`);
                assert(inked(sheet) > 1000, "and it holds the drawing, which a WebGL canvas would not print");
                equal(canvas.style.visibility, "hidden", "the WebGL canvas is hidden meanwhile");
                equal(canvas.width, screenWidth, "the WebGL canvas is back at the screen resolution after the capture");
            } finally {
                window.dispatchEvent(new Event("afterprint"));
            }
            assert(!scene.shadowRoot!.querySelector("canvas[part~=print]"), "the picture is removed after printing");
            equal(canvas.style.visibility, "", "and the canvas is shown again");
        });

        both("print: a Pixi scene that is off screen prints its last picture", async () => {
            const widget = await draw();
            const scene = sceneOf(widget) as PixiLike;
            // A scene that is off screen gives its context back; what it showed last is what prints.
            widget.style.marginTop = "5000px";
            await until(() => scene.contextLost, "the context is given back off screen", 6000);
            window.dispatchEvent(new Event("beforeprint"));
            try {
                const sheet = scene.shadowRoot!.querySelector<HTMLCanvasElement>("canvas[part~=print]");
                assert(sheet && inked(sheet) > 1000, "the picture from before is printed");
            } finally {
                window.dispatchEvent(new Event("afterprint"));
            }
        });
    }

    both("toSVG: the same markup from the other renderer", async () => {
        if (name === "pixi") return; // compared once, from the SVG side
        const [svg, pixi] = [await draw(), await mount<Draw>(`<ww-draw-pixi contenteditable></ww-draw-pixi>`)];
        const other = sceneOf(pixi) as PixiLike;
        await until(() => !other.contextLost, "no WebGL context", 8000);
        await settled(pixi);
        await frame(2);
        // The renderers lay out ports on their own frames, so numbers may differ in the last digits: compare the structure.
        const shape = (markup: string) => {
            const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
            return [...parsed.querySelectorAll("*")].map((element) => `${element.localName}${element.children.length ? "" : `:${element.textContent}`}`);
        };
        equal(shape(sceneOf(svg).toSVG()!), shape(other.toSVG()!), "Scene and PixiScene give the same SVG elements and texts for the same model");
    });
}

check("export: an empty scene has no picture", async () => {
    if (!customElements.get("ww-export-empty")) customElements.define("ww-export-empty", class extends Scene {});
    const scene = await mount<SceneBase & HTMLElement>(`<ww-export-empty style="display:block;width:100px;height:100px"></ww-export-empty>`);
    equal(scene.toSVG(), null, "toSVG is null");
    let rejected = false;
    await scene.toImage().catch(() => (rejected = true));
    assert(rejected, "toImage rejects");
});

exportChecks("svg");
exportChecks("pixi");
