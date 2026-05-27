import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const PORT = Number(process.env.CSH_PORT || 8787)
const root = process.cwd()
const runtimeDir = path.join(root, 'data/runtime')
const tasksPath = path.join(runtimeDir, 'tasks.json')
const publicTaskDir = path.join(root, 'public/screenshots/tasks')
const baseUrl = `http://127.0.0.1:${PORT}`

fs.mkdirSync(runtimeDir, { recursive: true })
fs.mkdirSync(publicTaskDir, { recursive: true })
if (!fs.existsSync(tasksPath)) fs.writeFileSync(tasksPath, '[]\n')

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}
function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
}
function readTasks() { return readJson(tasksPath, []) }
function writeTasks(tasks) { writeJson(tasksPath, tasks) }
function send(res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  })
  res.end(JSON.stringify(data))
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      if (!body) return resolve({})
      try { resolve(JSON.parse(body)) } catch (error) { reject(error) }
    })
  })
}
function nowText() { return new Date().toLocaleString('zh-CN', { hour12: false }) }
function hasRisk(text) { return /身份证|人脸|银行卡|借款提交|授信提交|签约|验证码|支付|提现|还款|转账/.test(text || '') }
function normalizeTask(input) {
  const created = new Date()
  const risk = hasRisk(`${input.flow || ''}${input.requestText || ''}${input.summary || ''}`)
  return {
    id: input.id || `task-${created.getTime()}`,
    title: input.title || `采集${input.competitor || input.app || '未知APP'}：${input.flow || '通用流程'}`,
    competitor: input.competitor || input.app || '未知APP',
    flow: input.flow || '通用流程',
    status: risk ? '等待人工接管' : '已收到',
    summary: input.summary || input.requestText || (risk ? '需求涉及高风险节点，自动采集会在安全停点暂停，并等待维护者人工接管。' : '已收到采集需求，等待本地执行器处理。'),
    requestText: input.requestText || input.summary || '',
    priority: input.priority || '中',
    updatedAt: nowText(),
    nodes: input.nodes || [
      { name: '需求提交', status: '已收到' },
      { name: risk ? '安全判断' : '等待排队', status: risk ? '等待人工接管' : '排队中', note: risk ? '命中高风险关键词' : '待本地执行器处理' },
    ],
    artifacts: input.artifacts || [],
  }
}

function appKeyForName(name) {
  const map = {
    '马上金融': 'mashang', '度小满': 'duxiaoman', '度小满金融': 'duxiaoman', '分期乐': 'fenqile',
    '小赢卡贷': 'xiaoying', '小赢': 'xiaoying', '奇富借条': 'qifu', '安逸花': 'anyihua',
    '拍拍贷': 'paipaidai', '京东金融': 'jd-finance'
  }
  return map[name] || name || 'unknown'
}
function slug(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'task-capture'
}
function promoteTask(taskId, review = {}) {
  const tasks = readTasks()
  const task = tasks.find((item) => item.id === taskId)
  if (!task) return { ok: false, status: 404, error: 'task not found' }
  if (!task.artifacts?.length) return { ok: false, status: 400, error: 'task has no screenshots' }
  if (!review.sensitiveConfirmed || !review.classificationConfirmed) return { ok: false, status: 400, error: 'review confirmation required' }
  if (task.status !== '已完成' && !review.allowPartial) return { ok: false, status: 400, error: 'partial task requires confirmation' }
  const screenshotsPath = path.join(root, 'data/screenshots.json')
  const screenshots = readJson(screenshotsPath, [])
  const today = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const appKey = appKeyForName(task.competitor)
  const flow = review.flow || (task.plan?.routeKey === 'customer_chat_to_human_flow' ? '客服会话转人工流程' : (task.flow || '任务采集'))
  const flowKey = task.plan?.routeKey || `task-${slug(flow)}`

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
    sensitiveStatus: review.sensitiveConfirmed ? 'reviewed-needs-desensitization-check' : 'needs-review',
    classificationStatus: 'task-auto-classified',
    sourceType: 'task-capture',
    sourceTaskId: task.id,
    reviewNote: review.note || '',
    sourcePath: path.join('public', artifact.imagePath),
  }))
  screenshots.unshift(...additions)
  writeJson(screenshotsPath, screenshots)
  task.promotedAt = nowText()
  task.promotedScreenshotIds = additions.map((item) => item.id)
  task.promoteReview = review
  writeTasks(tasks)
  return { ok: true, status: 200, added: additions.length, screenshotIds: task.promotedScreenshotIds }
}

