import { assert, check, deepActive, equal, events, fakeFrames, frame, key, listeners, mount, run, settled, until } from "../../test/harness";
import { formatTime, PlaybackCore, type PlaybackOptions } from "@webwriter/widget/playback";
import { whileVisible } from "@webwriter/widget/visible";
import { silentAudio, type MediaStepper } from "../media-stepper/index";
import type { Stepper } from "./index";
import "./index";

// ── Helpers ───────────────────────────────────────────────────────────────

const STEPS = `<p>one</p><p>two</p><p>three</p><p>four</p><p>five</p>`;

const part = <E extends HTMLElement = HTMLElement>(host: Element, command: string) =>
    host.shadowRoot!.querySelector<E>(`[data-ww-playback="${command}"]`)!;
const off = (host: Element, command: string) => part(host, command).getAttribute("aria-disabled") === "true";
const name = (host: Element, command: string) => part(host, command).getAttribute("aria-label");
const shown = (host: Element) => host.shadowRoot!.querySelector("slot")!.assignedElements().map((element) => element.textContent);

/** A plain element with the playback controls, to use the core without Lit. */
class Probe extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).innerHTML = `
            <button data-ww-playback="toggle"></button><button data-ww-playback="play">Go</button>
            <button data-ww-playback="pause"></button><button data-ww-playback="step"></button>
            <button data-ww-playback="back"></button><button data-ww-playback="rate"></button>
            <button data-ww-playback="reset"></button>
            <input type="range" data-ww-playback="seek"><output data-ww-playback="time"></output>`;
    }
}
customElements.define("ww-playback-probe", Probe);

async function probe(options: PlaybackOptions | ((host: HTMLElement) => PlaybackOptions | HTMLMediaElement), html = "<ww-playback-probe></ww-playback-probe>") {
    const first = await mount(html);
    const host = first.matches("ww-playback-probe") ? first : first.querySelector<HTMLElement>("ww-playback-probe")!;
    const core = new PlaybackCore(host, typeof options === "function" ? options(host) : options);
    core.connect();
    core.refresh();
    return { host, core, wrapper: first };
}

// ── A discrete run ────────────────────────────────────────────────────────

check("discrete: step, back, seek, time and the end", async () => {
    const stepper = await mount<Stepper>(`<ww-stepper>${STEPS}</ww-stepper>`);
    const { playback } = stepper;
    const changes = events("ww-playbackchange");
    equal([playback.currentStep, playback.paused, playback.ended], [0, true, false]);
    equal(shown(stepper), ["one"]);
    equal(part(stepper, "time").textContent, "1 / 5");
    const seek = part<HTMLInputElement>(stepper, "seek");
    equal([seek.min, seek.max, seek.step, seek.value, seek.disabled], ["0", "4", "1", "0", false]);
    equal([off(stepper, "back"), off(stepper, "step")], [true, false], "at the start only back is off");

    part(stepper, "step").click();
    await settled(stepper);
    equal([playback.currentStep, shown(stepper)], [1, ["two"]]);
    equal([part(stepper, "time").textContent, seek.value, off(stepper, "back")], ["2 / 5", "1", false]);

    part(stepper, "back").click();
    await settled(stepper);
    equal(playback.currentStep, 0);

    seek.value = "3";
    seek.dispatchEvent(new Event("input", { bubbles: true }));
    await settled(stepper);
    equal([playback.currentStep, shown(stepper)], [3, ["four"]]);
    assert(Math.abs(playback.currentTime - 3 * 0.8) < 1e-9 && Math.abs(playback.duration - 4 * 0.8) < 1e-9, "time is the index times the interval");

    playback.currentTime = 4 * 0.8;
    await settled(stepper);
    equal([playback.currentStep, playback.ended, off(stepper, "step")], [4, true, true]);
    equal(seek.getAttribute("aria-valuetext"), "5 / 5");
    equal(changes.stop().length, 4, "one ww-playbackchange per change");
});

check("discrete: plays at its interval, stops on the last step, and toggle starts over", async () => {
    const stepper = await mount<Stepper>(`<ww-stepper interval="0.05">${STEPS}</ww-stepper>`);
    const { playback } = stepper;
    const seen = new Set<number>();
    stepper.addEventListener("ww-playbackchange", () => seen.add(playback.currentStep));
    part(stepper, "toggle").click();
    await settled(stepper);
    equal([playback.paused, name(stepper, "toggle"), part(stepper, "toggle").querySelector("[data-ww-icon]")?.getAttribute("data-ww-icon")], [false, "Pause", "pause"]);
    await until(() => playback.ended, "the run did not reach its end", 5000);
    await settled(stepper);
    equal([playback.paused, playback.currentStep, name(stepper, "toggle"), shown(stepper)], [true, 4, "Play", ["five"]]);
    assert(seen.has(4) && seen.size >= 2, "the steps were reported on the way");

    part(stepper, "toggle").click();
    equal([playback.paused, playback.currentStep], [false, 0], "toggle at the end restarts from step 0");
    playback.pause();
});

