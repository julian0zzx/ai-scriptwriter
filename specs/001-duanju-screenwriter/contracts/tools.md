# 001 · 工具契约（contracts/tools.md）

- 状态：Draft，随 `spec.md` 待批
- 实现：`packages/screenwriter/src/host/tools.ts`；所有工具名 `scriptwriter_*`，v0.1 固定 11 个
- 原则：**可预期的拒绝返回结构化 blockers，不抛异常**；参数/文件系统错误才抛。
  每个结果都带「下一步能调什么」，不让模型猜。

---

## 0. 公共信封

所有工具成功时返回同一形状（`data` 按工具不同）：

```ts
interface Envelope {
  ok: true
  tool: string
  operation?: string
  stage: 'setup'|'pitch'|'outline'|'opening'|'writing'|'finale'|'delivery'
  project: { title: string; root: string; plannedEpisodes: number }
  summary: string
  data?: unknown
  findings?: Finding[]      // 仅 check 的完整 findings；其它工具给摘要
  blockers?: Blocker[]      // 阻止继续的条件（ok 仍可为 true）
  warnings?: string[]
  next: string[]            // 具体调用建议，例如 "scriptwriter_outline operation=plan number=2"
}
```

预期拒绝（门禁、缺前置、只读冲突）：

```ts
interface Refusal {
  ok: false
  tool: string
  operation?: string
  stage: Envelope['stage']
  project: Envelope['project']
  summary: string
  blockers: Blocker[]       // 至少一条
  next: string[]
}
interface Blocker {
  code: string              // GATE_* / MISSING_* / CONFLICT
  message: string           // 人话
  unblock: string[]         // 具体解锁调用
}
```

约定：

- `blockers` 在成功结果里表示「后续阶段的前置未满足」，不阻止当前调用；
  `ok:false` 表示本次调用没有产生写入。
- 写入类工具必须返回 `data.written`（相对路径数组）与 `data.failed`（如有）。
- 所有路径为相对工作区根的 POSIX 路径；同时返回绝对根 `project.root` 供诊断。
- `next` 最多 4 条，必须是可以直接执行的调用字符串（带必要参数提示）。

---

## 1. `scriptwriter_init` — 立项

**描述**：创建或读取一个短剧项目；设置平台、题材、受众、集数与单集秒数。
已存在项目默认不覆盖。

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `title` | string | 是 | — | 剧名 |
| `platform` | string | 是 | — | 红果/抖音/快手/其他 |
| `genre` | string[] | 是 | — | 题材标签，≥1 |
| `audience` | string | 是 | — | 男频/女频/通用，可带人群描述 |
| `episodes` | int | 否 | 80 | 计划集数，10–150（10 用于试写/短篇测试） |
| `secondsPerEpisode` | int | 否 | 90 | 单集目标秒数，60–180 |
| `budgetTier` | `low\|medium\|high` | 否 | `low` | 成本档 |
| `wordWindow` | `{min,max}` | 否 | `{500,800}` | 单集字数窗口 |
| `charsPerSecond` | number | 否 | 5.5 | 字数→秒数 |
| `logline` | string | 否 | — | 一句话（可后补） |
| `overwrite` | bool | 否 | false | 显式覆盖已有项目（危险） |

返回 `data`: `{ created: boolean, project: ProjectSettings, files: string[] }`。

规则：

- 目录已有 `project.json` 且 `overwrite=false` → `ok:true`、`created:false`，
  `warnings:["项目已存在，未覆盖"]`，`next` 指向 `scriptwriter_status`。
- `overwrite=true` 时只重写设置，不删除已有内容文件；返回警告。
- 创建文件：`project.json`、`故事大纲.md`（骨架）、`人物设定.md`（空）、
  `分集大纲/`、`剧集/`、`竞品拆解.md`。

---

## 2. `scriptwriter_story` — 故事层

**描述**：写一句话/核心/差异化/对标/三阶段，或维护伏笔台账。

