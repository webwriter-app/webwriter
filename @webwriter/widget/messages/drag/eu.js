var eu_default = {
  picked: (item) => `${item} hartu da. Erabili geziak lekua aukeratzeko, Sartu askatzeko eta Esc ezeztatzeko.`,
  pickedLink: (item) => `${item} lotzen. Erabili geziak zertara lotu aukeratzeko, Sartu lotzeko eta Esc ezeztatzeko.`,
  selected: (item) => `${item} hautatu da. Egin klik joan behar duen lekuan, edo egin klik berriro elementuan ezeztatzeko.`,
  nextTarget: "Tabuladoreak hurrengo helburura pasatzen da.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}${position.count} posiziotik ${position.index}garrena` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} ezkerretik, ${y} goitik`,
  dropped: (item, target) => target ? `${item} ${target} helburuan askatu da.` : `${item} askatu da.`,
  copied: (item, target) => target ? `${item} ${target} helburuari gehitu zaio.` : `${item} gehitu da.`,
  linked: (item, target) => `${item} eta ${target} lotu dira.`,
  cancelled: () => "Ezeztatu da.",
  notAllowed: "Ezeztatu da. Hemen ez dago onartuta jada."
};
export {
  eu_default as default
};
