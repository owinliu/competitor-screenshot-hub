import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const INTERVAL_MS = Number(process.env.CSH_EXECUTOR_INTERVAL_MS || 3000)
const PLANNER_SESSION = process.env.CSH_PLANNER_SESSION || 'competitor-screenshot-planner'
const root = process.cwd()
const tasksPath = path.join(root, 'data/runtime/tasks.json')
const publicTaskDir = path.join(root, 'public/screenshots/tasks')
const capabilities = JSON.parse(fs.readFileSync(path.resolve('data/supported-capabilities.json'), 'utf8'))
const routes = JSON.parse(fs.readFileSync(path.resolve('data/capture-routes.json'), 'utf8'))
const runnableStatuses = new Set(['已收到', '排队中'])
const riskPattern = /身份证|人脸|银行卡|借款提交|授信提交|签约|验证码|支付|提现|还款|转账/
const autoPublish = process.env.CSH_AUTO_PUBLISH !== '0'

function nowText() { return new Date().toLocaleString('zh-CN', { hour12: false }) }
function readTasks() { try { return JSON.parse(fs.readFileSync(tasksPath, 'utf8')) } catch { return [] } }
function writeTasks(tasks) { fs.writeFileSync(tasksPath, `${JSON.stringify(tasks, null, 2)}\n`) }
function updateTask(taskId, patch) {
  const tasks = readTasks()
  const idx = tasks.findIndex((task) => task.id === taskId)
  if (idx < 0) throw new Error(`task not found: ${taskId}`)
  tasks[idx] = { ...tasks[idx], ...patch, updatedAt: nowText() }
  writeTasks(tasks)
  return tasks[idx]
}

function publishTaskArtifacts(taskId) {
  if (!autoPublish) return { ok: true, skipped: true, reason: 'CSH_AUTO_PUBLISH=0' }
  const result = spawnSync(process.execPath, ['scripts/publish-task-artifacts.mjs', taskId], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 })
  const message = `${result.stdout || ''}${result.stderr || ''}`.trim()
  if (result.status !== 0) {
    console.error(`[executor] publish failed for ${taskId}: ${message}`)
    return { ok: false, message }
  }
  console.log(`[executor] published task artifacts for ${taskId}`)
  return { ok: true, message }
}

function updateTaskPublishState(taskId, publishResult) {
  const publishNode = publishResult.ok
    ? { name: '同步线上截图', status: publishResult.skipped ? '已跳过' : '已发布', note: publishResult.skipped ? publishResult.reason : '任务状态和截图已推送到 GitHub Pages，等待 Actions 部署生效。' }
    : { name: '同步线上截图', status: '失败', note: publishResult.message || 'git push failed' }
  return updateTask(taskId, {
    publishStatus: publishResult.ok ? (publishResult.skipped ? 'skipped' : 'published') : 'failed',
    publishMessage: publishNode.note,
    nodes: [...(readTasks().find((task) => task.id === taskId)?.nodes || []), publishNode],
  })
}

function inferIntentKey(text) {
  if (/转人工|人工客服|人工服务|联系人工/.test(text) && /客服|会话|在线/.test(text)) return 'customer_chat_to_human_flow'
  if (/客服.*会话|会话.*客服|在线客服|客服聊天/.test(text)) return 'customer_chat_flow'
  if (/投诉|反馈|消保|消费者保护/.test(text)) return 'complaint_feedback_flow'
  if (/客服|帮助|服务/.test(text)) return 'customer_entry'
  return 'generic_app_flow'
}

function appByName(nameOrText) {
  return capabilities.find((app) => nameOrText.includes(app.appName) || nameOrText.toLowerCase().includes(app.appKey)) || null
}

function routeForIntent(intentKey) {
  if (intentKey === 'generic_app_flow') return null
  return routes.find((route) => route.intentKey === intentKey || route.routeKey === intentKey) || null
}

