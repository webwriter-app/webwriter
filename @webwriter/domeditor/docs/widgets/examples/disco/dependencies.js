export function withDependencies(Base) {
  return class extends Base {
    constructor() {
      super()
      this.addEventListener("click", this.onTipClick)
    }

    onTipClick = async event => {
      const button = event.composedPath()[0]?.closest?.("[data-dance-tip]")
      if(!button || !this.allowTips || this.isContentEditable) return
      const output = button.nextElementSibling
      try {
        const {danceTip} = await import("#disco-tips")
        output.textContent = danceTip
      } catch {
        output.textContent = "Could not load the dance tip."
      }
    }
  }
}
