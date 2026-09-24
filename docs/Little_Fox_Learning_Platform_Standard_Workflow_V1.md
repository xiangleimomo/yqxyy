# Little Fox Learning Platform 标准化工作流 V1.0

> 适用范围：Journey to the West、Romance of the Three Kingdoms，以及后续新增的 Little Fox 系列课程。  
> 核心目标：网站结构一次搭好，后续新增系列或更新集数时，只改数据文件，不反复改代码。

---

## 1. 项目定位

本项目不是单一的《Journey to the West》网站，而是一个多系列英语故事学习平台。

```text
Little Fox Learning Platform
├── Journey to the West
├── Romance of the Three Kingdoms
├── Robin Hood
├── Sherlock Holmes
└── 其他后续系列
```

平台核心学习流程为：

```text
首页选择系列
↓
进入系列页选择集数
↓
进入单集学习页
↓
Watch → Read → Words → Phrases → Grammar → Quiz → Review
```

---

## 2. 总体设计原则

### 2.1 首页只做“动画故事系列库”

首页参考 Little Fox 的“动画故事”逻辑，只展示故事系列，不在首页堆积复杂学习功能。

首页展示内容：

```text
所有动画故事
├── Journey to the West
├── Romance of the Three Kingdoms
├── Robin Hood Coming Soon
└── Sherlock Holmes Coming Soon
```

### 2.2 顶部保留个人学习功能入口

顶部右侧建议保留：

```text
学习记录｜签到｜书架｜单词表｜英文写作
```

含义如下：

| 功能 | 作用 |
|---|---|
| 学习记录 | 查看学过哪些系列、哪些集数、Quiz 成绩 |
| 签到 | 日历式学习打卡 |
| 书架 | 收集自己学过或正在学的故事系列 |
| 单词表 | 收集自己记录的单词和短语 |
| 英文写作 | 收集喜欢的英文句子，后期用于仿写 |

V1.0 阶段可以先保留入口，部分功能可以显示 Coming Soon。

### 2.3 系列页展示该系列所有集数

点击首页某个系列后，进入系列页。

例如：

```text
Romance of the Three Kingdoms
三国演义
Level 5｜连载中

Episode 1 Trouble in the Empire
Episode 2 Frightening Tales
Episode 3 Two Fierce Men
Episode 4 The Oath
Episode 5 Forming an Army
Episode 6 The First Battle
Episode 7 Coming Soon
Episode 8 Coming Soon
```

### 2.4 单集页固定七个学习模块

每一集都使用统一学习模块：

```text
Watch
Read
Words
Phrases
Grammar
Quiz
Review
```

模块含义：

| 模块 | 作用 |
|---|---|
| Watch | 看动画视频 |
| Read | 阅读故事原文 |
| Words | 学习官方单词表 |
| Phrases | 学习重点短语和固定搭配 |
| Grammar | 理解本集重点句型和语法 |
| Quiz | 做本集 5 道测验 |
| Review | 一分钟复习本集内容 |

---

## 3. 推荐网站目录结构

```text
littlefox-learning-platform/
│
├── index.html                 # 首页：系列库
├── series.html                # 系列页：某个系列的集数列表
├── lesson.html                # 单集学习页
│
├── css/
│   └── style.css
│
├── js/
│   ├── app.js                 # 公共逻辑
│   ├── home.js                # 首页逻辑
│   ├── series.js              # 系列页逻辑
│   └── lesson.js              # 单集页逻辑
│
├── data/
│   ├── series-list.json       # 全部系列总表
│   │
│   ├── journey-to-the-west/
│   │   ├── series.json
│   │   ├── episodes.json
│   │   ├── reading-lessons.json
│   │   ├── vocabulary.json
│   │   ├── phrases.json
│   │   ├── grammar.json
│   │   ├── quiz.json
│   │   └── review.json
│   │
│   └── three-kingdoms/
│       ├── series.json
│       ├── episodes.json
│       ├── reading-lessons.json
│       ├── vocabulary.json
│       ├── phrases.json
│       ├── grammar.json
│       ├── quiz.json
│       └── review.json
│
├── assets/
│   ├── covers/
│   ├── thumbnails/
│   └── icons/
│
└── README.md
```

