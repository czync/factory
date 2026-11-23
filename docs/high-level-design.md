# Migration Factory：迁云交付平台高层架构与工程落地设计

> **文档定位**：面向迁云项目 Lead、架构委员会与平台工程团队的完整高层架构与核心机制落地指南（管理层可直接阅读 **第零部分：一页决策摘要**）。  
> **项目基线**：当前处于 **M2**；计划 **M3–M5** 交付最小可用闭环（MVP），支撑 **M7** 第一批（W0，2 个 As-Is 应用）合规上线，**M13**（W1，8 个 As-Is 应用）定出 As-Is 标准做法，并在 **M24** 前完成全部 **78 个应用**（58 个 As-Is、8 个 Modernize、12 个 Retire）迁云与机房退出（含 **M23** 单月约 30 个应用集中切换）。

---

## 第零部分：一页决策摘要（Executive Summary）

### 0.1 第一性原理：支配本项目的三条物理定律

剥离一切架构包装，本迁云项目在工程物理层面上受以下三条客观规律支配，所有系统设计必须围绕它们展开：

1. **等价性证明定律（代码改写仅占 10%，“证明结果等价 + 解开隐式耦合”占 40%，“跨系统流程等待”占 50%）**
   托管银行系统（交易、结算、抵押品、对账、投资核算、监管报表）的底线是新旧系统在所有业务输入下输出与状态 $100\%$ 等价（$F_{\text{AWS}} \equiv F_{\text{Legacy}}$）。两个试点之所以都跳过了“先做旧系统基线、再改造”并合入超大未审 AI PR，根本原因是 **AI 让“写代码”阻力趋近于零，而“给十几年未动的老系统建可复现构建、抓基线”和“办 20+ 步环境工单”阻力极大**。平台必须先提供工具把“建基线”和“办流程”的阻力降到最低，才能守住合规底线。
2. **排队论与共享资源峰值拥塞定律（瓶颈不在单应用编码速度，而在三大全局共享资源的争用）**
   78 个应用并非独立平行线，而是在同时争抢三个稀缺资源：① **共享的 Sybase 核心数据库**（受制于“数据先到，应用再走”硬规则）；② **外部人工审批与运维团队的吞吐极限**（78 个应用累计需发起 $2,000+$ 张跨系统请求，到了 **M23 单月集中切换 30 个应用**时，若仍按单应用逐个提单审批，必然引发审批队列雪崩）；③ **极少数懂老代码的业务专家（SME）**。
3. **AI 熵增与动态结晶定律（确定性验证器的覆盖率决定 AI 自治上限，探索必须沉淀为确定性工具）**
   面对未知的遗留系统，缺乏基线与确定性验证器（Verifier）约束的 Agent 只会加速制造隐患。系统必须让 Agent 在解决第 1 个应用的问题后，将可重复的部分**动态结晶（Dynamic Crystallization）**为确定性配方（Recipe）、填表脚本与验证器，让第 $2 \sim 78$ 个应用以确定性机器速度直接复用，而非每次让大模型从头试错。

---

### 0.2 系统定位与三大核心产出

**Migration Factory（下文亦称 App）** 不是替代 Jira、GitHub、Harness、ServiceNow 的重型开发平台，也不是所有日常操作都必须经过的集中审批瓶颈；它是一套**以标准化迁移流水线为骨架、以 Super Harness（主动/被动双模 Agent + 确定性自动化）为执行引擎、能够持续将真实迁移经验结晶为可复用工程能力的迁云交付操作系统**。

它同时交付三种核心产出：
- **对应用团队（含工程师、QE、供应商及 SME）**：产出**可执行的迁移服务**（开箱即用的基线采集包、一次录制即可复用的 Onboarding 填表工具、可拉取的 Agent Skills 与三段式业务规则确认台），让遵守规范比绕过规范更省事；
- **对迁移管理与架构团队**：产出**可信的整体交付视图**（基于外部系统真实证据计算的受控阶段、跨 Wave 数据库依赖锁、工单排队时长、误期预警、AI 质量及单应用迁移总成本）；
- **对后续批次应用**：产出**能够直接复用的工程能力**（随每个应用交付不断升级的 Work Packages、转换 Recipes、确定性脚本与验证探针）。

---

### 0.3 四大核心问题设计结论速览

| 核心问题 | 核心设计结论 |
| :--- | :--- |
| **1. App 怎么设计？**<br>（核心边界与双维架构） | • **三层解耦**：① **控制面（Factory Console）**只做管理、决策与异常待办；② **控制核（Factory Core + PostgreSQL）**维护状态机、关卡评估与三大账本（依赖与配置账本、阶段证据与豁免账本、只追加审计与成本账本）；③ **版本化资产库（Git `migration-factory` 仓库）**存放全部 Playbook、工作包、Recipe、Skill 与脚本，**直接用 GitHub PR 承载能力升级审查**（不自建网页版规则编辑器）。<br>• **双维执行引擎**：**纵向 `Migration Run`** 护航单应用从 Discovery 到 Cutover 端到端闭环；**横向 `Transformation Campaign`** 对 58 个 As-Is 应用提前只读扫描，用验证通过的 Recipe 批量生成共性改造 PR 草稿。<br>• **主动 + 被动双模 Agent（Super Harness）**：后台由 **Event-Driven Headless Workers** 监听事件**主动推进**（自动评估、横向批改造、构建红灯自动诊断、`Red → Green` 自动结案提炼）；前台由 **MCP Server** 供工程师 IDE **按需拉取**上下文与 Skills。 |
| **2. 怎么自动化？**<br>（流程录制结晶 + 基线工具包 + 代码改造） | • **Onboarding 第一优先级（P0）：参数自动推导 + 浏览器一次示范录制 + 本地 AI 沉淀为确定性脚本/Bookmarklet**：针对跨 7+ 系统申请高权限 Service Account API 审批漫长的现实，利用 Onboarding 20+ 步流程与参数固定的特点，由 Factory 自动推导全套标准参数；**首应用由工程师在已登录 SSO 浏览器中手工点填一遍（本地录制 DOM 轨迹），本地 AI 自动对齐上下文变量并生成确定性填表脚本/Bookmarklet**；后续应用 1 秒自动填单、人点提交、单号自动回填。<br>• **第 0 号工作包（`WP-00-Legacy-Baseline`）**：提供旧构建依赖探测封装、三类业务形态（AutoSys 批处理 / 联机报文 / 存储过程）数据快照采样、确定性脱敏与黄金样本（Golden Master）双跑降噪比对工具。<br>• **四级动态结晶**：`Red → Green` 自动写入 Jira `Migration Problem`（**Case**）$\rightarrow$ 泛化为转换配方（**Recipe**）$\rightarrow$ 封装进 **Skill** $\rightarrow$ 固化为**确定性脚本与验证探针（Deterministic Script）**。 |
| **3. 怎么推进？**<br>（MVP 最小闭环与试点全覆盖） | • **严格按“最小完整闭环（Minimum Viable Loop）”界定 MVP，与单应用业务排期解耦**：<br>  - **M3–M5 (App MVP：研发与流程减负闭环)**：跑通 As-Is 状态机（记录/告警模式）、Onboarding 参数推导+录制填表闭环、`WP-00` 基线包+4 项改造包、主动 Worker + 被动 MCP、`Red → Green` Jira 沉淀及阻塞风险视图。<br>  - **M6–M7 (发布控制闭环)**：打通 `Develop → Release → master` 晋级硬拦截、前置 Git 钩子防脏文件、UAT/PROD 同制品 SHA256 对账，保障 **W0（2 个应用）M7 合规上线**。<br>  - **M8–M13 (规模化与标准定型闭环)**：联合 W1（8 个 As-Is）与 Modernize 试点 **100% 覆盖全部 7 项改造**并升级至 `V1.0`；上线横向 Campaign、SME 交易流确认台、成本大盘与 **Wave 级批量预授权变更**（备战 **M23 单月 30 应用集中切换**）。 |
| **4. 怎么解决问题？**<br>（对照试点 8 大痛点） | • **推不动/做法不一（#1, #6）**：纵向工作包 + 横向 Campaign + 四级动态结晶 + 事件流自动派生度量；<br>• **误期不可见/流程黑洞（#2, #8）**：区分“计划阶段 / 实际观测活动 / 受控通过阶段” + 录制确定性填表脚本 + 审批排队计时 + Wave 批量变更；<br>• **跳过基线/AI 失控/无发布路径（#3, #4, #7）**：`WP-00` 基线采集包 + 本地 `pre-commit`/组织级 Push Protection + `Release` 晋级门禁复核独立 Review + UAT/PROD 同制品对账；<br>• **知识分散/专家时间少（#5）**：静态代码 + Sybase 运行时审计日志双源依赖账本 + 按“交易流/批处理”聚合的 SME 业务规则确认台。 |

---

### 0.4 需要架构委员会立即拍板的 4 项关键决策

1. **明确 W0（M7 上线）的生产并行验证口径**：W0 为 2 个低关键度、小代码量的 As-Is 应用。若机械执行“3 个月生产并行”，倒推必须在 M4 进入生产，与工程现实冲突。建议明确 **W0 适用“基于 `WP-00` 的历史生产流量/批次全量回放比对 + 2～4 周缩短版生产并行”**，将完整 3 个月并行严格用于核心 Modernize 与高风险应用。
2. **授权开启 GitHub Enterprise 组织级前置拦截钩子（Pre-receive Hook）**：由于应用团队不能自配仓库级分支保护，为彻底杜绝“密钥、生产业务数据、`.mp4` 录屏与会话状态 push 进 Git 历史造成既成泄密”，需由 GHE 管理员在组织级开启全局 Secret Push Protection 与大文件/后缀黑名单拦截，配合 Factory 的 `Release` 关卡审查形成闭环。
3. **批准在 M8–M13 建立“按 Wave 批量预授权变更（Batch / Standard Change）”机制**：为防止 M23 单月 30 个应用集中切换打爆外部审批队列，需与网络安全、身份运维、DBA 及 Change 团队约定：同 Wave 同模式的共性请求（防火墙、标准角色组、同构表切换）支持按 Wave 批次合并建单与审批。
4. **确认单应用成本中的“人工投入”采用轻量级估算确认制**：在不引入每日工时填报系统的前提下，批准采用“Jira/PR 活跃周期自动推算 + 工作包完成时负责人一键确认总人日”作为管理层单应用成本报告的官方人力口径。

---

## 第一部分：App 怎么设计？（总体架构、核心概念、模块边界与数据同步）

### 1.1 App 的责任边界：控制事实来源 vs. 业务权威来源

App 是跨系统迁移交付的**控制事实来源（Control Plane & Ledger）**，但绝不替代现有企业工具成为底层研发或运维数据的存储仓库：
- **Jira** 负责开发任务（Task）与原子化迁移问题（`Migration Problem`）的跟踪；
- **GitHub Enterprise** 负责应用源码、PR 人工评审，以及 `migration-factory` 标准能力资产的版本控制；
- **Harness** 负责执行构建、安全扫描、非生产部署与生产人工审批部署；
- **Artifactory** 负责存储开发制品与唯一不可变的 Release 制品；
- **Terraform Enterprise (TFE)** 负责基础设施状态与配置漂移检测；
- **ServiceNow & SailPoint** 负责权限组、基础设施请求与生产 Change 的正式审批流；
- **Confluence / SharePoint** 保留既有文档与归档材料；
- **Factory App** 负责定义迁移路径、推导跨系统参数、调度主动/被动 Agent 与确定性工具、采集各系统证据计算关卡状态，并维护依赖、证据与审计成本三大账本。

因此，一个应用在 Factory 中的状态绝不靠 PM 手工填表，而是**三态并列计算展示**：
> **示例（APP-012）**：  
> - **计划阶段（来自 PMO/Jira）**：`Build`  
> - **已观测活动（来自 GitHub/Harness）**：`Build 已开始（检测到 Develop 分支已有 4 个改造 PR 合入）`  
> - **受控通过阶段（Factory 关卡判定）**：`停留在 Spec（未通过）` —— **阻塞原因**：缺少 `WP-00` 旧系统基线签名证据，疑似违规提前改造（已亮红牌并锁死后续 `Release` 晋级）。

---

### 1.2 整体架构与三类用户接触面

系统不把所有功能塞进一个臃肿的网站，而是划分为**三个用户接触面**与**四层内部结构**：

