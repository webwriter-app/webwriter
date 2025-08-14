import {DOMParser} from "prosemirror-model";
import {App, ProsemirrorEditor} from "#view";
import { Node as ProseMirrorNode } from "prosemirror-model";
import { aiPluginKey } from "../../model/schemas/resource/plugins/ai";


export const PROMPT = `
You are the assistant in the application WebWriter. The application WebWriter is a writing tool that allows users to create and edit interactive documents or explorables.  It is your task to help the user with their writing tasks. You can answer questions, provide suggestions, and assist with various writing-related tasks.

In general, you should be helpful, friendly, and professional. You should not provide any personal opinions or engage in discussions that are not related to writing tasks. You should respond in the language of the user, which is determined by the language of the input text. 

The content is given and written in HTML format. Besides the default HTML tags, there are some custom tags that are used to create interactive elements. These tags are custom web components that are registered in the application. You MUST request the documentation for these custom tags before using any of them. Make sure to use the exact name with the correct "@organization/widget" syntax for the request. Make sure to only use them as specified in the documentation and snippets and only use elements standalone if they are meant to be used standalone, indicated by the 'uninsertable' property. You MUST follow the rules on how the custom elements might be used regarding nesting. Towards, the user, refer to them as "widgets". You are not allowed to create any HTML that has capabilities beyond the ones provided by these custom widgets except basic HTML tags like p, h1, h2, span, etc. You can use these basic HTML tags to structure the content, but you should not use any custom attributes or properties that are not supported by the custom widgets. 

Make sure to always insert the content in the location that makes most sense for the content. If there is uncertainty where the user would want the content, you MUST ask the user for clarification in any case. Many types of content do not make sense to be inserted at the bottom of the document, so you SHOULD NOT do that unless the user explicitly asks for it. If you are unsure where to insert the content, ask the user for clarification even in the case

Towards the user, you are not allowed to give any technical details on how the content is created or managed. You are not allowed to share any kind of code with the user directly, only through the functions you are provided with. These functions are used to create and manage the content in the application. Through the use of these functions, you can only suggest changes to the content, not directly manipulate it.

Before doing any generation or manipulation, you must be sure that you understood the user's request correctly and that you have all the necessary information to proceed. If you are unsure, ask the user for clarification. Do not overcomplicate the creation. If it is likely that the user is referring to any content in the document, make sure you know the lastest version of the document before proceeding. When suggesting any changes, give the user a clear and concise explanation of what you are doing and why. 

Always be proactive to help the user with their writing tasks. If you see an opportunity to improve the content or suggest a better way to achieve the user's goal, do so. However, always respect the user's choices and preferences. If you see the opportunity to make relevant suggestions, do so, but always ask for the user's permission before making any changes.

`

const toolDefinitions = [
    {
        "type": "function",
        "function": {
            "name": "insert_at_bottom",
            "description": "Insert some html at the bottom of the document",
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "The html to insert at the bottom of the document"
                    },
                },
                "required": ["content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_document",
            "description": "Read the current document content",
            "parameters": {}
        }
    },
    {
        type: "function",
        function: {
            name: "replace_in_document",
            description: "Replace part of the document with new content based on a CSS selector",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The CSS selector for the element of the document to be replaced with the new content. If the query matches multiple elements, the first one will be replaced."
                    },
                    newContent: {
                        type: "string",
                        description: "The new HTML content to replace the matched element with. This should be a valid HTML string."
                    },
                },
                required: ["query", "newContent"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "fetch_widget_documentation",
            description: "Fetch the documentation for a specific widget",
            parameters: {
                type: "object",
                properties: {
                    widget_name: {
                        type: "string",
                        description: "The name of the widget to request documentation for"
                    },
                },
                required: ["widget_name"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "insert_into_element",
            description: "Insert some HTML at the end of the innerHTML of a selected element in the document. This is useful for adding content to specific parts of the document without relying on a replace operation. ",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The CSS selector for the element of the document to insert the content into. If the query matches multiple elements, the first one will be used."
                    },
                    content: {
                        "type": "string",
                        "description": "The HTML to insert into the selected element, which MUST be a VALID HTML string. DO NOT USE HTML THAT IS NOT VALID BY ITSELF. This content will be appended to the end of the innerHTML of the selected element. ",
                    },
                },
                required: ["query", "content"]
            }
        }
    }

];

