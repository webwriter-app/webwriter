import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `Podignuto: ${item}. Strelicama izaberite mesto, tasterom Enter otpustite, tasterom Escape otkažite.`,
  pickedLink: item => `Povezivanje: ${item}. Strelicama izaberite sa čim da se poveže, tasterom Enter povežite, tasterom Escape otkažite.`,
  selected: item => `Izabrano: ${item}. Kliknite gde treba da ode ili kliknite ponovo na njega da biste odustali.`,
  nextTarget: "Tab vodi na sledeći cilj.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}pozicija ${position.index} od ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} sleva, ${y} odozgo`,
  dropped: (item, target) => (target ? `${item} je spušteno na ${target}.` : `${item} je spušteno.`),
  copied: (item, target) => (target ? `${item} je dodato u ${target}.` : `${item} je dodato.`),
  linked: (item, target) => `${item} je povezano sa ${target}.`,
  cancelled: () => "Otkazano.",
  notAllowed: "Otkazano. Ovo ovde više nije dozvoljeno.",
} satisfies Catalog<DragMessages>
