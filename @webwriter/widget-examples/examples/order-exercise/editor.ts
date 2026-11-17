// Plays the editor for scoped data blocks in the checks, as its widget-data.ts
// does. Shared by the checks of the data-block helper on Lit and on a plain element.

/** What `manage()` returns. */
export type ManagedScope = {
    /** A snapshot from the scope: the first one, a remote change, an undo. */
    deliver(value: unknown): void;
    /** How often a widget asked for a scope. */
    readonly requests: number;
    /** Stops managing. */
    stop(): void;
};

/**
 * Manages the scoped blocks inside `container`: answers `datarequest`, keeps
 * the scope pending until `deliver()`, and answers an accepted write with a
 * `datachange` on a block it has serialised again.
 */
export function manage(container: HTMLElement): ManagedScope {
    let target: HTMLScriptElement | null = null;
    let ready = false;
    let own = "";
    let requests = 0;
    const send = (type: string) => target!.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: { mode: "individual" } }));
    const request = (event: Event) => {
        event.preventDefault();
        target = event.target as HTMLScriptElement;
        ready = false;
        requests++;
        send("datapending");
    };
    container.addEventListener("datarequest", request);
    const observer = new MutationObserver(() => {
        if (!target || !ready || target.textContent === own) return;
        own = target.textContent = JSON.stringify(JSON.parse(target.textContent!), null, 2);
        send("datachange");
    });
    observer.observe(container, { childList: true, characterData: true, subtree: true });
    return {
        deliver(value) {
            ready = true;
            own = target!.textContent = JSON.stringify(value, null, 2);
            send("datachange");
        },
        get requests() {
            return requests;
        },
        stop() {
            observer.disconnect();
            container.removeEventListener("datarequest", request);
        },
    };
}
