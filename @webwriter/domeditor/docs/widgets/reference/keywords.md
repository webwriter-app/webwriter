# A2. Widget keywords

Keywords give a widget feature badges. These badges show what the widget does, what it needs, and its purpose.

Add the keywords for your widget to the [`keywords` array](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#keywords) in `package.json`. The authoring tool and widget viewer show badges for selected keywords. They show a limitation badge when editability or an input method is missing from the package's keywords.

| Keyword | Meaning |
|---|---|
| `widget-editable` | Authors can edit the widget's content or behavior in the authoring tool. |
| `widget-allows-pointer-input` | The widget accepts pointer input. |
| `widget-allows-keyboard-input` | The widget accepts keyboard input. |
| `widget-allows-touch-input` | The widget accepts touch input. |
| `widget-has-content` | The widget accepts authored text, HTML elements, or nested widgets as content. |
| `widget-convertible-to-[media/type \| .extension \| <element-name>]` | The widget can convert its content to the specified media type, file extension, or HTML element. |
| `widget-convertible-from-[media/type \| .extension \| <element-name>]` | The widget supports creation or content import from the specified media type, file extension, or HTML element. |
| `widget-responsive` | The widget adjusts its layout to the available space. |
| `widget-themeable` | The widget uses the document theme or supplies styling hooks for a document stylesheet. |
| `widget-lang-[bcp47]` | The widget's content uses the language in the [BCP 47 language tag](https://developer.mozilla.org/en-US/docs/Glossary/BCP_47_language_tag). |
| `widget-printable` | The widget has a display suitable for printing. |
| `widget-stateful` | The widget keeps state such as saved settings, content, or interaction results. |
| `widget-configurable` | Authors can configure the widget through declared options or actions. |
| `widget-reactive` | The widget publishes signals, accepts effects, or both, so that it takes part in [reactive links](../guides/reactivity.md) with other widgets. Publishing alone is enough. |
| `widget-shareable` | The widget can share participant data with a group or with all participants. |
| `widget-distributable` | The widget supports distribution in a live session. |
| `widget-online`, `widget-online-edit`, `widget-online-use` | The widget needs a network connection for all operations, for editing, or for use, respectively. |
| `widget-supports-dynamic-loading` | The widget loads optional code or resources when necessary. |
| `widget-supports-shared-dependencies` | The widget supports dependencies shared with other widgets. |
| `widget-testable` | The package exports tests for the authoring tool's **Checks & Tests** tab. |
| `widget-migrates-from-[semver]` | The widget can migrate saved content from the specified version. |
| `webwriter-widget` | The package contains a widget that the catalog can find. |
| `widget-standalone` | The widget can operate on a web page outside the authoring tool. |
| `widget-presentational` | The widget's main purpose is presentation. |
| `widget-practical` | The widget's main purpose is a practical activity or application. |
| `widget-simulational` | The widget's main purpose is simulation. |
| `widget-conceptual` | The widget's main purpose is to help readers examine concepts. |
| `widget-informational` | The widget's main purpose is to give information. |
| `widget-contextual` | The widget's main purpose is to give context. |

## Values in keyword forms

Replace the text in brackets with a value. For example, use `widget-lang-en-US` for a language tag. Use `widget-migrates-from-1.2.0` for a version.

For `widget-convertible-to-…` and `widget-convertible-from-…`, use one of three forms. The form is the same as the keys of the [conversion maps](runtime.md#conversions).

| Form | Use it for | Examples |
|---|---|---|
| A [media type](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/MIME_types) | A file format that has a registered or widely used media type. | `widget-convertible-to-image/png`, `widget-convertible-from-audio/mpeg` |
| An extension with a leading dot | A file format without a registered media type, such as JFLAP, GIFT, PlantUML, Mermaid, or a source language. | `widget-convertible-to-.jff`, `widget-convertible-from-.puml`, `widget-convertible-from-.mmd` |
| An HTML element name without angle brackets | A conversion from or to an HTML element. This is the name of a native tag or of another widget. | `widget-convertible-to-video`, `widget-convertible-from-ww-quiz` |

An extension starts with a dot and then uses letters, digits, hyphens, and underscores. A longer extension such as `.tar.gz` can have more dots. Keywords are not case-sensitive. A tag name never has a leading dot and a media type always has a slash, so the three forms cannot be confused. Use the media type if the format has one. Do not use `application/octet-stream`, `text/plain`, or a related type as a stand-in for a format without a media type. Declare the same key in `convertFrom` or `convertTo`. A file format in the [editing configuration](editing-configuration.md) `importFormats` and `exportFormats` is a media type or an extension, never a tag.

The online forms are `widget-online`, `widget-online-edit`, and `widget-online-use`. The keywords `isced2011-<0–9>` and `iscedf2013-<code>` identify education levels and fields. [Package manifest](distribution.md#discovery-keywords) describes these discovery keywords. The [code lists](#isced-code-lists) are at the end of this page.

## Reactive widgets

`widget-reactive` marks a widget that takes part in reactive links in any role. Use it for each of these:

- A widget that only publishes. A color picker that exposes `signals = {color: computed(…)}` is reactive, although it never reads another widget.
- A widget that only accepts. A swatch with `static effects = {"color-from": {…}}` is reactive, although it publishes nothing.
- A widget that does both. A simulation that accepts a data source and publishes its current value.

Keep the keyword when a widget only publishes. Remove it only when the widget has no `signals` and no `effects`. The [reactivity guide](../guides/reactivity.md) describes both roles.

## What shows a badge

A keyword is a claim. The guidance CLI's `badges` command checks that the keywords are well formed. It cannot check that they are true. This table says what the package or widget must show for each badge.

| Keyword | Evidence |
|---|---|
| `widget-editable` | The widget changes its content or settings in edit mode, and the change reaches the document DOM. |
| `widget-allows-pointer-input`, `widget-allows-keyboard-input`, `widget-allows-touch-input` | The primary task is complete with that input method alone. |
| `widget-has-content` | The editing configuration has a content expression, or the widget renders authored children through a slot. |
| `widget-convertible-to-…`, `widget-convertible-from-…` | A key with the same media type, extension, or tag in `convertTo` or `convertFrom`, and a fixture that converts. |
| `widget-responsive` | Layout rules, such as container queries, that fit the widget between 300 and 2100 px. |
| `widget-themeable` | Colors and fonts come from `--ww-…` custom properties, or the widget exposes `part` names that a document stylesheet can style. |
| `widget-lang-…` | The widget's own texts or authored content exist in that language. |
| `widget-printable` | A print layout, such as `@media print` rules, or an explanation for paper. |
| `widget-stateful` | State is saved in attributes, authored children, or a data block, and survives saving and opening. |
| `widget-configurable` | The widget declares `options` or `actions`. |
| `widget-reactive` | The widget declares `signals`, `effects`, or both. |
| `widget-shareable` | The widget has `sharedData: true` in its editing configuration and reads and writes a scoped data block. |
| `widget-distributable` | The widget works in a live session, with distribution settings and participant data. |
| `widget-online`, `widget-online-edit`, `widget-online-use` | The widget requests network resources in the stated phase, and fails in a clear way without them. |
| `widget-supports-dynamic-loading` | The widget loads optional code with `import()` and declares the files in `static offlineImports`. |
| `widget-supports-shared-dependencies` | The package builds with `--shared-dependencies`, and its dependencies are bare imports that the import map resolves. |
| `widget-testable` | The `exports` field has `./tests/<name>.js` modules that report to **Checks & Tests**. |
| `widget-migrates-from-…` | A `./migrate.js` export that handles saved content of that version, with a fixture. |
| `webwriter-widget` | The `exports` field has a `./widgets/<tag>.js` export for each widget. |
| `widget-standalone` | The widget runs on a plain page, as [Standalone widgets](standalone.md) describes. |
| `widget-presentational`, `widget-practical`, `widget-simulational`, `widget-conceptual`, `widget-informational`, `widget-contextual` | Judgment: the purpose that matches the reader's main task. Choose one. |

## Check the keywords

Run the check from the package directory.

```sh
npx -y @webwriter/guidance badges ./package.json
```

The command prints the badges that the manifest declares. It reports each problem on standard error and sets the exit status to 1. It reports:

- a keyword that starts with `widget-` or `webwriter-` but is not a keyword of this page, such as a typo or a removed name;
- a keyword that needs a value and has none or an invalid one, such as `widget-lang-`, `widget-migrates-from-1.2`, or `widget-convertible-to-image/`;
- an `isced2011-…` keyword that is not a level from 0 to 9, and an `iscedf2013-…` keyword that is not in the [code list](#isced-code-lists).

Other keywords, such as `quiz` or `biology`, are free-form and pass.

## ISCED code lists

### Levels

Use `isced2011-<level>` with the digit of the level, such as `isced2011-6`. A keyword may add up to two digits for the ISCED 2011 category and orientation, such as `isced2011-344`. The badge shows only the level. Declare each level that the content serves.

| Code | Level |
|---|---|
| `0` | Early childhood education |
| `1` | Primary education |
| `2` | Lower secondary education |
| `3` | Upper secondary education |
| `4` | Post-secondary non-tertiary education |
| `5` | Short-cycle tertiary education |
| `6` | Bachelor's or equivalent level |
| `7` | Master's or equivalent level |
| `8` | Doctoral or equivalent level |
| `9` | Not elsewhere classified |

### Fields of education and training

Use `iscedf2013-<code>` with a code from this list, such as `iscedf2013-06` or `iscedf2013-0613`. A two-digit code is a broad field, a three-digit code is a narrow field, and a four-digit code is a detailed field. A narrower code names the content more exactly. The badge shows the broad field. Choose the narrowest field that describes what the widget teaches. Do not declare a broad field together with every narrow field in it. Declare the codes that apply, and use a broad field alone only when the widget serves several narrow fields. Use `00` for content that is not tied to a subject, such as basic skills. `99` means that the field is not known.

| Code | Field |
|---|---|
| `00` | **Generic programmes and qualifications** |
| `001` | *Basic programmes and qualifications* |
| `0011` | Basic programmes and qualifications |
| `002` | *Literacy and numeracy* |
| `0021` | Literacy and numeracy |
| `003` | *Personal skills and development* |
| `0031` | Personal skills and development |
| `01` | **Education** |
| `011` | *Education* |
| `0111` | Education science |
| `0112` | Training for pre-school teachers |
| `0113` | Teacher training without subject specialisation |
| `0114` | Teacher training with subject specialisation |
| `02` | **Arts and humanities** |
| `021` | *Arts* |
| `0211` | Audio-visual techniques and media production |
| `0212` | Fashion, interior and industrial design |
| `0213` | Fine arts |
| `0214` | Handicrafts |
| `0215` | Music and performing arts |
| `022` | *Humanities (except languages)* |
| `0221` | Religion and theology |
| `0222` | History and archaeology |
| `0223` | Philosophy and ethics |
| `023` | *Languages* |
| `0231` | Language acquisition |
| `0232` | Literature and linguistics |
| `03` | **Social sciences, journalism and information** |
| `031` | *Social and behavioural sciences* |
| `0311` | Economics |
| `0312` | Political sciences and civics |
| `0313` | Psychology |
| `0314` | Sociology and cultural studies |
| `032` | *Journalism and information* |
| `0321` | Journalism and reporting |
| `0322` | Library, information and archival studies |
| `04` | **Business, administration and law** |
| `041` | *Business and administration* |
| `0411` | Accounting and taxation |
| `0412` | Finance, banking and insurance |
| `0413` | Management and administration |
| `0414` | Marketing and advertising |
| `0415` | Secretarial and office work |
| `0416` | Wholesale and retail sales |
| `0417` | Work skills |
| `042` | *Law* |
| `0421` | Law |
| `05` | **Natural sciences, mathematics and statistics** |
| `051` | *Biological and related sciences* |
| `0511` | Biology |
| `0512` | Biochemistry |
| `052` | *Environment* |
| `0521` | Environmental sciences |
| `0522` | Natural environments and wildlife |
| `053` | *Physical sciences* |
| `0531` | Chemistry |
| `0532` | Earth sciences |
| `0533` | Physics |
| `054` | *Mathematics and statistics* |
| `0541` | Mathematics |
| `0542` | Statistics |
| `06` | **Information and Communication Technologies** |
| `061` | *Information and Communication Technologies* |
| `0611` | Computer use |
| `0612` | Database and network design and administration |
| `0613` | Software and applications development and analysis |
| `07` | **Engineering, manufacturing and construction** |
| `071` | *Engineering and engineering trades* |
| `0711` | Chemical engineering and processes |
| `0712` | Environmental protection technology |
| `0713` | Electricity and energy |
| `0714` | Electronics and automation |
| `0715` | Mechanics and metal trades |
| `0716` | Motor vehicles, ships and aircraft |
| `072` | *Manufacturing and processing* |
| `0721` | Food processing |
| `0722` | Materials (glass, paper, plastic and wood) |
| `0723` | Textiles (clothes, footwear and leather) |
| `0724` | Mining and extraction |
| `073` | *Architecture and construction* |
| `0731` | Architecture and town planning |
| `0732` | Building and civil engineering |
| `08` | **Agriculture, forestry, fisheries and veterinary** |
| `081` | *Agriculture* |
| `0811` | Crop and livestock production |
| `0812` | Horticulture |
| `082` | *Forestry* |
| `0821` | Forestry |
| `083` | *Fisheries* |
| `0831` | Fisheries |
| `084` | *Veterinary* |
| `0841` | Veterinary |
| `09` | **Health and welfare** |
| `091` | *Health* |
| `0911` | Dental studies |
| `0912` | Medicine |
| `0913` | Nursing and midwifery |
| `0914` | Medical diagnostic and treatment technology |
| `0915` | Therapy and rehabilitation |
| `0916` | Pharmacy |
| `0917` | Traditional and complementary medicine and therapy |
| `092` | *Welfare* |
| `0921` | Care of the elderly and of disabled adults |
| `0922` | Child care and youth services |
| `0923` | Social work and counselling |
| `10` | **Services** |
| `101` | *Personal services* |
| `1011` | Domestic services |
| `1012` | Hair and beauty services |
| `1013` | Hotel, restaurants and catering |
| `1014` | Sports |
| `1015` | Travel, tourism and leisure |
| `102` | *Hygiene and occupational health services* |
| `1021` | Community sanitation |
| `1022` | Occupational health and safety |
| `103` | *Security services* |
| `1031` | Military and defence |
| `1032` | Protection of persons and property |
| `104` | *Transport services* |
| `1041` | Transport services |
| `99` | **Not known or unspecified** |
| `999` | *Not known or unspecified* |
| `9999` | Not known or unspecified |
