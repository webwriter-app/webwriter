// Checks of Permissions beyond the mode and the attributes: the editor's
// attribute rule, the reserved name, answers without holding the controller,
// components inside a widget's shadow tree, the development warning, and the
// loss of a permission during an interaction.
import { assert, check, equal, frame, listeners, mount, mutations, point, pointer, settled, warnings } from "../../test/harness";
import { html, LitElement } from "lit";
import { announcer } from "@webwriter/widget/announce";
import { ModuleCore } from "@webwriter/widget/base";
import { PointerGesture } from "@webwriter/widget/gesture";
import { loadMessages, Messages } from "@webwriter/widget/messages";
import { sharedMessages, type SharedMessages } from "@webwriter/widget/messages/shared";
import { can, isEditing, PermissionsCore, requestPermissions } from "@webwriter/widget/permissions";
import { CoreController } from "@webwriter/lit/base";
import { Permissions, widgetPermissions } from "@webwriter/lit/permissions";
import { ExampleElement } from "../shared/base";

const declaration = (text: string) => ({ label: { _: `Learners may ${text} in this widget` } });

// ── Names and attributes ──────────────────────────────────────────────────

class Rules extends LitElement {
    static properties = { allowAdding: { type: Boolean, attribute: "allow-adding" }, allowDeleting: { type: Boolean } };
    static permissions = {
        allowAdding: declaration("add nodes"),
        allowDeleting: declaration("delete nodes"),
        allowRenaming: { ...declaration("rename nodes"), attribute: "may-rename" },
        edit: declaration("edit"),
    };
    #permissions = new Permissions(this);
    get gate() {
        return this.#permissions;
    }
    render() {
        return html`<button id="rename" data-ww-can="allowRenaming">Rename</button><button id="edit" data-ww-can="edit">Title</button>`;
    }
}
customElements.define("ww-rules", Rules);

check("permissions: the attribute follows the editor's rule, and `edit` is never a permission", async () => {
    const log = warnings();
    const el = await mount<Rules>(`<ww-rules allow-adding allowdeleting may-rename edit></ww-rules>`);
    const { core } = el.gate;
    equal(["allowAdding", "allowDeleting", "allowRenaming"].map((name) => core.attributeOf(name)), ["allow-adding", "allowdeleting", "may-rename"], "Lit property, lowercase name, the declaration's own attribute");
    equal(core.names, ["allowAdding", "allowDeleting", "allowRenaming"], "`edit` is not among the permissions");
    equal(el.gate.snapshot.granted, ["allowAdding", "allowDeleting", "allowRenaming"]);
    equal([el.gate.can("allowRenaming"), el.gate.can("edit")], [true, false], "an `edit` attribute grants nothing");
    const $ = (id: string) => el.shadowRoot!.getElementById(id)!;
    equal([$("rename").hidden, $("edit").hidden], [false, true]);
    assert(log.stop().some((message) => /"edit" is reserved/.test(message)), "declaring `edit` is reported in development");

    el.removeAttribute("may-rename"); // as undo or a collaborator would
    await settled(el);
    equal([el.gate.can("allowRenaming"), $("rename").hidden], [false, true], "an attribute that is no Lit property is followed too");
    el.setAttribute("contenteditable", "");
    await settled(el);
    equal([el.gate.can("edit"), $("edit").hidden], [true, false], "`edit` is true for authors");
});

check("permissions: a marked element that already has the right state is not written again", async () => {
    const el = await mount<Rules>(`<ww-rules may-rename></ww-rules>`);
    const seen = mutations(el.shadowRoot!);
    el.requestUpdate();
    await settled(el);
    el.setAttribute("title", "x");
    el.gate.core.refresh();
    equal(seen.stop().length, 0, "no attribute is set to the value it has");
});

// ── Answers without holding the controller ────────────────────────────────

class Bare extends LitElement {
    static properties = { allowAdding: { type: Boolean, attribute: "allow-adding" } };
    static permissions = { allowAdding: declaration("add nodes") };
    render() {
        return html`<i></i>`;
    }
}
customElements.define("ww-bare", Bare);

