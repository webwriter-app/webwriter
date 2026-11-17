// The one file that reads editor code from ../domeditor in the same
// repository: the editor's own resolution of `static aggregate`. The import
// sits in a `try`, so a page also loads if that file is gone: `editor` is then
// undefined, and the checks that need it report that they were skipped (`MISSING`).
import type { ExerciseAggregateContext } from "@webwriter/widget/exercise";

/** A participant's snapshot as the editor passes it to the aggregated view. */
export type Participant = { id: string; name: string; snapshot?: { data?: { status: string; format: string; mode: string; scopeId?: string; text?: string } } };

type Context = ExerciseAggregateContext & { readonly missing: number; readonly reference?: unknown };

/** The part of the editor's `widget-aggregate.ts` the checks use. */
export type Editor = {
    aggregateContext(widget: { id: string; attributes: Record<string, string>; html: string }, participants: Participant[]): Context;
    resolveAggregate(widget: Element, context: Context, aggregateId?: string): { config: { shape: string; items?: unknown }; values: unknown[]; context: Context; selectedId: string } | null;
};

async function loadEditor(): Promise<Editor | undefined> {
    try {
        // @ts-ignore The path exists only where the editor sources are.
        return (await import("../../../domeditor/src/widget-aggregate")) as unknown as Editor;
    } catch {
        return undefined;
    }
}

/** The editor's aggregate resolution from the checkout. Undefined without it. */
export const editor = await loadEditor();
/** What a check says when it was skipped for lack of the checkout. */
export const MISSING = "SKIPPED: the editor sources in ../domeditor were not found";
