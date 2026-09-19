import { Plugin } from "@opencode/plugin"
import { Subtask, type RunInput } from "./rpc.ts"

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function modelName(model: RunInput["model"]) {
  return `${model.providerID}/${model.id}${model.variant === undefined ? "" : `#${model.variant}`}`
}

export default Plugin.define({
  id: "github.subagent",
  async setup(ctx) {
    await ctx.rpc.register(Subtask, {
      run: async (input, call) => {
        const request = input as RunInput

        try {
          const session = await ctx.session.get({ sessionID: request.sessionID })
          const agents = await ctx.agent.list()
          const messages = await ctx.session.context({ sessionID: request.sessionID })
          const subagent = (await ctx.tool.list()).find((tool) => tool.id === "subagent")!

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
              agent: session.agent ?? agents.data[0]!.id,
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
