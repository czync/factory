# 架构收敛设计稿：ECS Factory + AWS Bedrock AgentCore + Local `agent-kit` / Blitzy

> **文档性质**：基于多轮讨论、工程现实约束与外部调研形成的最新收敛架构稿（面向 Manager 评审与 PoC 立项）。整合了 **AWS Bedrock AgentCore 受管执行层**、**中央知识仓（OpenWiki + Graphify）**、**`agent-kit`（类 TanStack Intent + `pstack` 验证环）** 与 **ECS DEV 轻量控制面**，供评审定案后合入 [高层架构设计文档](high-level-design.md) 与 [项目总览](../README.md)。

---

## 一、已确认的约束与四层最终分工（Reality Baseline）

经过多轮架构收敛与边界校准，摒弃了“自建重型 ECS 无人值守改码集群”和“硬赌云端浏览器过金融内网表单”等高风险假设，体系收敛为清晰务实的 **四层分工架构**：

```text
1. 写码与本机提效层（人在本机 / 黑盒专才）
   • As-Is & 日常改造/排障 ：Local Agent (Copilot Squad + Artifactory 分发 agent-kit + pstack 本地验证环)
   • Modernize 重度重构     ：Blitzy（纯黑盒，入口吃 Factory 权威 Spec，出口过统一 PR 门禁与 WP-00 双跑）
   • 20+ 步外部 Onboarding  ：Factory 参数推导 + 工程师本机浏览器 Bookmarklet / 本地 Playwright
                             （天然复用企业笔记本 SSO、MFA 与终端设备证书，回避云端浏览器网络/凭证泥潭）

2. AWS Bedrock AgentCore 受管智能层（仅研发内网闭环：GitHub / Artifactory / ECS / Bedrock）
   • AgentCore Runtime (Firecracker MicroVM + VPC Mode + PrivateLink) 仅受控 Dispatch 两类只读/知识任务：
     ① Knowledge Builder ：PR Ready/Merge 触发 → 跑 Graphify (tree-sitter) + OpenWiki (走 Bedrock) → 推中央知识仓
     ② PR Auto Reviewer  ：PR 打开/更新触发（统一拦 Copilot 与 Blitzy PR）→ Stage 1 确定性检查 → Stage 2 知识增强只读审查
   • AgentCore Gateway (托管 MCP) ：把中央知识仓 + 双源 DB 依赖 + agent-kit 规则暴露为统一只读 MCP Tools
   • AgentCore Policy (Cedar ABAC) + Identity (OIDC / RFC 8693 OBO) + Observability (CloudTrail / X-Ray / OTel)

3. 中央知识与标准资产层（企业 Git + Artifactory）
   • `migration-knowledge` (中央知识仓) ：按 `<app-id>/graph/` 与 `<app-id>/openwiki/` 集中托管，对 78 业务仓零侵入
   • `agent-kit` (Artifactory SemVer 发版) ：类 TanStack Intent 维护分发，本地与云端 MicroVM 跑完全同一份版本号

4. Factory Control Plane（ECS DEV 轻量 Web App —— 已落地 4 视图原型）
   • 承载 GitHub Webhook 调度入口、跨 78 应用追踪（Jira ↔ PR ↔ AgentCore Auto Review ↔ WP-00）、
     全局共享 Sybase 双源依赖锁、Onboarding 参数推导与 Bookmarklet 导出、Blitzy 权威 Spec 导出及 SME 规则签字台
```

### 已确认的工程与基础设施前提
- **Git 仓库**：允许新建企业内部 Git 仓库（用于集中托管中央知识仓 `migration-knowledge` 与 `agent-kit`）。
- **制品分发**：已有内部 **Artifactory**，可用于分发版本化的 `agent-kit` 包。
- **控制面托管**：已有 **ECS** 可用，且内部聚合/控制 Web App **一个 DEV 环境即可满足需求**，无需背负生产级长周期审批；同时明确不存在 GHE Pages / S3 / SharePoint 静态大盘托管，且 CI 跨多系统回写 GitHub 阻力大，因此 ECS DEV 极薄 Web App 是最务实的物理落点。
- **业务改码边界**：具体业务改造与迁移实施仍由 **Local Agent（Copilot Squad）** 与 **Blitzy（黑盒）** 负责，Factory 不做无人值守自动改业务代码。
- **Onboarding 边界**：云端 Browser Tool 访问企业内网 ServiceNow / SailPoint / CyberArk 面临终端设备证书（mTLS）、企业 SSO/MFA 与跨网段路由阻力，因此 Onboarding 坚定保留 **Factory 参数推导 + 本机 Bookmarklet / 本地 Playwright**。

