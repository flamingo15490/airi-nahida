# `astrbot_plugin_screen_companion` 吸收分析结论

基于 `D:\airi-source\airi\docs\ai\context\reference-intake-method.md` 的固定方法，对以下材料进行了交叉分析：

- `D:\参考项目\astrbot_plugin_screen_companion\README.md`
- `D:\参考项目\astrbot_plugin_screen_companion\main.py`
- `D:\参考项目\astrbot_plugin_screen_companion\web_server.py`
- `D:\参考项目\astrbot_plugin_screen_companion\scripts\docker_screenshot_bridge.py`
- `D:\参考项目\astrbot_plugin_screen_companion\CHANGELOG.md`
- `D:\参考项目\astrbot_plugin_screen_companion\core\runtime.py`
- `D:\参考项目\astrbot_plugin_screen_companion\core\proactive.py`
- `D:\参考项目\astrbot_plugin_screen_companion\core\input_stats.py`
- `D:\参考项目\astrbot_plugin_screen_companion\core\memory.py`

## 1. 它实际解决的是什么问题

这个项目表面上是“识屏陪伴插件”，但从核心代码结构看，它真正解决的并不是“让 bot 能看屏幕”这么窄的问题，而是把屏幕、活动、在场感和主动互动组织成一个可判断的上下文层。

更准确地说，它解决的是四类问题：

1. 当前屏幕理解问题：
   不是只拿一张截图做转述，而是把“当前正在看什么、当前任务是什么、这张画面能不能回答用户此轮问题”当成一个单独判断对象。
2. 近期电脑使用轨迹问题：
   不只看当前帧，而是补一层“最近在做什么、持续多久、主要在哪些应用/站点/页面活动”的轨迹旁证。
3. 主动陪伴克制问题：
   不把视觉能力直接变成高频打扰，而是加入同窗口冷却、离开挂起、敏感界面沉默、输入在场感等节制条件。
4. 屏幕观察沉淀问题：
   把观察、活动、输入统计、记忆和日记整理成可回看材料，而不是让识屏结果停留在一次性对话里。

对 AIRI 来说，真正高价值的不是“会识屏”，而是“如何把 screen / usage / presence 组织成结构化上下文，并让主动与记忆只消费经过节制的结果”。

## 2. 它的核心机制是什么

README 描述与核心代码基本一致，但真正值得 AIRI 借的机制，主要落在以下几处：

1. `screen_peek` 与 `screen_usage_context` 分层
   在 `main.py` 中，插件明确注册了两个不同的 LLM 工具：
   - `screen_peek`：按需确认当前屏幕内容
   - `screen_usage_context`：按需整理最近使用轨迹

   这不是命名细节，而是一个很重要的结构判断：当前屏幕和近期使用情况不是同一种上下文，不应混成一个“万能识屏”接口。

2. `screen_usage_context` 不是原始日志，而是结构化摘要
   对照 `main.py` 与 `core/memory.py`，它实际会拼装：
   - 当前活动快照
   - 最近活动轨迹
   - 最近时间分布
   - 最近常用应用
   - 可选浏览轨迹
   - 可选本地输入统计

   并且代码里明确写了“优先级始终是当前屏幕 > 最近对话 > 使用轨迹旁证”“不要让回复变成监控报告”。这点很关键，说明它最成熟的部分其实是 restraint，而不是采集本身。

3. 屏幕意图优先判断
   从 `CHANGELOG.md` 2.9.8 开始，它明确把识屏决策改成“意图优先”：
   先提炼用户这轮想确认什么，再判断当前画面是否真的覆盖该目标，最后决定直接回答、澄清还是请求切屏。

   这是本项目对 AIRI 最值得借的单点能力之一。

4. 活动轨迹不是窗口标题流水，而是场景化归纳
   `core/memory.py` 里有大量应用、站点、场景归类规则，最终目标不是“记下所有窗口”，而是整理出：
   - 应用层活动
   - 站点层活动
   - 页面层活动
   - 场景分布
   - 工作段/浏览段轨迹

   这说明它真正重视的是结构化 usage context，而不是单纯留痕。

5. 输入统计的价值在 presence，而不是计数
   `core/input_stats.py` 里最有价值的不是键鼠计数本身，而是把最近输入状态归纳成：
   - `active`
   - `idle`
   - `away`

   并配套活跃分钟、最近输入时间、峰值时段、输入在场感说明。这个层非常适合转化成 AIRI 的 proactive suppression / eligibility context。

6. 主动治理是低打扰导向
   `core/proactive.py` 里可以看到：
   - 同窗口冷却
   - 离开自动挂起
   - 回来自动恢复
   - 窗口陪伴重连宽限
   - 非适合场景不主动追击

   所以它虽然看起来像“会主动看屏幕说话”，但核心方法论其实是“有了 screen context 以后，也不要轻易说”。

7. WebUI 的价值主要是 observability
   `web_server.py` 把运行状态、观察、活动、媒体预览、记忆、配置和外部分析接口做成了可见面板。
   对 AIRI 来说，值得借的是“结构化状态可解释”，不值得借的是整套独立插件式 WebUI 运行时。

