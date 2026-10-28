# 001 · 实施计划（plan）

- 状态：v0.1 已实现（验收中）
- 对应规格：`spec.md` v0.1；数据：`data-model.md`；接口：`contracts/tools.md`
- 目标版本：0.1.0（host 工具 + 文件项目 + 机检/评审 + 导出；无 Web 面板）

---

## 1. 技术上下文

| 项 | 值 | 说明 |
|---|---|---|
| Node | 24.11（要求 ≥22） | 本机 |
| pnpm | 9.15.4 | workspace |
| DSH | 0.2.1-rc.2 | 当前运行版本，锁死 |
| 语言 | TypeScript strict，ESM only | 无 CJS |
| 构建 | `tsc` 输出 `lib/`；无 bundler（host 不需要） | 客户端面板若做，另加 tsdown |
| 测试 | vitest | 纯单测 + 内存 FS 集成 |
| 包管理 | pnpm workspace；发布时 `scripts/pack.mjs` 合并 | 见 ADR-01/07 |
| 网络 | 不访问 | NFR-01 |

依赖策略：

- 开发依赖精确 `0.2.1-rc.2`：`@deepseek-ai/cordis`、`dsh-tools`、`dsh-fs`、`dsh-llm`、
  `dsh-session`、`dsh-system-prompt`、`dsh-agent`、`dsh-agent-loop-testkit`（若用）。
- 运行时只依赖 `@deepseek-ai/schemastery`（配置 schema）与 peer 提供的 DSH 服务。
- 不引入 Markdown 解析大库：项目方言很小，自己写 400 行以内的解析器，避免依赖漂移。

---

## 2. 宪法检查（对照 AGENTS.md §3）

| 条款 | 本计划如何满足 | 结论 |
|---|---|---|
| 规格先行 | 每个阶段任务映射 FR；行为变化先改 spec | 通过 |
| 课程可追溯 | DR 与 finding `ruleRef`；`research.md` 口径账本 | 通过 |
| 计算/判断分离 | check 纯函数、review 独立工具、不合分 | 通过 |
| 作者主权 | confirm 记录原话；四道门禁 | 通过 |
| 文件优先 | Markdown + project.json；解析失败不覆盖 | 通过 |
| 不造数据 | 无网络；合规只提醒 | 通过 |
| 合规不是判决 | CMP 全部人工复核 | 通过 |
| 默认可配置 | project.json 设置 + CFG 阈值 | 通过 |
| 会话隔离 | resolver 按 `session.header.cwd` | 通过 |
| 诚实报告 | 分阶段验收 + 未验证清单 | 通过 |

---

## 3. 架构

### 3.1 组成

```
源码（profile 指向本仓库）
DSH profile (web)
  └─ bundles: [@ai-scriptwriter/scriptwriter-bundle, …]        # dsh.bundle.patch
       └─ cordis.patch.yml: insert row {id: ai-scriptwriter, name: '@ai-scriptwriter/scriptwriter'}
            └─ @ai-scriptwriter/scriptwriter（host 插件）
                 ├─ apply(ctx, config)
                 ├─ ctx.tools.register(...) × 11
                 ├─ ctx.inject(['systemPrompt']) → 项目上下文
                 └─ ctx.inject(['llm']) → review（按需）

发布（一个 tarball）
  @ai-scriptwriter/scriptwriter-bundle（host 代码并入；root export = 插件）
       └─ cordis.patch.yml: row {id: ai-scriptwriter, name: '@ai-scriptwriter/scriptwriter-bundle'}
```

源码两包、发布一包（ADR-01）：

