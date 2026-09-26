# Environment Blocker / 外部环境阻塞说明

## 已确认事实

2026-09-26 在项目目录运行网络诊断：

- `registry.npmjs.org`：DNS 解析失败；
- `api.deepseek.com`：DNS 解析失败；
- `github.com`：DNS 解析失败；
- `curl https://registry.npmjs.org/pnpm`：`Could not resolve host`；
- 浏览器访问 registry：当前执行环境返回 `ERR_BLOCKED_BY_CLIENT`；
- macOS 系统设置显示 Wi-Fi 已连接，但当前执行环境无法读取完整 DNS 配置；网络设置修改需要管理员授权。

这说明阻塞在 DNS/出站网络或 Codex 执行环境的网络隔离层，不是项目业务权限和代码目录权限。

## 影响范围

阻塞：

- 下载 pnpm 和 npm 依赖；
- DeepSeek 真实调用；
- GitHub clean-room clone/安装；
- Vite 真实构建；
- Electron 打包。

不阻塞：

- Node 原生 Core/Workflow 测试；
- Fixture demo；
- HTTP handler 无端口测试；
- SPEC、状态机、权限和恢复机制开发。

## 推荐解决顺序

### 方案 A：修复当前 Mac 的网络/DNS（需要用户在动作时确认）

1. 检查 Wi-Fi、VPN、代理和家用路由器 DNS；
2. 在系统设置中查看 Wi-Fi 的 DNS/代理配置；
3. 如 DNS 为空、错误或被代理拦截，按用户选择修复；
4. 重新运行：

```bash
npm run diagnose:network
```

只有当 registry、DeepSeek 和 GitHub 至少能解析并访问，才继续安装。

### 方案 B：使用可访问的 npm mirror

设置项目级或用户级 registry，然后验证：

```bash
npm config get registry
pnpm config get registry
```

不要把账号密码或 Token 写进仓库。

### 方案 C：离线依赖缓存

在一台可联网机器执行 `pnpm install`/`pnpm fetch`，将经过核对的 pnpm store 或完整构建产物带到当前机器。需要保留版本和校验信息。

## 需要的权限

- 当前项目目录读写：已经具备；
- 当前项目本地端口监听：当前 Codex 沙盒不允许，正常 Terminal/桌面环境需要重新验证；
- 系统网络/DNS/代理修改：需要用户在 macOS 系统设置的具体动作前确认，并可能需要管理员密码；
- DeepSeek Key：由用户主动配置，程序只读取环境变量，不读取 Keychain/Cookie/Token 文件。

## 不会自动做的事

- 不会盲目切换 Wi-Fi；
- 不会关闭防火墙或安全软件；
- 不会读取或保存网络密码；
- 不会把真实 API Key 写入 Git；
- 不会因为一次 DNS 失败无限重试。
