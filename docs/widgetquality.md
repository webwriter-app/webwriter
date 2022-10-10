---
order: 6
---
# Explainer: Widget Quality

## Introduction
As outlined in the [guide for creating widgets](./creatingwidgets.md), a widget can support many different attributes from the Widget Interface. Ideally, as many of these attributes as possible are supported. As such, this level of attribute coverage is an important measure of widget quality and can guide authors when picking widgets to install. Another measure is performance, considering both time requirements (loading time) and space requirements (bundle size). Finally, widget quality does not only from hard criteria like attribute coverage and performance, but also from soft criteria that depend on the value the widget provides to the authors and learners.

## Attribute Coverage
The table below lists all core attributes that a widget can support. Most are actual attributes on the web component (those ending in `able`), but some (`stateful`, `documented`) are more general criteria.

| Attribute | Package Keyword | Requirements |
|-----------|-----------------|--------------|
💾 | `stateful` | Widget has one or more attributes that store widget state
✏️ | `editable` | When editable=true, allow user interaction to modify the widget. When editable=false, prevent user interaction modifying the widget.
🔍 | `analyzable` | When analyzable=true, emit DOM events enriched with xAPI statements.
📄 | `printable` | When printable=true, render content so that it can be printed on paper.
☀️ | `offlineable` | When offlineable=true, stay usable even if the user is offline.
📖 | `documented` | Provides a user manual in Markdown format.

## Performance
*Work in Progress*: The table lists some metrics by which the performance of a widget can be measured.

| Performance Metric | Description |
|--------------------|-------------|
| 📦 BBS            | Baseline Bundle Size: Minimum size of HTML fragment output
| ⚡ LS             | Lighthouse Score: Loading performance of widget
| 🐏 RAM            | RAM Usage: Absolute increase of RAM/SWAP storage used under load
| ⚙️ CPU            | CPU Usage: Absolute increase of CPU/GPU used under load

## Value
*Work in Progress*:
- Usability
- Usefulness for education as evaluated by experts