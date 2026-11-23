# 设计讨论备忘：Local Agent 架构收敛、OpenWiki / Graphify 与 `agent-kit` 演进

> **文档性质**：基于当前讨论与外部工具调研形成的阶段性设计备忘（供与 Manager 对齐架构收敛、触发时机与 PoC 验证项）。当前不替代现有 [高层架构设计文档](high-level-design.md) 与 [项目总览](../README.md)，待讨论拍板后再同步修订正式架构基线。

---

## 一、已确认的约束与基础设施前提（Reality Baseline）

在原有 [高层架构设计](high-level-design.md) 的基础上，结合最新团队与平台条件，以下现实约束已明确收敛：

1. **取消服务端 Dispatch Agent，全面转向 Local Agent**
   - 由于服务端主动派发（Dispatch）Headless Agent 存在现实限制，原 `Super Harness` 中在服务端容器调度 `Discovery / Campaign / Auto-Triage / Crystallization Worker` 的路线大概率不再可行。
   - 代码理解、改造、修复与经验记录全部回收到工程师本机的 **Local Agent**（基于团队已有 `agent-kit` Git 仓库，挂载 GitHub Copilot Squad + Bots）。
2. **Blitzy 保持“纯黑盒”边界**
   - Blitzy（主要用于 8 个 Modernize 核心应用）无法挂载自定义 MCP，也无法介入其内部过程控制与 Hook。
   - 治理策略收敛为**死守“入口 + 出口”双边界**：入口喂入权威确定性规格包（含双源依赖与 SME 确认规则），出口只认 GitHub PR + 独立人工 Review + `WP-00` 黄金基线独立双跑比对（绝不采信黑盒自写自跑的测试）。
3. **已确认的工程与基础设施条件**
   - **Git 仓库**：允许新建企业内部 Git 仓库（可用于集中托管 Graph / Wiki 知识库，以及维护 `agent-kit`）。
   - **制品分发**：已有内部 **Artifactory**，可用于分发版本化的 `agent-kit` 包。
   - **运行环境**：已有 **ECS** 可用，且内部聚合/控制类 Web App **一个 DEV 环境即可满足需求**，无需背负生产级长周期合规上线审批。
   - **推理通道**：OpenWiki / Graphify 的 LLM 推理大概率需要走 **GitHub Copilot 内部通道**。
   - **否定项（推翻早期错误假设）**：
     - 不存在或不适用 GitHub Enterprise Pages / S3 / SharePoint 静态站点托管推送；
     - 在 CI 中跨多个企业系统（Jira / SNOW / Harness / GitHub）拉取 API 并自动推回 GitHub 仓库实现难度高、阻力大；
     - 上述两项客观条件，正是**保留极薄中央 Web App（运行在 ECS DEV 环境）**而非“零服务器静态大盘”的真实物理初衷。

---

## 二、知识层设计：OpenWiki + Graphify 与中央知识仓

在全面转向 Local Agent 后，每个工程师本机各自盲扫老代码会导致 Token 浪费、跨应用上下文割裂以及经验断层。引入 **Graphify + OpenWiki** 组成双层“共享编译态代码知识层”，为 Local Agent 提供持久记忆。

### 2.1 LangChain OpenWiki 核心调研结论

- **基本属性**：`langchain-ai/openwiki`（MIT 协议，TypeScript / Node.js $\ge$ `22.22.0`，底层基于 LangChain `deepagents`，本地依赖 `better-sqlite3`）。定位是 **面向 AI Coding Agent 的编译态 Markdown Wiki**（而非人类问答站）。
- **核心机制**：
  - **OKF v0.2 格式**：生成无 frontmatter 的渐进式索引 `openwiki/index.md` 及带 YAML frontmatter 的主题页，附带 `.page-manifest.json`。
  - **Grounded Claims（证据强绑定）**：关键论断抽离至 `openwiki/.claims/*.json`，将陈述绑定到具体源码路径与文件 SHA-256 哈希（`repo://...` + `sha256:...`），支持**无模型确定性过期检测**与基于 `git diff` 的增量更新。
  - **人工约束与敏感屏蔽**：支持用户编写且不会被覆盖的 `openwiki/INSTRUCTIONS.md`（可定制遗留代码提取重点）与 `.openwikiignore`（过滤密钥/测试数据/生成物）。
  - **Agent 联动与可视化**：自带本地 MCP Server（`openwiki_read` 等）、`openwiki link` / `openwiki workspace` 跨仓关联检索，以及 `openwiki visualize`（含 `--export <dir>`）交互图谱浏览器。
  - **隐私与企业安全基线**：需强制设置 `OPENWIKI_TELEMETRY_DISABLED=1`（或 `DO_NOT_TRACK=1`）关闭匿名遥测，按需关闭外部 LangSmith 追踪。
