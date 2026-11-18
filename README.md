# WebWriter

**Make it interactive.**

Bring text, media, formulas, and interactive widgets together. Make learning materials that invite people to take part.

[Open WebWriter](https://webwriter.app/editor/) · [Explore the widgets](https://webwriter.app/packages/) · [Browse examples](https://webwriter.app/examples/)

Free and open source, no registration.

## From an idea to an experience

### Compose your materials

Combine writing, images, video, tables, and mathematical notation in a single document. Work alone or together.

### Make room for interaction

Add widgets that turn a lesson into something learners can explore, answer, and experiment with.

### Learn together

Use live sessions to have learners participate and observe their progress in real time.

## All tools in one

- **Document:** Bring writing, media, and interactive activities together on a flowing page.
- **Canvas:** Arrange ideas, images, and widgets freely on an open canvas.
- **Slides:** Guide learners through a presentation with interactive content on every slide.
- **Board:** Collect and organize contributions as cards in columns for everyone to explore.

## More than multiple choice

Explore a growing collection of widgets for science, mathematics, languages, history, and more. Bring different subjects to life with simulations, maps, coding, timelines, and creative tools.

[Explore the widgets](https://webwriter.app/packages/)

## Bring your own ideas to the page

Build with web components and your preferred library. Start with a hello widget, then follow the quiz tutorial through rendering, state, and collaboration.

[Build your first widget](https://webwriter.app/docs/) or read the [widget documentation in this repository](@webwriter/domeditor/docs/widgets/index.md).

## Research background

WebWriter was first developed as a research project for the [dissertation](https://publications.rwth-aachen.de/record/1033892) of [Dr.-Ing. Frederic Salmen](https://learntech.rwth-aachen.de/cms/learntech/Das-Lehr-und-Forschungsgebiet/Mitarbeiter/Wissenschaftliche-Mitarbeiterinnen-und-M/~sezpi/Frederic-Salmen/lidx/1/). The project was conducted at the research group for [Learning Technologies at RWTH Aachen University](https://learntech.rwth-aachen.de/), led by [Prof. Ulrik Schroeder](https://learntech.rwth-aachen.de/cms/learntech/Das-Lehr-und-Forschungsgebiet/Mitarbeiter/Institutsleitung/~jxqe/Ulrik-Schroeder/lidx/1/).

## Contributing

Help improve WebWriter by [reporting bugs or suggesting features](https://github.com/webwriter-app/webwriter/issues), improving documentation, building widgets, or contributing code. For bug reports, include reproduction steps, your browser and operating system, and screenshots or recordings when useful.

### Run WebWriter locally

Use an up-to-date **Node.js 22** release and **Bun**. Install dependencies from the repository root, then start the editor from its package directory:

```sh
git clone https://github.com/webwriter-app/webwriter.git
cd webwriter
bun install --frozen-lockfile
cd @webwriter/domeditor
npm start
```

Open [the landing page](http://127.0.0.1:1234/), [the editor](http://127.0.0.1:1234/editor/index.html), or [the widget documentation](http://127.0.0.1:1234/docs/).

The development server has no authentication and stays bound to loopback. For testing on an iPad, follow the separate [iPad development guide](@webwriter/domeditor/dev-server/ISH-TESTING.md). For a trusted tester group, use the documented [VPN-only private-testing deployment](@webwriter/domeditor/dev-server/PRIVATE-TESTING.md).

### Make and check a change

Read the [DOM Editor contributor instructions](@webwriter/domeditor/AGENTS.md) before changing the editor. Its live HTML DOM is the document state; preserve authored content and keep editor controls in the shadow appendix.

Keep pull requests focused, explain the resulting behavior, and describe how you checked it. Add or update the nearest test for behavior changes. From `@webwriter/domeditor`, run the relevant test file, for example:

```sh
npx vitest run src/features/media-capture.test.ts
```

Run `npm run typecheck` and `npm run build` when needed for the change. Use the full test suite only when the affected behavior cannot be covered by focused tests. Visually check UI changes in a real browser; see the [native browser checks](@webwriter/domeditor/tests/native-browser.md).

The [DOM Editor development guide](@webwriter/domeditor/README.md) covers the local backend, builds, packages, collaboration scenarios, and deployment. Keep `.webwriter-dev/`, local environment files, and credentials out of commits.
