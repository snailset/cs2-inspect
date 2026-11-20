# cs2-inspect

Windows 本机 CS2 饰品检视环境：独立服务端、网页配装、两级饰品选择、图片预览、搭配组合，以及一键启动/停止。基于 2026-11-15 的本机部署，已验证范围见 [验证记录](docs/验证记录.md)。

网页可切换枪械、刀具、手套，设置模板/磨损/贴纸并应用。枪械会发放对应武器；刀具会切到持刀视角；手套保留当前持有视角。弹匣正常消耗，按 R 换弹，备用弹药无限。图片是款式参考，具体模板和磨损以游戏内效果为准。

“我的搭配”按组合保存，支持步枪、手枪、刀具和手套整组应用。旧搭配自动迁入默认组合。服务端配置关闭热身；组合功能与配置已通过隔离测试，实际游戏效果仍以人工验收为准。

控制台提供十张常用地图的图标和中文名称，可选择后启动或在运行时切换。每次打开或刷新页面默认选择炙热沙城 II，不记忆上次选择；图标随仓库保存，支持离线显示。

已部署的检视服遇到 CS2 更新时，等 Steam 下载完成，退出 CS2，在控制台停止检视服务，然后双击安装目录的「更新检视服.cmd」。完成后照常启动检视。

## 在新 Windows 上部署

1. 安装并登录 Steam，把 CS2 更新完成，暂停其他 Steam 下载并退出 CS2。原版安装目录只作为复制源。
2. 把仓库放在 `D:\code\cs2-inspect`，或其他本地目录。打开普通 Windows PowerShell 5.1 / PowerShell 7：

```powershell
cd D:\code\cs2-inspect
Copy-Item .\deploy.config.example.psd1 .\deploy.local.psd1
notepad .\deploy.local.psd1
```

3. 修改部署目录和临时目录。默认部署 `E:\CS2Inspect`，临时文件放 `D:\codex\cs2inspect-cache`；没有 E 盘可改成 `D:\CS2Inspect`。`InstallRoot` 必须是空目录；Steam 路径和 SteamID 默认自动检测，失败时手动填写。
4. 执行下面的命令。第一条会补下载缺少的依赖，并校验全部 SHA256；本地 `packages` 已有正确安装包时不会重复下载。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\Get-Packages.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\Preflight.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\Install.ps1
```

5. 在安装目录运行 `Enable-Local-Isolation.cmd`，确认 Windows 管理员提示。脚本启用 Windows 防火墙并添加仅针对独立服务端的外部入站阻止规则。
6. 双击安装目录的 `检视控制台.html`，打开控制台，点“启动检视”。地图加载后选阵营，再应用饰品。浏览器首次询问是否打开本地应用时确认。
7. 验收：

```powershell
# 按实际 InstallRoot 修改路径；此检查不会修改装备。
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\Verify-Deployment.ps1 -InstallRoot E:\CS2Inspect -Online
```

详细步骤、资源要求及失败恢复见 [部署指南](docs/部署指南.md)，日常操作见 [使用说明](docs/使用说明.md)。

## 文件与搬家

| 目录/文件 | 用途 |
| --- | --- |
| `deploy/` | 下载、校验、安装、验收脚本 |
| `runtime/web/` | 网页、Node 后台、数据库表结构、图片缓存 |
| `runtime/scripts/` | 启停、配置、防火墙、HTML 协议启动器 |
| `extensions/LocalInspectBridge/` | 定向应用扩展源码、构建脚本、预编译 DLL 与校验值 |
| `packages.lock.json` | 已验证版本、固定下载地址、SHA256 |
| `deployment-baseline.json`、`overrides/` | 已测游戏版本与运行中的 gamedata 快照 |
| `packages/` | 本机已保留的安装包；被 Git 忽略 |
| `tests/` | 源码检查与隔离数据库/网页测试 |
| `docs/` | 部署、操作、迁移维护、技术说明与验证记录 |

**直接复制整个仓库目录**会带上现有 `packages`；**Git clone / git bundle**只带源码和文档，需要运行下载脚本重新获取安装包。无论哪种方式，新机器都需要 Steam 的 CS2 本体；安装时会额外复制约 71 GiB，实际以新版本大小为准。npm 依赖首次安装也需要网络。

仓库没有原机账号、密钥、数据库、游戏本体或 Steam 登录文件。每台机器部署时自动生成新的数据库密码、RCON 密码及网页令牌。可按 [迁移与维护](docs/迁移与维护.md) 单独搬运个人搭配。

## 使用边界

服务与网页用于本机，端口固定为 `27015`、`17830`、`3307`，同一台机器只运行一个实例。客户端使用临时 `-insecure` 启动参数；退出检视后，要完全退出 CS2 并从 Steam 正常重开再进入官匹。插件仅安装在服务端副本中。

不能承诺第三方饰品插件绝对零账号风险。此仓库不把本地隔离等同于 Valve 授权，也不提供公网检视服部署。版本锁定用于复现当前已测组合；未来 CS2 更新后仍可能需要同步升级 Metamod、CounterStrikeSharp、WeaponPaints 和扩展适配，详见 [验证记录](docs/验证记录.md)。
