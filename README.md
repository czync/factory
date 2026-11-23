# Migration Factory

**Migration Factory** 是受强监管金融机构迁云项目（约 24 个月内，快速、准确、安全、可控地完成 78 个应用迁云与机房退出）的迁云生产体系与交付控制中枢。

它基于**第一性原理**（等价性证明定律、共享资源排队拥塞定律、AI 熵增与动态结晶定律），以**确定性交付主线控制**为骨架，通过**纵向单应用 `Migration Run` × 横向跨应用 `Transformation Campaign`** 双轮驱动，结合 **Super Harness（后台主动 Event-Driven Workers + 前台按需 `MCP & Skills` + 确定性沙箱自检 + 四级动态结晶飞轮）**、**Onboarding 浏览器一次示范录制与本地 AI 自动沉淀确定性脚本/Bookmarklet**，以及 **第 0 号工作包 `WP-00-Legacy-Baseline`（旧系统可复现构建与基线双跑比对包）**，将未知的遗留系统迁移逐步转化为可批量复用的确定性工程能力。

完整高层架构与工程落地设计请查阅：**[Migration Factory 高层架构与工程落地设计](docs/high-level-design.md)**。

---

## 核心工程机制

1. **Onboarding 浏览器一次录制 + 本地 AI 自动沉淀（P0 零接口审批等待）**
   - 针对跨 7+ 个系统申请高权限 Service Account API 审批漫长、部分内部门户无 API 的痛点，由 Factory **参数推导引擎**先根据应用元数据算出全部 20+ 步标准参数包（`AppOnboardingPayload.json`）。
   - **首应用人工示范录制一次**：工程师在已登录企业 SSO 的浏览器中正常点填一次表单，本地轻量录制器捕获结构化 `ActionTrace` 与 DOM 特征（无需多模态视觉模型）；**本地 AI 分析器**自动完成“输入字面量 $\rightarrow$ 上下文模板变量”反向绑定与稳健选择器合成，自动生成声明式 `FormRecipe.json`、浏览器 **Bookmarklet** 与确定性 **Playwright 填表脚本**并通过 Git PR 沉淀。
   - **第 $2 \sim 78$ 个应用 1 秒复用**：打开门户点击 Bookmarklet 1 秒填满 20+ 个字段，人肉眼核对点提交，自动抓取工单号回传 Factory 追踪排队时长。
2. **第 0 号工作包：`WP-00-Legacy-Baseline`（化解“建基线难”）**
   - 包含四大落地模块：**旧构建探针与游离依赖封存器**（归档至 Artifactory）、**多模态业务基线采样器**（覆盖 AutoSys 批处理前后表快照、联机/MQ 报文录制、Sybase 存储过程调用）、**确定性格式保留脱敏与 S3 Object Lock 黄金样本库**、以及 **双跑回放与“确定性规则降噪 + AI 差异聚类分诊”比对引擎**。
3. **Super Harness 五层落地架构（主动 Push + 被动 Pull + 四级动态结晶）**
   - **五层结构**：PostgreSQL 持久化事件调度层 $\rightarrow$ 动态上下文组装器（`ContextBundle`） $\rightarrow$ 多运行时执行层（后台主动 Headless Workers 如 DeepSeek Harness SDK / Devin / AWS Transform + 前台 IDE MCP Server） $\rightarrow$ 执行与验证分离的沙箱自检环 $\rightarrow$ 动态结晶流水线。
   - **四级动态结晶**：`Red → Green` 事件自动抓取报错日志与修复 Diff 写入 Jira `Migration Problem`（**Level 1: Case**）$\rightarrow$ 泛化为转换配方（**Level 2: Recipe**）$\rightarrow$ 封装进工作包（**Level 3: Skill**）$\rightarrow$ 固化为确定性脚本与关卡探针（**Level 4: Deterministic Script**），全程通过 **`migration-factory` 仓库的 GitHub PR + 样本回归 CI** 审核发布。
4. **双维执行与纵深合规防线**
   - **纵向 `Migration Run`** 严守单应用阶段关卡与**共享数据库“数据先到，应用再走”双源依赖锁（静态代码扫描 + Sybase 运行时审计日志交叉核验）**；**横向 `Transformation Campaign`** 对 58 个 As-Is 应用提前只读扫描，用验证通过的 `Recipe` 批量生成共性改造 PR 草稿。
   - **三分支同制品闭环**：本地 `pre-commit` + 组织级 Push Protection 前置拒掉密钥与 `.mp4` 录屏脏文件；`Develop → Release → master` 受控晋级，强制核验独立人工 Review（合并人≠作者且≠Agent 发起人）及 UAT/PROD 同一制品 SHA256 对账。

---

## 端到端交付闭环示例：一次 As-Is 应用的完整迁移

