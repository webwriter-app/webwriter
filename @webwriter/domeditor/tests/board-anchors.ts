import {defaultDocumentTheme} from "../src/document-themes"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
const layout = async (view: Window) => {
  await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
  await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
}
const near = (actual: number, expected: number, label: string) => assert(Math.abs(actual - expected) < 2, `${label}: ${actual} vs ${expected}`)

export async function checkBoardAnchors(inspect = false) {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:700px"
  frame.srcdoc = '<!doctype html><body><p>Initial card</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow!
    for(let attempt = 0; !view.editor && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(view.editor, "board anchor fixture did not initialize")
    const editor = view.editor!
    const board = editor.features.board, doc = frame.contentDocument!
    const theme = doc.createElement("style"); theme.textContent = defaultDocumentTheme.source; doc.head.append(theme)
    assert(editor.setDocumentLayout("board", "document"), "board did not convert")
    await layout(view); board.refresh(); await layout(view)
    const appendix = editor.appendix
    const card = board.cards(board.columns()[0])[0]
    const irregular = doc.createElement("article"); irregular.className = "ww-board-card"
    irregular.innerHTML = '<!-- retained --><span>unusual</span><board-anchor-widget></board-anchor-widget><p>last</p>'
    card.after(irregular)
    const originalHTML = irregular.innerHTML
    // Add offscreen columns and tall content to force both native scrollbars.
    for(let i = 0; i < 5; i++) {
      const next = doc.createElement("section"); next.className = "ww-board-column"
      const heading = doc.createElement("h2"); heading.textContent = `Tall column ${i}`
      next.append(heading); doc.body.append(next)
      next.style.minHeight = "1100px"
    }
    await layout(view); board.refresh(); await layout(view)
    const getControls = () => ({
      card: appendix.querySelector<HTMLButtonElement>('[part~="board-add-card"][aria-label="Add card to column 1"]')!,
      column: appendix.querySelector<HTMLButtonElement>('[part~="board-add-column"]')!
    })
    let {card: cardButton, column: columnButton} = getControls()
    assert(cardButton && columnButton, "board controls lost stable parts")
    const expectedCardSlot = (column: HTMLElement) => {
      const rect = column.getBoundingClientRect(), style = view.getComputedStyle(column)
      const last = Array.from(column.childNodes).filter(node => node instanceof doc.defaultView!.Element && view.getComputedStyle(node).display !== "none").at(-1) as HTMLElement
      const itemStyle = view.getComputedStyle(last)
      return {
        left: rect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
        top: last.getBoundingClientRect().bottom + parseFloat(itemStyle.marginBottom) + parseFloat(style.rowGap),
        width: rect.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth) - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        height: parseFloat(view.getComputedStyle(column, "::after").height)
      }
    }
    const checkRect = (element: Element, expected: {left: number, top: number, width: number, height: number}, label: string) => {
      const rect = element.getBoundingClientRect()
      near(rect.left, expected.left, `${label} left`); near(rect.top, expected.top, `${label} top`)
      near(rect.width, expected.width, `${label} width`); near(rect.height, expected.height, `${label} height`)
    }
    checkRect(cardButton, expectedCardSlot(board.columns()[0]), "card slot")
    assert(irregular.innerHTML === originalHTML, "anchor creation rewrote unfamiliar column contents")
    const refresh = board.refresh.bind(board); board.refresh = () => {}
    const selectedColumn = board.columns()[0]
    selectedColumn.dispatchEvent(new (view as Window & typeof globalThis).PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0}))
    await layout(view); refresh(); await layout(view)
    ;({card: cardButton, column: columnButton} = getControls())
    board.refresh = () => {}
    const frameTarget = board.columns()[0]
    const overlay = board.transformOverlay(frameTarget)
    assert(overlay && overlay.part.contains("transform-overlay-board-selected"), `selected column frame is not marked selected (${overlay?.getAttribute("part")})`)
    const activeOverlay = overlay!
    const overlayRect = activeOverlay.getBoundingClientRect(), targetRect = frameTarget.getBoundingClientRect()
    near(overlayRect.left, targetRect.left, "selected frame left"); near(overlayRect.top, targetRect.top, "selected frame top")
    near(overlayRect.width, targetRect.width, "selected frame width"); near(overlayRect.height, targetRect.height, "selected frame height")
    const copyright = activeOverlay.querySelector<HTMLButtonElement>('[part~="transform-overlay-attribution-board"]')
    assert(copyright && !copyright.hidden, "selected column frame has no copyright control")
    const copyrightRect = copyright!.getBoundingClientRect()
    near(copyrightRect.left + copyrightRect.width / 2, overlayRect.right, "copyright corner x")
    near(copyrightRect.top + copyrightRect.height / 2, overlayRect.bottom, "copyright corner y")

    const root = doc.documentElement
    assert(root.scrollWidth > root.clientWidth && root.scrollHeight > root.clientHeight, "fixture did not overflow both axes")
    const beforeX = cardButton.getBoundingClientRect(), frameBeforeX = activeOverlay.getBoundingClientRect()
    doc.defaultView!.scrollTo(140, 0); await layout(view)
    const afterX = cardButton.getBoundingClientRect(), frameAfterX = activeOverlay.getBoundingClientRect()
    near(afterX.left - beforeX.left, -140, "horizontal scroll delta")
    near(frameAfterX.left - frameBeforeX.left, -140, "horizontal frame delta")
    checkRect(cardButton, expectedCardSlot(board.columns()[0]), "horizontally scrolled card slot")
    const beforeY = cardButton.getBoundingClientRect(), frameBeforeY = activeOverlay.getBoundingClientRect()
    doc.defaultView!.scrollTo(140, 120); await layout(view)
    const afterY = cardButton.getBoundingClientRect(), frameAfterY = activeOverlay.getBoundingClientRect()
    near(afterY.top - beforeY.top, -120, "vertical scroll delta")
    near(frameAfterY.top - frameBeforeY.top, -120, "vertical frame delta")
    checkRect(cardButton, expectedCardSlot(board.columns()[0]), "vertically scrolled card slot")

    // Inserting content changes the expected slot position without board.refresh().
    const previousSlotTop = expectedCardSlot(board.columns()[0]).top
    const extra = doc.createElement("p"); extra.textContent = "content growth"; extra.style.height = "240px"; irregular.append(extra)
    await layout(view)
    const grownSlot = expectedCardSlot(board.columns()[0])
    checkRect(cardButton, grownSlot, "grown card slot")
    assert(grownSlot.top > previousSlotTop + 100, "content growth did not affect the card slot")
    const previousWidth = cardButton.getBoundingClientRect().width
    frameTarget.style.width = frameTarget.style.flexBasis = "380px"
    await layout(view)
    checkRect(cardButton, expectedCardSlot(frameTarget), "resized column card slot")
    checkRect(activeOverlay, frameTarget.getBoundingClientRect(), "resized column frame")
    assert(cardButton.getBoundingClientRect().width < previousWidth - 40, "column resizing did not resize its anchored controls")

    // Grouping changes the add-column anchor's last flow owner and keeps card slots local.
    board.refresh = refresh
    view.scrollTo(0, 0); await layout(view)
    editor.features.selection.selectElement(card)
    board.refresh(); await layout(view)
    const cardFrame = board.transformOverlay(card)!
    const cardCopyright = cardFrame?.querySelector<HTMLButtonElement>('[part~="transform-overlay-attribution-board"]')
    assert(cardCopyright && !cardCopyright.hidden, "selected card frame has no copyright control")
    const cardFrameRect = cardFrame.getBoundingClientRect(), cardCopyrightRect = cardCopyright!.getBoundingClientRect()
    near(cardCopyrightRect.left + cardCopyrightRect.width / 2, cardFrameRect.right, "card copyright corner x")
    near(cardCopyrightRect.top + cardCopyrightRect.height / 2, cardFrameRect.bottom, "card copyright corner y")
    board.setGrouping("new", board.columns()[0]); await layout(view); board.refresh()
    ;({card: cardButton, column: columnButton} = getControls())
    const groupedColumn = board.columns()[0]
    checkRect(cardButton, expectedCardSlot(groupedColumn), "grouped column card slot")
    const lastOwner = Array.from(doc.body.children).filter(node => node.matches(".ww-board-column,.ww-board-group")).at(-1) as HTMLElement
    const bodyStyle = view.getComputedStyle(doc.body), ownerRect = lastOwner.getBoundingClientRect()
    const columnExpected = {
      left: ownerRect.right + parseFloat(bodyStyle.columnGap),
      top: doc.body.getBoundingClientRect().top + parseFloat(bodyStyle.borderTopWidth) + parseFloat(bodyStyle.paddingTop),
      width: parseFloat(view.getComputedStyle(doc.body, "::after").width),
      height: parseFloat(view.getComputedStyle(doc.body, "::after").height)
    }
    checkRect(columnButton, columnExpected, "add-column body slot after grouped columns")

    // Transformed frames still use their local box and matrix, then return to
    // native anchors when the authored transform is removed.
    groupedColumn.dispatchEvent(new (view as Window & typeof globalThis).PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0}))
    board.refresh(); await layout(view)
    const groupedFrame = board.transformOverlay(groupedColumn)!
    const groupedCopyright = groupedFrame?.querySelector<HTMLButtonElement>('[part~="transform-overlay-attribution-board"]')
    assert(groupedCopyright && !groupedCopyright.hidden, "selected grouped column frame has no copyright control")
    const groupedFrameRect = groupedFrame.getBoundingClientRect(), groupedCopyrightRect = groupedCopyright!.getBoundingClientRect()
    near(groupedCopyrightRect.left + groupedCopyrightRect.width / 2, groupedFrameRect.right, "grouped column copyright corner x")
    near(groupedCopyrightRect.top + groupedCopyrightRect.height / 2, groupedFrameRect.bottom, "grouped column copyright corner y")
    groupedColumn.style.rotate = "12deg"
    board.refresh(); await layout(view)
    const rotated = board.transformOverlay(groupedColumn)!
    assert(rotated && !rotated.matches('[part~="transform-overlay-board-anchored"]'), "rotated column did not retain measured geometry")
    const rotatedTarget = groupedColumn.getBoundingClientRect()
    checkRect(rotated, rotatedTarget, "rotated column frame")
    groupedColumn.style.removeProperty("rotate")
    board.refresh(); await layout(view)
    assert(rotated.matches('[part~="transform-overlay-board-anchored"]'), "unrotated column did not return to CSS anchors")
    checkRect(rotated, groupedColumn.getBoundingClientRect(), "unrotated column frame")

    const serialized = await editor.serializeHTML()
    assert(!serialized.includes("board-add-card") && !serialized.includes("◆board-transform") && !serialized.includes("◆board-anchor"), "serialization included board editing controls or markers")
    if(!inspect) {
      for(const item of board.columns()) item.remove()
      board.refresh()
      columnButton = appendix.querySelector<HTMLButtonElement>('[part~="board-add-column"]')!
      assert(columnButton && !columnButton.hidden && columnButton.getBoundingClientRect().width > 0, "empty board add-column anchor is unavailable")
      board.disable()
      assert(!Array.from(doc.body.querySelectorAll<HTMLElement>("*"), element => Array.from(element.classList).some(name => name.startsWith("◆board-"))).some(Boolean), "disabling board left board markers")
      editor.destroy()
      const leftoverMarkers = Array.from(doc.body.querySelectorAll<HTMLElement>("*"))
        .flatMap(element => Array.from(element.classList)).filter(name => name.startsWith("◆") && name !== "◆editor-only")
      assert(leftoverMarkers.length === 0, `disable/destroy left editor markers in authored HTML: ${leftoverMarkers.join(", ")}`)
    }
    else {
      // Leave the board at the two-axis scroll position with its selected frame visible.
      board.refresh = refresh
      doc.defaultView!.scrollTo(140, 120)
    }
  }
  finally {
    if(inspect) frame.style.display = "block"
    else { frame.contentWindow?.editor?.destroy(); frame.remove() }
  }
}
