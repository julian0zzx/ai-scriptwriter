# 001 · 数据模型与文件格式

- 状态：Draft，随 `spec.md` 一起待批
- 适用范围：`project.json`、项目 Markdown 方言、解析/渲染规则、finding/报告结构
- 原则：**人能读、能手改；机器只依赖明确的小节、YAML 块与表格；文件是权威。**

---

## 1. 工作区文件树

一个工作区 = 一个短剧项目（v0.1）。

```
<workspace>/
├── .duanju/
│   ├── project.json                    # 设置 + 确认记录 + 索引（唯一 JSON）
│   └── reports/
│       ├── check-20261028-212000-all.md
│       └── review-20261028-213000-opening.md
├── 故事大纲.md                          # 一句话 / 核心 / 差异化 / 对标 / 阶段 / 伏笔
├── 人物设定.md                          # 一个人物一个 ## 节 + ```yaml
├── 分集大纲/
│   ├── 第001-010集.md                   # 每 10 集一个文件
│   ├── 第011-020集.md
│   └── …
├── 剧集/
│   ├── 第001集-撞破.md                  # 一集一个剧本文件
│   ├── 第002集-遗嘱.md
│   └── …
├── 竞品拆解.md                          # 一部对标剧一个 ## 节
├── 审查报告.md                          # 最近一次全量机检的汇总（生成，可覆盖）
└── 投稿包.md                            # 导出件（生成，可覆盖）
```

规则：

- 顶层四个中文文件名**固定**，不随剧名变化；`.duanju/` 是隐藏元数据目录。
- 分集大纲按 10 集一段；段号从 1 开始对齐（1–10、11–20…），文件名为
  `第{起}–{止}集.md`（三位补零，中文破折号 `–` 或 `-` 均可，工具统一写 `-`）。
- 剧本文件：`第{集号3位}集-{净化标题}.md`；标题为空时 `第{集号3位}集.md`。
  标题净化：去掉 `/ \ : * ? " < > |`、控制字符、首尾空白与点号，截断 20 字。
- 集号从 1 连续编号；`project.json` 的 `episodes` 是计划体量，不是已写集数。
- 生成文件（`审查报告.md`、`投稿包.md`）可被覆盖；内容文件（故事/人物/大纲/剧本）
  只能由对应工具或人手改，导出不得回写。

---

## 2. `.duanju/project.json`

只存**设置与记录**，不存派生统计（集数、字数、进度都由文件推导）。

```json
{
  "schemaVersion": 1,
  "pluginVersion": "0.1.0",
  "title": "重生后我成了首富的掌心娇",
  "platform": "红果",
  "genre": ["重生", "复仇", "甜宠"],
  "audience": "女频",
  "episodes": 80,
  "secondsPerEpisode": 90,
  "wordWindow": { "min": 500, "max": 800 },
  "charsPerSecond": 5.5,
  "budgetTier": "low",
  "createdAt": "2026-10-28T13:20:00.000Z",
  "updatedAt": "2026-10-28T13:40:00.000Z",
  "confirmations": [
    {
      "kind": "settings",
      "at": "2026-10-28T13:50:00.000Z",
      "summary": "立项：女频重生复仇，80 集 × 90 秒，低预算都市；一句话、人物、三阶段已定。",
      "userWords": "可以，就按这个方向写。",
      "episodes": []
    }
  ],
  "reports": {
    "lastCheck": ".duanju/reports/check-20261028-212000-all.md",
    "lastReview": ".duanju/reports/review-20261028-213000-opening.md"
  }
}
```

字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `schemaVersion` | int | 是 | 当前 1；未来升级用于迁移 |
| `pluginVersion` | string | 是 | 写入时的插件版本，便于诊断 |
| `title` | string | 是 | 剧名；导出与提示使用 |
| `platform` | string | 是 | 自由文本：红果/抖音/快手/其他 |
| `genre` | string[] | 是 | 题材标签，≥1 |
| `audience` | string | 是 | 男频/女频/通用 + 可选人群描述 |
| `episodes` | int | 是 | 计划集数（默认 80，可 10–150） |
| `secondsPerEpisode` | int | 是 | 单集目标秒数（默认 90，可 60–180） |
| `wordWindow` | {min,max} | 是 | 默认 500–800；来自课程 03，可改 |
| `charsPerSecond` | number | 是 | 默认 5.5；用于「字数 → 估计秒数」 |
| `budgetTier` | `low\|medium\|high` | 是 | 低/中/高成本档，影响 CST 阈值 |
| `confirmations` | Confirmation[] | 是 | 作者确认记录；只增不改 |
| `reports` | object | 否 | 最近报告路径，仅索引 |