check("permissions: can(host, name) uses the widget's Permissions, or the same rule without them", async () => {
    const withController = await mount<Rules>(`<ww-rules allow-adding></ww-rules>`);
    const bare = await mount<Bare>(`<ww-bare allowadding></ww-bare>`);
    assert(requestPermissions(withController) === withController.gate.core, "the widget's own Permissions answer for it");
    assert(requestPermissions(bare) === undefined, "a widget without Permissions has none to give");
    equal([can(withController, "allowAdding"), can(withController, "allowDeleting"), can(withController, "edit"), isEditing(withController)], [true, false, false, false]);
    equal([can(bare, "allowAdding"), can(bare, "nope")], [false, false], "the Lit property's attribute is allow-adding, so allowadding grants nothing");
    bare.setAttribute("allow-adding", "");
    assert(can(bare, "allowAdding"), "granted, without a controller");
    const inside = bare.shadowRoot!.querySelector("i")!;
    equal([can(inside, "allowAdding"), isEditing(inside)], [true, false], "an element in the shadow tree gets the widget's answer");
    bare.setAttribute("contenteditable", "");
    equal([can(bare, "nope"), can(inside, "edit"), isEditing(inside), (inside as HTMLElement).isContentEditable], [true, true, true, false], "edit mode reaches the shadow tree, where isContentEditable is false");

    const before = listeners(window, document, withController);
    for (let i = 0; i < 3; i++) can(withController, "allowAdding");
    equal(listeners(window, document, withController), before, "asking leaves nothing behind");
});

// ── Components inside a widget ────────────────────────────────────────────

/** Uses the answers only. */
class InnerAnswers extends LitElement {
    #permissions = widgetPermissions(this);
    renders = 0;
    render() {
        this.renders++;
        return html`<span>${this.#permissions.can("allowAdding")}/${this.#permissions.can("edit")}/${this.#permissions.editing}</span>`;
    }
}
/** Marks its own template and declares one permission of its own. */
class InnerMarked extends LitElement {
    static permissions = { allowZoom: declaration("zoom") };
    #permissions = new Permissions(this);
    get gate() {
        return this.#permissions;
    }
    render() {
        return html`<button id="add" data-ww-can="allowAdding">Add</button><button id="edit" data-ww-can="edit">Edit</button><button id="zoom" data-ww-can="allowZoom">Zoom</button>`;
    }
}
class Outer extends LitElement {
    static properties = { allowAdding: { type: Boolean, attribute: "allow-adding" } };
    static permissions = { allowAdding: declaration("add nodes") };
    #permissions = new Permissions(this);
    get gate() {
        return this.#permissions;
    }
    render() {
        return html`<ww-inner-answers></ww-inner-answers><ww-inner-marked></ww-inner-marked><slot></slot>`;
    }
}
customElements.define("ww-inner-answers", InnerAnswers);
customElements.define("ww-inner-marked", InnerMarked);
customElements.define("ww-outer", Outer);

check("permissions: components in the shadow tree get the widget's answers and follow them", async () => {
    const outer = await mount<Outer>(`<ww-outer><ww-inner-answers id="slotted"></ww-inner-answers></ww-outer>`);
    const answers = outer.shadowRoot!.querySelector<InnerAnswers>("ww-inner-answers")!;
    const marked = outer.shadowRoot!.querySelector<InnerMarked>("ww-inner-marked")!;
    const slotted = outer.querySelector<InnerAnswers>("#slotted")!;
    await settled(answers, marked, slotted);
    const text = (element: Element) => element.shadowRoot!.querySelector("span")!.textContent;
    const hidden = () => ["add", "edit", "zoom"].map((id) => marked.shadowRoot!.getElementById(id)!.hidden);
    equal([text(answers), hidden()], ["false/false/false", [true, true, true]], "read mode, nothing granted");
    assert(requestPermissions(answers) === outer.gate.core, "the request from a component is answered by the widget");
    assert(requestPermissions(marked.shadowRoot!.getElementById("add")!) === marked.gate.core, "and from inside a component with Permissions by that component");

    outer.setAttribute("allow-adding", "");
    await settled(outer, answers, marked);
    equal([text(answers), hidden(), marked.gate.can("allowAdding")], ["true/false/false", [false, true, true], true], "the widget's permission arrives in both components");
    const renders = answers.renders;
    outer.setAttribute("title", "unrelated");
    await settled(outer, answers);
    equal(answers.renders, renders, "an unrelated attribute of the widget renders no component");

    marked.setAttribute("allowzoom", "");
    await settled(marked);
    equal(hidden(), [false, true, false], "a permission the component declares itself is read from its own attribute");

    outer.removeAttribute("allow-adding");
    outer.setAttribute("contenteditable", "");
    await settled(outer, answers, marked);
    equal([text(answers), hidden(), marked.gate.editing, marked.isContentEditable], ["true/true/true", [false, false, false], true, false], "edit mode arrives although isContentEditable is false in the shadow tree");

    // A slotted child is in the document, not in the widget's shadow tree: it is its own widget.
    assert(requestPermissions(slotted) === undefined, "the widget does not answer for a slotted child");
    slotted.requestUpdate();
    await settled(slotted);
    equal(text(slotted), "true/true/true", "which is editable by itself, through the document");
    outer.removeAttribute("contenteditable");
    slotted.requestUpdate();
    await settled(outer, answers, marked, slotted);
    equal([text(answers), text(slotted), hidden()], ["false/false/false", "false/false/false", [true, true, false]]);

    const before = marked.gate.snapshot;
    outer.remove();
    outer.setAttribute("allow-adding", "");
    await frame(2);
    assert(marked.gate.snapshot === before && !marked.gate.core.connected, "after the disconnect a component no longer follows the widget");
});

