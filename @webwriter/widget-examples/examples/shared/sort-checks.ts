// Checks shared by the Lit and the plain sort example: same markup, same behaviour.
import { animations, assert, check, deepActive, drag, editorSetPermission, equal, events, frame, key, listeners, mount, mutations, point, pointer, settled, wait } from "../../test/harness";
import type { DragCommitDetail, DragPickDetail } from "@webwriter/widget/drag";
import { click } from "./sort-input";
import { can } from "@webwriter/widget/permissions";

export function sortChecks(tag: string) {
    const items = ["Cherry", "Apple", "Banana", "Date"];
    const markup = (attributes = "allow-reordering") =>
        `<${tag} ${attributes}>${items.map((text) => `<ww-sort-item>${text}</ww-sort-item>`).join("")}</${tag}>`;
    const order = (list: Element) => [...list.children].map((child) => child.textContent);
    const handle = (list: Element, index: number) => list.children[index].shadowRoot!.querySelector<HTMLElement>("[data-ww-drag-handle]")!;
    const marker = (list: Element) => list.shadowRoot!.querySelector<HTMLElement>("[data-ww-drop-marker]");
    const lifted = (list: Element) => [...list.children].filter((child) => child.getAnimations().length > 0);
    const live = (list: Element) => list.shadowRoot!.querySelector("[aria-live]")?.textContent ?? "";
    const below = (element: Element) => point(element, 0.5, 0.9);
    const above = (element: Element) => point(element, 0.5, 0.1);

    check("pointer: dragging the handle below the last item moves the authored child", async () => {
        const list = await mount(markup());
        const first = list.children[0];
        const html = list.innerHTML;
        let detail: DragCommitDetail | undefined;
        list.addEventListener("ww-dragcommit", (event) => (detail = (event as CustomEvent<DragCommitDetail>).detail));
        const changes = mutations(list);
        await drag(handle(list, 0), below(list.children[3]), {
            held() {
                equal(lifted(list).length, 1, "one item is lifted by an animation");
                assert(marker(list), "a drop marker shows the destination");
                equal(order(list), items, "siblings keep their place during the drag");
                equal(changes.stop().length, 0, "the document is untouched before the release");
            },
        });
        equal(order(list), ["Apple", "Banana", "Date", "Cherry"]);
        assert(list.children[3] === first, "the same element was moved, not a copy");
        assert(detail && detail.item === first && detail.index === 3 && detail.before === null, "commit detail gives index 3 and no before");
        equal(list.innerHTML.length, html.length, "no attribute or style is left on the authored children");
        assert(!marker(list) && lifted(list).length === 0, "marker and animations are gone");
    });

    check("pointer: the index comes from the siblings' midpoints", async () => {
        const list = await mount(markup());
        const [, apple, banana] = list.children;
        let detail: DragCommitDetail | undefined;
        list.addEventListener("ww-dragcommit", (event) => (detail = (event as CustomEvent<DragCommitDetail>).detail));
        await drag(handle(list, 3), above(banana)); // Date in front of Banana
        equal(order(list), ["Cherry", "Apple", "Date", "Banana"]);
        assert(detail?.before === banana && detail.index === 2, "before is the item it lands in front of");
        await drag(handle(list, 2), below(apple)); // just past Apple's midpoint: its own place
        equal(order(list), ["Cherry", "Apple", "Date", "Banana"], "a drop on its own place changes nothing");
    });

    check("pointer: only the handle starts a drag", async () => {
        const list = await mount(markup());
        await drag(list.children[0], below(list.children[3]), {
            held: () => equal(lifted(list).length, 0, "pressing the item's text lifts nothing"),
        });
        equal(order(list), items);
    });

    check("pointer: Escape cancels and leaves the DOM untouched", async () => {
        const list = await mount(markup());
        const changes = mutations(list);
        const log = events("ww-dragcommit", "ww-transactionstart");
        await drag(handle(list, 0), below(list.children[3]), {
            cancel: true,
            held: () => equal(lifted(list).length, 1, "the drag was running"),
        });
        equal(order(list), items);
        equal(changes.stop().length, 0, "no mutation of the authored DOM");
        equal(log.stop(), [], "no commit and no transaction");
        assert(!marker(list) && lifted(list).length === 0, "marker and animations are gone");
    });

    check("pointer: a release outside every target changes nothing", async () => {
        const list = await mount(markup());
        const rect = list.getBoundingClientRect();
        await drag(handle(list, 0), { x: rect.right + 150, y: rect.bottom + 150 });
        equal(order(list), items);
    });

    check("keyboard: Space picks up, arrows step, Enter drops, focus stays in the item", async () => {
        const list = await mount(markup());
        const first = list.children[0];
        handle(list, 0).focus();
        key(" ");
        assert(/Picked up Cherry/.test(live(list)), `pick-up is announced: "${live(list)}"`);
        key("ArrowDown");
        key("ArrowDown");
        assert(marker(list), "the marker shows the place");
        assert(/position 3 of 4/.test(live(list)), `the place is announced: "${live(list)}"`);
        equal(order(list), items, "nothing moves before Enter");
        key("Enter");
        await animations();
        equal(order(list), ["Apple", "Banana", "Cherry", "Date"]);
        assert(deepActive() === first.shadowRoot!.querySelector("button"), "focus is still on the moved item's handle");
        assert(/Dropped Cherry/.test(live(list)), `the drop is announced: "${live(list)}"`);
    });

    check("keyboard: Escape cancels and leaves the DOM untouched", async () => {
        const list = await mount(markup());
        const changes = mutations(list);
        const log = events("ww-dragcommit", "ww-transactionstart");
        handle(list, 1).focus();
        key("Enter");
        key("ArrowUp");
        assert(marker(list), "the pick-up was running");
        key("Escape");
        await animations();
        equal(order(list), items);
        equal(changes.stop().length, 0, "no mutation of the authored DOM");
        equal(log.stop(), [], "no commit and no transaction");
        assert(!marker(list), "the marker is gone");
        key("ArrowDown");
        key("Enter"); // picks up again, does not drop the cancelled one
        key("Escape");
        equal(order(list), items);
    });

    check("keyboard: without moveBefore() the item is re-inserted and focus restored", async () => {
        const list = await mount(markup());
        const native = Object.getOwnPropertyDescriptor(Element.prototype, "moveBefore");
        assert(native, "this browser has moveBefore()");
        delete (Element.prototype as { moveBefore?: unknown }).moveBefore;
        try {
            handle(list, 0).focus();
            key(" ");
            key("ArrowDown");
            key("Enter");
            await animations();
        } finally {
            Object.defineProperty(Element.prototype, "moveBefore", native);
        }
        equal(order(list), ["Apple", "Cherry", "Banana", "Date"]);
        assert(deepActive() === list.children[1].shadowRoot!.querySelector("button"), "focus is back on the moved item's handle");
    });

    check("permission: no drag in read mode without it, by pointer or keyboard", async () => {
        const list = await mount(markup(""));
        await drag(handle(list, 0), below(list.children[3]), {
            held: () => equal(lifted(list).length, 0, "nothing is lifted"),
        });
        handle(list, 0).focus();
        key(" ");
        key("ArrowDown");
        key("Enter");
        await animations();
        equal(order(list), items);
        list.setAttribute("allow-reordering", "");
        await settled(list);
        await drag(handle(list, 0), below(list.children[3]));
        equal(order(list), ["Apple", "Banana", "Date", "Cherry"], "granting the permission enables the drag");
    });

    check("permission: the declaration is the editor's own, and the editor's switch is what grants", async () => {
        const list = await mount(markup(""));
        const declared = (list.constructor as unknown as { permissions: Record<string, { label: { _: string } }> }).permissions;
        equal(Object.keys(declared), ["allowReordering"]);
        assert(/in this widget/.test(declared.allowReordering.label._), "the label says where the permission applies");
        assert(!can(list, "allowReordering") && !list.hasAttribute("allow-reordering"));
        equal(editorSetPermission(list, "allowReordering", true), true);
        assert(list.hasAttribute("allow-reordering"), "the editor and the module agree on the attribute");
        await settled(list);
        assert(can(list, "allowReordering"));
        await drag(handle(list, 0), below(list.children[3]));
        equal(order(list), ["Apple", "Banana", "Date", "Cherry"], "the author's switch enables the drag");
        equal([editorSetPermission(list, "allowReordering", false), can(list, "allowReordering")], [true, false]);
        equal(editorSetPermission(list, "notDeclared", true), false, "the editor offers only declared permissions");
    });

    check("permission: edit mode allows the drag without it", async () => {
        const list = await mount(markup("contenteditable"));
        await drag(handle(list, 0), below(list.children[3]));
        equal(order(list), ["Apple", "Banana", "Date", "Cherry"]);
    });

    check("permission: withdrawing it during a drag cancels the drag", async () => {
        const list = await mount(markup());
        await drag(handle(list, 0), below(list.children[3]), {
            async held() {
                list.removeAttribute("allow-reordering");
                await settled(list);
                await animations();
                equal(lifted(list).length, 0, "the item was put back");
            },
        });
        equal(order(list), items);
    });

    check("permission: the author-only button shows in edit mode only and sorts in one transaction", async () => {
        const list = await mount(markup());
        const button = list.shadowRoot!.querySelector<HTMLButtonElement>("[data-ww-can=edit]")!;
        assert(button.hidden && button.offsetParent === null, "hidden for readers");
        list.setAttribute("contenteditable", "");
        await settled(list);
        assert(!button.hidden && button.offsetParent !== null, "visible for authors");
        const log = events("ww-transactionstart", "ww-transactionend");
        button.click();
        equal(order(list), ["Apple", "Banana", "Cherry", "Date"]);
        equal(log.stop(), ["ww-transactionstart", "ww-transactionend"]);
        list.removeAttribute("contenteditable");
        await settled(list);
        assert(button.hidden, "hidden again in read mode");
    });

    check("transaction: one start and one end around a commit, with the change in between", async () => {
        const list = await mount(markup());
        const seen: string[] = [];
        const abort = new AbortController();
        for (const type of ["ww-transactionstart", "ww-dragcommit", "ww-transactionend"]) {
            document.addEventListener(type, (event) => {
                if (event.composedPath().includes(list)) seen.push(`${type}:${order(list)[0]}`);
            }, { signal: abort.signal });
        }
        await drag(handle(list, 0), below(list.children[3]));
        abort.abort();
        equal(seen, ["ww-transactionstart:Cherry", "ww-dragcommit:Cherry", "ww-transactionend:Apple"]);
    });

    check("commit: a cancelled ww-dragcommit changes nothing", async () => {
        const list = await mount(markup());
        list.addEventListener("ww-dragcommit", (event) => event.preventDefault());
        const changes = mutations(list);
        await drag(handle(list, 0), below(list.children[3]));
        handle(list, 0).focus();
        key(" ");
        key("ArrowDown");
        key("Enter");
        await animations();
        equal(order(list), items);
        equal(changes.stop().length, 0, "no mutation of the authored DOM");
        assert(/Cancelled/.test(live(list)), `the refusal is announced: "${live(list)}"`);
    });

    check("motion: no settle animation under prefers-reduced-motion", async () => {
        const list = await mount(markup());
        const release = async () => {
            let running = 0;
            pointer(handle(list, 0), "pointerup", below(list.children[3]));
            await wait(0); // the commit runs in microtasks; frames may be slow
            running = document.getAnimations().length;
            await animations();
            return running;
        };
        const press = async () => {
            const start = point(handle(list, 0));
            pointer(handle(list, 0), "pointerdown", start);
            pointer(handle(list, 0), "pointermove", { x: start.x + 6, y: start.y + 6 });
            await frame(2);
            pointer(handle(list, 0), "pointermove", below(list.children[3]));
            await frame(2);
        };
        await press();
        assert((await release()) > 0, "items animate to their new places by default");
        const native = window.matchMedia;
        window.matchMedia = (query) => ({ ...native.call(window, query), matches: /reduce/.test(query) }) as MediaQueryList;
        try {
            await press();
            equal(await release(), 0, "no animation runs after the drop");
        } finally {
            window.matchMedia = native;
        }
        equal(order(list), ["Banana", "Date", "Cherry", "Apple"], "both drops were committed");
    });

    check("click: a click on the handle and then on a place moves the item; a click elsewhere puts it back", async () => {
        const list = await mount(markup());
        const first = list.children[0];
        const target = list.shadowRoot!.querySelector<HTMLElement>("[data-ww-drop]")!;
        const changes = mutations(list);
        click(first);
        assert(!target.hasAttribute("data-ww-drop-candidate"), "a click on the item's text picks nothing up: it has a handle");
        click(handle(list, 0));
        assert(target.hasAttribute("data-ww-drop-candidate"), "a click on the handle picks the item up");
        assert(/^Selected Cherry\./.test(live(list)), `the pick-up is announced: "${live(list)}"`);
        equal(changes.stop().length, 0, "nothing is written onto the authored children");
        click(list.children[3], below(list.children[3]));
        await animations();
        equal(order(list), ["Apple", "Banana", "Date", "Cherry"], "a click on a place in the list drops it there");
        assert(list.children[3] === first && /^Dropped Cherry/.test(live(list)), "the same element, and the drop is announced");

        const log = events("ww-dragcommit", "ww-transactionstart");
        click(handle(list, 0));
        click(document.body);
        assert(!target.hasAttribute("data-ww-drop-candidate") && /^Cancelled/.test(live(list)), "a click outside the widget puts it back");
        click(handle(list, 0));
        click(handle(list, 0));
        assert(!target.hasAttribute("data-ww-drop-candidate"), "and so does a second click on the handle");
        await animations();
        equal([order(list), log.stop()], [["Apple", "Banana", "Date", "Cherry"], []]);
    });

    check("pick-up: ww-dragpick is sent once per pick-up, names the candidates, and its handler decides", async () => {
        const list = await mount(markup());
        const first = list.children[0];
        const target = list.shadowRoot!.querySelector<HTMLElement>("[data-ww-drop]")!;
        const picks: DragPickDetail[] = [];
        list.addEventListener("ww-dragpick", (event) => void picks.push((event as CustomEvent<DragPickDetail>).detail));
        await drag(handle(list, 0), below(list.children[3]));
        equal([picks.length, picks[0].kind, picks[0].effect, picks[0].key], [1, "item", "move", undefined]);
        assert(picks[0].item === first && picks[0].source === target && picks[0].candidates.length === 1 && picks[0].candidates[0] === target, "it names the item and where it may go");
        handle(list, 0).focus();
        key(" ");
        key("Escape");
        equal(picks.length, 2, "a pick-up with the keyboard asks too");

        const none = (event: Event) => void ((event as CustomEvent<DragPickDetail>).detail.candidates.length = 0);
        list.addEventListener("ww-dragpick", none);
        await drag(handle(list, 0), below(list.children[3]), {
            held: () => assert(!target.hasAttribute("data-ww-drop-candidate") && !marker(list), "a target the handler removed is no candidate"),
        });
        equal(order(list), ["Apple", "Banana", "Date", "Cherry"], "and a release on it changes nothing");
        list.removeEventListener("ww-dragpick", none);

        list.addEventListener("ww-dragpick", (event) => event.preventDefault());
        await drag(handle(list, 0), below(list.children[3]), { held: () => equal(lifted(list).length, 0, "a cancelled ww-dragpick refuses the pick-up") });
        equal(order(list), ["Apple", "Banana", "Date", "Cherry"]);
    });

    check("permission: withdrawing it ends a keyboard pick-up and says why", async () => {
        const list = await mount(markup());
        handle(list, 0).focus();
        key(" ");
        key("ArrowDown");
        assert(marker(list), "the pick-up was running");
        list.removeAttribute("allow-reordering");
        await settled(list);
        assert(!marker(list), "the marker is gone");
        equal(live(list).trim(), "Cancelled. This is no longer allowed here.");
        key("Enter");
        await animations();
        equal(order(list), items);
    });

    check("messages: in a German widget the announcements are German", async () => {
        const list = await mount(markup(`allow-reordering lang="de"`));
        handle(list, 0).focus();
        key(" ");
        assert(/^Cherry aufgenommen\. Mit den Pfeiltasten/.test(live(list)), `pick-up: "${live(list)}"`);
        key("ArrowDown");
        key("ArrowDown");
        equal(live(list), "List, Platz 3 von 4");
        key("Enter");
        await animations();
        equal(live(list), "Cherry abgelegt: List, Platz 3 von 4.");
        key(" ");
        key("Escape");
        equal(live(list), "Abgebrochen.");
    });

    check("cleanup: disconnecting removes listeners, observers and module elements", async () => {
        const before = listeners();
        const list = await mount(markup());
        const root = list.shadowRoot!;
        const connected = listeners(root, list);
        handle(list, 0).focus();
        key(" ");
        key("ArrowDown"); // creates the marker and the live region
        const parent = list.parentElement!;
        list.remove();
        equal(listeners(), before, "no listener left on window or document");
        assert(listeners(root, list) < connected, "the module's listeners on the shadow root are gone");
        assert(!root.querySelector("[data-ww-drop-marker], [aria-live]"), "marker and live region are removed");
        const button = root.querySelector<HTMLElement>("[data-ww-can]")!;
        list.setAttribute("contenteditable", "");
        await frame(2);
        assert(button.hidden, "a disconnected widget no longer reacts to the mode");
        list.removeAttribute("contenteditable");

        parent.append(list); // and it works again after a reconnect
        await settled(list);
        equal(listeners(root, list), connected, "reconnecting registers the same listeners once");
        await drag(handle(list, 0), below(list.children[3]));
        equal(order(list), ["Apple", "Banana", "Date", "Cherry"]);
    });

    check("cleanup: disconnecting during a drag ends it without a commit", async () => {
        const before = listeners();
        const list = await mount(markup());
        const log = events("ww-dragcommit", "ww-transactionstart");
        const first = list.children[0];
        const start = point(handle(list, 0));
        pointer(handle(list, 0), "pointerdown", start);
        pointer(handle(list, 0), "pointermove", { x: start.x + 6, y: start.y + 6 });
        await frame(2);
        equal(lifted(list).length, 1, "the drag was running");
        list.remove();
        await frame(2);
        equal(first.getAnimations().length, 0, "the lift animation was cancelled");
        equal(order(list), items);
        equal(log.stop(), []);
        equal(listeners(), before, "no listener left on window or document");
    });
}
