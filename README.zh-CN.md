# AI Town Simulation

[English documentation](README.md)

一个可交互的虚拟小镇模拟器。居民拥有角色、人格、需求、经济状态和社会关系，会在网格地图中工作、吃饭、购物、治病、交谈，并响应不断变化的生存需求。

项目结合了确定性的本地规则和可选的 TypeSafe Jev AI 决策。Jev 负责建议普通的下一步行动，安全关键行为始终由本地模拟引擎控制。

## 功能

- 居民需求：饥饿、健康、现金、存款、贷款和魅力值。
- 状态机：`IDLE`、`WORKING`、`EATING`、`BANKING`、`SHOPPING`、`TREATING`、`SLEEPING`、`CRIMINAL` 等。
- 日程与经济：工作时间、工资、物价、利息、贷款和商店收入。
- 社交模拟：根据距离、时间、心情和关系生成本地 LLM 对话。
- 魅力竞赛：购物可以提升魅力，达到 100 分时结束模拟并生成最终排名。
- 风险事件：疾病、工作事故、饥饿、犯罪、逮捕和全镇灭绝。
- Canvas 网格地图、建筑物、路径规划和实时居民移动。
- 可选 JEV AI：使用 `jev-latest` 进行结构化决策，并显示在居民详情面板中。

## 技术栈

- Next.js 16.1.5（App Router）
- React 19、TypeScript
- Tailwind CSS 4、Lucide React
- HTML5 Canvas
- Ollama：本地对话模型 `qwen3:0.6b`
- `@typesafe-ai/sdk`：服务端 TypeSafe Jev 调用

## 快速开始

### 环境要求

- Node.js 20 或更高版本（TypeSafe SDK 要求）
- npm
- Ollama（启用居民对话时需要）

### 安装和运行

```bash
npm install
npm run dev
```

打开 <http://localhost:3000>。

### 配置 Ollama

```bash
ollama run qwen3:0.6b
```

默认 Ollama 地址为 `http://localhost:11434`。

## 启用 JEV AI

JEV 默认关闭。即使没有 API Key，模拟也可以完整使用本地规则运行。

在项目根目录创建或修改 `.env.local`：

```env
# 仅供服务端使用，不要写入客户端代码
TYPESAFE_API_KEY=your_typesafe_api_key
TYPESAFE_DEFAULT_MODEL=jev-latest
```

修改环境变量后重启开发服务器：

```bash
npm run dev
```

然后打开顶部工具栏中的 **JEV AI** 开关。对于普通 `IDLE` 居民，Jev 会从以下行动中选择一个：

`WORK`、`EAT`、`SLEEP`、`SHOP`、`TREAT`、`BANK`、`WANDER`、`WAIT`

居民详情面板会显示行动、目标地点、原因和置信度。超时、非法响应或 API 错误会自动回退到本地规则。

### 安全边界

- API Key 只由服务端 `/api/jev/decision` 读取。
- 饥饿、低健康、逮捕、寻路和资金校验仍由本地规则处理。
- 不要提交真实 API Key；`.env.local` 已被 Git 忽略。

## 常用命令

```bash
npm run dev       # 开发服务器
npm run build     # 生产构建
npm run start     # 启动生产服务
npm run lint      # ESLint 检查
npx tsc --noEmit  # TypeScript 检查
```

## 游戏控制

- **速度**：1x、5x、20x 模拟速度。
- **Wages / Prices / Risk**：调整工资、物价和事件风险。
- **Census**：增加或移除居民。
- **JEV AI**：切换 AI 决策；关闭后只使用本地规则。
- **居民详情**：查看状态、财务、魅力、对话和最新 JEV 计划。

## 项目结构

```text
src/
├─ ai/                         # 行为、对话和 JEV 提供器
├─ app/api/jev/decision/       # 服务端 TypeSafe SDK 接口
├─ components/                 # 地图、控制栏、详情和排行榜
├─ engine/                     # 世界、居民、移动和模拟逻辑
├─ hooks/useGameLoop.ts        # React 游戏循环和全局状态
└─ lib/                        # 外部服务和工具
```

## 故障排查

### `/api/jev/decision` 返回 503

表示服务端没有读取到 `TYPESAFE_API_KEY`。确认 `.env.local` 在项目根目录、变量名正确，然后重启 Next.js。

### `/api/jev/decision` 返回 502

表示请求已到达 TypeSafe API，但请求失败、超时或响应无效。检查开发服务器日志中的 `JEV decision failed`，并确认 API Key、账户权限和网络连接。

### 没有生成居民对话

确认 Ollama 正在运行且模型已安装：

```bash
ollama list
ollama run qwen3:0.6b
```

### 生产构建无法下载字体

`next/font` 构建时会请求 Google Fonts。离线环境下，请将 `src/app/layout.tsx` 改为本地字体或移除远程字体依赖；这与 JEV 无关。

## 设计目标

AI Town 探索“确定性模拟规则 + 可插拔 AI 判断”的混合架构：AI 提供情境化判断，模拟引擎负责世界规则、资源约束和安全保证。
