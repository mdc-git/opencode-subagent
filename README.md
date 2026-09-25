# OpenCode Model Subagent

An OpenCode V2 plugin for running selected-model native child sessions with either fresh or task-scoped parent context.

The parent session keeps its model. Child sessions run as OpenCode's native `general` subagent with the selected model
and report results through OpenCode's native subagent lifecycle.

## Features

- `/subagent:blank` opens a model picker and sends only the supplied request to a fresh child session.
- `/subagent:handoff` opens the same model picker, asks the main session model to generate concise task-scoped context,
  then sends the original request verbatim plus that context to a fresh child session.
- Supports model variants such as reasoning levels.
- Preserves the complete slash-command argument string as the original child request.
- Uses OpenCode's built-in `subagent` tool for child creation, permissions, background execution, and report-back.
- Adds the native background-start result to hidden parent-session context so the main agent knows the subagent is running.
- Automatically allows `ask` permission checks for the exact subagent call initiated by either slash command.
- Respects an explicit `deny` for the `subagent` permission.
- Provides separate deployed (`mdc-git.subagent`) and local-checkout (`local.subagent`) plugin identities.

## Requirements

- OpenCode V2.
- Node.js 24 or newer.
- Bun for installation and development commands.
- An OpenCode provider with at least one available model.

## Global GitHub installation

Add the Git package, pinned to tag `0.0.1`, to the global OpenCode
configuration at `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-subagent@git+https://github.com/mdc-git/opencode-subagent.git#0.0.1"]
}
```

OpenCode loads the package's server and TUI entrypoints together.

## Usage

Run a child with no parent-session handoff:

```text
/subagent:blank Explain the authentication flow and identify security risks.
```

Run a child with task-scoped context from the current main session:

```text
/subagent:handoff Continue the authentication refactor and finish the remaining tests.
```

For `/subagent:handoff`, the main session model generates the handoff with the current conversation as context without
adding that generation to session history. The generated context contains the current objective, key requirements and
decisions, completed work, precise references, remaining work, and immediate next step. The plugin separately inserts
the original slash-command argument verbatim, so the handoff model does not need to reproduce it.

The selected model is used only by the child. The parent session's model is unchanged.

Permission checks initiated by either slash command are auto-approved only when OpenCode evaluates them as `ask`.
An explicit `deny` remains authoritative.

## Local checkout

Install dependencies and run OpenCode from the repository root:

```sh
bun install
opencode --standalone
```

The project configuration disables the deployed server and TUI plugin identities and loads the local server source from
`.opencode/`.
The local server source advertises `.opencode/tui.ts`, so the connected TUI uses the corresponding local wrapper.

## Development

Install dependencies:

```sh
bun install --frozen-lockfile
```

Run repository checks:

```sh
bun run check
```

Apply supported fixes and rerun validation:

```sh
bun run fix
```

Inspect the distributable package contents:

```sh
bun pm pack --dry-run
```

Production plugin entrypoints are under `plugins/subagent/`. The `.opencode/` directory contains only local
checkout configuration and identity wrappers.
