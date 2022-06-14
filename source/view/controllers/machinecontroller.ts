import { ReactiveController, ReactiveControllerHost } from "lit";
import {interpret, Interpreter, StateSchema, EventObject, Typestate, TypegenDisabled, StateMachine, InterpreterOptions} from "xstate";

export class MachineController<
    TContext,
    TStateSchema extends StateSchema = any,
    TEvent extends EventObject = EventObject,
    TTypestate extends Typestate<TContext> = {value: any, context: TContext},
    TResolvedTypesMeta = TypegenDisabled
  > extends Interpreter<TContext, TStateSchema, TEvent, TTypestate, TResolvedTypesMeta> implements ReactiveController {
  
  host: ReactiveControllerHost

  constructor(machine: StateMachine<TContext, TStateSchema, TEvent, TTypestate, any, any, TResolvedTypesMeta>, host: ReactiveControllerHost, options: InterpreterOptions = {}) {
    super(machine, options);
    (this.host = host).addController(this);
  }

  hostConnected() {
    this.onTransition(state => state.changed? this.host.requestUpdate():{})
    this.start()
  }

  hostDisconnected() {
    this.stop()
  }
}

export const interpretAsController = (machine: Parameters<typeof interpret>[0], host: ReactiveControllerHost, options: Parameters<typeof interpret>[1] = {}) => new MachineController(machine, host, options)