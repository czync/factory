# Migration Control Plane — Precision Minimalism Design System

> **Direction A: Linear / Vercel Precision Minimalism** — 面向托管银行核心应用迁云的轻量级追踪与知识聚合工作台（Light Mode First，支持 Crisp Dark Mode 切换）。

---

## 1. 色彩预算（90 / 8 / 2 原则）与双主题令牌

采用 CSS `color-scheme` + `light-dark()` 与 `<meta name="color-scheme">` 联动映射，默认浅色工作台（`data-theme="light"`），消除视觉噪音并保持高信噪比。

### 90% 纯净中性灰度层（Neutral Grayscale）

| 语义令牌 | Light（默认） | Dark | 用途 |
| :--- | :--- | :--- | :--- |
| `--bg-canvas` | `#FAFAFA` | `#0C0D10` | 主画布底色 |
| `--bg-sidebar` / `--bg-subtle` | `#F5F6F7` | `#111318` | 侧边栏、表头、次级沉降区 |
| `--bg-surface` | `#FFFFFF` | `#15181F` | 主列表、卡片、抽屉、弹窗平面 |
| `--bg-hover` / `--bg-surface-hover` | `#F2F4F7` | `#1B1F28` | 表格行、导航项悬停反馈 |
| `--bg-well` | `#F4F5F7` | `#101218` | CLI 命令条、代码片段、徽章中性底槽 |
| `--line` | `rgba(15, 23, 42, 0.08)` | `rgba(255, 255, 255, 0.08)` | 1px 标准发丝分隔线 |
| `--line-subtle` | `rgba(15, 23, 42, 0.05)` | `rgba(255, 255, 255, 0.05)` | 行内次级分隔线 |
| `--line-strong` | `rgba(15, 23, 42, 0.14)` | `rgba(255, 255, 255, 0.14)` | 输入框、次级按钮与弹窗外框 |
| `--ink` | `#111318` | `#EEF0F4` | 主文、标题、数值 |
| `--ink-secondary` | `#4B5563` | `#A1AAB8` | 辅文、表格常规列 |
| `--ink-muted` | `#6E7781` | `#6D7684` | 表头、次要标签、说明文本 |
| `--ink-faint` | `#8C959F` | `#555E6C` | 时间戳、分隔符、禁用提示 |

### 8% 低饱和石板钴蓝强调色（Low-Saturation Slate-Cobalt）

| 语义令牌 | Light | Dark | 用途 |
| :--- | :--- | :--- | :--- |
| `--accent` | `#3B5B92` | `#7496CF` | 焦点环、当前导航、Hairline Tab 下划线、链接与选中指示 |
| `--accent-soft` | `rgba(59, 91, 146, 0.09)` | `rgba(116, 150, 207, 0.13)` | 选中行底色、文本选区、轻强调底 |
| `--accent-line` | `rgba(59, 91, 146, 0.24)` | `rgba(116, 150, 207, 0.28)` | 强调徽章与活跃容器描边 |
| `--btn-primary-bg` | `#18181B` | `#F3F4F6` | 主操作按钮高对比度墨色面（配合 `--btn-primary-ink`） |

### 2% 克制语义信号（Quiet Normalcy）

- **正常态静默（Quiet Normalcy）**：已通过、按期推进、已同步状态统一使用中性文字 + 6px 柔和翠绿圆点（`--signal-ok`: `#2D8659` / `#4BA87A`），**严禁满屏大面积绿色胶囊**。
- **阻塞 / 失败（`--signal-danger`）**：`#C23B4B`（Light）/ `#E06C7A`（Dark），仅用于硬阻断、CI 红灯、共享库 Wave 倒挂。
- **等待 / 过期（`--signal-warn`）**：`#AD6B15`（Light）/ `#D99B43`（Dark），仅用于 P90 审批超期、OpenWiki Claim 过期、待人工签字。

---

## 2. 排印、紧凑几何与动效纪律