```text
+-------------------------------------------------------------------------------------------+
|                                 三个用户与工程接触面                                      |
|  1. [Factory Console (Web 控制台)]     2. [Factory Runner (本地端)]   3. [GitHub & Jira]  |
|     • Portfolio (全局与 Wave 大盘)        • CLI + 浏览器录制/填表器      • 日常 PR Review |
|     • Migration Runs (单应用纵向推进)     • 本地 Git pre-commit 钩子     • 问题记录闭环   |
|     • Campaigns (跨应用横向批量改造)      • IDE 挂载 Factory MCP         • Git PR 审核发布|
|     • Action Inbox (SME确认/签字/豁免)                                     新 Recipe/Skill|
+-------------------------------------------------------------------------------------------+
                                              │ ▲
                                              ▼ │
+-------------------------------------------------------------------------------------------+
|                         Factory Core (控制内核 + PostgreSQL 数据库)                       |
|  • Portfolio & Run Engine (纵向状态机)     • Campaign Orchestrator (横向批量扫描与派发)   |
|  • Gate & Evidence Engine (关卡与豁免)     • Parameter & Workflow Tracker (20+步参数推导) |
|  • Release Assurance (三分支与制品对账)    • Event Dispatcher (监听外部事件调度后台任务)  |
|  • 三大持久化账本: [依赖与配置账本]  [阶段证据与豁免账本]  [只追加审计与成本遥测账本]     |
+-------------------------------------------------------------------------------------------+
              │                                    │                                  │
   (读取版本化模板与资产)              (调度 Super Harness 执行层)         (状态同步与证据对账)
              ▼                                    ▼                                  ▼
+---------------------------+    +------------------------------------+    +----------------+
| Git 能力资产仓库          |    | Super Harness 智能与确定性执行面   |    | 企业外部系统   |
| (migration-factory)       |    | • 后台主动 Headless Agent Workers  |    | • GitHub / Jira|
| • playbooks/ (3条流水线)  |    | • 前台被动 Factory MCP Server      |    | • Harness / TFE|
| • work-packages/ (WP00-07)|    | • 本地录制分析与确定性填表脚本     |    | • Artifactory  |
| • capabilities/           |    | • WP-00 基线采集与双跑回放比对器   |    | • ServiceNow   |
|   (skills/recipes/scripts)|    | • 外部 Coding Agents (Devin/Copilot|    | • SailPoint    |
| • policies/ (门禁与权限)  |    |   /Blitzy/AWS Transform 适配)      |    | • Vault/CMDB   |
+---------------------------+    +------------------------------------+    +----------------+
```

---

### 1.3 核心领域概念（Domain Model）

为避免概念膨胀，系统严格围绕以下 **10 个核心领域对象** 构建数据模型：

| 领域对象 | 定义与核心职责 | 关键设计考量 |
| :--- | :--- | :--- |
| **1. `Application`** | 被迁移的 78 个业务系统之一，记录 CMDB ID、去向（`As-Is / Modernize / Retire`）、责任团队与代码库关联。 | 代表业务与合规管理的主体。 |
| **2. `MigrationUnit`** | **一个可独立验证、交付和切换的最小迁移单元**。普通应用与 `Application` 为 $1:1$；跨多个 Wave 改造的 150 万行超大应用拆分为多个 `MigrationUnit`（生产部署两套独立实例）。 | **为什么必须引入它？** 150 万行大应用拆成十几个能力域跨多个 Wave 交付，若状态只挂在 `Application` 上，会出现“同一应用既在 Discovery 又在 Cutover”的状态冲突。 |
| **3. `Wave`** | 交付批次（`W0–W4`），绑定关键里程碑日期、包含的 `MigrationUnit` 集合、本批次迁移的数据库表集合，以及 **Wave 级三道关卡（进入、并行入场、退出）**。 | 控制跨应用排期与“数据先到，应用再走”的批次边界。 |
| **4. `MigrationRun`（纵向）** | 某个 `MigrationUnit` 正在执行的端到端迁移实例，绑定具体的 `Playbook` 版本，维护各阶段（`Intake` 至 `Decommission`）与挂载工作包的实时状态。 | 纵向保障单应用完整合规交付。 |
| **5. `TransformationCampaign`（横向）** | 跨多个应用批量执行同一种探测或改造任务的实例（如“跨 22 个 As-Is 应用批量修复 Solaris Shell 兼容性”），绑定特定 `Detector` 与 `Recipe` 版本。 | 横向消灭 58 个 As-Is 应用的重复摸索。 |
| **6. `WorkPackage` & `Capability`** | 标准工作单元（如 `WP-Onboarding`、`WP-00-Baseline`、`WP-01` 至 `WP-07`）及其调用的底层能力（`Skill / Recipe / Script / BrowserFormRecipe`），均带语义化版本号。 | 正在执行的 `MigrationRun` 绑定具体版本，升级模板不会破坏在途应用。 |
| **7. `Dependency & Config Fact`** | 从代码静态扫描、数据库运行时日志、文档或人工确认中提取的依赖事实（表、作业、文件、队列、跨应用调用）与环境配置键/Vault 路径指针。 | **明确区分“AI 草稿假设”与“已确认事实”**；每张共享表绑定所属迁移 Wave。 |
| **8. `CheckItem` & `GateEvaluation`** | 阶段关卡的检查项定义（出处、Owner、`自动化程度 × 执行力度`）及每次评估的快照结果（`满足 / 不满足 / 证据不足 / 不适用 / 已获有效豁免`）。 | **执行力度独立于检查结果**：`LogOnly` 模式下未达标仍如实记为“不满足”，绝不显示为“已满足”。 |
| **9. `ReleaseCandidate`** | 串联一次发布的完整证据链：`Develop` 合入提交与独立 Review $\rightarrow$ `Release` PR $\rightarrow$ Harness 唯一构建 $\rightarrow$ Artifactory 制品 SHA256 $\rightarrow$ UAT 验证报告 $\rightarrow$ PROD 部署记录 $\rightarrow$ `master` 归档提交。 | 证明“生产上线的就是 UAT 验证过的同一个制品”。 |
| **10. `Decision, Waiver & AuditEvent`** | 人类作出的业务规则确认、基线差异接受、关卡签字、带有效期的结构化豁免（`Waiver`），以及追加式防篡改审计事件流（`AuditEvent`）。 | 事实、决定、执行三者物理分开记录。 |

---

### 1.4 模块划分与第 5 节能力归属全景表

所有自建模块部署在**同一个轻量级单体服务（Factory Core）+ 同一个 PostgreSQL 数据库**中，不拆微服务：

| 模块名称 |第 5 节对应能力 | Factory App 自建职责 | 外部现有工具承载职责 | 建设时机 |
| :--- | :--- | :--- | :--- | :--- |
| **A. Portfolio & Run Engine** | 阶段管理、计划对照、误期预警 | 维护 `Application / MigrationUnit / Wave / MigrationRun` 状态；对比 PMO 计划、实际活动与受控阶段；基于剩余工作周期与阻塞时长计算误期预警 | **Jira** 维护日常研发任务与排期基线 | **M3–M5 (MVP)** |
| **B. Evidence & Gate Engine** | 阶段关卡、签字与豁免 | 管理版本化检查项（注明规则出处与 Owner）；自动拉取外部系统证据计算关卡状态；提供人工签字与结构化豁免（理由、补偿措施、批准人、有效期）管理及统计 | **Harness / Veracode / Black Duck / TFE** 产出测试、扫描与漂移原始报告 | **M3–M5 (MVP 记录态)**<br>**M6–M7 (拦截态)** |
| **C. Onboarding & Workflow Tracker** | 流程类工作（第 6 节 20+ 步与工单） | **自动推导 20+ 步与改造工单参数**；管理本地录制生成的确定性填表脚本/Bookmarklet；调用已获批 API 批量建单；追踪每步状态（`待前置/可发起/等待审批/完成/阻塞`）与排队耗时 | **ServiceNow / SailPoint / EntraID / CyberArk** 执行审批与权限配置 | **M3–M5 (MVP 核心优先)** |
| **D. Dependency & Rule Ledger** | 知识（依赖账本与业务规则确认） | 维护应用-库表-作业-文件-配置依赖账本（强控“数据先到，应用再走”）；在 `Action Inbox` 提供按“交易流/批处理”聚合的 **SME 业务规则确认台** | **Confluence / SharePoint** 存既有文档；**Vault / CyberArk** 存真实密钥值 | **M3–M5 (依赖账本)**<br>**M8–M10 (SME 确认台)** |
| **E. Super Harness & Campaign Engine** | 改造识别与复用、AI 受控入口 | 运行 Detector 识别 7 项改造适用性；调度**后台主动 Headless Workers** 与**横向 Campaign**；提供**前台 MCP Server**；维护 AI 工具与模型登记簿 | **GitHub** 存 `migration-factory` 资产库并承载 PR 评审；**Copilot / Devin / Blitzy** 提供模型与编码环境 | **M3–M5 (最小闭环)**<br>**M8–M13 (Campaign 规模化)** |
| **F. Release Assurance** | 发布晋级与事后对账 | 受控发起 `Develop → Release` 与 `Release → master` PR；校验独立 Review、PR 大小与无脏文件；调 Harness 触发非生产部署；执行 UAT/PROD 制品 SHA256 对账与绕过检测 | **GitHub** 托管三分支；**Artifactory** 存制品；**Harness** 执行构建与生产人工部署 | **M6–M7 (W0 上线前必交)** |
| **G. Delivery Intelligence & Audit** | 审计记录、AI 质量与单应用成本度量 | 维护只追加防篡改哈希链审计日志；自动从事件流派生等待时长、AI 吞吐量/修改率/驳回率/返工率/缺陷逃逸率及**单应用迁移总成本** | 各外部系统与云账单提供原始事件和费用数据 | **M3–M5 (审计与基础指标)**<br>**M8–M13 (完整成本大盘)** |

#### 明确不建设的内容（防膨胀边界）
1. **不自建 CI/CD 执行器或 Terraform 运行引擎**（全部交由 Harness 与 TFE 执行，Factory 只拿结果当证据）；
2. **不自建独立的网页版“Capability Studio（规则/脚本在线 IDE）”**（所有 Playbook、Recipe、Skill、脚本均存在 Git 仓库，直接用 **GitHub PR + CI 测试** 完成审查、版本发布与回滚）；
3. **不引入重型分布式工作流集群（如独立 Temporal 集群）**（迁云流程等待以“天/周”计，用 PostgreSQL 状态表 + 幂等键 + Webhook/定时任务即可实现零维护成本的持久化等待与恢复）；
4. **不自建独立向量知识库或重型图数据库**（用 PostgreSQL 关系表 + JSONB 存储结构化依赖账本与错误特征索引即可精准满足查询）。

---

### 1.5 内部数据库“双写 + 事件同步 + 幂等对账”机制

为保证跨 7+ 个外部系统的状态一致性，Factory 采用**“意图先行双写 + Webhook/轮询同步 + 定时对账恢复”**机制：
1. **跨系统写操作（Outbox 双写模式）**：当用户在 Factory 控制台或本地脚本发起跨系统动作（如创建 Jira Task、提交 ServiceNow 工单、发起 `Release` PR）时，Factory 先在内部 PostgreSQL 写入一条带唯一幂等键（`idempotency_key`）的 `OperationIntent（状态：PENDING）` 及审计事件，再调用外部接口；成功后回填外部单号（如 `RITM0012`、`PR #88`）并将状态置为 `CONFIRMED`。若网络超时，后台恢复任务先按幂等键查询外部系统是否已创建，已创建则直接补齐链接，未创建才安全重试，杜绝重复建单。
2. **外部原生事件同步（Webhook + 定时轮询兜底）**：工程师在 GitHub 合并 PR、Harness 完成构建扫描、审批人在 ServiceNow 批准工单，均通过 Webhook 实时推送（辅以每 10 分钟增量轮询兜底）写入 Factory 内部库，触发关卡重算与下一步解锁。

---

### 1.6 迁移逻辑存在哪里？`migration-factory` 仓库标准目录结构

**“代码仓库存放可复用的标准与工具，数据库存放真实迁移的运行状态。”** 企业 GitHub 中的 `migration-factory` 仓库采用如下四层工程结构：

```text
migration-factory/
├── playbooks/                              # 1. 交付流水线定义（决定阶段、关卡顺序与工作包组合规则）
│   ├── as-is-playbook.yaml                 #    As-Is 标准 8 阶段定义
│   ├── modernize-playbook.yaml             #    Modernize 阶段定义（含逆向、SME 规则确认与等价验证）
│   └── retire-playbook.yaml                #    Retire 简化 3 阶段定义（Intake → Discovery → Decommission）
│
├── work-packages/                          # 2. 标准化工作包定义（定义输入、前置条件、调用的能力与验收标准）
│   ├── wp-00-legacy-baseline/              #    ★ 第 0 号工作包：旧系统可复现构建与基线采集/双跑比对
│   ├── wp-onboarding-aws/                  #    ★ 公共工作包：20+ 步 AWS Onboarding 与权限/网络准备
│   ├── wp-01-secrets-vault-cyberark/       #    改造 1：密钥管理迁移 (Vault / CyberArk)
│   ├── wp-02-cicd-harness/                 #    改造 2：接入统一 CI/CD 平台 (Harness)
│   ├── wp-03-compute-ecs-ec2-eks/          #    改造 3：容器化或 VM 部署 (ECS / EC2 / EKS)
│   ├── wp-04-file-transfer-mfx/            #    改造 4：接入企业统一文件传输平台 (Transfer Family / MFX)
│   ├── wp-05-scheduler-autosys/            #    改造 5：接入企业统一作业调度平台 (AutoSys)
│   ├── wp-06-db-sybase-to-oracle/          #    改造 6：数据库换型 (Sybase → Oracle)
│   └── wp-07-os-solaris-win-to-linux/      #    改造 7：操作系统迁移 (Solaris / Windows → Linux)
│
├── capabilities/                           # 3. 实际可执行能力资产库（四级动态结晶的产物存放处）
│   ├── skills/                             #    给 Agent 拉取的 SKILL.md、Prompt 模板与上下文组装规则
│   ├── recipes/                            #    已验证的代码/配置转换配方（含 Detector 规则 + AST/文本转换模板）
│   ├── scripts/                            #    确定性探针、基线采样脱敏脚本、双跑 Differ、git pre-commit 钩子
│   └── browser/                            #    ★ 浏览器录制沉淀出的 FormRecipe.json、Bookmarklet 与 Playwright 脚本
│
└── policies/                               # 4. 不可由 AI 自由裁量的硬性控制策略
    ├── stage-gates.yaml                    #    各阶段关卡的 CheckItem、规则出处、Owner 与默认执行力度
    ├── naming-and-derivation.yaml          #    Onboarding 20+ 步参数自动推导规则（AD组、角色、TFE、SNOW字段映射）
    └── agent-permissions.yaml              #    Agent 沙箱边界、只读路径、禁止修改的测试基线目录与文件黑名单
```