- **GitHub Copilot 通道的两种原生运行模式**：
  1. **Provider 模式（`OPENWIKI_PROVIDER=copilot`）**：
     - 本地运行可直接复用 `gh auth login` 登录态（Token 留在 GitHub CLI 凭据库中，不写入 `~/.openwiki/.env`）；
     - 若需在 CI/Headless 环境运行，必须配置 OAuth Token 环境变量 `COPILOT_API_KEY`（注意：GitHub Classic / Fine-grained PAT 会被 Copilot API 拒绝），可选配置 `COPILOT_BASE_URL` 与 `OPENWIKI_MODEL_ID`。
  2. **Host-Driven 模式（`openwiki integrations install copilot`）**：
     - 由 GitHub Copilot CLI 作为宿主直接驱动 OpenWiki 页面任务生命周期、校验与收口，复用 Copilot 自身会话与凭证，无需单独配置独立 Provider 密钥。

### 2.2 Graphify 核心调研结论

- **基本属性**：开源代码知识图谱工具与 AI 助手技能（支持通过 `uv tool install graphifyy` 等方式安装），专注解决 Agent 大范围 `grep` 源码的低效与高 Token 消耗。
- **核心机制**：
  - **零 LLM 成本的确定性 AST 解析**：底层使用 `tree-sitter` 在本地直接解析源码结构，不消耗大模型 Token 即可构建调用链、类型与依赖关系图，且原始代码无需出域。
  - **多源融合与可信度分级**：支持同时将代码、Markdown 文档、PDF、架构图、配置及 SQL Schema 纳入同一图谱；生成 `graphify-out/graph.json`、`GRAPH_REPORT.md` 与交互视图 `graph.html`，图谱边明确标注 `EXTRACTED` / `INFERRED` / `AMBIGUOUS`。
  - **Copilot 原生集成与图查询**：通过 `graphify vscode install`（或 `graphify install`）向 `.github/copilot-instructions.md` 注入检索指引/技能，支持 `graphify extract .` 构建以及 `graphify query` / `graphify path` / `graphify explain` 等精准图查询。

### 2.3 互补定位、中央知识仓与 Blitzy 分工

| 维度 | **Graphify** | **LangChain OpenWiki** |
| :--- | :--- | :--- |
| **核心优势** | 确定性 `tree-sitter` AST 解析，**零 LLM 成本**、速度快，精准抓函数调用与静态结构 | 基于 `deepagents` 提取模块意图、业务流语义，并用 `.claims/*.json` 绑定源码 SHA-256 哈希防漂移 |
| **短板与风险** | 对没有现成 `tree-sitter` 语法的老旧栈（如部分 COBOL/PowerBuilder 方言）覆盖度待实测 | 依赖 LLM 推理耗时与限流（大仓需配增量更新与并发控制），Copilot CI OAuth 鉴权受限 |
| **协同定位** | **底层确定性结构骨架**（先跑结构图与依赖报告） | **上层代码语义地图 + 跨仓 MCP 记忆层** |

- **存放位置：集中托管至新建的中央知识 Git 仓库**
  - 利用“允许新建 Git 仓库”的条件，新建独立知识仓（如 `migration-knowledge`），内部按 `<app-id>/graph/` 与 `<app-id>/openwiki/` 组织全部 78 个应用的图谱与 Wiki 产物。
  - **优势**：① 对 78 个受控业务仓**零侵入**，不污染业务仓 Git 历史、不触发业务 PR 行数卡口与冗余构建；② 工程师本机只需同步该知识仓，配合 `openwiki link` / Workspace 即可让 Local Agent 跨应用检索上下游关系；③ 若将来需要做运维移交（Handover），图谱和文档天然集中完整。
  - **明确边界**：OpenWiki / Graphify 仍只看见静态代码与文档，**绝不替代**“静态扫描 + Sybase 运行时审计日志”双源结构化依赖账本。
- **与 Blitzy 的分工（避免重复烧 Token）**：
  - **58 个 As-Is 应用**：主力使用 Graphify + OpenWiki 支撑本地 Copilot Squad 理解与改造。
  - **8 个 Modernize 应用**：在重构期避免先让 OpenWiki 全量解析 150 万行老代码再丢给 Blitzy 建图造成双份成本；待 Blitzy 交付新代码 PR 后，再用 Graphify + OpenWiki 为新系统建立团队完全自主拥有的长效知识库。

### 2.4 触发时机设计：拒绝 `pre-commit`，收敛至 PR 阶段

