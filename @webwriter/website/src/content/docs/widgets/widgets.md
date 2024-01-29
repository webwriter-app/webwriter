---
order: 300
title: Widgets
---


# Widgets
Widgets are interactive multimedia elements that can be part of an explorable. They can developed using web technologies and published as packages.

## Technical View
Widgets are simply HTML elements, implementing the same APIs (`HTMLElement`). New HTML elements can be defined as Web Components. This means a widget can support any and every web technology capable of running in the browser. That includes [standard web APIs](https://developer.mozilla.org/en-US/docs/Web/API), [JS packages/modules for the browser](https://www.npmjs.com/), and so on.
As each widget comes in a [Package](../packages/packages) that is loaded and bundled with `esbuild` when an explorable is saved, a [wide set of assets is supported](./assets).

## Author/User View
To authors, widgets are part of a broad palette to create an explorable. They may use the different rich text elements provided by WebWriter and mix them with other available snippets, which can include widgets. To users, widgets are just parts of the explorable they are viewing.