---

## 第二部分：三条迁移流水线与七项平台改造工作包详解

### 2.1 三条标准迁移流水线（As-Is / Modernize / Retire）全阶段运行机制

三条流水线共享统一的阶段骨架，通过组合不同的工作包应对三类应用去向：

| 阶段 | As-Is 流水线（58 个应用）核心工作与门禁 | Modernize（8 个核心应用）增量工作 | Retire（12 个下线应用）简化路径 |
| :--- | :--- | :--- | :--- |
| **1. Intake & Discovery** | • 运行 `Discovery Worker` 与静态探针，扫描源码、构建脚本与配置<br>• **交叉比对 DBA 导出的 Sybase 运行时日志**，建立**依赖账本**（表、AutoSys 作业、文件、队列）<br>• **即刻并行启动 `wp-onboarding-aws`（20+ 步环境与权限准备）** | • 对 COBOL / C++ / PowerBuilder 代码进行逆向调用链分析<br>• AI 抽取业务规则草稿并按“业务域 → 交易流/批处理”三级聚合 | • 扫描并结合运行时日志确认：**是否仍有未解耦的下游读取方、定时作业或外部文件依赖**<br>• 识别需合规归档的历史数据范围 |
| **2. Build 前置：可复现构建与旧基线 (`WP-00`)** | • 执行 `wp-00-legacy-baseline`：复现旧系统构建并固化依赖<br>• 采集旧系统典型批次/交易输入快照与 **Golden Master 黄金输出样本**并签名登记<br>• 分析现状与 AWS 目标环境差异（Gap Analysis） | • 除采集旧系统行为与数据基线外，建立旧系统核心核算/报表的**业务等价性验证基准集** | *（跳过）* |
| **3. Spec（规格与范围锁定）** | • 根据 Discovery 探测结果锁定适用的平台改造工作包（7 项改造子集）<br>• 生成各环境配置键迁移表与 Vault/CyberArk 密钥路径指针表<br>• **门禁硬约束：未完成可复现构建与旧系统基线登记，严禁进入 `Build`** | • **SME 在控制台 `Action Inbox` 审查并签字确认业务规则**<br>• 架构师确认新系统目标架构规格与分 Wave 双实例部署方案 | *（跳过 Spec/Build/Verify/Cutover，确认下游依赖解除与数据归档方案后直接进入 Decommission 审批）* |
| **4. Build（改造实施）** | • **横向 Campaign** 批量推平共性兼容问题；**纵向工作包**由工程师与 Agent（通过 MCP/Skills）协同完成代码与配置改造<br>• 通过确定性填表脚本或 API 批量发起 7 项改造专项 ServiceNow 工单<br>• 改动经独立人工 Review（合并人≠作者且≠Agent 发起人）合入 `Develop`，部署至 `DEV` | • 使用 Copilot / Devin / Blitzy 按已确认规格重建代码<br>• **铁律：写代码的 Agent 严禁编写或修改判断其正确性的验收测试**（验收测试由独立 QE/工作流依据旧基线与已确认规则生成） | *（跳过）* |
| **5. Verify & Release 晋级** | • 人在控制台点击发起 `Develop → Release` PR；Factory 强校验基线、独立 Review、PR 规模、无脏文件及安全扫描（SAST/SCA/密钥/镜像）<br>• Harness 产出**唯一一次 Release 制品**存入 Artifactory 并部署至 `UAT`<br>• 运行 `WP-00` 双跑比对器验证新旧输出一致，检查 TFE 零漂移 | • 在 `UAT` 执行全量交易流与日终批处理的**业务等价性回放比对**；任何数值或状态差异必须修复，或由 SME 显式签字确认属于预期变更 | *（跳过）* |
| **6. Prod parallel & Cutover** | • 按需进入生产并行运行，自动统计连续无差异周期<br>• **`Cutover` 强校验“数据先到，应用再走”**：检查依赖账本中该应用读写的所有核心数据库表所属 Wave 是否已切换就绪<br>• 生成合规证据包与 Change 工单；**由授权人员在 Harness 执行 PROD 部署（强制复用 UAT 同一制品）**；Factory 自动对账 SHA256 并引导合入 `master` | • 核心业务系统及承载核心表迁移的单元经历完整生产并行期；其数据库切换完成事件将自动解锁下游依赖该表的 As-Is 应用 | *（跳过）* |
| **7. Handover & Decommission** | • 核验监控告警、运维 Runbook 及**供应商/临时人员向正式员工的知识移交签字**<br>• 退役旧机房服务器与旧库连接，自动触发 CMDB 核销工单 | • 旧主机/C++/PB 模块分阶段下线，完成跨 Wave 双实例合并与旧资源清理 | • 执行历史数据归档验证、关闭外部通道与作业、下线旧服务器并核销 CMDB |

---

### 2.2 七项平台改造工作包（`WP-01` 至 `WP-07`）逐项工程拆解

每个工作包都不是一个空洞的任务名，而是包含 **Detector（现状探针）、Recipe/Skill（转换方法）、Ticket Template（绑定的外部工单推导规则）、Verifier（确定性验收标准）** 的完整可执行模块，并按 `V0.1（标准方法+人工执行）→ V0.2（AI 辅助+自动准备）→ V1.0（自动执行+必要审批）` 演进：

| 工作包编号与名称 | 1. Detector（自动探测什么？） | 2. Recipe & Skill（改造什么？） | 3. 绑定的外部工单与配置 | 4. Verifier（靠什么证据验收？） |
| :--- | :--- | :--- | :--- | :--- |
| **`WP-01`<br>密钥管理迁移**<br>(Vault / CyberArk) | 扫描源码、配置文件、启动脚本中的硬编码密码、API Key、私钥文件、旧加密工具调用及数据库连接串 | 将硬编码或明文配置改写为标准 Vault Agent 注入 / SDK 动态拉取模式；提取各环境密钥键名清单 | 自动推导 Vault Namespace/Path 申请参数、CyberArk Safe 与特权账号工单；**App 只记 Vault 路径指针，由密钥管理员填入真值** | • 仓库密钥扫描零告警<br>• 配置账本中 DEV/UAT/PROD 均已绑定有效 Vault 路径且连通性预检通过 |
| **`WP-02`<br>CI/CD 平台接入**<br>(Harness) | 识别旧构建方式（Makefile / Ant / Maven / Gradle / 自定义 Shell）、产物打包格式与现有测试命令 | 生成对接平台标准 Pipeline 模板的 Harness 配置文件；移除对旧机房本地路径或私有构建机的硬编码依赖 | 自动推导 Harness Project、Connector、Artifactory 仓库与 Veracode/Black Duck 扫描接入请求 | • Harness 成功跑通 `Develop` 构建与单测<br>• SAST/SCA/密钥/镜像扫描报告全部生成并回传 Factory |
| **`WP-03`<br>容器化或 VM 部署**<br>(ECS / EC2 / EKS) | 分析应用进程模型、有状态/无状态特征、本地磁盘读写、端口监听、操作系统级依赖包与启动顺序 | 生成标准 `Dockerfile` / ECS Task Definition 或 Linux EC2 AMI 启动配置；生成引用企业私有 Registry 模块的 Terraform 代码 | 自动推导 TFE Workspace、ALB/NLB 负载均衡、DNS 域名、ACM 证书及安全组/防火墙工单参数 | • TFE Plan/Apply 成功且仅引用私有 Registry 合规模块<br>• 容器镜像扫描无高危漏洞<br>• `terraform plan` 漂移检测为零 |
| **`WP-04`<br>文件传输平台接入**<br>(Transfer Family / MFX) | 扫描代码与脚本中的 `scp / sftp / ftp / rcp` 命令、硬编码外部 IP、共享 NAS 挂载路径及文件加解密逻辑 | 将点对点散乱文件传输改写为对接企业统一文件传输平台（AWS Transfer Family / MFX）的标准接口与 S3/EFS 落盘路径 | 自动根据上下游依赖账本推导文件传输通道注册、PGP 密钥交换、外部伙伴白名单及防火墙工单 | • UAT 环境文件收发连通性测试通过<br>• 输出文件格式、编码（ASCII/EBCDIC/UTF-8）与校验和与旧基线一致 |
| **`WP-05`<br>作业调度平台接入**<br>(AutoSys) | 解析旧 `crontab`、Solaris 定时脚本或旧版 AutoSys JIL 文件，提取作业触发时间、前置依赖链（Box/Job）、环境变量与告警规则 | 转换生成指向 AWS 新计算节点的标准 AutoSys JIL 定义文件，更新作业调用脚本路径与错误退出码规范 | 自动推导 AutoSys Agent 注册、跨作业依赖授权与运维监控告警接入工单 | • JIL 语法与依赖图静态校验通过<br>• UAT 完整批次调度链试跑成功且耗时在基线阈值内 |
| **`WP-06`<br>数据库换型**<br>(Sybase → Oracle) | 扫描源码、MyBatis/JDBC、存储过程、触发器与批处理脚本中的 Sybase ASE/IQ 专有语法（如 `TOP`, `*=`, `tempdb #表`, 日期/字符串函数, 锁提示, 隐式类型转换） | 利用成熟 `Recipe` + Agent Skill 将 Sybase T-SQL 批量转换为等价 Oracle PL/SQL；替换 JDBC/ODBC 驱动与连接池配置；处理大小写敏感、空字符串 `''` 与 `NULL` 语义差异 | 自动推导 Oracle Schema/Role 账号申请、CyberArk 数据库特权接入、JDBC 连接串配置项及跨环境防火墙工单 | • **SQL 语法与执行计划预检通过**<br>• **`WP-00` 双跑比对器验证：相同输入下 Oracle 表状态变更与查询输出同 Sybase Golden Master 100% 等价**<br>• **上游关联表所在 Wave 已就绪** |
| **`WP-07`<br>操作系统迁移**<br>(Solaris/Win → Linux) | 扫描 C/C++ 源码、Shell/Perl/Bat 脚本中的 Solaris/Windows 专有系统调用、字节序（SPARC Big-Endian $\rightarrow$ x86 Little-Endian）、路径分隔符、`ksh/csh` 专有语法、32/64 位指针差异与本地第三方动态库（`.so/.dll`） | 应用跨平台转换 `Recipe` 修复字节序、POSIX 接口、GNU 工具链参数差异（如 `sed/awk/date/ps` 参数）及 Shell 脚本兼容性；替换 Linux 兼容依赖库 | 自动推导 Linux 基础镜像仓库、Unix 系统账号/组申请及日志采集（CloudWatch / Splunk）配置 | • 在目标 Linux 环境可复现编译通过且零警告升级错误<br>• 所有启停/批处理脚本在 Linux 下回归测试与基线比对全绿 |

---

### 2.3 Modernize 专属核心设计：按“交易流/批处理”三级聚合的 SME 业务规则确认台

针对 8 个 Modernize 核心应用（含最大 150 万行代码应用），业务规则深埋在几十年历史的 COBOL、C/C++、PowerBuilder 与存储过程中。如果让 AI 按代码函数抽取出几千条零碎的 `if-else` 甩给业务专家（SME），SME 根本无法审阅。

Factory 在控制台的 `Action Inbox` 中内置 **SME 业务规则确认台**，采用以下机制彻底解放专家时间：
1. **强制三级业务聚类（禁止平铺代码函数）**：
   后台 `Rule Extraction Worker` 先将源码调用链与 AutoSys 作业/交易入口对齐，强制按 SME 熟悉的业务语言聚合为三层结构：
   - **L1 业务能力域**（如：日终净额结算、抵押品市值重估、托管资产对账、监管报表生成）
   - **L2 具体业务流 / 交易码 / 批处理作业**（如：`JOB_EOD_NAV_CALC` 基金净值日终核算批次）
   - **L3 核心业务规则条目**（通常每个交易流聚焦 5–15 条核心核算、校验或状态流转规则）
2. **“输入 → 核算/校验逻辑 → 输出”三段式视图 + 源码与基线数据双溯源**：
   每条规则在界面上展示为清晰的三段式业务表格，并自动附带两项证据：
   - **源码定位链接**：点击即可展开对应的 COBOL/C++/SQL 原始代码片段与行号（如 `nav_calc.cbl#L412-L465`）；
   - **旧系统基线真实例证**：直接从 `WP-00` 采集的旧系统基线数据中抽取 1–2 条命中该规则的真实输入与输出样本展示在旁边，让 SME 一眼看懂规则的实际业务含义。
3. **批量确认与异议闭环**：
   SME 按交易流审阅，对高置信度规则可**一键批量勾选“确认无误（Confirmed Fact）”**（带人类身份签名写入证据账本）；对存疑或 AI 误读的规则点击**“驳回/批注”**，一句话写明正确业务含义，系统自动触发 Agent 结合批注重新修正规则草稿与验收测试规格。

---

## 第三部分：三大核心工程引擎深度拆解与落地指南（回答问题 2：怎么自动化？）

本部分针对项目中最影响成败的三个硬核工程领域——**Onboarding 浏览器录制与确定性沉淀**、**`WP-00` 旧系统基线采集包**、以及 **Super Harness 主动/被动执行与动态结晶引擎**——给出可直接排期开发的落地设计。

---