check("permissions: with the editing option a component answers alone", async () => {
    const outer = await mount<Outer>(`<ww-outer allow-adding contenteditable></ww-outer>`);
    const inner = outer.shadowRoot!.querySelector<InnerMarked>("ww-inner-marked")!;
    let editing = false;
    const core = new PermissionsCore(inner, { editing: () => editing });
    core.connect();
    equal([core.editing, core.can("allowAdding"), core.can("allowZoom")], [false, false, false], "it does not ask the widget around it");
    editing = true;
    equal([core.editing, core.can("allowAdding")], [true, true]);
    core.disconnect();
});

// ── Development warning ───────────────────────────────────────────────────

// The same mistake on `LitElementWw` and on a plain Lit element: a binding in the member the editor reads as the declaration.
class Clash extends ExampleElement {
    static properties = { allowAdding: { type: Boolean, attribute: "allow-adding" } };
    static permissions = { allowAdding: declaration("add nodes") };
    // @ts-expect-error Wrong on purpose: `LitElementWw` types this member as the declaration.
    permissions = new Permissions(this);
    render() {
        return html`<button data-ww-can="allowAdding">Add</button>`;
    }
}
customElements.define("ww-clash", Clash);

class PlainClash extends LitElement {
    static properties = { allowAdding: { type: Boolean, attribute: "allow-adding" } };
    static permissions = { allowAdding: declaration("add nodes") };
    permissions = new Permissions(this);
    render() {
        return html`<button data-ww-can="allowAdding">Add</button>`;
    }
}
customElements.define("ww-plain-clash", PlainClash);

check("permissions: a controller in the public member `permissions` is reported by LitElementWw, not by the binding, and the static declaration still counts", async () => {
    const log = warnings();
    const first = await mount<Clash>(`<ww-clash allow-adding></ww-clash>`);
    const second = await mount<Clash>(`<ww-clash></ww-clash>`);
    const plain = await mount<PlainClash>(`<ww-plain-clash allow-adding></ww-plain-clash>`);
    const all = log.stop();
    const messages = all.filter((message) => message.includes("ww-clash"));
    equal(messages, [`<ww-clash> uses "permissions" for a value that conflicts with the WebWriter widget API.`], "one warning for the class, from the base class of the widget");
    equal(all.filter((message) => message.includes("ww-plain-clash")), [], "a plain Lit element has no base class that looks, and the binding itself says nothing");
    // The cast reads the member as what the class put there.
    const gate = (widget: Clash) => widget.permissions as unknown as Permissions;
    equal([gate(first).can("allowAdding"), gate(second).can("allowAdding"), plain.permissions.can("allowAdding")], [true, false, true], "the controller is not mistaken for a declaration");
    equal([gate(first).core.names, plain.permissions.core.names], [["allowAdding"], ["allowAdding"]]);
    assert(!first.shadowRoot!.querySelector("button")!.hidden && second.shadowRoot!.querySelector("button")!.hidden);
});

