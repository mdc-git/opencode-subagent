# OpenCode Model Subtask

An OpenCode V2 plugin that lets you choose an available model before running a task in a native child session.

The parent session keeps its model. The child runs as OpenCode's native `general` subagent with the selected model and
reports its result through OpenCode's native subagent lifecycle.

## Features

- `/subagent:blank` opens a model picker using the models available at the current location.
- Supports model variants such as reasoning levels.
- Preserves the complete slash-command argument string as the child task.
- Uses OpenCode's built-in `subagent` tool for child creation, permissions, background execution, and report-back.
- Automatically allows `ask` permission checks for the exact subagent call initiated by `/subagent:blank`.
- Respects an explicit `deny` for the `subagent` permission.
- Provides separate deployed (`github.subagent`) and local-checkout (`local.subagent`) plugin identities.

## Requirements

- OpenCode V2.
- Bun for installation and development commands.
- An OpenCode provider with at least one available model.

## Global GitHub installation

Add the Git package to the global OpenCode configuration at `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "opencode-subagent@git+https://github.com/mdc-git/opencode-subagent.git"
  ]
}
```

OpenCode loads the package's server and TUI entrypoints together.

Run:

```text
/subagent:blank Explain the authentication flow and identify security risks.
```

## Local checkout

Install dependencies and run OpenCode from the repository root:

```sh
bun install
opencode --standalone
```

The project configuration disables the deployed server plugin and loads the local server source from `.opencode/`.
The local server source advertises `.opencode/tui.ts`, so the connected TUI uses the corresponding local wrapper.

## Usage

In a session, run:

```text
/subagent:blank Explain the authentication flow and identify security risks.
```

Choose the model and variant when prompted. The complete slash-command argument string is sent to a fresh native
`general` subagent using the selected model. The parent session's model is unchanged.

Permission checks initiated by this slash command are auto-approved only when OpenCode evaluates them as `ask`.
An explicit `deny` remains authoritative.

## Development

Run the TypeScript check:

```sh
bun run check
```

Inspect the distributable package contents:

```sh
bun pm pack --dry-run
```

Production plugin entrypoints are under `plugins/model-subtask/`. The `.opencode/` directory contains only local
checkout configuration and identity wrappers.
