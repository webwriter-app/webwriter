import {DOMParser} from "prosemirror-model";
import {App} from "#view";

export const INTERMEDIATE_PROMPT = `
You are the assistant in the application WebWriter. The application WebWriter is a writing tool that allows users to create and edit interactive documents or explorables.  It is your task to help the user with their writing tasks. You can answer questions, provide suggestions, and assist with various writing-related tasks.

In general, you should be helpful, friendly, and professional. You should not provide any personal opinions or engage in discussions that are not related to writing tasks. You should respond in the language of the user, which is determined by the language of the input text. 

The content is given and written in HTML format. Besides the default HTML tags, there are some custom tags that are used to create interactive elements. These tags are custom web components that are registered in the application. You MUST request the documentation for these custom tags before using any of them. Make sure to only use them as specified in the documentation and snippets and follow the editingConfig details on how the elements should be used. Towards, the user, refer to them as "widgets". You are not allowed to create any HTML that has capabilities beyond the ones provided by these custom widgets except basic HTML tags like p, h1, h2, span, etc. You can use these basic HTML tags to structure the content, but you should not use any custom attributes or properties that are not supported by the custom widgets.

List of avialable widgets: "@webwriter/quiz"

Towards the user, you are not allowed to give any technical details on how the content is created or managed. You are not allowed to share any kind of code with the user directly, only through the functions you are provided with. These functions are used to create and manage the content in the application. Through the use of these functions, you can only suggest changes to the content, not directly manipulate it.

Before doing any generation or manipulation, you must be sure that you understood the user's request correctly and that you have all the necessary information to proceed. If you are unsure, ask the user for clarification. If it is likely that the user is referring to any content in the document, make sure you know the lastest version of the document before proceeding. When suggesting any changes, give the user a clear and concise explanation of what you are doing and why. 

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
        "type": "function",
        "function": {
            "name": "fetch_widget_documentation",
            "description": "Fetch the documentation for a specific widget",
            "parameters": {
                "type": "object",
                "properties": {
                    "widget_name": {
                        "type": "string",
                        "description": "The name of the widget to request documentation for"
                    },
                },
                "required": ["widget_name"]
            }
        }
    }

];

export const toolFriendlyNames = {
    "insert_at_bottom": "Text hinzufügen...",
    "read_document": "Dokument lesen...",
    "fetch_widget_documentation": "Widget-Dokumentation generieren...",
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
    };

    return JSON.stringify(documentation, null, 2);
}

export class AIStore {

    chatMessages: { role: 'user' | 'assistant' | 'system' | 'tool'; content: string; timestamp: Date }[] = [{
        role: "system",
        content: INTERMEDIATE_PROMPT,
        timestamp: new Date(),
    }];

    /* The toolResolvers are functions that are called when a tool is requested by the AI, corresponding to the functions defined for the AI above */
    toolResolvers = {
        insert_at_bottom: (app: App, {content}: { content: string }) => {
            const view = app.activeEditor.pmEditor;
            const {state} = view;
            const endPos = state.doc.content.size;

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = content;

            // might break if the content schema does not match, https://prosemirror.net/docs/ref/#model.DOMParser.parseSlice
            const parser = DOMParser.fromSchema(state.schema);
            const contentNode = parser.parse(tempDiv);

            if (!contentNode) return;

            const tr = state.tr.insert(endPos, contentNode.content);
            view.dispatch(tr);
            return {
                success: true,
                message: `HTML content has been inserted at the bottom of the document.`,
            };
        },
        read_document: (app: App) => {
            const view = app.activeEditor.pmEditor;
            const {state} = view;

            // Convert the ProseMirror document to HTML
            const htmlContent = view.dom.innerHTML;

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
        }
    }


    addMessage(message: { role: 'user' | 'assistant' | 'system' | 'tool'; content: string; timestamp: Date }) {
        this.chatMessages.push(message);
    }

    async generateResponse(updateCallback: () => void, app): Promise<string | undefined> {

        let isResponseToHuman = false;

        while (!isResponseToHuman) {

            /* request from openai api */
            const response = await fetch("http://localhost:8090/api/chat", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    messages: this.chatMessages,
                    tools: toolDefinitions,
                    tool_choice: "auto"
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

            updateCallback();

            // check if the response is a tool call
            if (lastMessage["tool_calls"]?.length > 0) {
                const toolCalls = lastMessage["tool_calls"];

                const resolvedToolCalls = await Promise.all(toolCalls.map(async toolCall => {
                    const callFunction = toolCall.function.name
                    const callArguments = JSON.parse(toolCall.function.arguments);

                    let result = {};

                    try {
                        result = {
                            ...(await this.toolResolvers[callFunction].apply(this, [app, callArguments])) || {},
                            success: true,
                        };

                    } catch (e) {
                        console.error(`Error resolving tool call ${callFunction}:`, e);
                        result = {
                            success: false,
                            message: `Error resolving tool call ${callFunction}: ${e.message}`,
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
