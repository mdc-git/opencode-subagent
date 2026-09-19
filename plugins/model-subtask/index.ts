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

function handoffRequest(text: string) {
  return [
    "Prepare a concise, task-scoped handoff context for a general subagent that will handle the request below.",
    "",
    "The plugin will include the original request verbatim separately. Do not repeat or rewrite it.",
    "",
    "Include only what is needed to continue:",
    "- Current objective",
    "- Key requirements and decisions",
    "- Work already completed",
    "- Relevant files, symbols, line numbers, commands, errors, or references",
    "- Remaining work and the immediate next step",
    "",
    "Exclude unrelated discussion, repetition, generic advice, and obsolete context.",
    "Prefer precise references such as src/foo.ts:120-145.",
    "",
    "Do not solve the request and do not spawn a subagent.",
    "Return only the handoff context.",
    "",
    "Original request:",
    text,
  ].join("\n")
}

function handoffPrompt(text: string, context: string) {
  return [
    "Original user request:",
    "",
    text,
    "",
    "Task-scoped context from the parent session:",
    "",
    context,
  ].join("\n")
}

export default Plugin.define({
  id: "github.subagent",
  async setup(ctx) {
    let subagent: ToolDefinition
    const permitted = new Map<string, string>()

    await ctx.tool.transform((editor) => {
      subagent = editor.get("subagent")
    })

    await ctx.permission.hook("evaluate", (event) => {
      if (event.action !== "subagent" || event.effect !== "ask" || event.source?.type !== "tool") return
      if (permitted.get(event.source.id) !== event.sessionID) return
      event.effect = "allow"
    })

    async function spawn(request: RunInput, prompt: string, description: string) {
      if (!subagent) throw new Error("OpenCode subagent tool is unavailable")

      const [session, messages] = await Promise.all([
        ctx.session.get({ sessionID: request.sessionID }),
        ctx.session.context({ sessionID: request.sessionID }),
      ])
      const id = crypto.randomUUID()

      permitted.set(id, request.sessionID)
      try {
        await subagent.execute(
          {
            agent: "general",
            description,
            prompt,
            model: modelName(request.model),
            background: true,
          },
          {
            sessionID: request.sessionID,
            agent: session.agent ?? "build",
            messageID: messages.at(-1)?.id ?? request.sessionID,
            id,
            progress: async () => {},
          } as Parameters<typeof subagent.execute>[1],
        )
      } finally {
        permitted.delete(id)
      }
    }

    await ctx.rpc.register(Subtask, {
      run: async (input, call) => {
        const request = input as RunInput

        try {
          await spawn(request, request.text, "Selected model subagent")
        } catch (error) {
          const message = errorMessage(error)
          return call.error("failed", message, { message })
        }

        return {}
      },
      handoff: async (input, call) => {
        const request = input as RunInput

        try {
          const generated = await ctx.session.generate({
            sessionID: request.sessionID,
            prompt: handoffRequest(request.text),
          })
          await spawn(request, handoffPrompt(request.text, generated.text), "Selected model handoff")
        } catch (error) {
          const message = errorMessage(error)
          return call.error("failed", message, { message })
        }

        return {}
      },
    })
  },
})
