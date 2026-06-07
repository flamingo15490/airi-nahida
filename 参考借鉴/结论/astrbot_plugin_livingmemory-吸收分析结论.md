# `astrbot_plugin_livingmemory` 吸收分析结论

基于 `D:\airi-source\airi\docs\ai\context\reference-intake-method.md` 的固定方法，对以下材料进行了交叉分析：

- `D:\参考项目\astrbot_plugin_livingmemory\README.md`
- `D:\参考项目\astrbot_plugin_livingmemory\README_zh.md`
- `D:\参考项目\astrbot_plugin_livingmemory\docs\ARCHITECTURE.md`
- `D:\参考项目\astrbot_plugin_livingmemory\core\retrieval\rrf_fusion.py`
- `D:\参考项目\astrbot_plugin_livingmemory\core\retrieval\vector_retriever.py`
- `D:\参考项目\astrbot_plugin_livingmemory\core\processors\memory_processor.py`
- `D:\参考项目\astrbot_plugin_livingmemory\core\retrieval\hybrid_retriever.py`
- `D:\参考项目\astrbot_plugin_livingmemory\core\retrieval\dual_route_retriever.py`
- `D:\参考项目\astrbot_plugin_livingmemory\core\managers\atom_lifecycle_manager.py`
- `D:\参考项目\astrbot_plugin_livingmemory\core\tools\memory_search_tool.py`
- `D:\参考项目\astrbot_plugin_livingmemory\core\tools\memory_memorize_tool.py`
- `D:\参考项目\astrbot_plugin_livingmemory\core\event_handler.py`
- `D:\参考项目\astrbot_plugin_livingmemory\main.py`
- `D:\参考项目\astrbot_plugin_livingmemory\CHANGELOG.md`

## 1. 它实际解决的是什么问题

这个项目表面上是“长期记忆插件”，但从核心代码结构看，它真正解决的不是单纯的“把聊天存起来”，而是：

1. 如何把对话压缩成可检索、可衰减、可解释的长期记忆候选。
2. 如何让记忆不是一次性落库，而是带生命周期、证据累加、主动 recall/memorize 控制和检索退化策略。
3. 如何在自动记忆、主动工具调用、不同注入策略之间维持行为一致性，避免 tool loop 和人格表达污染事实记忆。

对 AIRI 来说，它最有价值的不是“有个内建记忆库”，而是它在 external-memory judgement 上已经形成了一套比较完整的候选治理思路。

## 2. 它的核心机制是什么

这个项目的 README 与核心代码基本一致，关键机制确实落在实现里。

1. 双通道摘要：
   `canonical_summary` 用于事实检索，`persona_summary` 保留人格风格，且 `content` 默认存 `canonical_summary + key_facts`，不是直接存人格化总结。
2. 总结质量校验：
   通过 `summary_quality` 标记空摘要、缺 key facts、importance 越界、泛化词污染等低质量记忆。
3. 检索融合：
   文档路内部先做 BM25 + 向量检索，再用 RRF 融合，然后叠加 importance / recency 加权和 MMR 去重。
4. 双路检索：
   文档路与图路再做一次融合，并根据 query intent 动态调整 `document_route_weight` / `graph_route_weight`。
5. 候选生命周期：
   记忆原子支持 TTL、过期、遗忘、清除和 reinforcement，形成“不是所有记忆都永久存活”的生命周期模型。
6. 受控 recall / memorize：
   `recall_long_term_memory` 与 `memorize_long_term_memory` 是独立工具，并继承当前 session / persona 过滤策略，且可通过开关控制启用。
7. 注入治理：
   自动召回前会清理历史注入片段，tool loop 中间轮与工具总结轮会被显式跳过，避免把内部工具过程误存成长期记忆。

特别关注项的实际落点如下：

- `双通道摘要`：明确存在，且已进入标准存储格式。
- `候选生命周期`：明确存在，且不是单次清理，而是有 expire / forget / purge / reinforce。
- `证据累加`：明确存在，至少在 atom reinforcement 与 graph EMA 设计里成立。
- `受控 recall / memorize`：明确存在，且 recall / memorize 分离，不是单一自动机制。
- `检索融合`：明确存在，而且分成文档路融合与文档/图路二次融合两层。

## 3. 哪一层 AIRI 能直接获得价值

最直接的价值集中在三层：

1. `external-memory`
   适合借它的双通道摘要、候选状态、证据累加和轻量衰减语义，强化外部记忆记录的可信度与表达边界。
2. `judgement`
   适合借它的 `summary_quality`、`source_window`、importance / recency / route breakdown 这些判断字段，让 AIRI 更清楚地区分“稳定记忆”“暂定候选”“需要复核”“过期记忆”。
3. `coordination`
   适合借它的 recall / memorize 显式控制与解释方式，把“为什么调用记忆”“为什么不写入”“这条召回为何靠前”做成可见的 coordination 解释对象。

其中，最值得 AIRI 直接吸收的不是图谱或 FAISS，而是“把记忆判断变成可解释契约”的这层方法。

## 4. 哪些部分值得借，以及最小吸收方式

### 值得借

