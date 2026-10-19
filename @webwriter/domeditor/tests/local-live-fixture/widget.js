import {label} from "live-local-label"
import "./widget.css"

customElements.define("live-local-widget", class extends HTMLElement {
  connectedCallback() {
    this.attachShadow({mode: "open"}).innerHTML = `<style>
      :host {display: block; width: 240px; height: 80px; box-sizing: border-box; padding: 16px;}
      button {font: 16px system-ui; padding: 8px 12px;}
    </style><button>${label}</button>`
  }
})
