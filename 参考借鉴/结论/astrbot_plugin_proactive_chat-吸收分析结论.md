# `astrbot_plugin_proactive_chat` 吸收分析结论

基于 `D:\airi-source\airi\docs\ai\context\reference-intake-method.md` 的固定方法，对以下材料进行了交叉分析：

- `D:\参考项目\astrbot_plugin_proactive_chat\README.md`
- `D:\参考项目\astrbot_plugin_proactive_chat\main.py`
- `D:\参考项目\astrbot_plugin_proactive_chat\core\web_admin_server.py`
- `D:\参考项目\astrbot_plugin_proactive_chat\admin\js\views\StatusView.jsx`
- `D:\参考项目\astrbot_plugin_proactive_chat\admin\js\views\TasksView.jsx`
- `D:\参考项目\astrbot_plugin_proactive_chat\CHANGELOG.md`

## 1. 它实际解决的是什么问题

这个项目表面上是“主动聊天插件”，但从核心代码结构看，它真正解决的是两类问题：

1. 主动消息调度问题：
   按会话维护 timer、随机调度、群沉默触发、自动触发、取消、恢复与 `unanswered_count`。
2. 主动机制运维可见性问题：
   把“为什么还没触发”“哪个会话正在倒计时”“什么时候会再触发”“能否 reschedule / cancel”做成了一个 operator-facing 管理面板。

对 AIRI 来说，真正有参考价值的是第二类，也就是 proactive governance 的可观测性，而不是“让模型更频繁地主动说话”。

## 2. 它的核心机制是什么

这个项目的 README 与核心代码基本一致，核心机制主要是：

1. 正式任务与临时等待分离：
   APScheduler 负责正式 job，`asyncio` timer 负责 `auto_trigger` 与 `group_idle_trigger`。
2. 会话事件驱动重置：
   私聊收到消息后取消旧任务、重排下一轮并清零 `unanswered_count`；
   群聊收到消息后取消已计划任务并重置群沉默 timer。
3. 主流程触发前有最小治理判断：
   `check_and_chat()` 先检查是否启用、是否处于 `quiet_hours`、是否达到 `max_unanswered_times`，再进入生成链路。
4. Web 管理端把运行态对象可视化：
   `status` 侧重点是 timer cards；
   `tasks` 侧重点是已排队 jobs；
   前端再把 `remaining_seconds`、`target_time`、`progress_percent`、`unanswered_count` 渲染成状态面板。

特别关注项的实际落点如下：

- `timer`：明确存在，且是状态面的第一类对象。
- `reschedule`：明确存在，且有单任务重新调度接口与按钮。
- `cancel`：明确存在，且支持取消已排队任务。
- `idle trigger`：明确存在，群聊沉默倒计时是核心机制之一。
- `unanswered_count`：明确存在，既用于上限治理，也用于 prompt 动态变量。
- `状态面板`：明确存在，而且是本项目最值得 AIRI 借鉴的部分。
- `suppressed reason`：只有运行时阻断分支和日志级 reason，没有形成完整的持久化 suppression ledger。

## 3. 哪一层 AIRI 能直接获得价值

最直接的价值集中在三层：

1. `proactive-companion`
   适合借它的 `timer`、`reschedule`、`cancel`、`unanswered_count` 这些治理控制变量，把主动行为做成可管理状态机。
2. `dashboard`
   适合借它的状态面板组织方式，把“倒计时”“下一次资格窗口”“当前是否被重置”“当前是否有人为触发中”做成直观页面。
3. `coordination explainability`
   适合借它的“最近事件 + 当前状态”表达方式，帮助 AIRI 更清楚地解释“为什么这次没主动”“为什么被延后”“下一次什么时候再评估”。

其中，最值得补强 AIRI 的不是聊天生成本身，而是主动治理可观测性。

## 4. 哪些部分值得借，以及最小吸收方式

### 值得借

1. `timer` 可视化
   适合转化为 AIRI 的 `next eligible proactive window`、`cooldown window`、`idle observation window`。
2. `reschedule` / `cancel` 操作语义
   价值不在按钮，而在系统承认“主动行为是可运维对象”。