// ── Loss during an interaction ────────────────────────────────────────────

/** A minimal interaction: the host is held while the pointer is down. It ends by release, by cancel, or when it is no longer allowed. */
class HoldCore extends ModuleCore<{ held: boolean }> {
    #state = { held: false };
    #can: () => boolean;
    #messages: Messages<SharedMessages>;
    readonly outcomes: string[] = [];

    constructor(host: HTMLElement, can: () => boolean) {
        super(host);
        this.#can = can;
        this.#messages = new Messages(host, sharedMessages);
    }
    getSnapshot() {
        return this.#state;
    }
    protected onConnect() {
        const live = announcer(this.root);
        this.cleanup(live.release);
        // As every module does: this also asks for the catalog of the widget's language.
        this.cleanup(this.#messages.follow(() => this.refresh()));
        this.listen<PointerEvent>(this.root, "pointerdown", async (event) => {
            if (this.#state.held || !this.#can()) return;
            const gesture = new PointerGesture(this.host, event);
            let lost = false;
            this.whileAllowed(this.#can, gesture.ended).addEventListener("abort", () => {
                lost = true;
                gesture.cancel();
            });
            this.#set(true);
            for await (const _ of gesture) void _;
            this.#set(false);
            if (lost) live.announce(this.#messages.current.notAllowed);
            this.outcomes.push(lost ? "lost" : gesture.cancelled ? "cancelled" : "committed");
        });
    }
    #set(held: boolean) {
        this.#state = { held };
        this.notify();
    }
}

class Holdable extends LitElement {
    static properties = { allowHolding: { type: Boolean, attribute: "allow-holding" }, locked: { type: Boolean } };
    static permissions = { allowHolding: declaration("hold the pad") };
    declare locked: boolean;
    #permissions = new Permissions(this);
    hold = new CoreController(this, () => new HoldCore(this, () => this.#permissions.can("allowHolding") && !this.locked));
    render() {
        return html`<div id="pad" style="width: 80px; height: 40px; background: silver">${this.hold.snapshot.held ? "held" : "free"}</div>`;
    }
}
customElements.define("ww-holdable", Holdable);

check("permissions: losing the answer during an interaction cancels it, whoever took it away", async () => {
    const el = await mount<Holdable>(`<ww-holdable allow-holding lang="de"></ww-holdable>`);
    const pad = el.shadowRoot!.getElementById("pad")!;
    const live = () => el.shadowRoot!.querySelector("[data-ww-live]")!.textContent!.trim();
    // The German catalog is a file of its own. What is said before it has arrived is English.
    await loadMessages(sharedMessages, "de");
    const before = listeners();
    const press = async () => {
        pointer(pad, "pointerdown", point(pad));
        await settled(el);
        equal(pad.textContent, "held");
    };
    const outcome = async () => {
        await settled(el);
        equal([pad.textContent, listeners()], ["free", before], "the interaction is over and its listeners are gone");
        return el.hold.core.outcomes.at(-1);
    };

    await press();
    pointer(window, "pointerup", point(pad));
    equal([await outcome(), live()], ["committed", ""], "a release commits and says nothing");

    await press();
    el.removeAttribute("allow-holding"); // the author withdraws the permission, or a remote change does
    equal([await outcome(), live()], ["lost", "Abgebrochen. Das ist hier nicht mehr erlaubt."], "cancelled, and announced in the widget's language");
    pointer(pad, "pointerdown", point(pad));
    await settled(el);
    equal(pad.textContent, "free", "and no new interaction starts");

    el.setAttribute("contenteditable", "");
    await settled(el);
    await press();
    el.removeAttribute("contenteditable"); // the author leaves edit mode while holding
    equal(await outcome(), "lost", "the same when the mode changes");

    el.setAttribute("allow-holding", "");
    await settled(el);
    await press();
    el.locked = true; // the widget's own condition, which shows at a render
    equal(await outcome(), "lost");
    el.locked = false;

    await press();
    pointer(window, "pointercancel", point(pad));
    equal(await outcome(), "cancelled", "an ordinary cancel is not a loss");
    equal(el.hold.core.outcomes, ["committed", "lost", "lost", "lost", "cancelled"]);
});