| operation | 参数 | 必填 | 说明 |
|---|---|---|---|
| `pitch` | `sentence?`, `protagonist`, `goal`, `obstacle`, `edge`, `desire`, `emotion`, `ending`, `differentiators[]`, `comparables[]?` | 除 sentence/comparables 外都必填 | 四槽位 + 核心 + 差异化 |
| `stage` | `stages[]`（1–5 项，通常 3） | 是 | 每项 `{index,from,to,task,goal,miniGoal,infoGap}` |
| `promise` | `id?`, `plantedAt`, `dueAt`, `payoff`, `status?` | 是 | 新增/更新伏笔；`id` 缺省自动 `p-001` |
| `read` | — | — | 返回故事层摘要 |

校验：

- `pitch`：四槽位非空、`differentiators` ≥1；不平滑通过。
- `stage`：区间连续覆盖 `1..episodes`、不重叠、`index` 连续；`infoGap` 必须是四值之一。
- `promise`：`plantedAt < dueAt ≤ episodes`；`status` ∈ `未回收|已回收|已放弃`。

写入：`故事大纲.md` 对应小节，保留未识别的其它小节。

---

## 3. `scriptwriter_cast` — 人物

**描述**：增删改人物小传；人物名即 id。

| operation | 参数 | 必填 | 说明 |
|---|---|---|---|
| `upsert` | `name`, `role`, `camp`, `desire`, `painPoint`, `personality`, `voice`, `arc`, `costTier`, `firstEpisode`, `exitEpisode?`, `relations[]?` | 除 exit/relations 外都必填 | 新增或整条替换 |
| `list` | — | — | 返回人物表摘要 |
| `remove` | `name` | 是 | 删除；被剧本引用时 `ok:false` 并列出引用 |

规则：

- `name` 唯一；重名 `upsert` 视为更新（`warnings:["已更新同名人物"]`）。
- `relations[].target` 必须已存在；否则 `ok:false`（`MISSING_CHARACTER`）。
- `remove` 前扫描已写剧本与分集大纲；有引用则拒绝，提示先改引用或 `force=true`
  （`force` 会留下 `CON-001` 警告）。

---

## 4. `scriptwriter_outline` — 分集大纲

**描述**：写/读分集大纲；每集含阶段、目标、冲突、情绪点、信息差、钩子、三段结构。

| operation | 参数 | 必填 | 说明 |
|---|---|---|---|
| `plan` | `number` + 全部字段（见下） | 是 | 写一集；已存在则更新 |
| `batch` | `entries[]`（1–10 项），每项同 `plan` | 是 | 批量写 1–10 集 |
| `read` | `from?`, `to?` | 否 | 读区间，默认全部 |
| `remove` | `number` | 是 | 删除该集大纲；已写剧本时拒绝 |

字段：

`stage`(1–3), `goal`, `conflict`, `emotion`(五值), `size`(`大|小`),
`infoGap`(四值), `hookType`(十一值), `hook`, `open30{background,dilemma,motive}`,
`mid{advance,relation,foreshadow}`, `close30`, `cast[]`, `locations[]`, `notes?`。

规则：

- `number` 必须在 `1..episodes`；跳号允许（先写后面的集），但返回 `blockers` 提示缺口。
- `cast` 中的人物必须已登记（未登记 → `ok:false`，`MISSING_CHARACTER`）。
- 写入文件：`分集大纲/第{段起}-{段止}集.md`；段内按集号排序。
- 返回值含 `data.written` 与 `data.gaps`（缺失集号列表）。

---

## 5. `scriptwriter_script` — 剧本

**描述**：写入/读取一集完整剧本；完整替换该集正文，不追加。
写入前先解析，致命格式错误拒绝写入。

| operation | 参数 | 必填 | 说明 |
|---|---|---|---|
| `write` | `episode`, `body`, `title?`, `status?` | 是 | 完整单集剧本；status 默认 `draft` |
| `read` | `episode` | 是 | 返回正文、契约、检查摘要 |

`body` 必须包含：`第N集` 行、三个集头标签、至少一个可解析场次。
写入流程：

1. 解析 `body` → `ScriptDoc`；`FMT-001..010` 中 severity=error 的任一条 →
   `ok:false`，返回 findings 与行号，**不写文件**。