---

## 4. 数据文件标准

### 4.1 `data/series-list.json`

作用：记录首页要展示的全部系列。

```json
[
  {
    "seriesId": "journey-to-the-west",
    "title": "Journey to the West",
    "titleZh": "西游记",
    "level": 5,
    "episodeCount": 108,
    "status": "completed",
    "cover": "assets/covers/journey-to-the-west.jpg",
    "description": "Learn English through the classic adventure story."
  },
  {
    "seriesId": "three-kingdoms",
    "title": "Romance of the Three Kingdoms",
    "titleZh": "三国演义",
    "level": 5,
    "episodeCount": 8,
    "status": "serializing",
    "cover": "assets/covers/three-kingdoms.jpg",
    "description": "A historical story about heroes, loyalty, and battles."
  }
]
```

新增系列时，只需要在这个文件里增加一条记录。

### 4.2 `series.json`

作用：记录单个系列的基本信息。

```json
{
  "seriesId": "three-kingdoms",
  "seriesTitle": "Romance of the Three Kingdoms",
  "seriesTitleZh": "三国演义",
  "level": 5,
  "language": "en",
  "source": "Little Fox",
  "status": "serializing",
  "totalEpisodes": 8,
  "description": "A Little Fox Level 5 story series based on Romance of the Three Kingdoms.",
  "coverImage": "assets/covers/three-kingdoms.jpg",
  "updateNote": "New episodes are released weekly."
}
```

`status` 建议值：

```text
completed     已完结
serializing   连载中
preparing     整理中
coming        即将上线
draft         草稿
```

### 4.3 `episodes.json`

作用：记录该系列每一集的标题、状态、发布时间、视频信息和模块开放状态。

```json
[
  {
    "episodeId": 1,
    "title": "Trouble in the Empire",
    "titleZh": "天下大乱",
    "releaseDate": "2026-08-12",
    "status": "published",
    "sourceType": "official",
    "video": {
      "source": "bilibili",
      "bvid": "BV1EGgE6VEmc",
      "page": 1,
      "url": "https://www.bilibili.com/video/BV1EGgE6VEmc?p=1",
      "embedUrl": "https://player.bilibili.com/player.html?bvid=BV1EGgE6VEmc&p=1&autoplay=0&danmaku=0"
    },
    "modules": {
      "watch": true,
      "read": true,
      "words": true,
      "phrases": true,
      "grammar": true,
      "quiz": true,
      "review": true
    }
  }
]
```

单集 `status` 建议值：

```text
published     已发布，可完整学习
preparing     已发布，但内容整理中
coming        官方已公布，即将发布
locked        暂未开放
missing       缺少关键资料
```

`sourceType` 建议值：

```text
official          官方材料完整
official-partial  官方材料部分完整
custom            根据视频或字幕自制
mixed             官方材料 + 自制增强内容
```

### 4.4 `reading-lessons.json`

作用：存放每集 Story / Reading 内容。

```json
{
  "1": {
    "episodeId": 1,
    "title": "Trouble in the Empire",
    "source": "official",
    "paragraphs": [
      {
        "id": "p1",
        "text": "Official English story paragraph here.",
        "translation": "对应中文翻译。",
        "audioStart": null,
        "audioEnd": null
      }
    ]
  }
}
```

处理原则：

1. 官方 PDF 有原文时，优先忠实转换；
2. 如果官方有中文翻译，可以一起录入；
3. 如果没有官方中文翻译，可由平台补充，但需标记来源；
4. 段落按网页阅读体验适当切分；
5. `audioStart` 和 `audioEnd` 为后期点读或音频同步预留。

### 4.5 `vocabulary.json`

作用：存放官方 Vocabulary。

```json
{
  "1": [
    {
      "id": "v1",
      "word": "empire",
      "partOfSpeech": "noun",
      "meaningZh": "帝国",
      "definitionEn": "a group of countries or areas ruled by one person or government",
      "example": "The empire was in trouble.",
      "exampleZh": "这个帝国陷入了麻烦。",
      "source": "official"
    }
  ]
}
```

