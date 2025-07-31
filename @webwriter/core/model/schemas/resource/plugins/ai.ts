import {SchemaPlugin} from ".";
import {HTMLElementSpec} from "../htmlelementspec";
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
            apply(tr, state, oldState, newState): AIState {
                let {suggestions, decorations} = state;

                // Map existing suggestions and decorations through the transaction's mapping
                decorations = decorations.map(tr.mapping, tr.doc);
                suggestions = suggestions.map(suggestion => {
                    return {
                        ...suggestion,
                        from: tr.mapping.map(suggestion.from),
                        to: tr.mapping.map(suggestion.to),
                    };
                }).filter(suggestion => suggestion.from < suggestion.to);


                const action = tr.getMeta(aiPluginKey);

                if (action) {
                    if (action.add) {
                        const {from, to, originalContent} = action.add;
                        const id = createSuggestionId(tr);
                        const newSuggestion: Suggestion = {id, from, to, originalContent};

                        const decoNode = Decoration.inline(from, to, {
                            class: "ai-suggestion",
                            "data-suggestion-id": id
                        });

                        const buttonWrapper = document.createElement('div');
                        buttonWrapper.className = 'ai-suggestion-buttons';
                        buttonWrapper.dataset.suggestionId = id;

                        const acceptButton = document.createElement('button');
                        acceptButton.innerHTML = 'Accept';
                        acceptButton.onclick = () => {
                            // Logic will be handled in handleDOMEvents
                        };

                        const rejectButton = document.createElement('button');
                        rejectButton.innerHTML = 'Reject';
                        rejectButton.onclick = () => {
                            // Logic will be handled in handleDOMEvents
                        };

                        buttonWrapper.appendChild(acceptButton);
                        buttonWrapper.appendChild(rejectButton);

                        const decoWidget = Decoration.widget(to, buttonWrapper, {
                            id: id,
                            side: 1
                        });

                        decorations = decorations.add(tr.doc, [decoNode, decoWidget]);
                        suggestions = [...suggestions, newSuggestion];

                    } else if (action.remove) {
                        const {id} = action.remove;
                        const suggestionToRemove = suggestions.find(s => s.id === id);
                        if (suggestionToRemove) {
                            suggestions = suggestions.filter(s => s.id !== id);
                            const decosToRemove = decorations.find(null, null, (spec) => {
                                console.log(spec, id)

                                return spec.id === id || spec['data-suggestion-id'] === id;
                            });
                            decorations = decorations.remove(decosToRemove);
                            console.log(decorations, decosToRemove)
                        }
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
                    if (target.tagName === 'BUTTON' && target.closest('.ai-suggestion-buttons')) {
                        const buttonText = target.textContent;
                        const suggestionId = target.closest<HTMLElement>('.ai-suggestion-buttons')?.dataset.suggestionId;

                        if (!suggestionId) return false;

                        const aiState = aiPluginKey.getState(view.state);
                        const suggestion = aiState?.suggestions.find(s => s.id === suggestionId);

                        if (!suggestion) return false;

                        if (buttonText === 'Accept') {
                            const tr = view.state.tr.setMeta(aiPluginKey, {remove: {id: suggestionId}});
                            setTimeout(() => view.dispatch(tr), 0);

                        } else if (buttonText === 'Reject') {
                            const { from, to, originalContent } = suggestion;
                            const tr = view.state.tr.replaceWith(from, to, originalContent.content);
                            tr.setMeta('addToHistory', false);
                            tr.setMeta(aiPluginKey, {remove: {id: suggestionId}});
                            setTimeout(() => view.dispatch(tr), 0);

                        }
                        return true;
                    }
                    return false;
                }
            }
        }
    }),
    styles: [css]
} as SchemaPlugin);