---

## 二、知识层与统一注入设计：OpenWiki + Graphify + AgentCore Gateway

为避免 78 个应用在本地各自盲扫老代码导致 Token 浪费与跨仓上下文割裂，引入 **Graphify + LangChain OpenWiki** 组成双层共享代码知识层，并由 **AgentCore Runtime** 自动保鲜、**AgentCore Gateway（托管 MCP）** 统一注入云端与本地。

### 2.1 LangChain OpenWiki 与 Graphify 调研对比

| 维度 | **Graphify** | **LangChain OpenWiki** |
| :--- | :--- | :--- |
| **技术底座** | Python CLI（`uv tool install graphifyy`），基于本地 `tree-sitter` AST 解析 | `langchain-ai/openwiki`（MIT，Node.js $\ge$ `22.22.0`，基于 LangChain `deepagents`） |
| **核心优势** | **零 LLM 成本**构建确定性调用图与依赖关系；支持代码 + 文档/SQL/配置融合，输出 `graph.json`、`GRAPH_REPORT.md`、`graph.html`，边显式标注 `EXTRACTED / INFERRED / AMBIGUOUS` | 输出 **OKF v0.2** 渐进式 `index.md` 与主题页；通过 `openwiki/.claims/*.json` 将论断绑定源码路径与 SHA-256 哈希，支持**无模型确定性过期检测**与 `git diff` 增量刷新 |
| **安全与控制** | 纯本地/容器静态解析，源码不出域；支持 `graphify vscode install` 注入 `.github/copilot-instructions.md` | 强制 `OPENWIKI_TELEMETRY_DISABLED=1` 关闭遥测、关闭外部 LangSmith；支持 `INSTRUCTIONS.md` 人工边界与 `.openwikiignore` 敏感过滤 |
| **短板与互补** | 对无现成 `tree-sitter` 语法的遗留方言（部分 COBOL/PowerBuilder/Perl）存在局部盲区 | 依赖 LLM 推理耗时与限流；若跑在 CI 使用 Copilot 通道存在 OAuth `COPILOT_API_KEY`（PAT 被拒）鉴权限制 |
| **协同定位** | **底层确定性结构骨架**（零成本提取调用链与影响半径） | **上层代码语义地图 + 可验证 Grounded Claims 记忆层** |

### 2.2 存储位置与 Blitzy 分工
- **集中存放在中央知识 Git 仓库 `migration-knowledge`**：按 `<app-id>/graph/` 与 `<app-id>/openwiki/` 组织，对 78 个受控业务仓**零侵入**（不污染业务 PR 行数、不触发业务构建），且天然支持 `openwiki link` 跨应用检索与未来运维移交。
- **与 Blitzy 的分工**：58 个 As-Is 应用主力使用 Graphify + OpenWiki；8 个 Modernize 应用重构期避免与 Blitzy 内部图谱重复烧 Token，待 Blitzy 交付新代码 PR 后再用 Graphify + OpenWiki 沉淀团队 100% 自主拥有的长效知识库。
- **明确边界**：二者仅覆盖静态代码与文档，**绝不替代**“静态扫描 + Sybase 运行时审计日志”双源结构化依赖账本。

