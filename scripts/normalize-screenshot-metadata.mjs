import fs from 'node:fs'

const file = 'data/screenshots.json'
const screenshots = JSON.parse(fs.readFileSync(file, 'utf8'))

function classifyByNode(node, currentModule) {
  const text = `${node || ''} ${currentModule || ''}`
  if (/客服|服务|帮助|投诉|消保|对话/.test(text)) return { flow: '客服/消保', flowKey: 'customer-service', modules: ['客服'] }
  if (/借钱|借款|额度|授信|账单|还款|优惠券|富能|卡券/.test(text)) return { flow: '消金/借款', flowKey: 'consumer-finance', modules: ['消金'] }
  if (/活动|免息|折扣|权益|运营|弹窗|券/.test(text)) return { flow: '运营活动', flowKey: 'campaign', modules: ['留存促活运营'] }
  if (/风险|反诈|安全|黑灰产/.test(text)) return { flow: '风控提示', flowKey: 'risk-control', modules: ['风控'] }
  if (/首页|我的|消息|生活|理财|保险|购物|APP/.test(text)) return { flow: 'APP 通用浏览', flowKey: 'app-general', modules: ['APP'] }
  return null
}

let changed = 0
for (const shot of screenshots) {
  const source = shot.sourcePath || ''
  const weirdFlow = /wecom-temp|\.jpg流程|\.png流程|unknown/i.test(`${shot.flow} ${shot.flowKey}`)
  const unknown = shot.capturedAt === 'unknown' || /wecom-temp/i.test(source)

  if (weirdFlow || unknown) {
    const inferred = classifyByNode(shot.node, shot.businessModules?.[0])
    if (inferred) {
      shot.flow = inferred.flow
      shot.flowKey = inferred.flowKey
      shot.businessModules = inferred.modules
      shot.classificationStatus = 'auto-inferred'
    } else {
      shot.flow = '待分类'
      shot.flowKey = 'needs-classification'
      shot.businessModules = ['待分类']
      shot.classificationStatus = 'needs-review'
    }
    shot.tags = Array.from(new Set([...(shot.tags || []).filter((tag) => !/wecom|temp|jpg|png/i.test(tag)), shot.flow]))
    changed += 1
  } else if (!shot.classificationStatus) {
    shot.classificationStatus = 'imported-from-folder'
  }

  if (!shot.sourceType) shot.sourceType = 'historical-import'
}

fs.writeFileSync(file, `${JSON.stringify(screenshots, null, 2)}\n`)
console.log(`normalized ${changed} screenshots`)
