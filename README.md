# OpenCode Model Subtask

An OpenCode V2 plugin that lets you choose an available model before running a task in a native child session.

The parent session keeps its model. The child uses the selected model and reports its result through OpenCode's native
subagent lifecycle.

## Features

- `/subtask` opens a model picker using the models available at the current location.
- Supports model variants such as reasoning levels.
- Preserves the complete slash-command argument string as the child task.
- Uses the native `subagent: true` command lifecycle and report-back behavior.
- Provides separate deployed (`github.subagent`) and local-checkout (`local.subagent`) plugin identities.

## Requirements

- OpenCode V2.
- Bun for installation and development commands.
- An OpenCode provider with at least one available model.

## Global GitHub installation

Add the Git package and its native child command to the global OpenCode configuration at
`~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "opencode-subagent@git+https://github.com/<owner>/<repository>.git"
  ],
  "commands": {
    "subtask-child": {
      "description": "Run task in a native child session",
      "template": "$ARGUMENTS",
      "subagent": true
    }
  }
}
```

Replace `<owner>/<repository>` with the GitHub repository location. OpenCode installs and updates the plugin from Git;
the JSON command definition supplies the native child command globally without copying plugin source files.

Restart or reload OpenCode after changing the global configuration, then run:

```text
/subtask Explain the authentication flow and identify security risks.
```

## Local checkout

Install dependencies and run OpenCode from the repository root:

```sh
bun install
opencode --standalone
```

The local configuration loads the `.opencode/` wrappers, uses the `local.subagent` identities, and replaces the
deployed `github.subagent` plugin for this checkout.

`subtask-child` is an internal command. Do not invoke it directly; `/subtask` is the user-facing command.

## Usage

In a session, run:

```text
/subtask Explain the authentication flow and identify security risks.
```

Choose the model and variant when prompted. The selected task text is passed to the native child session unchanged.

## Development

Run the TypeScript check:

```sh
bun run check
```

Inspect the distributable package contents:

```sh
bun pm pack --dry-run
```

Production plugin entrypoints are under `plugins/model-subtask/`. The `.opencode/` directory contains local checkout
wrappers, configuration, and the Markdown form of the native child command. The packaged `commands/subtask-child.md`
resource matches the global JSON command definition.