function normalizePlan(raw, task) {
  const text = `${task.title || ''}${task.competitor || ''}${task.flow || ''}${task.summary || ''}${task.requestText || ''}`
  const targetName = raw.targetApp || raw.appName || task.competitor || ''
  const matched = appByName(`${targetName}${text}`)
  const intentKey = raw.intentKey || raw.taskType || inferIntentKey(text)
  const route = routeForIntent(intentKey)
  const risk = riskPattern.test(text) || raw.riskLevel === 'high'
  return {
    appKey: matched?.appKey || raw.appKey || null,
    appName: matched?.appName || targetName || raw.appName || task.competitor,
    packageName: matched?.packageName || raw.packageName || null,
    intentKey,
    routeKey: route?.routeKey || intentKey,
    requestType: raw.requestType || raw.taskType || task.flow || intentKey,
    riskLevel: risk ? 'high' : (raw.riskLevel || 'low'),
    canAutoCapture: Boolean(matched && !risk && intentKey !== 'generic_app_flow'),
    stopReason: risk ? '需求命中高风险节点，等待人工接管。' : (raw.stopReason || null),
    captureGoal: raw.goal || raw.captureGoal || route?.description || '采集用户指定流程。',
    expectedNodes: raw.expectedNodes || route?.expectedNodes || [],
    steps: raw.steps || route?.expectedNodes || [],
    planner: raw.planner || 'openclaw',
  }
}

function fallbackPlan(task) {
  const text = `${task.title || ''}${task.competitor || ''}${task.flow || ''}${task.summary || ''}${task.requestText || ''}`
  return normalizePlan({ intentKey: inferIntentKey(text), planner: 'fallback' }, task)
}

function extractJson(text) {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  try { return JSON.parse(cleaned) } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (match) return JSON.parse(match[0])
  throw new Error(`Planner did not return JSON: ${text.slice(0, 200)}`)
}

function planWithOpenClaw(task) {
  const rawNeed = task.requestText || task.summary || `${task.title || ''} ${task.competitor || ''} ${task.flow || ''}`
  const appNames = capabilities.map((app) => app.appName)
  const intentNames = JSON.parse(fs.readFileSync(path.resolve('data/intent-types.json'), 'utf8')).map((intent) => ({ intentKey: intent.intentKey, intentName: intent.intentName, expectedNodes: intent.expectedNodes }))
  const prompt = `请理解用户的竞品APP截图采集需求。只输出JSON，不要markdown。\n\n用户原始需求：${rawNeed}\n\n可选APP：${appNames.join('、')}\n\n可选任务类型：${JSON.stringify(intentNames)}\n\n请输出：{\"targetApp\":\"APP名\",\"intentKey\":\"任务类型key\",\"goal\":\"用户真正想采集的完整流程目标\",\"expectedNodes\":[\"应采集节点1\"],\"riskLevel\":\"low|medium|high\",\"stopReason\":null或说明}\n\n注意：如果用户说“客服会话”“人工客服”“转人工”，意图应是 customer_chat_to_human_flow 或 customer_chat_flow，不能降级成 customer_entry。`
  const sessionId = `${PLANNER_SESSION}-${task.id}`.slice(0, 80)
  const result = spawnSync('openclaw', ['agent', '--session-id', sessionId, '--message', prompt, '--json', '--timeout', '180'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'openclaw agent failed')
  const payload = JSON.parse(result.stdout)
  const text = payload?.result?.payloads?.[0]?.text
  if (!text) throw new Error('openclaw planner returned empty payload')
  return normalizePlan({ ...extractJson(text), planner: 'openclaw' }, task)
}

function findAdb() {
  const candidates = [process.env.ADB_PATH, 'adb', path.join(process.env.HOME || '', 'Library/Android/sdk/platform-tools/adb'), path.join(process.env.HOME || '', 'Android/Sdk/platform-tools/adb')].filter(Boolean)
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['version'], { encoding: 'utf8' })
    if (result.status === 0) return candidate
  }
  return null
}

function adbCheck(adb) {
  const devices = spawnSync(adb, ['devices'], { encoding: 'utf8' })
  const connected = devices.stdout.split('\n').slice(1).map((line) => line.trim()).filter((line) => line.endsWith('\tdevice'))
  if (connected.length === 0) return { ok: false, reason: '未发现已连接且授权的 Android 设备。' }
  return { ok: true, device: connected[0].split('\t')[0] }
}

function adbShell(adb, args, options = {}) {
  return spawnSync(adb, ['shell', ...args], { encoding: options.encoding || 'utf8', maxBuffer: options.maxBuffer || 10 * 1024 * 1024 })
}

