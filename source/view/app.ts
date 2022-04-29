import {LitElement, html, css} from "lit"
import {customElement, property, query, state} from "lit/decorators.js"
import {interpret} from "xstate"
import {baseKeymap} from "prosemirror-commands"
import {keymap} from "prosemirror-keymap"
import { EditorState } from "prosemirror-state"

import {documentsMachine} from "../state"
import {withMachine} from "../utility"
import {textSchema} from "../model"
import "../components"

@customElement("ww-app")
export class App extends withMachine(LitElement, interpret(documentsMachine)) 
{

	@query("pm-editor")
	editor: HTMLElement
	
	static get styles() {
		return css`
			:host {
				display: block;
				height: 100vh;
			}
		`
	}

	protected createRenderRoot() {
		return this
	}

	editorProps = {
		state: EditorState.create({
			schema: textSchema,
			plugins: [keymap(baseKeymap)] 
		})
	}


	render() {
		const ctx = this.machine.state.context
		const documents = ctx.documentsOrder.map(id => ctx.documents[id])
		console.log(documents)
		console.log(`active document ${ctx.activeDocument}`)

		const tabs = documents.map(({id, name}) => html`
			${console.log(id !== ctx.activeDocument)}
			<ww-tab 
				slot="tabs"
				panel=${id}
				?active=${id === ctx.activeDocument}
				closable
				@focus=${() => this.machine.send("SELECT", {id})}
				@sl-close=${() => this.machine.send("DISCARD", {id})}>
				<ww-tab-title ?disabled=${id !== ctx.activeDocument} placeholder="Untitled">${name}</ww-tab-title>
			</ww-tab>
			<ww-tab-panel name=${id} ?active=${id == ctx.activeDocument}>
				<ww-side-panel>editor buttons</ww-side-panel>
				<pm-editor .editorProps=${this.editorProps}></pm-editor>
				<ww-side-panel>block buttons</ww-side-panel>
			</ww-tab-panel>
		`)

		return html`
			<ww-tabs @ww-add-tab=${() => this.machine.send("CREATE")}>
				${tabs}
			</ww-tabs>
		`
	}
}