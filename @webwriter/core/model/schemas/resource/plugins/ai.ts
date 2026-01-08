import {SchemaPlugin} from ".";
import {Plugin, PluginKey, Transaction, EditorState} from "prosemirror-state";
import {Decoration, DecorationSet} from "prosemirror-view";
import {Slice, Schema} from "prosemirror-model";
import {ReplaceStep} from "prosemirror-transform";
import css from "./ai.css?raw"
import {msg} from "@lit/localize";

/**
 * Represents an AI suggestion with its position and original content.
 */
interface Suggestion {
    id: string;
    from: number;
    to: number;
    originalContent: Slice;
}

/**
 * State of the AI plugin, including decorations and suggestions.
 */
interface AIState {
    decorations: DecorationSet;
    suggestions: Suggestion[];
    didLazyLoad?: boolean;
}

/**
 * Generates a unique ID for a suggestion based on transaction time.
 */
function createSuggestionId(tr: Transaction): string {
    return `suggestion-${Date.now()}-${tr.time}`;
}

// Persistence helpers
const STORAGE_KEY = 'ww-ai-suggestions';

/**
 * Serialized form of a suggestion for storage.
 */
type SerializedSuggestion = {
    id: string;
    from: number;
    to: number;
    originalContent: any; // Slice JSON
};

/**
 * Data structure for persisted suggestions.
 */
type PersistedData = {
    docHash: string;
    suggestions: SerializedSuggestion[];
};

/**
 * FNV-1a hash implementation for strings (32-bit, hex output).
 */
function hashStringFNV1a(str: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h >>> 0) * 0x01000193;
    }
    return (h >>> 0).toString(16);
}

/**
 * Computes a hash for the document based on its JSON representation.
 */
function computeDocHashJSON(doc: { toJSON: () => any }): string {
    try {
        const json = JSON.stringify(doc.toJSON());
        return hashStringFNV1a(json);
    } catch (_) {
        return '0';
    }
}

/**
 * Serializes suggestions for storage.
 */
function serializeSuggestions(suggestions: Suggestion[]): SerializedSuggestion[] {
    return suggestions.map(s => ({
        id: s.id,
        from: s.from,
        to: s.to,
        originalContent: s.originalContent.toJSON()
    }));
}

/**
 * Deserializes suggestions from storage.
 */
function deserializeSuggestions(schema: Schema, data: SerializedSuggestion[]): Suggestion[] {
    return data.map(d => ({
        id: d.id,
        from: d.from,
        to: d.to,
        originalContent: Slice.fromJSON(schema, d.originalContent)
    }));
}

/**
 * Saves suggestions to localStorage with document hash.
 */