```
packages/
  screenwriter/                    # @ai-scriptwriter/scriptwriter
    src/
      index.ts                     # plugin: name/inject/apply
      core/                        # 纯逻辑，0 外部依赖
        types.ts                   # Project/Story/Character/EpisodePlan/Script/Finding…
        enums.ts                   # 钩子/信息差/情绪/阶段/严重度
        codes.ts                   # FMT/STR/DUR/DLG/CST/CMP/CON/EMO + CFG
        story.ts                   # 故事层 codec + 校验
        cast.ts                    # 人物 codec + 校验
        outline.ts                 # 分集大纲 codec + 校验
        script.ts                  # 剧本解析/渲染
        checks/                    # 每个维度一个纯函数
          format.ts structure.ts duration.ts dialogue.ts cost.ts compliance.ts continuity.ts
        findings.ts                # 合并/排序/去重/计数
        gates.ts                   # 阶段与确认状态机
        craft.ts                   # 11 个技法表（课程蒸馏）
        review.ts                  # rubric 组装 + 结果校验
        export.ts                  # 投稿包/全剧本/大纲/报告
        project.ts                 # 设置、schema、迁移
      host/
        store.ts                   # 读写文件树；文件优先；错误定位
        resolver.ts                # 按会话 cwd 缓存 Store
        fs-adapter.ts              # ctx.fs → 窄 TextFs 端口
        tools.ts                   # 11 个 defineTool + 信封
        prompt.ts                  # 快照 + systemPrompt.context
        llm.ts                     # 模型路由 + 一次调用
        config.ts                  # 插件配置（普通对象）
      test/                        # vitest
  bundle/                          # @ai-scriptwriter/scriptwriter-bundle
    index.js
    cordis.patch.yml
    package.json                   # dsh.bundle.patch
scripts/
  pack.mjs                         # 合并成 dist/dsh-plugin/ai-scriptwriter-0.1.0.tgz
```

依赖方向：`core` 不 import `host`、cordis、node:fs；`host` 只 import `core` 与 DSH 类型。
`core` 里不出现 `Date.now()` 以外的环境调用；时间由调用方传入，便于测试。

### 3.2 数据流

**写入（以写剧本为例）**

```
tools.scriptwriter_script.write(args, exec)
  → resolver.storeForSession(exec.agent?.session)      # cwd
  → store.loadProject()                                 # project.json + 文件索引
  → gates.requireOpening(project)                       # 门禁
  → script.parse(args.body)                             # 解析，得到 ScriptDoc + findings
  → if fatal: return {ok:false, findings}               # 不写
  → checks.run(script, plan, project)                   # 顺带给出 warnings
  → store.writeScript(doc)                              # 先内容，后索引
  → return envelope
```

**读取上下文**

```
prompt.render(view)   # 同步，只读快照
  view = snapshot(store)  # TTL 1.5s，后台刷新
```

**机检**

```
scriptwriter_check(scope)
  → 读项目 + 目标集
  → 对每集：parse → format/structure/duration/dialogue/cost/compliance/continuity
  → findings.merge() → 报告落盘 → 返回 counts + 前 N 条
```

**评审**

```
scriptwriter_review(kind, episodes)
  → 组装 rubric（craft + 目标集文本 + 项目卡）
  → llm.call({provider, model, maxTokens, reasoningEffort})
  → 解析 JSON（失败则报错，不猜）
  → 校验条目（quote 必须能在原文找到，否则降级为 warn）
  → 写 review-*.md → 返回 verdict/findings
```

### 3.3 工具面

