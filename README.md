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

## Local checkout

Install dependencies and run OpenCode from the repository root:

```sh
bun install
opencode --standalone
```

The local configuration loads the `.opencode/` wrappers, uses the `local.subagent` identities, and replaces the
deployed `github.subagent` plugin for this checkout.

## Global deployment

From the repository root, install the production entrypoints into the global plugin directory and install the native
child command into OpenCode's global command directory:

```sh
plugin_dir="$HOME/.config/opencode/plugins/model-subtask"

mkdir -p "$plugin_dir" "$HOME/.config/opencode/commands"

cp plugins/model-subtask/index.ts \
   plugins/model-subtask/rpc.ts \
   plugins/model-subtask/tui.ts \
   plugins/model-subtask/package.json \
   "$plugin_dir/"

bun install --cwd "$plugin_dir"

cp commands/subtask-child.md \
   "$HOME/.config/opencode/commands/subtask-child.md"
```

Reload or reopen OpenCode after deployment.

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
wrappers and configuration. The packaged `commands/subtask-child.md` resource supplies the native child command used by
the server plugin.
