# 维护约定

- 这是 Windows 单机检视环境的源码与部署备份，当前在用实例位于仓库外。修改仓库不代表需要重装或重启在用实例。
- 保留独立游戏副本、客户端/服务端临时 -insecure、本机监听和防火墙启动检查。原版 Steam 客户端目录只读。
- 临时文件放 D:\codex；不要把账号、SteamID、数据库、secrets.json、配装数据或日志提交 Git。
- 大型第三方安装包放 packages 并保持忽略。修改版本时同步更新 packages.lock.json、gamedata 快照、文档和验证结果。
- PowerShell 部署脚本必须兼容 Windows PowerShell 5.1。含中文的 PS1 使用 UTF-8 BOM；读取 JSON/源码时显式使用 UTF8。
- 默认先运行 tests/Check-Repo.ps1 和 tests/Test-Isolated.ps1。隔离测试使用 13307/17831，不应向正在玩的服务器发命令。
- 不要随意调用 inspect_apply、wp_refresh 或任何已有 live 测试改变用户正在看的装备。游戏内验收由用户确认或另行明确授权。
- LocalInspectBridge 的预编译 DLL、源码和 build-info.json 必须同步；保留“单次定向应用、换正确武器、视角恢复”的行为。
- 不宣称新机器已验证成功，除非实际完成那台机器上的部署和游戏验收；不承诺绝对零账号风险。