处理原则：

1. 官方词表优先；
2. 保留官方单词顺序；
3. 保留官方例句；
4. 中文释义可使用官方释义或平台补充；
5. 不要把平台额外整理的短语混入 `vocabulary.json`，应放入 `phrases.json`。

### 4.6 `phrases.json`

作用：存放平台从故事中提炼的重点短语、固定搭配和表达。

```json
{
  "1": [
    {
      "id": "ph1",
      "phrase": "raise an army",
      "meaningZh": "组建军队",
      "explanationZh": "raise 在这里不是“举起”，而是“筹集、组织”的意思。",
      "example": "They wanted to raise an army.",
      "exampleZh": "他们想组建一支军队。",
      "tags": ["story", "action", "useful-expression"],
      "source": "custom"
    }
  ]
}
```

处理原则：

1. 每集建议 5–10 个短语；
2. 优先选择孩子能迁移使用的表达；
3. 解释简单，适合小学六年级；
4. 短语必须来自本集或与本集高度相关；
5. 不追求数量，追求实用。

### 4.7 `grammar.json`

作用：存放每集重点句型、语法或表达结构。

```json
{
  "1": [
    {
      "id": "g1",
      "title": "Past tense in stories",
      "titleZh": "故事中的一般过去时",
      "explanationZh": "英文故事通常用一般过去时来讲述已经发生的事情。",
      "examples": [
        {
          "sentence": "The emperor was afraid.",
          "translation": "皇帝很害怕。",
          "focus": "was 是 is 的过去式。"
        }
      ],
      "difficulty": "easy",
      "source": "custom"
    }
  ]
}
```

处理原则：

1. 每集建议 2–4 个语法点；
2. 面向小学六年级到初中低年级；
3. 以帮助理解故事为主，不做复杂语法课；
4. 例句尽量来自本集；
5. 讲解语言以中文为主，英文为辅。

### 4.8 `quiz.json`

作用：存放每集测验。

```json
{
  "1": {
    "episodeId": 1,
    "title": "Trouble in the Empire Quiz",
    "questions": [
      {
        "id": "q1",
        "type": "single-choice",
        "category": "story",
        "question": "Why was the empire in trouble?",
        "options": [
          { "key": "A", "text": "Because there was a rebellion." },
          { "key": "B", "text": "Because the weather was too cold." },
          { "key": "C", "text": "Because Liu Bei lost his horse." },
          { "key": "D", "text": "Because Guan Yu left the village." }
        ],
        "answer": "A",
        "explanation": "The story says the empire was in trouble because rebels were fighting against the government.",
        "source": "custom"
      }
    ]
  }
}
```

每集建议固定 5 题。

题目类型建议：

```text
story        剧情理解
character    人物理解
vocabulary   词汇理解
phrase        短语表达
grammar       语法理解
inference     简单推理
review        综合复习
```

处理原则：

1. 每题必须基于本集 Story 或 Vocabulary；
2. 不使用后续剧情作为答案依据；
3. 每题只有一个正确答案；
4. 选项简单清楚；
5. 解释尽量中英结合；
6. 难度模仿 Little Fox，但更适合中国孩子。

### 4.9 `review.json`

作用：存放每集“一分钟复习”。

```json
{
  "1": {
    "episodeId": 1,
    "title": "Trouble in the Empire",
    "summaryZh": "本集讲述了东汉末年天下动荡，百姓生活艰难，刘备开始卷入这场乱世。",
    "summaryEn": "The empire is in trouble, and Liu Bei begins to think about how he can help.",
    "characters": [
      {
        "name": "Liu Bei",
        "nameZh": "刘备",
        "noteZh": "一个善良、有责任感的人。",
        "noteEn": "A kind man who wants to help the people."
      }
    ],
    "keyWords": ["empire", "rebellion", "loyal"],
    "keyPhrases": ["raise an army"],
    "keySentences": [
      {
        "sentence": "The empire was in trouble.",
        "translation": "这个帝国陷入了麻烦。"
      }
    ],
    "source": "custom"
  }
}
```

