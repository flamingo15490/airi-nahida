# AIRI 下一阶段吸收计划总结

本文件用于对第一批四个参考项目的吸收结论做统一收口，形成 AIRI 下一阶段可执行的吸收顺序与边界说明。

依据：

- `D:\airi-source\airi\docs\ai\context\reference-intake-method.md`
- `D:\airi-source\airi\参考借鉴\结论\astrbot_plugin_livingmemory-吸收分析结论.md`
- `D:\airi-source\airi\参考借鉴\结论\astrbot_plugin_screen_companion-吸收分析结论.md`
- `D:\airi-source\airi\参考借鉴\结论\astrbot_plugin_private_companion-吸收分析结论.md`
- `D:\airi-source\airi\参考借鉴\结论\astrbot_plugin_proactive_chat-吸收分析结论.md`

## 1. 统一检查结论

四份子结论都遵守了固定 intake 方法要求的同一套输出骨架：

1. 它实际解决的是什么问题
2. 它的核心机制是什么
3. 哪一层 AIRI 能直接获得价值
4. 哪些部分值得借，以及最小吸收方式
5. 哪些部分不能借
6. 是否应该进入下一阶段路线

四份子结论也都包含了同一组最终决策字段：

- `结论`
- `优先级`
- `吸收目标`
- `最小落地方式`
- `禁止扩散项`
- `验收方式`

因此，这一批材料已经具备横向可比性，不需要重新细读四个项目本体即可进入统一收口阶段。

## 2. 统一口径修正

虽然四份材料整体一致，但仍需做以下统一：

1. `优先级` 只收口到 intake 方法定义的三档：
   - `高价值可吸收`
   - `中价值偏产品启发`
   - `低价值或仅概念参考`
2. `astrbot_plugin_proactive_chat` 的定位不单列为“中低价值、治理面板参考”，统一并入 `中价值偏产品启发`，但在该档内部排末位。
3. `最小落地方式` 的文字表达虽然不同，但应统一按 AIRI 的主改动来源理解，不把 wording 差异误判成优先级差异。
4. 四个项目都不支持“整包迁入 AIRI”，都应被视为 `child-task-sized absorption`，不是路线换轨或宿主重建。

## 3. 四项目横向对比

| 项目 | 统一优先级 | 对 AIRI 的直接价值 | 近期落地判断 | 更像哪类改动来源 |
|---|---|---|---|---|
| `astrbot_plugin_screen_companion` | `高价值可吸收` | 补 `vision / screen usage contextualization` 与 `proactive restraint` 的结构化上下文缺口 | 最适合优先进入下一阶段 | `runtime` 为主，`integration` 为辅 |
| `astrbot_plugin_livingmemory` | `高价值可吸收` | 补 `external-memory judgement`、候选治理、记忆 explainability 缺口 | 适合优先进入下一阶段 | `contract` 为主，`runtime` 为辅 |
| `astrbot_plugin_private_companion` | `中价值偏产品启发` | 补 companion judgement layering、`self relevance` 闸门、关系连续性最小账本 | 更适合先做产品/契约启发 | `contract` 为主，`runtime` 为辅 |
| `astrbot_plugin_proactive_chat` | `中价值偏产品启发` | 补 proactive timer、suppression、reschedule、cancel 的治理可见性 | 适合作为治理面板参考，不适合作为主线先做 | `UI` 为主，`runtime` 为辅 |

## 4. 最终优先级排序

最终横向排序如下：

1. `astrbot_plugin_screen_companion`
2. `astrbot_plugin_livingmemory`
3. `astrbot_plugin_private_companion`
4. `astrbot_plugin_proactive_chat`

排序依据不是功能多寡，而是：

- 是否直接补 AIRI 当前路线的真实缺口
- 是否能以有限结构变化吸收
- 是否能保持 current ownership boundary 不漂移
- 是否能在 AIRI 现有 surface 上做出可验收结果

额外说明：

- 如果只按“最轻 UI 交付成本”排序，`astrbot_plugin_proactive_chat` 可能会高于 `astrbot_plugin_private_companion`。
- 但如果按 AIRI 的长期 judgement value 排序，`astrbot_plugin_private_companion` 仍然更高，因为它提供的是 companion judgement structure，而不只是面板表达。

## 5. 最适合先进入 AIRI 下一阶段的两个项目

最适合最先进入 AIRI 下一阶段的是：

1. `astrbot_plugin_screen_companion`
2. `astrbot_plugin_livingmemory`

原因如下：

1. `screen_companion` 最直接补 AIRI 当前的 `vision runtime -> usable context -> proactive restraint` 断层。
2. `livingmemory` 最直接补 AIRI 当前的 `external memory candidate -> judgement -> explainability` 断层。
3. 这两个项目吸收后，还能反过来为 `coordination` 提供统一解释对象，形成 AIRI 下一阶段最清晰的“上下文判断 + 记忆判断”双支柱。

这两个项目都应按：

- `不整包迁入`
- `不重做宿主架构`
- `先 contract / snapshot / judgement policy，再 surface`

