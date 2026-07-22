import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const expected = new Set([
  '@ai-i18n/core',
  '@ai-i18n/eslint-plugin',
  '@ai-i18n/mcp',
  '@ai-i18n/openai',
  '@ai-i18n/react',
  '@ai-i18n/vite',
  '@ai-i18n/vue',
])
const output = execFileSync(
  'pnpm',
  ['pack', '-r', '--filter', './packages/*', '--dry-run', '--json'],
  { cwd: root, encoding: 'utf8' },
)
const packs = JSON.parse(output)

for (const pack of packs) {
  expected.delete(pack.name)
  const files = new Set(pack.files.map((file) => file.path))
  assert(files.has('package.json'), `${pack.name} 缺少 package.json`)
  assert(files.has('README.md'), `${pack.name} 缺少 README.md`)
  assert(
    [...files].every((file) => !/^(src|test|benchmark|i18n)\//.test(file)),
    `${pack.name} 泄漏源码、测试、基准或协议文件`,
  )

  const directory = path.join(root, 'packages', packageDirectory(pack.name))
  const manifest = JSON.parse(
    fs.readFileSync(path.join(directory, 'package.json'), 'utf8'),
  )
  for (const target of Object.values(manifest.exports)) {
    assert(files.has(target.import.slice(2)), `${pack.name} 缺少 ${target.import}`)
    assert(files.has(target.types.slice(2)), `${pack.name} 缺少 ${target.types}`)
  }
}

assert(expected.size === 0, `缺少发布包：${[...expected].join(', ')}`)
assertClientIsolation('react', ['@ai-i18n/vite', 'vite', 'yuku-analyzer'])
assertClientIsolation('vue', [
  '@ai-i18n/vite',
  '@vue/compiler-dom',
  '@vue/compiler-sfc',
  'vite',
  'yuku-analyzer',
])

console.log(`✓ ${packs.length} 个发布包内容与客户端依赖边界通过`)

function assertClientIsolation(directory, forbidden) {
  const packageRoot = path.join(root, 'packages', directory)
  const manifest = JSON.parse(
    fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
  )
  const client = fs.readFileSync(path.join(packageRoot, 'dist/index.js'), 'utf8')
  for (const dependency of forbidden) {
    assert(
      !(dependency in (manifest.dependencies ?? {})),
      `${manifest.name} 浏览器安装依赖了 ${dependency}`,
    )
    assert(
      !client.includes(`from '${dependency}'`) &&
        !client.includes(`from "${dependency}"`),
      `${manifest.name} 浏览器入口导入了 ${dependency}`,
    )
  }
}

function packageDirectory(name) {
  return name === '@ai-i18n/eslint-plugin' ? 'eslint' : name.split('/')[1]
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
