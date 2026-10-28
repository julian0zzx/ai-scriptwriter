# ai-scriptwriter — 短剧编剧台

把红果《短剧编剧第一课》10 期的方法论，做成 **DeepSeek Harness 插件 + 可移植 Skill**：
模型在结构化项目（立项 → 一句话 → 人物 → 三阶段 → 分集大纲 → 逐集剧本 →
机检/评审 → 投稿包）上工作。

> **状态：v0.1 已实现。** 11 个工具、确定性机检、rubric 评审、作者门禁、投稿包导出、
> DSH 插件 tarball 与 Skill 包均已产出。尚未在真实 GUI 会话里跑完整流程（见「已验证/未验证」）。

## 两个产出物

| 产出物 | 路径 | 用途 |
|---|---|---|
| **DSH 插件** | [`dist/dsh-plugin/ai-scriptwriter-0.1.0.tgz`](dist/dsh-plugin/ai-scriptwriter-0.1.0.tgz) | 装进 profile，得到 11 个 `scriptwriter_*` 工具 |
| **Skill** | [`dist/skill/ai-scriptwriter/`](dist/skill/ai-scriptwriter/) / [`dist/skill/ai-scriptwriter-0.1.0.tar.gz`](dist/skill/ai-scriptwriter-0.1.0.tar.gz) | 可独立使用的方法论 + 同一份插件 tarball |

### 名字对照

| 名字 | 是什么 |
|---|---|
| `ai-scriptwriter-0.1.0.tgz` | 插件 tarball 文件名 |
| `@ai-scriptwriter/scriptwriter-bundle` | **安装进 profile 的 npm 包名**（bundle + host 合并） |
| `@ai-scriptwriter/scriptwriter` | 源码里的 host 包名（不直接安装） |
| `ai-scriptwriter` | profile 里的插件行 id / Cordis 插件名 / Skill 名 |
| `scriptwriter_*` | 11 个工具名 |
| `.duanju/` | 项目数据目录 |

### 安装插件

```sh
dsh plugin --profile web add -w "$(pwd)/dist/dsh-plugin/ai-scriptwriter-0.1.0.tgz"
dsh --profile web --dump-config | grep -A2 ai-scriptwriter
# 重启 dsh web；新会话出现 11 个 scriptwriter_* 工具
```

已安装到 live `~/.dsh/profiles/web`（经你批准）；`--dump-config` 显示
`id: ai-scriptwriter / name: @ai-scriptwriter/scriptwriter-bundle`。

> **改名生效需要重启**：这次改的是工具名（不是包名），已经加载的旧进程不会热替换。
> 当前会话仍只有旧 `duanju_*` 工具；重启 `dsh` / 新进程后才会出现 `scriptwriter_*`。
> 已验证 `scriptwriter_status` 在当前旧进程中返回 `unknown tool`，属于预期。

### 安装 Skill

```sh
sh dist/skill/ai-scriptwriter/scripts/install.sh --dry-run   # 只打印目标
sh dist/skill/ai-scriptwriter/scripts/install.sh             # 复制到 ~/.dsh/skills/ai-scriptwriter
```

Skill 可被 DSH 的 `dsh-skill-filesystem` 从 `~/.dsh/skills/` 发现；没有插件时也能作为
写作方法手册使用。

## 它能做什么

- **结构化写作**：一句话四槽位、人物小传、三阶段、每集目标/冲突/情绪点/信息差/钩子/
  前 30 秒/中段/末 30 秒，全部有字段，不靠聊天记忆。
- **课程格式**：按课程真实样例写 `1-1 日 内 地点`、`人物：`、`△`、`角色（提示）：台词`、
  `OS/VO`、`【闪回】`，同时兼容四行式场头。
- **机检**：格式、结构、时长、台词、成本、合规提醒、连续性；确定性规则，不调用模型。
- **评审**：开篇/钩子/情绪/台词/可拍性/全剧，带 rubric 与出处；只判断，不改正文。
- **作者确认**：立项、前三集、单集、交付四道门禁；未确认不越级写。
- **投稿包**：剧名/一句话/卖点/人物/三阶段/分集大纲/前 3 集/检查摘要/待确认，一次导出。

