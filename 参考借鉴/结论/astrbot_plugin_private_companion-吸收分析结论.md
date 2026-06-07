# `astrbot_plugin_private_companion` 吸收分析结论

基于 `D:\airi-source\airi\docs\ai\context\reference-intake-method.md` 的固定方法，对以下材料进行了交叉分析：

- `D:\参考项目\astrbot_plugin_private_companion\README.md`
- `D:\参考项目\astrbot_plugin_private_companion\main.py`
- `D:\参考项目\astrbot_plugin_private_companion\planning.py`
- `D:\参考项目\astrbot_plugin_private_companion\dreaming.py`
- `D:\参考项目\astrbot_plugin_private_companion\constants.py`
- `D:\参考项目\astrbot_plugin_private_companion\CHANGELOG.md`

## 1. 它实际解决的是什么问题

这个项目表面上是“私聊陪伴插件”，但从核心代码结构看，它真正解决的不是单一主动私聊问题，而是“如何让 Bot 具备持续存在感”的长期编排问题。

它解决的是下面几类问题：

1. 生活状态持续化问题：
   把 `daily_state`、梦境、日记、日程、状态余波、日程偏移等内容做成长期状态底座，而不是每次回复时临时现编。
2. 主动行为治理问题：
   主动不是定时就发，而是经过候选生成、候选记录、关系退让、时段适配、额度与重复性检查后才进入发送。
3. 被动回复连续性问题：
   用户来消息时，不只按当前文本回复，而是注入关系站位、未完话头、记忆、当前状态和回复姿态。
4. 对外界信息的“自我相关性”判断问题：
   新闻、搜索、外部见闻不会直接变成分享，而是先判断“这件事和 Bot 自己有没有关系、会不会产生分享欲”。
5. 群聊与私聊边界问题：
   群聊观察、关系识别、身份锚定和私聊连续性被明确区分，而不是混成一个通用记忆池。

对 AIRI 来说，它真正有价值的不是“功能很多”，而是它把 companion 的长期判断拆成了多个层次，而不是把人格表达、主动行为、状态模拟和关系推进揉成一锅。

## 2. 它的核心机制是什么

这个项目的 README 与核心代码基本一致，核心机制主要是：

1. 生活状态层独立存在：
   `DEFAULT_HUMANIZED_STATE`、`daily_state`、`dream_fragments`、`schedule_adjustments` 等都是独立存储对象，而不是 prompt 临时字段。
2. 日程与细化分两层：
   `planning.py` 先产生日程，再对当前段做细化增强，并额外输出 `state_variables` 与 `proactive_events`，说明它不是把“计划”只当文本装饰。
3. 主动消息先进入候选池，再进入最终发送判定：
   `proactive_candidate_pool`、`planned_proactive_*`、`next_proactive_at`、`_offer_proactive_candidate()`、`_should_send()` 形成了完整的候选到落地链路。
4. 被动回复增强有单独的内部规划层：
   `_format_companion_planner_injection()` 明确把“关系站位、用户记忆、气氛判断、回复前内部规划”作为默认人格之上的内部决策层。
5. 关系连续性是显式状态，不只是感觉：
   `relationship_score`、`relationship_state`、`awaiting_reply_since`、`open_loops`、`dialogue_episode` 等字段表明它在持久追踪“关系现在在靠近、退后还是待承接”。
6. 外界事件要先过“自我相关性判断”：
   `_build_external_event_wish()` 会先产出 `relevance / desire / should_share / share_probability / self_link / motive / boundary`，再决定是否进入主动分享。

特别关注项的实际落点如下：

- `生活状态层`：明确存在，而且不是单 prompt 文案。
- `主动决策层`：明确存在，而且有候选池、阻断分支和可解释原因。
- `被动回复增强层`：明确存在，而且是独立注入层。
- `关系连续性`：明确存在，而且有最小状态机意味。
- `自我相关性判断`：明确存在，而且是外部见闻转主动分享前的关键闸门。

这意味着它不是只有产品包装强，核心代码里确实有 AIRI 可以借的方法论结构。

## 3. 哪一层 AIRI 能直接获得价值

最直接的价值集中在四层：

1. `companion orchestration`
   适合借它的分层方式，把 companion 拆成 `life state -> continuity -> decision -> expression support`，而不是让人格层或主动层单独背全部逻辑。
2. `nahida-persona`
   适合借它“人格不替代默认系统判断，而是消费内部决策结论”的边界意识。对 AIRI 来说，Nahida 应继续作为表达层，而不是主动决策总控层。
3. `proactive-companion`
   适合借它的候选池、关系回退、自我相关性闸门、重复抑制和时段约束，让主动行为更像经过判断的“机会”，而不是简单定时触发。
4. `coordination`
   适合借它的“查看主动判定”思路，把为什么说、为什么不说、为什么延后、现在和谁有关，做成 coordination explainability。

其中，对 AIRI 价值最高的不是状态模拟本身，而是 companion judgement 的可分层、可克制、可解释。

## 4. 哪些部分值得借，以及最小吸收方式

### 值得借

1. `生活状态层` 与 `主动决策层` 的明确分离
   价值不在于睡眠、饥饿、梦境这些具体字段，而在于 AIRI 应该有独立的 `life_state snapshot`，供主动与回复层消费。
