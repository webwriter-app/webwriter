import { EditorView } from "prosemirror-view";
import { Node as ProseMirrorNode } from "prosemirror-model";
import { aiPluginKey } from "../../model/schemas/resource/plugins/ai";

/**
 * Ersetzt einen Inhaltsbereich durch einen AI-Vorschlag und hebt ihn hervor.
 *
 * @param view Die Editor-Ansicht.
 * @param from Die Startposition der zu ersetzenden Stelle.
 * @param to Die Endposition der zu ersetzenden Stelle.
 * @param newContent Der neue Knoten (oder die Knoten), der als Vorschlag eingefügt werden soll.
 */
export function suggestChange(view: EditorView, from: number, to: number, newContent: ProseMirrorNode | ProseMirrorNode[]) {
    const { state } = view;
    
    // 1. Den ursprünglichen Inhalt für eine mögliche Wiederherstellung speichern.
    const originalContent = state.doc.slice(from, to);

    // 2. Eine Transaktion erstellen, die den Inhalt ersetzt.
    let tr = state.tr.replaceWith(from, to, newContent);

    // Die neue Endposition nach dem Einfügen des Inhalts berechnen.
    const newContentSize = Array.isArray(newContent)
        ? newContent.reduce((size, node) => size + node.nodeSize, 0)
        : newContent.nodeSize;
    const newTo = from + newContentSize;

    // 3. Die Metadaten für das AI-Plugin hinzufügen, um die Dekoration zu erstellen.
    //    Wir übergeben den ursprünglichen Inhalt, damit das Plugin ihn speichern kann.
    tr = tr.setMeta(aiPluginKey, {
        add: {
            from: from,
            to: newTo,
            originalContent: originalContent
        }
    });
    tr = tr.setMeta('addToHistory', false);

    view.dispatch(tr);
}