check("discrete: mocked time gives exact steps, also at another speed", async () => {
    const displayed: number[] = [];
    const { core } = await probe({ steps: () => 100, show: (index) => displayed.push(index), interval: 0.25 });
    core.advance(1);
    equal(core.currentStep, 4);
    for (let i = 0; i < 5; i++) core.advance(0.1);
    equal(core.currentStep, 6, "0.5 s in five frames is two steps");
    core.playbackRate = 2;
    core.advance(1);
    equal(core.currentStep, 14);
    equal(displayed, [4, 5, 6, 14], "show() gets the step that is current after each frame");
    core.advance(1000);
    equal([core.currentStep, core.ended, core.paused], [99, true, true]);
});

// ── A continuous run and the loop ─────────────────────────────────────────

check("continuous: a fixed timestep is exact for uneven frames", async () => {
    const steps: number[] = [];
    const { core, host } = await probe({ step: (dt) => steps.push(dt), interval: 1 / 60 });
    const frames = [...Array(6).fill([13, 21, 16, 50, 7, 33, 10]).flat(), 40, 60]; // 1000 ms
    for (const ms of frames) core.advance(ms / 1000);
    equal(steps.length, 60, "one second is sixty steps");
    assert(steps.every((dt) => dt === 1 / 60), "every step has exactly the interval");
    assert(Math.abs(core.currentTime - 1) < 1e-9, `simulated time is ${core.currentTime}`);
    equal([core.duration, core.ended], [Infinity, false] as unknown[], "a continuous run has no end");
    equal(part(host, "time").textContent, "0:01");

    core.playbackRate = 2;
    for (const ms of frames) core.advance(ms / 1000);
    equal(steps.length, 180, "at double speed a second is 120 steps");

    equal([off(host, "back"), part<HTMLInputElement>(host, "seek").disabled], [true, true], "a continuous run cannot go back or be sought");
    core.back();
    core.seek(0);
    core.currentTime = 0;
    assert(Math.abs(core.currentTime - 3) < 1e-9, "and the methods do nothing");
});

check("continuous: a step that pauses the run ends the frame's steps", async () => {
    let steps = 0;
    const { core } = await probe({
        step: () => {
            if (++steps === 3) core.pause();
        },
        interval: 1 / 60,
    });
    await core.play();
    core.advance(0.1);
    equal([steps, core.paused], [3, true], "the three steps up to the pause, of the six that were due");
    await core.play();
    core.advance(1 / 60);
    equal(steps, 4, "and the dropped steps are not made up for later");
    core.pause();
});

check("continuous: without an interval every frame is one step of the scaled time", async () => {
    const steps: number[] = [];
    const { core } = await probe({ step: (dt) => steps.push(dt) });
    core.advance(0.02);
    core.playbackRate = 4;
    core.advance(0.02);
    core.step();
    equal(steps, [0.02, 0.08, 1 / 60]);
});

check("loop: runs on animation frames, and a stall advances by at most the cap", async () => {
    let simulated = 0;
    const { core } = await probe({ step: (dt) => (simulated += dt), interval: 1 / 60 });
    const started = performance.now();
    await core.play();
    await until(() => simulated > 0.1, "the loop did not run");
    const elapsed = (performance.now() - started) / 1000;
    assert(simulated <= elapsed + 1 / 60, `simulated ${simulated} s in ${elapsed} s`);
    assert(Math.abs(simulated - core.currentTime) < 1e-9, "currentTime is the simulated time");

    const frames = fakeFrames();
    try {
        await frame(); // the frame that was already requested now asks the fake clock for the next one
        equal(frames.pending, 1, "one loop, one pending frame");
        const t = performance.now() + 10_000;
        frames.fire(t);
        const before = simulated;
        frames.fire(t + 50);
        assert(Math.abs(simulated - before - 0.05) < 1e-9, `a 50 ms frame advanced the run by ${simulated - before} s`);
        frames.fire(t + 50 + 5000);
        const jump = simulated - before - 0.05;
        assert(Math.abs(jump - 0.1) < 1e-9, `a five second stall advanced the run by ${jump} s`);
        core.pause();
        equal(frames.pending, 0, "pause cancels the frame");
    } finally {
        frames.restore();
    }
});

