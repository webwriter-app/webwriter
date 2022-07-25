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
        this.getAttributeNames().forEach(n => this.setAttribute(n, this.getAttribute(n)));
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
], LitElementWwUnscoped.prototype, "analyzable", void 0);
/**WebWriter API: Minimal base class for a widget implemented in Lit. Implements the core properties required by WebWriter, initializes the component when loaded and provides a Scoped Custom Element Registry (@open-wc/scoped-elements) to help with namespace conflicts when using other components in this widget. */
export const LitElementWw = ScopedElementsMixin(LitElementWwUnscoped);
