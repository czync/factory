---
id: wp-00-legacy-baseline
name: WP-00 旧系统可复现构建与基线采集双跑比对包
version: "1.0.0"
owner: 测试框架工作组 & 架构委员会
mandatory_before: Build
---

# WP-00：旧系统可复现构建与基线采集规范

> **核心原则**：在 `Spec → Build` 关卡之前，必须完成可复现构建与黄金样本（Golden Master）登记；业务数据与抽样快照 **严禁提交至 GitHub 代码仓库**，统一存入开启 WORM（Object Lock）的 S3 桶并向 Factory 证据账本登记 SHA256 签名。

## 1. 模块一：旧构建探针与游离依赖封存 (`legacy-build-capturer`)
1. 在旧 Solaris / Windows 构建节点执行 `factory-runner capture-build --cmd "<build-script>"`。
2. 探针解析系统调用与链接日志，识别 Git 仓库外的第三方 `.jar` / `.so` / `.dll` 及头文件。
3. 自动上传游离依赖至 `Artifactory://legacy-frozen-deps/<app_id>/`，生成锁定构建清单 `BuildEnvironmentManifest.json`。

## 2. 模块二：三类业务形态基线采样 (`legacy-baseline-sampler`)
- **AutoSys 批处理作业**：使用 `batch-wrapper.sh` 自动导出作业前 Sybase 依赖表快照、输入文件、命令行入参及作业后表增量变更与报表输出。
- **联机服务 / MQ**：录制至少 1 个典型营业日高峰窗口的 `InputMessageTape` 与 `OutputMessageTape`。
- **Sybase 存储过程**：结合 DBA 审计日志捕获入参序列与游标输出集。

## 3. 模块三：格式保留脱敏与黄金样本封存 (`baseline-sanitizer-sealer`)
- 使用固定 Salt 对客户姓名、证件号、账号做格式保留哈希脱敏，**严禁改变主键关联关系及交易金额/数量字段精度**。
- 上传加密压缩包至 `s3://factory-baselines/<app_id>/<baseline_id>/BaselineBundle.tar.zst`，将返回的 S3 Version URI 与 `SHA256` 登记至 Factory 证据账本。

## 4. 模块四：UAT 双跑回放与两级降噪比对 (`dual-run-differ`)
1. **第一级确定性降噪**：依据 `diff-rules.yaml` 忽略显式时间戳列（`last_modified_ts`, `audit_seq`），归一化 Sybase/Oracle 日期串格式并按业务主键排序无序集。
2. **第二级 AI 差异分诊**：非零真实差异由 `Diff Triage Worker` 按表与交易类型聚类，并自动关联本次改造的 Git Diff 定位嫌疑代码行，**交由人类工程师修复或由 SME 签字确认差异**。
