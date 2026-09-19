import { Rpc } from '@opencode/plugin/rpc'
import { Model, Provider, Session } from '@opencode/schema'
import { z } from 'zod'

const providerIdKey = 'providerID' as const
const sessionIdKey = 'sessionID' as const

const modelSelectionSchema = z
  .object({
    [providerIdKey]: z.string().transform((value) => Provider.ID.make(value)),
    id: z.string().transform((value) => Model.ID.make(value)),
    variant: z
      .string()
      .transform((value) => Model.VariantID.make(value))
      .optional()
  })
  .strict()

const runInputSchema = z
  .object({
    [sessionIdKey]: z
      .string()
      .startsWith('ses')
      .transform((value) => Session.ID.make(value)),
    text: z.string(),
    model: modelSelectionSchema
  })
  .strict()

export type ModelSelection = z.input<typeof modelSelectionSchema>
export type RunInput = z.output<typeof runInputSchema>

const method = {
  input: runInputSchema,
  output: z.object({}).strict(),
  errors: {
    failed: z.object({ message: z.string() }).strict()
  }
}

const subtask = Rpc.define({
  id: 'github.subagent',
  methods: {
    run: method,
    handoff: method
  },
  events: {}
})

export { subtask, subtask as Subtask }