- **为什么不放在 `pre-commit hook`？**
  - 开发过程中本地 WIP 提交高频琐碎，若在 `pre-commit` 挂入全量图谱构建或调 Copilot 通道生成/刷新 OpenWiki，会严重拖慢每次 commit 体验，最终迫使开发者使用 `--no-verify` 习惯性跳过所有钩子（连带绕过密钥检查等安全防线）。
- **推荐设计：PR 生命周期分层触发**
  1. **轻量确定性阶段（PR 创建 / 每次 Push 到 PR 分支）**：
     - 仅运行**零 LLM 成本、秒级完成**的检查：① Graphify 增量 AST 解析更新（或只读差异检测）；② OpenWiki 无模型确定性过期检测（扫描 `openwiki/.claims/*.json` 的 SHA-256 哈希变化，列出受本次 PR 影响而失效的知识页面清单）；③ 执行 `agent-kit` 确定性 Verification Loop（Lint / Type / Schema / 安全检查）。
  2. **语义增量刷新阶段（PR Ready for Review / 合并前后）**：
     - 仅针对本次 PR `git diff` 涉及且被标为失效的页面，触发 OpenWiki 增量刷新，并将最新 `graph/` 与 `openwiki/` 产物推送/PR 回中央知识仓。
     - **⚠️ 需 PoC 实测的通道约束**：若 PR CI 环境无法合规获取 Copilot OAuth `COPILOT_API_KEY`（或受限于 Copilot 内部通道只允许本地 IDE/CLI 登录态），则采用**混合模式**——**由作者在提 PR / 标记 Ready 前于本机跑一条标准化命令（如 `agent-kit wiki sync --pr`）走本地 Copilot 通道完成增量刷新并推入中央知识仓，PR CI 检查仅做纯确定性的“知识仓最新状态与 Claim 哈希一致性”校验**。

---

## 三、`agent-kit` 的维护机制与工程纪律（类 TanStack Intent + `pstack` 验证环）

团队已有 `agent-kit` 仓库（包含 `standards.md`、UI skill、todo、`jira integration for agent work log` 等雏形）。在全面 Local Agent 模式下，`agent-kit` 不能只是一份静态 Markdown 文档集，而要演进为**“可版本化分发的协议包 + 确定性验证底座”**。

### 3.1 维护与分发机制：借鉴 TanStack Intent 模式

参考 `@tanstack/intent` 的设计思路，借助内部已有 **Artifactory** 解决“78 个仓库拷贝 `standards.md` 后各自漂移、无人同步”的痛点：

1. **消费端（Package-Driven，告别手工拷贝）**
   - 将 `agent-kit` 封装为按 SemVer 发版的标准化工具/技能包，发布至内部 **Artifactory**（npm / CLI 包）。
   - 各业务仓库通过统一命令与配置文件（类似 `intent install` + allowlist/exclusion 清单）按需声明并投影本地 Copilot Squad 所需的 Rules、Skills、Playbooks 与校验脚本；版本升级即同步更新对应的规范与工具链。
2. **维护端（吸收 Intent v0.5+ Maintainer Workflow 与 Source-Aware Check）**
   - 在 `agent-kit` 仓库内建立 Maintainer 流水线：PR 修改底层配置 Schema、工作包配方或探测脚本时，CI 自动执行**技能/示例格式校验**及**源变更感知检查（Source-Aware Review）**，提示维护者同步修订关联的 `SKILL.md` 与 `standards`，防止规范与真实工具脱节。
   - 结合业务仓提交附带的 `Agent-Kit-Version` 元数据，确保线上已知失效或有缺陷的旧版配方可被 PR Check 及时拦截提示升级。

### 3.2 吸收 `poteto/pstack` 的两大核心精髓

`poteto`（Lauren Tan）的 `pstack` 核心思想是 **“Quality over Slop（质量压倒水代码）”**、**“Structure over Text（能用确定性结构锁死的，绝不靠散文嘱咐）”** 与 **“Prove It Works（必须拿出跑通的证据）”**。`agent-kit` 应重点吸收以下两块落地能力：

#### 1. 确定性 Verification Loop 与规则下沉（核心发力点）
把 `standards.md` 中“AI 和人都容易反复犯错的注意事项”，持续编译下沉为四层确定性拦截机制，形成紧凑的本地自修正闭环：

