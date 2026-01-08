import {z} from "zod";
import {Schema, Node} from "prosemirror-model";
import {
    EditorState,
    EditorStateConfig,
    TextSelection,
} from "prosemirror-state";

export {undo, redo} from "prosemirror-history";

import * as marshal from "../../marshal";
import {Package} from "../..";
import {
    basePlugin,
    configFromSchemaPlugins,
    formPlugin,
    phrasingPlugin,
    listPlugin,
    mathPlugin,
    mediaPlugin,
    modalPlugin,
    stylePlugin,
    svgPlugin,
    tablePlugin,
    textblockPlugin,
    widgetPlugin,
    canvasPlugin,
    deprecatedPlugin,
    headingPlugin,
    sectionPlugin,
    grammarPlugin,
    aiPlugin
} from "./plugins";
import {EditorStateWithHead, headSchema, initialHeadState} from "./head";

export * from "./plugins";
export * from "./htmlelementspec";
export * from "../cssvaluedefinition.data";
export * from "./head";
export * as themes from "./themes";

export function createEditorStateConfig(packages: Package[]) {
    return configFromSchemaPlugins([
        textblockPlugin(),
        headingPlugin(),
        mediaPlugin(),
        listPlugin(),
        sectionPlugin(),
        canvasPlugin(),
        formPlugin(),
        modalPlugin(),
        stylePlugin(),
        mathPlugin(),
        phrasingPlugin(),
        svgPlugin(),
        // deprecatedPlugin(),
        widgetPlugin(packages),
        tablePlugin(),
        basePlugin(),
        grammarPlugin(),
        aiPlugin()
    ]);
}

export const defaultConfig = createEditorStateConfig([]);

export const createEditorState = (
    {
        schema = defaultConfig.schema,
        doc = defaultConfig.doc,
        selection = defaultConfig.selection,
        storedMarks = defaultConfig.storedMarks,
        plugins = defaultConfig.plugins,
        lang = "en",
    }: EditorStateConfig & { lang?: string },
    head?: Node
) => {
    const resolvedDoc = doc;
    let state = EditorState.create({
        selection,
        storedMarks,
        plugins,
        doc: resolvedDoc,
    });
    state = state.apply(state.tr.setSelection(TextSelection.atStart(state.doc)));
    const head$ = EditorState.create({
        schema: headSchema,
        doc: head ?? initialHeadState({lang}).doc,
    });

    return (
        head || lang ? Object.assign(state, {head$}) : state
    ) as EditorStateWithHead;
};

type Format = keyof typeof marshal;

const ResourceSchema = z.object({
    url: z.string().url({message: "Not a valid URL"}),
    editorState: z.instanceof(EditorState).or(
        z
            .object({
                value: z.any(),
                schema: z.instanceof(Schema),
            })
            .transform(async ({value, schema}) => { // @ts-ignore
                for (const parse of Object.values(marshal).map(({parse}) => parse)) {
                    try {
                        return await parse(value, schema);
                    } catch (e) {
                        return z.NEVER;
                    }
                }
                return z.NEVER;
            })
    ),
});

export type Resource = z.infer<typeof ResourceSchema>;
export const Resource = ResourceSchema;
