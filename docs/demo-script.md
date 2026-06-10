# Three-Minute Local Demo Route

完整录屏时间轴、旁白和降级方案见 [Demo 视频脚本](demo-video-script.md)。

1. 使用 Node 20+ 启动 API、独立 Worker 和 Web，登录演示账号。
2. 打开 **Control Center > CLI Runtimes**，配置本机 Claude Code executable path，启用后点击 **Test**。
3. 创建 Claude Code 单聊，绑定受管 workspace，请求修改文件。
4. 展示 Claude Code 只修改临时副本，聊天中出现 Diff Approval；批准后正式 workspace 才变化。
5. 创建群聊并 @ 两个 Agent，打开 **Task status** 展示持久化执行图。
6. 展示 Web Artifact 的隔离 iframe 预览、Markdown、Slides 版本和 PPTX 导出。
7. 对 Node workspace 先审批执行 `npm install`，再点击 **Start locally**；审批后打开代理预览 URL，并展示日志与停止操作。
8. 在 Electron 中导入本地目录副本、导出 Artifact，并观察部署通知。

本机 Runner 仅用于受信任的本地 Demo，不是操作系统级沙箱。
