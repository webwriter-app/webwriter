---
order: 305.1
title: "Appearance"
---

# Appearance

All widgets should follow the appearance guidelines outlined in this document, which define components, colors and typography to be used in the widgets.

## Shoelace

All widgets are expected to use the [Shoelace](https://shoelace.style/) component library for their UI components.

Shoelace offers a set of professionally designed, pre-built UI components implemented as web components. This makes them easy to integrate with Lit or any other framework. For details on available components and design tokens, refer to the official [documentation](https://shoelace.style/).

## Colors

All widgets are expected to use the default [Shoelace color palette](https://shoelace.style/tokens/color), including the default primary color:

![Color palette](../../../../assets/color_palette.svg)

<details>
<summary>Primary color as CSS variables</summary>

```css
--primary-50: hsl(203 63.8% 20.9%);
--primary-100: hsl(203.4 70.4% 28%);
--primary-200: hsl(202.7 75.8% 30.8%);
--primary-300: hsl(203.1 80.4% 36.1%);
--primary-400: hsl(202.1 80.5% 44.3%);
--primary-500: hsl(199.7 85.9% 47.7%);
--primary-600: hsl(198.7 97.9% 57.2%);
--primary-700: hsl(198.7 100% 70.5%);
--primary-800: hsl(198.8 100% 82.5%);
--primary-900: hsl(198.5 100% 89.9%);
--primary-950: hsl(186 100% 95.5%);
```

</details>

## Typography

All widgets are expected to use the following font stacks, in accordance with the [Shoelace Typography Tokens](https://shoelace.style/tokens/typography).
They are designed to ensure a consistent look and feel across platforms while relying exclusively on system fonts.

**Do not import any additional fonts.** Doing so will unnecessarily increase the bundle size of your widget and any exported projects.

**Do not use serif fonts.** No serif font stack is provided as serif fonts should be avoided in the widget interface.

### Sans Serif

```
-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
Helvetica, Arial,sans-serif,
'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'
```

![Overview of different sans-serif fonts](../../../../assets/sans_serif_fonts.svg)

As you can see in the image above, the different system fonts vary in their width. Be sure to consider these differences when designing user interfaces.

### Monospace

```
SFMono-Regular, Consolas, ‘Liberation Mono’, Menlo, monospace
```