check("hidden: the run waits off screen, in a hidden tab and while skipped, and resumes where it was", async () => {
    let steps = 0;
    const { core, host, wrapper } = await probe(
        { step: () => steps++ },
        `<div><div class="spacer" style="height: 5000px"></div><ww-playback-probe style="display: block"></ww-playback-probe></div>`,
    );
    const spacer = wrapper.querySelector<HTMLElement>(".spacer")!;
    const still = async (message: string) => {
        await frame(3); // the observer and a cancelled frame need a moment
        const count = steps;
        await frame(5);
        equal(steps, count, message);
    };
    const moving = async (message: string) => {
        const count = steps;
        await until(() => steps > count, message);
    };

    await core.play();
    await still("off screen");
    equal([steps, core.paused], [0, false], "the run is playing but waits");
    spacer.style.display = "none";
    await moving("did not start when it came on screen");
    spacer.style.display = "";
    await still("scrolled off screen again");
    spacer.style.display = "none";
    await moving("did not resume");

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    try {
        document.dispatchEvent(new Event("visibilitychange"));
        await still("in a hidden tab");
    } finally {
        delete (document as { visibilityState?: string }).visibilityState;
    }
    document.dispatchEvent(new Event("visibilitychange"));
    await moving("did not resume in the visible tab");

    host.dispatchEvent(new ContentVisibilityAutoStateChangeEvent("contentvisibilityautostatechange", { skipped: true }));
    await still("while the browser skips its contents");
    host.dispatchEvent(new ContentVisibilityAutoStateChangeEvent("contentvisibilityautostatechange", { skipped: false }));
    await moving("did not resume when rendered again");
    core.disconnect();
});

check("whileVisible: a widget that sets content-visibility: auto is also followed through the browser's event", async () => {
    const wrapper = await mount(`<div><div style="height: 8000px"></div></div>`);
    const host = document.createElement("div");
    host.style.cssText = "content-visibility: auto; contain-intrinsic-size: auto 100px";
    const reported: boolean[] = [];
    host.addEventListener("contentvisibilityautostatechange", (event) => reported.push((event as ContentVisibilityAutoStateChangeEvent).skipped));
    let steps = 0;
    const loop = whileVisible(host, () => steps++);
    wrapper.append(host);
    await frame(6);
    equal([loop.running, steps, reported], [false, 0, [true]], "skipped from the start");
    host.scrollIntoView();
    await until(() => steps > 0, "the loop did not start when scrolled to");
    equal(reported, [true, false]);
    scrollTo(0, 0);
    await until(() => reported.length === 3 && !loop.running, "the loop did not stop when scrolled away");
    loop.stop();
});

check("whileVisible: stops on removal, restarts on insertion, and stop() releases everything", async () => {
    const before = listeners(document, window);
    const host = await mount(`<div style="height: 20px"></div>`);
    const parent = host.parentElement!;
    let steps = 0;
    const loop = whileVisible(host, () => steps++);
    await until(() => steps > 0, "the loop did not start");
    host.remove();
    await frame(3);
    const count = steps;
    await frame(5);
    equal([steps, loop.running], [count, false], "no step after the removal");
    parent.append(host);
    await until(() => steps > count, "the loop did not restart");
    loop.stop();
    const stopped = steps;
    host.remove();
    parent.append(host);
    await frame(5);
    equal([steps, loop.running, listeners(document, window), listeners(host)], [stopped, false, before, 0]);
});

// ── Buttons ───────────────────────────────────────────────────────────────

check("buttons: icon, name and availability follow the run", async () => {
    const { core, host } = await probe({ steps: () => 3, interval: 100 });
    const icon = (command: string) => part(host, command).querySelector(":scope > [data-ww-icon]")?.getAttribute("data-ww-icon");
    equal(["toggle", "pause", "step", "back", "reset"].map(icon), ["play", "pause", "step", "back", "reset"]);
    equal(["toggle", "play", "pause", "step", "back", "reset", "rate"].map((command) => name(host, command)), [
        "Play", "Play", "Pause", "Step forward", "Step back", "Reset", "Speed: 1×",
    ]);
    equal(part(host, "play").textContent, "Go", "a button with its own content keeps it");
    equal(part(host, "toggle").title, "Play");
    equal(part(host, "seek").getAttribute("aria-label"), "Position");
    equal(["play", "pause", "step", "back"].map((command) => off(host, command)), [false, true, false, true]);

    part(host, "play").click();
    equal([core.paused, icon("toggle"), name(host, "toggle")], [false, "pause", "Pause"]);
    equal(["play", "pause"].map((command) => off(host, command)), [true, false]);
    part(host, "play").click();
    equal(core.paused, false, "an unavailable button does nothing");
    part(host, "pause").click();
    equal([core.paused, icon("toggle")], [true, "play"]);

    const rate = part(host, "rate");
    equal(rate.textContent, "1×");
    rate.click();
    equal([core.playbackRate, rate.textContent, name(host, "rate")], [2, "2×", "Speed: 2×"]);
    rate.click();
    rate.click();
    equal([core.playbackRate, rate.textContent], [0.5, "0.5×"], "after the last speed comes the first");

    // A button that becomes unavailable keeps the focus, so keys still reach the widget.
    const step = part(host, "step");
    step.focus();
    step.click();
    step.click();
    equal([core.currentStep, core.ended, off(host, "step"), deepActive() === step], [2, true, true, true]);
    step.click();
    equal(core.currentStep, 2);

    part(host, "reset").click();
    equal([core.currentStep, core.paused, off(host, "back"), part(host, "time").textContent], [0, true, true, "1 / 3"]);
    core.disconnect();
});

