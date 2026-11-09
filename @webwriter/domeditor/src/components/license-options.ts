import {creativeCommonsLicenses} from "../document-head"
import {commonSoftwareLicenses, spdxLicenseOptions} from "../package-licenses"
import {ccLicenseIcons} from "./cc-license-icons"
import type {ComboboxOption} from "./editor-combobox"

const gplDetail = "When distributing modified versions, share the corresponding source under the GPL."
const lgplDetail = "Modified library code stays under the LGPL. Other code can link to the library under different terms, subject to the license conditions."
const bsdDetail = "Use, modify and redistribute the software, keeping the copyright and license notices."
const softwareDetails: Record<typeof commonSoftwareLicenses[number], string> = {
  MIT: "Use, modify and redistribute the software, keeping the copyright and license notices.",
  "Apache-2.0": "Use, modify and redistribute the software with an express patent grant. Keep required notices and mark modified files.",
  "BSD-3-Clause": `${bsdDetail} Do not use contributors’ names to endorse derived products without permission.`,
  "BSD-2-Clause": bsdDetail,
  ISC: "Use, modify and redistribute the software, keeping the copyright and permission notices.",
  "MPL-2.0": "When distributing the software, make the source of covered files, including your changes to those files, available under the MPL.",
  "LGPL-2.1-or-later": lgplDetail,
  "LGPL-3.0-or-later": lgplDetail,
  "GPL-2.0-or-later": gplDetail,
  "GPL-3.0-or-later": gplDetail,
  "AGPL-3.0-or-later": "Share corresponding source when distributing modified versions, and offer it to users who interact with a modified version over a network.",
  Unlicense: "Dedicates the software to the public domain and permits use, modification and redistribution.",
}

function licenseOptions(useURLs: boolean) {
  const cc = creativeCommonsLicenses.map(license => ({
    value: useURLs ? license.url : license.code,
    label: license.code,
    description: license.name,
    detail: license.description,
    icons: ccLicenseIcons(license.code),
  }))
  const ccByCode = new Map<string, ComboboxOption>(cc.map(option => [option.label, option]))
  const details = new Map(Object.entries(softwareDetails))
  const searchOptions = spdxLicenseOptions.map(option => ccByCode.get(option.label) ?? {
    ...option,
    value: useURLs ? `https://spdx.org/licenses/${encodeURIComponent(option.label)}.html` : option.value,
    detail: details.get(option.label),
  })
  const byCode = new Map(searchOptions.map(option => [option.label, option]))
  const options: ComboboxOption[] = [
    ...cc,
    ...commonSoftwareLicenses.map((code, index) => {
      const option = byCode.get(code)!
      return index === 0 ? {...option, dividerBefore: true} : option
    }),
  ]
  return {options, searchOptions}
}

export const documentLicenseOptions = licenseOptions(true)
export const attributionLicenseOptions = licenseOptions(false)