`confirmations[].kind`：`settings | opening | episode | delivery`。
`episode` 类带 `episodes: [12]`；`opening` 类带 `episodes: [1,2,3]`。
同一 `kind` 可有多条（例如逐集确认）。

**不写入** `project.json` 的内容：集数进度、字数、人物列表、大纲、finding。
这些全部从 Markdown 推导，避免双份真相。

---

## 3. Markdown 方言

所有内容文件使用同一套小语法，解析器只依赖四样东西：

1. YAML frontmatter（`---` 包裹）；
2. `##` / `###` 小节；
3. ```yaml 围栏块；
4. Markdown 表格。

不做自由文本推断（不从散文里猜字段）。人类改文件时，只要保持小节名与 YAML 键名即可。

### 3.1 `故事大纲.md`

````markdown
---
updatedAt: 2026-10-28T13:40:00.000Z
---

# 故事大纲

## 一句话

```yaml
sentence: 被继母赶出家门的林家真千金，要在三个月内拿回母亲的公司；继母已买通董事会并握有伪造遗嘱——她唯一的底牌，是能听见死者遗物上的声音。
protagonist: 林晚，被赶出家门的林家真千金
goal: 三个月内拿回母亲留下的公司
obstacle: 继母买通董事会，并握有伪造遗嘱
edge: 能听见死者遗物上的声音
```

## 核心

```yaml
desire: 让母亲的名字重新挂回公司门口
emotion: 被夺走一切的人，把名字一件件拿回来
ending: 林晚在股东大会上播放母亲生前录音，继母当众承认伪造遗嘱；林晚没有接手公司，而是把它捐给母亲创办的基金。
```

## 差异化

- 不是「霸总救我」，是女主用「遗物读心」自己破局；男主是她的对手兼证人。
- 复仇对象不是脸谱化继母，而是「体面的家族」本身。

## 对标

- 《XX》：同为重生复仇，看它的 1-1 如何用一场葬礼交代三方关系。
- 《YY》：女频逆袭，参考它的「三集一个小高潮」排布。

## 阶段

```yaml
- index: 1
  from: 1
  to: 10
  task: 黄金窗口：立主线、亮核心看点
  goal: 让观众知道「她要拿回公司」，并看到第一次反击
  miniGoal: 在葬礼上拿回母亲的遗物
  infoGap: 配角和观众知道，主角不知道
- index: 2
  from: 11
  to: 30
  task: 稳固发展：主线实质推进，可开副线
  goal: 拿到伪造遗嘱的原始文件
  miniGoal: 进入董事会，成为继母无法忽视的变量
  infoGap: 主角和观众知道，配角不知道
- index: 3
  from: 31
  to: 80
  task: 高潮收束：伏笔揭晓、多轮反转
  goal: 在股东大会上完成翻盘
  miniGoal: 让继母自己承认伪造
  infoGap: 观众知道，主角和配角不知道
```

## 伏笔

| id | 埋设 | 到期 | 回收 | 状态 |
|---|---|---|---|---|
| p-001 | 第1集 | 第10集 | 遗物里的录音笔 | 未回收 |
| p-002 | 第3集 | 第35集 | 指纹鉴定报告 | 已回收 |
````

字段：

- `## 一句话` 的 YAML 必须含四槽位：`protagonist/goal/obstacle/edge`；
  `sentence` 可选，缺失时由四槽位拼一句供显示。
- `## 核心` 的 `desire/emotion/ending` 三项必填。
- `## 差异化` 是列表，≥1 项。
- `## 对标` 是列表，可为空。
- `## 阶段` 是 YAML 列表，必须覆盖 `1..episodes` 且不重叠；`index` 从 1 连续。
- `## 伏笔` 是表格；由 `scriptwriter_story operation=promise` 维护，也可手改。
  表格列名固定；`状态` ∈ `未回收|已回收|已放弃`。