check("buttons: messages can be replaced", async () => {
    const { host, core } = await probe({ steps: () => 2, messages: { play: "Abspielen", rate: (rate) => `Tempo ${rate}` } });
    equal([name(host, "toggle"), name(host, "rate"), name(host, "pause")], ["Abspielen", "Tempo 1", "Pause"]);
    core.disconnect();
});

check("can: a refused command does nothing and the controls show it", async () => {
    let allowed = false;
    const asked: string[] = [];
    const { core, host } = await probe({ steps: () => 3, can: (command) => (asked.push(command), allowed) });
    equal([off(host, "toggle"), off(host, "step"), off(host, "reset"), part<HTMLInputElement>(host, "seek").disabled], [true, true, true, true]);
    asked.length = 0;
    equal([core.run("toggle"), core.run("step"), core.run("seek", 2), core.run("rate")], [false, false, false, false]);
    equal([core.paused, core.currentStep, core.playbackRate, asked], [true, 0, 1, ["toggle", "step", "seek", "rate"]]);
    part(host, "step").click();
    equal(core.currentStep, 0);

    allowed = true;
    core.refresh();
    equal([off(host, "toggle"), part<HTMLInputElement>(host, "seek").disabled], [false, false]);
    part(host, "step").click();
    equal(core.currentStep, 1);
    core.disconnect();
});

// ── Other configurations ──────────────────────────────────────────────────

check("reset: the callback runs, the time returns to zero and the run is paused", async () => {
    const log: string[] = [];
    const { core, host } = await probe({ step: () => {}, interval: 0.5, reset: () => log.push("reset"), draw: () => log.push("draw") });
    core.advance(2);
    await core.play();
    const changes = events("ww-playbackchange");
    log.length = 0;
    core.reset();
    equal([core.currentTime, core.paused, log, part(host, "time").textContent], [0, true, ["reset", "draw"], "0:00"]);
    equal(changes.stop().length, 1, "one event for the whole reset");
    core.disconnect();
});

check("external run: play and pause callbacks instead of a loop", async () => {
    const log: string[] = [];
    const frames = fakeFrames();
    try {
        const first = document.body.appendChild(document.createElement("ww-playback-probe"));
        const core = new PlaybackCore(first, { play: () => log.push("play"), pause: () => log.push("pause") });
        core.connect();
        core.refresh();
        void core.play();
        void core.play();
        equal([log, core.paused, frames.pending], [["play"], false, 0], "no frame is requested for a run that lives elsewhere");
        core.toggle();
        equal([log, core.paused], [["play", "pause"], true]);
        core.disconnect();
        first.remove();
    } finally {
        frames.restore();
    }
});

check("autoplay: a run starts by itself for a reader and not for an author", async () => {
    const reader = await probe({ step: () => {}, autoplay: true });
    equal(reader.core.paused, false);
    reader.core.disconnect();
    reader.core.connect();
    reader.core.pause();
    reader.core.disconnect();
    reader.core.connect();
    equal(reader.core.paused, true, "autoplay happens once, not on every connect");
    reader.core.disconnect();

    const first = await mount(`<ww-playback-probe contenteditable></ww-playback-probe>`);
    const author = new PlaybackCore(first, { step: () => {}, autoplay: true });
    author.connect();
    equal(author.paused, true);
    author.disconnect();
});

// ── A media element ───────────────────────────────────────────────────────

