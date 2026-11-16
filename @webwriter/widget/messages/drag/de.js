var de_default = {
  picked: (item) => `${item} aufgenommen. Mit den Pfeiltasten einen Platz wählen, mit Enter ablegen, mit Escape abbrechen.`,
  pickedLink: (item) => `Verbindung von ${item}. Mit den Pfeiltasten ein Ziel wählen, mit Enter verbinden, mit Escape abbrechen.`,
  selected: (item) => `${item} ausgewählt. Auf das Ziel klicken, oder zum Abbrechen noch einmal auf das Element.`,
  nextTarget: "Tab wechselt zum nächsten Ziel.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}Platz ${position.index} von ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} von links, ${y} von oben`,
  dropped: (item, target) => target ? `${item} abgelegt: ${target}.` : `${item} abgelegt.`,
  copied: (item, target) => target ? `${item} hinzugefügt: ${target}.` : `${item} hinzugefügt.`,
  linked: (item, target) => `${item} mit ${target} verbunden.`,
  cancelled: () => "Abgebrochen.",
  notAllowed: "Abgebrochen. Das ist hier nicht mehr erlaubt."
};
export {
  de_default as default
};