1. `dual summary contract`
   AIRI 很适合区分事实导向摘要与人格导向摘要，避免 Nahida 表达层反过来污染 memory truth。
2. `summary_quality`
   很适合进入 AIRI 的外部记忆记录与 coordination snapshot，标记低质量记忆候选。
3. `source_window`
   适合保留“这条记忆来自哪段会话窗口、由什么动作触发”，增强溯源能力。
4. `candidate lifecycle`
   适合吸收 tentative / stable / conflicted / stale 一类状态机，而不是只存“有或没有”。
5. `evidence accumulation`
   适合做轻量 ledger，例如 evidence_count、last_reinforced_at、last_accessed_at，而不必上完整原子存储。
6. `controlled recall / controlled memorize`
   适合做成 AIRI 的显式动作面与治理面，而不是隐式自动记忆黑箱。
7. `retrieval fusion semantics`
   值得借“多来源轻融合 + score_breakdown 可解释”这套排序语义，而不是借完整引擎。

### 最小吸收方式

不迁 memory engine，不迁数据库，不迁图路，不迁 FAISS，而是做：

- `schema contract`
- `judgement runtime policy`
- `coordination snapshot`
- `memory surface supplement`

也就是先把 AIRI 外部记忆条目的判断字段补齐，再把 recall / memorize 与候选状态变成用户可见解释层。

## 5. 哪些部分不能借

以下内容不应被直接吸收：

1. 不能整包迁入它的 SQLite + FTS + FAISS + graph + atom lifecycle 内建引擎。
2. 不能把 `D:\AIRI-Memory` 替换成 AIRI 自己维护的重型内建长期记忆系统。
3. 不能把图谱、原子库、重建、迁移、备份、回滚这些宿主插件工程能力误判为 AIRI 当前主线需求。
4. 不能把 fake tool call 注入方式当成 AIRI 的长期架构方向，它更像宿主协议兼容技巧。
5. 不能把“原子化每条 key fact + TTL 管理”直接扩散成 AIRI 默认基础设施，否则会把 AIRI 误导成重型 memory engine。

这里必须特别说明：

这个项目确实很强，但它的强项有两层：

- 一层是可借的方法论：
  双通道摘要、候选生命周期、证据累加、受控 recall/memorize、检索融合解释。
- 另一层是较重的宿主实现：
  内建存储、索引、图谱、原子、迁移、备份、WebUI。

AIRI 当前只该吸收第一层，不该把第二层带进来。

## 6. 是否应该进入下一阶段路线

应该进入下一阶段，但只能进入“external-memory judgement 深化 + coordination explainability 补强”这一阶段，不能进入“重建 AIRI 内建记忆引擎”阶段。

建议进入的下一阶段目标是：

1. 给 AIRI 外部记忆记录补充最小字段：
   `canonical_summary`、`persona_summary`、`summary_quality`、`source_window`、`candidate_state`、`evidence_count`、`last_reinforced_at`
2. 给 recall / memorize 增加显式控制语义：
   什么时候允许 recall、什么时候允许 memorize、为什么跳过。
3. 在 coordination 中增加记忆判断解释块：
   “为什么召回这条”
   “为什么写入这条”
   “它是稳定记忆还是暂存候选”
   “它的证据是否足够”
4. 在 memory surface 中增加候选状态与分数分解显示。

不建议进入的下一阶段是：

- 在 AIRI 内引入整套文档路 / 图路 / 原子路三层检索架构
- 把 AIRI 推向默认重型长期记忆引擎
- 为了模仿这个插件而重做现有 external-memory ownership boundary

---

## 最终决策字段

- `结论`
  值得吸收，但只吸收“external-memory judgement 方法”和“coordination 可解释性”，不吸收其完整内建记忆引擎实现。

- `优先级`
  `高价值可吸收`

- `吸收目标`
  `external-memory` 的双通道摘要与候选治理、`judgement` 的证据累加与生命周期表达、`coordination` 的 recall / memorize 可解释控制面。

- `最小落地方式`
  `contract + runtime policy + snapshot + memory surface supplement`

- `禁止扩散项`
  不整包迁入 AIRI。
  不替换 `D:\AIRI-Memory` 为 AIRI 内建重型 memory core。
  不引入 FAISS / BM25 / graph / atom store 作为当前阶段默认依赖。
  不把 fake tool call 注入方式升级成 AIRI 的长期架构边界。
  不把候选生命周期扩张成完整后台守护式记忆基础设施工程。

- `验收方式`
  在 AIRI 自己的 memory / coordination 页面上，用户无需翻日志即可直接看到：
  `事实摘要` 与 `人格摘要` 是否分离；
  `这条记忆是 tentative / stable / conflicted / stale 的哪一种`；
  `为什么它被召回`；
  `为什么它被写入或被拒绝写入`；
  `它当前的证据、时间、重要性或分数分解是否足以支持使用`。

---

## 一句话收束

这个参考项目最适合补强 AIRI 的，是“长期记忆候选如何被判断、强化、解释和受控调用”；最不该带进 AIRI 的，是“整套重型内建记忆引擎实现”。