### 3.2 `人物设定.md`

````markdown
# 人物设定

## 林晚

```yaml
role: 主角
camp: 主角阵营
desire: 拿回母亲的公司，让母亲的名字重新被提起
painPoint: 被继母以「克母」之名赶出家门，十年没有姓林
personality: 外表温顺、内里狠绝；被逼到墙角时先笑，再动手
voice: 短句；习惯用反问；从不解释自己
arc: 从「求一个认可」到「自己定规则」
costTier: 主要
firstEpisode: 1
exitEpisode: null
relations:
  - target: 周明远
    kind: 旧识/互相利用
    note: 他是唯一知道遗嘱被换过的人
```

（可选的补充散文：外貌、习惯、记忆点。）

## 继母

```yaml
role: 反派
camp: 反派阵营
desire: 保住董事长的位置和林家的体面
painPoint: 一辈子被叫「续弦」
personality: 体面、克制、杀人不见血；越愤怒越温柔
voice: 敬语多、句子长；从不当众失态
arc: 从「掌控一切」到「被自己的体面反噬」
costTier: 主要
firstEpisode: 1
exitEpisode: null
relations:
  - target: 林晚
    kind: 宿敌
```
````

字段：

| 键 | 必填 | 取值 |
|---|---|---|
| `role` | 是 | `主角\|反派\|核心伙伴\|功能角色` |
| `camp` | 是 | `主角阵营\|反派阵营\|中立` |
| `desire` | 是 | 一句话，具体 |
| `painPoint` | 是 | 一句话，具体 |
| `personality` | 是 | 底色 + 压力下的反应 |
| `voice` | 是 | 句长、口头禅、称呼、情绪外化方式 |
| `arc` | 是 | 从什么状态到什么状态 |
| `costTier` | 是 | `主要\|配角\|客串` |
| `firstEpisode` | 是 | int |
| `exitEpisode` | 否 | int 或 null |
| `relations` | 否 | `[{target, kind, note?}]`，`target` 是人物名 |

人物名即 id（短剧人物少，重名由工具拒绝）。`target` 必须在人物表里存在。

### 3.3 `分集大纲/第001-010集.md`

````markdown
---
range: [1, 10]
updatedAt: 2026-10-28T14:10:00.000Z
---

# 分集大纲 第1–10集

## 第1集 撞破

```yaml
stage: 1
goal: 在葬礼上拿回母亲的遗物，第一次当众反击继母
conflict: 继母反咬她伪造遗嘱，保安要把她赶出去
emotion: 反转打脸
size: 大
infoGap: 配角和观众知道，主角不知道
hookType: 台词钩/身份暗示
hook: 周明远看着她，忽然说：「你姓林，对吗？」
open30:
  background: 林家葬礼，宾客满堂
  dilemma: 遗物被继母扣下，她被指为外人
  motive: 拿回母亲留下的录音笔
mid:
  advance: 她拿出第二份遗嘱
  relation: 周明远第一次替她说话
  foreshadow: 遗嘱上的指纹不是母亲的
close30: 周明远叫出她的本名
cast: [林晚, 继母, 周明远]
locations: [林家灵堂]
notes: 1-1 直接进冲突，不要先交代十年经历
```
````

字段：

| 键 | 必填 | 说明 |
|---|---|---|
| `stage` | 是 | 1/2/3，对应故事大纲的阶段 |
| `goal` | 是 | 本集目标（具体、可验证） |
| `conflict` | 是 | 本集冲突 |
| `emotion` | 是 | `逆袭成功\|反转打脸\|意外收获\|CP甜宠\|其他` |
| `size` | 是 | `大\|小` |
| `infoGap` | 是 | 四种信息差之一 |
| `hookType` | 是 | 见 §3.4 枚举 |
| `hook` | 是 | 钩子文本/画面描述 |
| `open30` | 是 | `{background, dilemma, motive}` 三项 |
| `mid` | 是 | `{advance, relation, foreshadow}` 三项 |
| `close30` | 是 | 末 30 秒的动作/台词 |
| `cast` | 是 | 本集出场人物名 |
| `locations` | 是 | 本集场景名 |
| `notes` | 否 | 写作提醒 |

### 3.4 枚举（中文显示值，允许别名）