处理原则：

1. 每集都要有中文复习总结；
2. 可以增加简单英文总结；
3. 人物介绍只限本集出现的信息；
4. 不剧透后续剧情；
5. 方便孩子学完后快速回顾。

---

## 5. V2.0 预留文件

V1.0 可以先不开发 AI Teacher，但数据结构可以预留。

### 5.1 `faq.json`

作用：为后期站内问答或 AI Teacher 降低成本。

```json
{
  "1": [
    {
      "id": "faq1",
      "question": "Who is Liu Bei?",
      "answerZh": "刘备是本集中的主要人物之一。他关心百姓，希望帮助国家。",
      "answerEn": "Liu Bei is one of the main characters in this episode. He cares about the people and wants to help the country.",
      "tags": ["character", "Liu Bei"],
      "source": "custom"
    }
  ]
}
```

### 5.2 `ai-context.json`

作用：为后期 AI English Teacher 提供每集上下文。

```json
{
  "1": {
    "episodeId": 1,
    "title": "Trouble in the Empire",
    "contextZh": "本集内容仅包括 Episode 1 已出现的故事内容。回答问题时不要剧透后续剧情。",
    "contextEn": "This lesson only covers the events in Episode 1. Do not mention later episodes or future plot points.",
    "allowedTopics": [
      "Episode 1 story",
      "Episode 1 vocabulary",
      "Episode 1 characters",
      "Episode 1 grammar"
    ],
    "blockedTopics": [
      "later episodes",
      "future deaths",
      "future battles",
      "historical spoilers"
    ],
    "source": "custom"
  }
}
```

---

## 6. 内容来源标记标准

每条内容都建议带 `source` 字段。

建议值：

```text
official      官方材料
custom        平台原创整理
bilibili      B站视频资源
generated     Course Builder 自动生成
manual        人工录入
mixed         多来源整理
```

来源边界：

| 内容 | 推荐来源 |
|---|---|
| Story / Reading | official 优先 |
| Vocabulary | official 优先 |
| Video | bilibili / local / public |
| Phrases | custom |
| Grammar | custom |
| Quiz | custom 或 official |
| Review | custom |
| FAQ | custom |
| AI Context | custom |

---

## 7. 新增系列标准流程

例如新增 `Robin Hood`。

### 第一步：建立系列文件夹

```text
data/robin-hood/
```

### 第二步：准备标准数据文件

```text
series.json
episodes.json
reading-lessons.json
vocabulary.json
phrases.json
grammar.json
quiz.json
review.json
```

### 第三步：在 `series-list.json` 增加记录

```json
{
  "seriesId": "robin-hood",
  "title": "Robin Hood",
  "titleZh": "罗宾汉",
  "level": 5,
  "episodeCount": 24,
  "status": "preparing",
  "cover": "assets/covers/robin-hood.jpg",
  "description": "A classic adventure story for English learners."
}
```

### 第四步：重新部署 Netlify

不需要改首页代码。首页应自动读取 `series-list.json` 并展示新系列。

---

## 8. 更新某一集标准流程

例如更新《Three Kingdoms》Episode 4。

### 需要准备

```text
系列：three-kingdoms
集数：Episode 4
标题：The Oath
视频：B站 p=4
材料：Story PDF / Vocabulary PDF / 字幕 / 视频内容
```

### 需要更新的文件

```text
data/three-kingdoms/episodes.json
data/three-kingdoms/reading-lessons.json
data/three-kingdoms/vocabulary.json
data/three-kingdoms/phrases.json
data/three-kingdoms/grammar.json
data/three-kingdoms/quiz.json
data/three-kingdoms/review.json
```

如果 Episode 4 完成，则在 `episodes.json` 中改为：

```json
"status": "published"
```

如果还在整理，则保持：

```json
"status": "preparing"
```

---

## 9. 推荐更新口令

以后需要继续处理时，可以直接使用下面这种口令。

