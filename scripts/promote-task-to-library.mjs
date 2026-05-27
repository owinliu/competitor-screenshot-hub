import fs from 'node:fs'
import path from 'node:path'

const taskId = process.argv[2]
if (!taskId) {
  console.error('Usage: node scripts/promote-task-to-library.mjs <taskId>')
  process.exit(1)
}

const tasks = JSON.parse(fs.readFileSync('data/runtime/tasks.json', 'utf8'))
const task = tasks.find((item) => item.id === taskId)
if (!task) throw new Error(`task not found: ${taskId}`)
if (!task.artifacts?.length) throw new Error(`task has no screenshots: ${taskId}`)

const screenshotsPath = 'data/screenshots.json'
const screenshots = JSON.parse(fs.readFileSync(screenshotsPath, 'utf8'))
const today = new Date().toISOString().slice(0, 10).replaceAll('-', '')
const appKeyMap = {
  '马上金融': 'mashang', '度小满': 'duxiaoman', '度小满金融': 'duxiaoman', '分期乐': 'fenqile', '小赢卡贷': 'xiaoying', '小赢': 'xiaoying', '奇富借条': 'qifu', '安逸花': 'anyihua', '拍拍贷': 'paipaidai', '京东金融': 'jd-finance'
}
const appKey = appKeyMap[task.competitor] || task.competitor
const flow = task.plan?.routeKey === 'customer_chat_to_human_flow' ? '客服会话转人工流程' : (task.flow || '任务采集')
const flowKey = task.plan?.routeKey || 'task-capture'

for (const shot of screenshots) {
  if (shot.appKey === appKey) shot.isLatestVersion = false
}

const additions = task.artifacts.map((artifact, index) => ({
  id: `${appKey}-${flowKey}-${today}-${String(index + 1).padStart(2, '0')}-${taskId.slice(-6)}`,
  competitor: task.competitor,
  appKey,
  flow,
  flowKey,
  node: artifact.label || `任务截图 ${index + 1}`,
  businessModules: flow.includes('客服') ? ['客服'] : ['待分类'],
  tags: [flow, '任务采集', '最新'],
  capturedAt: today,
  versionLabel: today,
  timelineGroup: today,
  isLatestVersion: true,
  imagePath: artifact.imagePath,
  description: `${task.competitor}「${flow}」任务采集截图：${artifact.label || `节点 ${index + 1}`}。`,
  visibleText: [],
  status: task.status === '已完成' ? 'captured' : 'partial',
  sensitiveStatus: 'needs-review',
  classificationStatus: 'task-auto-classified',
  sourceType: 'task-capture',
  sourceTaskId: task.id,
  sourcePath: path.join('public', artifact.imagePath),
}))

screenshots.unshift(...additions)
fs.writeFileSync(screenshotsPath, `${JSON.stringify(screenshots, null, 2)}\n`)
console.log(`promoted ${additions.length} screenshots from ${taskId}`)
