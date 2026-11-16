import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} götürüldü. Yer seçmək üçün ox düymələrindən, yerə qoymaq üçün Enter düyməsindən, ləğv etmək üçün Escape düyməsindən istifadə edin.`,
  pickedLink: item => `${item} birləşdirilir. Birləşdiriləcək hədəfi seçmək üçün ox düymələrindən, birləşdirmək üçün Enter düyməsindən, ləğv etmək üçün Escape düyməsindən istifadə edin.`,
  selected: item => `${item} seçildi. Gedəcəyi yerə klikləyin və ya ləğv etmək üçün ona yenidən klikləyin.`,
  nextTarget: "Tab düyməsi növbəti hədəfə keçir.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}mövqe ${position.index} / ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}soldan ${x}, yuxarıdan ${y}`,
  dropped: (item, target) => (target ? `${item} yerə qoyuldu. Hədəf: ${target}.` : `${item} yerə qoyuldu.`),
  copied: (item, target) => (target ? `${item} əlavə olundu. Hədəf: ${target}.` : `${item} əlavə olundu.`),
  linked: (item, target) => `${item} birləşdirildi. Hədəf: ${target}.`,
  cancelled: () => "Ləğv edildi.",
  notAllowed: "Ləğv edildi. Buna artıq burada icazə verilmir.",
} satisfies Catalog<DragMessages>
