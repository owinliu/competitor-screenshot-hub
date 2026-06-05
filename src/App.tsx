import { useEffect, useState } from 'react'
import './App.css'
import { allLibraryScreenshots, eightAppScreenshots, flowDeliverables, flows, screenshots, tasks as seedTasks } from './data'
import radarReportRaw from '../data/recompare_april_early_0428_reports.json'
import type { CaptureTask, Flow, FlowDeliverable, Screenshot } from './types'

type Route = 'home' | 'library' | 'flows' | 'request' | 'tasks'
type FlowCategory = NonNullable<FlowDeliverable['category']>
type PromoteReview = {
  flow: string
  sensitiveConfirmed: boolean
  classificationConfirmed: boolean
  allowPartial: boolean
  note?: string
}

const nav: Array<{ route: Route; label: string }> = [
  { route: 'home', label: '竞品动态总览' },
  { route: 'library', label: '截图检索' },
  { route: 'flows', label: '流程库' },
  { route: 'request', label: '采集需求' },
  { route: 'tasks', label: '任务状态' },
]

const flowCategoryMeta: Record<FlowCategory, { label: string; shortLabel: string; description: string }> = {
  credit: { label: '授信流程', shortLabel: '授信', description: '额度、授信、查看额度等申请前链路' },
  cancellation: { label: '注销流程', shortLabel: '注销', description: '账号注销、风险提示、验证码/确认停点' },
  customer_service: { label: '客服/投诉流程', shortLabel: '客服投诉', description: '客服入口、投诉、消保与人工兜底链路' },
  blocked: { label: '待补采/阻断', shortLabel: '待补采', description: '登录、人脸、实名等安全停点导致的未完成流程' },
  other: { label: '其他流程', shortLabel: '其他', description: '暂未归入标准类型的流程资产' },
}

