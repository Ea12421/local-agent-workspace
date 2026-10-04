# 受控测试/构建命令适配器验证

日期：2026-10-03

结论：PASS_INTEGRATED_DESKTOP

本轮交付的是适配器模块，不是 Web 中的任意命令执行入口。模块只接受两个固定 profile：

- project.test → npm run test
- project.build_web → npm run build:web

project.test 已通过一次真实受控执行：核心测试 7/7，退出码 0。适配器专项测试 6/6，
覆盖精确 argv、审批、权限、项目范围、输出上限、脱敏、超时、取消、授权撤销和幂等。

HTTP/UI 纵向专项测试 1/1，覆盖固定命令目录、dry-run、待审批 Run、重复提交、批准执行、
重复审批、拒绝、取消和只读 replay。批准执行后可以回读 `approval.resolved`、`tool.invoked`、
`tool.completed` 与 `run.succeeded`，重复审批不会再次启动进程。

Computer Use 桌面回归通过：从打包应用选择 `project.test`，看到实际一次性审批卡，批准后回读
`run.resumed`、`tool.invoked`、`tool.completed` 和 `run.succeeded`；刷新“运行记录”后事件链仍在。

project.build_web 已通过 profile 和 dry-run 校验。它会生成构建产物，声明了
write_build_output，因此后续真实执行必须显示准确命令和副作用并逐次审批。

这份结果只证明命令控制面、进程边界和本地 Web/API/桌面审批闭环，不证明 Codex 原生上下文压缩、
模型质量、prompt cache 命中率或成本下降。Codex/Text app-server 的 `Operation not permitted`
仍是独立环境阻塞，待环境变化后再决定是否恢复同一通道验证。
