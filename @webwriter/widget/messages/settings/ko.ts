import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "이 값은 여기서 사용할 수 없습니다.",
  invalidDuration: "시간을 입력하세요. 예: 1:30 또는 90",
} satisfies Catalog<SettingsMessages>
