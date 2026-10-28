# AGENTS.md — 短剧编剧台（DeepSeek Harness 插件）

> 本文件是这个仓库对 agent 的常驻工作约束，不解释产品细节。
> 产品要什么，看 `specs/001-duanju-screenwriter/spec.md`；怎么做，看 `plan.md`；
> 现在做到哪，看 `tasks.md`。当前状态：**实现阶段（v0.1）**，规格已获作者批准。

## 0. 一句话

把红果《短剧编剧第一课》10 期的方法论，做成 DeepSeek Harness 的**编剧工具插件**：
模型在结构化项目（立项 → 人物 → 分集大纲 → 逐集剧本 → 机检/评审 → 投稿包）上工作；
确定性规则负责「齐不齐」，模型评审负责「好不好」，作者负责「发不发」。

## 1. 权威顺序

发生冲突时，按此顺序取事实：

1. `references/hongguo-lesson-01/*.md` —— 课程原文，领域事实的唯一来源。
2. `specs/001-duanju-screenwriter/spec.md` —— 产品要什么（FR / SC / DR）。
3. `specs/001-duanju-screenwriter/data-model.md`、`contracts/` —— 文件结构与工具接口。
4. `specs/001-duanju-screenwriter/plan.md` —— 架构、阶段、验证方式。
5. `specs/001-duanju-screenwriter/tasks.md` —— 执行顺序与完成定义。
6. 本文件 —— 工作方式。

**课程原文 > spec 转述 > 代码注释。** 课程没写的数字，不许写成硬规则；只能作为
可配置默认值，并在 `research.md` 标注「课程未明确」。

## 2. 规格驱动工作流（每次改动都走一遍）

1. **SPECIFY**：先改 `spec.md`（用户故事 / FR / SC / 领域规则）。行为变了而 spec 没变，
   就是没做完。变更写进 spec 末尾的 changelog。
2. **CLARIFY**：有歧义时先问用户，不替用户决定。产品级的岔路（是否做 Web 面板、
   是否安装到 `~/.dsh`、默认体量）必须显式提问。
3. **PLAN**：架构、数据流、阶段、风险写进 `plan.md`；接口写进 `contracts/`；
   实体与文件格式写进 `data-model.md`。
4. **TASKS**：把工作拆成 `T-xxx`，每个任务标注对应的 FR、依赖、完成判据。
   一个任务只做一件事，能独立验证。
5. **IMPLEMENT**：一次只做一个任务。纯逻辑先进 `core/` 并有单测，再接 `host/` 工具。
   不许「先写一大坨再补测试」。
6. **VERIFY**：跑 typecheck / test / build，把命令与结果摘要写回 `tasks.md` 的验证记录。
   没跑过的，不许写「已通过」。

**本仓库当前处于 IMPLEMENT 阶段**（用户已批准 v0.1 规格与计划）。规格变更仍须先改
`spec.md` 并记录 changelog，再动代码。

## 3. 宪法（不可协商）

1. **规格先行**：没有 spec 条目和任务编号的代码不写。
2. **课程可追溯**：每条领域规则（DR-xx）必须标注课程期号与小节；每条机检 finding
   必须带 `ruleRef`（DR 编号）。禁止凭印象编「行业规则」。
3. **计算与判断分离**：`scriptwriter_check` 只做确定性计算，**绝不调用模型**；
   `scriptwriter_review` 只做判断并记录 rubric/model，**绝不改正文**。
   两者的结果不得混成同一个「分数」。
4. **作者主权**：`scriptwriter_confirm` 记录的是用户本人的话；不许替用户确认、不许编造确认。
   第 4 集起必须先有「前三集确认」；投稿导出前必须先有「交付确认」。
5. **文件优先，不毁数据**：Markdown 是权威内容，人类手改即为权威输入；
   解析失败时报错并指名文件/行号，**绝不用旧值覆盖**。多文件写入失败要如实报告
   「哪些已写、哪些没写」。
6. **不造数据**：不抓取平台、不伪造榜单/播放量/评分/中位值。没有数据就说没有。
   不做「保证爆款」「保证过稿」的承诺。
7. **合规不是判决**：`CMP-*` 只是提醒清单，全部为「需人工复核」，工具永不输出
   「合规通过」。合规结论只能由人给出。
8. **默认值可配置**：集数、单集秒数、字数区间、字数/秒、成本档、钩子轮换阈值
   都是项目设置；课程里的数字只做默认值，并注明出处与不确定性。