3. `idle trigger` 作为资格信号
   可借“长期无新活动是候选条件”这一治理思路，但不能直接等价成“应该主动发话”。
4. `unanswered_count` 作为克制预算
   适合从“情绪变量”改造成 AIRI 的 restraint / bother budget。
5. 状态面板组织方式
   适合吸收“服务状态 + 调度概览 + timer cards + 最近重置提示”这套信息架构。
6. 最近被重置的提示
   很适合 AIRI coordination explainability，用来说明“刚检测到用户活跃，主动机会已后移”。

### 最小吸收方式

不迁 runtime，不迁整套 WebUI，而是做：

- `store contract`
- `snapshot payload`
- `dashboard supplement`
- `coordination explanation block`

也就是先补 AIRI 内部主动治理状态契约与用户可见解释层。

## 5. 哪些部分不能借

以下内容不应被直接吸收：

1. 不能借“模拟用户消息唤醒模型”的默认主动聊天架构。
2. 不能借“时间一到就优先发话”的 scheduler-first 主驱动模式。
3. 不能把 `unanswered_count` 吸收成情绪递增或关系索取主轴。
4. 不能整包复制其插件式 Web 管理端架构。
5. 不能误判它已经具备成熟的 `suppressed reason` 系统。

这里必须特别说明：

这个项目虽然有 `quiet_hours`、`session_disabled`、`session_config_missing`、`max_unanswered_times` 等阻断原因，也有初始化自动触发阶段的 skip reasons 汇总，但这些 reason 主要停留在：

- 运行时判断
- 日志输出
- 某些接口返回值

它并没有形成 AIRI 真正需要的那种：

- per-session suppression history
- 可持久化的最近 suppress ledger
- 用户可见的“本次为何不主动”状态主对象

所以 AIRI 不能“照搬它的 suppressed reason 设计”，而应该把它当成一个明显缺口来超越。

## 6. 是否应该进入下一阶段路线

应该进入下一阶段，但只能进入“主动治理可观测性补强”这一阶段，不能进入“高频主动聊天架构扩张”阶段。

建议进入的下一阶段目标是：

1. 为 AIRI 建一个最小 proactive governance ledger，至少记录：
   `next_eligible_at`、`last_reschedule_at`、`last_cancel_at`、`last_idle_trigger_at`、`unanswered_count`、`last_suppressed_reason`、`last_suppressed_at`
2. 在 dashboard 上增加主动治理状态面板。
3. 在 coordination 中增加 explainability block，清楚表达：
   “为什么没主动”
   “为什么延后”
   “什么时候会再次评估”
   “当前属于 cooldown / quiet hours / user active / unanswered limit / manual cancel 的哪一种”

不建议进入的下一阶段是：

- 多会话高频主动聊天 runtime 扩张
- 把 AIRI 推向默认频繁主动开聊的 companion 架构

---

## 最终决策字段

- `结论`
  值得吸收，但只吸收“主动治理可观测性与解释面”，不吸收其高频主动聊天架构。

- `优先级`
  `中价值偏产品启发`

- `吸收目标`
  `proactive-companion` 的治理状态机、`dashboard` 的状态面板、`coordination explainability` 的抑制与延后原因表达。

- `最小落地方式`
  `store + snapshot + dashboard supplement + coordination explanation`

- `禁止扩散项`
  不整包迁入 AIRI。
  不引入 simulated user-message wakeup 作为默认主动模型。
  不把 idle timer 直接等价成“该去聊天了”。
  不把 `unanswered_count` 做成关系施压或高频撒娇机制。
  不为了模仿该项目而重做 AIRI 的路由、IPC、消息存储。

- `验收方式`
  在 AIRI 自己的 dashboard / proactive / coordination 页面上，用户无需翻日志即可直接看到：
  `当前是否可主动`
  `下一次可评估时间`
  `最近一次 reschedule / cancel / idle reset`
  `当前 unanswered_count`
  `最近一次 suppressed reason`

---

## 一句话收束

这个参考项目最适合补强 AIRI 的，是“主动治理可观测性”；最不该带进 AIRI 的，是“基于定时与沉默窗口的高频主动聊天默认架构”。
