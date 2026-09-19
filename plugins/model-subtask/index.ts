import { Model, Plugin, Provider } from "@opencode/plugin"
import { Subtask, type RunInput } from "./rpc.ts"

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export default Plugin.define({
  id: "github.blank-agent.model-subtask",
  async setup(ctx) {
    const pending = new Map<string, ReturnType<typeof Model.Ref.make>>()

    await ctx.session.hook("prompt", async (event) => {
      if (pending.size === 0) return

      const child = await ctx.session.get({ sessionID: event.sessionID })
      if (!child.parentID) return

      const model = pending.get(child.parentID)
      if (!model) return

      await ctx.session.switchModel({ sessionID: child.id, model })
      pending.delete(child.parentID)
    })

    await ctx.rpc.register(Subtask, {
      run: async (input, call) => {
        const request = input as RunInput
        const model = Model.Ref.make({
          providerID: Provider.ID.make(request.model.providerID),
          id: Model.ID.make(request.model.id),
          ...(request.model.variant === undefined
            ? {}
            : { variant: Model.VariantID.make(request.model.variant) }),
        })

        if (pending.has(request.sessionID)) {
          return call.error("busy", "A subtask is already starting in this session", {})
        }

        pending.set(request.sessionID, model)
        try {
          await ctx.session.command({
            sessionID: request.sessionID,
            name: "subtask-child",
            text: request.text,
          })
        } catch (error) {
          pending.delete(request.sessionID)
          const message = errorMessage(error)
          return call.error("failed", message, { message })
        }

        return {}
      },
    })

    return () => pending.clear()
  },
})