### 2.3 触发时机：拒绝 `pre-commit`，用 AgentCore Runtime 在 PR 阶段全自动刷新
- **为什么拒绝 `pre-commit hook`？**：开发期 WIP 提交高频琐碎，挂入 LLM/图谱刷新会拖慢每次 commit 并逼迫开发者习惯性 `--no-verify` 绕过安全防线。
- **PR 生命周期分层触发（解开 Copilot CI 鉴权死结）**：
  1. **PR 创建 / Push（秒级确定性阶段）**：运行 `agent-kit` 确定性检查 + Graphify AST 差异分析 + OpenWiki 无模型 SHA-256 Claim 过期检测。
  2. **PR Ready / Merge（云端 AgentCore Runtime 增量刷新）**：GitHub Webhook 通知 Factory（ECS） $\rightarrow$ 受控 Dispatch 一次性 **AgentCore Runtime MicroVM**（VPC Mode） $\rightarrow$ 拉取目标仓并直接调用 **Amazon Bedrock** 模型按 `git diff` 增量刷新失效 OpenWiki 页与 Graphify 产物 $\rightarrow$ 推送回中央知识仓 `migration-knowledge`。
     - **关键收益**：彻底摆脱“CI 环境拿不到开发者个人 Copilot OAuth Token”的瓶颈；同时保留本机 `agent-kit wiki sync --pr`（复用 `gh auth login` 或 Host-Driven `openwiki integrations install copilot`）作为离线/手工兜底方式。

### 2.4 统一渐进式注入：AgentCore Gateway（托管 MCP Server）
不把整仓 Wiki 硬塞进 Prompt，而是通过 **AgentCore Gateway（`mcp://agentcore-gw.custody.internal/v1`）** 统一暴露 5 个只读 MCP Tools，同时服务三类消费者：

| Gateway MCP Tool | 数据源 | 注入内容（按需渐进加载） | 消费者 |
| :--- | :--- | :--- | :--- |
| `knowledge_index_read` | `migration-knowledge` (OpenWiki) | 先返回 `openwiki/index.md` 目录，按需下钻具体页与 `.claims` 源码行号 | 云端 PR Reviewer / 本地 Copilot Squad / Blitzy Spec 导出 |
| `knowledge_graph_impact` | `migration-knowledge` (Graphify) | 按变更文件/符号精准计算上下游调用链与爆炸半径子图 | 云端 PR Reviewer / 本地 Copilot Squad |
| `factory_db_dependencies` | Factory 双源依赖账本 | 静态代码 + Sybase MDA 运行时审计日志交叉核验后的共享表与 Wave 锁 | 云端 PR Reviewer / 本地 Copilot Squad / Blitzy Spec 导出 |
| `agentkit_rules` | Artifactory (`agent-kit`) | 当前工作包最新版 Principles、Playbooks、Recipes 与 Lint 规则 | 云端 PR Reviewer / 本地 Copilot Squad |
| `pr_evidence_context` | Factory Control Plane | `WP-00` 黄金基线状态、双跑差异簇与 Jira 结构化 Work Log | 云端 PR Reviewer / Blitzy Spec 导出 |

---

## 三、AWS Bedrock AgentCore 受管执行层设计（PR Auto Review 与安全边界）

相比早期自建 ECS 容器 Worker，AWS Bedrock AgentCore 在企业金融内网环境中补齐了 4 块关键底座：**Firecracker MicroVM 会话级硬隔离**（单 Session 最长 8 小时、I/O 等待期 CPU 免费、空闲自动回收清零）、**VPC Mode + AWS PrivateLink 闭环私网流量**、**Identity OIDC/RFC 8693 OBO 身份传播**、以及 **Cedar ABAC 基础设施层策略硬拦截 + CloudTrail/X-Ray/OTel 全链路审计**。

### 3.1 PR Auto Review 两阶段闭环（统一卡住 Copilot 与 Blitzy 黑盒 PR）

```text
GitHub PR Opened / Updated (来自本地 Copilot Squad 或黑盒 Blitzy)
        │  Webhook
        ▼
Factory Control Plane (ECS DEV) ──► Dispatch AgentCore Runtime (Firecracker MicroVM · VPC Mode)
        │
        ├─ Stage 1: 确定性校验（零 LLM 成本，运行与本机完全同版的 Artifactory agent-kit）
        │    • Lint / Semgrep / SQLFluff / Zod Schema / Commit Trailer / 脏文件与密钥 / WP-00 基线防篡改
        │    • 失败直接标红打回，绝不浪费 LLM Token
        │
        └─ Stage 2: 知识增强的并行只读预审（经 AgentCore Gateway 按需拉取 Graph 影响图 + OpenWiki + DB 依赖）
             ├─ Blast-Radius Reviewer       ：结合 Graphify 影响子图，抓 As-Is 越界重构无关业务代码
             ├─ Migration-Semantics Reviewer：结合 OpenWiki 与 Sybase/Solaris 规则，抓隐蔽 SQL/OS 语义坑
             └─ Contract & Blitzy-Gate Bot  ：强校验 WP-00 外部双跑证据与 Jira Work Log（专治黑盒自证清白）
        │
        ▼  受 AgentCore Policy (Cedar: READ_ONLY_PR_COMMENT) 物理限制
  仅发表 PR Review Comment & Commit Status（物理禁止 push / merge；绝不替代真人独立人工 Review）
        │
        ▼  结构化回写
  Factory ECS 控制面更新 Batch Trace、规则拦截统计与 SHA-256 审计链
```