2. 门禁：`episode ≤ 3` 需 `settings` 确认；`episode ≥ 4` 需 `opening` 确认。
3. 字数统计：对白 + 动作 + 字幕（不含标题/标签）计中文字符；估计秒数 =
   字数 / `charsPerSecond`。
4. 写入 `剧集/第{3位}集-{标题}.md`；frontmatter 写 `episode/title/status/seconds/words/hookType/updatedAt`。
5. 返回 `data`: `{ episode, file, words, seconds, hookType, hookScene, parseWarnings }`。
   `hookScene` 取最后一场场号，写入 frontmatter；机检用它验证「末场=钩子场」。

规则：

- 剧本中的 `hookType` 取集头【卡点】或最后一场；与大纲不一致时 `warnings`。
- `status=final` 需该集最近一次机检无 error；否则 `ok:false`（`GATE_FINAL`）。
- 不提供「局部编辑」operation（v0.1）；改写 = 重新 `write` 全文。

---

## 6. `scriptwriter_check` — 机检

**描述**：确定性规则检查。**不调用模型**。产出 findings 与报告文件。

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `scope` | `all\|episode\|range` | 否 | `all` | 检查范围 |
| `episode` | int | scope=episode 时 | — | 单集 |
| `from`,`to` | int | scope=range 时 | — | 区间 |
| `dimensions` | string[] | 否 | 全部 | `format,structure,duration,dialogue,cost,compliance,continuity` |

返回 `data`：

```ts
{
  counts: { error: number; warn: number; info: number }
  findings: Finding[]
  reportPath: string
  rulesVersion: string
  byDimension: Record<string, number>
}
```

规则：

- 排序稳定；同 code+location 去重。
- 报告写 `.duanju/reports/check-<ts>-<scope>.md`；`scope=all` 时同时覆盖
  `审查报告.md`。
- 单集 < 200ms；不访问网络；不读 `~/.dsh`。
- 检查器不得修改内容文件。

---

## 7. `scriptwriter_review` — 模型评审

**描述**：按 rubric 评审开篇/钩子/情绪/台词/可拍性/全剧；只判断，不改正文。

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `kind` | `opening\|hook\|emotion\|dialogue\|shootability\|full` | 是 | — | 评审类型 |
| `episodes` | int[] | 否 | opening=[1,2,3]；full=全部已写 | 集号 |
| `provider` | string | 否 | 配置/会话默认 | 覆盖路由 |
| `model` | string | 否 | 配置/会话默认 | 覆盖路由 |
| `maxTokens` | int | 否 | 配置（默认 4096） | 输出预算 |

返回 `data`：

```ts
{
  kind: string
  rubricVersion: string      // 例如 opening@1
  provider: string
  model: string
  routeSource: 'config'|'default'|'call'
  verdict: 'pass'|'revise'|'fail'
  findings: Array<{ severity:'error'|'warn'|'info'; episode?: number; quote: string; issue: string; fix: string }>
  reportPath: string
}
```

规则：

- 无模型路由 → `ok:false`（`NO_MODEL`），不伪造结果。
- 评审报告记录 `rubricVersion/provider/model/at`；不写 finding code。
- **不得修改** `故事大纲.md`、`人物设定.md`、`分集大纲/`、`剧集/` 的任何字节。
- `verdict` 是意见，不是门禁；门禁只看作者确认与机检 error。
- `opening` 至少覆盖第 1 集；`full` 至少覆盖 3 集，否则 `ok:false`。

---

## 8. `scriptwriter_confirm` — 作者确认

**描述**：记录作者对某一层的批准。必须同时有摘要与作者原话。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `kind` | `settings\|opening\|episode\|delivery` | 是 | 确认层 |
| `summary` | string | 是 | 被批准的版本摘要 |
| `userWords` | string | 是 | 用户原话（不可由模型代写概括） |
| `episodes` | int[] | 否 | opening 默认 [1,2,3]；episode 必填 |

返回 `data`：`{ confirmation: Confirmation, stage: string, next: string[] }`。

前置（不满足 → `ok:false`）：