```ts
// core/enums.ts
export const HOOK_TYPES = [
  '台词钩/未说完的质问',
  '台词钩/身份暗示',
  '台词钩/目标宣言',
  '画面钩/情感切掉',
  '画面钩/动作中断',
  '画面钩/意外身影',
  '画面钩/熟悉面孔',
  '突发危机',
  '关键人物登场',
  '怀疑未确认',
  '关键物件丢失',
] as const
```

别名（写入时归一化）：`身份钩` → `台词钩/身份暗示`；`台词钩-身份暗示` → 同上；
`画面钩-动作中断` → `画面钩/动作中断`。未识别的值报 `STR-009`。

信息差四值（顺序固定，便于统计）：

1. `主角知道，观众和配角不知道`
2. `配角和观众知道，主角不知道`
3. `观众知道，主角和配角不知道`
4. `主角和观众知道，配角不知道`

### 3.5 `剧集/第001集-撞破.md`

````markdown
---
episode: 1
title: 撞破
status: draft
seconds: 94
words: 640
hookType: 台词钩/身份暗示
hookScene: 1-2
updatedAt: 2026-10-28T14:30:00.000Z
---

# 第1集 撞破

【本集任务】在葬礼上拿回母亲的遗物，完成第一次当众反击。
【转折】继母反咬她伪造遗嘱，周明远却站了出来。
【卡点】周明远看着她：「你姓林，对吗？」

1-1 日 内 林家灵堂
人物：林晚 继母 周明远 宾客X6

△灵堂正中摆着母亲的遗像。林晚穿一身黑，站在宾客堆里，手里攥着一只旧录音笔的空盒。
△继母走过来，伸手把盒子从她手里抽走。

继母（轻声，带笑）：这不是你该拿的东西。
林晚（没松手）：这是我妈的。
继母：你妈的东西，现在姓林。

△宾客们安静下来。林晚环视一圈，忽然笑了。
林晚：那正好。我今天来，就是想把姓林的账，算清楚。

1-2 日 内 林家书房
人物：林晚 继母 周明远

△林晚把一份文件拍在桌上，纸角划过继母的手背。
继母（脸上的笑没变）：伪造遗嘱，你知道是什么罪吗？
林晚：知道。所以我把原件带来了。

△周明远从门口走进来，捡起文件，翻到最后一页。
周明远（看着落款）：这份遗嘱的见证人，是我父亲。
继母（第一次变脸）：明远，这里没你的事。

△周明远没理她。他看向林晚，目光停了两秒。
周明远：你姓林，对吗？
````

语法：

| 行型 | 规则 | 例子 |
|---|---|---|
| 集号 | `第N集`（可带标题）；必须与 frontmatter 一致 | `第1集 撞破` |
| 钩子场 | frontmatter `hookScene` 必须等于最后一场场号；写入时自动计算 | `hookScene: 1-2` |
| 集头标签 | `【本集任务】` `【转折】` `【卡点】` 各一行，任意顺序；课程样例首个标签写作`【女主…：…】`，插件统一为`【本集任务】`（语义等价，便于校验） | `【卡点】…` |
| 场头（紧凑） | `场号 日/夜 内/外 地点`，空白或全角空格分隔 | `1-1 日 内 林家灵堂` |
| 场头（四行式） | 依次 `夜/日`、`外/内`、`地点：…`、`场1-1`；为兼容课程模板 | 见 §6.2 |
| 人物行 | `人物：` 后列本场人物，空格分隔；群演 `宾客X6` | `人物：林晚 继母` |
| 动作行 | 以 `△` 开头；只写可拍的动作/画面 | `△门被推开。` |
| 对白 | `角色名[动作/神态]：台词`；`（）` 内是语气/动作提示 | `继母（轻声）：…` |
| OS | 角色名后（可带动词）紧接 `OS：` | `林晚OS：他为什么要帮我？` |
| VO | 行首 `VO` + 角色名 + `：` | `VO林晚：那年我十岁。` |
| 闪回 | `【闪回】` / `【闪出】`（也接受「插入闪回」「闪回结束」） | `△【闪回】…` |
| 字幕 | `（字幕：…）`，可在动作行内或单独一行 | `△（字幕：十年前）` |

解析容错：

