var hr_default = {
  picked: (item) => `Podignuto: ${item}. Strelicama odaberite mjesto, tipkom Enter ispustite, tipkom Escape odustanite.`,
  pickedLink: (item) => `Povezivanje: ${item}. Strelicama odaberite s čime ga povezati, tipkom Enter povežite, tipkom Escape odustanite.`,
  selected: (item) => `Odabrano: ${item}. Kliknite gdje treba ići ili ponovno kliknite na njega da biste odustali.`,
  nextTarget: "Tab prelazi na sljedeći cilj.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}položaj ${position.index} od ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} slijeva, ${y} odozgo`,
  dropped: (item, target) => target ? `${item} je ispušteno na ${target}.` : `${item} je ispušteno.`,
  copied: (item, target) => target ? `${item} je dodano u ${target}.` : `${item} je dodano.`,
  linked: (item, target) => `${item} je povezano s ${target}.`,
  cancelled: () => "Otkazano.",
  notAllowed: "Otkazano. Ovo ovdje više nije dopušteno."
};
export {
  hr_default as default
};