// Headless Chrome refuses to play an <audio> element without a user gesture, also when it is muted. A muted
// <video> may play, and it plays a sound file too, so the run itself is checked with one.
check("media: an element in place of the options is driven by the same buttons", async () => {
    const video = document.createElement("video");
    video.muted = true;
    video.src = silentAudio();
    const { core, host } = await probe(() => video);
    const changes = events("ww-playbackchange");
    await until(() => video.readyState >= 1, "the generated sound did not load", 5000);
    const seek = part<HTMLInputElement>(host, "seek");
    await until(() => seek.max === "3", "the duration did not arrive");
    equal([core.duration, seek.step, seek.disabled, core.paused, name(host, "toggle"), part(host, "time").textContent, off(host, "back")], [
        3, "any", false, true, "Play", "0:00 / 0:03", true,
    ]);

    part(host, "toggle").click();
    await until(() => !video.paused && video.currentTime > 0.05, "the media did not play", 5000);
    equal([core.paused, core.getSnapshot().paused, name(host, "toggle"), off(host, "pause")], [false, false, "Pause", false]);
    equal(core.currentTime, video.currentTime, "currentTime is the element's");
    part(host, "toggle").click();
    await until(() => video.paused && name(host, "toggle") === "Play", "the media did not pause");

    part(host, "rate").click();
    equal([video.playbackRate, core.playbackRate], [2, 2]);
    await until(() => part(host, "rate").textContent === "2×", "the rate button did not follow");

    seek.value = "2";
    seek.dispatchEvent(new Event("input", { bubbles: true }));
    equal(video.currentTime, 2);
    part(host, "back").click();
    equal(video.currentTime, 1, "back is one second without an interval");
    part(host, "step").click();
    equal(video.currentTime, 2);
    await until(() => part(host, "time").textContent === "0:02 / 0:03" && seek.value === "2", "the time did not follow");

    video.currentTime = 2.8;
    await core.play();
    await until(() => core.getSnapshot().ended, "the end was not reported", 5000);
    equal([video.ended, core.ended, core.paused, off(host, "step"), name(host, "toggle")], [true, true, true, true, "Play"]);
    part(host, "toggle").click();
    await until(() => !video.paused && video.currentTime < 1, "toggle at the end did not start over", 5000);

    part(host, "reset").click();
    await until(() => video.currentTime === 0 && video.paused && core.getSnapshot().paused, "reset did not rewind");
    assert(changes.stop().length >= 6, "state changes of the element are reported as ww-playbackchange");
    assert(listeners(video) > 0, "the core listens on the element");
    core.disconnect();
    equal(listeners(video), 0, "and stops on disconnect");
    URL.revokeObjectURL(video.src);
});

check("media: the example's audio element is sought, stepped and reset; a refused play leaves it paused", async () => {
    const player = await mount<MediaStepper>(`<ww-media-stepper></ww-media-stepper>`);
    const { playback } = player;
    const audio = player.shadowRoot!.querySelector("audio")!;
    await until(() => audio.readyState >= 1, "the generated audio did not load", 5000);
    const seek = part<HTMLInputElement>(player, "seek");
    await until(() => seek.max === "3", "the duration did not arrive");
    equal([playback.duration, playback.paused, name(player, "toggle"), off(player, "back")], [3, true, "Play", true]);

    seek.value = "1.5";
    seek.dispatchEvent(new Event("input", { bubbles: true }));
    equal([audio.currentTime, playback.currentTime], [1.5, 1.5]);
    part(player, "step").click();
    equal(audio.currentTime, 2.5);
    part(player, "back").click();
    part(player, "back").click();
    equal(audio.currentTime, 0.5);
    part(player, "rate").click();
    equal(audio.playbackRate, 2);
    await until(() => !off(player, "back") && part(player, "time").textContent === "0:00 / 0:03", "the controls did not follow");

    // No user gesture in this page: the browser rejects play(). The buttons must survive that.
    part(player, "toggle").click();
    await frame(3);
    equal([audio.paused, playback.paused, name(player, "toggle")], [true, true, "Play"]);

    part(player, "reset").click();
    await until(() => audio.currentTime === 0 && off(player, "back"), "reset did not rewind");
    player.remove();
    equal(listeners(audio), 0, "the element's listeners are removed on disconnect");
});

// ── Options that the first round left open ────────────────────────────────

const OFF_SCREEN = `<div><div class="spacer" style="height: 5000px"></div><ww-playback-probe style="display: block"></ww-playback-probe></div>`;
const silentVideo = () => Object.assign(document.createElement("video"), { muted: true, preload: "auto", src: silentAudio() });

check("autoplay: a reader who prefers reduced motion gets a paused run unless it is declared 'always', and an author always does", async () => {
    const native = window.matchMedia;
    window.matchMedia = (query) => (query.includes("prefers-reduced-motion") ? ({ matches: true } as MediaQueryList) : native.call(window, query));
    try {
        const calm = await probe({ step: () => {}, autoplay: true });
        const essential = await probe({ step: () => {}, autoplay: "always" });
        equal([calm.core.paused, essential.core.paused], [true, false]);
        calm.core.disconnect();
        essential.core.disconnect();
        const author = await probe({ step: () => {}, autoplay: "always" }, `<ww-playback-probe contenteditable></ww-playback-probe>`);
        equal(author.core.paused, true, "never in edit mode");
        author.core.disconnect();
    } finally {
        window.matchMedia = native;
    }
});

