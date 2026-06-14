# Archify Design System

> 「开发者工具 / 终端美学」的暗色极简主义 —— 深空蓝底 + 蓝图网格 + 等宽字体 + 青色霓虹点缀。技术感克制而精致，适用于 SaaS 落地页、文档站、开发者工具官网。

---

## 1. 设计原则

- **Dark-first**：以近黑深蓝为基底，浅色为可切换变体。
- **终端 / 蓝图隐喻**：等宽字体、全屏网格、macOS 窗口符号，营造「工程画布」气质。
- **语义化配色**：强调色不是装饰，而是承载信息（每种颜色对应一类组件）。
- **克制的霓虹**：所有发光、阴影都用极低透明度，精致而不喧哗。
- **大留白 + 微交互**：信息密度中低，动效仅停留在「入场 / hover」级别。

---

## 2. 配色系统（Design Tokens）

### 中性色 — 深空蓝灰阶（Slate 系）

| Token | 值 | 用途 |
|---|---|---|
| `--bg` | `#020617` | 主背景（近黑深蓝） |
| `--bg-panel` | `rgba(15,23,42,.6)` | 半透明面板 |
| `--grid` | `#1e293b` | 网格线 |
| `--border` | `#1e293b` | 常规边框 |
| `--border-hi` | `#334155` | 高亮边框 |
| `--text` | `#f1f5f9` | 主文字（近白） |
| `--muted` | `#94a3b8` | 次要文字 |
| `--dim` | `#475569` | 最弱文字 |

### 语义强调色 — 七色（青为主品牌色）

| Token | 值 | 语义 | 暗色填充 |
|---|---|---|---|
| `--cyan` | `#22d3ee` | 前端 / 品牌主色 | `rgba(8,51,68,.45)` |
| `--emerald` | `#34d399` | 后端 | `rgba(6,78,59,.45)` |
| `--violet` | `#a78bfa` | 数据库 | `rgba(76,29,149,.45)` |
| `--amber` | `#fbbf24` | 云服务 | `rgba(120,53,15,.35)` |
| `--rose` | `#fb7185` | 安全 | `rgba(136,19,55,.45)` |
| `--orange` | `#fb923c` | 消息总线 | `rgba(154,52,18,.35)` |
| `--slate` | `#94a3b8` | 外部系统 | `rgba(30,41,59,.6)` |

**配色法则**：每个强调色配一个低透明度暗色填充，组合成「亮描边 + 暗填充 + 外发光」的霓虹卡片。色板取自 **Tailwind 的 Slate 灰阶 + 鲜艳 400 级色**。

```css
:root {
  --bg:#020617; --bg-panel:rgba(15,23,42,0.6); --grid:#1e293b;
  --border:#1e293b; --border-hi:#334155;
  --text:#f1f5f9; --muted:#94a3b8; --dim:#475569;
  --cyan:#22d3ee; --emerald:#34d399; --violet:#a78bfa;
  --amber:#fbbf24; --rose:#fb7185; --orange:#fb923c; --slate:#94a3b8;
  --cyan-fill:rgba(8,51,68,0.45); --emerald-fill:rgba(6,78,59,0.45);
  --violet-fill:rgba(76,29,149,0.45); --amber-fill:rgba(120,53,15,0.35);
  --rose-fill:rgba(136,19,55,0.45); --orange-fill:rgba(154,52,18,0.35);
  --slate-fill:rgba(30,41,59,0.6);
}
```

---

## 3. 字体排印

- **全站统一等宽字体**：`'JetBrains Mono', ui-monospace, Menlo, monospace`（Google Fonts，权重 300–700）。这是最强的风格标识 —— 把营销页做成代码编辑器的气质。
- **标题用紧字距**：H1 `letter-spacing:-.035em`，其余标题 `-.02em ~ -.03em`。
- **小标签用正字距 + 大写**：`letter-spacing:.12em; text-transform:uppercase`。
- **响应式标题**：`clamp(2.25rem,5vw,3.75rem)`，`line-height:1.1`，`text-wrap:balance`。
- **正文**：`.875rem ~ 1rem`，`line-height:1.7`，`color:var(--muted)`，`text-wrap:pretty`。
- **高亮词**用品牌青色：`h1 em { font-style:normal; color:var(--cyan); }`。

| 层级 | 字号 | 字重 | 字距 |
|---|---|---|---|
| Hero H1 | `clamp(2.25rem,5vw,3.75rem)` | 700 | -.035em |
| Section 标题 | `clamp(1.5rem,3vw,2.25rem)` | 700 | -.03em |
| 卡片标题 | `.9375rem ~ 1.25rem` | 600–700 | -.02em |
| 正文 | `.8125rem ~ 1rem` | 400 | — |
| 标签 / kicker | `.6875rem` | 600 | .12em（大写） |

---

## 4. 标志性视觉元素