### 新增一集

```text
按 Little Fox Learning Platform 标准化工作流 V1.0，
新增 Three Kingdoms Episode 4。
视频是 B站 BVxxxx p=4。
我上传了 Story 和 Vocabulary，请生成这一集完整 JSON 增量包。
```

### 新增一个系列

```text
按 Little Fox Learning Platform 标准化工作流 V1.0，
新增 Robin Hood 系列。
请生成 series.json、episodes.json 和第一批课程数据。
```

### 更新连载状态

```text
按 Little Fox Learning Platform 标准化工作流 V1.0，
把 Three Kingdoms Episode 6 从 coming 改成 preparing，
并更新 episodes.json。
```

### 输出完整数据包

```text
按 Little Fox Learning Platform 标准化工作流 V1.0，
把当前 Three Kingdoms 数据重新打包成可部署 ZIP。
```

---

## 10. 当前 Three Kingdoms 执行标准

### Episode 1–3

```text
Story：官方 PDF
Vocabulary：官方 PDF
Quiz：平台根据 Story + Vocabulary 制作
Phrases：平台整理
Grammar：平台整理
Review：平台整理
Video：B站合集 P1–P3
状态：published
```

### Episode 4–5

```text
Story：优先官方；没有则根据 B站视频字幕整理
Vocabulary：优先官方；没有则根据故事整理
Quiz：平台制作
Phrases：平台整理
Grammar：平台整理
Review：平台整理
Video：B站合集 P4–P5
状态：preparing 或 published
```

### Episode 6

```text
官方已发布时：preparing
资料齐全后：published
```

### Episode 7 以后

```text
官方已公布标题和日期：coming
尚未公布：locked
```

---

## 11. Codex 额度不足时的工作方式

Codex 主要用于：

```text
修改网站代码
调整页面布局
修复播放器
开发新功能
```

但课程内容制作不依赖 Codex。

Codex 没额度时，仍然可以继续：

```text
提取 Story
整理 Vocabulary
制作 Phrases
制作 Grammar
制作 Quiz
制作 Review
生成 JSON
打包 ZIP
```

也就是说：

```text
Codex = 改网站功能
ChatGPT = 生产标准课程数据
Netlify = 部署上线
```

---

## 12. Netlify 更新流程

每次拿到新的数据包后：

```text
1. 下载 ZIP
2. 解压
3. 找到 data/对应系列/
4. 替换或追加 JSON 文件
5. 本地预览
6. 确认无误
7. 上传或重新部署 Netlify
```

如果只更新 JSON，通常不需要改 HTML、CSS、JS。

---

## 13. V1.0 最小可用数据包

一个系列最少需要：

```text
series.json
episodes.json
reading-lessons.json
vocabulary.json
quiz.json
```

推荐完整数据包：

```text
series.json
episodes.json
reading-lessons.json
vocabulary.json
phrases.json
grammar.json
quiz.json
review.json
```

未来增强数据包：

```text
faq.json
ai-context.json
```

---

## 14. 命名规范

### 14.1 seriesId

使用小写英文和短横线：

```text
journey-to-the-west
three-kingdoms
robin-hood
sherlock-holmes
```

### 14.2 episodeId

使用数字：

```text
1
2
3
```

### 14.3 内容 ID

```text
p1, p2, p3        paragraph
v1, v2, v3        vocabulary
ph1, ph2          phrase
g1, g2            grammar
q1, q2            quiz
faq1, faq2        FAQ
```

---

## 15. 最终目标

本工作流的最终目标是：

```text
官方 Story / Vocabulary
+
视频资源
+
平台增强内容
+
统一 JSON
=
可持续更新的 Little Fox 学习平台
```

后续维护应做到：

```text
新增系列：只新增 data/seriesId/
更新一集：只更新该系列 JSON
上线网站：重新部署 Netlify
功能升级：再使用 Codex 或人工修改代码
```

V1.0 先把数据标准和网站结构稳定下来。  
AI English Teacher、自动 Course Builder、错题本、智能复习等功能放到 V2.0 以后逐步增加。
