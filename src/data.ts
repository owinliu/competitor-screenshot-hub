import competitorsRaw from '../data/competitors.json'
import screenshotsRaw from '../data/screenshots.json'
import flowsRaw from '../data/flows.json'
import capabilitiesRaw from '../data/supported-capabilities.json'
import tasksRaw from '../data/tasks.json'
import flowDeliverablesRaw from '../data/flow-deliverables.json'
import type { Capability, CaptureTask, Competitor, Flow, FlowDeliverable, Screenshot } from './types'

export const competitors = competitorsRaw as Competitor[]
export const screenshots = screenshotsRaw as Screenshot[]
export const flows = flowsRaw as Flow[]
export const capabilities = capabilitiesRaw as Capability[]
export const tasks = tasksRaw as CaptureTask[]
export const flowDeliverables = flowDeliverablesRaw as FlowDeliverable[]

export const stats = {
  competitorCount: competitors.length,
  screenshotCount: competitors.reduce((sum, item) => sum + item.screenshotCount, 0),
  flowCount: flows.length,
  supportedAppCount: capabilities.filter((item) => item.installed).length,
}
