# 001 · 任务清单（tasks）

- 状态：P0 完成、等待批准；P1 起全部未开始
- 用法：一次只做一个任务；完成后勾选并按 AGENTS.md §6 记录验证。
- `FR:` 对应 `spec.md`；`Dep:` 前置任务；`Done:` 是完成判据（可验证）。

---

## P0 · 规格（本次）

- [x] **T-001 课程研究** — 读完 10 期并产出证据账本。
  `FR:` 全部 `Dep:` — `Done:` `research.md` 完成，DR 均有出处，口径不一致已标注。
- [x] **T-002 产品规格** — 用户故事、11 工具、39 条 DR、27 条 FR、13 条 SC。
  `FR:` 全部 `Dep:` T-001 `Done:` `spec.md` 完成，非目标与待决问题明确。
- [x] **T-003 数据模型** — 文件树、Markdown 方言、解析/渲染、finding/报告。
  `FR:` FR-103/107/108/109/117 `Dep:` T-002 `Done:` `data-model.md` 完成。
- [x] **T-004 工具契约** — 11 个工具的 operation/参数/返回/门禁。
  `FR:` FR-101…FR-126 `Dep:` T-002/003 `Done:` `contracts/tools.md` 完成。
- [x] **T-005 计划与任务** — 阶段、测试、风险、验证。
  `FR:` 全部 `Dep:` T-002/003/004 `Done:` `plan.md` 与 `tasks.md` 完成。
- [x] **T-006 工作约束** — `AGENTS.md`：规格驱动流程、宪法、技术约束、DoD。
  `FR:` — `Dep:` T-002 `Done:` `AGENTS.md` 完成。
- [x] **T-007 README** — 项目现状、规格链接、非目标。
  `FR:` — `Dep:` T-002 `Done:` `README.md` 更新。
- [x] **T-008 用户批准** — 作者确认 spec/plan 并追加「同时产出 plugin 与 skill」。
  `FR:` — `Dep:` T-002…T-007 `Done:` 用户明确批准；未批准不得开始 T-101。

---

## P1 · 最小可安装插件

- [x] **T-101 脚手架** — pnpm workspace、`tsconfig.base.json`、两个包、vitest、gitignore。
  `FR:` NFR-05/07 `Dep:` T-008 `Done:` `pnpm install && pnpm run typecheck` 通过（空实现）。
- [x] **T-102 插件骨架 + `scriptwriter_init` 最小实现** — `name/inject/apply`、
  公共信封、`defineTool`、`ctx.tools.register`；写 `project.json` + 故事骨架。
  `FR:` FR-101/126 `Dep:` T-101 `Done:` 单测：空目录 init 产物正确；重复 init 不覆盖。
- [x] **T-103 bundle 包** — `dsh.bundle.patch`、`cordis.patch.yml`（裸包名 row）、index.js。
  `FR:` NFR-05 `Dep:` T-101 `Done:` patch 可被 YAML 解析；row 名与包名一致。
- [x] **T-104 prompt 最小注入** — `ctx.inject(['systemPrompt'])` + 一行项目状态。
  `FR:` FR-104 `Dep:` T-102 `Done:` 测试里能断言注入文本；不阻塞渲染。
- [x] **T-105 打包脚本** — `scripts/pack.mjs` + `scripts/verify-dist.mjs`。
  `FR:` NFR-05 `Dep:` T-102/103 `Done:` 产出 tgz；verify 检查入口、patch、无源码泄漏。
- [x] **T-106 测试骨架** — `MemoryFs`、fake `ToolExecution`、`makeProject()`。
  `FR:` NFR-07 `Dep:` T-101 `Done:` 3 个示例测试通过。
- [ ] **T-107 DSH 链路 spike**（部分完成：工具注册/打包/临时 profile 安装已验；真实 llm 路由未验） — 工具注册、prompt、`ctx.llm` 路由、安装（需批准）。
  `FR:` NFR-05 `Dep:` T-104/105 `Done:` 记录四项链路结果；失败项写进 plan 风险。