```text
  [0] standards.md 散文规则（最弱，易随上下文膨胀被忽略）
          │  ← 每次发生 Red → Green 踩坑，就向下沉一层！
          ▼
  [1] 自定义 Lint / 静态分析规则（Semgrep / ESLint / SQLFluff / 自定义 AST 与正则）
      → 精准抓：Sybase 专有语法残留、Solaris 命令用法、硬编码密钥、As-Is 越界修改无关文件
  [2] Type-Safe & Schema 强约束（TypeScript / Zod / JSON Schema）
      → 锁死：Onboarding 参数包、证据 Manifest、Jira Work Log 载荷、Commit Trailer 格式
  [3] 本地紧闭环自修（借鉴 pstack hillclimb / Prove It Works 原则）
      → Local Agent 改完代码，必须跑 `agent-kit verify`（Lint + Typecheck + 单测 + WP-00 基线比对）
      → 报错信息直接精准回喂给 Local Agent 修复（每次对照冻结基线收敛一个变量），拿不出全绿证据不交差
  [4] 同口径 PR CI Checks
      → 将第 1–3 层完全相同的校验脚本固化进业务仓 PR CI，确保 Copilot Squad 与黑盒 Blitzy 吐出的 PR 过同一把尺子
```

#### 2. 拆解巨型规范与引入专职只读 Bots
- **四层结构化拆解（借鉴 `/poteto-mode`）**：避免单一超长 `standards.md` 引发上下文腐烂，拆分为：**Router 总入口**（按任务类型自动路由规则与上下文） $\rightarrow$ **`principles/`**（不可违背的工程原则，如严格限制 As-Is 爆炸半径 `Blast Radius`） $\rightarrow$ **`playbooks/`**（按 `WP-00~07` 与排障固化的步骤流） $\rightarrow$ **`skills/`**（原子操作技能）。
- **专职只读挑刺 Bots（借鉴 `Comment Sicko` 与“写/审分离”原则）**：利用 Copilot Squad 拆出职责极单一的只读 Subagent，在提 PR 前把关：
  - `Blast-Radius Bot`（只读）：核对 Diff 是否越界改动了非目标改造范围的业务逻辑；
  - `Baseline-Guard Bot`（只读）：核查是否修改了 `WP-00` 黄金基线或验收测试，核验实跑通过日志；
  - `Jira-Logger Bot`（受限写 Jira）：在通过上述验证与 PR 创建后，自动将关联 PR、改动摘要与工作包状态按结构化格式回写 Jira Work Log。
- **经验回流闭环（借鉴 `brainmaxxing`）**：保留 `/reflect` 类技能，工程师在本地完成 `Red → Green` 修复后，一键提炼根因与规则建议，向 `agent-kit` 仓库发起升级 PR（新增 Lint Rule、Playbook 修正或 Skill 更新）。

---

## 四、中央形态收敛：Manager（A）与 个人（B）的统一落地方案

### 4.1 碰撞与复盘结论：哪些去中心化，哪些必须留在中央？

经过对“纯分散 `agent-kit`（偏 A）”与“中央控制台（偏 B）”的交叉挑战与基础设施条件核实，架构责任切分收敛如下：

- **彻底去中心化（采纳 A 的核心效率与低摩擦优势）**：
  - 不在服务端建重型 Agent Runner 调度集群；
  - 不自建代码修改执行器，改码与本地 Verification Loop 100% 落在各应用仓 + `agent-kit`（Artifactory 分发）；
  - 不再让中央 Web App 重复接管单应用日常开发任务流（任务明细与 Agent Work Log 由 `agent-kit` 的 Bot 按协议直接回写 Jira）。
- **保留极薄中央 Web App（运行在 ECS DEV，解决 B 的真实物理痛点）**：
  - 既然没有 GHE Pages / S3 / SharePoint 可用来托管静态聚合视图，且 CI 跨多系统调 API 写回 GitHub 困难，**在已有 ECS 上部署一个 DEV 级极轻内部 Web App（无需重型生产审批）** 是最具性价比的解法。
  - **它坚决不做的事**：不做服务端 Dispatch Agent、不替代 Jira/GitHub 承载日常开发流、不自建在线代码/规则 IDE（规范升级全走 `agent-kit` GitHub PR）。
  - **它专注解决的三件“分散模式搞不定”的事**：
    1. **跨应用批量追踪与全景进度（不问人掌握全局）**：自动串联 `Jira ↔ PR ↔ 改动列表 ↔ Harness 构建/扫描状态 ↔ Onboarding 排队时长`，让管理与团队随时看清 78 个应用和按批次（Wave）推进的真实进度与误期风险；
    2. **全局共享数据库双源依赖账本**：统一维护“静态代码扫描 + Sybase 运行时审计日志”交叉核验后的“应用 $\leftrightarrow$ 表 $\leftrightarrow$ Wave”依赖锁，防止 Cutover 排期倒挂；
    3. **后续按需挂载 SME 业务规则确认台**：支撑 Modernize 阶段按交易流聚合呈现业务规则、源码片段与 `WP-00` 基线真实例证（在 Jira 纯文本中极难审阅）。

