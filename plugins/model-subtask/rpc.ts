import { Rpc } from "@opencode/plugin"

export type ModelSelection = {
  readonly providerID: string
  readonly id: string
  readonly variant?: string
}

export type RunInput = {
  readonly sessionID: string
  readonly text: string
  readonly model: ModelSelection
}

export const Subtask = Rpc.define({
  id: "github.subagent",
  methods: {
    run: {
      input: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          text: { type: "string" },
          model: {
            type: "object",
            properties: {
              providerID: { type: "string" },
              id: { type: "string" },
              variant: { type: "string" },
            },
            required: ["providerID", "id"],
            additionalProperties: false,
          },
        },
        required: ["sessionID", "text", "model"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        additionalProperties: false,
      },
      errors: {
        busy: {
          type: "object",
          additionalProperties: false,
        },
        failed: {
          type: "object",
          properties: { message: { type: "string" } },
          required: ["message"],
          additionalProperties: false,
        },
      },
    },
  },
  events: {},
})