### 3.1 深度拆解一：Onboarding 与外部工单自动化——“参数自动推导 + 浏览器一次示范录制 + 本地 AI 沉淀为确定性脚本/Bookmarklet”

#### 1. 为什么这是 Onboarding 自动化的第一优先级（P0）？
一个应用上 AWS 要走 20 多步、跨 7 个以上系统（企业登记、CMDB、SailPoint、EntraID、ServiceNow、GitHub、Harness、TFE、AWS 账号、CyberArk/Vault、Black Duck/Veracode）。
- **现实痛点**：在强监管银行，向安全与各平台部门申请一个能跨 7 个系统代人提权、自动建单的后端高权限 Service Account API，光走审批流程就要数月；而且部分内部门户（如邮件组申请、SCIM 同步请求、部分自助门户）根本没有公开 API。
- **核心洞察**：这 20 多步的**表单结构是固定的**，且 **90% 以上的填写内容（组名、项目名、Workspace 名、环境后缀、角色矩阵、关联 ARN）完全遵循企业固定命名规范**！这意味着：只要用户在浏览器里示范点填一次，让本地 AI 看懂“用户刚才填的字符串对应应用上下文里的哪个变量”，就能立即生成 **100% 确定性的填表脚本 / Bookmarklet**，让后面 77 个应用在 1 秒内完成自动填单！

#### 2. “参数推导 + 一次录制 + 本地 AI 结晶 + 确定性重放”五步落地架构

```text
+---------------------------------------------------------------------------------------------------+
| Step 1: Factory 参数推导引擎 (Parameter Derivation Engine)                                        |
| 输入: App元数据 (AppID/缩写/Wave/负责人/改造项) + 前序步骤产物 (如已生成的 Repo URL / AWS 账号ID) |
| 规则: 加载 policies/naming-and-derivation.yaml                                                    |
| 输出: 该应用专属的标准化参数包 `AppOnboardingPayload.json` (含全部 20+ 步的字段键值与预填邮件正文)|
+---------------------------------------------------------------------------------------------------+
                                                 │
                      ┌──────────────────────────┴──────────────────────────┐
                      ▼ 【首次探路：仅第 1 个应用做一次】                    ▼ 【后续复用：第 2～78 个应用直接跑】
+----------------------------------------------------+    +-----------------------------------------+
| Step 2: 浏览器一次示范录制 (User Demo Recording)   |    | Step 5: 确定性一键填表与回执抓取        |
| • 工程师在已登录企业 SSO 的浏览器开启轻量录制器    |    | • 工程师打开已登录门户，点击书签栏上的  |
|   (浏览器扩展 或 本地 `factory-runner record`)     |    |   `[Factory 一键填单]` Bookmarklet      |
| • 人工正常点击、选下拉框、输入一次表单并提交       |    |   (或运行本地确定性 Playwright 脚本)    |
| • 本地捕获结构化 `ActionTrace.json` + 精简 DOM 树  |    | • 脚本拉取当前应用的 Payload JSON，按   |
|   (自动过滤密码与敏感 Cookie，无需多模态视觉模型)  |    |   确定性选择器 1 秒填满 20+ 个字段      |
+----------------------------------------------------+    | • 高亮已填项，工程师肉眼确认后点 Submit |
                          │                               | • 自动提取页面生成的工单号 (RITM/CHG)   |
                          ▼                               |   回传 Factory Core 开启审批状态追踪    |
+----------------------------------------------------+    +-----------------------------------------+
| Step 3: 本地 AI 分析与参数化提炼 (Local AI)        |                      ▲
| • 本地 AI 对比 `ActionTrace` 中的用户输入字面量    |                      │
|   与 `AppOnboardingPayload.json`                   |                      │
| • 自动完成反向变量绑定：                           |                      │
|   如识别出输入值 `"IMSW-APP01-AWS-DEV-RO"`         |                      │
|   == 模板变量 `"${org}-${app_code}-AWS-${env}-RO"` |                      │
| • 清洗脆弱动态 ID，合成为多级稳健 DOM 选择器       |                      │
+----------------------------------------------------+                      │
                          │                                                 │
                          ▼                                                 │
+----------------------------------------------------+                      │
| Step 4: 自动生成确定性资产并提 Git PR 沉淀         |──────────────────────┘
| • 编译生成声明式 `FormRecipe.json`                 |  (GitHub PR 审核合入 `capabilities/browser/`)
| • 自动打包出可分发的 `Bookmarklet.js` 与           |
|   `playwright-fill.spec.ts` 确定性脚本             |
+----------------------------------------------------+
```

#### 3. 工程实现细节（怎么写代码落地？）

1. **参数推导引擎（`naming-and-derivation.yaml`）**：
   在 Git 仓库中用纯声明式规则定义所有衍生变量，例如：
   ```yaml
   # policies/naming-and-derivation.yaml 示例
   variables:
     devops_groups:
       dev: "ENT-${app_code}-DEVOPS-DEV"
       lead: "ENT-${app_code}-DEVOPS-LEAD"
       sqa: "ENT-${app_code}-DEVOPS-SQA"
       secret_admin: "ENT-${app_code}-VAULT-ADMIN"
     aws_groups:
       per_env: ["ENT-${app_code}-AWS-${env}-RO", "ENT-${app_code}-AWS-${env}-VIEW"]
     tfe_workspaces:
       per_env: "ws-${app_code}-${env_lower}-main"
   ```
   不仅Onboarding 的 20+ 步，连 7 项改造所需的防火墙工单（源/目的网段、端口）、Oracle 账号工单、AutoSys 作业注册单、文件传输通道单，全部由该引擎结合**依赖账本**自动算出完整参数 JSON。

2. **轻量级浏览器录制器（`Factory Recorder`）**：
   - **实现方式**：一个仅百余行代码的受控 Chrome/Edge 内部扩展（Content Script），或通过本地 `factory-runner record <step-id>` 启动带录制脚本的本地浏览器窗口。
   - **录制内容（纯文本结构化，完全不需要多模态视觉大模型）**：监听页面的 `change`、`input`、`click`、`submit` 事件。每当用户操作一个表单控件时，记录：
     ```json
     {
       "action": "fill",
       "inputValue": "ENT-TRADE01-AWS-DEV-RO",
       "elementMeta": {
         "tagName": "INPUT",
         "name": "IO:8a4f2c1b",
         "ariaLabel": "Group Name",
         "associatedLabelText": "Requested AD Group Name *",
         "cssPath": "form#sc_cat_item input[name='IO:8a4f2c1b']",
         "xpath": "//label[contains(text(),'Requested AD Group Name')]/following::input[1]"
       }
     }
     ```
   - 当用户点击提交跳转到成功页面並框选生成的工单号（如 `REQ0098123`）时，额外记录一条 `extract_receipt` 规则（记录工单号所在 DOM 节点的正则与选择器）。

3. **本地 AI 分析器（Local AI Parameterizer）如何自动沉淀脚本？**
   - 录制一结束，本地 CLI 调用大模型（输入：`ActionTrace.json` + 当前应用的 `AppOnboardingPayload.json`），执行 Prompt 任务：
     - **任务 1（变量参数化）**：将 `inputValue: "ENT-TRADE01-AWS-DEV-RO"` 自动替换为参数引用 `"{{payload.aws_groups.DEV.ro}}"`；
     - **任务 2（选择器择优）**：针对 ServiceNow 等内部系统常见的动态 ID，优先选用基于语义文本的定位器（如 `labelText: "Requested AD Group Name *"` + `ariaLabel` + `name` 兜底），生成一份可读、可维护的 **`FormRecipe.json`**；
     - **任务 3（编译为确定性执行器）**：根据 `FormRecipe.json` 自动编译生成：
       - **Bookmarklet / 扩展一键填充器**：不调用任何 AI，纯确定性 JavaScript DOM 操作，遍历 `FormRecipe` 的字段列表填入当前应用的 Payload 值，处理级联下拉框等待（`MutationObserver`），并将已填字段边框标为绿色供用户核对；
       - **批量循环支持**：像“在 SailPoint 一口气建 10 个权限组”或“在 TFE 建 DEV/UAT/PROD 3 个 Workspace”，确定性脚本支持读取数组参数自动循环填写，每次到最后一步暂停或由用户批量确认。

4. **自愈与平滑演进机制**：
   - **字段自愈**：若半年后 ServiceNow 某个表单改版新增了一个必填项，确定性脚本执行时会高亮提示“发现 1 个未映射必填项”，工程师只需手动填一下该字段，本地录制器增量捕获这 1 个字段并由本地 AI 更新 `FormRecipe.json` 提 PR 即可。
   - **向后端 API 平滑过渡**：`Onboarding Tracker` 的步骤定义与具体执行方式解耦。早期 `execution_mode: browser_script`，后续某系统的 Service Account API 审批通过后，只需将配置改为 `execution_mode: api_connector`，上层状态机与排队计时完全无需改动。

---

### 3.2 深度拆解二：第 0 号工作包 `WP-00-Legacy-Baseline`（旧系统可复现构建与基线采集/双跑比对包）

#### 1. 核心目标：把“建基线”从一道卡人的行政命令，变成一套一键运行的工程工具
试点中团队之所以绕过“可复现构建 → 旧系统基线 → 改造”，是因为面对运行在 Solaris / Windows + Sybase 上的陈年老系统，手工梳理编译依赖和抓取对比数据极其痛苦。`WP-00` 必须作为全厂优先级最高的工程工具包交付，由四个具体工具模块组成：

```text
+---------------------------------------------------------------------------------------------------+
|                              WP-00-Legacy-Baseline 四大工程模块                                   |
+---------------------------------------------------------------------------------------------------+
| [模块 1: 旧构建探针与依赖封存器]  --> 扫描 Makefile/Ant/Shell，抓取源码外游离依赖归档至 Artifactory|
| [模块 2: 多模态业务基线采样器]    --> 按 批处理(Batch) / 联机(Online/MQ) / 存储过程 分类抓取快照   |
| [模块 3: 确定性脱敏与黄金样本库]  --> 保持主外键与金额守恒脱敏，存入受控 S3，SHA256 写入证据账本   |
| [模块 4: 双跑回放与智能降噪比对]  --> 新环境回放输入，确定性规则滤除时间戳噪音 + AI 分诊真实差异   |
+---------------------------------------------------------------------------------------------------+
```

#### 2. 四个模块的落地实现方案

1. **模块 1：旧构建探针与依赖封存器（`legacy-build-capturer`）**
   - **解决痛点**：老应用常依赖旧 Solaris/Windows 编译机上散落的系统库、未入 Maven/Artifactory 的本地 `.jar/.so/.dll` 或特定环境变量，换台机器就编译不过。
   - **落地方式**：
     - 提供无侵入追踪脚本（Linux/Solaris 下基于 `strace / truss / dtrace` 或构建日志解析，Windows 下基于 Process Monitor 日志解析），在旧构建机跑一次构建，自动识别出所有被读取但不在 Git 仓库内的外部头文件、静态/动态库、Jar 包与编译器版本。
     - 脚本自动将这些游离依赖打包上传至 Artifactory 的 `legacy-frozen-deps/<app-id>/` 仓库，并生成锁定的 `BuildEnvironmentManifest.json` 与构建封装脚本。
     - **过关标准**：在隔离构建节点拉取 Git 源码与 Artifactory 依赖，执行封装脚本能 100% 复现构建，并将产物的二进制特征/符号表哈希记入 Factory 账本。

2. **模块 2：三类业务形态的标准化基线采样器（`legacy-baseline-sampler`）**
   针对托管银行老应用的三种典型架构形态，提供三套即插即用的采集工具：
   - **形态 A：AutoSys 日终/定时批处理作业（占比最高，最易标准化）**
     - 提供 `batch-wrapper.sh`：在旧测试/准生产环境或生产影子跑批前，自动根据依赖账本导出该作业读取的 **Sybase 前置表数据快照（Before-State Snapshot）**、**上游输入文件（MFX/NAS）**、**命令行入参及批次日期（BizDate）**；
     - 作业执行完成后，自动导出 **Sybase 目标写入表的变更后快照（After-State Snapshot / 增量行）**、**生成的报表/对账文件**、**标准输出日志与退出码（Exit Code）**。
   - **形态 B：联机交易 / Socket / HTTP / 消息队列服务（Online & MQ）**
     - 对 MQ 驱动应用：通过配置 MQ 镜像/分流或消息导出脚本，录制指定时间窗口内的输入消息磁带（`InputMessageTape`）与输出消息磁带（`OutputMessageTape`）；
     - 对 HTTP/Socket 应用：提供轻量级流量录制代理（或基于 tcpdump 报文重组脚本），录制请求序列与响应序列。
   - **形态 C：重度数据库内嵌逻辑（Sybase 复杂存储过程与触发器）**
     - 结合 DBA 审计日志，抓取存储过程调用名称、输入参数绑定值序列及返回结果集/游标输出。

3. **模块 3：合规脱敏与黄金样本封存器（`baseline-sanitizer-sealer`）**
   - **合规硬约束**：业务数据、数据抽取文件严禁进入 Git 代码仓库。
   - **落地方式**：采样数据经过本地确定性脱敏管道（對客户姓名、证件号、银行卡号做基于固定 Salt 的格式保留哈希替换，**严格保持主外键关联一致性与金额/份额数值字段原样不变**），打包生成 `BaselineBundle.tar.zst`。
   - 脚本自动将该压缩包上传至与 Factory 同处于 AWS 环境、开启了 **S3 Object Lock（WORM 防篡改）** 的专用存储桶 `s3://factory-baselines/<app-id>/<baseline-id>/`，并将返回的 S3 版本 URI、数据集行数统计、Schema 摘要及 **SHA256 签名** 通过 API/MCP 写入 Factory 的证据账本。此时，该应用的 `旧系统基线` 检查项自动变绿，解锁 `Build` 阶段。