check("autoplay: a media element and a run elsewhere start when the widget is first shown, unless a command came first", async () => {
    const log: string[] = [];
    const elsewhere = await probe({ play: () => log.push("play"), pause: () => log.push("pause"), autoplay: true }, OFF_SCREEN);
    const video = silentVideo();
    const media = await probe({ media: () => video, autoplay: true }, OFF_SCREEN);
    const decided = await probe({ play: () => log.push("other"), autoplay: true }, OFF_SCREEN);
    await decided.core.play();
    decided.core.pause();
    log.length = 0;
    await frame(5);
    equal([log, elsewhere.core.paused, video.paused], [[], true, true], "nothing starts off screen");
    for (const { wrapper } of [elsewhere, media, decided]) wrapper.querySelector<HTMLElement>(".spacer")!.style.display = "none";
    await until(() => log.length > 0 && !video.paused, "the runs did not start when shown", 5000);
    await frame(3);
    equal([log, elsewhere.core.paused, media.core.paused, decided.core.paused], [["play"], false, false, true], "the run that was already paused by a command stays paused");
    for (const { core } of [elsewhere, media, decided]) core.disconnect();
    video.pause();
    URL.revokeObjectURL(video.src);
});

check("external run: a play callback that throws leaves the run paused, and the run cannot be stepped", async () => {
    let fail = true;
    const log: string[] = [];
    const start = () => {
        if (fail) throw new Error("no worker");
        log.push("play");
    };
    const { core, host } = await probe({ play: start, pause: () => log.push("pause") });
    const changes = events("ww-playbackchange");
    const result = core.play();
    assert(result instanceof Promise, "play() returns a promise, as a media element does");
    equal(await result.then(() => "started", (error: Error) => error.message), "no worker");
    part(host, "toggle").click();
    part(host, "play").click();
    equal([core.paused, core.getSnapshot().paused, name(host, "toggle"), changes.log, log], [true, true, "Play", [], []], "state, buttons and events agree");
    equal([core.steppable, off(host, "step"), off(host, "back")], [false, true, true]);
    core.step();
    equal(changes.log, [], "step() does nothing for a run that lives elsewhere");

    fail = false;
    part(host, "toggle").click();
    equal([core.paused, log, changes.stop().length], [false, ["play"], 1]);
    core.disconnect();
});

check("draw: once per frame after the steps of that frame, and after a step and a reset", async () => {
    const log: string[] = [];
    const { core } = await probe({ step: () => log.push("step"), interval: 1 / 60, reset: () => log.push("reset"), draw: () => log.push("draw") });
    core.advance(0.05);
    core.advance(0.001);
    equal(log.splice(0), ["step", "step", "step", "draw", "draw"], "three steps and one draw, then a frame without a step that still draws");
    core.step();
    core.reset();
    equal(log, ["step", "draw", "reset", "draw"]);
    core.disconnect();

    const shown: string[] = [];
    const discrete = await probe({ steps: () => 9, show: (index) => shown.push(`show ${index}`), draw: () => shown.push("draw"), interval: 0.5 });
    discrete.core.advance(1);
    equal(shown, ["show 2", "draw"]);
    discrete.core.disconnect();
});

check("interval and rates: a function is asked on every frame, and the speeds are the widget's own", async () => {
    let seconds = 0.5;
    const { core, host } = await probe({ steps: () => 100, interval: () => seconds, rates: [1, 3] });
    core.advance(1);
    seconds = 0.25;
    core.advance(1);
    equal([core.currentStep, core.interval, core.duration], [6, 0.25, 99 * 0.25]);
    const rate = part(host, "rate");
    equal([core.rates, rate.textContent, off(host, "rate")], [[1, 3], "1×", false]);
    rate.click();
    equal([core.playbackRate, rate.textContent, name(host, "rate")], [3, "3×", "Speed: 3×"]);
    rate.click();
    equal(core.playbackRate, 1);
    core.playbackRate = 2;
    core.playbackRate = 0;
    core.playbackRate = Number.NaN;
    equal(core.playbackRate, 2, "a speed that is not positive is ignored");
    rate.click();
    equal(core.playbackRate, 1, "from a speed outside the list the button goes to the first");
    core.disconnect();

    const fixed = await probe({ steps: () => 3, rates: [1] });
    equal([off(fixed.host, "rate"), fixed.core.interval], [true, 1], "one speed is no choice; a discrete run takes a second per step");
    fixed.core.disconnect();
});

check("names: the German catalog, the language followed at run time, numbers in the language, and the override in every language", async () => {
    const { core, host, wrapper } = await probe({ steps: () => 3 }, `<div lang="de-AT"><ww-playback-probe></ww-playback-probe></div>`);
    const names = () => ["toggle", "pause", "step", "back", "reset", "rate", "seek"].map((command) => name(host, command));
    // The German catalog is a file of its own. Until it has arrived the names are the English ones.
    await until(() => name(host, "toggle") === "Abspielen", "the names were not written again when the German catalog arrived");
    equal(names(), ["Abspielen", "Pausieren", "Einen Schritt vor", "Einen Schritt zurück", "Zurücksetzen", "Geschwindigkeit: 1×", "Position"]);
    equal(part(host, "toggle").title, "Abspielen");
    core.playbackRate = 0.5;
    equal([name(host, "rate"), part(host, "rate").textContent], ["Geschwindigkeit: 0,5×", "0,5×"]);
    wrapper.lang = "en";
    await until(() => name(host, "toggle") === "Play", "the names did not follow the language");
    equal(names(), ["Play", "Pause", "Step forward", "Step back", "Reset", "Speed: 0.5×", "Position"]);
    core.disconnect();

    const own = await probe({ steps: () => 3, messages: () => ({ play: "Los" }) }, `<div lang="de"><ww-playback-probe></ww-playback-probe></div>`);
    equal([name(own.host, "toggle"), name(own.host, "pause")], ["Los", "Pausieren"]);
    own.core.disconnect();
});

