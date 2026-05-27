export type Competitor = {
  appKey: string
  appName: string
  screenshotCount: number
  modules: string[]
}

export type Screenshot = {
  id: string
  competitor: string
  appKey: string
  flow: string
  flowKey: string
  node: string
  businessModules: string[]
  tags: string[]
  capturedAt: string
  versionLabel?: string
  timelineGroup?: string
  isLatestVersion?: boolean
  imagePath: string
  description: string
  visibleText: string[]
  status: string
  sensitiveStatus: string
  sourcePath: string
  classificationStatus?: string
  sourceType?: string
  sourceTaskId?: string
  pageCategory?: string
}

export type Flow = {
  id: string
  competitor: string
  flowName: string
  status: string
  summary: string
  nodes: Array<{ name: string; status: string; screenshotIds?: string[]; note?: string }>
}

export type FlowDeliverable = {
  flowId: string
  appKey: string
  competitor: string
  flowName: string
  flowType: string
  sourceProject: string
  status: string
  currentEndpoint: string
  summary: string
  displayImagePath?: string
  primaryPath?: string[]
  branchPaths?: string[]
  textOutput?: { status: string; label: string; path?: string }
  evidenceMap?: { status: string; label: string; path?: string; pdfPath?: string }
  pageTranslation?: { status: string; label: string; path?: string }
  missingNodes: string[]
  oralConfirmedNodes: string[]
  humanRequiredNodes: string[]
}

export type Capability = {
  appKey: string
  appName: string
  installed: boolean
  loggedIn: boolean
  supportedFlows: string[]
  lowRiskActions: string[]
  stopPoints: string[]
  packageName?: string
}

export type CaptureTask = {
  id: string
  title: string
  competitor: string
  flow: string
  status: string
  summary: string
  requestText?: string
  priority?: string
  updatedAt: string
  nodes: Array<{ name: string; status: string; note?: string }>
  artifacts?: Array<{ type: string; imagePath: string; createdAt: string; device?: string; label?: string }>
  publishStatus?: 'published' | 'failed' | 'skipped'
  publishMessage?: string
  plan?: Record<string, unknown>
}
