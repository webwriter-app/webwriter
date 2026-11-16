import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} diambil. Gunakan tombol panah untuk memilih tempat, Enter untuk menjatuhkan, Escape untuk membatalkan.`,
  pickedLink: item => `Menautkan ${item}. Gunakan tombol panah untuk memilih tujuan tautan, Enter untuk menautkan, Escape untuk membatalkan.`,
  selected: item => `${item} dipilih. Klik tempat tujuannya, atau klik lagi untuk membatalkan.`,
  nextTarget: "Tab berpindah ke target berikutnya.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}posisi ${position.index} dari ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} dari kiri, ${y} dari atas`,
  dropped: (item, target) => (target ? `${item} dijatuhkan di ${target}.` : `${item} dijatuhkan.`),
  copied: (item, target) => (target ? `${item} ditambahkan ke ${target}.` : `${item} ditambahkan.`),
  linked: (item, target) => `${item} ditautkan ke ${target}.`,
  cancelled: () => "Dibatalkan.",
  notAllowed: "Dibatalkan. Hal ini tidak diizinkan lagi di sini.",
} satisfies Catalog<DragMessages>
