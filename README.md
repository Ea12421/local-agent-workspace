# Local Agent Workspace

一个本地优先的 Agent Workspace（智能体工作台）：按项目管理 Bot，给每次运行保存状态、事件、权限审批、Provider 身份和产物。首个内置流程是 Product Builder（产品构建器）。

## 当前交付状态

这是一个可在 macOS 上本地运行的 v0.1 版本，已经完成：

- React + Vite Web 工作台；
- Node.js 本地服务与 SQLite 持久化；
- Project、Bot、Skill、Run、RunEvent、Session、Message、Approval 和 Artifact 的核心契约；
- Fixture（无 Key）诊断路径；
- Codex CLI 只读执行桥（可选，使用本机公开 CLI 路径）；
- DeepSeek API 的显式配置边界（不把 Key 写入仓库）；
- 项目绑定、会话消息回写、运行回执和重启读回；
- Electron macOS arm64 打包。

Fixture 只证明控制流程能运行，不代表真实模型质量。真实 Provider 的质量、成本收益和长期提效需要按固定任务单独验证。

## 快速开始

需要 Node.js 22+ 和 pnpm 9+：

~~~bash
pnpm install
pnpm setup
pnpm demo
pnpm dev
~~~

另开终端启动 Web：

~~~bash
pnpm dev:web
~~~

打开终端输出的本地地址。没有 API Key 也可以运行 pnpm demo 和自动化测试。

### 配置真实通道（可选）

复制 .env.example，再在本机环境中设置自己的变量：

~~~bash
export DEEPSEEK_API_KEY='your-key'
export DEEPSEEK_BASE_URL='https://api.deepseek.com'
export DEEPSEEK_MODEL='deepseek-chat'
~~~

不要把真实 Key 写入仓库、日志、Issue 或截图。Codex CLI 只通过本机已安装的公开 CLI 探测；它是执行桥，不等于公开 API 额度。

## macOS 安装包

最终 arm64 DMG：

~~~text
release/Local Agent Workspace-0.1.0-arm64.dmg
SHA-256: d3386b8e10af5309bf397c40d542f0a6f28a8c29c26fcefe4f09d26eb1b241f7
~~~

发布前已完成 DMG 镜像校验。当前包没有 Apple Developer ID 签名，首次打开可能需要 macOS 的常规安全允许；这不是签名发布版。

## 验证

~~~bash
pnpm test:all
pnpm typecheck
pnpm build:web
pnpm build:desktop
pnpm package:mac
~~~

发布前验证摘要见 validation/public/local-delivery-v1-2026-10-07.json。

## 目录

- packages/core：领域类型、状态机、RunEvent、上下文与记忆契约；
- packages/adapters：Provider、命令、工具和结构化输出适配器；
- packages/workflow：Product Builder 工作流；
- apps/server：本地 HTTP control plane（控制面）；
- apps/web：React/Vite 中文工作台；
- apps/desktop：启动同一套本地服务的 Electron 薄壳；
- SPEC：公开的产品、运行时、Provider、权限、恢复和安装契约；
- fixtures：无 Key 的确定性演示数据。

## 安全与边界

默认权限是“只读”。工作区写入、完全访问、外发、删除重要数据、生产配置、支付/发布和凭据读取都必须有明确审批。应用不会自动监听全局桌面，不会自动发送消息、发布或支付，也不会把 Provider 失败静默降级为 Fixture。

本发布分支只包含可复用源码、公开契约和脱敏验证摘要；个人复盘、聊天恢复、面试材料、本机真实项目和原始运行账本不在发布范围内。当前仓库的 main 历史可能包含旧的本地材料；本分支从干净根提交发布，未对旧历史做强制改写。

## 许可

当前仓库尚未选择开源许可证。你可以下载并在本地运行；如果要对外分发或二次开发，请先补充许可证和版权归属。