4. **模块 4：确定性双跑回放与两级降噪比对引擎（`dual-run-differ`）**
   当应用完成 Linux / Oracle 等改造部署到 AWS `UAT` 环境（以及后续 `Prod parallel` 阶段）时，如何证明结果等价？
   - **自动回放**：回放脚本从 S3 拉取 `BaselineBundle`，将前置快照恢复到 UAT 的 Oracle 数据库中，注入相同的输入文件/报文（并使用 `libfaketime` 或应用批次日期参数对齐业务时钟），触发新系统运行。
   - **第一级：确定性规则降噪比对（Deterministic Diffing）**：
     比对工具逐表（按业务主键对齐）、逐文件、逐报文比对新系统输出与旧系统 Golden Master，自动应用 `diff-rules.yaml` 剔除已知合理差异：
     - 忽略显式声明的系统生成列（如 `last_modified_ts`, `audit_seq_id`, `host_name`）；
     - 归一化跨数据库格式差异（如 Sybase 与 Oracle 默认日期字符串格式、换行符 `\r\n` vs `\n`、无 `ORDER BY` 查询结果集先按主键排序再比对）；
     - 校验数值容差（如监管报表金额字段要求误差 $= 0.00$，中间浮点计算列允许配置容差 $\le 10^{-9}$）。
   - **第二级：AI 差异分诊与根因定位（AI Diff Triage — 只做分诊，不做决定）**：
     若确定性比对发现非零差异（例如 10 万条结算记录中有 37 条的利息字段相差 `0.01`，且属于同一交易类型），后台主动拉起 **`Diff Triage Worker`**：
     - 自动将这 37 条差异记录按特征聚类为 1 个差异簇（Cluster），而不是抛给工程师 37 条孤立报错；
     - 自动检索该表/该字段在本次改造中的 SQL/代码 Git Diff（例如定位到 `interest_calc.sql` 中将 Sybase 的 `CONVERT(numeric(18,2), ...)` 改成了 Oracle 的 `ROUND(...)`，导致截断变四舍五入）；
     - 生成包含**差异分布、疑似引入该差异的代码行号及修复建议**的分诊报告推送至控制台，由工程师修复代码，或由 SME 签字确认该差异符合新规范。

---

### 3.3 深度拆解三：Super Harness（主动/被动双模 Agent 执行引擎 + 四级动态结晶飞轮）

#### 1. Super Harness 的工程定义与五层落地架构
在本项目中，**Super Harness** 不是一个取代人的全权自治黑盒，而是 **“让 AI 持续参与真实交付全过程：主动响应事件、按标准上下文执行探索与改造、经确定性沙箱自检后交付草稿，并将每一次实战解决的问题自动结晶为全厂可复用的确定性工具”** 的工程运行体系。

其内部由五层可落地的软件模块构成：

```text
+---------------------------------------------------------------------------------------------------+
|                                   Super Harness 五层工程架构                                      |
+---------------------------------------------------------------------------------------------------+
| Layer 1: 事件总线与持久化调度层 (PostgreSQL Durable Task Queue + Webhook Listeners)               |
|          监听: 立项事件 · GitHub PR/Push · Harness 红绿灯 · Jira/SNOW 状态变更 · 横向 Campaign     |
+---------------------------------------------------------------------------------------------------+
| Layer 2: 动态上下文组装器 (Context Assembler)                                                     |
|          组装: 应用评估档案(Assessment) + 依赖账本 + 绑定版本 SKILL.md + 匹配 Recipes + 安全策略   |
+---------------------------------------------------------------------------------------------------+
| Layer 3: 双模多运行时执行层 (Pluggable Execution Plane)                                           |
|   • [后台主动 Push] Headless Agent Workers (基于开源 DeepSeek Harness SDK / Devin / AWS Transform) |
|     - Discovery Worker (自动扫描评估)       - Campaign Worker (跨仓批量应用 Recipe)               |
|     - Auto-Triage Worker (红灯自动诊断试修)  - Crystallization Worker (Red→Green 自动结案与提炼)   |
|   • [前台被动 Pull] Factory MCP Server (挂载于工程师本地 IDE Copilot / Cursor / Claude)           |
+---------------------------------------------------------------------------------------------------+
| Layer 4: 执行与验证分离的沙箱自检环 (Deterministic Sandbox Verification Loop)                     |
|          Agent 改码 → 沙箱自动跑编译/单测/扫描/局部比对 → 失败回喂重试(≤3次) → 通过才交出草稿 PR  |
+---------------------------------------------------------------------------------------------------+
| Layer 5: 四级动态结晶流水线 (Dynamic Crystallization Pipeline)                                    |
|          Case (Jira Problem) ──► Recipe (转换配方) ──► Skill (技能包) ──► Deterministic Script    |
|          (通过自动向 `migration-factory` 仓库发起 GitHub PR + 样本回归 CI 测试完成审核与发布)      |
+---------------------------------------------------------------------------------------------------+
```

#### 2. 五层模块的工程落地细则

1. **Layer 1：基于 PostgreSQL 的持久化事件与任务调度（零额外基建）**
   - 在 Factory Core 的 PostgreSQL 中建立 `harness_events`（事件收件箱）与 `harness_tasks`（持久化任务队列，使用 `SELECT ... FOR UPDATE SKIP LOCKED` 实现并发安全消费、指数退避重试与超时 Watchdog 恢复）。
   - **主动触发规则表（Event-to-Worker Mapping）**：
     - `Event: MigrationRun.Created` $\rightarrow$ 派发 `Discovery Worker`（只读克隆应用仓库，执行全量探测脚本与 AI 评估，产出 `Application Assessment` 草稿）+ 派发 `Parameter Engine`（生成 20+ 步 Onboarding 参数包）。
     - `Event: Harness.BuildFailed / ScanFailed / DiffFailed (Red)` $\rightarrow$ 派发 `Auto-Triage Worker`（抓取错误日志、匹配已知 `Recipe`、诊断根因并附上修复补丁草稿）。
     - `Event: Harness.Recovered (Red → Green)`（同一工作包关联的检查从失败变为通过，且中间伴随修复 Commit/PR）$\rightarrow$ 派发 `Crystallization Worker`（自动提炼问题闭环写入 Jira，并评估是否生成新 `Recipe` PR）。
     - `Event: Campaign.Launched` $\rightarrow$ 批量派发 `Campaign Worker`（对目标应用列表并行应用指定 `Recipe`）。
     - `Event: Ticket.Approved / Gate.Passed` $\rightarrow$ 自动计算解锁下一批工作包，准备所需上下文并通知对应责任人。

2. **Layer 2：上下文组装器（`Context Assembler` — 解决“Agent 不懂老系统和企业规矩”）**
   无论是后台拉起一个 Headless Worker，还是工程师在 IDE 里通过 MCP 调用 `get_task_context(task_id)`，Factory 都会实时动态组装一份标准化的 **`ContextBundle`**：
   - **`app_context.json`**：当前应用的语言/框架、目标部署形态（ECS/EC2）、**从依赖账本导出的库表/AutoSys 作业/文件传输清单**、以及 `WP-00` 基线的引用位置；
   - **`SKILL.md` 与匹配的 `Recipes`**：当前工作包绑定版本的标准操作指南，以及根据当前仓库扫描特征自动匹配出的 `capabilities/recipes/` 转换规则；
   - **`guardrails.md`（安全红线声明）**：明确列出禁止修改的目录（如验收测试与基线断言目录）、禁止引入的文件类型（`.mp4`, `.session`, `.dump`, 明文 `.pem/.key`）、PR 行数上限，以及必须附带的 Git Commit Trailer 格式（`Migration-Task-ID`, `AI-Tool`, `AI-Model`）。

3. **Layer 3：多 Agent 运行时如何统一接入？（DeepSeek Harness、Devin、Copilot、Blitzy、AWS Transform）**
   不强求所有 AI 工具变成同一种 Agent，而是通过**“统一的任务输入包（ContextBundle）+ 统一的结果回收契约（GitHub PR + 审计事件）”**分三类接入：
   - **类型 A（自托管后台主动运行时 —— 推荐基于 DeepSeek Harness Headless SDK）**：
     利用 DeepSeek Harness 的 *Everything is a Plugin* 与 Headless SDK 能力（剥离对话 UI，保留 Agent Loop、工具沙箱、事件钩子与插件机制），封装为跑在 AWS ECS 上的无状态容器 Worker。Factory Core 通过队列下发 `ContextBundle`，Worker 在只读或临时分支沙箱中自主完成代码扫描、日志诊断、Recipe 提炼，完成后通过内部 API 回报结构化 JSON 结果并销毁容器。
   - **类型 B（具备远程任务 API / CLI 的外部平台 —— Devin、AWS Transform Custom）**：
     通过薄适配器（Adapter）将 `ContextBundle` 转化为 Devin Session API 调用或 AWS Transform Custom 的 Campaign 执行命令；对于跨 58 个 As-Is 应用的大规模同构语言/框架升级（如 Java/Spring 版本升级或标准 SQL 改写），可直接调用 AWS Transform Custom 或 OpenRewrite 引擎执行，由 Factory 回收其生成的 PR。
   - **类型 C（IDE 交互工具与无 API 平台 —— GitHub Copilot、Blitzy）**：
     - **Copilot / Cursor / Claude Code**：在工程师本地 IDE 中配置 `Factory MCP Server`，直接拉取 `ContextBundle` 并在编码过程中调用本地验证脚本；
     - **Blitzy（仅用于 Modernize）**：若 Blitzy 提供 API 则按类型 B 接入；若无 API，则由工程师从 Factory 一键导出 `.factory-context/` 规范包作为 Blitzy 的输入上下文，并在 Blitzy 生成 PR 合入 `Develop` 时，由 Factory 的 GitHub Webhook 解析 PR 描述中的 AI 工具/模型声明并执行相同的关卡扫描与基线验证。

4. **Layer 4：执行者与验证者分离的“沙箱自检环”（借鉴 Bun 与 CTBC 实践）**
   - 当后台 Worker 或本地 Agent 完成代码修改准备提 PR 前，必须先运行工作包内置的本地确定性验证脚本（`factory-runner verify`）：
     $$\text{语法与编译检查} \longrightarrow \text{单元测试} \longrightarrow \text{密钥与脏文件黑名单检查} \longrightarrow \text{Detector 残留项复查}$$
   - 若验证失败，错误输出直接作为反馈回喂给当前 Agent 进行自动修复（最多允许循环重试 $N=3$ 次）；只有通过确定性自检的改动才允许生成正式 PR 提交给人类工程师 Review，大幅降低人类的无效审阅负担。

5. **Layer 5：四级“动态结晶（Dynamic Crystallization）”流水线的 5 步落地实现**
   这是让 Factory 越跑越快、把“探索”变成“工具”的核心飞轮：

   | 结晶步骤 | 触发条件与执行主体 | 具体工程动作与产出物 |
   | :--- | :--- | :--- |
   | **Step 1: 自动捕获（Case 生成）** | **触发**：Harness 构建/扫描/双跑比对失败后被修复变绿（`Red → Green`），或 Agent 调用 MCP `log_migration_problem`，或 Onboarding 预检失败。<br>**主体**：`Crystallization Worker` | 自动抓取**红灯时的报错堆栈/日志片段 + 变绿 PR 的 Git Diff 与 Commit 说明**，先在 Jira 中检索是否已有同特征 `Migration Problem`；若无则自动创建，若有则追加关联。自动填入 AI 提炼的 `Problem → Context → Investigation → Solution → Verification` 草稿，工程师仅需在控制台或 Jira 点一下“确认”。 |
   | **Step 2: 聚类与泛化判断** | **触发**：某个 `Migration Problem` 获得验证通过（Verified），且同类错误特征出现 $\ge 2$ 次（或被工程师标记为“高复用价值”）。<br>**主体**：`Crystallization Worker` | Worker 读取该问题关联的 1～N 个真实修复 Diff，分析能否剥离特定应用的业务变量，泛化出通用的**探测模式（Detector Pattern）**与**转换逻辑（Transform Logic）**。 |
   | **Step 3: 自动生成候选资产（Recipe / Skill / Script）** | **主体**：`Crystallization Worker` | 根据问题成熟度，自动生成对应层级的资产文件：<br>• **Level 2 (`Recipe`)**：在 `capabilities/recipes/` 下生成 YAML/Markdown 配方（含匹配正则/AST 规则、修改前后代码模板、验证断言）；<br>• **Level 3 (`Skill`)**：更新对应工作包的 `SKILL.md` 與 `known-solutions/` 索引；<br>• **Level 4 (`Deterministic Script`)**：若属于完全固定的文本/AST 替换或环境预检，直接生成 Python/Shell/OpenRewrite 确定性脚本。 |
   | **Step 4: 自动提 GitHub PR 与沙箱回归测试** | **主体**：`Crystallization Worker` + GitHub Actions CI | Worker 自动向 `migration-factory` 仓库发起一个 **Capability Upgrade PR**（标题如 `feat(wp-07-linux): crystallize recipe for Solaris ksh array syntax`），附上源 Jira Problem 与验证构建链接。<br>仓库 CI 自动拿刚生成的 Detector 和 Recipe 在测试样本集上跑正反例测试，确保无语法错误与误伤。 |
   | **Step 5: 架构师 Review 发布与横向广播** | **主体**：架构师 / 平台骨干（人类决定） | 架构师在 GitHub PR 中审查 Diff、点击 Merge 并发布新版本 Tag。<br>**AI 绝不能不经人工批准直接改写正式生产规则**。新版本发布后，Factory 自动扫描其余在途应用，提示：“发现另外 14 个 As-Is 应用命中新发布的 `ksh-array` Recipe，是否一键发起横向 Campaign？” |

