import { Plugin } from "@opencode/plugin/tui"
import { Subtask, type ModelSelection } from "./rpc.ts"

type ModelOption = {
  readonly providerID: string
  readonly id: string
}

type Location = Parameters<Plugin.Context["data"]["location"]["model"]["sync"]>[0]
type Method = "run" | "handoff"

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
    context.ui.toast.show({ title: "Subagent", message: "No available models", variant: "warning" })
    return
  }

  const session = context.data.session.get(sessionID)
  const current = session?.model
  const selected = await context.ui.dialog.select<ModelOption>({
    title: "Select subagent model",
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

async function run(context: Plugin.Context, method: Method, input: string | undefined) {
  const route = context.ui.router.current()
  if (route.type !== "session") {
    context.ui.toast.show({ title: "Subagent", message: "Open a session before running a subagent", variant: "warning" })
    return
  }

  try {
    const session = context.data.session.get(route.sessionID)
    const location = session?.location ?? context.location ?? context.data.location.default()
    const model = await selectModel(context, route.sessionID, location)
    if (!model) return

    const request = { sessionID: route.sessionID, text: input ?? "", model }
    const rpc = context.client.rpc(Subtask)
    if (method === "handoff") await rpc.handoff(request, { location })
    else await rpc.run(request, { location })
  } catch (error) {
    context.ui.toast.show({ title: "Subagent failed", message: message(error), variant: "error" })
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
              title: "Run blank subagent",
              description: "Choose a model and run a fresh native subagent",
              group: "Agent",
              palette: true,
              slash: { name: "subagent:blank", arguments: true },
              run: (input) => run(context, "run", input),
            },
            {
              id: "subagent.handoff",
              title: "Run handoff subagent",
              description: "Choose a model and hand off task-scoped context to a native subagent",
              group: "Agent",
              palette: true,
              slash: { name: "subagent:handoff", arguments: true },
              run: (input) => run(context, "handoff", input),
            },
          ],
        }))
        return null
      },
    })
  },
})
