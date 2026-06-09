import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const sourcePath = path.join(repoRoot, 'data/screenshots-0605-0606-latest.json')
const outputPath = path.join(repoRoot, 'data/screenshots-0605-current-clean.json')
const reportPath = path.join(repoRoot, 'data/screenshots-0605-current-clean.report.md')

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))

const evidenceScore = {
  主观察证据: 50,
  边界证据: 35,
  复核证据: 25,
  '不可用/回采证据': 5,
}

function getPageKey(item) {
  return [
    item.appKey || item.competitor || '',
    item.pageSlot || item.pageCategory || item.node || '',
  ].join('::')
}

function score(item) {
  const text = [item.status, item.qualityNote, item.classificationStatus, item.description].filter(Boolean).join(' ')
  let points = 0
  points += item.displayDefault === 'false' ? -100 : 20
  points += evidenceScore[item.evidenceValue] ?? 0
  if (/strict_same_position_match/.test(text)) points += 80
  if (/near_match_for_review/.test(text)) points += 35
  if (/route_hit_candidate/.test(text)) points += 20
  if (/captured_needs_visual_qa/.test(text)) points += 10
  if (/blocked|hard:|entry_drift|viewport_mismatch|page_anchor_missing|viewport_anchor_missing/.test(text)) points -= 30
  if (item.visualSummary) points += 8
  if (item.keyText) points += 6
  if (item.pageSlot) points += 6
  if (item.finalDimension) points += 4
  if (item.imagePath && !/placeholder/i.test(item.imagePath)) points += 5
  points += Math.min(String(item.visibleText || '').length, 400) / 100
  return points
}

const groups = new Map()
for (const item of source) {
  const key = getPageKey(item)
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(item)
}

const selected = []
const duplicateGroups = []
for (const [key, items] of groups) {
  const ranked = [...items].sort((a, b) => score(b) - score(a) || String(a.materialId || a.id).localeCompare(String(b.materialId || b.id)))
  const winner = { ...ranked[0] }
  winner.displayDefault = winner.displayDefault ?? 'true'
  winner.sourceType = winner.sourceType || 'current_0605_0606_dedup'
  winner.dedupGroupSize = items.length
  winner.dedupRule = 'appKey + pageSlot/pageCategory/node; keep one representative page screenshot'
  selected.push(winner)
  if (items.length > 1) {
    duplicateGroups.push({
      key,
      kept: winner.materialId || winner.id,
      removed: ranked.slice(1).map((item) => item.materialId || item.id),
      candidates: ranked.map((item) => ({ id: item.materialId || item.id, evidenceValue: item.evidenceValue, status: item.status, score: Number(score(item).toFixed(2)), node: item.node })),
    })
  }
}

const firstSeen = new Map()
source.forEach((item, index) => firstSeen.set(item.materialId || item.id, index))
selected.sort((a, b) => {
  const app = String(a.competitor || '').localeCompare(String(b.competitor || ''), 'zh-Hans-CN')
  if (app) return app
  return (firstSeen.get(a.materialId || a.id) ?? 99999) - (firstSeen.get(b.materialId || b.id) ?? 99999)
})

fs.writeFileSync(outputPath, JSON.stringify(selected, null, 2) + '\n')

const byApp = selected.reduce((acc, item) => {
  acc[item.competitor] = (acc[item.competitor] || 0) + 1
  return acc
}, {})
const sourceByApp = source.reduce((acc, item) => {
  acc[item.competitor] = (acc[item.competitor] || 0) + 1
  return acc
}, {})
const lines = []
lines.push('# 0605 当前素材清洗报告')
lines.push('')
lines.push('- source: `data/screenshots-0605-0606-latest.json`')
lines.push('- output: `data/screenshots-0605-current-clean.json`')
lines.push('- rule: 每个页面只保留一张代表性截图；去重键为 `appKey + pageSlot/pageCategory/node`。')
lines.push(`- source_count: ${source.length}`)
lines.push(`- output_count: ${selected.length}`)
lines.push(`- duplicate_groups: ${duplicateGroups.length}`)
lines.push(`- removed_duplicates: ${source.length - selected.length}`)
lines.push('')
lines.push('## APP 分布')
lines.push('')
lines.push('| APP | source | output | removed |')
lines.push('|---|---:|---:|---:|')
for (const app of Object.keys(sourceByApp).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))) {
  lines.push(`| ${app} | ${sourceByApp[app]} | ${byApp[app] || 0} | ${sourceByApp[app] - (byApp[app] || 0)} |`)
}
lines.push('')
lines.push('## 重复组处理')
lines.push('')
for (const group of duplicateGroups) {
  lines.push(`- ${group.key}: kept \`${group.kept}\`, removed ${group.removed.map((id) => `\`${id}\``).join(', ')}`)
}
fs.writeFileSync(reportPath, lines.join('\n') + '\n')

console.log(JSON.stringify({ source: source.length, output: selected.length, duplicateGroups: duplicateGroups.length, removed: source.length - selected.length, byApp }, null, 2))