export const toolFriendlyNames = {
    "insert_at_bottom": "Inhalt hinzufügen...",
    "read_document": "Dokument lesen...",
    "fetch_widget_documentation": "Widget-Dokumentation lesen...",
    "replace_in_document": "Inhalt ersetzen...",
    "insert_into_element": "Inhalt einfügen..."
}

/**
 * Ersetzt einen Inhaltsbereich durch einen AI-Vorschlag und hebt ihn hervor.
 *
 * @param view Die Editor-Ansicht (Wrapper).
 * @param from Startposition.
 * @param to Endposition.
 * @param newContent Knoten, die als Vorschlag eingefügt werden.
 */
export function suggestChange(view: ProsemirrorEditor | any, from: number, to: number, newContent: ProseMirrorNode | ProseMirrorNode[]) {
   const state = (view as any).state;

    // Ursprünglichen Inhalt speichern (auch wenn from==to, ergibt ein leeres Slice)
    const originalContent = state.doc.slice(from, to);

    // Inhalt ersetzen/einfügen
    let tr = state.tr.replaceWith(from, to, newContent);

    // Neue Endposition berechnen
    const newContentSize = Array.isArray(newContent)
        ? newContent.reduce((size, node) => size + node.nodeSize, 0)
        : newContent.nodeSize;
    const newTo = from + newContentSize;

    // Metadaten für AI-Plugin
    tr = tr.setMeta(aiPluginKey, {
        add: {
            from,
            to: newTo,
            originalContent
        }
    });
    tr = tr.setMeta('addToHistory', false);

    (view as any).dispatch(tr);
}

export function generateListOfModules(app: App) {
    return app.store.packages.installed.map(p => p.name + ": " + p.description).join("\n");
}

export async function generateWidgetDocumentation(app: App, name: string): Promise<string> {
    const pkg = app.store.packages.installed.find(p => p.name === name);

    if (!pkg) {
        // Return a JSON string indicating that the widget was not found.
        return JSON.stringify({error: `Widget with name ${name} not found.`});
    }

    const snippetPaths = Object.keys(pkg.exports)
        .filter(key => key.includes("snippets"))
        .map(key => `https://cdn.jsdelivr.net/npm/${pkg.name}/${pkg.exports[key]}`);

    // Fetch the README file from the package's CDN path
    const readmePath = `https://cdn.jsdelivr.net/npm/${pkg.name}/README.md`;
    let readmeContent = "";
    try {
        const readmeResponse = await fetch(readmePath);
        if (!readmeResponse.ok) {
            throw new Error(`Failed to fetch README from ${readmePath}`);
        }
        readmeContent = await readmeResponse.text();
    } catch (error) {
        console.error(`Error fetching README from ${readmePath}:`, error);
        readmeContent = "No README available for this widget.";
    }

    const snippets = await Promise.all(snippetPaths.map(async (snippetPath) => {
        try {
            const response = await fetch(snippetPath);
            if (!response.ok) {
                throw new Error(`Failed to fetch snippet from ${snippetPath}`);
            }
            return await response.text();
        } catch (error) {
            console.error(`Error fetching snippet from ${snippetPath}:`, error);
            return null; // Return null if the snippet cannot be fetched
        }
    }));

    const documentation = {
        name: pkg.name,
        author: pkg.author,
        description: pkg.description,
        editingConfig: pkg.editingConfig,
        exampleSnippets: snippets.filter(snippet => snippet !== null), // Filter out any null snippets
        readme: readmeContent,
    };

    return JSON.stringify(documentation, null, 2);
}

export class AIStore {

    chatMessages: {
        role: 'user' | 'assistant' | 'system' | 'tool';
        content: string;
        timestamp: Date,
        isUpdate: boolean,
        tool_calls?: any | null
    }[] = [];

