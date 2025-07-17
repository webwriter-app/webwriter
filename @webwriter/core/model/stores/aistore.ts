export const INTERMEDIATE_PROMPT = `
You are the assistant in the application WebWriter. The application WebWriter is a writing tool that allows users to create and edit interactive documents or explorables.  It is your task to help the user with their writing tasks. You can answer questions, provide suggestions, and assist with various writing-related tasks.

In general, you should be helpful, friendly, and professional. You should not provide any personal opinions or engage in discussions that are not related to writing tasks. You should respond in the language of the user, which is determined by the language of the input text. 

The content is given and written in HTML format. Besides the default HTML tags, there are some custom tags that are used to create interactive elements. These tags are custom web components that are registered in the application. You MUST request the documentation for these custom tags before using any of them. Towards, the user, refer to them as "widgets". You are not allowed to create any HTML that has capabilities beyond the ones provided by these custom widgets except basic HTML tags like p, h1, h2, span, etc. You can use these basic HTML tags to structure the content, but you should not use any custom attributes or properties that are not supported by the custom widgets.

[LIST OF CUSTOM WIDGETS]

Towards the user, you are not allowed to give any technical details on how the content is created or managed. You are not allowed to share any kind of code with the user directly, only through the functions you are provided with. These functions are used to create and manage the content in the application. Through the use of these functions, you can only suggest changes to the content, not directly manipulate it.

[LIST OF FUNCTIONS]

Before doing any generation or manipulation, you must be sure that you understood the user's request correctly and that you have all the necessary information to proceed. If you are unsure, ask the user for clarification. If it is likely that the user is referring to any content in the document, make sure you know the lastest version of the document before proceeding. When suggesting any changes, give the user a clear and concise explanation of what you are doing and why. 

Always be proactive to help the user with their writing tasks. If you see an opportunity to improve the content or suggest a better way to achieve the user's goal, do so. However, always respect the user's choices and preferences. If you see the opportunity to make relevant suggestions, do so, but always ask for the user's permission before making any changes.

`

const toolDefinitions = [
    {
        "type": "function",
        "function": {
            "name": "get_current_weather",
            "description": "Get the weather in a given location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The city and state, e.g., San Francisco, CA"
                    },
                    "unit": {
                        "type": "string",
                        "enum": ["celsius", "fahrenheit"]
                    }
                },
                "required": ["location"]
            }
        }
    }
];

export const toolFriendlyNames = {
    "get_current_weather": "Wetter abfragen..."
}

export class AIStore {

    chatMessages: { role: 'user' | 'assistant' | 'system' | 'tool'; content: string; timestamp: Date }[] = [{
        role: "system",
        content: INTERMEDIATE_PROMPT,
        timestamp: new Date(),
    }];


    toolResolvers = {
        get_current_weather: () => "The weather is cloudy with a temperature between 10 and 20 degrees Celsius",
    }


    addMessage(message: { role: 'user' | 'assistant' | 'system' | 'tool'; content: string; timestamp: Date }) {
        this.chatMessages.push(message);
    }

    async generateResponse(updateCallback: () => void): Promise<string | undefined> {

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

                const resolvedToolCalls = toolCalls.map(toolCall => {
                    const callFunction = toolCall.function.name
                    const callArguments = JSON.parse(toolCall.function.arguments);

                    const result = this.toolResolvers[callFunction].apply(this, [callArguments]);

                    return {
                        role: "tool",
                        "tool_call_id": toolCall.id,
                        content: JSON.stringify(result),
                        timestamp: new Date(),
                    }
                })

                // ToDo: what about the additional attributes not in type definition?
                this.chatMessages = this.chatMessages.concat(resolvedToolCalls);
            } else {

                /* we have a response without tool requests */
                isResponseToHuman = true;

                updateCallback();

                return this.chatMessages.at(-1)?.content;
            }
        }

        // this.app.activeEditor.pmEditor.dispatch()

        // if we get here, there must have been a mistake
        throw new Error("Unable to generate message")
    }

    clearMessages() {
        this.chatMessages = [];
    }
}