check("time: m:ss below an hour and h:mm:ss from an hour on, both times in the form of the longer, in the widget's language", async () => {
    equal([0, 5, 65, 3599, 3600, 3725, 59.9999999999].map((seconds) => formatTime(seconds)), ["0:00", "0:05", "1:05", "59:59", "1:00:00", "1:02:05", "1:00"]);
    equal([formatTime(5, true), formatTime(125, false, "fi"), formatTime(3725, true, "fi"), formatTime(5, false, "ar-EG"), formatTime(5, false, "not a tag!"), formatTime(-3), formatTime(Number.NaN)], [
        "0:00:05", "2.05", "1.02.05", "٠:٠٥", "0:05", "0:00", "0:00",
    ]);

    const continuous = await probe({ step: () => {} });
    continuous.core.advance(3725);
    equal(part(continuous.host, "time").textContent, "1:02:05", "a continuous run that has run for more than an hour");
    continuous.core.disconnect();

    // A film of an hour and a half, a minute in. The element only has to report its times.
    const film = document.createElement("video");
    Object.defineProperty(film, "duration", { value: 5400 });
    Object.defineProperty(film, "currentTime", { value: 65, writable: true });
    const long = await probe(() => film, `<div lang="fi"><ww-playback-probe></ww-playback-probe></div>`);
    equal([part(long.host, "time").textContent, part(long.host, "seek").getAttribute("aria-valuetext"), part<HTMLInputElement>(long.host, "seek").max], ["0.01.05 / 1.30.00", "0.01.05 / 1.30.00", "5400"]);
    long.core.disconnect();
});

check("media: an element that is off screen or in a hidden tab keeps playing, and step and back move it by the interval", async () => {
    const video = silentVideo();
    const { core, host } = await probe({ media: () => video, interval: 0.25 }, OFF_SCREEN);
    await until(() => video.readyState >= 1, "the generated sound did not load", 5000);
    await core.play();
    await until(() => video.currentTime > 0.1, "the media did not play off screen", 3000);
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    try {
        document.dispatchEvent(new Event("visibilitychange"));
        const at = video.currentTime;
        await until(() => video.currentTime > at + 0.1, "the media did not keep playing in a hidden tab", 3000);
        equal([video.paused, core.paused], [false, false], "the module leaves a media element alone");
    } finally {
        delete (document as { visibilityState?: string }).visibilityState;
    }
    document.dispatchEvent(new Event("visibilitychange"));

    core.seek(1);
    part(host, "step").click();
    part(host, "step").click();
    equal([video.currentTime, video.paused], [1.5, true], "a step pauses and moves by the interval");
    part(host, "back").click();
    equal([video.currentTime, core.interval], [1.25, 0.25]);
    core.disconnect();
    URL.revokeObjectURL(video.src);
});

check("stepper: its buttons announce the keys of their actions, a hidden action keeps its key, and the bar alone announces nothing", async () => {
    const stepper = await mount<Stepper>(`<ww-stepper lang="en">${STEPS}</ww-stepper>`);
    const announced = (host: Element, command: string) => part(host, command).getAttribute("aria-keyshortcuts");
    equal([announced(stepper, "back"), announced(stepper, "toggle"), announced(stepper, "step")], ["ArrowLeft PageUp", "Space", "ArrowRight PageDown"]);
    const hint = stepper.shadowRoot!.querySelector(".keys")!.textContent!;
    assert(hint.includes("←") && hint.includes("→") && hint.includes("Space"), `the hint shows the keys: ${hint}`);
    stepper.playback.seek(3);
    stepper.shadowRoot!.querySelector<HTMLElement>(".stage")!.focus();
    equal([key("Home"), stepper.playback.currentStep], [false, 0], "Home is declared on a hidden action");
    part(stepper, "seek").focus();
    stepper.playback.seek(2);
    equal([key("Home"), stepper.playback.currentStep], [true, 2], "on the slider, Home is the slider's");

    const player = await mount<MediaStepper>(`<ww-media-stepper></ww-media-stepper>`);
    equal(announced(player, "toggle"), null, "without Shortcuts the mark does nothing");
});

// ── Run when visible ──────────────────────────────────────────────────────

