# 安装包缓存

本机已复制本次下载的 9 个 ZIP，合计约 211.4 MiB。8 个用于安装，SteamCMD 是保留的可选引导包；当前推荐从本机 Steam 客户端复制游戏，不使用 SteamCMD。

安装包被 `.gitignore` 排除，不进入 Git 历史。要离线携带这些包，请复制整个 `packages` 文件夹；Git clone 后请运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\Get-Packages.ps1
```

只检查已有文件：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\Get-Packages.ps1 -VerifyOnly
```

版本、来源和 SHA256 以 `../packages.lock.json` 为准。哈希不一致时脚本会拒绝继续；不要通过删除校验来混用其他版本。安装包齐全仍不等于全流程离线：Steam 游戏本体、npm 依赖和尚未缓存的饰品图片需要另外准备。
