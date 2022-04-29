import {LitElement} from "lit"
import {EventObject, Interpreter} from "xstate"

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