9. **会话隔离**：项目根来自 `exec.agent.session.header.cwd`，不是 `process.cwd()`；
   一个进程可服务多个工作区。所有读写走 `ctx.fs` 的沙箱策略。
10. **诚实报告**：未验证就说未验证；失败就贴错误；不把「代码写完」说成「功能可用」。

## 4. 技术约束

- 运行时：Node ≥ 22（当前 24.11），pnpm 9.15.4，ESM only，TypeScript strict。
- 目标 DSH：**0.2.1-rc.2**（当前 CLI）；peer 兼容 `^0.2.0-rc.2`（live profile 实际为
  0.2.0-rc.2）。`@deepseek-ai/*` 开发依赖用精确版本，宿主服务走 peerDependencies；
  升级 DSH 必须先改 plan 再动代码。
- 仓库形态：pnpm workspace，两个包
  - `packages/screenwriter` —— 插件本体（`core/` 纯逻辑 + `host/` 适配 + `index.ts`）；
  - `packages/bundle` —— profile bundle（`dsh.bundle.patch` + `cordis.patch.yml`）。
  - 发布时由 `scripts/pack.mjs` 合并成**一个** tarball（pnpm 一个归档只认一个包），
    并同时生成 `dist/skill/ai-scriptwriter/`（SKILL.md + references + install.sh +
    同一份 tarball）。两份内容必须同源，references 由 `core/craft.ts` 生成。
- 依赖方向：`core → 无外部依赖`；`host → core + @deepseek-ai/*`；`bundle → 仅 patch`。
  `core/` 不得 import cordis / dsh / `node:fs` / `process`，以便纯单测。
- 文件访问：`host/` 统一走 `ctx.fs`（resolve / readText / writeText / listDir）；
  原子提交可用 `@deepseek-ai/dsh-atomic-write`。不得绕过沙箱。
- 打包陷阱（已由同类插件验证）：
  - patch 行的 `name` 必须是**裸包名**（带子路径会让 client 半身扫描不到）；
  - 一个 tarball 只能装一个包；
  - `dsh plugin add` 需要 `-w`（profile 目录本身是 pnpm workspace root）。
- 工具命名：`scriptwriter_*`（2026-10-28 由 `duanju_*` 重命名）；之后只加 operation。
- 文案：产品内文案与文档用中文；代码标识、类型名、文件名用英文。

## 5. 命令

```sh
pnpm install
pnpm run build          # 构建 lib/
pnpm run typecheck
pnpm test               # vitest
pnpm run pack           # dist/dsh-plugin/ai-scriptwriter-<version>.tgz + dist/skill/ai-scriptwriter/

# 安装进当前 DSH web profile（需要用户明确同意，会写 ~/.dsh）
dsh plugin --profile web add -w "$(pwd)/dist/dsh-plugin/ai-scriptwriter-0.1.0.tgz"
dsh --profile web --dump-config | grep -A3 ai-scriptwriter
# 重启 dsh web 后，新会话才看得到新工具
```

本仓库默认**不写** `~/.dsh`；安装只在用户批准后执行。开发期可把 profile 指向本仓库
的 `packages/bundle`，但要在回复里说明「需重启/刷新」。

## 6. 完成定义（Definition of Done）

一个任务只有同时满足以下条件才算完成：

- [ ] 对应 FR 的行为已实现，且有测试覆盖（纯逻辑单测 / 工具集成测试）。
- [ ] `pnpm run typecheck && pnpm test && pnpm run build` 全绿。
- [ ] 行为变化已写回 `spec.md`（含 changelog）与 `tasks.md`（勾选 + 验证记录）。
- [ ] 用户可见的新能力写进 `README.md` 或 `docs/`，不是只活在代码里。
- [ ] 没有未经验证的断言；未测的部分在回复里点名。

## 7. 汇报格式

每轮结束时用中文简短汇报：

1. 做了什么（对应 T-xxx / FR-xxx）。
2. 改了哪些文件（完整相对路径）。
3. 验证命令与结果（贴关键输出，不贴整屏）。
4. 未验证/未做的部分。
5. 需要用户决定的事（如有）。

不写「已完成」四个字来代替证据。

## 8. 参考

- 课程：`references/hongguo-lesson-01/短剧编剧第一课-01.md` … `-10.md`
- 同源先例（架构与打包经验，非本产品规格）：`/Users/ju/IDEA/ai-novelist`
- DSH 包文档：`/Users/ju/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/*/README.md`