---

## P2 · 纯领域核心

- [x] **T-201 类型/枚举/错误码** — `types/enums/codes`；与 data-model 一致。
  `FR:` FR-103/107/108/111 `Dep:` T-101 `Done:` 类型编译；枚举快照测试。
- [x] **T-202 故事层 codec** — 一句话四槽、核心、差异化、阶段、伏笔的读写与缺项。
  `FR:` FR-105/106/124 `Dep:` T-201 `Done:` round-trip；缺槽位被报出。
- [x] **T-203 人物 codec** — 人物节读写、关系目标校验、删除引用扫描。
  `FR:` FR-107 `Dep:` T-201 `Done:` 重名/悬空关系/删除被引用均有用例。
- [x] **T-204 分集大纲 codec** — 10 集一段、跨段合并、字段校验。
  `FR:` FR-108 `Dep:` T-201 `Done:` 写第 15 集落到第 011-020 文件；区间正确。
- [x] **T-205 剧本解析器** — 紧凑场头、四行式、人物行、△、对白、OS/VO、
  闪回、字幕、行号。
  `FR:` FR-109 `Dep:` T-201 `Done:` 30 个解析用例（含坏输入）全过。
- [x] **T-206 剧本渲染器** — 规范化输出；往返等价。
  `FR:` FR-109 `Dep:` T-205 `Done:` `parse(render(parse(x)))` 结构等价。
- [x] **T-207 findings 引擎** — 合并/排序/去重/计数；`ruleRef` 双前缀。
  `FR:` FR-117 `Dep:` T-201 `Done:` 稳定性测试（同一输入两次结果一致）。

---

## P3 · 存储与工具

- [x] **T-301 Store** — 加载项目树、文件优先采纳、索引更新、ParseError 定位。
  `FR:` FR-103/125 `Dep:` T-202/203/204/206 `Done:` 手改文件被采纳；坏语法不覆盖。
- [x] **T-302 Resolver** — 按 `session.header.cwd` 缓存；fallback 链。
  `FR:` FR-102 `Dep:` T-301 `Done:` 两个 root 的 Store 互不污染。
- [x] **T-303 init/story/cast/outline 工具** — 参数、校验、返回、next。
  `FR:` FR-101/105/106/107/108/124 `Dep:` T-301 `Done:` 集成测试覆盖成功与拒绝。
- [x] **T-304 script 工具 + 门禁** — write/read；FMT 致命拒绝；settings/opening 门禁。
  `FR:` FR-109/110/126 `Dep:` T-303 `Done:` 未确认写第 4 集返回 `GATE_OPENING` + 解锁步骤。
- [x] **T-305 status（dashboard/bible/plan/episode）** — 派生统计、成本、伏笔、确认。
  `FR:` FR-121 `Dep:` T-301 `Done:` 空项目/半项目/全项目三种输出正确。
- [x] **T-306 存储集成测试** — 空目录→三集、双工作区、部分失败报告。
  `FR:` FR-102/103 `Dep:` T-303/304 `Done:` SC-01 主干通过。
- [x] **T-307 `scriptwriter_dissect`** — 竞品条目读写、空话拦截、列表/删除。
  `FR:` FR-123 `Dep:` T-301 `Done:` upsert/list/read/remove 均有用例。

---

## P4 · 机检

- [x] **T-401 FMT/STR/DUR/DLG/CST/CON** — 各维度规则与 `DR-*` 引用。
  `FR:` FR-111/112/113/114/116 `Dep:` T-207 `Done:` 各维度有代表用例；未逐条覆盖全部 finding 码。
- [ ] **T-402 情绪节拍 + 钩子轮换**（部分完成：大小情绪点检查已有；连续同型钩子未实现） — 每集小点、5–10 集大点、连续同类型钩子。
  `FR:` FR-111/112 `Dep:` T-401 `Done:` 蓄力集不误报；连续 3 集同型 warn。