---

### 3.4 全链路自动化与人机职责边界矩阵

将四类责任（**确定性脚本全自动、后台主动 Worker、前台被动 MCP、参数推导+录制填表/API 等外部审批、人类决策**）严格分开：

| 迁移阶段与工作项 | 1. 确定性脚本 / 工具全自动执行 | 2. 后台主动 Worker (Push) | 3. 前台交互 Agent (MCP Pull) | 4. 自动推导参数 + 录制脚本/API 发起 + 等外部审批 | 5. 必须由人类作出的决定与操作 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **立项与 Discovery** | • 静态扫描 SQL/JIL/配置提取依赖<br>• **交叉比对 Sybase 运行时审计日志**识别未登记读取方 | • 自动拉起 `Discovery Worker` 生成结构化 `Application Assessment` 与 7 项改造适用矩阵草稿 | • 工程师在 IDE 交互式查询特定复杂模块的调用链 | • 用推导参数 + P0 填表脚本/API 发起旧库只读账号与旧主机访问工单 | • 架构/应用 Owner 确认存疑依赖与表所属 Wave<br>• 确认最終改造适用范围 |
| **Onboarding (20+ 步)** | • **参数推导引擎**算出全部 20+ 步字段值與邮件正文<br>• **P0 Bookmarklet / 确定性脚本** 1 秒自动填单与抓取单号<br>• 环境就绪预检探针（Pre-flight Check） | • 首次录制后，**本地 AI 自动分析轨迹并生成确定性填表脚本 PR**<br>• 前序工单获批后自动解锁并准备下一步 | — | • 批量发起 SailPoint 组、SNOW 组映射/TFE/AWS/CyberArk 等请求，实时追踪排队天数 | • 首应用录制时人工示范点填一次<br>• 后续应用肉眼核对已填表单并点 Submit<br>• **外部合规角色在原系统完成审批** |
| **可复现构建与旧基线 (`WP-00`)** | • 构建探针抓取游离依赖归档 Artifactory<br>• 采样器抓取批处理/联机输入与 Golden Master 输出，脱敏上传受控 S3 并登记 SHA256 | • 构建失败时自动诊断缺失库或环境变量差异 | • 辅助编写复杂老系统的构建封装脚本 | • 发起基线采集所需的测试环境或只读抽数工单 | • 应用负责人与 QE 确认旧系统基线数据集代表性与完备性 |
| **Modernize 业务规则提取** | • 语法树切分、调用图生成、关联基线样本数据 | • 批量逆向 COBOL/C++/PB，按**“业务域 → 交易流/批处理 → 三段式表”**生成规则草稿 | • 根据 SME 批注交互式修正存疑规则与新架构代码 | — | • **SME 在控制台 `Action Inbox` 批量勾选确认或驳回业务规则** |
| **7 项平台改造实施** | • 本地 `pre-commit` 与组织级 Push Protection 拦密钥/录屏/会话文件<br>• 成熟 `Recipe` / AST 脚本确定性批量改写代码与配置 | • **横向 Campaign Worker** 跨数十个仓库批量应用 `Recipe` 生成 PR 草稿<br>• **Auto-Triage Worker** 监听红灯自动诊断试修 | • 工程师用 Copilot/Devin 经 MCP 拉取 `Skill` 与上下文，完成复杂改造与测试补充 | • 自动推导并批量发起 Vault、Oracle、文件通道、AutoSys、防火墙、DNS 工单 | • 密钥管理员将真实密钥值填入 Vault/CyberArk<br>• **非作者且非 Agent 发起人的工程师在 GitHub 完成独立 Review** |
| **问题闭环与能力结晶** | • 自动校验 `Red → Green` 状态转换与样本回归 CI 测试 | • **`Crystallization Worker`** 自动写 Jira `Migration Problem` 草稿，并向 Git 仓库提 PR 建议新 `Recipe/脚本` | • Agent 遇阻塞时通过 MCP Hook 自动上报问题上下文 | — | • 工程师一键确认 Jira 问题总结<br>• **架构师在 GitHub PR 中审查合并新 Recipe/Skill** |
| **验证、发布与生产切换** | • `WP-00` 双跑比对器自动比对新旧输出并滤除格式噪音<br>• 对账 UAT 与 PROD 制品 SHA256 一致性，巡检绕过部署 | • **`Diff Triage Worker`** 对非零数据差异做聚类与代码 Diff 根因定位 | — | • 自动汇总证据包，发起单应用或 **Wave 级批量 ServiceNow Change 工单** | • 人在控制台发起 `Develop → Release → master` PR 并合并<br>• SME/QE 签字确认验证结果；批准豁免<br>• **授权人员在 Harness 执行 PROD 部署** |

---

## 第四部分：发布控制、阶段关卡与安全合规设计

### 4.1 阶段关卡的最低证据要求

每道关卡由 Factory 根据外部系统采集的确定性证据自动计算，**绝不提供“手动标为通过”的按钮**：

| 阶段关卡 | 准出必须满足的核心证据（Minimum Required Evidence） | 规则出处与 Owner |
| :--- | :--- | :--- |
| **`Intake → Discovery`** | CMDB 应用 ID 已登记；代码仓库已关联；`WP-Onboarding` 已启动并生成参数包。 | PMO / 平台组 |
| **`Discovery → Spec`** | `Application Assessment` 已生成；依赖账本（库表、作业、文件、队列）已完成静态扫描与 DB 运行时日志交叉核对，且未知依赖已由人工确认；7 项改造适用矩阵已锁定。 | 架构委员会 |
| **`Spec → Build`（关键硬卡口）** | 1. **旧系统可复现构建已验证通过**（Artifactory 有构建清单记录）；<br>2. **`WP-00` 旧系统基线（Golden Master）已采集并登记有效 SHA256 签名**；<br>3. （Modernize 专属）核心业务规则已获 SME 在控制台签字确认。 | 架构委员会 / 测试工作组 |
| **`Build → Verify`（即发起 `Develop → Release` PR 关卡）** | 1. 所选改造工作包关联的 Jira Task 与前置基础设施工单已就绪；<br>2. 合入 `Develop` 的所有 PR 均具备**非作者且非 Agent 发起人的独立人工 Review**，无超规模未拆分 PR，且 100% 声明了所用 AI 工具与模型；<br>3. 代码仓库中**零明文密钥、零生产业务数据、零 `.mp4` 录屏与 Agent 会话文件**；<br>4. Harness 构建、单测覆盖率、SAST（Veracode）、SCA（Black Duck）、容器镜像扫描全部通过。 | 企业 SDLC / 信息安全 / 模型治理 |
| **`Verify → Prod parallel / Cutover`** | 1. 唯一 Release 制品已在 `UAT` 部署，且 **`WP-00` 双跑回放比对报告无未解释差异**（QE 与 SME 已签字）；<br>2. 所有环境均由 Terraform Enterprise 使用私有 Registry 合规模块创建，且 **Drift Detection（漂移检测）为零**；<br>3. 监控、日志告警与自动回退脚本已在 UAT 验证通过。 | 测试工作组 / SRE / 架构委员会 |
| **`Cutover`（生产切换放行关卡）** | 1. **“数据先到，应用再走”硬锁校验通过**：依赖账本中该应用读写的所有共享数据库表，其所属迁移 Wave 状态均为 `已切换就绪`；<br>2. （若需生产并行）连续并行无差异周期已满（如 3 个月或经批准的缩短窗口）；<br>3. ServiceNow 生产 Change 工单已获批，且运维交接与供应商知识移交已签字。 | 数据库工作组 / 运维团队 / Change 委员会 |
| **`Decommission`（退役完成关卡）** | 依赖账本确认无任何下游应用仍指向该旧实例；历史数据归档已验证；旧机房服务器与旧库账号已清理，CMDB 核销工单已关闭。 | 机房退出组 / 运维团队 |

---

### 4.2 三分支发布晋级机制、热修复路径与同制品对账

针对“应用团队不能自配 GitHub 分支保护”、“目前只有 DEV 环境、发布分支未用过”以及“确保上线的就是 UAT 验证过的同一个制品”，建立如下控制链：

```text
[功能/Agent分支] ──(1. 本地pre-commit + 组织级Push Protection拦截密钥/录屏/大文件)
                 ──(2. 经独立人工Review合入; PR模板强制声明AI工具与模型)
                        │
                        ▼
                   [ Develop ] ──(Harness 触发开发构建)──► 部署至 DEV 环境
                        │
                        │ (3. 人在 Factory 控制台点击“发起 Release 晋级”)
                        │ (4. Factory 核验: 旧基线已锁 + Develop全部Commit具独立Review且合并人≠作者/Agent发起人
                        │     + 无脏文件 + 扫描全绿 → 用 Factory Service Account 创建 Develop → Release PR)
                        ▼
                   [ Release ] ──(5. 人工合并后，Harness 只触发唯一一次 Release 构建!)
                        │      ──(6. 产出唯一不可变制品写入 Artifactory，记录 Artifact SHA256)
                        │
         ┌──────────────┴───────────────────────────────┐
         ▼                                              ▼
  部署至 UAT 环境                                部署至 PROD 环境
 (Factory 用 Service Account                    (校验上游 DB Wave 就绪 + Change 获批;
  调 Harness 自动触发;                           由授权人员在 Harness 中引用 Factory 证据包 ID 执行;
  运行 WP-00 双跑比对验证)                       严禁重新编译构建，强制拉取 UAT 同一个 Artifact SHA256!)
                                                        │
                                                        │ (7. Factory 对账 PROD 运行制品 SHA256 与 UAT 完全一致后，
                                                        │     由人在控制台点击发起 Release → master 归档 PR)
                                                        ▼
                                                   [ master ] (生产当前运行版本的只读权威账本)
```

1. **关于 `master` 分支与紧急热修复（Hotfix）路径的明确规则**：
   - **`master` 分支定位**：严格作为**记录 PROD 当前正在运行版本的权威账本**。只有已在 PROD 成功部署且通过 Factory 制品一致性对账的版本，才能由人在 Factory 点击发起 `Release → master` PR 合入；日常默认不从 `master` 触发构建。
   - **紧急热修复（Hotfix）怎么走？** 若生产发生紧急缺陷需立刻修复且当时 `Develop` 分支已合入下一期的未完成代码：
     - 从当前代表生产版本的 `master`（或 `Release` 当前生产 Tag）拉出 `hotfix/*` 分支进行修复；
     - 经独立人工 Review 后合入 `Release` 分支，由 Harness 构建生成新的唯一候选 Release 制品；
     - **铁律不放松**：该热修复制品**依然必须先部署到 `UAT` 环境通过快速冒烟与基线验证，随后将同一个制品（相同 SHA256）部署至 `PROD`**；
     - 上线对账完成后，同步合入 `master` 并逆向合回（Back-merge）`Develop`。
2. **不能回避的控制缺口与三道防线补齐**：
   - **防线一（Push 前）**：工作包初始化时自动在本地仓库安装 `git pre-commit` 钩子，并推动 GitHub 管理员在 Org 级开启全局 Push Protection，在 `git push` 阶段直接拒掉密钥、`.mp4` 录屏、Agent 会话文件与超大二进制包（防止污染 Git 历史）。
   - **防线二（进 Release 前）**：虽然不能阻止有人在 GitHub 上直接往 `Develop` 违规合并 PR，但因为 **`Develop → Release` 的发布 PR 只能由人在 Factory 上点击、通过 Factory Service Account 发起**，一旦 Factory 检测到 `Develop` 中存在自合自改或无独立 Review 的提交，立即锁死发布按钮，强制团队补齐独立 Review commit 后才放行。
   - **防线三（上 PROD 时与事后对账）**：推动平台 Pipeline 工作线在 Harness 生产部署模板中加入一个前置 `HTTP Verification Step`（自动回调 Factory 接口校验 `release_evidence_id` 与 `artifact_sha256` 是否已在 UAT 验证通过）；同时 Factory 后台每 15 分钟对账 Harness 部署记录与 Artifactory 制品哈希，一旦发现任何绕过 Factory 的违规部署或制品不一致，立即触发最高级别合规告警。

---

### 4.3 共享核心数据库“数据先到，应用再走”的双源依赖锁

58 个 As-Is 应用紧密耦合在同一个核心 Sybase 数据库上，且存在未登记的直连读取方。Factory 通过**“双源交叉发现 + Wave 状态硬锁”**防止切换踩空：
1. **静态扫描 + 数据库运行时日志双源交叉核验**：
   - **源 1（代码侧）**：Detector 扫描源码、SQL 脚本、MyBatis/Hibernate 配置、AutoSys 作业脚本，提取应用声明访问的表集合 $T_{\text{code}}$；
   - **源 2（数据库侧）**：由 DBA 定期导出 Sybase 生产/UAT 库的查询审计日志与连接池账号映射（`monSysStatement / MDA 表`），按应用数据库账号聚合出实际发生过读写的表集合 $T_{\text{runtime}}$；
   - **差集高亮**：凡属于 $T_{\text{runtime}} \setminus T_{\text{code}}$（运行时实际在读、但代码扫描或文档没登记的表），系统自动标为 **`[高危隐式依赖]`** 推送至控制台 `Action Inbox`，强制应用负责人与 DBA 核实确认。
