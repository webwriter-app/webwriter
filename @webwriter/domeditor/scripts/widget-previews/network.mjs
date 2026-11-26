/** Edit: rename host1 to "Phone". Use: simulate the Phone sending to host2; its ARP request crosses switch1 and host2 replies. */
// The new name, by language. The German snippet calls the device "Host 1", so its first word becomes "Handy 1".
const typed = {en: "Phone", de: "Handy"}
const device = id => `element => element.localName === "ww-node" && element.dataset.wwKey === ${JSON.stringify(id)}`
const deviceName = id => `element => element.classList?.contains("name") && element.closest("ww-node")?.dataset.wwKey === ${JSON.stringify(id)}`
const zoomControl = action => `element => element.getAttribute("data-ww-viewport-action") === ${JSON.stringify(action)} && element.closest("[data-ww-viewport-controls]")`
const nameField = `element => element.localName === "input" && element.getRootNode().host?.classList.contains("contextmenu__name")`
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
// Where the pointer rests between the takes, relative to the widget: on the empty board below the link
// from switch0 to switch1, away from the menu that the simulation shows in the lower left.
const rest = {x: 250, y: 250}

/**
 * Brings the Phone, host1, host2, switch1 and switch0 close; the view is not saved, so both takes repeat it.
 * The hosts and switch1 sit at opposite edges of the snippet, and a packet's label, about 92 units wide,
 * overhangs the device it reaches. The + button zooms by 1.2, which pushes those labels past the crop, so the
 * widget's own wheel zoom enlarges the view just so far that they fit the 400 px crop: to about 106 %, where
 * packet labels read at 10.6 px and device names at 16 px. The wheel's point is corrected until they are centered.
 */
async function closeUp({mouse, locate, evaluate, widget}) {
  // A click on the empty board left of the net lets the widget take the wheel instead of the page.
  await mouse.clickAt({x: widget.x + 12, y: widget.y + 200})
  await sleep(300)
  // The percentage as the widget's language writes it, such as "97%" or "97 %".
  const zoom = async () => parseFloat(await evaluate(`document.querySelector("ww-network").shadowRoot.querySelector("[data-ww-viewport-controls]").textContent.match(/([0-9.,]+)\\s*%/)[1].replace(",", ".")`)) / 100
  // Half the width of the label "L2 ARP request", in units of the board.
  const overhang = 46
  const fit = await zoom()
  const sender = await locate(device("host1")), hub = await locate(device("switch1")), name = await locate(deviceName("switch1"))
  // switch1's name may reach further right than a packet, as the German "Netzwerk-Switch 1" does.
  const reach = Math.max(overhang, (name.left + name.width - hub.x) / fit)
  const factor = (400 - 4) / ((hub.x - sender.x) / fit + overhang + reach) / fit
  let around = widget.width * .7
  for(let attempt = 0; attempt < 3; attempt++) {
    await mouse.place(widget.x + around, widget.y + 4)
    await mouse.wheel(0, -Math.log(factor) / .002)
    await sleep(600)
    const scale = await zoom(), host = await locate(device("host1")), right = await locate(device("switch1")), label = await locate(deviceName("switch1"))
    const left = host.x - overhang * scale - widget.x, end = Math.max(right.x + overhang * scale, label.left + label.width) - widget.x
    const shift = (widget.width - end - left) / 2
    if(Math.abs(shift) <= 1) return
    // The content moves by (1 - factor) for each pixel that the wheel's point moves.
    around += shift / (1 - factor)
    await mouse.clickAt(await locate(zoomControl("fit")))
    await sleep(600)
  }
}

export default ({lang}) => ({
  package: "@webwriter/network", version: "3.0.2", snippet: "snippets/simple-network.html", tag: "ww-network",
  // A 420 px widget gives the packets room at both edges; the crop keeps the mode menu at its top and
  // Start Simulation at its bottom, at 99.5 %.
  width: 485, height: 800,
  crop: widget => ({x: widget.x + widget.width / 2 - 185, y: widget.y + 213 - 185, width: 370, height: 370}),
  async prepareEdit(take) {
    await closeUp(take)
    await take.mouse.blur()
  },
  async edit({at, mouse, keyboard, locate, widget}) {
    const phone = await locate(device("host1"))
    await mouse.place(widget.x + rest.x, widget.y + rest.y)
    await at(350); await mouse.move(phone.x, phone.y, 550)
    await at(1000); await mouse.contextClick()
    await sleep(350)
    const field = await locate(nameField)
    // The name's first word, "host1" or "Host", begins after the field's padding.
    await mouse.move(field.left + 26, field.y, 350)
    await at(1750); await mouse.doubleClick()
    await at(1900); await keyboard.type(typed[lang] ?? typed.en, 90)
    await at(2600); await keyboard.press("Escape")
    await at(2850); await mouse.move(widget.x + rest.x, widget.y + rest.y, 550)
  },
  async prepareUse(take) {
    const {mouse, locate, t} = take
    await closeUp(take)
    const press = async target => { await mouse.move(target.x, target.y, 250); await sleep(300); await mouse.click(); await sleep(500) }
    await press(await locate(`element => element.localName === "sl-select" && element.closest(".modeSwitch")`))
    await press(await locate(`element => element.localName === "sl-option" && element.textContent.trim() === ${JSON.stringify(t("Simulate"))}`))
    await press(await locate(`element => element.localName === "sl-button" && element.classList.contains("set-source-btn")`))
    // host0 sits under the mode menu in the close-up, so the Phone, the middle host, sends.
    await press(await locate(device("host1")))
    await press(await locate(`element => element.localName === "sl-button" && element.classList.contains("set-target-btn")`))
    await press(await locate(device("host2")))
    await mouse.blur()
  },
  async use({at, mouse, locate, widget, t}) {
    const start = await locate(`element => element.localName === "sl-button" && element.textContent.trim() === ${JSON.stringify(t("Start Simulation"))}`)
    await mouse.place(widget.x + rest.x, widget.y + rest.y)
    // Every hop takes two seconds, so the simulation starts as early as the wipe allows.
    await at(150); await mouse.move(start.x, start.y, 350)
    await at(550); await mouse.click()
    await at(800); await mouse.move(widget.x + rest.x, widget.y + rest.y, 500)
  },
})
