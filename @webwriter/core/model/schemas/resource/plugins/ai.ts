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
            init(): AIState {
                return {suggestions: []};
            },
            apply(tr, state): AIState {
                const suggestions = state.suggestions
                    .map(s => ({...s, from: tr.mapping.map(s.from), to: tr.mapping.map(s.to)}))
                    .filter(s => s.from < s.to);
                const action = tr.getMeta(aiPluginKey);
                if (action?.add) {
                    const {from, to, originalContent} = action.add;
                    return {suggestions: [...suggestions, {id: createSuggestionId(tr), from, to, originalContent}]};
                } else if (action?.remove) {
                    return {suggestions: suggestions.filter(s => s.id !== action.remove.id)};
                }
                return {suggestions};
            }
        },
        props: {
            decorations(editorState) {
                const state = aiPluginKey.getState(editorState);

                /* Create decorations for each suggestion */
                const decorations = state?.suggestions.flatMap(s => {

                    /* Inline decoration for the "this is a suggestion" highlighting */
                    const inline = Decoration.inline(s.from, s.to, {
                        class: 'ai-suggestion',
                        'data-suggestion-id': s.id
                    });

                    /* Widget decoration for the accept/reject buttons */
                    const wrapper = document.createElement('div');
                    wrapper.className = 'ai-suggestion-buttons';
                    wrapper.dataset.suggestionId = s.id;
                    const btnA = document.createElement('button');
                    btnA.textContent = 'Accept';
                    btnA.dataset.action = 'Accept';
                    const btnR = document.createElement('button');
                    btnR.textContent = 'Reject';
                    btnR.dataset.action = 'Reject';

                    wrapper.append(btnA, btnR);

                    /* Create a widget decoration that wraps the buttons */
                    const widget = Decoration.widget(s.to, wrapper, {id: s.id, side: 1});
                    return [inline, widget];
                }) || [];

                /* Return a DecorationSet containing all the decorations */
                return DecorationSet.create(editorState.doc, decorations);
            },
            handleClickOn(view, _pos, _node, _nodePos, event: MouseEvent) {
                const target = event.target as HTMLElement;

                /* If the click is not on a button within the AI suggestion buttons, ignore it */
                if (!(target.tagName === 'BUTTON' && target.closest('.ai-suggestion-buttons')))
                    return false;

                const action = target.dataset.action;
                const id = target.closest<HTMLDivElement>('.ai-suggestion-buttons')?.dataset.suggestionId!;
                const state = aiPluginKey.getState(view.state);
                const suggestion = state?.suggestions.find(s => s.id === id);

                /* If no suggestion is found, ignore the click */
                if (!suggestion) return false;

                if (action === 'Accept') {
                    view.dispatch(view.state.tr.setMeta(aiPluginKey, {remove: {id}}));
                } else if (action === 'Reject') {
                    const tr = view.state.tr.replaceWith(suggestion.from, suggestion.to, suggestion.originalContent.content);
                    tr.setMeta('addToHistory', false).setMeta(aiPluginKey, {remove: {id}});
                    view.dispatch(tr);
                }
                return true;
            }
        }
    }),
    styles: [css]
}) as SchemaPlugin;