## 3. 哪一层 AIRI 能直接获得价值

这个项目对 AIRI 的直接价值主要集中在三个层次。

### 第一层：`vision / screen usage contextualization`

这是最直接的收益点。

AIRI 当前已有 `vision runtime` 与 `vision` 健康状态，但从现有共享契约看，仍更偏 capture/runtime 视角，例如：

- `apps/stage-tamagotchi/src/shared/vision-runtime.ts`

它更像在描述：

- 是否在运行
- 最近一次截图时间
- 最近一次识别文本
- 最近一次处理错误

而这个参考项目提供的是另一层：

- 当前屏幕是否覆盖用户此轮问题
- 当前窗口在做什么
- 最近几小时主要在忙什么
- 当前是否真的还在电脑前

这正是 AIRI 目前缺少的“结构化屏幕上下文层”。

### 第二层：`proactive-companion`

AIRI 当前 proactive 契约已经有：

- `vision` 作为 signal source
- `visionEnabled`
- `visionCooldownMs`
- `workingNudge`
- `recentDecisions`

见：

- `packages/stage-ui/src/stores/proactive-companion-shared.ts`

这个参考项目能直接补的是：

- 什么时候因为 `idle / away / same-window / low-confidence / sensitive-context` 而不该主动
- 什么时候 screen context 只适合作为静默内部更新
- 什么时候 usage context 只能作为低权重旁证，不能直接触发主动发言

也就是说，它对 AIRI proactive 的最大价值不是“新增一个 signal”，而是“给 vision signal 加 restraint grammar”。

### 第三层：`external-memory / coordination`

AIRI 的外部记忆和 coordination 边界已经很明确：

- `D:\AIRI-Memory` 仍是 source-of-truth
- coordination 负责解释 memory / persona / proactive 如何对齐

见：

- `docs/ai/context/reference-intake-method.md`
- `docs/ai/context/external-memory-layering-contract.md`
- `packages/stage-ui/src/stores/companion-coordination-shared.ts`

这个参考项目能给这里的价值是：

- screen-derived notes 可以先进入 `candidate / recent-context / follow-up`
- coordination 可以解释“最近视觉上下文为何被采用或压制”
- 记忆层可以更清楚地区分“当前屏幕观察”与“稳定用户事实”

它不适合成为 AIRI 的长期记忆主结构，但适合成为 external-memory judgement 的上游候选来源。

## 4. 哪些部分值得借，以及最小吸收方式

### 值得借

1. `screen_peek` / `screen_usage_context` 分层
   这是最值得直接吸收的结构思想。AIRI 应把“当前屏幕观察”和“近期使用轨迹摘要”定义成两个不同 contract，而不是一个大而混的 vision helper。

2. 屏幕意图优先判断
   这个项目最值得借的单点方法论就是：
   “先判断用户要确认什么，再判断当前画面够不够回答。”

3. 活动轨迹摘要
   值得借的是“应用 / 站点 / 页面 / 场景 / 持续时间 / 活跃段”的摘要能力，不是全量明细流水。

4. 输入在场感
   值得借的是：
   - `active / idle / away`
   - 活跃分钟
   - 最近输入时间
   - 当前在场感说明

   这些字段非常适合变成 AIRI 的结构化 presence snapshot。

5. 视觉上下文的低优先级旁证治理
   这个项目里最成熟的一句内部原则是：
   “当前屏幕 > 最近对话 > 使用轨迹旁证。”

   这个优先级规则非常适合直接进入 AIRI。

6. 对 proactive 的抑制条件
   适合借到 AIRI proactive 的是：
   - same-window cooldown
   - away auto pause
   - low-confidence no-speak
   - sensitive-context no-speak

7. Docker screenshot bridge 的边界意识
   `scripts/docker_screenshot_bridge.py` 体现的是“截图采集者”和“上下文消费者”分离。这种 producer/consumer 边界对 AIRI 是正向的。

### 最小吸收方式

不迁整套插件 runtime，不迁 WebUI，不迁记忆系统，只做以下最小吸收：

- `contract`
- `runtime snapshot`
- `store`
- `coordination supplement`
- `external-memory candidate supplement`

更具体地说，适合进入 AIRI 的最小对象是：

1. `screen_peek` contract
   返回当前屏幕摘要、窗口摘要、意图命中判断、不确定原因。
2. `screen_usage_context` contract
   返回近期活动摘要、场景分布、应用摘要、可选 presence 旁证。
3. `presence snapshot`
   返回 `active / idle / away`、活跃分钟、最近输入时间、是否适合打断。
4. `activity trajectory snapshot`
   只返回压缩后的高价值轨迹，不返回高频原始采样流水。
5. `screen-derived note candidate`
   只作为 external-memory judgement 的候选输入，不直接进入稳定记忆。

## 5. 哪些部分不能借

以下内容不应被直接吸收，而且要明确防扩散：

1. 不能整包迁入 AIRI
   这个项目虽然做了模块拆分，但本质仍是一个“大状态屏幕伴侣插件”，把识屏、录屏、输入监听、主动、记忆、日记、WebUI 全绑在一起。AIRI 不该吞下这种运行时形态。