1. **全屏蓝图网格** —— 双向 `linear-gradient` 画 `40px×40px` 网格，`opacity:.35`，`position:fixed`。呼应「架构图工具」主题。
   ```css
   .grid-bg {
     position:fixed; inset:0; pointer-events:none; z-index:0; opacity:.35;
     background-image:
       linear-gradient(var(--grid) 1px,transparent 1px),
       linear-gradient(90deg,var(--grid) 1px,transparent 1px);
     background-size:40px 40px;
   }
   ```
2. **极淡霓虹外发光** —— 色卡 `box-shadow:0 0 20px rgba(...,.12)`；hero 截图 `0 0 120px rgba(34,211,238,.06)`。
3. **毛玻璃导航** —— `backdrop-filter:blur(14px)` + 半透明底，固定 64px 高。
4. **多层阴影 + 内描边**做精致卡片：
   ```css
   box-shadow:
     0 0 0 1px rgba(255,255,255,.04) inset,
     0 24px 80px rgba(0,0,0,.6),
     0 0 120px rgba(34,211,238,.06);
   ```
5. **macOS 窗口红绿灯** —— 代码块顶栏三圆点 `#ff5f57 / #febc2e / #28c840`，强化终端隐喻。
6. **脉冲徽章** —— 呼吸小圆点（2.2s 循环），暗示 live / 活跃状态。

---

## 5. 布局规范

| 项 | 值 |
|---|---|
| 容器最大宽 | `1160px` |
| 容器内边距 | `0 2.5rem`（移动端 `1.25rem`） |
| Section 垂直间距 | `7rem 0`（移动端 `4.5rem`） |
| 导航高度 | `64px` fixed |
| Hero 顶部留白 | `11rem`（移动端 `8rem`） |

- **居中 Hero 结构**：徽章 → 大标题 → 副文案 → 双按钮 → 截图。
- **网格分割卡片**：`gap:1.5px` + 容器背景色露缝，做出无间隙的分割线效果，hover 才提亮卡片背景。
- **渐变分隔线**：`linear-gradient(90deg,transparent,var(--border-hi),transparent)`。
- **步骤时间线**：编号圆圈 + `::before` 画 1px 竖线连接。

### 圆角阶梯

| 尺度 | 半径 | 适用 |
|---|---|---|
| 小 | `.5rem` | 按钮、tab |
| 中 | `.75rem` | 面板、色卡、代码块 |
| 大 | `1rem` | 截图容器 |
| 特大 | `1.25rem` | 卡片矩阵 |
| 胶囊 | `999px` | 徽章、tag |

---

## 6. 组件

### 按钮

```css
.btn { display:inline-flex; align-items:center; gap:.375rem;
  padding:.5rem 1rem; border-radius:.5rem; font-family:inherit;
  font-size:.75rem; font-weight:600; cursor:pointer;
  border:1px solid transparent; transition:all .15s; }
.btn-primary { background:var(--cyan); color:#020617; border-color:var(--cyan); }
.btn-primary:hover { background:#67e8f9; border-color:#67e8f9; }
.btn-ghost { background:transparent; color:var(--muted); border-color:var(--border-hi); }
.btn-ghost:hover { color:var(--text); border-color:var(--muted); }
```

- **Primary**：青色实底，深色字，hover 变亮青 `#67e8f9`。
- **Ghost**：透明描边，hover 提亮文字与边框。

### Tab（图表类型切换）

- pill 风格，激活态 `background:rgba(34,211,238,.1)` + 青色字 + 青色淡边。

### 色卡 / 特性卡片

- 暗色填充 + 亮色描边 + 极淡外发光，hover 上浮 `translateY(-3px)`。

---

## 7. 动效（克制）

- **滚动入场** `.fade-up`：`opacity:0 → 1`，`translateY(28px → 0)`，`.65s ease`，由 `IntersectionObserver` 触发。
- **瀑布延迟** `.d1 ~ .d5`：`transition-delay` 以 0.1s 递增。
- **交互过渡**：统一 `.15s`。
- **脉冲动画**：
  ```css
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:.5;transform:scale(.85);} }
  ```
- 全部停留在「微交互」级别，无大幅动画，符合工具型产品的稳重。

---

## 8. 响应式断点

| 断点 | 变化 |
|---|---|
| `≤ 900px` | 多列网格塌成单列；色卡 7→4 列；导出 5→3 列 |
| `≤ 640px` | 导航 / 按钮纵向化；色卡 →3 列；导出 →2 列；隐藏次要导航链接 |

---

## 9. 复刻清单（四个支点）

1. **深空蓝底 `#020617` + 全屏淡网格** 打底
2. **JetBrains Mono 等宽字 + 紧字距标题** 定调
3. **Slate 灰阶中性色 + 七色鲜艳语义强调色（青为主）** 配色
4. **亮描边 / 暗填充 / 极淡外发光 + macOS 窗口符号** 做点睛

---

*提炼自 [Archify](https://tt-a1i.github.io/archify/) 官网设计。*