| kind | 前置 |
|---|---|
| `settings` | 一句话四槽位齐全、核心三项齐全、≥1 主角、三阶段覆盖全剧 |
| `opening` | 第 1–3 集剧本均已写入；无 opening 确认时才能确认 |
| `episode` | 该集剧本已写入；`episodes` 长度为 1 |
| `delivery` | 故事/人物/大纲存在；前 3 集剧本存在；至少一次 `scope=all` 机检 |

规则：

- 同一 `kind` 重复确认允许，但会追加新记录；`warnings:["已有同层确认，已追加"]`。
- `opening` 确认时若没有对应的 opening 评审记录，允许确认但返回
  `warnings:["未找到开篇评审记录；建议先跑 scriptwriter_review kind=opening"]`。
- 确认是门禁的唯一来源；模型不得调用 `confirm` 代替用户表态。
  工具描述必须写明「只在用户明确认可后调用」。
- `userWords` 为空或与 `summary` 完全相同 → 拒绝（防止模型自说自话）。

---

## 9. `scriptwriter_status` — 状态

**描述**：只读。返回阶段、下一步、blockers、覆盖、成本估算、伏笔、确认状态。

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `detail` | `dashboard\|bible\|plan\|episode\|craft` | 否 | `dashboard` | 视图 |
| `episode` | int | detail=episode 时 | — | 单集 |
| `topic` | string | detail=craft 时 | — | 技法主题 |

`dashboard` 返回：

```ts
{
  stage: string
  next: string[]
  blockers: Blocker[]
  progress: { planned: number; outlined: number; written: number; final: number }
  length: { avgWords: number; minWords: number; maxWords: number; avgSeconds: number }
  checks: { lastAt?: string; error: number; warn: number; info: number }
  promises: { open: number; overdue: number }
  cost: { uniqueLocations: number; uniqueCast: number; highCostTags: string[] }
  confirmations: Record<string, string | null>
}
```

`craft` 主题：`format|opening|hook|rhythm|emotion|dialogue|pitch|compliance|budget|submission|dissect`。
未知主题 → `ok:false` 并列出可用主题。`craft` 不写文件。

---

## 10. `scriptwriter_export` — 导出

**描述**：生成投稿包/全剧本/大纲/报告；只写生成文件，不回写内容。

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `kind` | `submission\|scripts\|outline\|report\|all` | 是 | — | 导出类型 |
| `path` | string | 否 | 按类型默认 | 相对工作区根；不得越界 |

| kind | 默认文件 | 内容 |
|---|---|---|
| `submission` | `投稿包.md` | 9 项必备（剧名/题材/受众/体量、一句话、卖点、人物、三阶段、分集大纲、前 3 集、检查摘要、待确认） |
| `scripts` | `全剧剧本.md` | 按集拼接，保留集头与场次 |
| `outline` | `分集大纲.md` | 全剧大纲合集 + 阶段摘要 |
| `report` | `审查报告.md` | 最近一次全量机检摘要 |
| `all` | 以上四个 | 一次全导 |

规则：

- `submission` 需 `delivery` 确认；无确认 → `ok:false`（`GATE_DELIVERY`）。
- 导出前不自动改内容；发现缺集/缺人物只 `warnings`。
- 返回 `data.files`（相对路径）与 `data.bytes`；重复导出内容稳定（时间戳除外）。
- 导出件带 `<!-- generated by duanju; do not edit -->` 头，避免被当源文件手改。

---

## 11. `scriptwriter_dissect` — 竞品拆解

**描述**：把对标剧/爆款拆成结构化笔记，存 `竞品拆解.md`。不联网、不抓取。

| operation | 参数 | 必填 | 说明 |
|---|---|---|---|
| `upsert` | `title`, `platform?`, `episodes?`, `logline`, `opening`, `stages[]?`, `hooks[]?`, `emotions[]?`, `reusable[]?`, `notes?` | title/logline/opening 必填 | 新增或更新一部 |
| `list` | — | — | 返回条目摘要 |
| `read` | `title` | 是 | 读一部 |
| `remove` | `title` | 是 | 删除一部 |

`stages[]` 建议三项：`{range, task, emotion}`；`hooks[]` 是字符串，建议带类型；
`reusable[]` 是「可以怎么用到本项目」的具体点，不接受「学习了节奏」这类空话
（长度 ≥10 字，否则 `warn`）。

