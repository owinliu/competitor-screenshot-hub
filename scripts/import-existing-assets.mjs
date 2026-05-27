import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const workspace = path.resolve('..')
const sourceRoot = '/Users/owinliu/Desktop/竞品分析'
const publicRoot = path.resolve('public/screenshots')
const dataDir = path.resolve('data')

const appMap = {
  '分期乐': { appKey: 'fenqile', appName: '分期乐' },
  '度小满金融': { appKey: 'duxiaoman', appName: '度小满金融' },
  '小赢': { appKey: 'xiaoying', appName: '小赢' },
  '奇富借条': { appKey: 'qifu', appName: '奇富借条' },
  '安逸花': { appKey: 'anyihua', appName: '安逸花' },
}

const moduleFlowMap = {
  '客服': { flow: '客服/消保', flowKey: 'customer-service', pageCategory: '客服' },
  '消金': { flow: '消金/借款', flowKey: 'consumer-finance', pageCategory: '消金' },
  '运营': { flow: '运营活动', flowKey: 'campaign', pageCategory: '运营活动' },
  '风控': { flow: '风控提示', flowKey: 'risk-control', pageCategory: '风控' },
}

function resolveFlowMeta(moduleName, fileBase) {
  if (moduleName !== 'APP') return moduleFlowMap[moduleName] || { flow: `${moduleName}流程`, flowKey: slug(moduleName), pageCategory: moduleName }
  const rules = [
    [/客服|服务|帮助|投诉|消保|对话/, { flow: 'APP-服务入口', flowKey: 'app-service-entry', pageCategory: '服务入口' }],
    [/借钱|借款|额度|授信/, { flow: 'APP-借钱入口', flowKey: 'app-loan-entry', pageCategory: '借钱入口' }],
    [/我的|账户|个人|设置/, { flow: 'APP-我的/账户', flowKey: 'app-account', pageCategory: '我的/账户' }],
    [/消息|通知|站内信/, { flow: 'APP-消息', flowKey: 'app-message', pageCategory: '消息' }],
    [/购物|商城|超市|商品/, { flow: 'APP-购物/商城', flowKey: 'app-shopping', pageCategory: '购物/商城' }],
    [/生活|权益|会员|福利/, { flow: 'APP-生活/权益', flowKey: 'app-benefits', pageCategory: '生活/权益' }],
    [/理财|保险/, { flow: 'APP-理财/保险', flowKey: 'app-wealth-insurance', pageCategory: '理财/保险' }],
    [/首页|启动/, { flow: 'APP-首页', flowKey: 'app-home', pageCategory: '首页' }],
  ]
  const matched = rules.find(([re]) => re.test(fileBase))
  return matched ? matched[1] : { flow: '待分类', flowKey: 'needs-classification', pageCategory: '待分类' }
}

const imageExts = new Set(['.png', '.jpg', '.jpeg', '.webp'])

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (imageExts.has(path.extname(entry.name).toLowerCase())) out.push(full)
  }
  return out
}

