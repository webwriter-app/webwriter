import {SchemaPlugin} from ".";
import {Plugin, PluginKey, Transaction, EditorState} from "prosemirror-state";
import {Decoration, DecorationSet} from "prosemirror-view";
import {Slice, Schema} from "prosemirror-model";
import css from "./ai.css?raw"

interface Suggestion {
    id: string;
    from: number;
    to: number;
    originalContent: Slice;
}

interface AIState {
    decorations: DecorationSet;
    suggestions: Suggestion[];
    didLazyLoad?: boolean;
}

function createSuggestionId(tr: Transaction): string {
    return `suggestion-${Date.now()}-${tr.time}`;
}

// Persistenz-Helfer
const STORAGE_KEY = 'ww-ai-suggestions';

// Typen für die serialisierte Speicherung
type SerializedSuggestion = {
    id: string;
    from: number;
    to: number;
    originalContent: any; // Slice JSON
};

type PersistedData = {
    docHash: string;
    suggestions: SerializedSuggestion[];
};

// FNV-1a Hash-Implementierung für Strings
function hashStringFNV1a(str: string): string {
    // 32-bit FNV-1a Hash als hex
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        // unsigned 32-bit multiply by FNV prime 16777619
        h = (h >>> 0) * 0x01000193;
    }
    return (h >>> 0).toString(16);
}

// Dokument-Hash basierend auf JSON-Inhalt
function computeDocHashJSON(doc: { toJSON: () => any }): string {
    try {
        const json = JSON.stringify(doc.toJSON());
        return hashStringFNV1a(json);
    } catch (_) {
        return '0';
    }
}

// Serialisierung der Vorschläge für die Speicherung
function serializeSuggestions(suggestions: Suggestion[]): SerializedSuggestion[] {
    return suggestions.map(s => ({
        id: s.id,
        from: s.from,
        to: s.to,
        originalContent: s.originalContent.toJSON()
    }));
}

// Deserialisierung der Vorschläge aus der Speicherung
function deserializeSuggestions(schema: Schema, data: SerializedSuggestion[]): Suggestion[] {
    return data.map(d => ({
        id: d.id,
        from: d.from,
        to: d.to,
        originalContent: Slice.fromJSON(schema, d.originalContent)
    }));
}

// Speichern in den LocalStorage
function saveToLocalStorage(state: EditorState, suggestions: Suggestion[]) {
    if (typeof window === 'undefined' || !window.localStorage) { return; }
    try {
        const docHash = computeDocHashJSON(state.doc);
        const payload: PersistedData = {
            docHash,
            suggestions: serializeSuggestions(suggestions)
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
        // Ignorieren
    }
}

// Laden aus dem LocalStorage
function loadFromLocalStorage(state: EditorState): Suggestion[] | null {
    if (typeof window === 'undefined' || !window.localStorage) { return null; }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) { return null; }
        const payload = JSON.parse(raw) as PersistedData;
        const currentHash = computeDocHashJSON(state.doc);
        const match = payload?.docHash === currentHash;
        if (payload && match) {
            const des = deserializeSuggestions(state.schema, payload.suggestions);
            return des;
        }
        return null;
    } catch {
        return null;
    }
}

