var or_default = {
  picked: (item) => `${item} ଉଠାଯାଇଛି। ସ୍ଥାନ ବାଛିବାକୁ ତୀର କି, ଛାଡ଼ିବାକୁ Enter ଏବଂ ବାତିଲ କରିବାକୁ Escape ଦବାନ୍ତୁ।`,
  pickedLink: (item) => `${item} ଯୋଡ଼ାଯାଉଛି। କାହା ସହ ଯୋଡ଼ିବେ ତାହା ବାଛିବାକୁ ତୀର କି, ଯୋଡ଼ିବାକୁ Enter ଏବଂ ବାତିଲ କରିବାକୁ Escape ଦବାନ୍ତୁ।`,
  selected: (item) => `${item} ବଛାଯାଇଛି। ଯେଉଁଠି ରଖିବେ ସେଠାରେ କ୍ଲିକ୍ କରନ୍ତୁ, କିମ୍ବା ବାତିଲ କରିବାକୁ ଏହା ଉପରେ ପୁଣି କ୍ଲିକ୍ କରନ୍ତୁ।`,
  nextTarget: "Tab ଦବାଇଲେ ପରବର୍ତ୍ତୀ ଲକ୍ଷ୍ୟକୁ ଯାଏ।",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}${position.count} ମଧ୍ୟରୁ ସ୍ଥାନ ${position.index}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}ବାମରୁ ${x}, ଉପରୁ ${y}`,
  dropped: (item, target) => target ? `${item} ଛଡ଼ାଯାଇଛି: ${target}।` : `${item} ଛଡ଼ାଯାଇଛି।`,
  copied: (item, target) => target ? `${item} ଯୋଡ଼ାଯାଇଛି: ${target}।` : `${item} ଯୋଡ଼ାଯାଇଛି।`,
  linked: (item, target) => `${item} ଏବଂ ${target} ଯୋଡ଼ାଯାଇଛି।`,
  cancelled: () => "ବାତିଲ କରାଯାଇଛି।",
  notAllowed: "ବାତିଲ କରାଯାଇଛି। ଏଠାରେ ଏହା ଆଉ ଅନୁମୋଦିତ ନୁହେଁ।"
};
export {
  or_default as default
};
