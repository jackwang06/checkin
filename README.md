# 晚点名考勤系统

SQLite 数据层 + CLI 工具 + **Web 应用**（FastAPI 后端 + React/Notion 风格前端），
生产地址 <https://checkin.selab.top>（Cloudflare Tunnel → huawei2）。

层级：**周（时间轴）→ 年级 → 专业 → 班级 → 学号 → 日考勤**。

## Web 应用

- **角色**：学生（看自己考勤、交假条）/ 管理员（记考勤、批假条、统计、导出、学籍）/ 超管（+管理员任免、年级删除）。无游客，学生初始密码=学号（首登强制改密）。
- **后端** `backend/`：FastAPI + 标准库 sqlite3，uvicorn 127.0.0.1:8002（systemd `checkin-backend.service`）。所有写操作经 `audit_log` 同事务留痕。
- **前端** `frontend/`：React18+Vite+TS+Tailwind+shadcn/ui，nginx 服 `frontend/dist`（loopback :8481 ← cloudflared）。
- **本地开发**：
  ```bash
  cp backend/.env.example backend/.env   # 填 JWT_SECRET / SUPERADMIN_*
  uv run uvicorn app.main:app --app-dir backend --port 8002 --reload
  cd frontend && pnpm install && pnpm dev   # :5173，/api 自动代理到 8002
  ```
- **服务器更新**：`./deploy.sh`（git pull → uv sync → 迁移 → 重启后端 → 健康检查 → 前端构建）
- **学生账号初始化**：`uv run python scripts/seed_users.py`（幂等；新名单导入后重跑补账号）
- **假条语义**：批准时写考勤（跳周五、周六）；未开周日期挂起，开周时自动回填；改判驳回自动还原。

- 日考勤覆盖 **周一~周四 + 周日**（周五、周六不点名），每生每天一行，全量存储
- 每日状态**有且仅有 5 种**：`无异常`（默认）/ `公假` / `事假` / `旷到` / `失联`
- 学号为主键；考勤表复合主键 `(学号, 日期)`
- 名单：1111 名学生 / 31 个班 / 5 个专业（电信、计算机、通信、网安、信息安全）/ 3 个年级（23-25 级）

## 部署（本地 / huawei2 通用）

```bash
git clone <repo> && cd checkin
uv sync                                        # 复现环境（唯一三方依赖 openpyxl）
```

## 初始化（一次性）

```bash
uv run python scripts/init_db.py               # 1. 建库 data/checkin.db + 状态字典
uv run python scripts/xlsx_to_csv.py           # 2. 胶水层: xlsx -> csv/roster.csv
uv run python scripts/import_csv.py            # 3. 导入层: roster.csv -> 维度表
```

> ⚠ 胶水层若报学号冲突，冲突明细在 `csv/roster_conflicts.csv`（保留首条策略）。
> 请人工裁决、修正源 xlsx 后重跑第 2、3 步（全链路幂等，重跑安全）。

## 每周例行

**周一（或周日晚）开周**——建周次并为全体在读学生预填「无异常」：

```bash
uv run python scripts/seed_week.py --term 2025-2026-2 --week-no 1 --start 2026-06-01
```

`--start` 必须是周一。重跑安全：不会覆盖已改的状态；新生入班后重跑可补行。

**日常更新考勤**——一律走 `scripts/sql.py`（强制外键校验 + 0 行告警，直连库会绕过护栏）：

```bash
# 改状态（事假/公假需要时带 reason 和 return_date）
uv run python scripts/sql.py "UPDATE attendance SET status='事假', reason='回家办事', return_date='2026-06-05' WHERE student_id='20230801217' AND date='2026-06-02'"

# 整班某天集体公假
uv run python scripts/sql.py "UPDATE attendance SET status='公假', reason='校运会' WHERE date='2026-06-03' AND student_id IN (SELECT id FROM student WHERE class_id=(SELECT id FROM class WHERE full_name='电信24-2'))"
```

护栏行为：
- 状态写错（如 `病假`）→ `FOREIGN KEY constraint failed`，直接拒绝
- 学号不存在 / 日期未开周 → `受影响 0 行` 醒目告警

## 查询

```bash
# 班级×周 二维表（行=学生，列=周一..周四、周日）
uv run python scripts/sql.py "SELECT * FROM v_week_grid WHERE class_name='电信24-2' AND term='2025-2026-2' AND week_no=1"

# 多级统计（按周汇总：应到/无异常/公假/事假/旷到/失联/出勤率）
uv run python scripts/sql.py "SELECT * FROM v_stats_overall"                       # 总体
uv run python scripts/sql.py "SELECT * FROM v_stats_grade   WHERE grade='24'"      # 年级
uv run python scripts/sql.py "SELECT * FROM v_stats_major   WHERE major='计算机'"  # 专业
uv run python scripts/sql.py "SELECT * FROM v_stats_class   WHERE class_name LIKE '网安%'"  # 班级

# 本周所有异常明细
uv run python scripts/sql.py "SELECT date, class_name, student_id, student_name, status, reason FROM v_att_enriched WHERE status<>'无异常' AND week_no=1 ORDER BY date"
```