### 4.2 粘合分散执行与中央视图的 5 条核心协议（落进 `agent-kit`）

为了让“分散执行的 `agent-kit` / Blitzy”与“ECS DEV 轻量中央 Web App”无缝对接且**不增加人工手工填表负担**，需在 `agent-kit` 中固化以下 5 条机器可解析协议（由 Bot / Hook 自动注入）：

1. **全局关联锚点协议（Correlation ID）**：所有分支名、PR 模板及 Git Commit Trailer 自动携带 `Migration-App`、`Migration-Unit`、`Migration-Wave`、`Migration-WP`、`Migration-Task (Jira Key)`、`AI-Tool`、`AI-Model`、`Agent-Kit-Version`。
2. **Jira 结构化 Work Log & Waiver 协议**：约定 `agent-kit` 的 Jira Bot 写入固定格式字段块（关联 PR URL、活动类型、外部单号、阻塞原因、AI 标记），使中央同步逻辑能稳定抽取而非靠正则猜自然语言。
3. **机器可读证据 Manifest 协议**：`WP-00` 基线包与 `WP-01~07` 的 Verifier 运行完成后产出标准 JSON 证据摘要（构建 SHA256、基线样本比对结果、测试/扫描结论、Commit SHA），供 PR CI 与中央账本统一消费（同样适用于验收 Blitzy PR）。
4. **跨应用全局注册表协议**：在中心受控仓库维护标准化 `apps.yaml` 与 `db-dependencies.yaml`（标注来源 `static | runtime_log | confirmed`），作为跨 78 应用的权威清单与 Wave 锁基线。
5. **知识仓与安全红线协议**：统一中央知识仓（`<app-id>/graph/`、`<app-id>/openwiki/`）目录结构、统一的 `INSTRUCTIONS.md` / `.openwikiignore` 模板，以及不可逾越的 `guardrails.md` 黑名单规则。

---

## 五、待确认项与 PoC 验证清单（供下次讨论拍板）

建议围绕以下 5 项具体问题与 Manager 对齐后，用 1–2 周完成轻量 PoC 验证，再将结论正式合入 [高层架构设计文档](high-level-design.md)：

1. **OpenWiki 在 Copilot 内部通道的实测与 PR 触发路径拍板**
   - 实测本地 `OPENWIKI_PROVIDER=copilot`（复用 `gh auth`）与 `openwiki integrations install copilot`（Host-Driven）两种模式在企业内网环境下的可用性、响应速度与限流情况；
   - 核实 PR CI Runner 是否允许并能稳定获取 Copilot OAuth `COPILOT_API_KEY`；若不可行，确认改为“PR 前本地一键 `wiki sync` + CI 校验知识仓哈希新鲜度”的混合触发方案；
   - 确认由谁、以何种凭据将 PR 增量更新自动提交至新建的中央知识仓库（`migration-knowledge`）。
2. **Graphify 对遗留技术栈的 AST 覆盖度验证**
   - 选取典型应用实测 Graphify `tree-sitter` 对当前仓库语言的解析能力（重点验证 COBOL、C/C++、PowerBuilder、Sybase SQL、Shell/JIL 的实际出图率与盲区），评估对未覆盖方言是否需补充轻量静态解析脚本。
3. **`agent-kit` 的 Artifactory 发版与类 TanStack Intent 同步原型**
   - 与已有 `agent-kit` 仓库现状对齐，设计基于 Artifactory 的包结构、目标仓安装/更新命令行体验、allowlist 配置文件，以及维护端 Source-Aware 检查 CI 雏形。
4. **`pstack` Verification Loop 首批下沉清单**
   - 盘点现有试点中最容易反复出错的 5–10 类问题（例如密钥/脏文件、Sybase 语法遗漏、越界修改、Jira Key/Trailer 缺失、跳过基线检查），优先将其编写为可本地运行且可直接放进 PR Check 的 Lint / Type-Safe Schema / 确定性校验脚本。
5. **ECS DEV 轻量中央 Web App 的最小作用域对齐**
   - 与 Manager 正式对齐：**放弃重型编排与写操作控制台，但在 ECS DEV 部署一个极薄的只读聚合与依赖账本 Web App**；明确 MVP 阶段优先对接的数据源范围（如先打通 Jira + GitHub + 全局注册表，解决批量任务追踪、Jira $\leftrightarrow$ PR 关联与进度可视化痛点）。
