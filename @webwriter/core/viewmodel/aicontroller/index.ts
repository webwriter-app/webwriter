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


// Eine Dummy-Funktion, die eine AI-Interaktion simuliert.
async function getAISuggestion(text: string): Promise<string> {
    console.log("Sende an AI:", text);
    // In einer echten Anwendung würden Sie hier einen API-Aufruf machen.
    // z.B. await fetch("/api/ai/improve", { method: "POST", body: text });
    await new Promise(resolve => setTimeout(resolve, 500)); // Simuliert Netzwerk-Latenz
    return `✨ ${text.toUpperCase()} ✨ (verbesserte Version)`;
}

/**
 * Löst den AI-Vorschlagsprozess für den aktuell ausgewählten Knoten aus.
 * @param view Die ProseMirror Editor-Ansicht.
 */
export async function triggerAISuggestionForSelection(view: EditorView) {
    const { from, to } = view.state.selection;

    if (from === to) {
        // In einer echten App würden Sie hier vielleicht eine Benachrichtigung anzeigen
        console.warn("Bitte wählen Sie zuerst einen Textabschnitt aus.");
        return;
    }

    // Den Text des ausgewählten Bereichs extrahieren.
    const selectedText = view.state.doc.textBetween(from, to);

    // Den AI-Vorschlag abrufen.
    const suggestedText = await getAISuggestion(selectedText);

    // Den neuen Inhalt als ProseMirror-Knoten erstellen.
    // Wichtig: Das Schema muss zum Dokument passen! 
    // Hier wird angenommen, dass der ersetzte Inhalt ein einzelner Paragraph ist.
    // Bei komplexeren Ersetzungen muss diese Logik angepasst werden.
    const newNode = view.state.schema.node("p", null, [
        view.state.schema.text(suggestedText)
    ]);

    // Die `suggestChange`-Funktion aufrufen, um die Änderung im Editor anzuzeigen.
    suggestChange(view, from, to, newNode);
}

