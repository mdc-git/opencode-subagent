import { Plugin } from "@opencode/plugin"
import { Subtask, type RunInput } from "./rpc.ts"

type ToolEditor = Parameters<Parameters<Plugin.Context["tool"]["transform"]>[0]>[0]
type ToolDefinition = ReturnType<ToolEditor["get"]>

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function modelName(model: RunInput["model"]) {
  return `${model.providerID}/${model.id}${model.variant === undefined ? "" : `#${model.variant}`}`
}

export default Plugin.define({
  id: "github.subagent",
  async setup(ctx) {
    let subagent: ToolDefinition

    await ctx.tool.transform((editor) => {
      subagent = editor.get("subagent")
    })

    await ctx.rpc.register(Subtask, {
      run: async (input, call) => {
        const request = input as RunInput

        try {
          if (!subagent) throw new Error("OpenCode subagent tool is unavailable")

          const session = await ctx.session.get({ sessionID: request.sessionID })
          const messages = await ctx.session.context({ sessionID: request.sessionID })

          await subagent.execute(
            {
              agent: "general",
              description: "Selected model subtask",
              prompt: request.text,
              model: modelName(request.model),
              background: true,
            },
            {
              sessionID: request.sessionID,
              agent: session.agent ?? "build",
              messageID: messages.at(-1)?.id ?? request.sessionID,
              id: crypto.randomUUID(),
              progress: async () => {},
            } as Parameters<typeof subagent.execute>[1],
          )
        } catch (error) {
          const message = errorMessage(error)
          return call.error("failed", message, { message })
        }

        return {}
      },
    })
  },
})
