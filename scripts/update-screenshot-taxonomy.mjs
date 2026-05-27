import fs from 'node:fs'

const screenshotsPath = 'data/screenshots.json'
const flowsPath = 'data/flows.json'
const screenshots = JSON.parse(fs.readFileSync(screenshotsPath, 'utf8'))

function slug(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function classifyAppPage(shot) {
  const text = `${shot.node || ''} ${shot.description || ''} ${(shot.tags || []).join(' ')} ${shot.sourcePath || ''}`
  const rules = [
    { re: /客服|服务|帮助|投诉|消保|对话/, flow: 'APP-服务入口', flowKey: 'app-service-entry', module: '服务入口', tags: ['服务入口', '客服入口'] },
    { re: /借钱|借款|额度|授信/, flow: 'APP-借钱入口', flowKey: 'app-loan-entry', module: '借钱入口', tags: ['借钱入口', '消金入口'] },
    { re: /我的|账户|个人|设置/, flow: 'APP-我的/账户', flowKey: 'app-account', module: '我的/账户', tags: ['我的', '账户'] },
    { re: /消息|通知|站内信/, flow: 'APP-消息', flowKey: 'app-message', module: '消息', tags: ['消息'] },
    { re: /购物|商城|超市|商品/, flow: 'APP-购物/商城', flowKey: 'app-shopping', module: '购物/商城', tags: ['购物', '商城'] },
    { re: /生活|权益|会员|福利/, flow: 'APP-生活/权益', flowKey: 'app-benefits', module: '生活/权益', tags: ['生活', '权益'] },
    { re: /理财|保险/, flow: 'APP-理财/保险', flowKey: 'app-wealth-insurance', module: '理财/保险', tags: ['理财', '保险'] },
    { re: /首页|首页\d|启动/, flow: 'APP-首页', flowKey: 'app-home', module: '首页', tags: ['首页'] },
  ]
  return rules.find((rule) => rule.re.test(text)) || null
}

let updated = 0
for (const shot of screenshots) {
  if (shot.flow === 'APP 通用浏览' || shot.flowKey === 'app-general') {
    const next = classifyAppPage(shot)
    if (next) {
      shot.flow = next.flow
      shot.flowKey = next.flowKey
      shot.businessModules = Array.from(new Set(['APP', next.module]))
      shot.tags = Array.from(new Set([...(shot.tags || []).filter((tag) => tag !== 'APP 通用浏览'), ...next.tags, next.flow]))
      shot.pageCategory = next.module
      shot.classificationStatus = shot.classificationStatus || 'imported-from-folder'
      updated += 1
    } else {
      shot.flow = '待分类'
      shot.flowKey = 'needs-classification'
      shot.businessModules = ['待分类']
      shot.tags = Array.from(new Set([...(shot.tags || []), '待分类']))
      shot.classificationStatus = 'needs-review'
      updated += 1
    }
  }
}

const flowGroups = new Map()
for (const shot of screenshots) {
  const key = `${shot.appKey}-${shot.flowKey}`
  if (!flowGroups.has(key)) {
    flowGroups.set(key, {
      id: key,
      competitor: shot.competitor,
      flowName: shot.flow,
      status: 'captured',
      summary: `${shot.competitor} ${shot.flow} 已导入 0 张截图。`,
      nodes: [],
    })
  }
  const group = flowGroups.get(key)
  group.nodes.push({
    name: shot.node,
    status: shot.classificationStatus === 'needs-review' ? 'needs-review' : (shot.status || 'captured'),
    screenshotIds: [shot.id],
    note: shot.classificationStatus === 'needs-review' ? '待人工分类复核' : undefined,
  })
}
for (const group of flowGroups.values()) {
  const needsReview = group.nodes.filter((node) => node.status === 'needs-review').length
  group.status = needsReview > 0 ? 'needs-review' : 'captured'
  group.summary = `${group.competitor} ${group.flowName} 已导入 ${group.nodes.length} 张截图${needsReview ? `，其中 ${needsReview} 张待分类复核` : ''}。`
}

fs.writeFileSync(screenshotsPath, `${JSON.stringify(screenshots, null, 2)}\n`)
fs.writeFileSync(flowsPath, `${JSON.stringify([...flowGroups.values()], null, 2)}\n`)
console.log(`taxonomized ${updated} screenshots`)
console.log(`flows ${flowGroups.size}`)