2. `被动回复增强层`
   特别适合吸收“回复前内部规划”这个轻量层：先判断关系站位、回复姿态、是否承接未完话头，再交给 persona 层表达。
3. `关系连续性最小账本`
   值得借 `awaiting_reply_since`、`open_loops`、`relationship_state.backoff`、`recent proactive topic signature` 这些最小连续性对象。
4. `自我相关性判断`
   这是本项目最值得 AIRI 轻量吸收的点。外界事件、屏幕上下文、检索结果、内部创作或记忆召回，不应直接变成主动表达，而应先判断“和我自己有没有关系”。
5. `主动候选池`
   值得借“先记候选，再做最终落地”的结构。这能让 AIRI 的 proactive 不只是即时拍脑袋，也便于 coordination 展示来源、动机与抑制原因。
6. `主动抑制可解释化`
   值得借它对 `未到候选时间 / 用户刚活跃 / 发送间隔不足 / 关系回退 / 主题重复 / 动作不可用` 这些阻断原因的显式表达。

### 哪些只是产品灵感

以下内容更适合作为产品灵感，不适合作为 AIRI 当前阶段的轻量吸收项：

1. 梦境、日记、书柜、技能成长
2. 世界观适配的表现层包装
3. QQ 空间、B 站、语音、图片、戳一戳等外部动作生态
4. 群聊关系网、自登记、QQ 身份锚定体系
5. 全量页面化管理面板

这些能启发 AIRI 的 companion 产品方向，但它们不是这次吸收中“最小且高价值”的部分。

### 最小吸收方式

不迁运行时，不迁插件架构，不迁整套陪伴系统，而是做：

- `contract`
- `runtime judgement`
- `coordination snapshot`
- `proactive snapshot`

也就是先补 AIRI 内部 companion judgement 的状态契约、主动前闸门和解释层，而不是复制它的大一统产品。

## 5. 哪些部分不能借

以下内容不应被直接吸收：

1. 不能整包借它的 all-in-one companion runtime。
2. 不能把 AIRI 推向“重拟人生活模拟器”路线。
3. 不能把大量外部动作能力注册体系带进 AIRI 当前主线。
4. 不能把群聊观察、身份图谱、关系网系统作为这一轮吸收重点。
5. 不能让 `nahida-persona` 吞掉 orchestration、关系治理和主动决策职责。
6. 不能因为它状态字段很多，就把 AIRI 的核心价值误导成“更多设定字段”。

这里必须特别说明：

这个项目最有价值的是 companion judgement structure，不是它的全量产品壳。AIRI 如果照着复制，很容易偏向：

- 大型单体 companion runtime
- 高耦合状态系统
- 设定膨胀
- 外部动作扩张

这些都和 AIRI 当前路线不匹配。

## 6. 是否应该进入下一阶段路线

应该进入下一阶段，但只能进入“窄吸收 companion judgement 结构”这一阶段，不能进入“大一统陪伴系统扩建”阶段。

建议进入的下一阶段目标是：

1. 为 AIRI 建立最小四层 companion contract，至少区分：
   `life_state`
   `continuity_state`
   `decision_state`
   `reply_enhancement`
2. 为 `proactive-companion` 增加统一的 `self relevance` 主动前闸门。
3. 为 AIRI 增加最小关系连续性账本，至少记录：
   `open_loops`
   `awaiting_reply`
   `backoff`
   `recent proactive topic signature`
4. 在 `coordination` 中增加 explainability block，清楚表达：
   “这次为什么想说”
   “为什么没说”
   “为什么延后”
   “这件事和 AIRI 自己有什么关系”

不建议进入的下一阶段是：

- 重建一整套生活模拟、梦境、日记、创作和外部动作生态
- 把 AIRI 做成 all-in-one companion monolith
- 让 persona 层承接全部 orchestration 责任

---

## 最终决策字段

- `结论`
  值得选择性吸收，重点吸收 companion orchestration 的层次结构、自我相关性判断、关系连续性最小账本和主动抑制可解释化；不吸收其 all-in-one companion runtime。

- `优先级`
  `中价值偏产品启发`

- `吸收目标`
  `companion orchestration` 的分层 contract、`proactive-companion` 的自我相关性闸门与候选治理、`coordination` 的 explainability，以及仅作为消费层的 `nahida-persona`。

- `最小落地方式`
  `contract + runtime judgement + proactive snapshot + coordination snapshot`

- `禁止扩散项`
  不整包迁入 AIRI。
  不引入大型单体 companion runtime。
  不把梦境、日记、书柜、技能成长、QQ 关系网、群聊图谱、外部动作系统作为本轮实现目标。
  不重做 memory source-of-truth。
  不让 `nahida-persona` 接管 orchestration 与主动治理。

- `验收方式`
  在 AIRI 自己的 `coordination / proactive` 页面或快照中，用户无需翻日志即可直接看到：
  `当前 life state 摘要`
  `当前 continuity hook`
  `本次主动候选来源与动机`
  `最近一次被抑制的原因`
  `外界事件为何与 AIRI 自己有关或无关`

---

## 一句话收束

这个参考项目最适合补强 AIRI 的，是“陪伴判断结构与主动前自我相关性闸门”；最不该带进 AIRI 的，是“把生活状态、关系网、外部动作和页面系统揉成一个 all-in-one companion runtime”。
