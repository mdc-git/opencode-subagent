import { Plugin } from '@opencode/plugin/tui'
import { subtask, type ModelSelection } from './rpc.ts'

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

function message(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }

  return String(error)
}

function modelOptions(available: readonly ModelInfo[]) {
  return available.toSorted(compareModels).map((model) => ({
    title: model.name,
    value: { providerID: model.providerID, id: model.id },
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

  return { providerID: current.providerID, id: current.id }
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
    const session = context.data.session.get(route.sessionID)
    const location = session?.location ?? context.location ?? context.data.location.default()
    const model = await selectModel(context, route.sessionID, location)
    if (model === undefined) {
      return
    }

    const request = { sessionID: route.sessionID, text: input ?? '', model }
    const rpc = context.client.rpc(subtask)
    if (method === 'handoff') {
      await rpc.handoff(request, { location })
    } else {
      await rpc.run(request, { location })
    }
  } catch (error) {
    context.ui.toast.show({ title: 'Subagent failed', message: message(error), variant: 'error' })
  }
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
