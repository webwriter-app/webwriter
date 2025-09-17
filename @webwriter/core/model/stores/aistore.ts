import {DOMParser} from "prosemirror-model";
import {App, ProsemirrorEditor} from "#view";
import {Node as ProseMirrorNode} from "prosemirror-model";
import {aiPluginKey} from "../../model/schemas/resource/plugins/ai";
import {renderToString as latexToMathML} from "temml/dist/temml.cjs"
import {msg} from "@lit/localize";

class UnauthorizedError extends Error {
    status: number;

    constructor(message = "Unauthorized", status = 401) {
        super(message);
        this.name = "UnauthorizedError";
        this.status = status;
        Object.setPrototypeOf(this, UnauthorizedError.prototype);
    }
}

export const PROMPT = `
You are the assistant in the application WebWriter. The application WebWriter is a writing tool that allows users to create and edit interactive documents or explorables.  It is your task to help the user with their writing tasks. You can answer questions, provide suggestions, and assist with various writing-related tasks.

In general, you should be helpful, friendly, and professional. You should not provide any personal opinions or engage in discussions that are not related to writing tasks. You should respond in the language of the user, which is determined by the language of the input text. 

The content is given and written in HTML format. Besides the default HTML tags, there are some custom tags that are used to create interactive elements. These tags are custom web components that are registered in the application, you MAY NOT load or request them in any way. You MUST request the documentation for these custom tags before using any of them. Make sure to use the exact name with the correct "@organization/widget" syntax for the request. Make sure to only use them as specified in the documentation and snippets and only use elements standalone if they are meant to be used standalone, indicated by the 'uninsertable' property. You MUST follow the rules on how the custom elements might be used regarding nesting. Towards, the user, refer to them as "widgets". You are not allowed to create any HTML that has capabilities beyond the ones provided by these custom widgets except basic HTML tags like p, h1, h2, span, etc. Additionally, you MUST use only MathML to display any kind of mathematical formulas. If the mathematical expressions / formulars are complex, use the Latex to MathML function to reduce the likelihood of an error. For bold formatting, use the b tag, do not use the strong tag. You can use these basic HTML tags to structure the content. You may not use any custom attributes or properties that are not supported by the custom widgets. You cannot install widgets, but you can suggest that the user install them, and then they will be available for you as well. 

Make sure to always insert the content in the location that makes most sense for the content. If there is uncertainty where the user would want the content, you MUST ask the user for clarification in any case. Many types of content do not make sense to be inserted at the bottom of the document, so you SHOULD NOT do that unless the user explicitly asks for it. If you are unsure where to insert the content, ask the user for clarification. If the document is empty, insert the content at the bottom of the document. 

Towards the user, you are not allowed to give any technical details on how the content is created or managed. You are not allowed to share any kind of code with the user directly, only through the functions you are provided with. These functions are used to create and manage the content in the application. Through the use of these functions, you can only suggest changes to the content, not directly manipulate it.

Before doing any generation or manipulation, you must be sure that you understood the user's request correctly and that you have all the necessary information to proceed. If you are unsure, ask the user for clarification. Do not overcomplicate the creation. If it is likely that the user is referring to any content in the document, make sure you know the lastest version of the document before proceeding. When suggesting any changes, give the user a clear and concise explanation of what you are doing and why. 

Always be proactive to help the user with their writing tasks. If you see an opportunity to improve the content or suggest a better way to achieve the user's goal, do so. However, always respect the user's choices and preferences. If you see the opportunity to make relevant suggestions, do so, but always ask for the user's permission before making any changes. Respond with at most a few sentences, keep your responses concise and to the point. 

If the user's request is large or complex, break it down into smaller steps and ask the user for confirmation before proceeding with each step. This will help you to ensure that you are on the right track and that the user is satisfied with the results.

If the request of the user is not writing related, politely inform the user that you are not able to help with that and suggest them to ask a human or another AI for help.

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
        type: "function",
        function: {
            name: "replace_in_document",
            description: "Replace part of the document with new content based on a CSS selector",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The CSS selector for the element of the document to be replaced with the new content. If the query matches multiple elements, the first one will be replaced. Only elements within the document body are considered. The query should be a valid CSS selector that matches an element in the document."
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
            name: "get_list_of_installable_widgets",
            description: "Get a list of all installable widgets with their name and description. This is useful for suggesting widgets to the user that they might want to install.  ",
            parameters: {
                type: "object",
                properties: {},
                required: []
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
    },
    {
        type: "function",
        function: {
            name: "latex_to_mathml",
            description: "Convert LaTeX math to MathML. You must use this function if you want to insert any more complex math than simple symbols or numbers. You must use MathML for any kind of mathematical formulas. ",
            parameters: {
                type: "object",
                properties: {
                    latex: {
                        type: "string",
                        description: "The LaTeX math string to convert to MathML. This should be a valid LaTeX math string."
                    },
                },
                required: ["latex"]
            }

        }
    }

];

export const toolFriendlyNames = {
    "insert_at_bottom": msg("Insert content..."),
    "fetch_widget_documentation": msg("Read widget documentation..."),
    "replace_in_document": msg("Replace content..."),
    "insert_into_element": msg("Insert into element..."),
    "get_list_of_installable_widgets": msg("Get list of installable widgets..."),
    "latex_to_mathml": msg("Prepare math formula...")
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
        // If the package is not found, return an error message
        return JSON.stringify({error: `Widget with name ${name} not installed.`});
    }

    const installedWidgetUrl = app.store.packages.packetApiBaseUrl(pkg);


    // Fetch the README file from the package's CDN path
    const readmePath = `${installedWidgetUrl}/README.md`;
    let readmeContent = "";
    try {
        const readmeResponse = await fetch(readmePath);
        if (!readmeResponse.ok) {
            throw new Error(`Failed to fetch README from ${readmePath}`);
        }
        readmeContent = await readmeResponse.text();
        readmeContent = readmeContent.replace(/## Snippets[\s\S]*## Fields/gmi, "## Fields");

    } catch (error) {
        console.error(`Error fetching README from ${readmePath}:`, error);
        readmeContent = "No README available for this widget.";
    }

    const customElements = [];
    try {
        const customElementsRequest = await fetch(`${installedWidgetUrl}/custom-elements.json`);
        if (!customElementsRequest.ok) {
            throw new Error(`Failed to fetch custom-elements.json from ${installedWidgetUrl}/custom-elements.json`);
        }
        const customElementsData = await customElementsRequest.json();
        // Transform the raw declarations into a simplified object structure containing only
        // the information needed to use the elements (safe access to optional fields).
        const simplified = (customElementsData.modules || [])
            .flatMap((m: any) => m.declarations || [])
            .map((decl: any) => {
                const attributes = (decl.attributes || []).map((a: any) => ({
                    name: a.name || null,
                    type: (a.type && (a.type.text || a.type.name)) || null,
                    description: a.description || null,
                    default: a.default || null,
                }));

                const slots = (decl.slots || []).map((s: any) => ({
                    name: s.name || 'default',
                    description: s.description || null,
                }));

                const events = (decl.events || []).map((e: any) => ({
                    name: e.name || null,
                    description: e.description || null,
                    type: (e.type && (e.type.text || e.type.name)) || null,
                }));

                return {
                    tagName: decl.tagName || decl.name || null,
                    name: decl.name || null,
                    description: decl.description || null,
                    summary: decl.summary || null,
                    deprecated: decl.deprecated || false,
                    attributes,
                    slots,
                    events,
                    source: decl.source || null,
                };
            });

        customElements.push(...simplified);
    } catch (e) {
        console.error(`Error fetching custom-elements.json from ${installedWidgetUrl}/custom-elements.json`, e);
    }

    const snippetPaths = Object.keys(pkg.exports)
        .filter(key => key.includes("snippets"))
        .map(key => `${installedWidgetUrl}/${pkg.exports[key]}`);

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
        /* editingConfig: pkg.editingConfig, */
        exampleSnippets: snippets.filter(snippet => snippet !== null), // Filter out any null snippets
        /* readme: readmeContent, */
        customElements
    };

    console.log(documentation)

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

    // Abort controller for the current in-flight request (if any)
    private currentAbortController: AbortController | null = null;

    // When starting a generation we save a snapshot of messages so we can
    // restore them if the request is cancelled or if the user retries.
    private _snapshotForRetry: typeof this.chatMessages | null = null;

    // Internal flag to indicate cancellation requested
    private _cancelled: boolean = false;

    /* The toolResolvers are functions that are called when a tool is requested by the AI, corresponding to the functions defined for the AI above */
    toolResolvers = {
        insert_at_bottom: (app: App, {content}: { content: string }) => {
            const editor = app.activeEditor?.pmEditor as ProsemirrorEditor | undefined;
            if (!editor) {
                return {success: false, message: 'No active editor available.'};
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
                return {success: false, message: 'No valid content to insert.'};
            }

            // Vorschlag am Dokumentende (from==to==endPos)
            suggestChange(editor, endPos, endPos, nodes);

            return {
                success: true,
                message: `HTML content has been suggested at the bottom of the document.`,
            };
        },
        get_list_of_installable_widgets: (app: App) => {
            return {
                success: true,
                content: app.store.packages.available.map(p => ({name: p.name, description: p.description})),
            }
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
                return {success: false, message: 'No active editor available.'};
            }

            const elementToReplace = (editor as any).dom.querySelector(query) as Element | null;
            if (!elementToReplace) {
                return {success: false, message: `No element found matching query: ${query}`};
            }

            function findNodeAndPosFromDOM(view: ProsemirrorEditor, domNode: Node): {
                node: any,
                startPos: number
            } | null {
                // Normalisiere Textknoten auf deren Elternelement
                if (domNode.nodeType === Node.TEXT_NODE && domNode.parentNode) {
                    domNode = domNode.parentNode;
                }

                // 1) Primär: Position ermitteln und nach oben laufen
                let innerPos: number | null = null;
                try {
                    innerPos = (view as any).posAtDOM(domNode, 0, -1);
                } catch {
                }

                if (innerPos != null) {
                    const $pos = (view as any).state.doc.resolve(innerPos);
                    for (let depth = $pos.depth; depth >= 1; depth--) {
                        const startPos = $pos.before(depth);
                        const dom = (view as any).nodeDOM(startPos) as Node | null;
                        if (dom && (dom === domNode || dom.contains(domNode) || domNode.contains(dom))) {
                            const node = $pos.node(depth);
                            return {node, startPos};
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
                    return {node: nodeAfter, startPos: posBefore};
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
                return {success: false, message: 'No active editor available.'};
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
        },
        latex_to_mathml: (app: App, {latex}: { latex: string }) => {
            if (!latex || latex.trim() === "") {
                return {success: false, message: "Empty LaTeX string provided."};
            }

            const mathml = latexToMathML(latex);
            return {
                success: true,
                content: mathml,
                message: "LaTeX has been converted to MathML.",
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

    loading: boolean = false;

    /**
     * Cancel the current in-progress request, if any. Restores the chatMessages
     * to the state before the request started and prevents any incoming
     * responses from being appended.
     */
    cancelRequest(updateCallback?: () => void) {
        this._cancelled = true;
        try {
            this.currentAbortController?.abort();
        } catch (e) {
            // ignore
        }

        // Restore snapshot if available (remove any messages added during the request)
        if (this._snapshotForRetry) {
            this.chatMessages = this._snapshotForRetry.slice();
            this._snapshotForRetry = null;
        }

        this.loading = false;
        if (updateCallback) updateCallback();
    }

    /**
     * Retry the last request that failed or was cancelled. Returns the promise
     * from generateResponse or undefined if there's nothing to retry.
     */
    retryLastRequest(updateCallback: () => void, app: App): Promise<string | undefined> | undefined {
        if (!this._snapshotForRetry) return undefined;
        // Restore messages to snapshot and start generation again
        this.chatMessages = this._snapshotForRetry.slice();
        // Clear the snapshot now; generateResponse will set it again at start
        this._snapshotForRetry = null;
        return this.generateResponse(updateCallback, app);
    }

    // Public getter used by the UI to determine whether retry is available
    get canRetry(): boolean {
        return !!this._snapshotForRetry;
    }

    async generateResponse(updateCallback: () => void, app: App): Promise<string | undefined> {
        this.loading = true;
        updateCallback();
        try {

            // Save a snapshot of the chat prior to starting the request so we
            // can restore it if the user cancels or if a retry is requested.
            this._snapshotForRetry = this.chatMessages.slice();

            // Reset cancellation state and prepare an AbortController for the fetch
            this._cancelled = false;
            this.currentAbortController = new AbortController();

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

            // Remove any attributes that are too long from the HTML to avoid excessive length
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = currentHtml;
            tempDiv.querySelectorAll('*').forEach(el => {
                Array.from(el.attributes).forEach(attr => {
                    if (attr.value.length > 1000) {
                        el.removeAttribute(attr.name);
                    }
                });
            });

            this.addMessage({
                role: "system",
                content: (currentHtml ? `Current document content:\n\n${tempDiv.innerHTML}` : 'Document empty') + `\n\nList of installed widgets:\n\n${generateListOfModules(app)}`,
                timestamp: new Date(),
                isUpdate: true,
            });

            let isResponseToHuman = false;

            while (!isResponseToHuman) {

                // If the request has been cancelled before starting fetch, abort
                if (this._cancelled) {
                    // restore snapshot
                    if (this._snapshotForRetry) this.chatMessages = this._snapshotForRetry.slice();
                    return undefined;
                }

                const authKey = localStorage.getItem("webwriter_authKey");

                const response = await fetch("https://node1.webwriter.elearn.rwth-aachen.de/api/chat", {
                    method: "POST",
                    headers: {"Content-Type": "application/json", "Authorization": authKey},
                    signal: this.currentAbortController?.signal,
                    body: JSON.stringify({
                        messages: this.chatMessages,
                        tools: toolDefinitions,
                        tool_choice: "auto",
                        model: "o4-mini",
                        max_completion_tokens: 32768,
                    }),
                });

                // If cancellation happened while the response was in flight, discard
                if (this._cancelled) {
                    if (this._snapshotForRetry) this.chatMessages = this._snapshotForRetry.slice();
                    return undefined;
                }

                const data = await response.json();

                if (!response.ok || !data?.success) {
                    if (response.status === 401) {
                        throw new UnauthorizedError();
                    }
                    throw new Error(data?.error || `API request failed with status ${response.status}`);
                }

                const lastMessage = data?.lastMessage

                // Add the newly generated message to the array
                this.addMessage({
                    ...lastMessage, timestamp: new Date(),
                });

                console.log(this.chatMessages)

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
                                result = {success: false, message: `Unknown tool: ${callFunction}`};
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
                            isUpdate: false,
                            tool_calls: null,
                        }
                    }))

                    // If the request was cancelled while resolving tool calls,
                    // discard the resolved results and restore snapshot.
                    if (this._cancelled) {
                        if (this._snapshotForRetry) this.chatMessages = this._snapshotForRetry.slice();
                        return undefined;
                    }

                    // ToDo: what about the additional attributes not in type definition?
                    this.chatMessages = this.chatMessages.concat(resolvedToolCalls);
                } else {

                    /* we have a response without tool requests */
                    isResponseToHuman = true;

                    updateCallback();

                    // Clear the snapshot on successful completion so retry cannot
                    // accidentally re-run the same request state.
                    this._snapshotForRetry = null;
                    this.currentAbortController = null;

                    return this.chatMessages.at(-1)?.content;
                }
            }

            // if we get here, there must have been a mistake
            throw new Error("Unable to generate message")
        } catch (e: any) {
            // If the fetch was aborted, treat as cancellation and silently restore
            if (e && (e.name === 'AbortError' || e.message?.includes('aborted'))) {
                // already restored snapshot in cancellation branches above
                console.error('AI request was aborted');
            } else if (e instanceof UnauthorizedError)
                console.error("Not authorized to use the AI service");
            else
                console.error("Error generating AI response", e);
        } finally {
            this.loading = false;
            this.currentAbortController = null;
            updateCallback();
        }
    }

    clearMessages() {
        this.chatMessages = [];
    }
}