### 3.2 关键边界取舍：为什么不用 AgentCore Browser，以及 Memory 的克制定位
1. **明确排除 AgentCore Browser 用于 Onboarding**：虽然 AgentCore Browser 支持 VPC Mode、远程 Playwright CDP 与 Live View，但银行内部门户（ServiceNow / SailPoint / CyberArk）普遍叠加**终端设备证书（mTLS / 合规笔记本信任）与企业 SSO/MFA**，云端浏览器容器跨内网认证与维护成本过高；因此 Onboarding 坚持 **Factory 参数推导 + 工程师本机 Bookmarklet / 本地 Playwright**。
2. **克制使用 AgentCore Memory**：不与 Git 中的 OpenWiki/Graphify 或 PostgreSQL 依赖账本争夺事实真源；仅可选用于沉淀 **PR Auto Review 误报纠偏（False Positive 反馈）与 SME 领域术语偏好**，使云端预审随使用不断降噪。

---

## 四、`agent-kit` 的维护机制与工程纪律（类 TanStack Intent + `pstack` 验证环）

在混合架构下，`agent-kit` 既是工程师本机 Copilot Squad 的技能底座，也直接打进 **AgentCore Runtime MicroVM** 镜像，确保**本地开发与云端 PR Auto Review 永远跑在同一份版本号上，彻底消除口径漂移**。

### 4.1 维护与分发机制：借鉴 TanStack Intent 模式
- **消费端（Artifactory Package-Driven）**：`agent-kit` 按 SemVer 发布至内部 **Artifactory**（如 `@custody/agent-kit@1.4.0`），78 个应用通过声明式 allowlist/sync 命令投影规则与验证脚本，严禁手抄 `standards.md` 造成版本碎片化。
- **维护端（吸收 Intent v0.5+ Maintainer Workflow & Source-Aware Check）**：PR 修改底层 Schema、探测脚本或工作包配方时，CI 自动执行技能示例校验与 **Source-Aware Drift 检测**，提示同步修订关联 `SKILL.md`；旧版已弃用配方由 Commit Trailer 的 `Agent-Kit-Version` 在 PR Stage 1 及时拦截提醒升级。

### 4.2 吸收 `poteto/pstack` 的两大核心精髓
1. **Verification Loop 与确定性下沉（Structure over Text / Prove It Works）**：
   - 将反复踩坑的 `standards.md` 散文持续编译下沉为 4 层确定性机制：**① 自定义 Lint/静态规则（Semgrep / ESLint / SQLFluff） $\rightarrow$ ② Type-Safe & Zod/JSON Schema 强约束（锁死参数包、证据 Manifest、Jira Work Log 与 Trailer） $\rightarrow$ ③ 本地紧闭环自修（`agent-kit verify` 对照冻结 `WP-00` 基线回喂精准报错至全绿） $\rightarrow$ ④ 原封不动进入 AgentCore PR Auto Review Stage 1**。
2. **四层拆解与专职 Bots 权限隔离**：
   - 借鉴 `/poteto-mode` 拆分为 `Router → principles/ → playbooks/ → skills/` 避免上下文腐烂；
   - 借鉴 `Comment Sicko` 实施写/审分离：`Blast-Radius Bot`、`Baseline-Guard Bot`、`Compliance-Sicko Bot` 严格只读（本地与 AgentCore MicroVM 均受只读/Cedar 约束），`Jira-Logger Bot` 仅持受限 Jira Work Log 回写权限，配合 `/reflect` 将 `Red → Green` 修复经验沉淀为 `agent-kit` 升级 PR。

---