// Erstellen von Dekorationen für einen Vorschlag
function createDecorationsForSuggestion(doc: any, suggestion: Suggestion): Decoration[] {
    const { id, from, to } = suggestion;
    const $from = doc.resolve(from);
    const $to = doc.resolve(to);
    const isSingleTextblockRange = $from.sameParent($to) && $from.parent.isTextblock && from !== to;

    const decos: Decoration[] = [];

    if (isSingleTextblockRange) {
        const decoInline = Decoration.inline(from, to, {
            class: "ai-suggestion",
            "data-suggestion-id": id,
        }, { id });
        decos.push(decoInline);
    } else {
        doc.nodesBetween(from, to, (node: any, pos: number) => {
            if (node.isBlock) {
                const decoNode = Decoration.node(pos, pos + node.nodeSize, {
                    class: "ai-suggestion",
                    "data-suggestion-id": id,
                }, { id });
                decos.push(decoNode);
                return false;
            }
            return true;
        });
    }

    const widgetSide = isSingleTextblockRange ? 1 : -1;
    const decoWidget = Decoration.widget(to, () => {
        const buttonWrapper = document.createElement('div');
        buttonWrapper.className = 'ai-suggestion-buttons';
        (buttonWrapper as HTMLElement).dataset.suggestionId = id;

        const badge = document.createElement('span');
        badge.className = 'ai-badge';
        badge.textContent = 'WebWriter AI Vorschlag';
        badge.setAttribute('title', 'KI-Vorschlag');

        const acceptButton = document.createElement('button');
        acceptButton.type = 'button';
        acceptButton.className = 'ai-btn ai-accept';
        acceptButton.setAttribute('title', 'Vorschlag übernehmen');
        acceptButton.setAttribute('aria-label', 'Vorschlag übernehmen');
        (acceptButton as HTMLElement).dataset.action = 'accept';
        acceptButton.innerHTML = '<span class="ai-icon ai-icon-check"></span><span class="ai-btn-label">Annehmen</span>';

        const rejectButton = document.createElement('button');
        rejectButton.type = 'button';
        rejectButton.className = 'ai-btn ai-reject';
        rejectButton.setAttribute('title', 'Vorschlag verwerfen');
        rejectButton.setAttribute('aria-label', 'Vorschlag verwerfen');
        (rejectButton as HTMLElement).dataset.action = 'reject';
        rejectButton.innerHTML = '<span class="ai-icon ai-icon-x"></span><span class="ai-btn-label">Verwerfen</span>';

        buttonWrapper.appendChild(badge);
        buttonWrapper.appendChild(acceptButton);
        buttonWrapper.appendChild(rejectButton);
        return buttonWrapper;
    }, {
        id: id,
        key: id,
        side: widgetSide
    });

    return [...decos, decoWidget];
}

export const aiPluginKey = new PluginKey<AIState>('ai');

