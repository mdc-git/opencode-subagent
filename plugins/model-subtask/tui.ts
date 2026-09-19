import { Plugin } from "@opencode/plugin/tui"
import { Subtask, type ModelSelection } from "./rpc.ts"

type ModelOption = {
  readonly providerID: string
  readonly id: string
}

type Location = Parameters<Plugin.Context["data"]["location"]["model"]["sync"]>[0]

function message(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message
  }
  return error instanceof Error ? error.message : String(error)
}

async function selectModel(
  context: Plugin.Context,
  sessionID: string,
  location: Location,
): Promise<ModelSelection | undefined> {
  await context.data.location.model.sync(location)
  const available = (context.data.location.model.list(location) ?? []).filter(
    (model) => model.enabled && model.status !== "deprecated",
  )
  if (available.length === 0) {
    context.ui.toast.show({ title: "Subtask", message: "No available models", variant: "warning" })
    return
  }

  const session = context.data.session.get(sessionID)
  const current = session?.model
  const selected = await context.ui.dialog.select<ModelOption>({
    title: "Select subtask model",
    current: current ? { providerID: current.providerID, id: current.id } : undefined,
    options: [...available]
      .sort((a, b) => a.providerID.localeCompare(b.providerID) || a.name.localeCompare(b.name))
      .map((model) => ({
        title: model.name,
        value: { providerID: model.providerID, id: model.id },
        description: model.providerID,
        footer: `${model.providerID}/${model.id}`,
        category: model.providerID,
      })),
  })
  if (!selected) return

  const info = available.find((model) => model.providerID === selected.providerID && model.id === selected.id)
  if (!info || info.variants.length === 0) return selected

  const variant = await context.ui.dialog.select<string>({
    title: `Select variant for ${info.name}`,
    current: current?.providerID === selected.providerID && current.id === selected.id ? current.variant : undefined,
    options: [
      { title: "Default", value: "default" },
      ...info.variants.map((item) => ({ title: item.id, value: item.id })),
    ],
  })
  if (variant === undefined) return
  return {
    ...selected,
    ...(variant === "default" ? {} : { variant }),
  }
}

async function run(context: Plugin.Context, input: string | undefined) {
  const route = context.ui.router.current()
  if (route.type !== "session") {
    context.ui.toast.show({ title: "Subtask", message: "Open a session before running a subtask", variant: "warning" })
    return
  }

  try {
    const session = context.data.session.get(route.sessionID)
    const location = session?.location ?? context.location ?? context.data.location.default()
    const model = await selectModel(context, route.sessionID, location)
    if (!model) return

    await context.client.rpc(Subtask).run({ sessionID: route.sessionID, text: input ?? "", model }, { location })
  } catch (error) {
    context.ui.toast.show({ title: "Subtask failed", message: message(error), variant: "error" })
  }
}

export default Plugin.define({
  id: "github.subagent.tui",
  setup(context) {
    return context.ui.slot({
      append: "app",
      render() {
        context.keymap.layer(() => ({
          mode: "global",
          commands: [
            {
              id: "subagent.run",
              title: "Run subtask with model",
              description: "Choose a model and run a task in a native subagent",
              group: "Agent",
              palette: true,
              slash: { name: "subagent:blank", arguments: true },
              run: (input) => run(context, input),
            },
          ],
        }))
        return null
      },
    })
  },
})