const flowCategoryOrder: FlowCategory[] = ['credit', 'cancellation', 'customer_service', 'blocked', 'other']

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
const latestEvidenceCount = new Set(radarRows.map((row) => row.currEvidence).filter(Boolean)).size

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
  { key: '0428-current', label: '0428 本期动态' },
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
  const tableProducts = [...radarProducts].sort((a, b) => b.highImpactCount - a.highImpactCount || b.changeCount - a.changeCount)
  const evidenceProducts = [...radarProducts].sort((a, b) => getProductHighCount(b) - getProductHighCount(a) || getProductChangeCount(b) - getProductChangeCount(a))
  const evidencePairs = getEvidencePairs(selectedDimension)
  const evidenceGroups = evidenceProducts
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
      <div className="pageHeader radarPageHeader">
        <div>
          <p className="eyebrow">Competitor Screenshot Hub</p>
          <h1>竞品动态总览</h1>
          <p>聚合本期竞品截图变化，快速查看高影响动态与对应截图证据。</p>
        </div>
        <label className="timelineSwitcher">
          <span>时间线</span>
          <select value={selectedTimeline} onChange={(event) => setSelectedTimeline(event.target.value)}>
            {timelineOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
      </div>
      <div className="radarTablePanel radarContentPanel">
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
              {tableProducts.map((item, index) => (
                <tr key={item.product}>
                  <td className="rankCell"><span>{index + 1}</span></td>
                  <td className="productCell"><strong>{item.product}</strong></td>
                  <td className="highImpactCountCell">{item.highImpactCount}</td>
                  <td className="coverageCell subtleCount">{item.changeCount}</td>
                  <td>
                    <div className="dimensionPills compact">
                      {activeDimensions(item).length ? activeDimensions(item).map((dimension) => <span className="isActive" key={dimension}>{dimension}</span>) : <span className="isEmpty">暂时无高影响变化</span>}
                    </div>
                  </td>
                  <td>{item.mainStrategy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="evidenceComparePanel integratedEvidence">
          <div className="sectionTitle evidenceSectionTitle">
            <div>
              <h2>截图证据展示</h2>
              <p>本期围绕 5 个竞品整理 {latestEvidenceCount} 张截图，并提炼出主要变化；下方可按维度筛选查看对应截图证据。</p>
            </div>
          </div>
          <div className="dimensionTabs evidenceTabs" aria-label="按维度筛选变化截图">
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
        <div className="appEvidenceGrid">
          {evidenceGroups.map((group) => (
            <article className="appEvidenceCard" key={group.product}>
              <div className="appEvidenceHeader">
                <div>
                  <h3>{selectedDimension === '全部' ? `${group.product}周期变化` : `${group.product}${selectedDimension}变化`}</h3>
                </div>
              </div>
              <div className="appEvidencePairs">
                {(expandedProducts.includes(group.product) ? group.pairs : group.pairs.slice(0, 3)).map((pair) => (
                  <div className="appEvidencePair" key={pair.key}>
                    <div className="evidenceCompareMeta">
                      <span className="evidencePairTitle">{pair.title}</span>
                      <span className="badge muted">{pair.dimension}</span>
                      <span className={`badge impact${pair.impact}`}>{pair.impact}</span>
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
  const [dimension, setDimension] = useState('all')
  const [evidenceValue, setEvidenceValue] = useState('all')
  const [reviewState, setReviewState] = useState('all')
  const [dataset, setDataset] = useState('evidence269')
  const [timeline, setTimeline] = useState('latest')
  const [viewMode, setViewMode] = useState<'dimension' | 'app' | 'search'>('dimension')
  const [pageFamily, setPageFamily] = useState('all')
  const [selected, setSelected] = useState<Screenshot | null>(null)
  const sourceItems = dataset === 'evidence269' ? eightAppScreenshots : dataset === 'historical' ? screenshots : allLibraryScreenshots
  const browseItems = viewMode === 'search' ? sourceItems : sourceItems.filter((item) => item.displayDefault !== 'false')
  const appOptions = Array.from(new Map(sourceItems.map((item) => [item.appKey, item.competitor])).entries()).sort((a, b) => a[1].localeCompare(b[1], 'zh-Hans-CN'))
  const dimensions = Array.from(new Set(sourceItems.map((item) => item.finalDimension || item.flow).filter(Boolean))).sort()
  const evidenceOptions = Array.from(new Set(sourceItems.map((item) => item.evidenceValue).filter((item): item is string => Boolean(item)))).sort()
  const timelineOptions = Array.from(new Set(sourceItems.map((item) => item.timelineGroup || item.capturedAt))).sort()

  const filtered = filterScreenshots({ query, competitor, dimension, evidenceValue, reviewState, dataset, timeline, pageFamily })
  const evidenceCounts = summarizeEvidence(sourceItems)
  const pageFamilies = buildPageFamilies(sourceItems)

  const reset = () => {
    setQuery('')
    setCompetitor('all')
    setDimension('all')
    setEvidenceValue('all')
    setReviewState('all')
    setPageFamily('all')
    setTimeline(dataset === 'evidence269' ? 'all' : 'latest')
  }

  const switchDataset = (nextDataset: string) => {
    setDataset(nextDataset)
    setTimeline(nextDataset === 'evidence269' ? 'all' : 'latest')
  }

  const dimensionButtons = ['all', 'APP', '风控', '客服', '消金', '留存促活运营', '非金融内容/社区'].filter((item) => item === 'all' || dimensions.includes(item))
  const evidenceButtons = ['all', '主观察证据', '边界证据', '复核证据', '不可用/回采证据'].filter((item) => item === 'all' || evidenceOptions.includes(item))
  const reviewButtons = [
    { value: 'all', label: '全部' },
    { value: 'needsReview', label: '需复核' },
    { value: 'riskBoundary', label: '敏感边界' },
    { value: 'summaryReady', label: '摘要可引' },
  ]

  return (
    <section className="page widePage evidenceLibraryPage">
      <Header title="截图检索" subtitle="本地预览版：按维度横向看、按 APP 纵向看、或自由搜索完整证据库。" />
      <div className="libraryModeTabs">
        <button className={viewMode === 'dimension' ? 'active' : ''} onClick={() => setViewMode('dimension')}>按APP浏览</button>
        <button className={viewMode === 'app' ? 'active' : ''} onClick={() => setViewMode('app')}>按页面对比</button>
        <button className={viewMode === 'search' ? 'active' : ''} onClick={() => setViewMode('search')}>自由搜索</button>
      </div>
      <div className="evidenceSummaryStrip compactEvidenceSummary">
        <span><strong>{sourceItems.length}</strong>当前数据源截图</span>
        <span><strong>{new Set(sourceItems.map((item) => item.appKey)).size}</strong>竞品 APP</span>
        <span><strong>{dimensions.length}</strong>维度/主题</span>
        {evidenceCounts.map((item) => <span key={item.label}><strong>{item.count}</strong>{item.label}</span>)}
      </div>
      <div className="libraryDatasetBar">
        <span>数据范围</span>
        <div className="segmentedFilter compactDatasetSwitch">
          <button className={dataset === 'evidence269' ? 'active' : ''} onClick={() => switchDataset('evidence269')}>269新素材</button>
          <button className={dataset === 'historical' ? 'active' : ''} onClick={() => switchDataset('historical')}>历史库</button>
          <button className={dataset === 'all' ? 'active' : ''} onClick={() => switchDataset('all')}>全部</button>
        </div>
      </div>
      {viewMode === 'dimension' && <AppRowsView items={browseItems} onSelect={setSelected} totalCount={sourceItems.length} />}
      {viewMode === 'app' && <PageRowsView items={browseItems} onSelect={setSelected} totalCount={sourceItems.length} />}
      {viewMode === 'search' && (
        <div className="discoveryLayout evidenceLayout compareBrowserLayout">
          <aside className="filterPanel evidenceFilterPanel compareFilterPanel">
            <div className="filterSection">
              <span className="filterSectionTitle">关键词</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="material_id、额度、风险报告、短视频" />
            </div>
            <div className="filterSection">
              <span className="filterSectionTitle">竞品</span>
              <select value={competitor} onChange={(event) => setCompetitor(event.target.value)}>
                <option value="all">全部竞品</option>
                {appOptions.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
              </select>
            </div>
            <div className="filterSection">
              <span className="filterSectionTitle">五维/主题</span>
              <div className="pillFilterGrid dimensionPills">
                {dimensionButtons.map((item) => (
                  <button key={item} className={dimension === item ? 'active' : ''} onClick={() => setDimension(item)}>
                    {item === 'all' ? '全部' : item}
                  </button>
                ))}
              </div>
            </div>
            <div className="filterSection">
              <span className="filterSectionTitle">页面类型</span>
              <select value={pageFamily} onChange={(event) => setPageFamily(event.target.value)}>
                <option value="all">全部页面类型</option>
                {pageFamilies.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div className="filterSection">
              <span className="filterSectionTitle">证据状态</span>
              <div className="pillFilterGrid evidencePills">
                {evidenceButtons.map((item) => (
                  <button key={item} className={evidenceValue === item ? 'active' : ''} onClick={() => setEvidenceValue(item)}>
                    {item === 'all' ? '全部证据' : item.replace('证据', '')}
                  </button>
                ))}
              </div>
              <div className="pillFilterGrid reviewPills">
                {reviewButtons.map((item) => (
                  <button key={item.value} className={reviewState === item.value ? 'active' : ''} onClick={() => setReviewState(item.value)}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            {dataset !== 'evidence269' && (
              <div className="filterSection">
                <span className="filterSectionTitle">时间线</span>
                <select value={timeline} onChange={(event) => setTimeline(event.target.value)}>
                  <option value="latest">仅最新版本</option>
                  <option value="all">全部时间</option>
                  {timelineOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
            )}
            <button className="ghostButton" onClick={reset}>重置筛选</button>
            <div className="filterHint evidenceFilterCount">
              <strong>{filtered.length}</strong>
              <span> / {sourceItems.length} 张截图</span>
            </div>
          </aside>
          <section className="resultsPanel evidenceResultsPanel compareResultsPanel">
            <div className="resultsToolbar evidenceToolbar">
              <div>
                <strong>自由搜索结果</strong>
                <p>适合查 material_id、关键文案、页面名或异常边界。</p>
              </div>
              <span className="badge muted">{filtered.length} 张</span>
            </div>
            <ScreenshotGrid items={filtered} onSelect={setSelected} />
          </section>
        </div>
      )}
      {selected && <ScreenshotDetail item={selected} onClose={() => setSelected(null)} />}
    </section>
  )
}

function buildPageFamilies(items: Screenshot[]) {
  return Array.from(new Set(items.map((item) => getPageFamily(item)).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}

function getPageFamily(item: Screenshot) {
  const text = [item.node, item.pageCategory, item.pageSlot, item.visualSummary, item.description, ...(item.tags || [])].join(' ')
  if (/我的|个人中心|账户|我的页/.test(text)) return '我的页/个人中心'
  if (/首页|home|首屏|主卡/.test(text)) return '首页/首屏'
  if (/借钱|借款|额度|查看额度|申请额度|金条/.test(text)) return '借钱/额度页'
  if (/还款|账单|自动还款|白条还款|借还记录/.test(text)) return '还款/账单页'
  if (/客服|帮助中心|服务大厅|在线咨询|FAQ|公众号|企微/.test(text)) return '客服/帮助中心'
  if (/风险报告|风险查询|信用评估|黑名单|失信|风险检测/.test(text)) return '风险报告/信用评估'
  if (/实名|人脸|身份证|认证|授权|协议|刷脸|营业执照|夫妻认证/.test(text)) return '实名/人脸/授权'
  if (/签到|红包|任务|奖励|邀请|现金|京豆|活动/.test(text)) return '活动/红包/签到'
  if (/会员|VIP|权益|富能|PLUS|免息券|优惠券/.test(text)) return '会员/权益'
  if (/购物|商城|商品|超市|618|补贴|买吖/.test(text)) return '购物/商城'
  if (/理财|保险|基金|黄金|小金库/.test(text)) return '理财/保险/资产'
  if (/短视频|社区|视频|内容流|资讯|圈子|点赞|评论|影视/.test(text)) return '短视频/社区'
  if (/弹窗|遮挡|浮层|loading|加载|黑屏|异常|跨 APP/.test(text)) return '弹窗/遮挡/异常'
  return '其它页面'
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce((acc, item) => {
    const key = getKey(item)
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {} as Record<string, T[]>)
}

const appTabOrders: Record<string, string[]> = {
  分期乐: ['首页', '借钱', '购物', '消息', '我的'],
  奇富借条: ['借钱', '服务', '生活', '我的'],
  度小满金融: ['借钱', '理财', '保险', '我的'],
  京东金融: ['首页', '借钱', '白条', '财富', '社区', '我的'],
  安逸花: ['首页', '提额', '我的'],
  马上金融: ['金融', '运营', '客服', '我的'],
  小赢: ['借钱', '权益', '风险监测', 'VIP卡', '我的'],
  拍拍贷借款: ['借款', '活动', '我的'],
}

const appItemOrderOverrides: Record<string, string[]> = {
  // 这两家的节点名里有采集标签（finance-tab / dimension-gap 等），不能稳定代表真实底部 Tab；按截图底部导航人工校正。
  马上金融: [
    'mashang-0004', 'mashang-0016', 'mashang-0017', 'mashang-0021', 'mashang-0023',
    'mashang-0002',
    'mashang-0003', 'mashang-0005', 'mashang-0001',
  ],
  小赢: [
    'xiaoying-0001',
    'xiaoying-0002',
    'xiaoying-0003', 'xiaoying-0009', 'xiaoying-0014',
    'xiaoying-0004', 'xiaoying-0006',
    'xiaoying-0005', 'xiaoying-0011', 'xiaoying-0017',
  ],
}

const appTabAliases: Record<string, Record<string, RegExp[]>> = {
  分期乐: {
    首页: [/^首页/, /首页首屏/, /首页频道/, /首页快捷/],
    借钱: [/借款/, /借钱/, /额度/, /激活/, /实名/, /授信/, /充值/, /还款/, /自动还款/, /风险检测/, /更多服务/],
    购物: [/购物/, /商城/, /买吖/, /商品/, /超市/, /618/, /官方补贴/],
    消息: [/消息/, /客服/, /在线客服/, /公众号/, /服务大厅/, /FAQ/],
    我的: [/我的/, /个人中心/, /设置/, /安全中心/, /黑产举报/],
  },
  奇富借条: {
    借钱: [/借钱/, /借款/, /额度/, /申请额度/, /借还记录/, /新人免息/, /还款/, /自动还款/, /富能计划/],
    服务: [/服务页/, /服务首页/, /更多服务/, /客服/],
    生活: [/生活/, /健康关怀/, /数字生活/, /信用管理/],
    我的: [/我的/, /个人中心/, /账户/, /消费者权益保护/],
  },
  度小满金融: {
    借钱: [/借钱/, /借款/, /额度/, /提额/, /降息/, /新人指南/, /申请步骤/],
    理财: [/理财/, /基金/, /产品推荐/],
    保险: [/保险/],
    我的: [/我的/, /账户/, /用户保护中心/],
  },
  京东金融: {
    首页: [/京东金融首页/, /^首页/, /推荐页/, /首页\/授信/, /首页\/资产/],
    借钱: [/金条/, /借钱/, /借款/, /额度/, /全部服务/],
    白条: [/白条/],
    财富: [/财富/, /基金/, /黄金/, /资产/, /京东保/, /保险/, /权益/],
    社区: [/社区/, /短视频/, /内容页/, /信息流/, /资讯/, /圈/],
    我的: [/我的/, /实名/, /银行卡/],
  },
  安逸花: {
    首页: [/首页/, /借款首页/, /launch/, /bottom-755/],
    提额: [/提额/, /额度成长/, /额度提升/, /涨分赢提额/, /益查查/],
    我的: [/我的/, /个人中心/, /商品优惠券/],
  },
  马上金融: {
    金融: [/finance-tab/, /finance-home/, /消金/, /金融/],
    运营: [/operation-tab/, /operation-home/, /运营/],
    客服: [/客服/],
    我的: [/my-tab/, /my-home/, /我的/],
  },
  小赢: {
    借钱: [/借钱/, /借款/, /首页首屏/, /额度/],
    权益: [/权益底导/, /会员权益页/],
    风险监测: [/风险监测/, /风险查询/, /麦穗信用/, /风险评估/],
    VIP卡: [/VIP季卡/, /VIP卡/, /会员权益购买/, /服务协议/],
    我的: [/我的/, /个人中心/, /设置/, /福利列表/],
  },
  拍拍贷借款: {
    借款: [/借款/, /额度/, /提额/, /经营认证/, /夫妻认证/, /同心借/, /助微免息/],
    活动: [/活动/, /签到/, /抽奖/, /邀请/, /奖励/, /钱包/],
    我的: [/我的/, /个人中心/, /精选服务/],
  },
}

function firstAppearanceOrder<T>(items: T[], getKey: (item: T) => string) {
  const order = new Map<string, number>()
  items.forEach((item) => {
    const key = getKey(item)
    if (!order.has(key)) order.set(key, order.size)
  })
  return order
}

function getCaptureSequence(item: Screenshot) {
  const numericParts = [item.materialId, item.id].join(' ').match(/(\d+)/g)
  return numericParts ? Number(numericParts[numericParts.length - 1]) : Number.MAX_SAFE_INTEGER
}

function inferBottomTab(item: Screenshot) {
  const node = item.node || ''
  const pageText = [item.pageCategory, item.pageSlot].join(' ')
  const contextText = [item.visualSummary, item.description, ...(item.tags || [])].join(' ')
  const text = [node, pageText, contextText].join(' ')
  const aliasMap = appTabAliases[item.competitor]

  if (aliasMap) {
    // 第一轮只看 node，优先识别截图真实所在的底部一级页；避免被文案里的“额度/购物/客服”等业务词带偏。
    for (const tab of appTabOrders[item.competitor] || Object.keys(aliasMap)) {
      if (aliasMap[tab]?.some((pattern) => pattern.test(node))) return tab
    }
    // 第二轮才看页面分类和说明，兜底处理节点名较弱的素材。
    for (const tab of appTabOrders[item.competitor] || Object.keys(aliasMap)) {
      if (aliasMap[tab]?.some((pattern) => pattern.test(text))) return tab
    }
  }

  if (/我的|个人中心|账户/.test(node)) return '我的'
  if (/首页|home|首屏|launch/.test(node)) return '首页'
  if (/消息|客服|帮助中心|在线咨询|FAQ|公众号|人工客服/.test(node)) return '客服'
  if (/购物|商城|买吖|商品|超市|618|补贴/.test(node)) return '购物'
  if (/借钱|借款|额度|查看额度|申请额度|金条|还款|账单|自动还款|借还记录|分期/.test(node)) return '借钱'
  return '其它'
}

function compareScreenshotsByAppTab(a: Screenshot, b: Screenshot) {
  const itemOrder = appItemOrderOverrides[a.competitor]
  if (itemOrder) {
    const aItemIndex = itemOrder.includes(a.materialId || a.id) ? itemOrder.indexOf(a.materialId || a.id) : itemOrder.length + 1
    const bItemIndex = itemOrder.includes(b.materialId || b.id) ? itemOrder.indexOf(b.materialId || b.id) : itemOrder.length + 1
    return aItemIndex - bItemIndex || getCaptureSequence(a) - getCaptureSequence(b)
  }

  const order = appTabOrders[a.competitor] || []
  const aTab = inferBottomTab(a)
  const bTab = inferBottomTab(b)
  const aTabIndex = order.includes(aTab) ? order.indexOf(aTab) : order.length + 1
  const bTabIndex = order.includes(bTab) ? order.indexOf(bTab) : order.length + 1
  return aTabIndex - bTabIndex || getCaptureSequence(a) - getCaptureSequence(b) || a.node.localeCompare(b.node, 'zh-Hans-CN')
}

function AppRowsView({ items, totalCount, onSelect }: { items: Screenshot[]; totalCount: number; onSelect?: (item: Screenshot) => void }) {
  const grouped = groupBy(items, (item) => item.competitor)
  const appOrder = firstAppearanceOrder(items, (item) => item.competitor)
  const apps = Object.keys(grouped).sort((a, b) => (appOrder.get(a) ?? 999) - (appOrder.get(b) ?? 999))
  return (
    <div className="compareView fullWidthCompareView">
      <div className="resultsToolbar evidenceToolbar">
        <div>
          <strong>按 APP 浏览</strong>
          <p>每一行是一个竞品 APP，默认展示二次筛选后的代表图；重复/异常图保留在自由搜索里。</p>
        </div>
        <span className="badge muted">默认展示 {items.length} / 全量 {totalCount} 张</span>
      </div>
      <div className="appCompareStack">
        {apps.map((app) => {
          const familyGroups = groupBy(grouped[app], getPageFamily)
          const families = Object.keys(familyGroups).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
          return (
            <section className="appCompareGroup" key={app}>
              <header>
                <div><strong>{app}</strong><span>{grouped[app].length} 张 / {families.length} 类页面</span></div>
              </header>
              <div className="compareThumbRow">
                {[...grouped[app]].sort(compareScreenshotsByAppTab).map((item) => <CompareThumb key={item.id} item={item} label={inferBottomTab(item)} onSelect={onSelect} />)}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function PageRowsView({ items, totalCount, onSelect }: { items: Screenshot[]; totalCount: number; onSelect?: (item: Screenshot) => void }) {
  const grouped = groupBy(items, getPageFamily)
  const preferred = ['首页/首屏', '我的页/个人中心', '借钱/额度页', '还款/账单页', '客服/帮助中心', '风险报告/信用评估', '实名/人脸/授权', '活动/红包/签到', '会员/权益', '购物/商城', '理财/保险/资产', '短视频/社区', '弹窗/遮挡/异常', '其它页面']
  const families = Object.keys(grouped).sort((a, b) => (preferred.indexOf(a) === -1 ? 99 : preferred.indexOf(a)) - (preferred.indexOf(b) === -1 ? 99 : preferred.indexOf(b)))
  return (
    <div className="compareView fullWidthCompareView">
      <div className="resultsToolbar evidenceToolbar">
        <div>
          <strong>按页面对比</strong>
          <p>每一行是一个页面主题，默认使用代表图横向对比各 APP；重复/异常图不进入普通浏览流。</p>
        </div>
        <span className="badge muted">默认展示 {items.length} / 全量 {totalCount} 张</span>
      </div>
      <div className="appCompareStack">
        {families.map((family) => {
          const appGroups = groupBy(grouped[family], (item) => item.competitor)
          const apps = Object.keys(appGroups).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
          return (
            <section className="appCompareGroup pageCompareGroup" key={family}>
              <header>
                <div><strong>{family}</strong><span>{grouped[family].length} 张 / {apps.length} 个 APP</span></div>
                <small>{apps.join(' / ')}</small>
              </header>
              <div className="compareThumbRow">
                {apps.flatMap((app) => appGroups[app].map((item) => <CompareThumb key={item.id} item={item} label={app} onSelect={onSelect} />))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function CompareThumb({ item, onSelect }: { item: Screenshot; label?: string; onSelect?: (item: Screenshot) => void }) {
  return (
    <button className="compareThumb imageOnlyThumb" onClick={() => onSelect?.(item)} aria-label={`${item.competitor} ${item.node}`} title={`${item.competitor} ${item.node}`}>
      <img src={withBase(item.thumbnailPath || item.imagePath)} alt={`${item.competitor} ${item.node}`} loading="lazy" />
      <span className="thumbPageLabel">{item.node}</span>
    </button>
  )
}

function summarizeEvidence(items: Screenshot[]) {
  const labels = ['主观察证据', '边界证据', '复核证据', '不可用/回采证据']
  return labels.map((label) => ({ label, count: items.filter((item) => item.evidenceValue?.includes(label.replace('证据', '')) || item.evidenceValue === label).length }))
}

function filterScreenshots(filters: { query?: string; competitor?: string; dimension?: string; evidenceValue?: string; reviewState?: string; dataset?: string; timeline?: string; pageFamily?: string }) {
  const q = (filters.query || '').trim().toLowerCase()
  const sourceItems = filters.dataset === 'evidence269' ? eightAppScreenshots : filters.dataset === 'historical' ? screenshots : allLibraryScreenshots
  return sourceItems.filter((item) => {
    const searchableText = [
      item.id,
      item.materialId,
      item.competitor,
      item.flow,
      item.node,
      item.description,
      item.visualSummary,
      item.qualityNote,
      item.evidenceValue,
      item.canUseForSummary,
      item.reviewReason,
      ...item.tags,
      ...(item.keyText || item.visibleText || []),
      ...item.businessModules,
    ].join(' ').toLowerCase()
    const matchesQuery = !q || searchableText.includes(q)
    const itemDimension = item.finalDimension || item.flow
    const matchesReview = !filters.reviewState || filters.reviewState === 'all' ||
      (filters.reviewState === 'needsReview' && item.needsReview === '是') ||
      (filters.reviewState === 'riskBoundary' && item.riskBoundary === '是') ||
      (filters.reviewState === 'summaryReady' && item.canUseForSummary?.includes('可引用'))
    return (
      matchesQuery &&
      (!filters.competitor || filters.competitor === 'all' || item.appKey === filters.competitor) &&
      (!filters.dimension || filters.dimension === 'all' || itemDimension === filters.dimension || item.businessModules.includes(filters.dimension)) &&
      (!filters.pageFamily || filters.pageFamily === 'all' || getPageFamily(item) === filters.pageFamily) &&
      (!filters.evidenceValue || filters.evidenceValue === 'all' || item.evidenceValue === filters.evidenceValue) &&
      matchesReview &&
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
  const dimension = item.finalDimension || item.flow
  const isContentBoundary = dimension === '非金融内容/社区'
  return (
    <article className="shotCard evidenceShotCard" onClick={() => onSelect?.(item)}>
      <div className="shotImageWrap evidenceImageWrap">
        {item.imagePath ? <img src={withBase(item.thumbnailPath || item.imagePath)} alt={`${item.competitor} ${item.node}`} loading="lazy" /> : <span>暂无截图</span>}
      </div>
      <div className="shotBody evidenceShotBody">
        <div className="row wrap">
          <span className="badge">{item.competitor}</span>
          <span className="badge muted">{dimension}</span>
          {item.evidenceValue && <span className={evidenceBadgeClass(item.evidenceValue)}>{item.evidenceValue}</span>}
          {isContentBoundary && <span className="badge warning">内容社区边界</span>}
        </div>
        <h3>{item.node}</h3>
        <p>{item.visualSummary || item.description}</p>
        <div className="evidenceFactList">
          {item.materialId && <span><strong>ID</strong>{item.materialId}</span>}
          {item.riskBoundary && <span><strong>敏感边界</strong>{item.riskBoundary}</span>}
          {item.needsReview && <span><strong>复核</strong>{item.needsReview}</span>}
        </div>
        <div className="metaLine"><span>{item.capturedAt}</span><span>{item.qualityNote || item.businessModules.join(' / ')}</span></div>
        <div className="tagRow">{item.tags.slice(0, 5).map((tag) => <span key={tag}>#{tag}</span>)}</div>
      </div>
    </article>
  )
}

function evidenceBadgeClass(value: string) {
  if (value.includes('主观察')) return 'badge success'
  if (value.includes('边界')) return 'badge warning'
  if (value.includes('复核')) return 'badge review'
  if (value.includes('不可用')) return 'badge danger'
  return 'badge muted'
}

function ScreenshotDetail({ item, onClose }: { item: Screenshot; onClose: () => void }) {
  const dimension = item.finalDimension || item.flow
  return (
    <div className="detailOverlay" role="dialog" aria-modal="true">
      <div className="detailBackdrop" onClick={onClose} />
      <article className="detailPanel evidenceDetailPanel">
        <button className="closeButton" onClick={onClose}>关闭</button>
        <div className="detailImage">
          <img src={withBase(item.imagePath)} alt={`${item.competitor} ${item.node}`} />
        </div>
        <div className="detailBody evidenceDetailBody">
          <div className="row wrap">
            <span className="badge">{item.competitor}</span>
            <span className="badge muted">{dimension}</span>
            {item.evidenceValue && <span className={evidenceBadgeClass(item.evidenceValue)}>{item.evidenceValue}</span>}
          </div>
          <h2>{item.node}</h2>
          <p>{item.visualSummary || item.description}</p>
          <dl className="detailMeta evidenceDetailMeta">
            <div><dt>material_id</dt><dd>{item.materialId || item.id}</dd></div>
            <div><dt>页面位点</dt><dd>{item.pageSlot || item.pageCategory || item.node}</dd></div>
            <div><dt>关键文案</dt><dd>{(item.keyText || item.visibleText || []).join('；') || '—'}</dd></div>
            <div><dt>质量说明</dt><dd>{item.qualityNote || '画面可判读'}</dd></div>
            <div><dt>敏感边界</dt><dd>{item.riskBoundary || '—'}</dd></div>
            <div><dt>是否需复核</dt><dd>{item.needsReview || '—'}</dd></div>
            <div><dt>摘要引用策略</dt><dd>{item.canUseForSummary || '—'}</dd></div>
            <div><dt>置信度</dt><dd>{item.confidence || '—'}</dd></div>
            <div><dt>证据路径</dt><dd>{item.evidencePath || item.sourcePath}</dd></div>
            {item.reviewReason && <div><dt>复核原因</dt><dd>{item.reviewReason}</dd></div>}
          </dl>
          <div className="tagRow">{item.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
        </div>
      </article>
    </div>
  )
}

function Flows() {
  const [category, setCategory] = useState<'all' | FlowCategory>('all')
  const [query, setQuery] = useState('')
  const [app, setApp] = useState('all')
  const [flowType, setFlowType] = useState('all')
  const flowApps = Array.from(new Set(flowDeliverables.map((deliverable) => deliverable.competitor))).sort()
  const flowTypes = Array.from(new Set(flowDeliverables.map((deliverable) => deliverable.flowType))).sort()
  const categoryItems = flowCategoryOrder
    .map((item) => ({ key: item, ...flowCategoryMeta[item], count: flowDeliverables.filter((deliverable) => getFlowCategory(deliverable) === item).length }))
    .filter((item) => item.count > 0)
  const q = query.trim().toLowerCase()
  const visibleDeliverables = flowDeliverables.filter((deliverable) => {
    const text = [deliverable.flowName, deliverable.competitor, deliverable.summary, deliverable.flowType, deliverable.currentEndpoint, ...(deliverable.primaryPath || []), ...(deliverable.branchPaths || [])].join(' ').toLowerCase()
    return (
      (!q || text.includes(q)) &&
      (category === 'all' || getFlowCategory(deliverable) === category) &&
      (app === 'all' || deliverable.competitor === app) &&
      (flowType === 'all' || deliverable.flowType === flowType)
    )
  })
  return (
    <section className="page widePage">
      <Header title="黄金流程" subtitle="查看竞品关键业务流程的完整路径与页面证据。" />
      <div className="flowCategoryTabs" aria-label="流程类型分类">
        <button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>
          <strong>全部流程</strong>
          <span>{flowDeliverables.length}</span>
        </button>
        {categoryItems.map((item) => (
          <button key={item.key} className={category === item.key ? 'active' : ''} onClick={() => setCategory(item.key)} title={item.description}>
            <strong>{item.label}</strong>
            <span>{item.count}</span>
          </button>
        ))}
      </div>
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
        {visibleDeliverables.map((deliverable) => (
          <FlowCard key={deliverable.flowId} deliverable={deliverable} />
        ))}
      </div>
      {visibleDeliverables.length === 0 && <div className="emptyState">没有匹配的流程，可以调整筛选条件。</div>}
    </section>
  )
}

function getFlowCategory(deliverable: FlowDeliverable): FlowCategory {
  if (deliverable.category) return deliverable.category
  const flowType = deliverable.flowType || ''
  const flowId = deliverable.flowId || ''
  if (flowType.includes('授信') || flowType.includes('额度') || flowId.includes('credit')) return 'credit'
  if (flowType.includes('注销') || flowId.includes('cancellation')) return 'cancellation'
  if (flowType.includes('客服') || flowType.includes('投诉') || flowId.includes('customer') || flowId.includes('complaint')) return 'customer_service'
  if (deliverable.status === 'partial' || flowId.includes('blocked')) return 'blocked'
  return 'other'
}

function getFlowCategoryMeta(deliverable: FlowDeliverable) {
  return flowCategoryMeta[getFlowCategory(deliverable)]
}

function FlowCard({ deliverable }: { deliverable: FlowDeliverable }) {
  const flow = flows.find((item) => item.id === deliverable.flowId || (item.competitor === deliverable.competitor && item.flowName.includes('消金')))

  return <GoldenFlowShowcase flow={flow} deliverable={deliverable} />
}

function GoldenFlowShowcase({ flow, deliverable }: { flow?: Flow; deliverable: FlowDeliverable }) {
  const mainPath = deliverable.primaryPath?.length ? deliverable.primaryPath : (flow?.nodes.map((node) => node.name) || [])
  const branches = deliverable.branchPaths || []
  const categoryMeta = getFlowCategoryMeta(deliverable)
  const [viewerOpen, setViewerOpen] = useState(false)
  return (
    <article className="panel flowCard goldenFlowCard">
      <div className="goldenFlowTopline">
        <div>
          <div className="flowCardBadges">
            <span className={`flowCategoryBadge ${getFlowCategory(deliverable)}`}>{categoryMeta.shortLabel}</span>
            <span className="flowStatusBadge">{deliverable.status === 'available' ? '已达标' : '待补采'}</span>
          </div>
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
