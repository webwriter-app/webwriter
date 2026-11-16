var km_default = {
  picked: (item) => `បានលើក ${item}។ ប្រើគ្រាប់ចុចព្រួញដើម្បីជ្រើសរើសទីតាំង ចុច Enter ដើម្បីទម្លាក់ ចុច Esc ដើម្បីបោះបង់។`,
  pickedLink: (item) => `កំពុងភ្ជាប់ ${item}។ ប្រើគ្រាប់ចុចព្រួញដើម្បីជ្រើសរើសគោលដៅដែលត្រូវភ្ជាប់ ចុច Enter ដើម្បីភ្ជាប់ ចុច Esc ដើម្បីបោះបង់។`,
  selected: (item) => `បានជ្រើសរើស ${item}។ ចុចកន្លែងដែលចង់ដាក់ ឬចុចម្ដងទៀតដើម្បីបោះបង់។`,
  nextTarget: "ចុច Tab ដើម្បីទៅគោលដៅបន្ទាប់។",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}ទីតាំងទី ${position.index} ក្នុងចំណោម ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}ពីឆ្វេង ${x} ពីលើ ${y}`,
  dropped: (item, target) => target ? `បានទម្លាក់ ${item} លើ ${target}។` : `បានទម្លាក់ ${item}។`,
  copied: (item, target) => target ? `បានបន្ថែម ${item} ទៅ ${target}។` : `បានបន្ថែម ${item}។`,
  linked: (item, target) => `បានភ្ជាប់ ${item} ទៅ ${target}។`,
  cancelled: () => "បានបោះបង់។",
  notAllowed: "បានបោះបង់។ មិនអនុញ្ញាតឱ្យធ្វើបែបនេះនៅទីនេះទៀតទេ។"
};
export {
  km_default as default
};