- **字体**：自托管 `Geist Variable`（正文/标题）+ `Geist Mono Variable`（编号、Jira Key、Commit/SHA-256、CLI 命令、时间），全局数字与等宽区域启用 `font-variant-numeric: tabular-nums`。
- **字号与密度**：正文 `13px`（行高 `1.5`），等宽元数据 `11.5–12px`，高密度表格行高 `40–44px`。
- **紧凑圆角**：`--radius-xs: 4px`（代码/标签）、`--radius-sm: 6px`（按钮/输入框/导航项）、`--radius-md: 8px`（表格/卡片/命令条）、`--radius-lg: 10px`（抽屉/弹窗）。
- **克制微动效系统（`motion/react` + `src/lib/motion.ts`）**：
  - 冷静时序令牌：`110ms ease-out`（`--dur-fast` / `EASE_FAST`）用于 hover/态切换；`170ms cubic-bezier(0.2, 0, 0, 1)`（`--dur-overlay` / `EASE_CALM`）用于抽屉与弹窗入退场。
  - 无回弹阻尼弹簧预设（`src/lib/motion.ts`）：`SPRING_TACTILE`（`stiffness: 520, damping: 36, mass: 0.7` + `TAP_PRESS` `scale: 0.975` 触觉按压）、`SPRING_INDICATOR`（`stiffness: 460, damping: 34` 共享 `layoutId` 滑移指示器）、`SPRING_CHECK`（`bounce: 0, duration: 0.24` 勾选路径绘制）。
  - **无障碍减动兜底**：全局外层（[AppShell.tsx](file:///Users/ziyu/Workspace/factory/src/components/AppShell.tsx)）包裹 `<MotionConfig reducedMotion="user">`，并在组件内配合 `useReducedMotion()` 与 CSS `@media (prefers-reduced-motion: reduce)` 将位移与弹簧退化为瞬时或纯透明度过渡。
- **零视觉噪音**：全面移除胶片噪点（`.studio-grain`）、径向环境光晕（`--aura-primary`）、彩虹进度条、五层拟物键帽（`.keycap`）、`20px` 过大圆角、过冲弹性回弹（overshoot bounce）与抖动动画。

---

## 3. 核心原语与 Base UI / UIPros 基础层

- **`@base-ui/react` + `motion/react`（[Primitives.tsx](file:///Users/ziyu/Workspace/factory/src/components/ui/Primitives.tsx)）**：全站交互原语基于 Base UI v1.9 与 Motion 组合封装——`Button`（`whileTap` + `SPRING_TACTILE`）、`HairlineTabs`（`@base-ui/react/tabs` + `LayoutGroup` 驱动 `data-motion-indicator="true"` 1.5px `SPRING_INDICATOR` 滑移下划线）、`SelectField`（`@base-ui/react/select`）、`CheckboxField`（`@base-ui/react/checkbox` + `SPRING_CHECK` SVG `pathLength` 绘制）、`TooltipProvider`/`Tooltip`（`@base-ui/react/tooltip`）、`CollapsiblePanel`（`@base-ui/react/collapsible`），辅以 `StatusDot`（支持低饱和 `pulse` 脉冲）、`Badge`、`CopyCommandBar`（`AnimatePresence` 复制状态切换）、`Kbd`、`EmptyState`。
- **[SlideDrawer.tsx](file:///Users/ziyu/Workspace/factory/src/components/ui/SlideDrawer.tsx)、[NativeDialog.tsx](file:///Users/ziyu/Workspace/factory/src/components/NativeDialog.tsx) & [CommandPalette.tsx](file:///Users/ziyu/Workspace/factory/src/components/CommandPalette.tsx)**：基于 `@base-ui/react/dialog` 提供焦点隔离、Esc / Backdrop 轻退、双向 `overscroll-behavior: contain` 与 170ms 平滑入退场；`CommandPalette` 内置 `LayoutGroup` + `layoutId` 活动行平滑高亮，[AppShell.tsx](file:///Users/ziyu/Workspace/factory/src/components/AppShell.tsx) 侧边栏导航同样采用 `LayoutGroup` 共享指示与主题图标过渡。
- **`UIPros / affectUI` 完整组件套件（12 个组件，`src/components/uipros/`）**：
  - `ToolAccessMap`（[tool-access-map.tsx](file:///Users/ziyu/Workspace/factory/src/components/uipros/tool-access-map.tsx) → [KnowledgeDepsPage.tsx](file:///Users/ziyu/Workspace/factory/src/routes/KnowledgeDepsPage.tsx)）：可视化 AgentCore Gateway 托管 MCP 工具权限边界（实线可用 vs 虚线 Cedar 物理拒绝），支持点击检视与 JSON 入参重放。
  - `AgentFindings`（[agent-findings-clean.tsx](file:///Users/ziyu/Workspace/factory/src/components/uipros/agent-findings-clean.tsx) → [BatchTracePage.tsx](file:///Users/ziyu/Workspace/factory/src/routes/BatchTracePage.tsx)）：聚合 `Blast-Radius`、`Migration-Semantics`、`Contract & Blitzy-Gate` 审校器进度与实时拦截发现流，点击条目直达应用抽屉。
  - `ApprovalGates`（[approval-gates.tsx](file:///Users/ziyu/Workspace/factory/src/components/uipros/approval-gates.tsx) → [StandardsReviewPage.tsx](file:///Users/ziyu/Workspace/factory/src/routes/StandardsReviewPage.tsx)）：将人类决策门禁呈现为可翻阅卡片堆栈（Approve / Edit / Reject + 阻塞步骤），并与浏览器 SHA-256 防篡改账本实时联动。
  - `SegmentedControl`（[segmented-control-clean.tsx](file:///Users/ziyu/Workspace/factory/src/components/uipros/segmented-control-clean.tsx) → [AppShell.tsx](file:///Users/ziyu/Workspace/factory/src/components/AppShell.tsx)、[ApplicationsPage.tsx](file:///Users/ziyu/Workspace/factory/src/routes/ApplicationsPage.tsx)、[KnowledgeDepsPage.tsx](file:///Users/ziyu/Workspace/factory/src/routes/KnowledgeDepsPage.tsx)、[StandardsReviewPage.tsx](file:///Users/ziyu/Workspace/factory/src/routes/StandardsReviewPage.tsx)）：替换手写分段按钮为带方向牵引指示器的 `tray`（`sm`）胶囊滑块控件，支持键盘与指针拖拽选择。
  - `CompactBreakdown`（[compact-breakdown-clean.tsx](file:///Users/ziyu/Workspace/factory/src/components/uipros/compact-breakdown-clean.tsx) → [ApplicationsPage.tsx](file:///Users/ziyu/Workspace/factory/src/routes/ApplicationsPage.tsx)）：紧凑型组合分布卡，按 Wave / Disposition / Risk 维度切换堆叠比例条与排行清单。
  - `AgentLedger`（[agent-ledger-clean.tsx](file:///Users/ziyu/Workspace/factory/src/components/uipros/agent-ledger-clean.tsx) → [AuditDrawerModal.tsx](file:///Users/ziyu/Workspace/factory/src/components/AuditDrawerModal.tsx)）：只读防篡改账本列表（`reversible: false` 不可逆锁标识 + SHA-256 前后哈希链对比）。
  - `TraceWaterfall`（[trace-waterfall-clean.tsx](file:///Users/ziyu/Workspace/factory/src/components/uipros/trace-waterfall-clean.tsx) → [AppInspectorDrawer.tsx](file:///Users/ziyu/Workspace/factory/src/components/AppInspectorDrawer.tsx)）：PR 自动预审 MicroVM 执行瀑布图（根编排器 → Gateway MCP 工具 / Bedrock 审校 Span 耗时与最慢标记）。
  - `ContextMap`（[context-map-clean.tsx](file:///Users/ziyu/Workspace/factory/src/components/uipros/context-map-clean.tsx) → [KnowledgeDepsPage.tsx](file:///Users/ziyu/Workspace/factory/src/routes/KnowledgeDepsPage.tsx)）：矩形树图展示渐进式 Agent 上下文注入预算（`agent-kit Rules`、`OpenWiki index.md & Claims`、`Graphify AST Impact Subgraph`、`Sybase Dual-Source Dep Ledger`、`WP-00 Baseline Summary`），支持 `Before`（全仓暴力扫描）vs `After`（渐进压缩注入）切换对比。
  - `ProgressTracker`（[progress-tracker-clean.tsx](file:///Users/ziyu/Workspace/factory/src/components/uipros/progress-tracker-clean.tsx) → [AppInspectorDrawer.tsx](file:///Users/ziyu/Workspace/factory/src/components/AppInspectorDrawer.tsx)）：可视化应用外部依赖工单（ServiceNow / SailPoint / CyberArk / Harness 等）完成进度清单。
  - `NumberTicker`（[number-ticker.tsx](file:///Users/ziyu/Workspace/factory/src/components/uipros/number-ticker.tsx) → [AppShell.tsx](file:///Users/ziyu/Workspace/factory/src/components/AppShell.tsx)、[ApplicationsPage.tsx](file:///Users/ziyu/Workspace/factory/src/routes/ApplicationsPage.tsx)、[BatchTracePage.tsx](file:///Users/ziyu/Workspace/factory/src/routes/BatchTracePage.tsx)、[KnowledgeDepsPage.tsx](file:///Users/ziyu/Workspace/factory/src/routes/KnowledgeDepsPage.tsx)、[StandardsReviewPage.tsx](file:///Users/ziyu/Workspace/factory/src/routes/StandardsReviewPage.tsx)）：等宽数字滚轮计数器（`duration` 380–400ms）驱动页头 KPI、侧边栏待办角标与摘要数字变化。
  - `BlurCrossfade`（[blur-crossfade.tsx](file:///Users/ziyu/Workspace/factory/src/components/uipros/blur-crossfade.tsx) → [BatchTracePage.tsx](file:///Users/ziyu/Workspace/factory/src/routes/BatchTracePage.tsx)、[KnowledgeDepsPage.tsx](file:///Users/ziyu/Workspace/factory/src/routes/KnowledgeDepsPage.tsx)、[StandardsReviewPage.tsx](file:///Users/ziyu/Workspace/factory/src/routes/StandardsReviewPage.tsx)、[AuditDrawerModal.tsx](file:///Users/ziyu/Workspace/factory/src/components/AuditDrawerModal.tsx)、[AppInspectorDrawer.tsx](file:///Users/ziyu/Workspace/factory/src/components/AppInspectorDrawer.tsx)）：以 `morph="none"` / `"height"`、`blur={3}`、`160–170ms` 柔焦交叉淡入替代生硬视图切换，避免布局抖动。
  - `ShimmerLoader`（[shimmer-loader.tsx](file:///Users/ziyu/Workspace/factory/src/components/uipros/shimmer-loader.tsx) 导出 `Skeleton` 与 `ShimmerText` → [KnowledgeDepsPage.tsx](file:///Users/ziyu/Workspace/factory/src/routes/KnowledgeDepsPage.tsx)、[AuditDrawerModal.tsx](file:///Users/ziyu/Workspace/factory/src/components/AuditDrawerModal.tsx)、[AppInspectorDrawer.tsx](file:///Users/ziyu/Workspace/factory/src/components/AppInspectorDrawer.tsx)）：在 AgentCore 知识增量刷新、PR 预审触发与 SHA-256 链校验期间展示轻量微光文本状态。
  - **令牌桥接（[index.css](file:///Users/ziyu/Workspace/factory/src/index.css)）**：统一覆写 `:root .ui-tam` / `.ui-afc` / `.ui-gate` / `.ui-segc` / `.ui-cbc` / `.ui-alc` / `.ui-twc` / `.ui-cmc` / `.ui-progressc` / `.ui-nt` / `.ui-bx` / `.ui-shm` / `.ui-shm-text` 变量至 Direction A Light + `[data-theme="dark"]` 双主题令牌，并通过 `.mcp-tab:not([data-motion-indicator="true"])[aria-selected="true"]::after` 兼容静态回退与 Motion 共享指示线。
- **`src/components/ui/DataTable.tsx`**：基于 `@tanstack/react-table` v9（`useTable` + `rowSortingFeature` + `Intl.Collator` 排序），遵循 `responsive-table` 与 `sortable-table` 规范：`tabindex="0"` + `role="region"` 滚动容器、吸顶表头与首列 `<th scope="row">`、`th > button` 排序触发器与单一 `aria-sort`、纯 CSS 驱动排序箭头、`role="status"` 实时播报、键盘 `ArrowUp`/`ArrowDown`/`Enter` 行导航，以及 `@container (width < 640px)` 移动端卡片堆叠布局。
