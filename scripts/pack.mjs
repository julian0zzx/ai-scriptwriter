#!/usr/bin/env node
/**
 * Build the two deliverables from one source tree:
 *
 * 1. dist/dsh-plugin/ai-scriptwriter-<version>.tgz — one installable DSH package that is
 *    simultaneously the profile bundle (dsh.bundle.patch) and the host plugin.
 *    pnpm's tarball install understands exactly one package per archive, so the
 *    source packages are merged here rather than shipped side by side.
 * 2. dist/skill/ai-scriptwriter/ — a portable Agent Skill: SKILL.md, generated
 *    references (same craft source as the tools), install.sh and the tarball.
 *
 * @module scripts/pack
 */

import { cp, mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const DIST = join(ROOT, 'dist')
const HOST = join(ROOT, 'packages/screenwriter')
const BUNDLE = join(ROOT, 'packages/bundle')
const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
const version = String(pkg.version ?? '0.1.0')
const packageName = '@ai-scriptwriter/scriptwriter-bundle'
const tarballName = `ai-scriptwriter-${version}.tgz`

const peers = {
  '@deepseek-ai/cordis': '^4.0.5',
  '@deepseek-ai/dsh-agent': '^0.2.0-rc.2',
  '@deepseek-ai/dsh-fs': '^0.2.0-rc.2',
  '@deepseek-ai/dsh-llm': '^0.2.0-rc.2',
  '@deepseek-ai/dsh-session': '^0.2.0-rc.2',
  '@deepseek-ai/dsh-tools': '^0.2.0-rc.2',
}

function log(message) {
  process.stdout.write(`${message}\n`)
}

async function main() {
  log('• build workspace')
  execFileSync('pnpm', ['-r', 'run', 'build'], { cwd: ROOT, stdio: 'inherit' })

  log('• stage DSH plugin')
  const pluginStage = join(DIST, 'dsh-plugin', 'stage', 'package')
  await rm(join(DIST, 'dsh-plugin'), { recursive: true, force: true })
  await mkdir(pluginStage, { recursive: true })
  await cp(join(HOST, 'lib'), join(pluginStage, 'lib'), { recursive: true })
  await writeFile(join(pluginStage, 'package.json'), `${JSON.stringify({
    name: packageName,
    version,
    description: 'Duanju Studio — AI short-drama screenwriter for DeepSeek Harness (bundle + host plugin)',
    type: 'module',
    license: 'AGPL-3.0-only',
    main: 'lib/index.js',
    types: 'lib/types/index.d.ts',
    exports: {
      '.': { types: './lib/types/index.d.ts', default: './lib/index.js' },
      './cordis.patch.yml': './cordis.patch.yml',
      './package.json': './package.json',
    },
    files: ['lib', 'cordis.patch.yml', 'README.md'],
    dsh: { bundle: { patch: './cordis.patch.yml' } },
    engines: { node: '>=22' },
    peerDependencies: peers,
  }, null, 2)}\n`)
  await writeFile(join(pluginStage, 'cordis.patch.yml'), `# Duanju Studio — installed as one package: bundle + host plugin.
  - insert:
      - id: ai-scriptwriter
        name: '${packageName}'
  `)
  await writeFile(join(pluginStage, 'README.md'), `# 短剧编剧台（Duanju Studio）

  DSH 插件：11 个 \`scriptwriter_*\` 工具，项目以 Markdown 落在工作区。
包名：\`@ai-scriptwriter/scriptwriter-bundle\`；profile 行 id：\`ai-scriptwriter\`；tarball：\`ai-scriptwriter-${version}.tgz\`。
  安装：

  \`\`\`sh
  dsh plugin --profile web add -w ai-scriptwriter-${version}.tgz
  \`\`\`

  重启 \`dsh web\` 后新会话可见。机检只算齐不齐；评审只判断；合规需人工复核。
  `)
  const pluginTar = join(DIST, 'dsh-plugin', tarballName)
  execFileSync('tar', ['-czf', pluginTar, '-C', join(DIST, 'dsh-plugin', 'stage'), 'package'])
await rm(join(DIST, 'dsh-plugin', 'stage'), { recursive: true, force: true })

  log('• stage Skill')
  const skillRoot = join(DIST, 'skill', 'ai-scriptwriter')
  await rm(join(DIST, 'skill'), { recursive: true, force: true })
  await mkdir(join(skillRoot, 'references'), { recursive: true })
  await mkdir(join(skillRoot, 'scripts'), { recursive: true })
  await mkdir(join(skillRoot, 'plugin'), { recursive: true })
  const craft = await import(pathToFileURL(join(HOST, 'lib/core/craft.js')).href)
  await writeFile(join(skillRoot, 'SKILL.md'), skillMarkdown(version, craft.CRAFT_TOPICS))
  for (const topic of craft.CRAFT_TOPICS) {
    const source = topic.sources.map((item) => `课程第 ${item} 期`).join('、')
    await writeFile(join(skillRoot, 'references', `${topic.id}.md`), `# ${topic.title}\n\n> ${topic.summary}\n> 来源：${source}。课程没给的数字只作插件默认。\n\n${topic.body}\n`)
  }
  await writeFile(join(skillRoot, 'references', 'workflow.md'), WORKFLOW)
  await writeFile(join(skillRoot, 'references', 'tools.md'), TOOLS(version))
  await writeFile(join(skillRoot, 'README.md'), skillReadme(version))
  await writeFile(join(skillRoot, 'scripts', 'install.sh'), installScript(version))
  await chmod(join(skillRoot, 'scripts', 'install.sh'), 0o755)
  await cp(pluginTar, join(skillRoot, 'plugin', tarballName))
  const skillTar = join(DIST, 'skill', `ai-scriptwriter-${version}.tar.gz`)
  execFileSync('tar', ['-czf', skillTar, '-C', join(DIST, 'skill'), 'ai-scriptwriter'])

  log(`✓ ${pluginTar}`)
  log(`✓ ${skillRoot}`)
  log(`✓ ${skillTar}`)
}


function skillMarkdown(ver, topics) {
  return `---
name: ai-scriptwriter
description: 短剧编剧方法论与 DSH 工具使用指南：立项、一句话、人物、三阶段、分集大纲、课程格式剧本、钩子、情绪点、台词、合规与投稿包。Use when writing or reviewing Chinese short-drama scripts, episode outlines, hooks, or submission packages.
whenToUse: 用户要写短剧、改剧本、排分集大纲、设计钩子/情绪点、做投稿包，或要按红果《短剧编剧第一课》的方法审稿时。
---

# 短剧编剧台 / AI short-drama screenwriter

这是一套「结构化 + 可检查」的短剧写法，来自红果《短剧编剧第一课》10 期访谈。
插件（\`scriptwriter_*\` 工具）可用时，优先用工具落项目；插件不可用时，按本 skill 的流程与模板手写，
同样保留项目文件。

## 三条铁律

1. **机检只算齐不齐，评审只判好不好**。不要把机检通过说成剧本合格，也不要把评审 verdict
   说成平台会过稿。
2. **作者主权**。立项、前三集、单集、交付四道确认只能由作者本人给出；第 4 集前必须先确认
   前三集；投稿包前必须先确认交付。
3. **不造数据**。不抓榜单、不编播放量、不承诺爆款。合规只提醒，结论由人给。

## 工作流

1. 立项：\`scriptwriter_init\` 设置平台、题材、受众、集数、单集秒数、成本档。
2. 故事：\`scriptwriter_story pitch\`（一句话四槽位、核心、差异化、结局）；\`stage\`（三阶段）。
3. 人物：\`scriptwriter_cast upsert\`（欲望/痛点/性格/说话方式/弧光/成本/进出场）。
4. 大纲：\`scriptwriter_outline batch\`（每集目标/冲突/情绪点/信息差/钩子/前30s/中段/末30s）。
5. 前三集：\`scriptwriter_script write\`；\`scriptwriter_check scope=range from=1 to=3\`；
   \`scriptwriter_review kind=opening\`；把正文与评审交给作者，得到原话后 \`scriptwriter_confirm kind=opening\`。
6. 逐集：写一集 → \`scriptwriter_check scope=episode\` → 修 error → 需要时 \`scriptwriter_review\`。
7. 收尾：\`scriptwriter_check scope=all\` → \`scriptwriter_confirm kind=delivery\` → \`scriptwriter_export kind=submission\`。

## 项目文件

\`\`\`
故事大纲.md
人物设定.md
分集大纲/第001-010集.md
剧集/第001集-标题.md
竞品拆解.md
.duanju/project.json
.duanju/reports/
\`\`\`

文件是人可以直接改的；工具读取时以文件为准。

## 参考

${topics.map((topic) => `- [${topic.title}](references/${topic.id}.md)：${topic.summary}`).join('\n')}
- [工作流与门禁](references/workflow.md)
- [工具与安装](references/tools.md)

版本 ${ver}。
`
}

const WORKFLOW = `# 工作流与门禁

## 阶段

\`setup → pitch → outline → opening → writing → finale → delivery\`

- **pitch**：一句话四槽位 + 核心 + 三阶段。缺一项不进入分集。
- **outline**：至少前 3 集大纲；写第 1 集前需要作者确认立项。
- **opening**：第 1–3 集剧本 + 开篇评审 + 作者确认；未确认不能写第 4 集。
- **writing**：逐集写、逐集机检；单集 can be 草稿，但 final 需机检无 error。
- **finale**：计划集数写齐；需要一次全量机检。
- **delivery**：作者确认交付后才能导出投稿包。

## 门禁拒绝怎么解

- \`GATE_SETTINGS\`：先补齐 pitch/人物/三阶段，再 \`scriptwriter_confirm kind=settings\`。
- \`GATE_OPENING\`：先写 1–3 集，跑 \`scriptwriter_review kind=opening\`，把正文与评审交给作者，
  得到明确认可后 \`scriptwriter_confirm kind=opening\`。
- \`GATE_FINAL\`：先修该集 error，再写 final。
- \`GATE_DELIVERY\`：先 \`scriptwriter_check scope=all\`，再 \`scriptwriter_confirm kind=delivery\`。

## 文件约定

- 一集一个剧本文件；每 10 集一个大纲文件。
- frontmatter 存状态/字数/估计秒数/钩子场；正文是课程格式。
- 手改文件是权威输入；语法坏了会报错并给行号，不会用旧值覆盖。
`

function TOOLS(ver) {
  return `# 工具与安装

## 安装插件（需要写 profile）

\`\`\`sh
dsh plugin --profile web add -w "${'${PWD}'}/plugin/ai-scriptwriter-${ver}.tgz"
# 重启 dsh web；新会话出现 11 个 scriptwriter_* 工具
\`\`\`

## 安装 skill（可选，只需方法论时）

\`\`\`sh
sh scripts/install.sh            # 复制到 \${DSH_HOME:-~/.dsh}/skills/ai-scriptwriter
sh scripts/install.sh --dry-run  # 只打印目标，不写文件
\`\`\`

## 11 个工具

| 工具 | 作用 |
|---|---|
| \`scriptwriter_init\` | 立项：平台/题材/受众/集数/秒数/成本档 |
| \`scriptwriter_story\` | pitch/stage/promise/read：一句话、核心、三阶段、伏笔 |
| \`scriptwriter_cast\` | list/upsert/remove：人物小传与关系 |
| \`scriptwriter_outline\` | read/plan/batch/remove：分集大纲 |
| \`scriptwriter_script\` | read/write：整集剧本（课程格式） |
| \`scriptwriter_check\` | 确定性机检（不调用模型） |
| \`scriptwriter_review\` | 模型评审（只判断，不改正文） |
| \`scriptwriter_confirm\` | 作者确认（必须带用户原话） |
| \`scriptwriter_status\` | dashboard/bible/plan/episode/craft |
| \`scriptwriter_export\` | submission/scripts/outline/report/all |
| \`scriptwriter_dissect\` | 竞品拆解 |

## 机检维度

format / structure / duration / dialogue / cost / compliance / continuity。

课程规则用 \`DR-*\`，插件默认阈值用 \`CFG-*\`；报告里分得清。
`
}

function skillReadme(ver) {
  return `# ai-scriptwriter skill (${ver})

短剧编剧方法论，可独立于插件使用；插件 tarball 放在 \`plugin/\`。
安装：\`sh scripts/install.sh\`。详见 \`SKILL.md\` 与 \`references/\`。
`
}

function installScript(ver) {
  return `#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DEST="\${DSH_HOME:-\$HOME/.dsh}/skills/ai-scriptwriter"
DRY=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --dest=*) DEST="\${arg#--dest=}" ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done
if [ "$DRY" = "1" ]; then
  echo "would install skill to $DEST"
  echo "plugin tarball: $ROOT/plugin/ai-scriptwriter-${ver}.tgz"
  exit 0
fi
mkdir -p "$DEST"
cp -R "$ROOT/SKILL.md" "$ROOT/references" "$ROOT/plugin" "$DEST/"
echo "installed skill at $DEST"
echo "plugin (optional): dsh plugin --profile web add -w \\"$ROOT/plugin/ai-scriptwriter-${ver}.tgz\\""
`
}

await main()
