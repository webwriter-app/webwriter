// Official monochrome icons: https://creativecommons.org/mission/downloads/
import cc from "../assets/cc-icons/cc.svg?url"
import by from "../assets/cc-icons/by.svg?url"
import nc from "../assets/cc-icons/nc.svg?url"
import sa from "../assets/cc-icons/sa.svg?url"
import nd from "../assets/cc-icons/nd.svg?url"
import zero from "../assets/cc-icons/zero.svg?url"

const icons: Record<string, string> = {CC: cc, BY: by, NC: nc, SA: sa, ND: nd, ZERO: zero}

export function ccLicenseIcons(code: string) {
  const parts = code.startsWith("CC0-") ? ["CC", "ZERO"] : code.split("-").slice(0, -1)
  return parts.map(name => ({name, src: icons[name]})).filter(icon => icon.src)
}
