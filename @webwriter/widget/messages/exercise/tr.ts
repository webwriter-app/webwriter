import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Denetle",
  reset: "Sıfırla",
  showSolution: "Çözümü göster",
  hideSolution: "Çözümü gizle",
  required: "Lütfen bu soruyu yanıtlayın.",
  summary: (correct, total) => (correct === total ? "Hepsi doğru." : `${total} sorudan ${correct} doğru.`),
  feedbackOption: "Geri bildirim",
  feedbackOnCheck: "Okuyucu denetlediğinde",
  feedbackOnSubmit: "Gönderdikten sonra",
  requiredOption: "Zorunlu",
} satisfies Catalog<ExerciseMessages>