export const aiPlugin = () => ({
    plugin: new Plugin<AIState>({
        key: aiPluginKey,
        state: {
            init(_config, editorState): AIState {
                const loaded = loadFromLocalStorage(editorState);
                if (loaded && loaded.length) {
                    const allDecos: Decoration[] = loaded.flatMap(s => createDecorationsForSuggestion(editorState.doc, s));
                    return {
                        decorations: DecorationSet.create(editorState.doc, allDecos),
                        suggestions: loaded,
                        didLazyLoad: true,
                    };
                }
                return {
                    decorations: DecorationSet.empty,
                    suggestions: [],
                    didLazyLoad: false,
                };
            },
            apply(tr, state, _oldState, newState): AIState {
                let {suggestions, decorations} = state;
                let didLazyLoad = state.didLazyLoad ?? false;
                let suggestionsChanged = false;

                // Map existing suggestions and decorations through the transaction's mapping
                decorations = decorations.map(tr.mapping, tr.doc);
                suggestions = suggestions.map(suggestion => {
                    return {
                        ...suggestion,
                        from: tr.mapping.map(suggestion.from),
                        to: tr.mapping.map(suggestion.to),
                    };
                });


                const action = tr.getMeta(aiPluginKey);

                if (action) {
                    if (action.add) {
                        const {from, to, originalContent} = action.add;
                        const id = createSuggestionId(tr);
                        const newSuggestion: Suggestion = {id, from, to, originalContent};

                        // Decorations erzeugen (inline oder node + Widget)
                        const decos = createDecorationsForSuggestion(tr.doc, newSuggestion);
                        decorations = decorations.add(tr.doc, decos);
                        suggestions = [...suggestions, newSuggestion];
                        suggestionsChanged = true;

                    } else if (action.remove) {
                        const {id} = action.remove;
                        const suggestionToRemove = suggestions.find(s => s.id === id);
                        if (suggestionToRemove) {
                            suggestions = suggestions.filter(s => s.id !== id);
                            const decosToRemove = decorations.find(undefined, undefined, (spec) => {
                                return spec.id === id || spec['data-suggestion-id'] === id;
                            });
                            decorations = decorations.remove(decosToRemove);
                            suggestionsChanged = true;
                        }
                    }
                }

                // Filter out invalid suggestions at the end
                suggestions = suggestions.filter(suggestion => suggestion.from <= suggestion.to);

                // Normalize nested suggestions: keep only the largest (non-contained) suggestions
                if (suggestions.length > 1) {
                    const toRemoveIds = new Set<string>();
                    for (let i = 0; i < suggestions.length; i++) {
                        const a = suggestions[i];
                        for (let j = 0; j < suggestions.length; j++) {
                            if (i === j) continue;
                            const b = suggestions[j];
                            // If b is strictly contained within a, mark b for removal
                            if (a.from <= b.from && a.to >= b.to && (a.from < b.from || a.to > b.to)) {
                                toRemoveIds.add(b.id);
                            }
                        }
                    }

                    if (toRemoveIds.size) {
                        // Remove decorations for all suggestions to be removed
                        const decosToRemove = decorations.find(undefined, undefined, (spec) => {
                            const sid = (spec.id as string) || (spec['data-suggestion-id'] as string);
                            return sid ? toRemoveIds.has(sid) : false;
                        });
                        decorations = decorations.remove(decosToRemove);
                        // Keep only suggestions not marked for removal
                        suggestions = suggestions.filter(s => !toRemoveIds.has(s.id));
                        suggestionsChanged = true;
                    }
                }

                // Lazy-Load einmalig nach Stabilisierung (falls init nichts laden konnte)
                if (!didLazyLoad && suggestions.length === 0 && !action) {
                    const lateLoaded = loadFromLocalStorage(newState);
                    if (lateLoaded && lateLoaded.length) {
                        const allDecos: Decoration[] = lateLoaded.flatMap(s => createDecorationsForSuggestion(newState.doc, s));
                        decorations = DecorationSet.create(newState.doc, allDecos);
                        suggestions = lateLoaded;
                        didLazyLoad = true;
                        // Kein sofortiges Speichern nötig; Daten kommen bereits aus Storage
                    }
                }

                // Nur bei echten Änderungen speichern
                if (suggestionsChanged) {
                    try { saveToLocalStorage(newState, suggestions); } catch {}
                }

                return {suggestions, decorations, didLazyLoad};
            }
        },
        props: {
            decorations(state) {
                return aiPluginKey.getState(state)?.decorations || DecorationSet.empty;
            },
            handleDOMEvents: {
                click: (view, event: MouseEvent) => {
                    const target = event.target as HTMLElement;
                    // Support clicks on icon/spans inside the button as well
                    const buttonEl = target.closest('button');
                    const wrapper = target.closest<HTMLElement>('.ai-suggestion-buttons');
                    if (!buttonEl || !wrapper) return false;

                    const suggestionId = wrapper.dataset.suggestionId;
                    if (!suggestionId) return false;

                    const aiState = aiPluginKey.getState(view.state);
                    const suggestion = aiState?.suggestions.find(s => s.id === suggestionId);
                    if (!suggestion) return false;

                    const action = (buttonEl as HTMLButtonElement).dataset.action || buttonEl.textContent?.trim().toLowerCase();

                    if (action === 'accept' || action === 'annehmen') {
                        const tr = view.state.tr.setMeta(aiPluginKey, {remove: {id: suggestionId}});
                        setTimeout(() => view.dispatch(tr), 0);
                        return true;
                    }

                    if (action === 'reject' || action === 'verwerfen') {
                        const { from, to, originalContent } = suggestion;
                        const tr = view.state.tr.replaceWith(from, to, originalContent.content);
                        tr.setMeta('addToHistory', false);
                        tr.setMeta(aiPluginKey, {remove: {id: suggestionId}});
                        view.dispatch(tr);
                        return true;
                    }

                    return false;
                }
            }
        }
    }),
    styles: [css]
} as SchemaPlugin);