import { Agent, Plugin } from '@opencode/plugin'
import type { PermissionEvaluation } from '@opencode/plugin/promise/permission'
import type { RpcCallContext } from '@opencode/plugin/promise/rpc'
import { CallID, type ToolContext } from '@opencode/plugin/promise/tool'
import { SessionMessage } from '@opencode/schema'
import type { Model } from '@opencode/schema/model'
import { subtask, type RunInput } from './rpc.ts'

const sessionIdKey = 'sessionID' as const
const messageIdKey = 'messageID' as const

type Runtime = {
  readonly ctx: Plugin.Context
  readonly permitted: Map<string, string>
}

type SpawnInput = Runtime & {
  readonly request: RunInput
  readonly prompt: string
  readonly description: string
  readonly signal: AbortSignal
}

type RpcCall = RpcCallContext<(typeof subtask)['methods']['run']>

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function modelName(model: Model.Ref) {
  return `${model.providerID}/${model.id}${model.variant === undefined ? '' : `#${model.variant}`}`
}

function handoffRequest(text: string) {
  return [
    'Prepare a concise, task-scoped handoff context for a general subagent that will handle the request below.',
    '',
    'The plugin will include the original request verbatim separately. Do not repeat or rewrite it.',
    '',
    'Include only what is needed to continue:',
    '- Current objective',
    '- Key requirements and decisions',
    '- Work already completed',
    '- Relevant files, symbols, line numbers, commands, errors, or references',
    '- Remaining work and the immediate next step',
    '',
    'Exclude unrelated discussion, repetition, generic advice, and obsolete context.',
    'Prefer precise references such as src/foo.ts:120-145.',
    '',
    'Do not solve the request and do not spawn a subagent.',
    'Return only the handoff context.',
    '',
    'Original request:',
    text
  ].join('\n')
}

function handoffPrompt(text: string, context: string) {
  return [
    'Original user request:',
    '',
    text,
    '',
    'Task-scoped context from the parent session:',
    '',
    context
  ].join('\n')
}

function isSubagentAsk(event: PermissionEvaluation) {
  return event.action === 'subagent' && event.effect === 'ask'
}

function toolSourceId(event: PermissionEvaluation) {
  return event.source?.type === 'tool' ? event.source.id : undefined
}

async function findSubagent(ctx: Plugin.Context) {
  const tools = await ctx.tool.list()
  const subagent = tools.find((tool) => tool.id === 'subagent')
  if (subagent === undefined) {
    throw new Error('OpenCode native subagent tool is unavailable')
  }

  return subagent
}

function allowSubagent(event: PermissionEvaluation, permitted: ReadonlyMap<string, string>) {
  if (!isSubagentAsk(event)) {
    return
  }

  const id = toolSourceId(event)
  if (id === undefined) {
    return
  }

  if (permitted.get(id) !== event.sessionID) {
    return
  }

  event.effect = 'allow'
}

async function spawn(input: SpawnInput) {
  const { ctx, permitted, request, prompt, description, signal } = input
  signal.throwIfAborted()

  const session = await ctx.session.get({ [sessionIdKey]: request.sessionID }, { signal })
  let { agent } = session
  if (agent === undefined) {
    const agents = await ctx.agent.list(undefined, { signal })
    agent = agents.data[0].id
  }

  signal.throwIfAborted()
  const subagent = await findSubagent(ctx)
  const id = crypto.randomUUID()

  permitted.set(id, request.sessionID)
  try {
    signal.throwIfAborted()
    await subagent.execute(
      {
        agent: 'general',
        description,
        prompt,
        model: modelName(request.model),
        background: true
      },
      {
        [sessionIdKey]: request.sessionID,
        agent: Agent.ID.make(agent),
        [messageIdKey]: SessionMessage.ID.create(),
        id: CallID.make(id),
        async progress() {
          await Promise.resolve()
        }
      } satisfies ToolContext
    )
  } finally {
    permitted.delete(id)
  }
}

async function failure(call: RpcCall, error: unknown) {
  call.signal.throwIfAborted()
  const message = errorMessage(error)
  return call.error('failed', message, { message })
}

async function runSubagent(runtime: Runtime, input: RunInput, call: RpcCall) {
  try {
    await spawn({
      ...runtime,
      request: input,
      prompt: input.text,
      description: 'Selected model subagent',
      signal: call.signal
    })
  } catch (error) {
    return failure(call, error)
  }

  return {}
}

async function handoffSubagent(runtime: Runtime, input: RunInput, call: RpcCall) {
  try {
    call.signal.throwIfAborted()
    const generated = await runtime.ctx.session.generate(
      {
        [sessionIdKey]: input.sessionID,
        prompt: handoffRequest(input.text)
      },
      { signal: call.signal }
    )
    call.signal.throwIfAborted()
    await spawn({
      ...runtime,
      request: input,
      prompt: handoffPrompt(input.text, generated.text),
      description: 'Selected model handoff',
      signal: call.signal
    })
  } catch (error) {
    return failure(call, error)
  }

  return {}
}

async function register(runtime: Runtime) {
  await runtime.ctx.rpc.register(subtask, {
    async run(input, call) {
      return runSubagent(runtime, input, call)
    },
    async handoff(input, call) {
      return handoffSubagent(runtime, input, call)
    }
  })
}

export default Plugin.define({
  id: 'github.subagent',
  async setup(ctx) {
    const permitted = new Map<string, string>()

    await ctx.permission.hook('evaluate', (event) => {
      allowSubagent(event, permitted)
    })
    await register({ ctx, permitted })
  }
})