    /* The toolResolvers are functions that are called when a tool is requested by the AI, corresponding to the functions defined for the AI above */
    toolResolvers = {
        insert_at_bottom: (app: App, {content}: { content: string }) => {
            const editor = app.activeEditor?.pmEditor as ProsemirrorEditor | undefined;
            if (!editor) {
                return { success: false, message: 'No active editor available.' };
            }
            const endPos = (editor as any).state.doc.content.size;

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = content;

            const parser = DOMParser.fromSchema((editor as any).state.schema);
            const slice = parser.parseSlice(tempDiv);
            const nodes: ProseMirrorNode[] = [];
            for (let i = 0; i < slice.content.childCount; i++) {
                nodes.push(slice.content.child(i)!);
            }
            if (nodes.length === 0) {
                return { success: false, message: 'No valid content to insert.' };
            }

            // Vorschlag am Dokumentende (from==to==endPos)
            suggestChange(editor, endPos, endPos, nodes);

            return {
                success: true,
                message: `HTML content has been suggested at the bottom of the document.`,
            };
        },
        read_document: (app: App) => {
            const editor = app.activeEditor?.pmEditor as ProsemirrorEditor | undefined;
            if (!editor) {
                return { success: false, message: 'No active editor available.' };
            }

            const htmlContent = (editor as any).dom.innerHTML;

            return {
                success: true,
                content: htmlContent,
            };
        },
        fetch_widget_documentation: async (app: App, {widget_name}: { widget_name: string }) => {
            return {
                success: true,
                content: await generateWidgetDocumentation(app, widget_name),
            }
        },
        replace_in_document: (app: App, {query, newContent}: { query: string, newContent: string }) => {
            const editor = app.activeEditor?.pmEditor as ProsemirrorEditor | undefined;
            if (!editor) {
                return { success: false, message: 'No active editor available.' };
            }

            const elementToReplace = (editor as any).dom.querySelector(query) as Element | null;
            if (!elementToReplace) {
                return {success: false, message: `No element found matching query: ${query}`};
            }

            function findNodeAndPosFromDOM(view: ProsemirrorEditor, domNode: Node): { node: any, startPos: number } | null {
                // Normalisiere Textknoten auf deren Elternelement
                if (domNode.nodeType === Node.TEXT_NODE && domNode.parentNode) {
                    domNode = domNode.parentNode;
                }

                // 1) Primär: Position ermitteln und nach oben laufen
                let innerPos: number | null = null;
                try {
                    innerPos = (view as any).posAtDOM(domNode, 0, -1);
                } catch {}

                if (innerPos != null) {
                    const $pos = (view as any).state.doc.resolve(innerPos);
                    for (let depth = $pos.depth; depth >= 1; depth--) {
                        const startPos = $pos.before(depth);
                        const dom = (view as any).nodeDOM(startPos) as Node | null;
                        if (dom && (dom === domNode || dom.contains(domNode) || domNode.contains(dom))) {
                            const node = $pos.node(depth);
                            return { node, startPos };
                        }
                    }
                }

                // 2) Fallback: Position VOR domNode bestimmen
                const parent = domNode.parentNode;
                if (!parent) return null;
                const index = Array.prototype.indexOf.call(parent.childNodes, domNode);
                if (index < 0) return null;

                let posBefore: number;
                try {
                    posBefore = (view as any).posAtDOM(parent, index, -1);
                } catch {
                    return null;
                }
                const $before = (view as any).state.doc.resolve(posBefore);
                const nodeAfter = $before.nodeAfter as any;
                if (nodeAfter) {
                    return { node: nodeAfter, startPos: posBefore };
                }

                return null;
            }

            // Sicheres Extrahieren von Node und Startposition
            const found = findNodeAndPosFromDOM(editor, elementToReplace);
            if (!found) {
                return {success: false, message: "Could not find corresponding PM node for DOM element."};
            }

            const {node, startPos} = found;
            const endPos = startPos + node.nodeSize;

            // Slice vorbereiten und als Vorschlag einfügen
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = newContent;
            const parser = DOMParser.fromSchema((editor as any).state.schema);
            const slice = parser.parseSlice(tempDiv);

            const nodes: ProseMirrorNode[] = [];
            for (let i = 0; i < slice.content.childCount; i++) {
                nodes.push(slice.content.child(i)!);
            }

            suggestChange(editor, startPos, endPos, nodes);

            return {
                success: true,
                message: `Element matching query "${query}" has been replaced with new content.`,
            };
        },
        insert_into_element: (app: App, {query, content}: { query: string, content: string }) => {
            const editor = app.activeEditor?.pmEditor as ProsemirrorEditor | undefined;
            if (!editor) {
                return { success: false, message: 'No active editor available.' };
            }

            const elementToInsertInto = (editor as any).dom.querySelector(query) as Element | null;
            if (!elementToInsertInto) {
                return {
                    success: false,
                    message: `No element found matching the query: ${query}`,
                };
            }

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = content;

            const parser = DOMParser.fromSchema((editor as any).state.schema);
            const slice = parser.parseSlice(tempDiv);

            const nodes: ProseMirrorNode[] = [];
            for (let i = 0; i < slice.content.childCount; i++) {
                nodes.push(slice.content.child(i)!);
            }

            const pos = (editor as any).posAtDOM(elementToInsertInto, elementToInsertInto.childNodes.length);
            suggestChange(editor, pos, pos, nodes);

            return {
                success: true,
                message: `Content suggestion has been created for the selected element.`,
            };
        }
    }