2. **表级 Wave 归属与 Cutover 硬锁**：
   - 依赖账本中的每张共享表记录：`表名 | 权威写入应用 (Owner App) | 迁移目标 Wave | 当前状态 (Sybase未迁 / 双写同步中 / Oracle已就绪)`；
   - 若某张表尚未确定所属 Wave，标记为 `Wave-Unknown` 并置顶向架构委员会告警；
   - 在任何 As-Is 应用的 `Cutover` 关卡，系统自动遍历其读取的全部表：只要存在任意一张表状态不是 `Oracle已就绪`（且未配置有效的数据桥接/视图回写补偿豁免），**系统自动锁死 Cutover 关卡**，并在全局大盘上提前标红排期冲突。

---

### 4.4 接口级权限隔离与只追加防篡改审计账本

1. **物理隔离的接口权限（不靠 Prompt 约束 AI）**：
   - **人类 Web 控制台接口（`/api/v1/human/*`）**：强制校验 GitHub OAuth 登录态与 RBAC 角色（工程师 / SME / QE / 架构师 / 迁移 Lead），独占所有**决定权接口**——确认依赖事实、确认 SME 业务规则、接受基线比对差异、关卡签字、批准豁免、点击发起 `Release / master` 发布 PR。
   - **Agent 接口（`/api/v1/mcp/*` 与 Worker 内部队列）**：使用与发起工程师个人身份绑定的短期 Scoped Token（`on_behalf_of: user_id`，权限取 Agent 角色与该工程师本人权限的交集），**物理上只提供只读查询、草稿提交、问题上报与遥测接口**。
2. **防篡改只追加审计账本（Append-Only Hash-Chained Ledger）**：
   - 每条 `AuditEvent` 包含：`event_id`, `timestamp`, `category (FACT | DECISION | EXECUTION)`, `initiator_user`, `executor_type (HUMAN | DETERMINISTIC_SCRIPT | AGENT)`, `agent_metadata (vendor, tool, model, version, hosting_location)`, `source_type (CODE | RUNTIME | DOC | HUMAN_CONFIRMED | AI_DRAFT)`, `payload_json`, 以及 **`prev_event_hash` 与 `current_event_hash = SHA256(prev_hash + payload)`**。
   - 审计表在数据库层通过触发器禁止 `UPDATE` 与 `DELETE`，并每日增量同步至开启 **AWS S3 Object Lock（Compliance 模式）** 的归档桶，任何事后篡改均可由哈希链校验立即发现。

---

## 第五部分：怎么推进？（MVP 严格界定、分阶段路线、试点全覆盖与渐进治理）

### 5.1 App MVP 的严格界定（以“最小完整闭环”切分，拒绝模糊的“写了一半”）

App 的软件建设与单应用的业务排期解耦。我们不使用“每个模块先写 50%”的方式定义 MVP，而是按交付生命周期切出三个**边界清晰、各自 100% 闭环可验收**的里程碑版本：

| 里程碑版本与时间 | 闭环定义（验收标尺） | 本阶段必须 100% 交付的能力范围（In Scope） | 明确后置到下一阶段的能力（Out of Scope） |
| :--- | :--- | :--- | :--- |
| **Milestone 1: M3 – M5**<br>**App MVP**<br>*（研发、基线与 Onboarding 减负闭环）* | **标尺**：随便拿一个真实的 W0/W1 As-Is 应用进入系统，能从立项（Intake）走完 Onboarding 参数推导与录制填表、抓出旧系统基线、用 Agent 完成一项改造、在构建失败修复后自动生成 Jira 问题记录，并在大盘看清阻塞。 | 1. **主干状态机与证据账本**：跑通 As-Is 阶段流转（固守 `可复现构建 → 旧基线 → 改造`），关卡默认运行在**“只记录/告警 (`LogOnly/Warn`)”**模式；<br>2. **Onboarding 参数推导 + 浏览器一次录制沉淀确定性填表脚本/Bookmarklet + 状态追踪器**；<br>3. **`WP-00` 旧系统基线采集包** + W0 所需的 **4 项改造工作包（`V0.1/V0.2`）**（密钥、Harness、容器/VM、Linux）；<br>4. **Super Harness 最小闭环**：后台主动 Worker（自动 Discovery 评估 + `Red → Green` 自动生成 Jira `Migration Problem` 草稿）+ 前台 **MCP Server**；<br>5. **计划对照与阻塞等待计时视图**（接入 GitHub、Jira、Harness、SNOW）。 | • `Develop → Release → master` 自动发 PR 与门禁硬拦截（M6–M7）；<br>• UAT/PROD 跨环境制品 SHA256 自动对账（M6–M7）；<br>• 横向 Campaign 批量跨仓改造（M8–M13）；<br>• Modernize 专用 SME 规则确认台（M8–M10）。 |
| **Milestone 2: M6 – M7**<br>**Release Assurance**<br>*（合规发布与对账闭环）* | **标尺**：支撑 **W0（2 个应用）在 M7 合规切生产**，确保每一行上线代码经过独立 Review、有旧基线比对证明，且生产与 UAT 100% 为同一制品。 | 1. **受控发起 `Develop → Release → master` 发布 PR**；<br>2. **核心合规项切换为自动硬拦截（`Block`）**（含旧基线已锁、独立 Review 合规、无自合自改、无录屏/会话/密钥脏文件、扫描全绿）；<br>3. **UAT 与 PROD 制品 SHA256 自动对账**与绕过部署巡检；<br>4. **`Cutover` 上游数据库表 Wave 就绪硬锁**。 | • 剩余 3 项重度平台改造（文件传输、AutoSys 复杂批次、Sybase→Oracle 大表）的成熟 Recipe 升级。 |
| **Milestone 3: M8 – M13**<br>**Scale & Standard**<br>*（规模化复制与标准定型闭环）* | **标尺**：支撑 **W1（8 个 As-Is 应用）在 M13 上线并定型全部 7 项改造标准**，具备横向批量改造、SME 规则确认与管理层成本出表能力。 | 1. **全部 7 项平台改造工作包升级至 `V1.0`**（含成熟 Detector、Recipe、填表/API 模板与双跑比对 Verifier）；<br>2. **横向 `Transformation Campaign` 批量扫描与改造派发引擎**；<br>3. **SME 交易流业务规则确认台**（支撑 Modernize 与复杂应用）；<br>4. **管理层 AI 产出质量与单应用迁移成本大盘**（达成 12 个月目标）；<br>5. **Wave 级批量预授权变更编排**（备战 M14–M24 及 M23 洪峰）。 | — |

---

### 5.2 M2–M24 完整演进路线与 M23（单月 30 应用切换）洪峰应对方案

1. **M2（当前月）：三大先行技术验证实验（用 2 周跑通决定架构落地的最小实验）**
   - **实验 A（跨应用 Discovery 与双源依赖）**：拿 W0 的 2 个应用 + W1 的 2 个候选应用，跑通静态探针扫描与 Sybase 运行时日志交叉比对，生成第一批标准 `Application Assessment`。
   - **实验 B（Onboarding 浏览器一次录制 $\rightarrow$ 本地 AI 沉淀确定性填表脚本）**：拿 SailPoint 权限组申请和 ServiceNow 组映射工单实测“人工点填录制一次 $\rightarrow$ 本地 AI 生成 `FormRecipe.json` 与 Bookmarklet $\rightarrow$ 第二个应用 1 秒自动填满表单”。
   - **实验 C（`WP-00` 基线抓取与首个 `Red → Green` 结晶闭环）**：在 W0 应用上实测抓出第一份旧系统基线，并模拟一次构建失败修复，跑通后台 Worker 自动生成 Jira `Migration Problem` 与候选 `Recipe` PR。
2. **M14–M24 规模化与 M23 单月 30 个应用集中切换（Cutover 洪峰）专项设计**：
   为什么 M23 同一个月切 30 个应用不会崩？因为从 M8（W1）开始建立以下三项机制：
   - **机制 1：前置验证左移（Pre-validated Release Candidates）**：30 个应用的代码改造、UAT 双跑比对与生产并行必须在 M20–M22 分批完成，M23 当月只做最终的数据追平核验与流量/调度切换，绝不在 M23 当月改代码或重跑构建。
   - **机制 2：Wave 级批量预授权工单（Batch Provisioning & Standard Change）**：将 30 个应用同构的防火墙切换、DNS 权重切换、AutoSys 作业启用与生产 Change 审批，由 Factory 聚合生成**按能力域/子波次打包的批量证据包与合并 Change 单**，将外部人工审批次数压缩 $80\%$。
   - **机制 3：集中切换指挥台（Wave Cutover Runbook & Auto-Reconciliation）**：按数据库表依赖拓扑自动排出 30 个应用在 M23 四个切换窗口内的先后点火顺序；每个应用切换后 5 分钟内自动执行制品 SHA256 对账与健康检查，异常一键触发回退预案。

---

### 5.3 试点应用组合选择：如何 100% 覆盖全部 7 项平台改造？

结合“数据先到，应用再走”规则，W0（2 个小 As-Is 应用，M7 上线）选择不依赖未迁核心大表的轻量应用以验证全链路闭环；同时在 M2 即选定由 **W0（2 个 As-Is）+ W1（8 个 As-Is）+ 2 个既有 Modernize 试点** 组成的**联合试点组合（Pilot Portfolio）**，在 M2–M13 期间完整覆盖并定型全部 7 项改造：

| 平台改造项 | W0（2 个 As-Is，M7 上线）<br>*选型：低关键度、小代码量、独立表或首批就绪表* | W1（8 个 As-Is，M13 上线）+ 2 个既有 Modernize 试点<br>*选型：代表性技术栈与共享核心库耦合场景* | M13 定型产出的标准资产 |
| :--- | :---: | :---: | :--- |
| **1. 密钥管理迁移（Vault / CyberArk）** | **✓ 覆盖**（App-W0-1, App-W0-2） | **✓ 批量复用验证** | `wp-01-secrets` `V1.0` |
| **2. 接入统一 CI/CD 平台（Harness）** | **✓ 覆盖**（App-W0-1, App-W0-2） | **✓ 批量复用验证** | `wp-02-cicd-harness` `V1.0` |
| **3. 容器化或 VM 部署（ECS / EC2 / EKS）** | **✓ 覆盖 ECS 与 EC2**（各 1 个） | **✓ 覆盖 ECS / EC2 / EKS**（Modernize 验证 EKS） | `wp-03-compute` `V1.0` |
| **4. 接入统一文件传输平台（Transfer / MFX）** | ○ 按需（若带简单文件传输则纳入） | **✓ 重点覆盖**（选 2–3 个含内外部文件交换的应用） | `wp-04-file-transfer` `V1.0` |
| **5. 接入统一作业调度平台（AutoSys）** | ○ 按需（仅限无跨系统依赖的简单定时任务） | **✓ 重点覆盖**（选 3–4 个含日终批处理作业链的应用） | `wp-05-autosys` `V1.0` |
| **6. 数据库换型（Sybase → Oracle）** | △ 仅限独立小库/表（避开未迁核心共享大表） | **✓ 核心攻坚**（与首个核心数据库迁移 Wave 同步验证） | `wp-06-sybase-oracle` `V1.0` |
| **7. 操作系统迁移（Solaris / Windows → Linux）** | **✓ 覆盖**（至少 1 个 Solaris/Win 迁 Linux） | **✓ 全面覆盖**（覆盖 C/C++、Java、Shell/Perl 等形态） | `wp-07-os-linux` `V1.0` |
| **公共：`WP-00` 基线包 + 20+ 步 Onboarding** | **✓ 100% 跑通验证并完成首次录制结晶** | **✓ 100% 复用确定性填表脚本与基线比对工具** | `wp-00` & `wp-onboarding` `V1.0` |

---

### 5.4 “先只记录、再逐步拦截”与“AI 自治度动态放开/熔断收回”落地细则

1. **检查项双维度演进（`AutomationLevel × EnforcementMode`）**：
   - **M3–M5（记录与校准期）**：所有关卡检查项设为 `LogOnly` 或 `Warn`。当团队未建旧基线就开始提交代码，或 PR 缺少独立 Review 时，系统如实将检查结果记为 `不满足（FAILED）` 并在控制台亮黄/红灯提醒，但暂不阻断 DEV 构建，用来收集基线数据并消除探针误报。
   - **M6–M7 起（准出硬拦截期）**：日常 `Develop` 分支开发继续保持低摩擦（靠本地 `pre-commit` 与组织级 Push Protection 实时拦截密钥和 `.mp4`/会话脏文件）；但**在发起 `Develop → Release` PR 和申请 `Cutover` 两个关键动作上，核心检查项全部切换为 `Auto + Block`（自动硬拦截）**——缺任何一项证据且无有效豁免单，系统直接拒绝创建 `Release` PR。
