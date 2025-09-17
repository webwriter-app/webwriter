import {LitElement, css, html} from "lit";
import {customElement, property} from "lit/decorators.js";
import {App} from "#view";
import {basePlugin, generateWidgetDocumentation, toolFriendlyNames} from "#model";
import {marked} from "marked";
import {unsafeHTML} from 'lit/directives/unsafe-html.js';
import {triggerAISuggestionForSelection} from "#viewmodel/aicontroller";


@customElement("ww-ai-toolbox-widget")
export class AIToolboxWidget extends LitElement {
    static styles = css`
        .ai-container {
            border-radius: 4px;
            position: relative;
            border: 2px solid var(--sl-color-primary-800);
            color: var(--sl-color-primary-800);
            width: 100%;
            padding: 8px;
        }

        .ai-label {
            position: absolute;
            top: -0.8em;
            left: 3px;
            background: #f4f4f5;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.75rem;
            padding: 0 3px;
            gap: 3px;
        }

        input {
            width: 100%;
            padding: 8px;
            box-sizing: border-box;
        }

        .chat-container {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 8px;
            max-height: 350px;
            overflow-y: auto;
        }

        .chat-bubble {
            max-width: 70%;
            padding: 7px 12px;
            border-radius: 16px;
            font-size: 0.75rem;
            line-height: 1.3;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
            word-break: break-word;
            display: inline-block;
        }

        .chat-bubble p {
            margin: 0;
            margin-bottom: 10px;
        }

        .chat-bubble ol {
            padding-left: 25px;
        }

        .chat-bubble.user {
            background: var(--sl-color-neutral-700);
            color: white;
            align-self: flex-end;
            border-bottom-right-radius: 4px;
        }

        .chat-bubble.ai {
            background: var(--sl-color-primary-700);
            color: white;
            align-self: flex-start;
            border-bottom-left-radius: 4px;
        }

        .function-call {
            font-size: 0.65rem;
        }

        .chat-sender {
            font-size: 0.65rem;
            font-weight: bold;
            margin-bottom: 1px;
            opacity: 0.6;
        }

        .chat-input-row {
            display: flex;
            background: #f8fafc;
            border-radius: 20px;
            align-items: center;
            gap: 6px;
            margin-top: 4px;
            border: 2px solid var(--sl-color-primary-700);
            overflow: hidden;
        }

        .chat-input {
            flex: 1;
            /* Platz für den Senden-Button */
            padding: 7px 25px 7px 12px;
            resize: none;
            border-radius: 18px;
            border: none;
            font-size: 0.8rem;
            outline: none;
            background: #f8fafc;
            color: var(--sl-color-primary-900);
            transition: border-color 0.2s;
        }

        .chat-input:focus {
            border-color: var(--sl-color-primary-500);
            background: #fff;
        }

        .send-btn {
            background: var(--sl-color-primary-700);
            color: #fff;
            border: none;
            border-top-left-radius: 50%;
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background 0.2s;
        }

        .send-btn svg {
            width: 16px;
            height: 16px;
        }

        /* Red variant used for active loading and retry state */
        .send-btn.red {
            background: var(--sl-color-danger-600);
        }

        .send-btn[disabled] {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .spinner {
            animation: spin 1.4s linear infinite;
            /* ensure rotation around center in SVG */
            transform-origin: 50% 50%;
            transform-box: fill-box;
        }

        .spinner circle {
            stroke-linecap: round;
            /* draw only a part of the circle and animate it */
            stroke-dasharray: 90 150;
            stroke-dashoffset: 0;
            animation: dash 1.4s ease-in-out infinite;
        }

        .example-prompt {
            text-align: left;
            background: var(--sl-color-primary-50);
            border: 1px solid var(--sl-color-primary-200);
            color: var(--sl-color-primary-900);
            border-radius: 12px;
            padding: 8px 12px;
            font-size: 0.75em;
            cursor: pointer;
            transition: background 0.2s;
            line-break: 1.2;
        }

        .example-prompt:hover {
            background: var(--sl-color-primary-100);
        }

        @keyframes spin {
            from {
                transform: rotate(0deg);
            }
            to {
                transform: rotate(360deg);
            }
        }

        @keyframes dash {
            0% {
                stroke-dasharray: 1 200;
                stroke-dashoffset: 0;
            }
            50% {
                stroke-dasharray: 90 200;
                stroke-dashoffset: -35px;
            }
            100% {
                stroke-dasharray: 90 200;
                stroke-dashoffset: -124px;
            }
        }
    `

