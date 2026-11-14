export function withAuthoring(Base) {
  return class extends Base {
    static convertFrom = {p: "loadInvitation", ".txt": "importInvitation"}
    static convertTo = {p: "toParagraph", "text/plain": "exportInvitation"}

    constructor() {
      super()
      this.addEventListener("click", this.onInvitationClick)
    }

    onInvitationClick = event => {
      if(event.composedPath()[0]?.matches?.("[data-edit-invitation]")) this.focus()
    }

    focus(options) {
      if(!this.isContentEditable) {
        this.shadowRoot?.querySelector(".controls button")?.focus(options)
        return
      }
      const invitation = this.querySelector(":scope > p")
      if(!invitation) return
      HTMLElement.prototype.focus.call(this, options)
      const text = this.ownerDocument.createTreeWalker(invitation, NodeFilter.SHOW_TEXT).nextNode()
      this.ownerDocument.getSelection()?.setPosition(text ?? invitation, 0)
    }

    toParagraph() {
      return this.querySelector(":scope > p")?.cloneNode(true) ?? null
    }

    loadInvitation(fragment) {
      const paragraph = fragment.matches?.("p") ? fragment : fragment.querySelector("p")
      if(!paragraph) return
      const current = this.querySelector(":scope > p")
      if(current) current.replaceWith(paragraph)
      else this.prepend(paragraph)
    }

    async importInvitation(file) {
      const text = await file.text()
      const fragment = this.ownerDocument.createDocumentFragment()
      const paragraph = this.ownerDocument.createElement("p")
      paragraph.textContent = text
      fragment.append(paragraph)
      return () => this.loadInvitation(fragment)
    }

    exportInvitation() {
      return new File([this.toParagraph()?.textContent ?? ""], "invitation.txt", {type: "text/plain"})
    }
  }
}
