function adoptStyles(root, css) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  root.adoptedStyleSheets = [sheet, ...root.adoptedStyleSheets];
  const remove = () => {
    root.adoptedStyleSheets = root.adoptedStyleSheets.filter((other) => other !== sheet);
  };
  return Object.assign(remove, { sheet });
}
export {
  adoptStyles
};
