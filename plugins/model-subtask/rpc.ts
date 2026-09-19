import { Rpc } from "@opencode/plugin/rpc"
import { Model, Provider, Session } from "@opencode/schema"
import { z } from "zod"

const ModelSelectionSchema = z
  .object({
    providerID: z.string().transform((value) => Provider.ID.make(value)),
    id: z.string().transform((value) => Model.ID.make(value)),
    variant: z.string().transform((value) => Model.VariantID.make(value)).optional(),
  })
  .strict()

const RunInputSchema = z
  .object({
    sessionID: z.string().startsWith("ses").transform((value) => Session.ID.make(value)),
    text: z.string(),
    model: ModelSelectionSchema,
  })
  .strict()

export type ModelSelection = z.input<typeof ModelSelectionSchema>
export type RunInput = z.output<typeof RunInputSchema>

const method = {
  input: RunInputSchema,
  output: z.object({}).strict(),
  errors: {
    failed: z.object({ message: z.string() }).strict(),
  },
}

export const Subtask = Rpc.define({
  id: "github.subagent",
  methods: {
    run: method,
    handoff: method,
  },
  events: {},
})