- `日/夜` 允许 `日|夜|黄昏|清晨|傍晚`；`内/外` 允许 `内|外|内外`。
- 中英文冒号、全角/半角空格均可。
- 对白提示语两种写法都接受：`名字（提示）：台词` 与 `名字：（提示）台词`；
  两者都归一化为 `paren`，冒号后括号内的内容不得丢失。
- `名字 + 动作/神态 + ：台词`（课程样例「林雨欣惊恐的往后挣扎：…」）按已登记
  人物名做前缀匹配，剩余前缀存为 `speakerAction`，不强行当成人名。
- 角色名从已登记人物表做前缀匹配；匹配不到报 `CON-001`（warn）与
  `FMT-006`（若整行无法归属）。
- `hookScene` 是插件元数据，不写进正文；渲染剧本时不输出该行。
- 空行不产生节点；以 `#` 开头的标题行忽略。
- 未识别行报 `FMT-009`，带行号；**不静默丢弃**。

---

## 4. 解析/渲染模型

```ts
interface ScriptDoc {
  episode: number
  title: string
  status: 'draft' | 'reviewed' | 'final'
  meta: { seconds?: number; words?: number; hookType?: string; hookScene?: string; updatedAt?: string }
  header: { task: string; turn: string; hook: string }
  scenes: Scene[]
}

interface Scene {
  no: string            // '1-1'
  dayNight: '日' | '夜' | '黄昏' | '清晨' | '傍晚'
  intExt: '内' | '外' | '内外'
  location: string
  cast: string[]        // 含群演写法 '宾客X6'
  lines: Array<ActionLine | DialogueLine | SubtitleLine | FlashbackMark>
  startLine: number     // 原文行号，用于定位
}

interface DialogueLine {
  kind: 'dialogue'
  speaker: string       // 归一化后的人物名（匹配不到时为原文前缀）
  speakerRegistered: boolean
  paren?: string        // （）内的语气/动作（冒号前后都接受）
  speakerAction?: string // 名字与冒号之间的动作/神态原文
  mode: 'line' | 'os' | 'vo'
  text: string
  line: number
}

interface ActionLine { kind: 'action'; text: string; line: number }
interface SubtitleLine { kind: 'subtitle'; text: string; line: number }
interface FlashbackMark { kind: 'flashback'; phase: 'in' | 'out'; line: number }
```

渲染器输出**规范化**格式（统一半角空格、固定标签顺序），但保留作者原句。
往返要求：`parse(render(parse(src)))` 与原解析结果结构一致（忽略行号与空白差异）。

---

## 5. 报告与 finding

### 5.1 Finding

```ts
interface Finding {
  code: string          // 'FMT-003'
  severity: 'error' | 'warn' | 'info'
  ruleRef: string       // 'DR-13'（课程规则）或 'CFG-DLG-001'（插件默认阈值）
  scope: { kind: 'episode' | 'project' | 'range'; episode?: number }
  location?: { file: string; episode?: number; scene?: string; line?: number }
  message: string       // 人话：哪里不对
  evidence?: string     // 原文片段（≤80 字）
  suggestion?: string   // 怎么改
}
```

排序：severity（error > warn > info）→ episode → scene → line → code。
同一 `code + location` 去重；机检必须稳定可重复。

### 5.2 检查报告

````markdown
---
kind: check
scope: all
at: 2026-10-28T21:20:00.000Z
rulesVersion: 2026-10-28.1
counts: { error: 2, warn: 7, info: 3 }
---

# 审查报告

## 摘要

- 已写 12 集，计划 80 集；2 个 error、7 个 warn、3 个 info。
- error：第 7 集缺钩子场；第 9 集场号重复。
- 建议先修 error，再看成本与台词。

## 第7集

| 级别 | 代码 | 规则 | 位置 | 问题 | 建议 |
|---|---|---|---|---|---|
| error | STR-008 | DR-18 | 第7集 末场 | 集末没有钩子 | 把 1-3 的最后一句改成未完成的质问 |
````

### 5.3 评审报告

````markdown
---
kind: review
reviewKind: opening
scope: [1, 2, 3]
at: 2026-10-28T21:30:00.000Z
rubricVersion: opening@1
provider: deepseek-official
model: deepseek-chat
verdict: revise
---