| 步骤 | 核心动作与人机协同方式 | Factory 记录与控制什么 |
| :--- | :--- | :--- |
| **1. 立项扫描与 Onboarding 录制/重放** | 应用纳入 Wave 后，后台主动拉起 `Discovery Worker` 只读扫描代码并与 Sybase 运行时审计日志交叉比对写入**依赖账本**；参数引擎算出 20+ 步 Onboarding 参数，首应用录制一次由本地 AI 生成确定性脚本，后续应用点击 **Bookmarklet** 1 秒填单、人点提交并自动回填单号 | 应用画像、静态+运行时双源依赖账本、生成的 `FormRecipe` 版本、20+ 步工单号及各审批环节排队等待时长 |
| **2. 旧系统基线锁定（`WP-00`）** | 运行 `WP-00` 构建探针封存游离依赖实现可复现构建；运行批处理/联机采样器抓取输入快照与 Golden Master 输出，经确定性脱敏后上传受控 S3，解锁 `Build` 阶段 | 可复现构建清单、S3 黄金样本版本 URI 与 SHA256 签名（大文件与敏感数据绝不进 Git 仓库） |
| **3. 横向 Campaign 与主动/被动改造** | 共性兼容问题由后台 **横向 Campaign Worker** 批量应用成熟 `Recipe` 生成 PR 草稿；应用特有改造由工程师在 IDE 中通过 **MCP** 拉取 `ContextBundle` 与 `Skill` 完成，经本地沙箱自检与 `pre-commit` 钩子检查后提交 PR | Agent 执行记录（On-behalf-of 代表关系）、应用的 Skill/Recipe 版本、PR 的 AI 工具与模型声明 |
| **4. 独立 Review 与 `Red → Green` 动态结晶** | 非作者且非 Agent 发起人的工程师在 GitHub 完成独立 Review 合入 `Develop`，Harness 执行构建与扫描。若经历红变绿（`Red → Green`），后台 `Crystallization Worker` 自动抓取失败日志与修复 Diff 写入 Jira `Migration Problem`，并自动向 Git 资产库提 PR 升级 `Recipe/脚本` | `Problem → Context → Investigation → Solution → Verification` 闭环记录、GitHub PR 能力升级记录、AI 修改率与返工率遥测 |
| **5. 发布晋级、双跑比对与数据 Wave 卡口** | 人在控制台点击发起 `Develop → Release` PR，Harness 产出唯一不可变制品部署至 `UAT`，运行 `WP-00` 双跑比对器（确定性降噪 + AI 差异分诊）。`Cutover` 前强校验**依赖账本**中上游 Oracle 核心表 Wave 已就绪；人在 Harness 执行生产部署（复用 UAT 同一制品），Factory 自动对账 SHA256 并引导合入 `master` | 关卡通过/豁免证据包、UAT 与 PROD 制品 SHA256 一致性对账结果、上游数据库 Wave 阻塞锁、单应用迁移总成本（AI + 云资源 + 人力） |

---

## 文档结构导航（[docs/high-level-design.md](docs/high-level-design.md)）

- **[第零部分：一页决策摘要（Executive Summary）](docs/high-level-design.md#第零部分一页决策摘要executive-summary)**（第一性原理三条定律、系统定位与三大产出、四大问题结论速览、需架构委员会立即拍板的 4 项决策）
- **[第一部分：App 怎么设计？](docs/high-level-design.md#第一部分app-怎么设计总体架构核心概念模块边界与数据同步)**（责任边界与三态并列视图、三类接触面与四层架构、10 大核心领域对象、7 大模块与第 5 节能力归属表、Outbox 双写与幂等对账、`migration-factory` 仓库目录树）
- **[第二部分：三条迁移流水线与七项平台改造工作包详解](docs/high-level-design.md#第二部分三条迁移流水线与七项平台改造工作包详解)**（As-Is / Modernize / Retire 全阶段机制、`WP-01` 至 `WP-07` 逐项 Detector/Recipe/工单/Verifier 拆解、SME 交易流三级聚合业务规则确认台）
- **[第三部分：三大核心工程引擎深度拆解与落地指南（怎么自动化？）](docs/high-level-design.md#第三部分三大核心工程引擎深度拆解与落地指南回答问题-2怎么自动化)**
  - **[3.1 Onboarding 参数推导 + 浏览器一次录制 + 本地 AI 沉淀确定性脚本/Bookmarklet](docs/high-level-design.md#31-深度拆解一onboarding-与外部工单自动化参数自动推导--浏览器一次示范录制--本地-ai-沉淀为确定性脚本bookmarklet)**
  - **[3.2 第 0 号工作包 `WP-00-Legacy-Baseline` 四大模块工程落地](docs/high-level-design.md#32-深度拆解二第-0-号工作包-wp-00-legacy-baseline旧系统可复现构建与基线采集双跑比对包)**
  - **[3.3 Super Harness 五层工程架构与四级动态结晶流水线](docs/high-level-design.md#33-深度拆解三super-harness主动被动双模-agent-执行引擎--四级动态结晶飞轮)**
  - **[3.4 全链路自动化与人机职责边界矩阵](docs/high-level-design.md#34-全链路自动化与人机职责边界矩阵)**
- **[第四部分：发布控制、阶段关卡与安全合规设计](docs/high-level-design.md#第四部分发布控制阶段关卡与安全合规设计)**（各阶段最低证据表、三分支晋级与热修复 Hotfix 规则、三道防线补齐 GitHub 分支保护缺口、静态+DB 日志双源依赖锁、接口物理隔离与哈希链审计账本）
- **[第五部分：怎么推进？](docs/high-level-design.md#第五部分怎么推进mvp-严格界定分阶段路线试点全覆盖与渐进治理)**（按“最小完整闭环”严格界定的 3 个里程碑、M2 三大验证实验与 M23 30 应用洪峰切换方案、覆盖 7 项改造的联合试点矩阵、“只记录→拦截”与“AI 自治度熔断收回”细则）
- **[第六部分：怎么解决问题？](docs/high-level-design.md#第六部分怎么解决问题痛点对照度量公式与风险验证)**（8 大试点问题对照表、误期/AI 质量/单应用三段式成本/项目整体目标计算公式、最没把握的 5 个关键判断及验证计划）
