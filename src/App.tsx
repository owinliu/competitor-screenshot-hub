import { useEffect, useState } from 'react'
import './App.css'
import { competitors, flowDeliverables, flows, screenshots, tasks as seedTasks } from './data'
import radarReportRaw from '../data/recompare_april_early_0428_reports.json'
import type { CaptureTask, Flow, FlowDeliverable, Screenshot } from './types'

type Route = 'home' | 'library' | 'flows' | 'request' | 'tasks'
type PromoteReview = {
  flow: string
  sensitiveConfirmed: boolean
  classificationConfirmed: boolean
  allowPartial: boolean
  note?: string
}

const nav: Array<{ route: Route; label: string }> = [
  { route: 'home', label: '首页' },
  { route: 'library', label: '截图检索' },
  { route: 'flows', label: '流程库' },
  { route: 'request', label: '采集需求' },
  { route: 'tasks', label: '任务状态' },
]

function getInitialRoute(): Route {
  const hash = window.location.hash.replace('#/', '')
  if (hash === 'search') return 'library'
  return nav.some((item) => item.route === hash) ? (hash as Route) : 'home'
}

function App() {
  const [route, setRoute] = useState<Route>(getInitialRoute())
  const [taskList, setTaskList] = useState<CaptureTask[]>(() => loadTasks())
  const [, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const [promoteMessage, setPromoteMessage] = useState('')

  useEffect(() => {
    refreshTasks().then((remoteTasks) => {
      if (remoteTasks) {
        setTaskList(remoteTasks)
        saveTasks(remoteTasks)
        setApiStatus('online')
      } else {
        setApiStatus('offline')
      }
    })
  }, [])

  const go = (next: Route) => {
    setRoute(next)
  }

  const addTask = async (task: CaptureTask) => {
    const created = await createRemoteTask(task)
    setTaskList((current) => {
      const next = [created || task, ...current]
      saveTasks(next)
      return next
    })
    setApiStatus(created ? 'online' : 'offline')
    setRoute('tasks')
  }

  const reloadTasks = async () => {
    const remoteTasks = await refreshTasks()
    if (remoteTasks) {
      setTaskList(remoteTasks)
      saveTasks(remoteTasks)
      setApiStatus('online')
    }
  }

  const captureTask = async (taskId: string) => {
    const updated = await captureRemoteTask(taskId)
    if (updated) {
      setTaskList((current) => {
        const next = current.map((task) => task.id === updated.id ? updated : task)
        saveTasks(next)
        return next
      })
      setApiStatus('online')
    } else {
      setApiStatus('offline')
    }
  }

  const promoteTask = async (taskId: string, review: PromoteReview) => {
    const result = await promoteRemoteTask(taskId, review)
    if (result) {
      setPromoteMessage(`已保存 ${result.added} 张截图，可在截图检索中查看。`)
      const remoteTasks = await refreshTasks()
      if (remoteTasks) setTaskList(remoteTasks)
    } else {
      setPromoteMessage('保存失败，请稍后重试。')
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brandMark">CSH</span>
          <div>
            <strong>Competitor Screenshot Hub</strong>
            <small>竞品截图知识库</small>
          </div>
        </div>
        <nav>
          {nav.map((item) => (
            <button key={item.route} className={route === item.route ? 'active' : ''} onClick={() => go(item.route)}>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="main">
        {route === 'home' && <Home />}
        {route === 'library' && <Library />}
        {route === 'flows' && <Flows />}
        {route === 'request' && <Request onCreateTask={addTask} />}
        {route === 'tasks' && <Tasks tasks={taskList} promoteMessage={promoteMessage} onRefresh={reloadTasks} onCapture={captureTask} onPromote={promoteTask} />}
      </main>
    </div>
  )
}

type RadarDimension = 'APP' | '客服' | '消金' | '运营' | '风控'
type RadarProduct = {
  product: string
  changeCount: number
  highImpactCount: number
  dimensionChangeCounts: Record<RadarDimension, number>
  dimensionHighCounts: Record<RadarDimension, number>
  mainStrategy: string
  dimensions: Record<RadarDimension, string>
}

type RadarReportRow = {
  competitor: string
  dimension: string
  page: string
  conclusion: string
  prevEvidence: string | null
  currEvidence: string | null
  compare?: string
  impact: '高' | '中' | '低'
  prevDate?: string | null
  currDate?: string | null
  review?: string
  mappingRule?: string
}

type RadarReport = {
  meta: {
    timeline: string
    title: string
    competitors: string[]
    rowCount: number
  }
  rows: RadarReportRow[]
}

const radarDimensions: RadarDimension[] = ['APP', '客服', '消金', '运营', '风控']
const emptyMark = '—'
const radarReport = radarReportRaw as RadarReport
const radarRows = radarReport.rows

function normalizeDimension(dimension: string): RadarDimension {
  return dimension === '留存促活运营' ? '运营' : dimension as RadarDimension
}

function normalizeCompetitor(name: string) {
  return name === '度小满金融' ? '度小满' : name
}

function firstSentence(text?: string) {
  return (text || '').split('，')[0]?.trim() || emptyMark
}

function readableConclusion(row?: RadarReportRow) {
  if (!row) return emptyMark
  const first = firstSentence(row.conclusion)
  if (/仅有\d{4}/.test(first) || /缺少\d{4}/.test(first)) {
    return /活动/.test(first) ? '新增活动位（新周期出现），用于活动触达与转化引导。' : '新增展示位（新周期出现），用于运营触达与转化引导。'
  }
  return first.endsWith('。') ? first : `${first}。`
}

const timelineOptions = [
  { key: '0428-vs-max-history', label: '0428 vs 历史最大差异版本' },
]

const radarProducts: RadarProduct[] = radarReport.meta.competitors.map((rawName) => {
  const product = normalizeCompetitor(rawName)
  const rows = radarRows.filter((row) => normalizeCompetitor(row.competitor) === product)
  const highRows = rows.filter((row) => row.impact === '高')
  const dimensions = radarDimensions.reduce((acc, dimension) => {
    const firstHigh = highRows.find((row) => normalizeDimension(row.dimension) === dimension)
    acc[dimension] = readableConclusion(firstHigh)
    return acc
  }, {} as Record<RadarDimension, string>)
  const dimensionChangeCounts = radarDimensions.reduce((acc, dimension) => {
    acc[dimension] = rows.filter((row) => normalizeDimension(row.dimension) === dimension).length
    return acc
  }, {} as Record<RadarDimension, number>)
  const dimensionHighCounts = radarDimensions.reduce((acc, dimension) => {
    acc[dimension] = highRows.filter((row) => normalizeDimension(row.dimension) === dimension).length
    return acc
  }, {} as Record<RadarDimension, number>)
  return {
    product,
    changeCount: rows.length,
    highImpactCount: highRows.length,
    dimensionChangeCounts,
    dimensionHighCounts,
    mainStrategy: highRows[0] ? readableConclusion(highRows[0]) : emptyMark,
    dimensions,
  }
})

type DimensionFilter = '全部' | RadarDimension

type EvidencePair = {
  key: string
  competitor: string
  dimension: RadarDimension
  title: string
  before?: string | null
  after?: string | null
  beforeDate?: string | null
  afterDate?: string | null
  conclusion: string
  impact: '高' | '中' | '低'
  review?: string
}

function activeDimensions(item: RadarProduct) {
  return radarDimensions.filter((dimension) => item.dimensions[dimension] !== emptyMark)
}

function summarizeProductChanges(product: string, dimension: DimensionFilter) {
  const item = radarProducts.find((entry) => entry.product === product)
  if (!item) return '暂无可展示的页面变化总结。'
  if (dimension === '全部') {
    const changes = activeDimensions(item).map((dim) => `${dim}：${item.dimensions[dim]}`)
    return changes.length ? changes.join(' ') : '本期未识别到可比高影响页面变化。'
  }
  return item.dimensions[dimension] === emptyMark ? `${dimension}维度本期未识别到可比高影响页面变化。` : `${dimension}：${item.dimensions[dimension]}`
}

function getEvidencePairs(dimension: DimensionFilter): EvidencePair[] {
  const pairs = radarRows
    .filter((row) => row.prevEvidence || row.currEvidence)
    .filter((row) => dimension === '全部' || normalizeDimension(row.dimension) === dimension)
    .map((row) => ({
      key: `${row.competitor}-${row.dimension}-${row.page}-${row.prevEvidence || 'none'}-${row.currEvidence || 'none'}`,
      competitor: normalizeCompetitor(row.competitor),
      dimension: normalizeDimension(row.dimension),
      title: `${normalizeDimension(row.dimension)} · ${row.page}`,
      before: row.prevEvidence,
      after: row.currEvidence,
      beforeDate: row.prevDate,
      afterDate: row.currDate,
      conclusion: row.conclusion,
      impact: row.impact,
      review: row.review,
    }))
    .sort((a, b) => {
      const order = { 高: 3, 中: 2, 低: 1 }
      return order[b.impact] - order[a.impact]
    })

  const rankedNames = [...radarProducts]
    .sort((a, b) => b.highImpactCount - a.highImpactCount || b.changeCount - a.changeCount)
    .map((item) => item.product)
  return rankedNames.flatMap((name) => pairs.filter((pair) => pair.competitor === name))
}

function Home() {
  const [selectedTimeline, setSelectedTimeline] = useState(timelineOptions[0].key)
  const [selectedDimension, setSelectedDimension] = useState<DimensionFilter>('全部')
  const [expandedProducts, setExpandedProducts] = useState<string[]>([])
  const getProductHighCount = (product: RadarProduct) => selectedDimension === '全部' ? product.highImpactCount : product.dimensionHighCounts[selectedDimension]
  const getProductChangeCount = (product: RadarProduct) => selectedDimension === '全部' ? product.changeCount : product.dimensionChangeCounts[selectedDimension]
  const rankedProducts = [...radarProducts].sort((a, b) => getProductHighCount(b) - getProductHighCount(a) || getProductChangeCount(b) - getProductChangeCount(a))
  const displayedProducts = selectedDimension === '全部'
    ? rankedProducts
    : rankedProducts.filter((product) => getProductHighCount(product) > 0)
  const evidencePairs = getEvidencePairs(selectedDimension)
  const evidenceGroups = displayedProducts
    .map((product) => ({
      product: product.product,
      changeCount: getProductChangeCount(product),
      highImpactCount: getProductHighCount(product),
      pairs: evidencePairs.filter((pair) => pair.competitor === product.product),
    }))
    .filter((group) => group.pairs.length > 0)
  const toggleProductExpanded = (product: string) => {
    setExpandedProducts((current) => current.includes(product) ? current.filter((item) => item !== product) : [...current, product])
  }

  return (
    <section className="page widePage radarHome reportsTableOnly">
      <div className="radarTablePanel radarContentPanel">
        <div className="reportsTableHeader">
          <h2>五产品总览表（严格同名位点对比）</h2>
          <label className="timelineSwitcher">
            <span>时间线</span>
            <select value={selectedTimeline} onChange={(event) => setSelectedTimeline(event.target.value)}>
              {timelineOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
        </div>

        <div className="dimensionTabs" aria-label="按维度筛选变化截图">
          {(['全部', ...radarDimensions] as DimensionFilter[]).map((dimension) => (
            <button
              key={dimension}
              className={selectedDimension === dimension ? 'active' : ''}
              onClick={() => {
                setSelectedDimension(dimension)
                setExpandedProducts([])
              }}
            >
              {dimension}
            </button>
          ))}
        </div>

        <div className="radarTableWrap reportsTableWrap">
          <table className="radarTable reportsManagementTable">
            <colgroup>
              <col className="rankCol" />
              <col className="productCol" />
              <col className="highCountCol" />
              <col className="countCol" />
              <col className="focusCol" />
              <col className="strategyCol" />
            </colgroup>
            <thead>
              <tr>
                <th>变化排名</th>
                <th>产品展示</th>
                <th>高影响变化数</th>
                <th>截图变化数</th>
                <th>变化方面</th>
                <th>主要策略变化</th>
              </tr>
            </thead>
            <tbody>
              {displayedProducts.map((item, index) => (
                <tr key={item.product}>
                  <td className="rankCell"><span>{index + 1}</span></td>
                  <td className="productCell"><strong>{item.product}</strong></td>
                  <td className="highImpactCountCell">{getProductHighCount(item)}</td>
                  <td className="coverageCell subtleCount">{getProductChangeCount(item)}</td>
                  <td>
                    <div className="dimensionPills compact">
                      {selectedDimension === '全部'
                        ? (activeDimensions(item).length ? activeDimensions(item).map((dimension) => <span className="isActive" key={dimension}>{dimension}</span>) : <span className="isEmpty">暂时无高影响变化</span>)
                        : <span className="isActive">{selectedDimension}</span>}
                    </div>
                  </td>
                  <td>{selectedDimension === '全部' ? item.mainStrategy : item.dimensions[selectedDimension]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="evidenceComparePanel integratedEvidence">
          <div className="sectionTitle">
          <div>
            <h2>{selectedDimension === '全部' ? '变化截图对比' : `${selectedDimension} 变化截图对比`}</h2>
          </div>
        </div>
        <div className="appEvidenceGrid">
          {evidenceGroups.map((group) => (
            <article className="appEvidenceCard" key={group.product}>
              <div className="appEvidenceHeader">
                <div>
                  <h3>{selectedDimension === '全部' ? `${group.product}周期变化` : `${group.product}${selectedDimension}变化`}</h3>
                </div>
                <div className="evidenceCountBadge">
                  <strong>{group.highImpactCount}</strong>
                  <span>高影响 / 共 {group.changeCount}</span>
                </div>
              </div>
              <p className="appChangeSummary">{summarizeProductChanges(group.product, selectedDimension)}</p>
              <div className="appEvidencePairs">
                {(expandedProducts.includes(group.product) ? group.pairs : group.pairs.slice(0, 3)).map((pair) => (
                  <div className="appEvidencePair" key={pair.key}>
                    <div className="evidenceCompareMeta">
                      <span className="badge muted">{pair.dimension}</span>
                      <span className={`badge impact${pair.impact}`}>{pair.impact}</span>
                      {pair.review && <span className="badge review">{pair.review}</span>}
                      <span>{pair.title}</span>
                    </div>
                    <p className="evidenceConclusion">{pair.conclusion}</p>
                    <div className="compareImages">
                      {pair.before ? (
                        <figure>
                          <img src={withBase(pair.before)} alt={`${pair.competitor} 上期 ${pair.title}`} loading="lazy" />
                          <figcaption>上期{pair.beforeDate ? `（${pair.beforeDate}）` : ''}</figcaption>
                        </figure>
                      ) : <div className="missingEvidence">上期缺图</div>}
                      {pair.after ? (
                        <figure>
                          <img src={withBase(pair.after)} alt={`${pair.competitor} 本期 ${pair.title}`} loading="lazy" />
                          <figcaption>本期{pair.afterDate ? `（${pair.afterDate}）` : ''}</figcaption>
                        </figure>
                      ) : <div className="missingEvidence">本期缺图</div>}
                    </div>
                  </div>
                ))}
              </div>
              {group.pairs.length > 3 && (
                <button className="expandEvidenceButton" onClick={() => toggleProductExpanded(group.product)}>
                  {expandedProducts.includes(group.product) ? '收起变化截图' : `展开全部 ${group.pairs.length} 组变化截图`}
                </button>
              )}
            </article>
          ))}
        </div>
          {evidenceGroups.length === 0 && <div className="emptyState">当前维度暂无可对比截图。</div>}
        </div>
      </div>
    </section>
  )
}

function Library() {
  const [query, setQuery] = useState('')
  const [competitor, setCompetitor] = useState('all')
  const [module, setModule] = useState('all')
  const [flow, setFlow] = useState('all')
  const [timeline, setTimeline] = useState('latest')
  const [selected, setSelected] = useState<Screenshot | null>(null)
  const modules = Array.from(new Set(screenshots.flatMap((item) => item.businessModules))).sort()
  const flowOptions = Array.from(new Set(screenshots.map((item) => item.flow))).sort()
  const timelineOptions = Array.from(new Set(screenshots.map((item) => item.timelineGroup || item.capturedAt))).sort()

  const filtered = filterScreenshots({ query, competitor, module, flow, timeline })

  const reset = () => {
    setQuery('')
    setCompetitor('all')
    setModule('all')
    setFlow('all')
    setTimeline('latest')
  }

  return (
    <section className="page widePage">
      <Header title="截图检索" subtitle="按竞品、流程、模块和关键词快速查找页面截图。" />
      <div className="discoveryLayout">
        <aside className="filterPanel">
          <label>
            关键词
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="客服入口、借钱、额度页" />
          </label>
          <label>
            竞品
            <select value={competitor} onChange={(event) => setCompetitor(event.target.value)}>
              <option value="all">全部竞品</option>
              {competitors.map((item) => <option key={item.appKey} value={item.appKey}>{item.appName}</option>)}
            </select>
          </label>
          <label>
            流程
            <select value={flow} onChange={(event) => setFlow(event.target.value)}>
              <option value="all">全部流程</option>
              {flowOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            模块
            <select value={module} onChange={(event) => setModule(event.target.value)}>
              <option value="all">全部模块</option>
              {modules.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            时间线
            <select value={timeline} onChange={(event) => setTimeline(event.target.value)}>
              <option value="latest">仅最新版本</option>
              <option value="all">全部时间</option>
              {timelineOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <button className="ghostButton" onClick={reset}>重置筛选</button>
          <div className="filterHint">
            <strong>{filtered.length}</strong>
            <span> / {screenshots.length} 张截图</span>
          </div>
        </aside>
        <section className="resultsPanel">
          <div className="resultsToolbar">
            <div>
              <strong>匹配结果</strong>
              <p>默认展示最新版本；需要对比历史时可切换时间线。</p>
            </div>
            <span className="badge muted">{filtered.length} 张</span>
          </div>
          <ScreenshotGrid items={filtered} onSelect={setSelected} />
        </section>
      </div>
      {selected && <ScreenshotDetail item={selected} onClose={() => setSelected(null)} />}
    </section>
  )
}

function filterScreenshots(filters: { query?: string; competitor?: string; module?: string; flow?: string; timeline?: string }) {
  const q = (filters.query || '').trim().toLowerCase()
  return screenshots.filter((item) => {
    const matchesQuery = !q || [
      item.competitor,
      item.flow,
      item.node,
      item.description,
      ...item.tags,
      ...item.visibleText,
      ...item.businessModules,
    ].join(' ').toLowerCase().includes(q)
    return (
      matchesQuery &&
      (!filters.competitor || filters.competitor === 'all' || item.appKey === filters.competitor) &&
      (!filters.module || filters.module === 'all' || item.businessModules.includes(filters.module)) &&
      (!filters.flow || filters.flow === 'all' || item.flow === filters.flow) &&
      (!filters.timeline || filters.timeline === 'all' || (filters.timeline === 'latest' ? item.isLatestVersion : (item.timelineGroup || item.capturedAt) === filters.timeline))
    )
  })
}

function ScreenshotGrid({ items, onSelect }: { items: Screenshot[]; onSelect?: (item: Screenshot) => void }) {
  if (items.length === 0) {
    return <div className="emptyState">没有匹配截图，可以调整筛选条件或提交采集需求。</div>
  }
  return <div className="cardGrid">{items.map((item) => <ScreenshotCard key={item.id} item={item} onSelect={onSelect} />)}</div>
}

function ScreenshotCard({ item, onSelect }: { item: Screenshot; onSelect?: (item: Screenshot) => void }) {
  return (
    <article className="shotCard" onClick={() => onSelect?.(item)}>
      <div className="shotImageWrap">
        {item.imagePath ? <img src={withBase(item.imagePath)} alt={`${item.competitor} ${item.node}`} loading="lazy" /> : <span>暂无截图</span>}
      </div>
      <div className="shotBody">
        <div className="row wrap"><span className="badge">{item.competitor}</span><span className="badge muted">{item.flow}</span>{item.isLatestVersion && <span className="badge success">最新</span>}</div>
        <h3>{item.node}</h3>
        <p>{item.description}</p>
        <div className="metaLine"><span>{item.capturedAt}</span><span>{item.businessModules.join(' / ')}</span></div>
        <div className="tagRow">{item.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
      </div>
    </article>
  )
}

function ScreenshotDetail({ item, onClose }: { item: Screenshot; onClose: () => void }) {
  return (
    <div className="detailOverlay" role="dialog" aria-modal="true">
      <div className="detailBackdrop" onClick={onClose} />
      <article className="detailPanel">
        <button className="closeButton" onClick={onClose}>关闭</button>
        <div className="detailImage">
          <img src={withBase(item.imagePath)} alt={`${item.competitor} ${item.node}`} />
        </div>
        <div className="detailBody">
          <div className="row wrap"><span className="badge">{item.competitor}</span><span className="badge muted">{item.flow}</span></div>
          <h2>{item.node}</h2>
          <p>{item.description}</p>
          <dl className="detailMeta">
            <div><dt>版本/时间</dt><dd>{item.capturedAt}</dd></div>
            <div><dt>业务模块</dt><dd>{item.businessModules.join(' / ')}</dd></div>
          </dl>
          <div className="tagRow">{item.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
        </div>
      </article>
    </div>
  )
}

function Flows() {
  const qualifiedFlows = flows.filter((flow) => findFlowDeliverable(flow))
  const [query, setQuery] = useState('')
  const [app, setApp] = useState('all')
  const [flowType, setFlowType] = useState('all')
  const flowApps = Array.from(new Set(qualifiedFlows.map((flow) => flow.competitor))).sort()
  const flowTypes = Array.from(new Set(qualifiedFlows.map((flow) => findFlowDeliverable(flow)?.flowType).filter((item): item is string => Boolean(item)))).sort()
  const q = query.trim().toLowerCase()
  const visibleFlows = qualifiedFlows.filter((flow) => {
    const deliverable = findFlowDeliverable(flow)
    const text = [flow.flowName, flow.competitor, flow.summary, deliverable?.flowType, deliverable?.currentEndpoint, ...(deliverable?.primaryPath || []), ...(deliverable?.branchPaths || [])].join(' ').toLowerCase()
    return (
      (!q || text.includes(q)) &&
      (app === 'all' || flow.competitor === app) &&
      (flowType === 'all' || deliverable?.flowType === flowType)
    )
  })
  return (
    <section className="page widePage">
      <Header title="黄金流程" subtitle="查看竞品关键业务流程的完整路径与页面证据。" />
      <div className="flowSearchBar">
        <label>
          搜索流程
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入 APP、流程或节点关键词" />
        </label>
        <label>
          竞品
          <select value={app} onChange={(event) => setApp(event.target.value)}>
            <option value="all">全部竞品</option>
            {flowApps.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          流程类型
          <select value={flowType} onChange={(event) => setFlowType(event.target.value)}>
            <option value="all">全部类型</option>
            {flowTypes.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>
      <div className="flowList">
        {visibleFlows.map((flow) => (
          <FlowCard key={flow.id} flow={flow} />
        ))}
      </div>
      {visibleFlows.length === 0 && <div className="emptyState">没有匹配的流程，可以调整筛选条件。</div>}
    </section>
  )
}

function findFlowDeliverable(flow: Flow) {
  return flowDeliverables.find((item) => item.flowId === flow.id || (item.competitor === flow.competitor && flow.flowName.includes('消金')))
}

function FlowCard({ flow }: { flow: Flow }) {
  const deliverable = findFlowDeliverable(flow)

  if (deliverable) {
    return <GoldenFlowShowcase flow={flow} deliverable={deliverable} />
  }
  return null
}

function GoldenFlowShowcase({ flow, deliverable }: { flow: Flow; deliverable: FlowDeliverable }) {
  const mainPath = deliverable.primaryPath?.length ? deliverable.primaryPath : flow.nodes.map((node) => node.name)
  const branches = deliverable.branchPaths || []
  const [viewerOpen, setViewerOpen] = useState(false)
  return (
    <article className="panel flowCard goldenFlowCard">
      <div className="goldenFlowTopline">
        <div>
          <h2>{deliverable.flowName}</h2>
          <p>{deliverable.flowType}</p>
        </div>
      </div>

      <div className="goldenFlowContent">
        <div className="flowMapStage">
          {deliverable.displayImagePath ? (
            <button className="flowMapButton" onClick={() => setViewerOpen(true)} aria-label={`打开${deliverable.flowName}原图`}>
              <img src={withBase(deliverable.displayImagePath)} alt={`${deliverable.flowName}流程证据图`} loading="lazy" />
              <span>点击查看原图</span>
            </button>
          ) : (
            <div className="emptyState">流程证据图待生成</div>
          )}
        </div>

        <aside className="flowNodeSection">
          <div className="sectionTitle"><h3>文字流程路径</h3></div>
          <div className="flowNodeRail">
            {mainPath.map((item, index) => (
              <div className="flowNode" key={`${deliverable.flowId}-${item}-${index}`}>
                <div className="flowNodeMarker">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                </div>
                <div className="flowNodeBody">
                  <strong>{item}</strong>
                </div>
              </div>
            ))}
          </div>
          {branches.length > 0 && (
            <div className="branchNodeGrid">
              {branches.map((item, index) => (
                <div className="branchNode" key={`${deliverable.flowId}-branch-${index}`}>
                  <span>分支 {index + 1}</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
      {viewerOpen && deliverable.displayImagePath && (
        <ImageLightbox src={withBase(deliverable.displayImagePath)} alt={`${deliverable.flowName}流程证据图`} onClose={() => setViewerOpen(false)} />
      )}
    </article>
  )
}

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [drag, setDrag] = useState<{ startX: number; startY: number; originX: number; originY: number } | null>(null)

  const zoom = (next: number) => setScale(Math.min(4, Math.max(0.6, next)))
  const reset = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  return (
    <div className="imageViewerOverlay" role="dialog" aria-modal="true">
      <div className="imageViewerBackdrop" onClick={onClose} />
      <div className="imageViewerPanel">
        <div className="imageViewerToolbar">
          <button onClick={() => zoom(scale - 0.2)}>缩小</button>
          <span>{Math.round(scale * 100)}%</span>
          <button onClick={() => zoom(scale + 0.2)}>放大</button>
          <button onClick={reset}>适应屏幕</button>
          <button onClick={onClose}>关闭</button>
        </div>
        <div
          className="imageViewerCanvas"
          onWheel={(event) => {
            event.preventDefault()
            zoom(scale + (event.deltaY > 0 ? -0.12 : 0.12))
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            setDrag({ startX: event.clientX, startY: event.clientY, originX: offset.x, originY: offset.y })
          }}
          onPointerMove={(event) => {
            if (!drag) return
            setOffset({ x: drag.originX + event.clientX - drag.startX, y: drag.originY + event.clientY - drag.startY })
          }}
          onPointerUp={() => setDrag(null)}
          onPointerCancel={() => setDrag(null)}
        >
          <img
            src={src}
            alt={alt}
            draggable={false}
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
          />
        </div>
      </div>
    </div>
  )
}

function Request({ onCreateTask }: { onCreateTask: (task: CaptureTask) => void | Promise<void> }) {
  const [app, setApp] = useState('度小满')
  const [flow, setFlow] = useState('客服入口')
  const [detail, setDetail] = useState('')
  const [priority, setPriority] = useState('中')

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const now = new Date()
    const text = detail.trim()
    const hasRiskKeyword = /身份证|人脸|银行卡|借款提交|授信提交|签约|验证码|支付|提现|还款|转账/.test(`${flow}${text}`)
    const task: CaptureTask = {
      id: `task-${now.getTime()}`,
      title: `采集${app}：${flow}`,
      competitor: app,
      flow,
      status: hasRiskKeyword ? '待人工确认' : '已收到',
      summary: text || `用户希望采集「${app}」的「${flow}」。`,
      requestText: text || `采集${app}：${flow}`,
      priority,
      updatedAt: now.toLocaleString('zh-CN', { hour12: false }),
      nodes: [
        { name: '需求提交', status: '已收到' },
        { name: hasRiskKeyword ? '需要人工确认' : '等待处理', status: hasRiskKeyword ? '待确认' : '排队中', note: hasRiskKeyword ? '该流程涉及敏感操作，需要人工配合' : undefined },
      ],
    }
    onCreateTask(task)
    setDetail('')
  }

  return (
    <section className="page">
      <Header title="采集需求" subtitle="提交你想查看的竞品页面或业务流程。" />
      <form className="form" onSubmit={submit}>
        <label>想采集的 APP
          <select value={app} onChange={(event) => setApp(event.target.value)}>
            <option>度小满</option><option>分期乐</option><option>小赢卡贷</option><option>奇富借条</option><option>安逸花</option><option>拍拍贷</option><option>京东金融</option><option>马上金融</option>
          </select>
        </label>
        <label>想采集的流程<input value={flow} onChange={(event) => setFlow(event.target.value)} placeholder="例如：客服入口、借钱上游、运营活动" /></label>
        <label>优先级
          <select value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option>高</option><option>中</option><option>低</option>
          </select>
        </label>
        <label>需求说明<textarea value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="描述你想看的页面或业务问题" rows={5} /></label>
        <button type="submit">提交需求并生成任务</button>
      </form>

    </section>
  )
}

function Tasks({ tasks, promoteMessage, onRefresh, onCapture, onPromote }: { tasks: CaptureTask[]; promoteMessage: string; onRefresh: () => void; onCapture: (taskId: string) => void; onPromote: (taskId: string, review: PromoteReview) => void }) {
  const [reviewTask, setReviewTask] = useState<CaptureTask | null>(null)
  const statusCounts = tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1
    return acc
  }, {})

  return (
    <section className="page">
      <Header title="任务状态" subtitle="查看已提交的采集任务和最新进展。" />
      <div className="row taskActions"><button className="ghostButton" onClick={onRefresh}>刷新任务</button></div>
      {promoteMessage && <div className="emptyState compactMessage">{promoteMessage}</div>}
      <div className="taskSummary">
        {Object.entries(statusCounts).map(([status, count]) => (
          <div className="miniCard" key={status}><strong>{count}</strong><span>{status}</span></div>
        ))}
      </div>
      <div className="flowList">
        {tasks.map((task) => {
          const interruption = getTaskInterruption(task)
          return (
            <article className={`panel taskPanel ${interruption ? 'needsAttention' : ''}`} key={task.id}>
              <div className="row between"><h2>{task.title}</h2><span className={`badge ${interruption ? 'danger' : 'warning'}`}>{task.status}</span></div>
              <p>{task.summary}</p>
              {interruption && <TaskInterruptionNotice reason={interruption.reason} latestImage={interruption.latestImage} />}
              {task.publishStatus && <PublishStatusNotice status={task.publishStatus} message={task.publishMessage} />}
              <small>更新：{task.updatedAt}</small>
              <div className="taskButtons"><button className="ghostButton" onClick={() => onCapture(task.id)}>采集当前页面</button>{task.artifacts && task.artifacts.length > 0 && <button className="ghostButton" onClick={() => setReviewTask(task)}>保存到截图检索</button>}</div>
              {task.artifacts && task.artifacts.length > 0 && (
                <div className="taskArtifacts">
                  {task.artifacts.map((artifact) => (
                    <figure key={artifact.imagePath} className={interruption?.latestImage === artifact.imagePath ? 'latestArtifact' : ''}>
                      <img src={withBase(artifact.imagePath)} alt={artifact.label || '任务截图'} loading="lazy" />
                      <figcaption>{artifact.label || artifact.createdAt}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
              <div className="timeline">
                {task.nodes.map((node, index) => (
                  <div className={`timelineItem ${isBlockingNode(node.status) ? 'blockedNode' : ''}`} key={`${task.id}-${node.name}-${index}`}>
                    <span>{index + 1}</span>
                    <div><strong>{node.name}</strong><small>{node.status}{node.note ? ` · ${node.note}` : ''}</small></div>
                  </div>
                ))}
              </div>
            </article>
          )
        })}
      </div>
      {reviewTask && <PromoteReviewDialog task={reviewTask} onClose={() => setReviewTask(null)} onConfirm={(review) => { onPromote(reviewTask.id, review); setReviewTask(null) }} />}
    </section>
  )
}

function TaskInterruptionNotice({ reason, latestImage }: { reason: string; latestImage?: string }) {
  return (
    <div className="taskAlert" role="status">
      <strong>采集已中断，需要人工接管</strong>
      <span>{reason}</span>
      {latestImage && <small>已保留中断前截图，可在下方查看最后一张画面。</small>}
    </div>
  )
}

function PublishStatusNotice({ status, message }: { status: CaptureTask['publishStatus']; message?: string }) {
  const ok = status === 'published'
  return (
    <div className={`publishNotice ${ok ? 'published' : 'failed'}`} role="status">
      <strong>{ok ? '截图已同步到线上' : '截图同步线上失败'}</strong>
      <span>{message || (ok ? 'GitHub Pages 正在部署或已部署，可稍后刷新查看。' : '请维护者检查本地 git push / GitHub Actions 状态。')}</span>
    </div>
  )
}

function getTaskInterruption(task: CaptureTask) {
  const blockingNode = [...task.nodes].reverse().find((node) => isBlockingNode(node.status) || /未找到|弹窗|阻断|中断|失败/.test(`${node.name} ${node.note || ''}`))
  const taskBlocked = /部分完成|等待人工|失败|中断/.test(task.status)
  if (!blockingNode && !taskBlocked) return null
  const latestImage = task.artifacts?.[task.artifacts.length - 1]?.imagePath
  return {
    reason: blockingNode?.note || task.summary || '自动采集没有继续推进，请查看最后截图并人工判断下一步。',
    latestImage,
  }
}

function isBlockingNode(status: string) {
  return /等待人工|失败|中断|阻断/.test(status)
}

function PromoteReviewDialog({ task, onClose, onConfirm }: { task: CaptureTask; onClose: () => void; onConfirm: (review: PromoteReview) => void }) {
  const [flow, setFlow] = useState(task.flow || '任务采集')
  const [sensitiveConfirmed, setSensitiveConfirmed] = useState(false)
  const [classificationConfirmed, setClassificationConfirmed] = useState(false)
  const [allowPartial, setAllowPartial] = useState(task.status === '已完成')
  const [note, setNote] = useState('')
  const canSubmit = sensitiveConfirmed && classificationConfirmed && (task.status === '已完成' || allowPartial)

  return (
    <div className="detailOverlay" role="dialog" aria-modal="true">
      <div className="detailBackdrop" onClick={onClose} />
      <article className="reviewPanel">
        <button className="closeButton" onClick={onClose}>关闭</button>
        <div>
          <p className="eyebrow">保存截图</p>
          <h2>保存到截图检索</h2>
          <p>保存前请确认截图可用、分类正确，且没有明显敏感信息。</p>
        </div>
        <div className="reviewGrid">
          <div>
            <label>流程分类<input value={flow} onChange={(event) => setFlow(event.target.value)} /></label>
            <label className="checkLine"><input type="checkbox" checked={sensitiveConfirmed} onChange={(event) => setSensitiveConfirmed(event.target.checked)} /> 已确认没有明显敏感信息，或后续仍需脱敏复核</label>
            <label className="checkLine"><input type="checkbox" checked={classificationConfirmed} onChange={(event) => setClassificationConfirmed(event.target.checked)} /> 已确认分类可用，可进入检索</label>
            <label className="checkLine"><input type="checkbox" checked={allowPartial} onChange={(event) => setAllowPartial(event.target.checked)} /> 即使任务未完全完成，也允许先保存当前截图</label>
            <label>备注<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="例如：已采到客服入口，后续继续补充转人工页面。" /></label>
            <div className="taskButtons">
              <button className="ghostButton" onClick={onClose}>取消</button>
              <button disabled={!canSubmit} className="primaryButton" onClick={() => onConfirm({ flow, sensitiveConfirmed, classificationConfirmed, allowPartial, note })}>保存</button>
            </div>
          </div>
          <div className="reviewArtifacts">
            {(task.artifacts || []).map((artifact) => (
              <figure key={artifact.imagePath}>
                <img src={withBase(artifact.imagePath)} alt={artifact.label || '任务截图'} loading="lazy" />
                <figcaption>{artifact.label || artifact.createdAt}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </article>
    </div>
  )
}

const LOCAL_API = 'http://127.0.0.1:8787/api'

async function refreshTasks() {
  try {
    const response = await fetch(`${LOCAL_API}/tasks`)
    if (!response.ok) return null
    return await response.json() as CaptureTask[]
  } catch {
    return null
  }
}

async function createRemoteTask(task: CaptureTask) {
  try {
    const response = await fetch(`${LOCAL_API}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(task),
    })
    if (!response.ok) return null
    return await response.json() as CaptureTask
  } catch {
    return null
  }
}

async function captureRemoteTask(taskId: string) {
  try {
    const response = await fetch(`${LOCAL_API}/tasks/${taskId}/capture`, { method: 'POST' })
    if (!response.ok) return null
    return await response.json() as CaptureTask
  } catch {
    return null
  }
}

async function promoteRemoteTask(taskId: string, review: PromoteReview) {
  try {
    const response = await fetch(`${LOCAL_API}/tasks/${taskId}/promote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(review),
    })
    if (!response.ok) return null
    return await response.json() as { ok: boolean; added: number }
  } catch {
    return null
  }
}

function loadTasks() {
  try {
    const stored = window.localStorage.getItem('competitor-screenshot-hub.tasks')
    return stored ? JSON.parse(stored) as CaptureTask[] : seedTasks
  } catch {
    return seedTasks
  }
}

function saveTasks(next: CaptureTask[]) {
  window.localStorage.setItem('competitor-screenshot-hub.tasks', JSON.stringify(next))
}

function withBase(path: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${base}${path}`
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return <header className="pageHeader"><p className="eyebrow">Competitor Screenshot Hub</p><h1>{title}</h1><p>{subtitle}</p></header>
}

export default App
