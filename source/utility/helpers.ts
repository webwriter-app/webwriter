import { ReactiveController, ReactiveControllerHost } from "lit"
import {interpret, Interpreter, StateSchema, EventObject, Typestate, TypegenDisabled, StateMachine, InterpreterOptions} from "xstate";

import * as marshal from "../marshal"
import * as connect from "../connect"
import Mousetrap from "mousetrap";

type Format = keyof typeof marshal
type Protocol = keyof typeof connect

export const isOverflownX = (el: Element) => el.scrollWidth > el.clientWidth
export const isOverflownY = (el: Element) => el.scrollHeight > el.clientHeight
export const isOverflown = (el: Element) => isOverflownX(el) || isOverflownY(el)
export const escapeHTML = (unsafe: string) => unsafe
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;")

export const getFileExtension = (path: string) => path.slice((path.lastIndexOf(".") - 1 >>> 0) + 2)

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

export function hashCode(str: string) {
  let hash = 0;
  for (let i = 0, len = str.length; i < len; i++) {
      let chr = str.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

export function camelCaseToSpacedCase(str: string, capitalizeFirstLetter=true) {
  const spacedStr = str.replace(/[A-Z][a-z]+/g, " $&")
  return capitalizeFirstLetter? spacedStr.replace(/^[a-z]/g, match => match.toUpperCase()): spacedStr
}

export function prettifyPackageName(name: string, capitalizeFirstLetter=true) {
  const coreName = name.split("-").pop()
  return capitalizeFirstLetter? coreName.charAt(0).toUpperCase() + coreName.slice(1): coreName
}

export function createElementWithAttributes(doc: Document, tagName: string, options: ElementCreationOptions, attributes: Record<string, string> = {}, properties: Record<string, any> = {}) {
  const el = doc.createElement(tagName, options)
  Object.entries(attributes).forEach(([key, value]) => el.setAttribute(key, value))
  Object.entries(properties).forEach(([key, value]) => el[key] = value)
  return el
}

export function namedNodeMapToObject(nodeMap: NamedNodeMap) {
  return Object.fromEntries(Array.from(nodeMap).map(x => [x.name, x.value]))
}

export function mousetrapBindGlobalMixin(mousetrap: typeof Mousetrap) {
  var c={}, d = mousetrap.prototype.stopCallback;
  mousetrap.prototype.stopCallback = function(e,b,a,f){
    return this.paused?!0:c[a]||c[f]?!1:d.call(this,e,b,a)
  };
  mousetrap.prototype.bindGlobal = function(a,b,d){
    this.bind(a,b,d)
    if(a instanceof Array) {
      for(b=0; b<mousetrap.length; b++) {
        c[a[b]] = !0
      }
    }
    else {
      c[a]= !0
    }
  }
}