function screenshot(adb, taskId, label, artifacts, nodes, device) {
  const dir = path.join(publicTaskDir, taskId)
  fs.mkdirSync(dir, { recursive: true })
  const safeLabel = label.replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'capture'
  const filename = `${String(artifacts.length + 1).padStart(2, '0')}-${safeLabel}-${Date.now()}.png`
  const dest = path.join(dir, filename)
  const screencap = spawnSync(adb, ['exec-out', 'screencap', '-p'], { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 })
  if (screencap.status !== 0 || !screencap.stdout?.length) throw new Error(screencap.stderr?.toString() || 'adb 截图失败')
  fs.writeFileSync(dest, screencap.stdout)
  const imagePath = `/screenshots/tasks/${taskId}/${filename}`
  artifacts.push({ type: 'screenshot', imagePath, label, createdAt: nowText(), device })
  nodes.push({ name: label, status: '已采集', note: imagePath })
}

function dumpUi(adb) {
  adbShell(adb, ['uiautomator', 'dump', '/sdcard/window.xml'])
  const result = spawnSync(adb, ['exec-out', 'cat', '/sdcard/window.xml'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  return result.stdout || ''
}

function decodeXml(value) {
  return value.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

function parseNodes(xml) {
  return [...xml.matchAll(/<node\s+([^>]+)>/g)].map((match) => {
    const attrs = match[1]
    const get = (name) => decodeXml(attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1] || '')
    const boundsText = get('bounds')
    const bounds = boundsText.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/)
    return {
      text: get('text'),
      desc: get('content-desc'),
      className: get('class'),
      clickable: get('clickable') === 'true',
      bounds: bounds ? bounds.slice(1).map(Number) : null,
    }
  }).filter((node) => node.bounds)
}

function nodeLabel(node) {
  return `${node.text || ''} ${node.desc || ''}`.trim()
}

function findNode(xml, candidates, options = {}) {
  const nodes = parseNodes(xml)
  const blocked = options.exclude || []
  for (const candidate of candidates) {
    const found = nodes.find((node) => {
      const label = nodeLabel(node)
      return label.includes(candidate) && !blocked.some((word) => label.includes(word))
    })
    if (found) return { node: found, candidate }
  }
  return null
}

function dismissObstacles(adb, nodes, maxRounds = 3) {
  const safeClose = ['我知道了', '知道了', '关闭', '取消', '稍后再说', '暂不', '跳过', '下次再说', '以后再说', '不允许', '暂不开启', '放弃', '忽略']
  const risky = ['去借款', '立即借款', '确认借款', '申请借款', '提交', '授权', '同意协议', '确认授权', '支付', '提现', '还款']
  let closed = 0
  for (let round = 0; round < maxRounds; round += 1) {
    const xml = dumpUi(adb)
    const text = xml.replace(/\s+/g, '')
    const hasOverlayHint = /弹窗|dialog|提额|降息|优惠|活动|奖励|更新|权限|通知|您已|恭喜|领取|借款/.test(text)
    const found = findNode(xml, safeClose, { exclude: risky })
    if (found) {
      const tapped = tapNode(adb, found, 1)
      closed += 1
      nodes.push({ name: '弹窗/浮层处理', status: '已关闭', note: `点击「${tapped.candidate}」(${tapped.x},${tapped.y})` })
      continue
    }

    const closeIcon = parseNodes(xml).find((node) => {
      const label = nodeLabel(node)
      if (!/[×xX✕]|关闭/.test(label)) return false
      if (risky.some((word) => label.includes(word))) return false
      const [x1, y1, x2, y2] = node.bounds
      const width = x2 - x1
      const height = y2 - y1
      return width <= 140 && height <= 140
    })
    if (closeIcon && hasOverlayHint) {
      const tapped = tapNode(adb, { node: closeIcon, candidate: nodeLabel(closeIcon) || '关闭图标' }, 1)
      closed += 1
      nodes.push({ name: '弹窗/浮层处理', status: '已关闭', note: `点击关闭图标「${tapped.candidate}」(${tapped.x},${tapped.y})` })
      continue
    }
    break
  }
  return closed
}

function tapNode(adb, found, waitSeconds = 2) {
  const [x1, y1, x2, y2] = found.node.bounds
  const x = Math.round((x1 + x2) / 2)
  const y = Math.round((y1 + y2) / 2)
  adbShell(adb, ['input', 'tap', String(x), String(y)])
  adbShell(adb, ['sleep', String(waitSeconds)])
  return { x, y, candidate: found.candidate }
}

function findAndTapWithRecovery(adb, taskId, step, artifacts, nodes, device, routeKey) {
  const candidates = step.candidates || []
  for (let attempt = 0; attempt < 3; attempt += 1) {
    dismissObstacles(adb, nodes)
    const xml = dumpUi(adb)
    const found = findNode(xml, candidates)
    if (found) {
      const tapped = tapNode(adb, found)
      nodes.push({ name: step.label, status: '已点击', note: `点击「${tapped.candidate}」(${tapped.x},${tapped.y})` })
      screenshot(adb, taskId, step.label, artifacts, nodes, device)
      return { ok: true }
    }
    if (attempt < 2) adbShell(adb, ['sleep', '1'])
  }

  if (routeKey === 'customer_entry' && step.key === 'service-entry') {
    const explorationEntries = ['我的', '全部服务', '服务', '帮助', '设置', '消息']
    for (const entry of explorationEntries) {
      dismissObstacles(adb, nodes)
      const entryNode = findNode(dumpUi(adb), [entry])
      if (!entryNode) continue
      const tappedEntry = tapNode(adb, entryNode)
      nodes.push({ name: '客服入口探索', status: '已进入候选页面', note: `点击「${tappedEntry.candidate}」(${tappedEntry.x},${tappedEntry.y})` })
      screenshot(adb, taskId, `探索-${entry}`, artifacts, nodes, device)
      dismissObstacles(adb, nodes)
      const serviceNode = findNode(dumpUi(adb), candidates.filter((item) => item !== entry))
      if (serviceNode) {
        const tappedService = tapNode(adb, serviceNode)
        nodes.push({ name: step.label, status: '已点击', note: `在「${entry}」后点击「${tappedService.candidate}」(${tappedService.x},${tappedService.y})` })
        screenshot(adb, taskId, step.label, artifacts, nodes, device)
        return { ok: true }
      }
      adbShell(adb, ['input', 'keyevent', '4'])
      adbShell(adb, ['sleep', '1'])
    }
  }

  screenshot(adb, taskId, `${step.label}-未找到入口`, artifacts, nodes, device)
  return { ok: false, reason: `关闭弹窗并重试后仍未找到可点击文本：${candidates.join(' / ')}` }
}

function runRouteWithAdb(taskId, plan, previousArtifacts = []) {
  const route = routes.find((item) => item.routeKey === plan.routeKey)
  const adb = findAdb()
  if (!adb) return { ok: false, reason: '未找到 adb。请安装 Android platform-tools，或设置 ADB_PATH。' }
  const check = adbCheck(adb)
  if (!check.ok) return check
  if (!plan.packageName) return { ok: false, reason: 'OpenClaw 未识别可启动的 APP packageName。' }

  const nodes = []
  const artifacts = [...previousArtifacts]
  const launch = adbShell(adb, ['monkey', '-p', plan.packageName, '-c', 'android.intent.category.LAUNCHER', '1'])
  if (launch.status !== 0) return { ok: false, reason: launch.stderr || `无法启动 APP：${plan.packageName}` }
  adbShell(adb, ['sleep', '3'])

  dismissObstacles(adb, nodes)

  if (!route) {
    screenshot(adb, taskId, `${plan.appName}入口截图`, artifacts, nodes, check.device)
    return { ok: true, status: '已完成', summary: `已按 OpenClaw 规划启动 ${plan.appName} 并完成入口截图。`, artifacts, nodes }
  }

  for (const step of route.steps) {
    dismissObstacles(adb, nodes)
    const xml = dumpUi(adb)
    if (route.stopPoints?.some((word) => xml.includes(word))) {
      nodes.push({ name: step.label, status: '等待人工接管', note: '页面出现高风险/认证关键词，自动采集暂停。' })
      return { ok: true, status: artifacts.length > 0 ? '部分完成' : '等待人工接管', summary: `部分完成：页面出现高风险/认证关键词，自动采集暂停。已采集 ${artifacts.length} 张。`, artifacts, nodes }
    }

    if (step.action === 'screenshot') {
      screenshot(adb, taskId, step.label, artifacts, nodes, check.device)
      continue
    }

    if (step.action === 'tapText') {
      const result = findAndTapWithRecovery(adb, taskId, step, artifacts, nodes, check.device, route.routeKey)
      if (!result.ok) {
        nodes.push({ name: step.label, status: '等待人工接管', note: result.reason })
        return { ok: true, status: artifacts.length > 0 ? '部分完成' : '等待人工接管', summary: `部分完成：未找到「${step.label}」入口。已采集 ${artifacts.length} 张。`, artifacts, nodes }
      }
      continue
    }

    if (step.action === 'inputAndEnter' || step.action === 'tapOrInputHuman') {
      dismissObstacles(adb, nodes)
      const found = findNode(dumpUi(adb), ['人工客服', '转人工', '人工服务', '联系人工', ...(step.inputCandidates || [])])
      if (found) {
        const tapped = tapNode(adb, found)
        nodes.push({ name: step.label, status: '已点击', note: `点击「${tapped.candidate}」(${tapped.x},${tapped.y})` })
        screenshot(adb, taskId, step.label, artifacts, nodes, check.device)
        continue
      }
      screenshot(adb, taskId, `${step.label}-未找到转人工`, artifacts, nodes, check.device)
      const inputs = parseNodes(xml).filter((node) => /EditText/.test(node.className || ''))
      if (inputs.length > 0 && step.text) {
        const [x1, y1, x2, y2] = inputs[0].bounds
        adbShell(adb, ['input', 'tap', String(Math.round((x1 + x2) / 2)), String(Math.round((y1 + y2) / 2))])
        adbShell(adb, ['input', 'text', step.text])
        adbShell(adb, ['input', 'keyevent', '66'])
        adbShell(adb, ['sleep', '2'])
        nodes.push({ name: step.label, status: '已输入', note: `输入「${step.text}」并发送` })
        screenshot(adb, taskId, step.label, artifacts, nodes, check.device)
        continue
      }
      nodes.push({ name: step.label, status: '等待人工接管', note: '未找到“人工客服/转人工”按钮或可输入会话框。' })
      return { ok: true, status: '部分完成', summary: `部分完成：未找到转人工入口或会话输入框。已采集 ${artifacts.length} 张。`, artifacts, nodes }
    }
  }

  return { ok: true, status: '已完成', summary: `已完成「${route.routeName}」采集，共 ${artifacts.length} 张截图。`, artifacts, nodes }
}

async function tick() {
  const tasks = readTasks()
  const task = tasks.find((item) => runnableStatuses.has(item.status))
  if (!task) return false

  console.log(`[executor] plan task ${task.id} ${task.title}`)
  updateTask(task.id, {
    status: '规划中',
    summary: '已接入 OpenClaw，正在理解网页采集需求并生成采集计划。',
    nodes: [...(task.nodes || []), { name: 'OpenClaw 理解需求', status: '规划中', note: '分析目标 APP、流程分类和安全边界' }],
  })

  let plan
  try {
    plan = planWithOpenClaw(task)
    console.log(`[executor] planner result ${JSON.stringify(plan)}`)
  } catch (error) {
    console.error('[executor] planner fallback:', error instanceof Error ? error.message : error)
    plan = fallbackPlan(task)
  }

  if (!plan.canAutoCapture || !plan.packageName) {
    updateTask(task.id, {
      status: '等待人工接管',
      summary: plan.stopReason || 'OpenClaw 判断该需求暂不适合自动采集，需要人工接管。',
      nodes: [...(task.nodes || []), { name: 'OpenClaw 采集计划', status: '等待人工接管', note: `${plan.routeKey || 'unknown'} · ${plan.captureGoal}` }],
      plan,
    })
    updateTaskPublishState(task.id, publishTaskArtifacts(task.id))
    return true
  }

  const plannedTask = updateTask(task.id, {
    status: '执行中',
    summary: `OpenClaw 已分类为「${plan.routeKey || '通用入口'}」：${plan.captureGoal}`,
    nodes: [...(task.nodes || []), { name: 'OpenClaw 采集计划', status: '可自动采集', note: (plan.steps || []).join(' -> ') }],
    plan,
  })

  const result = runRouteWithAdb(plannedTask.id, plan, plannedTask.artifacts || [])
  if (!result.ok) {
    updateTask(plannedTask.id, {
      status: '失败',
      summary: `采集未完成：${result.reason}`,
      nodes: [...(plannedTask.nodes || []), { name: 'APP流程执行', status: '失败', note: result.reason }],
    })
    updateTaskPublishState(plannedTask.id, publishTaskArtifacts(plannedTask.id))
    return true
  }

  updateTask(plannedTask.id, {
    status: result.status,
    summary: result.summary,
    artifacts: result.artifacts,
    nodes: [...(plannedTask.nodes || []), ...result.nodes],
  })
  updateTaskPublishState(plannedTask.id, publishTaskArtifacts(plannedTask.id))
  return true
}

console.log(`[executor] OpenClaw route planner enabled; polling task file every ${INTERVAL_MS}ms`)
while (true) {
  try { await tick() } catch (error) { console.error('[executor]', error instanceof Error ? error.message : error) }
  await delay(INTERVAL_MS)
}