function findAdb() {
  const candidates = [
    process.env.ADB_PATH,
    'adb',
    path.join(process.env.HOME || '', 'Library/Android/sdk/platform-tools/adb'),
    path.join(process.env.HOME || '', 'Android/Sdk/platform-tools/adb'),
  ].filter(Boolean)
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['version'], { encoding: 'utf8' })
    if (result.status === 0) return candidate
  }
  return null
}
function captureWithAdb(taskId, options = {}) {
  const adb = findAdb()
  if (!adb) return { ok: false, reason: '未找到 adb。请安装 Android platform-tools，或设置 ADB_PATH。' }

  const devices = spawnSync(adb, ['devices'], { encoding: 'utf8' })
  if (devices.status !== 0) return { ok: false, reason: devices.stderr || 'adb devices 执行失败' }
  const connected = devices.stdout.split('\n').slice(1).map((line) => line.trim()).filter((line) => line.endsWith('\tdevice'))
  if (connected.length === 0) return { ok: false, reason: '未发现已连接且授权的 Android 设备。' }

  if (options.packageName) {
    const launch = spawnSync(adb, ['shell', 'monkey', '-p', options.packageName, '-c', 'android.intent.category.LAUNCHER', '1'], { encoding: 'utf8' })
    if (launch.status !== 0) return { ok: false, reason: launch.stderr || `无法启动 APP：${options.packageName}` }
    spawnSync(adb, ['shell', 'sleep', String(options.waitSeconds || 3)], { encoding: 'utf8' })
  }

  const dir = path.join(publicTaskDir, taskId)
  fs.mkdirSync(dir, { recursive: true })
  const filename = `capture-${Date.now()}.png`
  const dest = path.join(dir, filename)
  const screencap = spawnSync(adb, ['exec-out', 'screencap', '-p'], { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 })
  if (screencap.status !== 0 || !screencap.stdout?.length) return { ok: false, reason: screencap.stderr?.toString() || 'adb 截图失败' }
  fs.writeFileSync(dest, screencap.stdout)
  return { ok: true, imagePath: `/screenshots/tasks/${taskId}/${filename}`, device: connected[0].split('\t')[0] }
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 200, { ok: true })
  const url = new URL(req.url || '/', baseUrl)

  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return send(res, 200, { ok: true, service: 'competitor-screenshot-hub-local-task-server', adb: Boolean(findAdb()) })
    }
    if (req.method === 'GET' && url.pathname === '/api/tasks') {
      return send(res, 200, readTasks())
    }
    if (req.method === 'POST' && url.pathname === '/api/tasks') {
      const body = await readBody(req)
      const task = normalizeTask(body)
      const tasks = readTasks()
      writeTasks([task, ...tasks])
      return send(res, 201, task)
    }
    const match = url.pathname.match(/^\/api\/tasks\/([^/]+)\/(capture|events|promote)$/)
    if (req.method === 'POST' && match) {
      const [, taskId, action] = match
      const tasks = readTasks()
      const idx = tasks.findIndex((task) => task.id === taskId)
      if (idx < 0) return send(res, 404, { error: 'task not found' })
      if (action === 'promote') {
        const body = await readBody(req)
        const result = promoteTask(taskId, body)
        return send(res, result.status, result.ok ? { ok: true, added: result.added, screenshotIds: result.screenshotIds } : { error: result.error })
      }
      if (action === 'events') {
        const body = await readBody(req)
        tasks[idx] = { ...tasks[idx], ...body, updatedAt: nowText() }
        writeTasks(tasks)
        return send(res, 200, tasks[idx])
      }
      const body = await readBody(req)
      const result = captureWithAdb(taskId, body)
      if (!result.ok) {
        tasks[idx].status = '失败'
        tasks[idx].summary = `采集未完成：${result.reason}`
        tasks[idx].updatedAt = nowText()
        tasks[idx].nodes = [...(tasks[idx].nodes || []), { name: '本地截图', status: '失败', note: result.reason }]
        writeTasks(tasks)
        return send(res, 200, tasks[idx])
      }
      const artifact = { type: 'screenshot', imagePath: result.imagePath, createdAt: nowText(), device: result.device }
      tasks[idx].status = '已完成'
      tasks[idx].summary = '已完成一次当前页面截图采集。'
      tasks[idx].updatedAt = nowText()
      tasks[idx].artifacts = [...(tasks[idx].artifacts || []), artifact]
      tasks[idx].nodes = [...(tasks[idx].nodes || []), { name: '当前页面截图', status: '已采集', note: result.imagePath }]
      writeTasks(tasks)
      return send(res, 200, tasks[idx])
    }
    send(res, 404, { error: 'not found' })
  } catch (error) {
    send(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
}

http.createServer(handler).listen(PORT, '127.0.0.1', () => {
  console.log(`Local task server listening on http://127.0.0.1:${PORT}`)
  console.log(`Tasks file: ${tasksPath}`)
})