# 开篇评审

## 总判断

revise：1-1 冲突够快，但「身份」交代依赖台词解释，建议用动作替代。

##  Findings

| 级别 | 位置 | 原文 | 问题 | 怎么改 |
|---|---|---|---|---|
| warn | 第1集 1-1 | 「我是林家的女儿」 | 用台词直说身份，冲击弱 | 改成继母当众否认她姓林，让她用遗物反击 |
````

评审**不写** finding code（不是机检），但保留 `severity/quote/issue/fix`。

### 5.4 汇总报告

`审查报告.md` 是最近一次 `scriptwriter_check scope=all` 的摘要副本（覆盖写），
固定四段：摘要 / 按集 / 成本 / 合规提醒。不含评审结论。

---

## 6. 解析边界与兼容

### 6.1 课程模板的两种场头

课程 01 给了四行式模板（`夜/日`、`外/内`、`地点：`、`场1-1`），
真实样例用了紧凑式（`1-1 日 内 九重天`）。插件以紧凑式为主格式，
但解析器必须接受四行式，并在渲染时统一为紧凑式（不丢内容）。

### 6.2 四行式示例

```
夜
内
地点：林家灵堂
场1-1
人物：林晚 继母
△…
```

解析状态机：连续看到 `日/夜` → `内/外` → `地点：` → `场N-M` 时合并为一个场头；
缺项报 `FMT-003`。

### 6.3 不允许的「聪明」

- 不从散文里提取人物/场景（除 `人物：` 行与对白前缀）。
- 不猜测 `OS` 与 `VO` 的语义差别（课程未解释）；只按标记统计。
- 不把 `△` 行当台词，不把对白行当动作。
- 不自动「修好」格式后写入；先报错，由作者/模型决定。

---

## 7. 报告命名与去重

- 时间戳：`YYYYMMDD-HHmmss`（本地时区，来自会话时钟）。
- `check-<ts>-<scope>.md`，`scope` 为 `all` / `ep001` / `ep001-012`。
- `review-<ts>-<kind>.md`。
- 同名已存在时追加 `-2`，不覆盖旧报告；`审查报告.md` 与 `投稿包.md` 例外（覆盖）。

---

## 8. 并发、写入顺序与失败

1. 读：`project.json` → 故事/人物/大纲/剧本 → 派生统计。文件缺失 = 空，不报错；
   语法错误 = 报错并停止该文件后续解析。
2. 写内容：先写目标 Markdown（临时文件 + 原子替换，若可用），成功后再更新
   `project.json.updatedAt`/`reports`。
3. 写报告：内容文件成功后再写报告；报告失败不回滚内容，但结果里明确
   「内容已写、报告未写」。
4. 批量（如 `outline batch`）：逐集写入，返回 `written[]` 与 `failed[]`；
   任一项失败不谎报整体成功。
5. 悲观并发：同一项目同一时刻只允许一个写操作（进程内串行队列）；
   跨进程不承诺锁（v0.1 不做 `withFileLock`，文档如实说明）。

---

## 9. 迁移

- `schemaVersion` 未来升级时，`host/store.ts` 负责把旧结构读成新结构，
  写回时保留未知字段（`...old`）。
- 遇到 `schemaVersion > 当前支持`：拒绝写入，提示升级插件；读取可只读展示。
- Markdown 结构升级（例如新增 `open30`）时，旧文件缺失字段 = 空，
  由机检报缺失，不自动编造。

---

## 10. 一个最小 fixture（测试用）

`test/fixtures/mini-project/` 应包含：

- `project.json`：3 集 × 90 秒，男频逆袭，low；
- `故事大纲.md`：四槽位、三阶段（1–1、2–2、3–3 因为只有 3 集）、2 条伏笔；
- `人物设定.md`：主角/反派/伙伴 3 人；
- `分集大纲/第001-003集.md`：3 条计划，含钩子与三段；
- `剧集/第001集-…md` … `第003集-…md`：可解析的完整剧本；
- 预期 finding 列表（`expected-findings.json`）：故意留 1 个 error、2 个 warn，
  证明检查器不是「全绿摆设」。

golden 断言：解析→渲染→再解析结构一致；机检结果与 expected 一致；
导出投稿包包含 9 项必备内容。
