import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `Podniesiono: ${item}. Strzałkami wybierz miejsce, klawiszem Enter upuść, klawiszem Escape anuluj.`,
  pickedLink: item => `Łączenie: ${item}. Strzałkami wybierz, z czym połączyć, klawiszem Enter połącz, klawiszem Escape anuluj.`,
  selected: item => `Zaznaczono: ${item}. Kliknij miejsce docelowe lub kliknij ponownie, aby anulować.`,
  nextTarget: "Klawisz Tab przechodzi do następnego celu.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}pozycja ${position.index} z ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} od lewej, ${y} od góry`,
  dropped: (item, target) => (target ? `Upuszczono: ${item}, cel: ${target}.` : `Upuszczono: ${item}.`),
  copied: (item, target) => (target ? `Dodano: ${item}, cel: ${target}.` : `Dodano: ${item}.`),
  linked: (item, target) => `Połączono: ${item} i ${target}.`,
  cancelled: () => "Anulowano.",
  notAllowed: "Anulowano. To nie jest już tutaj dozwolone.",
} satisfies Catalog<DragMessages>