- [x] **T-403 报告渲染** — check 报告 + `审查报告.md` + 计数。
  `FR:` FR-117 `Dep:` T-401 `Done:` 报告含 ruleRef/定位/建议；重复生成稳定。
- [x] **T-404 合规清单** — 版本化分类词表；info/warn；无「通过」。
  `FR:` FR-115 `Dep:` T-401 `Done:` 每个分类至少 3 条用例；报告写清单版本。
- [ ] **T-405 性能基准**（未做 80 集基准） — 80 集全量 <5s、单集 <200ms。
  `FR:` NFR-03 `Done:` 基准脚本输出 p50/p95。
- [ ] **T-406 golden 对齐**（有 fixture 测试，未落 expected-findings.json） — `expected-findings.json` 与真实输出一致。
  `FR:` SC-02/05 `Dep:` T-401 `Done:` `pnpm test` 中 golden 断言通过。

---

## P5 · 评审与确认

- [ ] **T-501 模型路由**（代码实现，未用真实模型验证） — 配置/会话默认/调用覆盖；超时与无模型错误。
  `FR:` FR-118 `Dep:` T-107 `Done:` fake adapter 三种来源；无路由返回 `NO_MODEL`。
- [x] **T-502 rubric** — opening/hook/emotion/dialogue/shootability/full 六套。
  `FR:` FR-118 `Dep:` T-201 `Done:` 每套含版本号、检查维度、输出 schema。
- [ ] **T-503 评审执行与记录**（部分完成：JSON 校验/quote 降级/报告已实现；无文件哈希测试） — 组装上下文、调用、JSON 校验、quote 定位、报告、文件哈希不变。
  `FR:` FR-118 `Dep:` T-501/502 `Done:` 文件哈希断言；坏 JSON 不写报告只报错。
- [x] **T-504 确认四类 + 门禁** — settings/opening/episode/delivery；
  userWords 必填；与 FR-110 联动。
  `FR:` FR-120 `Dep:` T-304 `Done:` 四类实现；settings/opening 有测试，episode/delivery 部分。
- [x] **T-505 craft 11 主题** — 从课程转述（短引用 + 出处），按需返回。
  `FR:` FR-119 `Dep:` T-201 `Done:` 主题清单稳定；未知主题列可用项。
- [ ] **T-506 评审测试**（有 JSON 解析测试，无 fake LLM 端到端） — fake llm 固定输出；quote 不可定位降级；无模型报错。
  `FR:` SC-06 `Dep:` T-503 `Done:` 三组测试通过。

---

## P6 · 导出与上下文

- [x] **T-601 导出** — submission/scripts/outline/report/all；9 项投稿包；稳定命名。
  `FR:` FR-122 `Dep:` T-301/403 `Done:` 重复导出字节稳定（除时间戳）。
- [x] **T-602 真实上下文** — 快照、stage、blockers、next、TTL。
  `FR:` FR-104 `Dep:` T-305 `Done:` 渲染不读盘；1.5s 后刷新。
- [ ] **T-603 迁移**（有 schemaVersion 未来版本拒绝；无 v0→v1 迁移测试） — schemaVersion、未来版本拒绝写、未知字段保留。
  `FR:` FR-125 `Dep:` T-301 `Done:` v0→v1 迁移测试。
- [ ] **T-604 端到端**（有 10 集级工具链测试，未跑 80 集全量） — 空目录→80 集大纲→前 3 集→机检→评审→确认→投稿包。
  `FR:` SC-01/08 `Dep:` T-601/602/603 `Done:` 一次脚本化 e2e 通过，产物可读。

---

## P7 · 打包、安装、文档

- [x] **T-701 发布脚本** — 合并包、`verify-dist.mjs`、README 生成。
  `FR:` NFR-05 `Dep:` T-105 `Done:` tgz 内容清单正确；入口可 import。