2. **AI 自治度按动作类型分级与数据驱动熔断（Data-Driven Autonomy & Circuit Breaker）**：
   - **动作风险分级**：
     - **永不放开（接口物理封死）**：确认业务事实、SME 规则签字、接受基线差异、批准豁免、发起发布 PR、执行生产部署、修改验收测试基线。
     - **L1（低风险，默认自动）**：只读代码扫描、依赖提取草稿、Onboarding 参数推导与录制分析、`Red → Green` Jira 问题草稿提炼。
     - **L2（中风险，按工作包表现放开）**：配置文件生成、Linux 脚本兼容修复、单元测试补充、已知 `Recipe` 转换。
     - **L3（高风险，严控放开）**：复杂 Sybase 存储过程转 Oracle PL/SQL、Modernize 核心核算代码重构。
   - **数据放开阈值与自动熔断收回**：
     Factory 实时统计每个工作包（及每条 `Recipe`）下 AI 产出的四项指标：**人工修改率（Human Diff Ratio）**、**PR Review 驳回率**、**构建/扫描首次失败返工率**、**Verify/UAT/PROD 缺陷逃逸数**。
     - **放开条件**：某工作包连续在 $\ge 5$ 个应用或 $\ge 20$ 个 PR 上达到**人工修改率 $< 15\%$、首次构建通过率 $> 85\%$、且零缺陷逃逸**，方可批准其用于横向 `Transformation Campaign` 批量生成 PR。
     - **熔断收回（Circuit Breaker）**：**一旦在 `Verify`（基线比对）、`UAT` 或 `PROD` 发现由某项 AI `Recipe / Skill` 引入的缺陷逃逸**，系统立即自动触发熔断：① 暂停该 `Recipe` 的横向 Campaign 批量派发权限；② 将对应工作包降级回“强制逐行人工严审 + 附加领域架构师签字”模式；③ 自动创建高优 `Migration Problem` 要求补充 `verifier/` 测试断言后方可恢复。

---

## 第六部分：怎么解决问题？（痛点对照、度量公式与风险验证）

### 6.1 第 2 节 8 大试点问题解决路径与度量对照表

| # | 试点暴露的问题与表现 | 靠 Factory 哪个具体机制解决？ | 见效时间 | 验证起效的度量指标（从事件流自动计算） |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **规模大、时间紧，靠人推不动**（每个应用从头摸索） | • **纵向工作包 + 横向 `Transformation Campaign` 批量改造 + 四级动态结晶飞轮**（首应用解决问题自动沉淀为 `Recipe`/确定性脚本，后续应用直接批量复用） | **M3–M5**（W0 跑通）<br>**M8–M13**（横向批量发力） | • **单应用各阶段平均周期（Cycle Time）**随 Wave 递减率<br>• **横向 Campaign 批量改造覆盖率与 Recipe 命中复用率** |
| **2** | **看不到会不会误期**（计划在 Build 实际在 Discovery，无提醒） | • **三态并列进度引擎（计划阶段 vs. 观测活动 vs. 受控通过阶段）+ 可解释误期预警规则**（综合剩余工作包基准耗时、工单排队天数与上游 DB Wave 状态自动亮灯） | **M3–M5 (MVP)** | • **阶段逾期漏报率 = 0%**<br>• **关键路径阻塞平均发现时间（MTTD）**与预警提前周数 |
| **3** | **关卡靠团队自己判断，等于没有**（绕过旧系统基线，范围超界） | • **`WP-00` 基线采集工具包**（降低建基线难度）+ **固定顺序状态机与无手动通过按钮的证据门禁** + **公开透明、带有效期的结构化豁免（Waiver）** | **M3–M5**（工具包与记录）<br>**M6–M7**（硬拦截） | • **未建旧系统基线即进入 Release 的应用数 = 0**<br>• **豁免单数量、按检查项分布及逾期未关闭豁免数** |
| **4** | **AI 在加速，管控跟不上**（超大 PR 无 Review、自合自改、模型不清、录屏/会话进仓库） | • **本地 `pre-commit` + 组织级 Push Protection**（前置拒掉录屏/会话/密钥进 Git）+ **AI 工具模型登记簿与 PR 强制声明** + **接口物理隔离决定权** + **`Release` 晋级强制核验独立 Review（合并人≠作者且≠Agent 发起人）與 PR 大小** | **M3–M5**（前置钩子与登记告警）<br>**M6–M7**（Release 硬拦截） | • **无独立 Review 或自合自改流入 Release 的 PR 数 = 0**<br>• **仓库混入录屏/会话/密钥文件的逃逸数 = 0**<br>• **PR 的 AI 工具与模型声明完整率 = 100%** |
| **5** | **知识分散，验证靠少数人**（依赖散落各处，SME 时间极少） | • **静态代码扫描 + Sybase 运行时审计日志双源依赖账本**（标注事实来源与确认状态）<br>• **按“业务域 → 交易流/批处理 → 三段式表 + 基线例证”聚合的 SME 业务规则确认台** | **M3–M5**（双源依赖账本）<br>**M8–M10**（SME 确认台） | • **未登记隐式数据库读写依赖的提前发现率**<br>• **SME 确认单个交易流业务规则的平均耗时**与确认完成率 |
| **6** | **做法不统一，无法复制和度量**（记录各异，不知单应用人力与 AI 贡献） | • **“规定交什么证据，由 App 自动从外部系统提取”** + **只追加审计与成本遥测账本**（所有质量、效率与成本指标全部从事件记录自动派生，零手工报表） | **M3–M5**（统一审计流）<br>**M8–M13**（成本与质量大盘） | • **100% 迁移应用采用统一阶段关卡与工作包规范**<br>• **单应用迁移总成本与 AI 产出质量指标自动出表率 = 100%** |
| **7** | **发布路径还没建立**（只有 DEV 环境，发布分支从未用过） | • **`Develop → Release → master` 三分支受控晋级**：人在 Factory 发起 `Release` PR，Harness 只构建唯一一次制品存入 Artifactory 先后部署 UAT 与 PROD，自动对账制品 SHA256 | **M6–M7（W0 上线前）** | • **UAT 与 PROD 制品 SHA256 一致率 = 100%**（生产零重新构建）<br>• **绕过 Factory / Release 分支的违规部署数 = 0** |
| **8** | **流程类工作吃掉大部分时间**（权限、Onboarding、配置、SNOW 工单全手工且无人跟踪） | • **Onboarding 参数自动推导 + 浏览器一次录制沉淀确定性填表脚本/Bookmarklet（P0 立即可用）+ API 批量建单 + 审批排队计时与 Wave 级批量预授权变更** | **M3–M5 (MVP)**（录制填表与追踪）<br>**M8–M13**（Wave 批量变更） | • **单应用 20+ 步 Onboarding 人工查参填表耗时下降 $> 80\%$**<br>• **外部工单在各审批部门的排队等待时长可视率 = 100%** |

---

### 6.2 核心度量指标计算口径（向管理层报告的 12 个月结果）

所有度量均从 `AuditEvent` 与外部同步记录实时计算，不设手工填报入口：

1. **误期风险预警（先用可解释确定性规则，不搞黑盒预测）**：
   当任意迁移单元命中以下四条规则之一时，自动标为 **`[误期高风险 - RED]`** 并置顶展示具体卡点：
   - $\text{当前受控阶段落后于 PMO 计划阶段} \ge 1 \text{ 个阶段}$；
   - $\text{任一前置外部工单（SNOW / SailPoint）排队等待时长} > \text{该类工单历史 P90 阈值（或 }> 10 \text{ 个工作日）}$；
   - $\text{距离计划 Cutover 日期} < (\text{剩余未完成工作包历史中位耗时之和} + \text{规定并行验证天数})$；
   - $\text{依赖账本中存在上游共享数据库表所属 Wave 晚于本应用计划 Cutover 日期（排期倒挂）}$。
2. **AI 产出与质量四项核心指标**：
   - **吞吐量（Throughput）**：AI 参与生成的已合并 PR 数、代码变更行数占比、完成的工作包数、自动提取并获 SME 确认的业务规则条数、自动结案的 `Migration Problem` 数。
   - **人工修改率（Human Edit Ratio）**：在声明使用 AI 的 PR 中，$\text{从初始 AI 草稿 Commit 到最终合并 Commit 之间由人工修改的代码行数} \div \text{PR 总变更行数}$。
   - **返工率（Rework Rate）**：AI 关联 PR 被 Reviewer 驳回要求重改的比例 + 合入或提交后触发 Harness 构建/扫描/基线比对失败（Red）的比率。
   - **缺陷逃逸率（Defect Escape Rate）**：在 `Verify (UAT)`、`Prod parallel` 或 `PROD` 阶段发现的、根因追溯至 AI 改造提交的缺陷数 $\div$ AI 参与交付的工作包总数。
3. **每个迁移应用的总成本（管理层主指标）**：
   采用**三段式可追溯成本结构**（清楚标明实测值与分摊估算值）：
   $$\text{单应用迁移总成本} = C_{\text{AI}} + C_{\text{Cloud}} + C_{\text{Human}}$$
   - **$C_{\text{AI}}$（AI 工具与模型成本）**：支持按任务/Token 计量的工具（如自托管 Worker、MCP 调用）直接按 `app_id` 精确累加；按月订阅或暂不支持细粒度拆分的工具（如 Copilot 席位、Blitzy 月费），按该应用当月活跃使用该工具的工程师人数或 PR 占比自动分摊。
   - **$C_{\text{Cloud}}$（迁移验证与并行云资源成本）**：通过 AWS Account ID 或 Cost Allocation Tag（`AppID`）自动同步该应用在 DEV、UAT 及 `Prod parallel` 并行期的 AWS 账单费用。
   - **$C_{\text{Human}}$（人力投入折算成本）**：根据各角色（迁移工程师、SME、QE、SRE）处理该应用工作包的活跃周期自动推算基础人日，并在每个工作包完成关单时由负责人花 5 秒钟确认/微调总人日，乘以标准角色费率算出。
4. **项目整体四项目标的自动度量与展示**：
   - **标准 Pipeline 模板采用率**：已接入企业标准 Harness 模板的迁移单元数 $\div$ 在途与已完成迁移单元总数（目标：$100\%$）。
   - **Terraform 合规与零手工漂移率**：TFE Workspace 100% 引用私有 Registry 模块且最近一次 Drift Detection 为零的环境占比（目标：$100\%$）。
   - **构建与部署效能提升比**：对比每个应用在 `WP-00` 记录的旧系统构建/部署耗时与接入 Harness 后的平均构建耗时、部署耗时及首次成功率。
   - **Pipeline 管控与密钥处理零审计发现**：实时统计绕过 `Release` 分支部署、生产重构建、代码库明文密钥/录屏文件逃逸次数（目标：生产逃逸为 $0$）。

---

### 6.3 最没把握的 5 个关键判断及验证计划

| # | 最没把握的判断 | 为什么没把握（潜在风险）？ | 要验证它需要什么信息与动作？（M2–M4 验证计划） |
| :--- | :--- | :--- | :--- |
| **1** | **仅靠代码静态扫描 + Sybase 审计日志，能否 100% 抓出共享核心库的所有未登记读取方？** | 若部分老旧批处理或报表只在季末/年末运行，短期数据库运行时日志可能捕获不到，导致切换时遗漏下游读取方。 | **需获取信息**：DBA 能否提供跨度包含月末/季末批次的 Sybase 历史连接与 SQL 审计汇总，以及主机侧 `interfaces / tnsnames` 配置。<br>**验证动作**：M2–M3 在 W0/W1 样本应用上实测静态扫描与 DB 日志的重合度与漏报率。 |
| **2** | **企业办公终端安全策略（EDR / 浏览器策略），是否允许运行 Bookmarklet 或本地受控 Playwright 填表脚本？** | 强监管银行可能通过组策略禁用了浏览器书签脚本（CSP 限制）或拦截本地未签名自动化进程。 | **需获取信息**：终端安全团队对内部门户（ServiceNow / SailPoint）的 CSP 策略与受控浏览器扩展/Playwright 白名单要求。<br>**验证动作**：M2 第 1 周直接在真实办公机上对 ServiceNow 表单实测 **实验 B（录制 + Bookmarklet / 本地脚本填充）**。 |
| **3** | **`WP-00` 旧系统基线采集包，在陈旧 Solaris / Sybase 环境下抓取一份完整可回放基线实际需要多少人日？** | 老系统可能缺乏独立测试数据、强耦合外部实时上游行情/清算报文，导致录制和重放比预期复杂得多。 | **需获取信息**：W0 与 W1 候选应用的现有测试环境现状与构建脚本。<br>**验证动作**：M2–M3 拿 1 个联机应用和 1 个 AutoSys 批处理应用实测跑通 `WP-00` 全流程，测算真实耗时。 |
| **4** | **AI 从 150 万行 COBOL / C++ / PB 老代码抽取并按“交易流/批处理”聚合的业务规则，SME 首次采纳率能否 $> 75\%$？** | 老代码中充斥历史死代码、宏嵌套与隐式全局状态，若 AI 抽取草稿噪音过大，会导致 SME 失去信心退回看代码。 | **需获取信息**：2 个既有 Modernize 试点的真实代码模块与 SME 反馈。<br>**验证动作**：M3 选取 1 个典型日终结算批次，生成“三段式表 + 基线真实数据例证 + 源码行号”，请 SME 盲测审阅并计时。 |
| **5** | **M23 单月集中切换约 30 个应用时，ITSM / Change 委员会是否接受“按 Wave 批量打包工单与预授权标准变更”？** | 若合规部门坚持每个应用、每个环境、每条防火墙和 Change 都必须独立建单、逐张人工审批，M23 必然发生审批拥塞。 | **需获取信息**：企业 Change Management 与信息安全团队对同构迁移变更（Standard Change / Batch Change）的合规认定标准。<br>**验证动作**：在 M6–M8 基于 W0/W1 的完整证据包样本，与 Change 委员会及运维团队正式对齐批量审批协议。 |
