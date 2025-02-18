import { LitElement, html } from 'lit';
import {property} from "lit/decorators.js"

export const tagName = 'ww-user-form';

export class UserForm extends LitElement {

    @property({type: String})
    mode: "subscribe" | "login" | "register" | "reset" = "login"

    email?: string
    password?: string
    oldPassword?: string

    render() {
        return html``
    }
}

customElements.define(tagName, UserForm);