function slug(input) {
  return input
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function inferTags(moduleName, fileBase) {
  const text = `${moduleName} ${fileBase}`
  const tags = new Set([moduleName])
  const rules = [
    ['首页', /首页/],
    ['借钱', /借钱|借款|额度|授信/],
    ['我的', /我的/],
    ['消息', /消息/],
    ['客服', /客服|帮助|服务|对话|投诉|消保/],
    ['运营活动', /活动|券|免息|优惠|折扣|权益|卡券/],
    ['账单', /账单|还款/],
    ['理财', /理财/],
    ['保险', /保险/],
    ['风控提示', /风险|反诈|黑灰产|安全/],
  ]
  for (const [tag, re] of rules) if (re.test(text)) tags.add(tag)
  return [...tags]
}

function inferNode(fileBase) {
  return fileBase.replace(/^[0-9]{4}/, '').replace(/[_-]+/g, ' ').trim() || fileBase
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

const screenshots = []
const competitorCounts = new Map()

for (const [cnName, meta] of Object.entries(appMap)) {
  const appDir = path.join(sourceRoot, cnName)
  if (!fs.existsSync(appDir)) continue
  const files = walk(appDir).sort()
  competitorCounts.set(meta.appKey, files.length)
  files.forEach((file, index) => {
    const rel = path.relative(appDir, file)
    const parts = rel.split(path.sep)
    const moduleName = parts[0] || 'APP'
    const version = parts[1] || 'unknown'
    const ext = path.extname(file).toLowerCase()
    const fileBase = path.basename(file, ext)
    const flowMeta = resolveFlowMeta(moduleName, fileBase)
    const hash = crypto.createHash('sha1').update(`${meta.appKey}/${rel}`).digest('hex').slice(0, 8)
    const id = `${meta.appKey}-${flowMeta.flowKey}-${version}-${String(index + 1).padStart(3, '0')}-${hash}`
    const destRel = `${meta.appKey}/${flowMeta.flowKey}/${version}/${String(index + 1).padStart(3, '0')}-${slug(fileBase)}${ext}`
    const dest = path.join(publicRoot, destRel)
    copyFile(file, dest)

    screenshots.push({
      id,
      competitor: meta.appName,
      appKey: meta.appKey,
      flow: flowMeta.flow,
      flowKey: flowMeta.flowKey,
      node: inferNode(fileBase),
      businessModules: moduleName === 'APP' ? ['APP', flowMeta.pageCategory] : [moduleName],
      tags: inferTags(moduleName, fileBase),
      capturedAt: version,
      versionLabel: version,
      imagePath: `/screenshots/${destRel}`,
      description: `${meta.appName}「${moduleName}」模块 ${version} 版本截图：${inferNode(fileBase)}。`,
      visibleText: [],
      status: 'captured',
      sensitiveStatus: 'needs-review',
      classificationStatus: flowMeta.flowKey === 'needs-classification' ? 'needs-review' : 'imported-from-folder',
      sourceType: 'historical-import',
      pageCategory: flowMeta.pageCategory,
      sourcePath: file,
    })
  })
}

const competitors = Object.values(appMap)
  .filter((item) => competitorCounts.has(item.appKey))
  .map((item) => ({
    ...item,
    screenshotCount: competitorCounts.get(item.appKey) || 0,
    modules: [...new Set(screenshots.filter((shot) => shot.appKey === item.appKey).flatMap((shot) => shot.businessModules))],
  }))

const flowGroups = new Map()
for (const shot of screenshots) {
  const key = `${shot.appKey}-${shot.flowKey}`
  if (!flowGroups.has(key)) {
    flowGroups.set(key, {
      id: key,
      competitor: shot.competitor,
      flowName: shot.flow,
      status: 'captured',
      summary: `${shot.competitor} ${shot.flow} 已导入 ${0} 张截图。`,
      nodes: [],
    })
  }
  const flow = flowGroups.get(key)
  flow.nodes.push({ name: shot.node, status: 'captured', screenshotIds: [shot.id] })
}
for (const flow of flowGroups.values()) {
  flow.summary = `${flow.competitor} ${flow.flowName} 已导入 ${flow.nodes.length} 张截图。`
}

fs.mkdirSync(dataDir, { recursive: true })
fs.writeFileSync(path.join(dataDir, 'screenshots.json'), `${JSON.stringify(screenshots, null, 2)}\n`)
fs.writeFileSync(path.join(dataDir, 'competitors.json'), `${JSON.stringify(competitors, null, 2)}\n`)
fs.writeFileSync(path.join(dataDir, 'flows.json'), `${JSON.stringify([...flowGroups.values()], null, 2)}\n`)

console.log(`Imported ${screenshots.length} screenshots from ${sourceRoot}`)
console.log(`Wrote data/screenshots.json, data/competitors.json, data/flows.json`)