- [x] **T-702 安装验收**（live profile 已安装并 `--dump-config`；当前会话工具可见；完整写作链路未跑） — 写入 profile（需批准）、`--dump-config`、新会话工具可见。
  `FR:` SC-09 `Dep:` T-701 `Done:` 记录命令与输出；失败则回滚并报告。
- [x] **T-703 文档** — README（安装/快速开始/工具表/限制）、示例项目、技法索引。
  `FR:` NFR-09 `Dep:` T-701 `Done:` 新用户按文档能跑通最小链路。
- [x] **T-704 全量回归** — typecheck/test/build/pack + 手工清单；未验证清单。
  `FR:` SC-10/11 `Dep:` 全部 `Done:` 结果写验证记录。

---

## P8 ·（可选）Web 面板 — 不在 v0.1

- [ ] **T-801** 右侧栏 tab：项目卡、集数进度、问题列表。
  `FR:` Q1 决定 `Dep:` T-702 `Done:` 见 v0.2 spec。

---

## FR → 任务覆盖

| FR | 任务 |
|---|---|
| FR-101 | T-102, T-303 |
| FR-102 | T-302 |
| FR-103 | T-301, T-303, T-306 |
| FR-104 | T-104, T-602 |
| FR-105 | T-202, T-303 |
| FR-106 | T-202, T-303 |
| FR-107 | T-203, T-303 |
| FR-108 | T-204, T-303 |
| FR-109 | T-205, T-206, T-304 |
| FR-110 | T-304, T-504 |
| FR-111 | T-401, T-402 |
| FR-112 | T-401 |
| FR-113 | T-401 |
| FR-114 | T-401 |
| FR-115 | T-404 |
| FR-116 | T-401 |
| FR-117 | T-207, T-403 |
| FR-118 | T-501, T-502, T-503, T-506 |
| FR-119 | T-505 |
| FR-120 | T-504 |
| FR-121 | T-305 |
| FR-122 | T-601 |
| FR-123 | T-307 |
| FR-124 | T-202, T-303 |
| FR-125 | T-301, T-603 |
| FR-126 | 所有工具任务 + T-306 |
| FR-127 | T-705, T-706 |

---

## 验证记录

> 每个阶段结束时追加一行；命令、日期、结果、未验证项。

| 日期 | 任务 | 命令 | 结果 | 未验证 |
|---|---|---|---|---|
| 2026-10-28 | P0 | 文档审阅 | 规格/计划/数据/契约/研究/AGENTS/README 已写 | 无 |
| 2026-10-28 | P1–P3 | `pnpm run build` / `typecheck` / `test` | host 46 测试 + bundle 1 测试通过；构建产出 `lib/index.js`、`lib/core/craft.js` | 真实 GUI 会话 |
| 2026-10-28 | P4–P6 | `pnpm test` | 机检/门禁/导出/评审解析用例通过 | 80 集性能、真实模型评审、迁移 |
| 2026-10-28 | P7 | `pnpm run pack` + `verify:dist` | tarball 与 skill 产出；解包 import 成功，导出 11 工具名 | 已装 live profile |
| 2026-10-28 | 命名调整 | 工具前缀 `scriptwriter_*`；包 `@ai-scriptwriter/scriptwriter-bundle`；行 id `ai-scriptwriter`；live 重装 | 通过 | 完整写作链路 |
| 2026-10-28 | T-702（live） | `dsh plugin --profile web add -w .../ai-scriptwriter-0.1.0.tgz` + `--dump-config` | live 组合树出现 `id: ai-scriptwriter`，包名 `@ai-scriptwriter/scriptwriter-bundle`；工具名 `scriptwriter_*` 需重启后生效 | 重启后工具可见性/完整写作链路 |
| 2026-10-28 | 启动验收（临时） | `DSH_HOME=$PWD/.tmp/dsh-home dsh --profile web --port 3099` | 服务启动，首页 200；启动日志无插件错误 | 未创建会话/未调用工具 |
| — | — | — | — | — |