---

## 12. 工具描述（模型可见文案，中文）

| 工具 | 描述 |
|---|---|
| `scriptwriter_init` | 创建/读取短剧项目，设置平台、题材、受众、集数与单集秒数。已有项目默认不覆盖。 |
| `scriptwriter_story` | 写故事层：一句话四槽位、核心欲望/情绪/结局、差异化、三阶段、伏笔台账。 |
| `scriptwriter_cast` | 维护人物小传：欲望、痛点、性格、说话方式、弧光、成本档、进出场、关系。 |
| `scriptwriter_outline` | 写分集大纲：每集目标、冲突、情绪点、信息差、钩子、前30秒/中段/末30秒。 |
| `scriptwriter_script` | 写入一集完整剧本（课程格式，整集替换）。格式错误会拒绝并给行号。 |
| `scriptwriter_check` | 确定性机检：格式/结构/时长/台词/成本/合规提醒/连续性。不调用模型。 |
| `scriptwriter_review` | 模型评审：开篇/钩子/情绪/台词/可拍性/全剧。只判断，不改正文。 |
| `scriptwriter_confirm` | 记录作者确认（立项/前三集/单集/交付）。只在用户明确认可后调用。 |
| `scriptwriter_status` | 查看阶段、下一步、进度、成本、伏笔、确认状态或技法表。只读。 |
| `scriptwriter_export` | 导出投稿包、全剧本、分集大纲或审查报告。 |
| `scriptwriter_dissect` | 结构化拆解对标剧：一句话、开场、阶段任务、钩子、情绪点、可复用点。 |

---

## 13. 门禁与拒绝码总表

| code | 触发 | 处理 |
|---|---|---|
| `GATE_SETTINGS` | 未确认立项就写第 1–3 集 | 拒绝；指向 `scriptwriter_confirm kind=settings` |
| `GATE_OPENING` | 未确认前三集就写第 4 集+ | 拒绝；指向 opening 评审 + 确认 |
| `GATE_FINAL` | 单集无「无 error」的机检就标 final | 拒绝；指向 `scriptwriter_check scope=episode` |
| `GATE_DELIVERY` | 未确认交付就导出投稿包 | 拒绝；指向 `scriptwriter_check scope=all` + 确认 |
| `MISSING_CHARACTER` | 引用未登记人物 | 拒绝写入；列出缺失名 |
| `MISSING_PLAN` | 写剧本但无本集大纲 | 警告，允许草稿；final 前必须补 |
| `PARSE_FATAL` | 剧本致命格式错误 | 拒绝写入；给行号与修法 |
| `CONFLICT` | 同名/重复/越界 | 拒绝；说明冲突项 |
| `NO_MODEL` | 评审无可用路由 | 拒绝；说明配置项 |
| `NOT_FOUND` | 目标集/人物/文件不存在 | 拒绝；列出可选项 |

---

## 14. 示例：一次门禁拒绝

```json
{
  "ok": false,
  "tool": "scriptwriter_script",
  "operation": "write",
  "stage": "opening",
  "project": { "title": "重生后我成了首富的掌心娇", "root": "/work/x", "plannedEpisodes": 80 },
  "summary": "第4集需要先确认前三集，本次未写入。",
  "blockers": [
    {
      "code": "GATE_OPENING",
      "message": "第 1–3 集已写，但作者尚未确认开篇方向。",
      "unblock": [
        "scriptwriter_review kind=opening episodes=[1,2,3]",
        "把评审与三集正文交给用户，得到明确认可后：scriptwriter_confirm kind=opening summary=... userWords=..."
      ]
    }
  ],
  "next": ["scriptwriter_status detail=dashboard"]
}
```

---

## 15. 兼容与版本

- 工具名与 operation 名是公开接口：0.1.0 后只增不改；弃用先标 `deprecated` 一个版本。
- 参数新增必须可选；必填项不得后加（只能新增 operation）。
- `rulesVersion` 与 `rubricVersion` 独立于插件版本，报告里必须记录。
- 结果里的 `stage` 枚举固定；新增阶段需改 spec + data-model。
