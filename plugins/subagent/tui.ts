import { Plugin } from '@opencode/plugin/tui'
import { subtask, type ModelSelection } from './rpc.ts'

const providerIdKey = 'providerID' as const
const sessionIdKey = 'sessionID' as const

type ModelOption = {
  readonly providerID: string
  readonly id: string
}

type Location = Parameters<Plugin.Context['data']['location']['model']['sync']>[0]
type Method = 'run' | 'handoff'
type ModelInfo = NonNullable<
  ReturnType<Plugin.Context['data']['location']['model']['list']>
>[number]
type SessionModel = NonNullable<ReturnType<Plugin.Context['data']['session']['get']>>['model']
type Request = {
  readonly [sessionIdKey]: string
  readonly text: string
  readonly model: ModelSelection
}
type ErrorWithMessage = { readonly message: string }

function hasMessage(error: unknown): error is ErrorWithMessage {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  )
}

function message(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (hasMessage(error)) {
    return error.message
  }

  return String(error)
}

function modelOptions(available: readonly ModelInfo[]) {
  return available.toSorted(compareModels).map((model) => ({
    title: model.name,
    value: { [providerIdKey]: model.providerID, id: model.id },
    description: model.providerID,
    footer: `${model.providerID}/${model.id}`,
    category: model.providerID
  }))
}

function compareModels(a: ModelInfo, b: ModelInfo) {
  const providers = a.providerID.localeCompare(b.providerID)
  if (providers !== 0) {
    return providers
  }

  return a.name.localeCompare(b.name)
}

function currentOption(current: SessionModel): ModelOption | undefined {
  if (current === undefined) {
    return
  }

  return { [providerIdKey]: current.providerID, id: current.id }
}

function currentVariant(current: SessionModel, selected: ModelSelection) {
  if (current?.providerID !== selected.providerID || current.id !== selected.id) {
    return
  }

  return current.variant
}

async function selectVariant(
  context: Plugin.Context,
  info: ModelInfo,
  current: SessionModel,
  selected: ModelSelection
): Promise<ModelSelection | undefined> {
  if (info.variants.length === 0) {
    return selected
  }

  const variant = await context.ui.dialog.select<string>({
    title: `Select variant for ${info.name}`,
    current: currentVariant(current, selected),
    options: [
      { title: 'Default', value: 'default' },
      ...info.variants.map((item) => ({ title: item.id, value: item.id }))
    ]
  })
  if (variant === undefined) {
    return
  }

  return variant === 'default' ? selected : { ...selected, variant }
}

async function chooseModel(
  context: Plugin.Context,
  available: readonly ModelInfo[],
  current: SessionModel
): Promise<ModelSelection | undefined> {
  const selected = await context.ui.dialog.select<ModelOption>({
    title: 'Select subagent model',
    current: currentOption(current),
    options: modelOptions(available)
  })
  if (selected === undefined) {
    return
  }

  const info = available.find(
    (model) => model.providerID === selected.providerID && model.id === selected.id
  )
  if (info === undefined) {
    return selected
  }

  return selectVariant(context, info, current, selected)
}

async function selectModel(
  context: Plugin.Context,
  sessionID: string,
  location: Location
): Promise<ModelSelection | undefined> {
  await context.data.location.model.sync(location)
  const available = (context.data.location.model.list(location) ?? []).filter(
    (model) => model.enabled && model.status !== 'deprecated'
  )
  if (available.length === 0) {
    context.ui.toast.show({ title: 'Subagent', message: 'No available models', variant: 'warning' })
    return
  }

  return chooseModel(context, available, context.data.session.get(sessionID)?.model)
}

async function invoke(
  context: Plugin.Context,
  method: Method,
  request: Request,
  location: Location
) {
  const rpc = context.client.rpc(subtask)
  if (method === 'handoff') {
    await rpc.handoff(request, { location })
    return
  }

  await rpc.run(request, { location })
}

async function run(context: Plugin.Context, method: Method, input: string | undefined) {
  const route = context.ui.router.current()
  if (route.type !== 'session') {
    context.ui.toast.show({
      title: 'Subagent',
      message: 'Open a session before running a subagent',
      variant: 'warning'
    })
    return
  }

  try {
    await runSession(context, method, route.sessionID, input)
  } catch (error) {
    context.ui.toast.show({ title: 'Subagent failed', message: message(error), variant: 'error' })
  }
}

async function runSession(
  context: Plugin.Context,
  method: Method,
  sessionID: string,
  input: string | undefined
) {
  const location = sessionLocation(context, sessionID)
  const model = await selectModel(context, sessionID, location)
  if (model === undefined) {
    return
  }

  await invoke(context, method, { [sessionIdKey]: sessionID, text: input ?? '', model }, location)
}

function sessionLocation(context: Plugin.Context, sessionID: string) {
  const session = context.data.session.get(sessionID)
  return session?.location ?? context.location ?? context.data.location.default()
}

export default Plugin.define({
  id: 'mdc-git.subagent.tui',
  setup(context) {
    return context.ui.slot({
      append: 'app',
      render() {
        context.keymap.layer(() => ({
          mode: 'global',
          commands: [
            {
              id: 'subagent.run',
              title: 'Run blank subagent',
              description: 'Choose a model and run a fresh native subagent',
              group: 'Agent',
              palette: true,
              slash: { name: 'subagent:blank', arguments: true },
              run: async (input) => run(context, 'run', input)
            },
            {
              id: 'subagent.handoff',
              title: 'Run handoff subagent',
              description: 'Choose a model and hand off task-scoped context to a native subagent',
              group: 'Agent',
              palette: true,
              slash: { name: 'subagent:handoff', arguments: true },
              run: async (input) => run(context, 'handoff', input)
            }
          ]
        }))
        return null
      }
    })
  }
})
