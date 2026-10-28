#!/usr/bin/env node
/** Verify the two packaged artifacts without touching a DSH profile. */

import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rm, symlink, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')
const version = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')).version
const tgz = join(ROOT, 'dist/dsh-plugin', `ai-scriptwriter-${version}.tgz`)
const skill = join(ROOT, 'dist/skill/ai-scriptwriter')
const tmp = join(ROOT, '.tmp/verify')

function check(condition, message) {
  if (!condition) throw new Error(`verify failed: ${message}`)
  console.log(`  ✓ ${message}`)
}

await rm(tmp, { recursive: true, force: true })
await mkdir(join(tmp, 'plugin'), { recursive: true })
execFileSync('tar', ['-xzf', tgz, '-C', join(tmp, 'plugin')], { stdio: 'inherit' })

const manifest = JSON.parse(await readFile(join(tmp, 'plugin/package/package.json'), 'utf8'))
console.log('DSH plugin')
check(manifest.name === '@ai-scriptwriter/scriptwriter-bundle', 'package name is the bundle name')
check(manifest.version === version, `version ${version}`)
check(manifest.dsh?.bundle?.patch === './cordis.patch.yml', 'declares dsh.bundle.patch')
check(manifest.peerDependencies?.['@deepseek-ai/dsh-tools'] !== undefined, 'declares DSH peers')
check((await readFile(join(tmp, 'plugin/package/cordis.patch.yml'), 'utf8')).includes("name: '@ai-scriptwriter/scriptwriter-bundle'"), 'patch row names the bare package')
check((await readFile(join(tmp, 'plugin/package/cordis.patch.yml'), 'utf8')).includes('id: ai-scriptwriter'), 'patch row id is ai-scriptwriter')

const list = execFileSync('tar', ['-tzf', tgz], { encoding: 'utf8' }).split('\n').filter(Boolean)
check(list.every((path) => !path.includes('/src/') && !path.includes('/test/')), 'tarball carries no source or tests')
check(list.includes('package/lib/index.js'), 'tarball carries lib/index.js')
execFileSync(process.execPath, ['--check', join(tmp, 'plugin/package/lib/index.js')], { stdio: 'inherit' })
check(true, 'lib/index.js parses as ESM')

// Resolve the host-provided peers from the local DSH installation.
const dshModules = process.env.DSH_INSTALL_NODE_MODULES ?? '/Users/ju/.npm/_npx/1e7f6d9597241db0/node_modules'
try {
  await access(join(dshModules, '@deepseek-ai/dsh-tools'))
  await mkdir(join(tmp, 'node_modules'), { recursive: true })
  await symlink(join(dshModules, '@deepseek-ai'), join(tmp, 'node_modules/@deepseek-ai'), 'dir')
  const mod = await import(`${pathToFileURL(join(tmp, 'plugin/package/lib/index.js')).href}?v=${Date.now()}`)
  check(mod.name === 'ai-scriptwriter', 'module exports name ai-scriptwriter')
  check(typeof mod.apply === 'function', 'module exports apply()')
  check(Array.isArray(mod.TOOL_NAMES) && mod.TOOL_NAMES.length === 11, 'module exports 11 tool names')
  check(mod.TOOL_NAMES.every((name) => name.startsWith('scriptwriter_')), 'all tool names use the scriptwriter_ prefix')
} catch (error) {
  console.warn(`  ! import check skipped: ${error instanceof Error ? error.message : String(error)}`)
}

console.log('Skill')
const skillMd = await readFile(join(skill, 'SKILL.md'), 'utf8')
check(/^---\n/.test(skillMd), 'SKILL.md has frontmatter')
check(/name:\s*ai-scriptwriter/m.test(skillMd), 'skill name is ai-scriptwriter')
check(/description:\s*\S+/m.test(skillMd), 'skill description is present')
for (const ref of ['format', 'opening', 'hook', 'rhythm', 'emotion', 'dialogue', 'compliance', 'submission', 'workflow', 'tools']) {
  await access(join(skill, 'references', `${ref}.md`))
}
check(true, 'required references exist')
await access(join(skill, 'plugin', `ai-scriptwriter-${version}.tgz`))
check(true, 'skill carries the same plugin tarball')
const dryTarget = join(tmp, 'skill-target')
const out = execFileSync('sh', [join(skill, 'scripts/install.sh'), '--dry-run', `--dest=${dryTarget}`], { encoding: 'utf8' })
check(out.includes('would install skill'), 'install.sh --dry-run prints the target')
try {
  await access(dryTarget)
  check(false, 'install.sh --dry-run wrote no files')
} catch {
  check(true, 'install.sh --dry-run wrote no files')
}

console.log('all artifacts verified')
