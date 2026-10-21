# 自动发布到 VS Code Marketplace

GitHub Actions 配置位于 [release.yml](../.github/workflows/release.yml)。
推送 `main`、提交 PR 或手动运行工作流时，会执行检查、全部测试和 VSIX 打包，安装包保存在该次运行的 Artifacts 中。
推送与 `package.json` 版本一致的 `v*` 标签时，检查成功后还会自动将同一个 VSIX 发布到 Marketplace。
例如版本 `0.1.2` 对应标签 `v0.1.2`。普通提交和手动运行不会发布。
检查和全部 19 项测试在 Windows 上执行，上传任务在 Ubuntu 上发布已经验证的 VSIX。
浏览器图片对比测试使用明确的系统字体；Linux 图片基线目前仍存在差异，不作为本流程的发布验证环境。

## 一次性配置

1. 打开仓库的 [Actions secrets](https://github.com/lihaoze123/codesnap-next/settings/secrets/actions)。
2. 点击 **New repository secret**，名称填 `VSCE_PAT`。
3. 值填 Azure DevOps 的发布令牌，账户需要有 `chumeng` 发布者的权限；令牌需要 **Marketplace → Manage** 权限。

令牌只在发布步骤中通过环境变量读取。不要把令牌写入代码、命令参数或提交记录。
没有配置或令牌已过期时，发布会报错；已打包的 VSIX 仍可从成功的构建步骤下载。

微软已公告全局 PAT 将于 **2026 年 12 月 1 日**退役。当前流程使用稳定版 `vsce` 支持的 `VSCE_PAT`；
请在退役前按照官方说明迁移到 Microsoft Entra ID 身份认证。
参考：[VS Code 自动发布](https://code.visualstudio.com/api/working-with-extensions/continuous-integration#github-actions-automated-publishing)、
[认证与 PAT 退役说明](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publishing-extensions)。

## 发布当前 0.1.2

如果 Marketplace 还没有发布 `0.1.2`，在项目目录中运行：

```powershell
git tag v0.1.2
git push origin v0.1.2
```

标签必须指向包含该工作流的提交。执行后可在 [Actions](https://github.com/lihaoze123/codesnap-next/actions) 查看进度。
如果已经手动发布过 `0.1.2`，直接从下一版本开始；Marketplace 不接受覆盖已有版本。

## 发布后续版本

先完成代码修改并更新 `CHANGELOG.md`，提交这些修改，再运行：

```powershell
npm version patch
git push origin main --follow-tags
```

`npm version patch` 同时更新 `package.json` 和锁文件、创建版本提交及带注释的标签。
例如从 `0.1.2` 更新为 `0.1.3`，随后推送会触发 `v0.1.3` 的发布。
也可以使用 `npm version minor` 或 `npm version major`。

构建或测试失败时不会发布。修复代码后应使用新版本和新标签重新发布。
如果只是凭据或 Marketplace 网络问题，修复后可在对应运行中使用 **Re-run failed jobs** 重试发布。