的顺序吸收。

## 6. 哪些只适合做产品启发，不适合近期落地

### `astrbot_plugin_private_companion`

适合借的是：

- `life_state -> continuity -> decision -> expression support` 的 companion judgement layering
- `self relevance` 主动前闸门
- `open_loops / awaiting_reply / backoff / recent topic signature` 这类最小连续性账本

近期不适合直接落地的是：

- 生活模拟壳
- 梦境、日记、书柜、技能成长
- 群聊关系图谱
- all-in-one companion runtime

因此它更适合作为 AIRI 后续 companion orchestration 设计参考，而不是当前阶段的独立实现目标。

### `astrbot_plugin_proactive_chat`

适合借的是：

- `next eligible window`
- `reschedule / cancel`
- `unanswered_count`
- 最近 suppression 原因的可见性
- operator-facing proactive status panel

近期不适合直接落地的是：

- 高频主动聊天驱动
- simulated user-message wakeup
- scheduler-first 主导的默认主动架构

因此它更适合作为 AIRI proactive governance surface 的参考来源，而不是主动机制主线蓝本。

## 7. AIRI 下一阶段建议吸收清单

下一阶段建议拆成两条主吸收线和两条窄借鉴线。

### 主吸收线 A：结构化屏幕上下文

来源：

- `astrbot_plugin_screen_companion`

建议目标：

1. 定义 `screen_peek` contract。
2. 定义 `screen_usage_context` contract。
3. 定义 `presence snapshot`，至少包含 `active / idle / away`、最近输入时间、是否适合打断。
4. 定义 `activity trajectory summary`，只保留压缩后的高价值轨迹。
5. 在 proactive judgement 中引入 `same-window / away / low-confidence / sensitive-context` 的 suppress / defer 依据。
6. 在 coordination 中增加 screen explainability block。

主改动来源：

- `runtime`
- `integration`

### 主吸收线 B：外部记忆判断深化

来源：

- `astrbot_plugin_livingmemory`

建议目标：

1. 定义 `canonical_summary` 与 `persona_summary` 的双通道摘要契约。
2. 增加 `summary_quality`、`source_window`、`candidate_state`、`evidence_count`、`last_reinforced_at` 等 judgement 字段。
3. 为 recall / memorize 增加显式控制语义与跳过原因。
4. 在 coordination 中增加 memory explainability block。
5. 在 memory surface 中增加 candidate review 与 score / evidence 可见性。

主改动来源：

- `contract`
- `runtime`

### 窄借鉴线 C：companion judgement structure

来源：

- `astrbot_plugin_private_companion`

只建议吸收：

1. `self relevance gate`
2. `continuity ledger`
3. `reply_enhancement` 前置判断层

不建议本阶段吸收：

- all-in-one companion runtime
- 生活模拟大状态系统

主改动来源：

- `contract`
- `runtime`

### 窄借鉴线 D：proactive governance surface

来源：

- `astrbot_plugin_proactive_chat`

只建议吸收：

1. `next_eligible_at`
2. `last_reschedule_at`
3. `last_cancel_at`
4. `last_suppressed_reason`
5. `last_suppressed_at`
6. dashboard / proactive / coordination 中的治理面板表达

不建议本阶段吸收：

- 高频主动聊天 runtime
- scheduler-first 主动驱动模式

主改动来源：

- `UI`
- `runtime`

## 8. 下一阶段执行顺序建议

建议按下面顺序推进：

1. 先做 `screen_companion` 吸收线中的 contract 与 snapshot。
2. 再做 `livingmemory` 吸收线中的 judgement contract 与 candidate state。
3. 之后把两条线统一接入 `coordination` explainability。
4. 最后再从 `private_companion` 与 `proactive_chat` 各自窄吸收一层：
   - `self relevance / continuity`
   - `proactive governance surface`

这样推进的好处是：

- 先补 AIRI 当前最清晰的上下文与记忆判断缺口
- 再补 companion judgement 和 operator-facing explainability
- 避免一开始就被大型 companion runtime 或高频主动系统带偏

## 9. 本阶段必须坚持的边界

下一阶段无论吸收哪条线，都必须坚持：

1. 不替换 `D:\AIRI-Memory` 的 source-of-truth 地位。
2. 不让 `nahida-persona` 吞掉 orchestration、memory judgement 或 proactive governance。
3. 不把 AIRI 变成默认高频盯屏、默认高频主动、默认重型长记忆引擎的系统。
4. 不整包迁入任何一个参考项目的宿主 runtime。
5. 不通过“参考吸收”任务偷渡路线换轨。

## 10. 一句话结论

AIRI 下一阶段最该先吸收的是：

- `astrbot_plugin_screen_companion` 提供的结构化屏幕上下文与主动克制语法
- `astrbot_plugin_livingmemory` 提供的外部记忆候选判断与可解释治理

而 `astrbot_plugin_private_companion` 与 `astrbot_plugin_proactive_chat` 当前更适合作为：

- companion judgement structure 参考
- proactive governance surface 参考

不是近期主线落地对象。