## 11 个工具

| 工具 | 作用 |
|---|---|
| `scriptwriter_init` | 立项：平台/题材/受众/集数/秒数/成本档 |
| `scriptwriter_story` | pitch/stage/promise/read：一句话、核心、三阶段、伏笔 |
| `scriptwriter_cast` | list/upsert/remove：人物小传与关系 |
| `scriptwriter_outline` | read/plan/batch/remove：分集大纲 |
| `scriptwriter_script` | read/write：整集剧本（课程格式） |
| `scriptwriter_check` | 确定性机检（不调用模型） |
| `scriptwriter_review` | 模型评审（只判断，不改正文） |
| `scriptwriter_confirm` | 作者确认（必须带用户原话） |
| `scriptwriter_status` | dashboard/bible/plan/episode/craft |
| `scriptwriter_export` | submission/scripts/outline/report/all |
| `scriptwriter_dissect` | 竞品拆解 |

## 项目文件

```
故事大纲.md
人物设定.md
分集大纲/第001-010集.md
剧集/第001集-标题.md
竞品拆解.md
.duanju/project.json
.duanju/reports/
```

文件是人可以直接改的；工具读取时以文件为准；语法坏了报错并给行号，不覆盖。

## 开发

```sh
pnpm install
pnpm run build
pnpm run typecheck
pnpm test              # 46 tests（host 46 + bundle 1；bundle 用 node --test）
pnpm run pack          # 两个产出物
pnpm run verify:dist   # 解包、导入、Skill 结构、install.sh --dry-run
```

## 已验证 / 未验证

已验证：

- `pnpm run build` / `typecheck` / `test` 全绿；46 个 host 测试 + 1 个 bundle 测试。
- `pnpm run pack` 产出 tarball 与 skill；`verify:dist` 解包后 `import` 成功，
  模块导出 `name='ai-scriptwriter'`、`apply()`、11 个工具名。
- live profile 已安装并组合出 `id: ai-scriptwriter` 行；包名/行 id 已切换。
- 新 tarball 的模块导入与 11 个 `scriptwriter_*` 工具名通过 `verify:dist`。
- 在临时 DSH_HOME 中以 `--port 3099` 启动 web（首页 200，启动日志无插件错误）。

未验证：

- 重启后 live 会话中的 `scriptwriter_*` 工具可见性与完整写作链路（`scriptwriter_init` →
  写剧本 → 导出）尚未验证；工具名改动的当前会话仍加载旧 `duanju_*`。
- `scriptwriter_review` 对真实模型的路由与输出质量（只做了 JSON 解析与请求组装测试）。
- 80 集全量机检的实际耗时（有 10 集级测试，没有 80 集基准）。
- Web 侧边栏面板（v0.1 未做）。

## 明确不做

不生成视频/分镜；不抓榜单、不接投稿 API；不承诺爆款/过稿；不做「AI 合规认证」；
v0.1 不做 Web 面板。

## 文档

- [AGENTS.md](AGENTS.md) — 工作方式与不可协商的约束
- [spec.md](specs/001-duanju-screenwriter/spec.md) — 用户故事、27 条 FR、39 条 DR、13 条 SC
- [plan.md](specs/001-duanju-screenwriter/plan.md) — 架构、阶段、测试、风险
- [tasks.md](specs/001-duanju-screenwriter/tasks.md) — 任务与验证记录
- [data-model.md](specs/001-duanju-screenwriter/data-model.md) — 文件树与 Markdown 方言
- [contracts/tools.md](specs/001-duanju-screenwriter/contracts/tools.md) — 11 个工具接口
- [research.md](specs/001-duanju-screenwriter/research.md) — 课程证据账本与技术决策

## 课程来源

`references/hongguo-lesson-01/短剧编剧第一课-01.md` … `-10.md`（红果短剧创作服务平台）。
课程原文是领域事实的唯一来源；课程没写的，插件只做可配置默认，并在文档中标注。
