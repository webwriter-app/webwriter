import {SchemaPlugin} from ".";
import {Plugin, PluginKey, Transaction} from "prosemirror-state";
import {Decoration, DecorationSet} from "prosemirror-view";
import {Slice} from "prosemirror-model";
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
}

function createSuggestionId(tr: Transaction): string {
    return `suggestion-${Date.now()}-${tr.time}`;
}

export const aiPluginKey = new PluginKey<AIState>('ai');

export const aiPlugin = () => ({
    plugin: new Plugin<AIState>({
        key: aiPluginKey,
        state: {
            init(_, __): AIState {
                return {
                    decorations: DecorationSet.empty,
                    suggestions: [],
                };
            },
            apply(tr, state, _oldState, _newState): AIState {
                let {suggestions, decorations} = state;

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

                        const decoNode = Decoration.inline(from, to, {
                            class: "ai-suggestion",
                            "data-suggestion-id": id,
                        }, { id });

                        // Erzeuge das Widget per Factory-Funktion und mit eindeutigem key, damit kein DOM zwischen Suggestions recycelt wird
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
                            side: 1
                        });

                        decorations = decorations.add(tr.doc, [decoNode, decoWidget]);
                        suggestions = [...suggestions, newSuggestion];

                    } else if (action.remove) {
                        const {id} = action.remove;
                        const suggestionToRemove = suggestions.find(s => s.id === id);
                        if (suggestionToRemove) {
                            suggestions = suggestions.filter(s => s.id !== id);
                            const decosToRemove = decorations.find(undefined, undefined, (spec) => {
                                return spec.id === id || spec['data-suggestion-id'] === id;
                            });
                            decorations = decorations.remove(decosToRemove);
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
                    }
                }

                return {suggestions, decorations};
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