    @property()
    app: App

    constructor() {
        super();
    }

    handleCancel() {
        this.app.store.ai.cancelRequest(() => this.requestUpdate());
    }

    handleRetry() {
        this.app.store.ai.retryLastRequest(() => this.requestUpdate(), this.app);

        // clean input
        const input = this.renderRoot?.getElementById('chatInput') as HTMLTextAreaElement;
        if (input) {
            input.value = "";
        }
    }

    async handleSend() {
        const input = this.renderRoot?.getElementById('chatInput') as HTMLTextAreaElement;
        if (input) {
            const query = input.value.trim();

            if (query) {
                this.app.store.ai.addMessage({
                    timestamp: new Date(),
                    role: "user",
                    content: query,
                    tool_calls: null,
                    isUpdate: null
                });
            }

            this.requestUpdate()
            input.value = "";
            this.app.store.ai.generateResponse(() => this.requestUpdate(), this.app);
        }
    }

    handleKeyDown(event: KeyboardEvent) {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            this.handleSend();
        }
    }

    render() {
        const loading = this.app.store.ai.loading;
        const chatMessages = this.app.store.ai.chatMessages;
        const examplePrompts = [
            "Erstelle ein Übungsblatt zu ...",
            "Welche Aufgabe würde dazu noch gut passen?",
            "Ist mein Text einfach und verständlich geschrieben?",
            "Welche Widgets passen gut zu meinem Inhalt?",
        ];
        return html`
            <div class="ai-container">
                <span class="ai-label">
                    <!-- ToDo add credits to <a target="_blank" href="https://icons8.com/icon/GVghUo9qfGPW/ai">AI</a> icon by <a target="_blank" href="https://icons8.com">Icons8</a> -->
                    <svg xmlns="http://www.w3.org/2000/svg"
                         xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0,0,256,256"
                         width="16px" height="16px" fill-rule="nonzero"><g fill="#075985"
                                                                           fill-rule="nonzero"
                                                                           stroke="none"
                                                                           stroke-width="1"
                                                                           stroke-linecap="butt"
                                                                           stroke-linejoin="miter"
                                                                           stroke-miterlimit="10"
                                                                           stroke-dasharray=""
                                                                           stroke-dashoffset="0"
                                                                           font-family="none"
                                                                           font-weight="none"
                                                                           font-size="none"
                                                                           text-anchor="none"
                                                                           style="mix-blend-mode: normal"><g
                            transform="scale(10.66667,10.66667)"><path
                            d="M17.469,9.286l-2.156,-0.957c-1.657,-0.736 -2.976,-2.096 -3.683,-3.801l-0.82,-1.974c-0.152,-0.367 -0.481,-0.55 -0.81,-0.55c-0.329,0 -0.658,0.183 -0.81,0.55l-0.819,1.974c-0.708,1.704 -2.026,3.065 -3.684,3.801l-2.156,0.957c-0.708,0.314 -0.708,1.344 0,1.658l2.226,0.988c1.616,0.717 2.911,2.029 3.631,3.678l0.809,1.852c0.155,0.356 0.479,0.534 0.803,0.534c0.324,0 0.648,-0.178 0.804,-0.534l0.809,-1.852c0.72,-1.648 2.015,-2.961 3.631,-3.678l2.226,-0.988c0.707,-0.314 0.707,-1.344 -0.001,-1.658zM10,14.34c-0.949,-1.882 -2.497,-3.37 -4.408,-4.225c1.931,-0.884 3.478,-2.409 4.408,-4.335c0.93,1.926 2.477,3.451 4.408,4.334c-1.911,0.855 -3.459,2.344 -4.408,4.226z"/><path
                            d="M18.713,21.125l-0.247,0.565c-0.18,0.414 -0.753,0.414 -0.934,0l-0.247,-0.565c-0.44,-1.008 -1.231,-1.81 -2.219,-2.249l-0.76,-0.337c-0.411,-0.182 -0.411,-0.78 0,-0.962l0.717,-0.319c1.013,-0.45 1.819,-1.282 2.251,-2.324l0.253,-0.611c0.176,-0.426 0.765,-0.426 0.941,0l0.253,0.611c0.432,1.042 1.238,1.874 2.251,2.324l0.717,0.319c0.411,0.182 0.411,0.78 0,0.962l-0.76,0.337c-0.984,0.439 -1.776,1.241 -2.216,2.249z"/></g></g></svg> 
                    WebWriter AI</span>
                <!-- main chat container -->
                <div class="chat-container" id="chatContainer">
                    ${chatMessages.length === 0 ? html`
                        <div style="display: flex; flex-direction: column; gap: 8px; margin: 16px 0;">
                            ${examplePrompts.map(prompt => html`
                                <button type="button" class="example-prompt"
                                        @click="${() => this.insertPrompt(prompt)}">${prompt}
                                </button>
                            `)}
                        </div>
                    ` : chatMessages.map(msg => {
                        switch (msg.role) {
                            case "system":
                                return null;
                            case "tool":
                                return null;
                            case "user":
                                return html`
                                    <div class="chat-bubble user">
                                        <div class="chat-sender">Du</div>
                                        ${msg.content}
                                    </div>
                                `;
                            case "assistant":
                                // if it is a tool call or multiple

                                const toolsContent = msg["tool_calls"] ? msg["tool_calls"].map(call => {
                                    return html`
                                        <div class="function-call">${toolFriendlyNames[call.function.name]}</div>`
                                }) : null;

                                const content = msg.content ? html`
                                    <div class="chat-bubble ai">
                                        <div class="chat-sender">WebWriter AI</div>
                                        ${unsafeHTML(marked.parse(msg.content))}
                                    </div>` : null;

                                // Combine both types
                                return html`${toolsContent} ${content}`;
                        }
                    })}
                </div>
                <form class="chat-input-row" @submit="${(e) => {
                    e.preventDefault();
                    this.handleSend();
                }}" style="position:relative; align-items: flex-end;">
                    <textarea id="chatInput" class="chat-input" rows="2"
                              placeholder=${loading ? "AI is thinking..." : "Ask AI..."} autocomplete="off"
                              aria-label="Ask AI" @keydown="${this.handleKeyDown}" ?disabled=${loading}></textarea>

                    <div style="position:absolute; bottom:0px; right:0px; display:flex; gap:6px;">
                        ${loading ? html`
                            <button type="button" class="send-btn red" title="Stop" @click="${() => this.handleCancel()}">
                                <svg class="spinner" viewBox="0 0 50 50" width="20" height="20">
                                    <circle cx="25" cy="25" r="20" fill="none" stroke="white" stroke-width="5"/>
                                </svg>
                            </button>` : this.app.store.ai.canRetry ? html`
                            <button type="button" class="send-btn red" title="Retry" @click="${() => this.handleRetry()}">
                                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M18 4v6h-6"/>
                                        <path d="M20 12A8 8 0 1 1 12 4"/>
                                    </g>
                                </svg>
                            </button>` : html`
                            <button class="send-btn" type="submit" aria-label="Send message">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                                    <path fill="currentColor" d="m2 21l21-9L2 3v7l15 2l-15 2z"/>
                                </svg>
                            </button>`}
                    </div>
                </form>
                <a @click="${this.showInfoMessage}"
                   style="font-size: 10px; margin-bottom: 0px; text-align: center !important; line-height: 1.2 !important; display: block; margin-top: 10px;">WebWriter
                    AI can help improve your explorable. It may not work perfectly with all widgets and may produce
                    errors. Click to learn more.</a>
            </div>
        `;
    }

    insertPrompt(prompt: string) {
        const input = this.renderRoot?.getElementById('chatInput') as HTMLTextAreaElement;
        if (input) {
            input.value = prompt;
            input.focus();
        }
    }

    showInfoMessage() {
        const messages = ["WebWriter AI can help improve your explorable by suggesting enhancements to text content. You may as the AI for new content ideas, imrovements, or simplifications. ", "It may not work perfectly with all widgets and could produce errors. Please review AI-generated content for accuracy and appropriateness before publishing.", "Any changes from the AI are not automatically applied to your explorable. You must manually accept the suggestions you want to keep them, if not, you can quickly discard them. "];

        alert(messages.join("\n\n"));
    }

    updated() {
        // Scroll chat to the top of the last message
        const chatContainer = this.renderRoot?.getElementById('chatContainer');
        const lastChild = chatContainer?.lastElementChild as HTMLElement;
        if (chatContainer && lastChild) {
            chatContainer.scrollTo({
                top: lastChild.offsetTop,
                behavior: 'smooth'
            });
        }
    }
}