## 学籍变动

**学生：降级 / 转专业 / 转班**（统一为改班级归属，自动记录 `student_class_history`）：

```bash
uv run python scripts/transfer.py --list-classes                # 查看所有班级
uv run python scripts/transfer.py 20230801217 --to 电信24-2     # 降级（23→24）
uv run python scripts/transfer.py 20230801217 --to 计算机23-2   # 转专业
uv run python scripts/transfer.py 20230801217 --to 电信23-2     # 转班
```

历史考勤保留不动；统计口径自变动日起按新班级归属。
注意：入库后班级以数据库为准——重导名单不会覆盖班级（不一致时仅提示）。

**学生离校**（休学/退学；保留历史，自动退出统计和预填）：

```bash
uv run python scripts/sql.py "UPDATE student SET status='withdrawn', left_at=date('now') WHERE id='学号'"
```

**年级：毕业 / 删除 / 新入学**：

```bash
# 毕业归档（推荐）：不再点名、退出统计，历史考勤全部保留可查
uv run python scripts/grade_ops.py graduate --grade 23

# 彻底删除（不可恢复！默认试运行，--yes 才真删；删前建议备份 data/checkin.db）
uv run python scripts/grade_ops.py remove --grade 23
uv run python scripts/grade_ops.py remove --grade 23 --yes

# 新年级入学：新名单 xlsx 一条龙入库，然后开周即可预填
uv run python scripts/grade_ops.py enroll --xlsx 2026新生名单.xlsx
uv run python scripts/seed_week.py --term 2026-2027-1 --week-no 1 --start 2026-09-07
```

## 导出（年级 / 班级 / 周 三个口径）

输出 CSV 到 `exports/`（Excel 直接打开），带 `--week-no` 为宽表二维，不带为跨周长表明细：

```bash
uv run python scripts/export.py --week-no 1                          # 周 level：某周全体二维表
uv run python scripts/export.py --grade 24 --week-no 1               # 年级 level
uv run python scripts/export.py --class 电信24-2 --week-no 1         # 班级 level
uv run python scripts/export.py --grade 24                           # 年级全部周明细（长表）
uv run python scripts/export.py --class 电信24-2 --out 自定义.csv    # 指定输出路径
```

## 单点查询（输入学号 → 周次×星期 二维表）

```bash
uv run python scripts/student_report.py 20231303001                          # 全学期/自开学至今
uv run python scripts/student_report.py 20231303001 --week-no 3              # 仅某周
uv run python scripts/student_report.py 20231303001 --from-week 1 --to-week 8  # 周次区间（1-57）
uv run python scripts/student_report.py 20231303001 --out 李鑫_考勤.csv      # 导出 CSV
```

输出：个人信息 + 周次(行)×周一..周四/周日(列) 二维表 + 异常汇总明细（原因/返校时间）。

## 自检（建议每周跑一次，期望全部 0 行）

```bash
uv run python scripts/sql.py "SELECT * FROM v_check_unknown_status; SELECT * FROM v_check_non_rollcall; SELECT * FROM v_check_date_outside_week"
```

## 文件说明

| 路径 | 说明 |
|---|---|
| `schema.sql` | 全部表结构 / 索引 / 视图（真相来源） |
| `scripts/_db.py` | 共享连接（强制 `PRAGMA foreign_keys=ON`，SQLite 默认关闭！） |
| `scripts/init_db.py` | 建库 + 状态字典种子 |
| `scripts/xlsx_to_csv.py` | 胶水层：名单 xlsx → `csv/roster.csv`（学号冲突落盘审计） |
| `scripts/import_csv.py` | 导入层：roster.csv → 维度表（单事务 UPSERT，幂等） |
| `scripts/seed_week.py` | 开周：建 week + 预填全量「无异常」行（幂等，周次 1-57） |
| `scripts/sql.py` | 日常 SQL 入口（FK 护栏 + 0 行告警 + 表格输出） |
| `scripts/transfer.py` | 学籍变动：降级/转专业/转班（维护历史轨迹） |
| `scripts/grade_ops.py` | 年级生命周期：graduate 归档 / remove 删除 / enroll 新名单 |
| `scripts/export.py` | 导出：年级/班级/周 三口径 → `exports/*.csv` |
| `scripts/student_report.py` | 单点查询：学号 → 周次×星期二维表 + 异常明细 |
| `data/checkin.db` | 数据库文件，**不入 git**（可由 schema+csv+seed 确定性重建；备份请直接拷贝此文件） |

> 测试技巧：`CHECKIN_DB=data/test.db` 环境变量可让所有脚本指向副本库，
> 重大操作（如 remove）前先 `cp data/checkin.db data/test.db` 演练。