check("whileVisible: the first frame after a pause reports no time, a stall is cut to the cap, and stop() may come from the step", async () => {
    const frames = fakeFrames();
    const host = await mount(`<div style="height: 20px"></div>`);
    const times: number[] = [];
    const loop = whileVisible(host, (dt) => times.push(Math.round(dt * 1000)), { maxDelta: 0.5 });
    await until(() => frames.pending === 1, "the loop did not ask for a frame");
    frames.fire(1000);
    frames.fire(1016);
    frames.fire(9016);
    equal([times, loop.running], [[16, 500], true], "no step for the first frame; eight seconds count as the cap");

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    try {
        document.dispatchEvent(new Event("visibilitychange"));
        equal([frames.pending, loop.running], [0, false], "a hidden tab");
    } finally {
        delete (document as { visibilityState?: string }).visibilityState;
    }
    document.dispatchEvent(new Event("visibilitychange"));
    equal([frames.pending, loop.running], [1, true]);
    frames.fire(60000);
    frames.fire(60020);
    equal(times, [16, 500, 20], "the clock started again: the minute away is not counted, not even up to the cap");

    const stopping = whileVisible(host, () => stopping.stop());
    await until(() => frames.pending === 2, "the second loop did not ask for a frame");
    frames.fire(70000);
    frames.fire(70016);
    equal([stopping.running, frames.pending], [false, 1], "a step that stops its loop gets no further frame");
    loop.stop();
    loop.stop();
    equal([loop.running, frames.pending, listeners(host)], [false, 0, 0], "stop() is safe to call twice");
});

check("whileVisible: a host without a box of its own counts as on screen", async () => {
    const host = await mount(`<div style="display: contents"><p>content</p></div>`);
    let steps = 0;
    const loop = whileVisible(host, () => steps++);
    await until(() => steps > 0, "the loop did not run for a host with display: contents");
    loop.stop();
});

// ── Teardown and the other modules ────────────────────────────────────────

check("teardown: nothing runs or listens after disconnect, and a moved widget continues", async () => {
    const before = listeners(document, window);
    const stepper = await mount<Stepper>(`<ww-stepper interval="0.03">${Array(400).fill("<p>s</p>").join("")}</ww-stepper>`);
    const { playback } = stepper;
    const parent = stepper.parentElement!;
    await playback.play();
    await until(() => playback.currentStep > 1, "the run did not start");
    stepper.remove();
    const at = playback.currentStep;
    await frame(8);
    equal([playback.currentStep, playback.paused], [at, false], "no step while disconnected");
    equal(listeners(document, window), before, "no listener is left on the document or the window");
    parent.append(stepper);
    await until(() => playback.currentStep > at, "the run did not continue after the move");
    stepper.remove();
});

check("authoring: a step added with the caret in it is shown at once, and a removed step shortens the run", async () => {
    const stepper = await mount<Stepper>(`<ww-stepper contenteditable>${STEPS}</ww-stepper>`);
    const { playback } = stepper;
    const shown = () => stepper.shadowRoot!.querySelector("slot")!.assignedElements();
    const count = stepper.children.length;
    equal([playback.currentStep, shown().length], [0, 1]);
    // What the editor does on Enter at the end of the first step: a new paragraph after it, with the caret inside.
    const added = document.createElement("p");
    added.textContent = "new";
    stepper.children[0].after(added);
    getSelection()!.setPosition(added, 0);
    await settled(stepper);
    equal([playback.currentStep, shown()[0] === added], [1, true], "the new step is the one shown");
    // A step that arrives without the caret (a paste, a collaborator) only makes the run longer.
    stepper.append(document.createElement("p"));
    await settled(stepper);
    equal([playback.currentStep, part<HTMLInputElement>(stepper, "seek").max], [1, String(count + 1)], "the run is read again, the view stays");
    added.remove();
    await settled(stepper);
    equal([playback.currentStep, shown()[0] === stepper.children[1]], [1, true], "the step that took its place is shown");
    getSelection()!.removeAllRanges();
});

check("shortcuts: Space and the arrow keys drive the run, and the slider keeps its own arrows", async () => {
    const stepper = await mount<Stepper>(`<ww-stepper interval="100">${STEPS}</ww-stepper>`);
    const { playback } = stepper;
    const stage = stepper.shadowRoot!.querySelector<HTMLElement>(".stage")!;
    stage.focus();
    equal(key("ArrowRight"), false, "the key is consumed");
    equal(key("PageDown"), false);
    equal(playback.currentStep, 2);
    key("ArrowLeft");
    equal(playback.currentStep, 1);
    key(" ");
    equal(playback.paused, false);
    key(" ");
    equal(playback.paused, true);

    part(stepper, "seek").focus();
    equal(key("ArrowRight"), true, "an arrow key on the slider is left to the slider");
    equal(playback.currentStep, 1);
    part(stepper, "step").focus();
    equal(key(" "), true, "Space on a button is left to the button");
    equal(playback.paused, true);
});

run();
