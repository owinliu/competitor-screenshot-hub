import { spawnSync } from 'node:child_process'

const taskId = process.argv[2] || 'task-artifacts'
const message = `Publish task artifacts ${taskId}`

function run(command, args) {
  return spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function output(result) {
  return `${result.stdout || ''}${result.stderr || ''}`.trim()
}

const add = run('git', ['add', 'data/runtime/tasks.json', 'public/screenshots/tasks'])
if (add.status !== 0) {
  console.error(output(add) || 'git add failed')
  process.exit(add.status || 1)
}

const diff = run('git', ['diff', '--cached', '--quiet'])
if (diff.status === 0) {
  console.log('No task artifact changes to publish.')
  process.exit(0)
}

const commit = run('git', ['commit', '-m', message])
if (commit.status !== 0) {
  console.error(output(commit) || 'git commit failed')
  process.exit(commit.status || 1)
}

const push = run('git', ['push'])
if (push.status !== 0) {
  console.error(output(push) || 'git push failed')
  process.exit(push.status || 1)
}

console.log(output(commit))
console.log(output(push))
