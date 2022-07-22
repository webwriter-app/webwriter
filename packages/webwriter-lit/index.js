var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { LitElement } from "lit";
import { property } from "lit/decorators.js";
import { ScopedElementsMixin } from "@open-wc/scoped-elements";
class LitElementWwUnscoped extends LitElement {
    connectedCallback() {
        super.connectedCallback();
        this.getAttributeNames().forEach(name => this.setAttribute(name, this.getAttribute(name)));
    }
}
__decorate([
    property({ type: Boolean, attribute: true, reflect: true })
], LitElementWwUnscoped.prototype, "printable", void 0);
__decorate([
    property({ type: Boolean, attribute: true, reflect: true })
], LitElementWwUnscoped.prototype, "editable", void 0);
__decorate([
    property({ type: Boolean, attribute: true, reflect: true })
], LitElementWwUnscoped.prototype, "editing", void 0);
__decorate([
    property({ type: Boolean, attribute: true, reflect: true })
], LitElementWwUnscoped.prototype, "onlineOnly", void 0);
__decorate([
    property({ type: String, attribute: true, reflect: true })
], LitElementWwUnscoped.prototype, "label", void 0);
__decorate([
    property({ type: String, attribute: true, reflect: true })
], LitElementWwUnscoped.prototype, "author", void 0);
__decorate([
    property({ type: String, attribute: true, reflect: true })
], LitElementWwUnscoped.prototype, "license", void 0);
export const LitElementWw = ScopedElementsMixin(LitElementWwUnscoped);
