import { LitElement, html, css } from "lit"
import { customElement, property, query, queryAsync } from "lit/decorators.js"
import { localized, msg } from "@lit/localize"
import { SlChangeEvent, SlInput, getFormControls } from "@shoelace-style/shoelace"
import { DataInput } from "../elements"
import { NpmAccount, PocketbaseAccount } from "../../model/schemas/accounts"
import { filterObject } from "../../utility"

type Constructor<T = {}> = new (...args: any[]) => T;

export declare class FormMixinType {
  highlight: boolean;
  protected renderHighlight(): unknown;
}

export const FormMixin = <T extends Constructor<LitElement>>(superClass: T) => class extends superClass {
  
} as Constructor<FormMixinType> & T

export * from "./saveform"
export * from "./shareform"