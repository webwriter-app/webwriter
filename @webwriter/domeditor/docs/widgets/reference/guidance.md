# C3. @webwriter/guidance

> [!NPM]
>
> [View `@webwriter/guidance` on npm](https://www.npmjs.com/package/@webwriter/guidance)

`@webwriter/guidance` provides the `webwriter-guidance` CLI and an Agent Skill for developing WebWriter widgets. Use Node.js 22.20 or newer.

## Install the skill

Run the installer from your widget project. Choose a coding agent when prompted, or pass agent names directly.

```sh
npx -y @webwriter/guidance@latest install
npx -y @webwriter/guidance@latest install --agent codex claude-code cursor --yes
```

The installer uses the same [Vercel Skills CLI](https://github.com/vercel-labs/skills/blob/main/docs/commands.md#skills-add) as Modern Web Guidance. It supports [Codex, Claude Code, Cursor, Gemini CLI, GitHub Copilot, and other agents](https://github.com/vercel-labs/skills/blob/main/docs/agents.md). Pass `--global` for a user-wide installation. Run `install` again with the latest package to refresh the skill, or run `uninstall` with the same scope and agent options to remove it.

## Query the documentation

```sh
npx -y @webwriter/guidance search "widget package exports"
npx -y @webwriter/guidance retrieve "reference/distribution,guides/publishing"
npx -y @webwriter/guidance list
```

| Command | Output |
| --- | --- |
| `search <query>` | Up to five ranked results with `id` and `description` fields. Use one topic or API name per query. |
| `retrieve <id[,id...]>` | Full Markdown for the named pages. The CLI prints a temporary file path for large results. |
| `list` | All searchable page IDs and descriptions. |
| `badges [package.json]` | Widget badge keywords and their guide IDs. Pass a manifest path to look up its declared badges. |

The npm package bundles a snapshot of the widget guides, tutorials, and reference pages. Once the package is installed, document lookup works offline. From the WebWriter repository root, use `node @webwriter/guidance/cli.mjs` with the same commands to query the current checkout.

## Rework an existing widget

Ask your coding agent to rework the widget using the WebWriter Guidance skill. The agent uses the declared [widget keywords](keywords.md) and the affected capabilities to check the widget against the guides. It asks you to decide open design questions and continues fixes that can be verified independently.
