# CMS2 备份校验与恢复操作指南

> 仅针对 `ai/preview-test` 上的后台设计。不得将实验数据或凭证复制到生产环境。

## 备份范围和明确限制

后台「备份」下载的是实时内容服务版本 3 的 JSON 快照：
- `posts` 和 `dynamics`：当前版本及删除标记；
- `history`：存储中目前仍保留的不可变正文版本；
- 当前未删除版本必须能在 `history` 中找到同 ID、revision、path、source 的记录，否则拒绝导出。

**不包含**静态 Git 仓库的完整历史、图床图片、相册全部历史清单、Twikoo 评论数据库或已被 GC 清理的旧内容版本。它不是全站灾难恢复包，也没有未经审核的「一键覆盖所有内容」恢复操作。

服务端校验指针和历史版本键是否匹配；浏览器下载前再次校验内容覆盖，并计算导出文件 SHA-256。下载校验不保证多个存储节点之间存在跨地域原子快照；并发写入时如果出现版本不一致，应稍后重试，而不是修改文件绕过检查。

## 离线验证

1. 在自己的设备安全目录保存下载的 `.json` 文件。记录后台显示的 64 位 SHA-256。
2. macOS/Linux 执行 `shasum -a 256 firefly-live-content-YYYY-MM-DD.json` 或 `sha256sum firefly-live-content-YYYY-MM-DD.json`；Windows PowerShell 执行 `Get-FileHash .\\firefly-live-content-YYYY-MM-DD.json -Algorithm SHA256`。
3. 核对摘要与后台显示完全相同。摘要不匹配时不要用于恢复。
4. 检查 JSON 顶层 `schemaVersion: 3`、`posts`、`dynamics`、`history`，并确认版本关联一致。不要编辑文件中的 `revision` 或 `deleted` 来消除校验错误。

该 SHA-256 只能帮助检测意外损坏；如果网页或设备本身被入侵，它不是独立的真实性签名。

## 恢复与失败处理

1. 优先使用后台文章/动态编辑器的「历史版本」单条恢复功能；恢复前先导出一份当前快照。
2. 遇到版本冲突时先刷新，保存尚未提交的编辑内容到本地，再人工合并；**不要覆盖新的远端 revision**。
3. 当前 JSON 是导出工具，不是批量导入工具；如果需要大规模灾难恢复，先编写并验证离线恢复脚本，对照原始 ID、路径、版本及删除标记，先在独立测试存储上演练。
4. 相册清单走独立的 Gallery KV 与图床 `photos/.firefly-gallery/` JSON 备份路径。系统现在会尽量保留最新清单和四份此前版本；图片文件必须单独备份，不能仅依赖清单。
5. 评论服务使用独立的 Twikoo/Netlify 数据存储，恢复方案另行验证。

备份文件可能含未公开草稿及密码文章的明文正文。**不要提交到公开 Git 仓库、上传到公开网盘或粘贴到聊天记录。**建议使用设备加密或个人加密备份盘。

## 发布前核对

- `pnpm test:live-content`
- `pnpm astro check`
- `pnpm build:preview`
- 在实验分支与实验存储上验证导出、SHA-256、历史恢复、相册排序及冲突处理；通过后才考虑生产变更。