## 五、ECS DEV 轻量控制面与 5 条粘合协议

ECS DEV 上的 **Migration Control Plane** 保持“90% 只读聚合追踪 + 10% 真实受控动作”的极薄定位：
- **核心 4 视图**（已按 Direction A · Linear/Vercel Light 落地前端原型）：
  1. `Applications`（`/`）：78 应用三态进度全景、风险预警、Wiki/Graph 新鲜度与 `agent-kit` 版本表，点选任意行从右侧 `AppInspectorDrawer` 钻取全部详情与本机命令；
  2. `Batch Trace`（`/trace`）：跨应用批次追踪（`Jira & Work Log ↔ PR & Branch ↔ Copilot/Blitzy ↔ Verification Loop & AgentCore 预审 ↔ 独立 Review`）；
  3. `Knowledge & Deps`（`/knowledge`）：共享 Sybase 双源“数据先到”依赖锁 + 中央知识仓（OpenWiki/Graphify 预览、AgentCore 刷新与 Gateway MCP 工具状态）；
  4. `Standards & Review`（`/standards`）：Artifactory `agent-kit` 发版治理、`pstack` 验证规则与 Bot 权限矩阵、以及 Modernize SME 3 级业务规则与豁免签字台。
- **粘合分散执行与控制面的 5 条机器可解析协议（由 Bot/Hook 自动注入，零手填）**：
  1. **全局关联锚点（Correlation ID）**：分支名、PR 模板与 Commit Trailer 携带 `Migration-App/Unit/Wave/WP/Task`、`AI-Tool/Model`、`Agent-Kit-Version`；
  2. **Jira 结构化 Work Log & Waiver 格式**：固定结构块记录 PR、外部单号与阻塞原因；
  3. **机器可读证据 Manifest**：`WP-00` 与 `WP-01~07` 产出标准 JSON 证据摘要（同时作为验收 Blitzy PR 的硬尺子）；
  4. **跨应用全局注册表**：中心维护 `apps.yaml` 与双源 `db-dependencies.yaml`（标注 `CODE_STATIC | DB_RUNTIME_LOG | BOTH | HUMAN_CONFIRMED`）；
  5. **知识仓与安全红线协议**：统一 `migration-knowledge` 目录、`INSTRUCTIONS.md` / `.openwikiignore` 与 `guardrails.md`。

---

## 六、下一步 PoC 验证清单（供与 Manager 讨论拍板）

建议用 1–2 周完成以下 5 项最小闭环 PoC，再同步修订 [高层架构设计文档](high-level-design.md)：

1. **AWS Bedrock AgentCore 区域开通与安全基线核查**
   - 核实企业已审批 AWS Region 对 AgentCore **Runtime（VPC Mode / PrivateLink）、Gateway（MCP）、Identity、Policy（Cedar）** 及 Bedrock 基础模型配额的开通状态；确认 MicroVM 短空闲超时（2–3 分钟）与成本上限护栏。
2. **最小云端受控 Dispatch 闭环 PoC（最高优先级）**
   - 选 1 个 As-Is 应用，跑通：`GitHub PR Webhook → Factory ECS → AgentCore Runtime (Knowledge Builder 刷新中央知识仓 + PR Auto Reviewer 经 Gateway 注入图谱/Wiki 发只读 Comment) → 结果回写 ECS 控制面`。
3. **Graphify 对遗留技术栈的 AST 覆盖度验证**
   - 实测 `tree-sitter` 对 COBOL、C/C++、PowerBuilder、Sybase SQL、Perl/JIL 的实际出图率与 `AMBIGUOUS` 边比例，确定轻量正则/静态补充脚本边界。
4. **`agent-kit` 的 Artifactory 发版与类 TanStack Intent 同步原型**
   - 验证本机 Copilot Squad 与 AgentCore MicroVM 镜像共同消费同一版 `@custody/agent-kit`，并跑通 Maintainer Source-Aware 漂移检查 CI。
5. **Verification Loop 首批下沉规则清单**
   - 从试点高频故障中挑出 5–10 条核心规则（密钥/脏文件、Sybase 语法残留、越界重构、Trailer 缺失、WP-00 基线防篡改），优先固化为本地与 AgentCore Stage 1 共享的确定性 Check。
