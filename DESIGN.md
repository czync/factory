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
- **克制动效**：
  - 微交互状态：`110ms ease-out`（`--dur-fast` / `--ease-fast`）
  - 弹窗与右侧抽屉入退场：`170ms cubic-bezier(0.2, 0, 0, 1)`（`--dur-overlay` / `--ease-calm`）
  - 严格尊重 `prefers-reduced-motion: reduce`（退化为短时纯透明度过渡，零位移/零弹性回弹）。
- **零视觉噪音**：全面移除胶片噪点（`.studio-grain`）、径向环境光晕（`--aura-primary`）、彩虹进度条、五层拟物键帽（`.keycap`）、`20px` 过大圆角、弹簧回弹与抖动动画。

---

## 3. 核心原语与 Modern Web Platform 规范

- **`src/components/ui/Primitives.tsx`**：`Button`、`StatusDot`、`Badge`、`HairlineTabs`（原生 `tablist`/`tab` + `focusgroup="tablist nomemory"` + 方向键游标与强制高对比安全的 `::after` 1.5px 下划线）、`CopyCommandBar`、`Kbd`、`EmptyState`。
- **`src/components/ui/SlideDrawer.tsx` & `src/components/NativeDialog.tsx`**：基于原生 `<dialog>` 顶层 `showModal()`，省略冗余 `role="dialog"`/`aria-modal`，配置 `closedby="any"` + Safari `pointerdown`/`pointerup` 外区坐标回退、`cancel` 拦截与 `closeDialogWithFallback()` 离场过渡、以及 `dialog:modal` 与 `::backdrop` 双向 `overscroll-behavior: contain`。右侧抽屉固定 `height: 100svh`，桌面宽 `580px–620px`，移动端全宽。
- **`src/components/ui/DataTable.tsx`**：基于 `@tanstack/react-table` v9（`useTable` + `rowSortingFeature` + `Intl.Collator` 排序），遵循 `responsive-table` 与 `sortable-table` 规范：`tabindex="0"` + `role="region"` 滚动容器、吸顶表头与首列 `<th scope="row">`、`th > button` 排序触发器与单一 `aria-sort`、纯 CSS 驱动排序箭头、`role="status"` 实时播报、键盘 `ArrowUp`/`ArrowDown`/`Enter` 行导航，以及 `@container (width < 640px)` 移动端卡片堆叠布局。
