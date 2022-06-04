import {LitElement} from "lit"
import { property } from "lit/decorators.js"
import {EventObject, Interpreter} from "xstate"

import {Block, BlockElement} from "../model"

type Constructor<T = {}> = new (...args: any[]) => T

export declare class IMachineMixin<C, S, E extends EventObject> {
	machine: Interpreter<C, S, E>
}

export const withMachine = <C, S, E extends EventObject, T extends Constructor<LitElement>>(Class: T, machine: Interpreter<C, S, E>) => {
	return class extends Class {
		machine: Interpreter<C, S, E> = machine

		connectedCallback() {
			this.machine.onTransition(state => state.changed? this.requestUpdate():{})
			this.machine.start()
			super.connectedCallback()
		}
	
		disconnectedCallback() {
			this.machine.stop()
			super.disconnectedCallback()
		}		
	} as Constructor<IMachineMixin<C, S, E>> & T
}

export class LitElementWw extends LitElement implements BlockElement {
  @property({type: Boolean, attribute: true, reflect: true})
  printable: boolean

  @property({type: Boolean, attribute: true, reflect: true})
  editable: boolean

  @property({type: Boolean, attribute: true, reflect: true})
  editing: boolean

  @property({type: String, attribute: true, reflect: true})
  label: Block["attributes"]["label"]
}