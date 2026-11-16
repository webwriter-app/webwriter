import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} dijupuk. Gunakake tombol panah kanggo milih panggonan, Enter kanggo ngeculake, Escape kanggo mbatalake.`,
  pickedLink: item => `Nyambungake ${item}. Gunakake tombol panah kanggo milih sambungane, Enter kanggo nyambungake, Escape kanggo mbatalake.`,
  selected: item => `${item} dipilih. Klik panggonan tujuane, utawa klik maneh kanggo mbatalake.`,
  nextTarget: "Tab pindhah menyang target sabanjure.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}urutan ${position.index} saka ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} saka kiwa, ${y} saka ndhuwur`,
  dropped: (item, target) => (target ? `${item} diselehake ing ${target}.` : `${item} diselehake.`),
  copied: (item, target) => (target ? `${item} ditambahake menyang ${target}.` : `${item} ditambahake.`),
  linked: (item, target) => `${item} disambungake menyang ${target}.`,
  cancelled: () => "Dibatalake.",
  notAllowed: "Dibatalake. Iki ora diidini maneh ing kene.",
} satisfies Catalog<DragMessages>