2. 不能把 AIRI 变成高频屏幕监控器
   这次必须明确：
   AIRI 不应默认持续抓屏、持续采样窗口、持续保留页面标题、持续监听输入并长期沉淀细粒度行为日志。

3. 不能借它的长期记忆和日记系统作为 AIRI 主干
   AIRI 的外部记忆 source-of-truth 仍应是 `D:\AIRI-Memory`。屏幕观察最多只能变成 candidate / recent-context / follow-up，不能平移成新的内建记忆中心。

4. 不能把 usage context 当成默认 prompt 噪声
   这个项目自己都在避免“监控报告式回复”。AIRI 更不能把最近使用轨迹每轮都塞进 prompt。

5. 不能把输入统计默认常开
   `core/input_stats.py` 的 presence 逻辑值得借，但全局键鼠监听本身是高敏能力，不能默认开启，更不能作为 AIRI companion 的常规底层假设。

6. 不能把 WebUI clone 进 AIRI
   `web_server.py` 的价值是 observability 思路，不是独立再造一层 AIRI 插件式 WebUI。

7. 不能把 screen signal 直接升级成主动提醒或稳定记忆
   AIRI 如果照抄，会很容易从“companion”滑向“surveillance-driven companion”。这条边界必须卡住。

这里特别对应你的额外要求，明确区分两类能力：

### 适合变成 AIRI 的结构化屏幕上下文

- 当前屏幕摘要
- 当前窗口 / 当前任务判断
- 近期活动轨迹摘要
- 场景分布摘要
- 应用 / 站点摘要
- 输入在场感
- 当前 screen context 的可信度与适用范围
- screen-derived candidate note

### 会让 AIRI 变成高频监控器的能力

- 默认定时抓屏
- 默认持续窗口采样
- 默认全局键鼠监听
- 默认保留页面标题级活动历史
- 默认读取浏览历史
- 默认把 screen/usage data 作为高频主动触发器
- 默认把 screen 观察直接写入长期记忆

## 6. 是否应该进入下一阶段路线

应该进入下一阶段，但只能进入“结构化屏幕上下文吸收”这一阶段，不能进入“屏幕伴侣整系统扩张”阶段。

建议进入的下一阶段目标是：

1. 为 AIRI 增加 `screen_peek` 与 `screen_usage_context` 两个独立 contract。
2. 为 AIRI 增加 `presence snapshot` 与 `activity trajectory summary`。
3. 为 AIRI vision runtime 增加“当前 screen context 是否命中用户意图”的解释层。
4. 为 AIRI proactive 增加基于 `presence / same-window / low-confidence / sensitive-context` 的 suppress / defer 依据。
5. 为 AIRI external-memory judgement 增加 `screen-derived candidate` 输入，但只允许进入 `recent-context` / `follow-up` 之类的轻层。
6. 为 AIRI coordination 增加 screen/vision explainability block，说明最近一次视觉上下文是否被采用、为何采用、为何压制。

不建议进入的下一阶段是：

- 整包复刻这个插件的 runtime
- 把 AIRI 变成默认持续监控的桌面 agent
- 把输入统计、浏览轨迹、窗口轨迹做成默认长期保留主路径
- 把屏幕日记和内建长期记忆做成新的 AIRI 核心层

这次更适合定义为：

- 属于下一阶段路线
- 但只是 `child-task-sized absorption`
- 以 `contract / runtime snapshot / store / supplement` 为主
- 不是架构换轨

---

## 最终决策字段

- `结论`
  值得吸收，而且是当前 AIRI 在 `vision / screen usage / proactive restraint` 上最直接可用的高价值参考；但只能吸收“结构化屏幕上下文与治理方法”，不能吸收整套插件 runtime。

- `优先级`
  `高价值可吸收`

- `吸收目标`
  `vision / screen usage contextualization`，并次级改善 `proactive-companion` 的抑制治理和 `external-memory` 的 screen-derived candidate 质量。

- `最小落地方式`
  `contract + runtime snapshot + store + coordination supplement + external-memory candidate supplement`

- `禁止扩散项`
  不整包迁入 AIRI。
  不把 AIRI 变成默认高频屏幕监控器。
  不默认开启持续抓屏、持续窗口采样、持续输入监听、浏览历史读取。
  不引入独立屏幕日记系统作为 AIRI 核心能力。
  不让 screen runtime 直接写回 `D:\AIRI-Memory`。
  不为了模仿该项目而重做 AIRI 的 IPC、路由或现有 memory / proactive / coordination ownership。

- `验收方式`
  在 AIRI 自己的 `vision / proactive / coordination / external-memory` surfaces 上，用户无需读日志即可看到：
  `当前屏幕摘要`
  `是否命中用户这轮意图`
  `最近活动轨迹摘要`
  `当前在场感 active / idle / away`
  `最近一次为何被 suppress / defer`
  `最近一次 screen-derived context 是否进入 candidate review`

---

## 一句话收束

这个参考项目最适合补强 AIRI 的，是“把 screen 变成结构化上下文，而不是把 AIRI 变成会高频盯屏的监控伴侣”。