| 工具 | operation | 主要依赖 |
|---|---|---|
| `scriptwriter_init` | — | project, story 骨架, store |
| `scriptwriter_story` | pitch / stage / promise / read | story codec |
| `scriptwriter_cast` | upsert / list / remove | cast codec, 引用扫描 |
| `scriptwriter_outline` | plan / batch / read / remove | outline codec, cast 校验 |
| `scriptwriter_script` | write / read | script parser, gates |
| `scriptwriter_check` | — | checks/*, reports |
| `scriptwriter_review` | — | craft, llm |
| `scriptwriter_confirm` | — | gates, project.json |
| `scriptwriter_status` | detail=dashboard/bible/plan/episode/craft | 派生统计 |
| `scriptwriter_export` | kind=… | export, gates |
| `scriptwriter_dissect` | upsert / list / read / remove | 竞品 codec |

### 3.4 检查引擎

- 一次解析，多个纯函数消费同一 `ParsedEpisode`，避免每维度重复解析。
- 每个 check 返回 `Finding[]`；`findings.merge` 统一：
  - 补 `ruleRef`（DR 或 CFG）与 `location`；
  - 排序 severity → episode → scene → line → code；
  - 去重（code + file + line）；
  - 计数。
- 阈值来自 `project.json` / 插件默认；`CFG-*` 前缀与 `DR-*` 分开统计。
- 性能：80 集 < 5s；单集 < 200ms。解析与检查都不做 O(n²) 字符串扫描。

### 3.5 评审引擎

- 每种 `kind` 一个 rubric（版本号 `opening@1` 等），由 `core/review.ts` 生成：
  - 系统提示：只判断、不改写；必须引用原文；输出 JSON。
  - 上下文：项目卡 + 人物 + 阶段 + 目标集全文（只读）。
  - 输出 schema：`{verdict, findings:[{severity,episode,quote,issue,fix}]}`。
- 结果校验：`quote` 必须出现在对应集正文（允许省略号截断），否则该条降级并标注
  `unverified_quote`；JSON 解析失败 → `ok:false`，不编造。
- 记录：provider/model/routeSource/rubricVersion/at；不写 finding code。
- 成本控制：默认 `maxTokens=4096`、`reasoningEffort=off`（若路由支持）；
  超时默认 120s。
- 评审不改文件（测试用文件哈希断言）。

### 3.6 门禁状态机

```
setup ──init──▶ pitch ──pitch+cast+stage──▶ outline ──≥3 outline──▶ opening
  ▲                                                              │ 3 scripts + confirm
  │                                                              ▼
  └──────────── 任意阶段可回退（不删数据） ◀────────────── writing ──all planned──▶ finale
                                                                  │ delivery confirm
                                                                  ▼
                                                               delivery
```

- `settings` 确认：pitch 四槽 + 核心 + ≥1 主角 + 三阶段覆盖。
- `opening` 确认：第 1–3 集剧本存在。
- `episode` 确认：单集存在；记录集号。
- `delivery` 确认：故事/人物/大纲/前 3 集 + 一次全量机检。
- 只卡「越级」：草稿、读取、检查、评审永不因门禁失败。

### 3.7 存储

- `TextFs` 窄端口：`stat/read/write/list/remove/rename`，由 `host/fs-adapter.ts`
  包装 `ctx.fs`；测试用 `test/memory-fs.ts`。
- 路径解析：相对项目根；禁止 `..` 越界；导出路径同样校验。
- 写入顺序：内容 → 索引（project.json）→ 报告。
- 批量写：逐项 try/catch，返回 `written/failed`；不因一项失败回滚已写项。
- 解析失败：抛出带文件/行号的 `ParseError`；store 不写回。

---

## 4. 阶段与任务

> 每个阶段结束都要满足 DoD（AGENTS.md §6），并在 `tasks.md` 勾选 + 记录验证。
> 时间以「一个熟练 agent 的工作会话」计，不是承诺。

### P0 · 规格（本次）

交付：`AGENTS.md`、`spec.md`、`plan.md`、`tasks.md`、`data-model.md`、
`contracts/tools.md`、`research.md`、`README.md`。

退出：用户批准 spec/plan；Q1–Q4 有答案或明确采用默认。

### P1 · 最小可安装插件（1–2 会话）

目的：在写业务逻辑前，证明四条链路可用。

任务：

- T-101 pnpm workspace / tsconfig / vitest / .gitignore / scripts。
- T-102 `scriptwriter_init` 最小实现 + 公共信封 + `apply`。
- T-103 bundle 包 + `cordis.patch.yml` + `dsh.bundle.patch`。
- T-104 `ctx.inject(['systemPrompt'])` 注入一行上下文（stub）。
- T-105 `scripts/pack.mjs` 产出 tgz；解包检查入口/patch。
- T-106 测试骨架：`memory-fs`、fake exec、`makeProject()`。
- T-107 DSH 服务验证：工具注册、prompt、llm 路由、install（安装需批准）。

退出：`pnpm run build && pnpm test` 绿；`node scripts/verify-dist.mjs` 通过；
最小 profile 中能看到 `scriptwriter_init`（或 `--dump-config` 有行）。

### P2 · 纯领域核心（2–3 会话）

- T-201 `types/enums/codes` + schema 校验。
- T-202 故事层 codec（读/写/缺项）。
- T-203 人物层 codec + 关系校验。
- T-204 分集大纲 codec（按 10 集分文件、合并/拆分）。
- T-205 剧本解析器（紧凑式 + 四行式 + OS/VO/闪回/字幕）。
- T-206 剧本渲染器 + 往返测试。
- T-207 findings 合并/排序/去重 + 60 个单测。

退出：golden fixture 的解析/渲染稳定；`core` 覆盖 ≥90%；无 host 依赖。

### P3 · 存储与工具（2–3 会话）

- T-301 Store：项目加载、文件优先、索引、错误定位。
- T-302 Resolver：按 session cwd 缓存 + 隔离测试。
- T-303 init/story/cast/outline 工具。
- T-304 script 工具 + 门禁。
- T-305 status dashboard/bible/plan。
- T-306 集成测试：空目录 → 三集；双工作区隔离；手改文件被采纳；
  坏语法不覆盖。

退出：SC-01 的主干可跑；门禁测试通过；无写穿沙箱。

### P4 · 机检（2 会话）

- T-401 FMT/STR/DUR/DLG/CST/CMP/CON 各维度。
- T-402 情绪节拍（EMO）与钩子轮换。
- T-403 报告渲染 + `审查报告.md`。
- T-404 合规清单（版本化，info/warn）。
- T-405 性能基准（80 集）。
- T-406 golden expected findings 对齐。

退出：SC-05；fixture 的预期 finding 全部命中；check 零模型调用（用 spy 断言）。

### P5 · 评审与确认（1–2 会话）

- T-501 `ctx.llm` 路由（配置/会话默认/调用覆盖）+ 失败路径。
- T-502 rubric：opening/hook/emotion/dialogue/shootability/full。
- T-503 结果校验（quote 必须可定位）+ 记录 + 报告。
- T-504 `confirm` 四类 + 门禁联动。
- T-505 `craft` 11 主题（课程蒸馏，短引用）。
- T-506 测试：fake llm、不改字节、无模型报错、确认原话必填。

退出：SC-06/07；评审不修改任何内容文件（哈希断言）。

### P6 · 导出与上下文（1–2 会话）

- T-601 投稿包/全剧本/大纲/报告导出。
- T-602 运行上下文（真实快照 + blockers + next）。
- T-603 迁移（schemaVersion）。
- T-604 e2e：空目录 → 80 集大纲 → 前 3 集 → 机检 → 评审 → 确认 → 投稿包。

退出：SC-01/08；上下文在一个会话内能指导下一步。

### P7 · 打包、安装、文档（1–2 会话）

- T-701 `pack.mjs` + `verify-dist.mjs`（内容清单、patch 解析、入口可 import）。
- T-702 安装到 web profile（需用户批准）+ `--dump-config` + 新会话验证。
- T-703 README（安装/快速开始/工具表/限制）+ 示例项目。
- T-704 全量回归 + 未验证清单。
- T-705 **Skill 产出物**：`dist/skill/ai-scriptwriter/`（`SKILL.md`、`references/`、
  `scripts/install.sh`、`plugin/ai-scriptwriter-<version>.tgz`），references 由 `core/craft.ts` 生成。
- T-706 Skill 验收：frontmatter 可解析、`install.sh --dry-run` 不写文件、版本一致。

退出：SC-09/10/13；tarball 可装；skill 可被发现；文档能让新用户从零跑通。

### P8 ·（可选，v0.2）Web 面板

不做，除非用户选 Q1。若做：右侧栏 tab（项目卡/集数进度/问题列表），
复用 `dsh-client-ui-sidebar-right`；需要 `dsh.client` 声明与 tsdown 构建。

---

## 5. 测试策略

### 5.1 分层

| 层 | 范围 | 工具 | 数量目标 |
|---|---|---|---|
| 单元 | core codec/parser/checks/gates/export | vitest | 120+ |
| 集成 | host store/tools/resolver + memory fs | vitest | 30+ |
| Golden | `mini-project` 端到端 | vitest | 8–10 |
| 契约 | 11 工具 schema/信封/名字 | vitest | 12 |
| 静态 | typecheck/build | tsc | — |
| 手工 | 安装、GUI 会话、文件可读性 | 人 | 1 份清单 |

### 5.2 必测清单（对应 SC）

- SC-02：解析→渲染→解析结构等价；FMT 行号准确。
- SC-03：钩子缺失/非法类型/末场未标记；连续 3 集同类型 warn。
- SC-04：字数窗口、秒数估计、±20% 越界。
- SC-05：spy 断言 check 不调用 llm；80 集基准。
- SC-06：fake llm 返回固定 JSON；quote 定位失败降级；文件哈希不变。
- SC-07：四道门禁的拒绝与解锁。
- SC-08：投稿包 9 项；重复导出稳定。
- SC-12：两个 cwd 的项目互不污染。

### 5.3 测试数据

- `test/fixtures/mini-project/`：3 集、故意留 1 error + 2 warn。
- `test/fixtures/broken/`：缺集头、场号重复、闪回未闭合、未登记人物。
- `test/fixtures/long/`：80 集大纲（脚本可空），用于性能与覆盖。
- 所有 fixture 用原创占位文本，不复制课程案例原文。

---

## 6. 验证命令

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
pnpm run pack
node scripts/verify-dist.mjs
```

手工验收（需用户批准安装）：

```sh
dsh plugin --profile web add -w "$(pwd)/dist/dsh-plugin/ai-scriptwriter-0.1.0.tgz"
dsh --profile web --dump-config | grep -A3 ai-scriptwriter
# 重启 dsh web；新会话：
#   scriptwriter_init → scriptwriter_story → scriptwriter_cast → scriptwriter_outline → scriptwriter_script
#   → scriptwriter_check → scriptwriter_review → scriptwriter_confirm → scriptwriter_export
```

验收记录写 `tasks.md` 末尾「验证记录」，含命令、日期、结果摘要、未验证项。

---

## 7. 风险与对策

| # | 风险 | 影响 | 对策 | 阶段 |
|---|---|---|---|---|
| R1 | 课程口径不一致被写成硬规则 | 产品撒谎 | `research.md` 账本；DR/CFG 分离；默认可配 | P0/P4 |
| R2 | 合规清单给出虚假安全感 | 用户误以为过审 | 全部 info/warn；「需人工复核」；无「通过」 | P4 |
| R3 | 时长估算不准 | 误报/漏报 | 同时报字数与估计秒数；阈值可配；只 warn | P4 |
| R4 | 评审不稳定/贵 | 结果不可信 | rubric 版本化、记录模型、quote 校验、不设门禁 | P5 |
| R5 | DSH API 漂移 | 装不上/跑不起 | P1 spike；锁版本；薄适配层；契约测试 | P1 |
| R6 | 打包/安装失败 | 无法交付 | P1 先验证；pack 脚本 + verify-dist；安装清单 | P1/P7 |
| R7 | 多文件写一半 | 数据不一致 | 先内容后索引；逐项报告；单写队列 | P3 |
| R8 | 范围蔓延（面板/视频/平台） | 交付不了 | 非目标；Q1 决策；P8 独立 | 全程 |
| R9 | 中文格式变体解析失败 | 作者写不进去 | 容错解析 + 行号错误 + fixture | P2 |
| R10 | 门禁太烦 | 用户绕过 | 只卡越级；解锁调用明确；草稿不卡 | P3/P5 |
| R11 | 课程原文版权 | 法务风险 | 技法表转述 + 短引用 + 出处；不整段复制 | P5 |
| R12 | 剧本过长/过短 | 时长失控 | 字数窗口 + 估计秒数 + 删补建议 | P4 |
| R13 | Skill 与插件内容漂移 | 两份说法 | references 由 `core/craft.ts` 生成；打包时校验版本/哈希 | P7 |

---

## 8. 发布与兼容

- 版本：0.1.0；`project.json.schemaVersion = 1`。
- 发布物：`dist/dsh-plugin/ai-scriptwriter-0.1.0.tgz`（单包：bundle + host 合并）与
  `dist/skill/ai-scriptwriter/`（含同一份 tarball 的 skill 目录，另打 `.tar.gz`）。
- 升级策略：工具名/operation 只增不改；参数只增可选；`rulesVersion` 变更要在
  报告中体现。
- 卸载：`dsh plugin --profile web remove -w @ai-scriptwriter/scriptwriter-bundle`（安装后验证）。
- 不写用户目录：除安装动作外，插件只读写会话工作区。

---

## 9. 工作量估算

| 阶段 | 会话数 | 主要不确定性 |
|---|---|---|
| P0 规格 | 1（本次） | 用户是否批准 |
| P1 最小插件 | 1–2 | DSH API/安装 |
| P2 核心 | 2–3 | 解析器边界 |
| P3 存储/工具 | 2–3 | 多文件/门禁 |
| P4 机检 | 2 | 规则数量 |
| P5 评审/确认 | 1–2 | 模型路由/输出稳定性 |
| P6 导出/上下文 | 1–2 | 投稿包完整性 |
| P7 打包/文档 | 1 | 安装环境 |
| 合计 | 10–15 | |

---

## 10. 待决定（阻塞 P1 的只有 Q1/Q2）

- **Q1**：v0.1 是否包含 Web 面板？（推荐否）
- **Q2**：是否允许安装到 `~/.dsh/profiles/web`？（已解决：用户批准；2026-10-28 已安装）
- **Q3**：默认体量 80×90 / 60×120 / init 必问？（推荐 80×90，可改）
- **Q4**：评审粒度按集 / 全剧 / 两者？（推荐 opening+full 各一次，单集按需）

---

## 12. 实现记录（v0.1，2026-10-28）

已交付：

- `packages/screenwriter/`：11 个工具、Markdown 存储、机检、rubric 评审、门禁、导出、
  runtime 上下文；`core/` 无 DSH 依赖，`host/` 只通过 `ctx.fs` 读写。
- `packages/bundle/`：profile bundle patch（源码行指向 `@ai-scriptwriter/scriptwriter`）。
- `scripts/pack.mjs`：合并为 `dist/dsh-plugin/ai-scriptwriter-0.1.0.tgz`，并生成
  `dist/skill/ai-scriptwriter/`（SKILL.md + 13 个 references + install.sh + 同一 tarball）。
- 测试：8 个 host 测试文件共 46 个用例 + 1 个 bundle 测试。
- 文档：README 重写；AGENTS/spec/plan/tasks/data-model/contracts/research 更新。

与计划的偏差（已接受）：

| 偏差 | 原因 |
|---|---|
| `episodes` 下限从 40 调为 10 | 允许试写/短篇测试；课程默认 80 不变；contract 已改 |
| 未做 Web 面板 | v0.1 非目标；用户未要求 |
| 未做 80 集性能基准 | 有 10 集级工具链测试；基准列入 T-405 |
| 未做 schema v0→v1 迁移测试 | 当前只有 v1；未来版本只读拒绝已实现 |
| 未用真实模型跑评审 | 路由/请求/JSON 校验已实现；真实调用需会话环境 |
| 已安装到用户 `~/.dsh` | 2026-10-28 经用户批准安装 live profile；包名 `@ai-scriptwriter/scriptwriter-bundle` |
| 工具前缀改为 `scriptwriter_*` | 用户最终命名；包名、行 id、文档、测试同步 |

验证（2026-10-28）：

```sh
pnpm run build        # tsc 声明 + esbuild lib/index.js + lib/core/craft.js
pnpm run typecheck    # 通过
pnpm test             # host 46 + bundle 1 通过
pnpm run pack         # 两个产出物
pnpm run verify:dist  # 解包 import、11 工具名、Skill 结构、install.sh --dry-run
DSH_HOME=$PWD/.tmp/dsh-home dsh plugin --profile web add -w dist/dsh-plugin/ai-scriptwriter-0.1.0.tgz
DSH_HOME=$PWD/.tmp/dsh-home dsh --profile web --dump-config | grep -A2 ai-scriptwriter
```

临时 `DSH_HOME` 中还启动过一次 web（`--port 3099`，首页 200，启动日志无插件错误），
但没有创建会话、没有调用工具。

未验证：真实 `dsh web` 会话中的工具可见性与调用；真实模型评审质量；80 集全量耗时；
用户 live profile 安装。

## 13. 变更记录

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-10-28 | v0.1 | 初稿：8 个阶段、11 工具、测试与风险清单 |