    addMessage({role, content, isUpdate = false, timestamp, tool_calls = null}: {
        role: 'user' | 'assistant' | 'system' | 'tool';
        content: string;
        timestamp: Date;
        isUpdate: boolean;
        tool_calls?: any | null
    }) {
        this.chatMessages.push({role, content, isUpdate, timestamp, tool_calls});
    }

    async generateResponse(updateCallback: () => void, app: App): Promise<string | undefined> {

        // Remove all previous updates from the chat messages
        this.chatMessages = this.chatMessages.filter(msg => !msg.isUpdate);

        // Add the system message with the prompt
        this.addMessage({
            role: "system",
            content: PROMPT,
            timestamp: new Date(),
            isUpdate: true
        });

        // Aktuellen Dokumentzustand hinzufügen (robust bei fehlendem Editor)
        const editorDom = app.activeEditor?.pmEditor?.dom as HTMLElement | undefined;
        const currentHtml = editorDom ? editorDom.innerHTML : "";
        this.addMessage({
            role: "system",
            content: `Current document content:\n\n${currentHtml}\n\nAvailable modules:\n\n${generateListOfModules(app)}`,
            timestamp: new Date(),
            isUpdate: true,
        });

        let isResponseToHuman = false;

        while (!isResponseToHuman) {

            const authKey = localStorage["webwriter_authKey"]

            /* request from openai api */
            const response = await fetch("http://localhost:8090/api/chat", {
                method: "POST",
                headers: {"Content-Type": "application/json", "Authorization": authKey},
                body: JSON.stringify({
                    messages: this.chatMessages,
                    tools: toolDefinitions,
                    tool_choice: "auto",
                    max_tokens: 32768,
                }),
            });

            const data = await response.json();

            if (!response.ok || !data?.success) {
                throw new Error(`Error generating response: ${data?.error || 'Unknown error'}`);
            }

            const lastMessage = data?.lastMessage

            // Add the newly generated message to the array
            this.addMessage({
                ...lastMessage, timestamp: new Date(),
            });

            console.log(lastMessage, this.chatMessages)

            updateCallback();

            // check if the response is a tool call
            if (lastMessage["tool_calls"]?.length > 0) {
                const toolCalls = lastMessage["tool_calls"] as any[];

                const resolvedToolCalls = await Promise.all(toolCalls.map(async (toolCall: any) => {
                    const callFunction = toolCall.function.name as string;
                    const callArguments = JSON.parse(toolCall.function.arguments || '{}');

                    let result: any = {};

                    try {
                        const fn = (this.toolResolvers as any)[callFunction];
                        if (typeof fn !== 'function') {
                            result = { success: false, message: `Unknown tool: ${callFunction}` };
                        } else {
                            result = {
                                ...(await fn.apply(this, [app, callArguments])) || {},
                                success: true,
                            };
                        }
                    } catch (e) {
                        const err: any = e;
                        console.error(`Error resolving tool call ${callFunction}:`, e);
                        result = {
                            success: false,
                            message: `Error resolving tool call ${callFunction}: ${err?.message ?? String(e)}`,
                        };
                    }

                    return {
                        role: "tool",
                        "tool_call_id": toolCall.id,
                        content: JSON.stringify(result),
                        timestamp: new Date(),
                    }
                }))

                // ToDo: what about the additional attributes not in type definition?
                this.chatMessages = this.chatMessages.concat(resolvedToolCalls);
            } else {

                /* we have a response without tool requests */
                isResponseToHuman = true;

                updateCallback();

                return this.chatMessages.at(-1)?.content;
            }
        }

        // if we get here, there must have been a mistake
        throw new Error("Unable to generate message")
    }

    clearMessages() {
        this.chatMessages = [];
    }
}
