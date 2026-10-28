export function captionIconSource(position: "none" | "above" | "below", alignment: "left" | "center" | "right" = "left", add = false) {
  const x = alignment === "left" ? 6 : alignment === "center" ? 9 : 12
  const y = position === "above" ? 3 : 21
  const annotation = position === "none"
    ? add ? '<path d="M9 10.143h6M12 7.143v6M6 16.857h12"/>' : ""
    : `<line x1="${x}" x2="${x + 6}" y1="${y}" y2="${y}"/>`
  const content = position === "none" && add ? annotation : `<rect x="6" y="6" width="12" height="12" rx="1"/>${annotation}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${add ? 3 : 1.75}" stroke-linecap="round" aria-hidden="true">${content}</svg>`
}