function saveToLocalStorage(state: EditorState, suggestions: Suggestion[]) {
    if (typeof window === 'undefined' || !window.localStorage) {
        return;
    }
    try {
        const docHash = computeDocHashJSON(state.doc);
        const payload: PersistedData = {
            docHash,
            suggestions: serializeSuggestions(suggestions)
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
        // Ignore errors
    }
}

/**
 * Loads suggestions from localStorage if document hash matches.
 */
function loadFromLocalStorage(state: EditorState): Suggestion[] | null {
    if (typeof window === 'undefined' || !window.localStorage) {
        return null;
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const payload = JSON.parse(raw) as PersistedData;
        const currentHash = computeDocHashJSON(state.doc);
        const match = payload?.docHash === currentHash;
        if (payload && match) {
            return deserializeSuggestions(state.schema, payload.suggestions);
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Creates decorations for a single suggestion, including inline/node decorations and action buttons.
 */
function createDecorationsForSuggestion(doc: any, suggestion: Suggestion): Decoration[] {
    const {id, from, to} = suggestion;
    const $from = doc.resolve(from);
    const $to = doc.resolve(to);
    const isSingleTextblockRange = $from.sameParent($to) && $from.parent.isTextblock && from !== to;

    const decos: Decoration[] = [];

    if (isSingleTextblockRange) {
        const decoInline = Decoration.inline(from, to, {
            class: "ai-suggestion",
            "data-suggestion-id": id,
        }, {id});
        decos.push(decoInline);
    } else {
        doc.nodesBetween(from, to, (node: any, pos: number) => {
            if (node.isBlock) {
                const decoId = `${id}-${pos}`;
                const decoNode = Decoration.node(pos, pos + node.nodeSize, {
                    class: "ai-suggestion",
                    "data-suggestion-id": decoId,
                }, {id: decoId});
                decos.push(decoNode);
                return false;
            }
            return true;
        });
    }

    const isTopLevel = $from.depth === 0;
    const widgetPos = isTopLevel ? to : $to.after($from.depth);

    const decoWidget = Decoration.widget(widgetPos, () => {
        const buttonWrapper = document.createElement('div');
        buttonWrapper.className = 'ai-suggestion-buttons';
        (buttonWrapper as HTMLElement).dataset.suggestionId = id;

        const badge = document.createElement('span');
        badge.className = 'ai-badge';
        badge.textContent = msg('WebWriter AI Suggestion');
        badge.setAttribute('title', msg('WebWriter AI Suggestion'));

        const acceptButton = document.createElement('button');
        acceptButton.type = 'button';
        acceptButton.className = 'ai-btn ai-accept';
        acceptButton.setAttribute('title', msg('Accept suggestion'));
        acceptButton.setAttribute('aria-label', msg('Accept suggestion'));
        (acceptButton as HTMLElement).dataset.action = 'accept';
        acceptButton.innerHTML = '<span class="ai-icon ai-icon-check"></span><span class="ai-btn-label">' + msg("Accept") + '</span>';

        const rejectButton = document.createElement('button');
        rejectButton.type = 'button';
        rejectButton.className = 'ai-btn ai-reject';
        rejectButton.setAttribute('title', msg('Reject suggestion'));
        rejectButton.setAttribute('aria-label', msg('Reject suggestion'));
        (rejectButton as HTMLElement).dataset.action = 'reject';
        rejectButton.innerHTML = '<span class="ai-icon ai-icon-x"></span><span class="ai-btn-label">' + msg("Reject") + '</span>';

        buttonWrapper.appendChild(badge);
        buttonWrapper.appendChild(acceptButton);
        buttonWrapper.appendChild(rejectButton);
        return buttonWrapper;
    }, {
        id: id,
        key: id,
        side: 1
    });

    return [...decos, decoWidget];
}

/**
 * Normalizes suggestions by removing duplicates and nested ones.
 */
function normalizeSuggestions(suggestions: Suggestion[]): Suggestion[] {
    if (suggestions.length <= 1) {
        return suggestions;
    }

    const toRemoveIds = new Set<string>();
    for (let i = 0; i < suggestions.length; i++) {
        const a = suggestions[i];
        for (let j = 0; j < suggestions.length; j++) {
            if (i === j) continue;
            const b = suggestions[j];

            // If ranges are identical, keep the first one
            if (a.from === b.from && a.to === b.to) {
                if (i < j) {
                    toRemoveIds.add(b.id);
                }
                continue;
            }

            // Remove nested suggestions
            if (a.from <= b.from && a.to >= b.to) {
                toRemoveIds.add(b.id);
            }
        }
    }

    if (toRemoveIds.size > 0) {
        return suggestions.filter(s => !toRemoveIds.has(s.id));
    }

    return suggestions;
}

export const aiPluginKey = new PluginKey<AIState>('ai');

/**
 * Creates the AI plugin for managing suggestions.
 */
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

                const initialSuggestions = [...suggestions];

                // Identify suggestions deleted by replace steps
                const deletedSuggestionIds = new Set<string>();
                if (tr.docChanged) {
                    tr.steps.forEach(step => {
                        if (step instanceof ReplaceStep && step.from < step.to) {
                            suggestions.forEach(suggestion => {
                                if (suggestion.from >= step.from && suggestion.to <= step.to) {
                                    deletedSuggestionIds.add(suggestion.id);
                                }
                            });
                        }
                    });
                }

                // Force re-decoration if content inside suggestion changes
                if (tr.docChanged && !suggestionsChanged) {
                    tr.steps.forEach(step => {
                        if (step instanceof ReplaceStep) {
                            const { from, to } = step;
                            const modifiedSuggestion = suggestions.find(s => from >= s.from && to <= s.to);
                            if (modifiedSuggestion) {
                                suggestionsChanged = true;
                            }
                        }
                    });
                }

                // Map suggestions through transaction
                if (tr.docChanged) {
                    suggestions = suggestions.map(suggestion => ({
                        ...suggestion,
                        from: tr.mapping.map(suggestion.from),
                        to: tr.mapping.map(suggestion.to),
                    }));
                }

                // Filter out deleted or collapsed suggestions
                suggestions = suggestions.filter(s => !deletedSuggestionIds.has(s.id) && s.from < s.to);

                // Handle actions (add/remove)
                const action = tr.getMeta(aiPluginKey);
                if (action) {
                    if (action.add) {
                        const {from, to, originalContent} = action.add;
                        const id = createSuggestionId(tr);
                        const newSuggestion: Suggestion = {id, from, to, originalContent};
                        suggestions.push(newSuggestion);
                    } else if (action.remove) {
                        const {id} = action.remove;
                        suggestions = suggestions.filter(s => s.id !== id);
                    }
                }

                // Normalize suggestions
                suggestions = normalizeSuggestions(suggestions);

                // Check if suggestions changed
                if (initialSuggestions.length !== suggestions.length || !initialSuggestions.every((s, i) => s.id === suggestions[i]?.id)) {
                    suggestionsChanged = true;
                }

                // Rebuild decorations if needed
                if (suggestionsChanged) {
                    const allDecos = suggestions.flatMap(s => createDecorationsForSuggestion(newState.doc, s));
                    decorations = DecorationSet.create(newState.doc, allDecos);
                } else if (tr.docChanged) {
                    decorations = decorations.map(tr.mapping, tr.doc);
                }

                // Lazy load if not done yet
                if (!didLazyLoad && suggestions.length === 0 && !action) {
                    const lateLoaded = loadFromLocalStorage(newState);
                    if (lateLoaded && lateLoaded.length) {
                        suggestions = lateLoaded;
                        const allDecos = suggestions.flatMap(s => createDecorationsForSuggestion(newState.doc, s));
                        decorations = DecorationSet.create(newState.doc, allDecos);
                        didLazyLoad = true;
                    }
                }

                // Save to localStorage on changes
                if (suggestionsChanged) {
                    try {
                        saveToLocalStorage(newState, suggestions);
                    } catch {
                    }
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
                        const {from, to, originalContent} = suggestion;
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
