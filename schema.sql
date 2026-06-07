-- ============================================================
-- 晚点名考勤数据库 schema（真相来源）
-- 层级：周(时间轴) → 年级 → 专业 → 班级 → 学号 → 日考勤
-- 日考勤覆盖 周一~周四 + 周日（周五、周六不点名），每日状态有且仅有 5 种：
--   无异常（默认）/ 公假 / 事假 / 旷到 / 失联
-- 注意：foreign_keys 是连接级 PRAGMA，每个连接都必须重新开启！
--       （scripts/ 下所有脚本均已强制 PRAGMA foreign_keys=ON）
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- 状态字典：attendance.status 外键到这里，防 typo
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS status_def (
    code       TEXT PRIMARY KEY,                 -- 无异常/公假/事假/旷到/失联
    label      TEXT NOT NULL,
    is_present INTEGER NOT NULL DEFAULT 0 CHECK (is_present IN (0, 1)),  -- 计为出勤
    is_excused INTEGER NOT NULL DEFAULT 0 CHECK (is_excused IN (0, 1)),  -- 合规请假
    sort_order INTEGER NOT NULL DEFAULT 0,
    active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
) STRICT;

-- ------------------------------------------------------------
-- 年级：支持毕业归档（status='archived'）与新年级加入
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grade (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,            -- 两位年级码：'23'/'24'/'25'
    enroll_year INTEGER NOT NULL,                -- 2023/2024/2025
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'archived')),
    archived_at TEXT                             -- 归档日期 ISO
) STRICT;

CREATE TABLE IF NOT EXISTS major (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE                    -- 电信/计算机/通信/网安/信息安全
) STRICT;

CREATE TABLE IF NOT EXISTS class (
    id        INTEGER PRIMARY KEY,
    grade_id  INTEGER NOT NULL REFERENCES grade (id),
    major_id  INTEGER NOT NULL REFERENCES major (id),
    class_no  INTEGER NOT NULL,                  -- 班号 1/2/3
    tag       TEXT,                              -- '卓越班'/'实验班'/NULL
    full_name TEXT NOT NULL UNIQUE,              -- 原始班级名，导入幂等锚点
    UNIQUE (grade_id, major_id, class_no)
) STRICT;

-- ------------------------------------------------------------
-- 学生：学号为主键（TEXT 防前导零/精度问题）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student (
    id          TEXT PRIMARY KEY,                -- 学号，不可变更
    name        TEXT NOT NULL,
    class_id    INTEGER NOT NULL REFERENCES class (id),
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'suspended', 'withdrawn',
                                  'transferred', 'graduated')),
    enrolled_at TEXT,                            -- 建档日期
    left_at     TEXT                             -- 离校日期（休/退/转/毕业）
) STRICT;

-- 转班/转专业历史（首版统计按当前归属，需要精确口径时再切到本表）
CREATE TABLE IF NOT EXISTS student_class_history (
    id         INTEGER PRIMARY KEY,
    student_id TEXT    NOT NULL REFERENCES student (id),
    class_id   INTEGER NOT NULL REFERENCES class (id),
    from_date  TEXT NOT NULL,
    to_date    TEXT                              -- NULL = 至今
) STRICT;

-- ------------------------------------------------------------
-- 时间轴（最外层维度）：第 xx 周
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS week (
    id         INTEGER PRIMARY KEY,
    term       TEXT NOT NULL,                    -- 学期：'2025-2026-1'
    week_no    INTEGER NOT NULL,                 -- 学期内第几周
    start_date TEXT NOT NULL CHECK (start_date LIKE '____-__-__'),  -- 周一
    end_date   TEXT NOT NULL CHECK (end_date   LIKE '____-__-__'),  -- 周日
    UNIQUE (term, week_no),
    UNIQUE (start_date)
) STRICT;

-- ------------------------------------------------------------
-- 事实表：每生每天一行（全量存储），复合主键 (学号, 日期)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance (
    student_id  TEXT    NOT NULL REFERENCES student (id),
    date        TEXT    NOT NULL CHECK (date LIKE '____-__-__'),
    week_id     INTEGER NOT NULL REFERENCES week (id),
    status      TEXT    NOT NULL DEFAULT '无异常' REFERENCES status_def (code),
    reason      TEXT,                            -- 备注（请假事由等）
    return_date TEXT,                            -- 请假返校时间
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    PRIMARY KEY (student_id, date)
) STRICT, WITHOUT ROWID;

-- ------------------------------------------------------------
-- 索引
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_att_date      ON attendance (date);
CREATE INDEX IF NOT EXISTS idx_att_week      ON attendance (week_id);
-- 部分索引：异常记录稀疏（95%+ 为无异常），查缺勤极快且体积小
CREATE INDEX IF NOT EXISTS idx_att_abnormal  ON attendance (status)
    WHERE status <> '无异常';
CREATE INDEX IF NOT EXISTS idx_student_class ON student (class_id);
CREATE INDEX IF NOT EXISTS idx_class_grade   ON class (grade_id);
CREATE INDEX IF NOT EXISTS idx_class_major   ON class (major_id);

-- ============================================================
-- 视图（按时间轴最外层组织）
-- 视图用 DROP+CREATE：改定义后重跑 init_db 即完成迁移（视图无状态）
-- ============================================================

-- 底层长表：attendance 挂全维度，各级统计共用
DROP VIEW IF EXISTS v_att_enriched;
CREATE VIEW v_att_enriched AS
SELECT
    w.term,
    w.week_no,
    a.week_id,
    a.date,
    g.name      AS grade,
    g.status    AS grade_status,
    m.name      AS major,
    c.id        AS class_id,
    c.full_name AS class_name,
    s.id        AS student_id,
    s.name      AS student_name,
    s.status    AS student_status,
    a.status,
    a.reason,
    a.return_date,
    sd.is_present,
    sd.is_excused
FROM attendance a
JOIN student    s  ON s.id = a.student_id
JOIN class      c  ON c.id = s.class_id
JOIN grade      g  ON g.id = c.grade_id
JOIN major      m  ON m.id = c.major_id
JOIN week       w  ON w.id = a.week_id
JOIN status_def sd ON sd.code = a.status;

-- 班级×周 二维表：行=学号/姓名，列=周一..周四、周日（周五/周六不点名）
-- 用法：SELECT * FROM v_week_grid
--       WHERE class_name='电信24-2' AND term='2025-2026-1' AND week_no=1;
DROP VIEW IF EXISTS v_week_grid;
CREATE VIEW v_week_grid AS
SELECT
    term,
    week_no,
    grade,
    major,
    class_name,
    student_id,
    student_name,
    MAX(CASE WHEN strftime('%w', date) = '1' THEN status END) AS 周一,
    MAX(CASE WHEN strftime('%w', date) = '2' THEN status END) AS 周二,
    MAX(CASE WHEN strftime('%w', date) = '3' THEN status END) AS 周三,
    MAX(CASE WHEN strftime('%w', date) = '4' THEN status END) AS 周四,
    MAX(CASE WHEN strftime('%w', date) = '0' THEN status END) AS 周日
FROM v_att_enriched
GROUP BY week_id, student_id;

-- ------------------------------------------------------------
-- 分级统计（按 周 → 年级 → 专业 → 班级 逐级下钻）
-- 口径：仅统计在读学生 + 未归档年级；归档后历史行保留但退出统计
-- ------------------------------------------------------------
DROP VIEW IF EXISTS v_stats_class;
CREATE VIEW v_stats_class AS
SELECT
    term, week_no, grade, major, class_name,
    COUNT(*)                                              AS 应到人次,
    SUM(is_present)                                       AS 无异常,
    SUM(CASE WHEN status = '公假' THEN 1 ELSE 0 END)      AS 公假,
    SUM(CASE WHEN status = '事假' THEN 1 ELSE 0 END)      AS 事假,
    SUM(CASE WHEN status = '旷到' THEN 1 ELSE 0 END)      AS 旷到,
    SUM(CASE WHEN status = '失联' THEN 1 ELSE 0 END)      AS 失联,
    ROUND(100.0 * SUM(is_present) / COUNT(*), 2)          AS 出勤率
FROM v_att_enriched
WHERE grade_status = 'active' AND student_status = 'active'
GROUP BY week_id, class_id;

DROP VIEW IF EXISTS v_stats_major;
CREATE VIEW v_stats_major AS
SELECT
    term, week_no, grade, major,
    COUNT(*)                                              AS 应到人次,
    SUM(is_present)                                       AS 无异常,
    SUM(CASE WHEN status = '公假' THEN 1 ELSE 0 END)      AS 公假,
    SUM(CASE WHEN status = '事假' THEN 1 ELSE 0 END)      AS 事假,
    SUM(CASE WHEN status = '旷到' THEN 1 ELSE 0 END)      AS 旷到,
    SUM(CASE WHEN status = '失联' THEN 1 ELSE 0 END)      AS 失联,
    ROUND(100.0 * SUM(is_present) / COUNT(*), 2)          AS 出勤率
FROM v_att_enriched
WHERE grade_status = 'active' AND student_status = 'active'
GROUP BY week_id, grade, major;

DROP VIEW IF EXISTS v_stats_grade;
CREATE VIEW v_stats_grade AS
SELECT
    term, week_no, grade,
    COUNT(*)                                              AS 应到人次,
    SUM(is_present)                                       AS 无异常,
    SUM(CASE WHEN status = '公假' THEN 1 ELSE 0 END)      AS 公假,
    SUM(CASE WHEN status = '事假' THEN 1 ELSE 0 END)      AS 事假,
    SUM(CASE WHEN status = '旷到' THEN 1 ELSE 0 END)      AS 旷到,
    SUM(CASE WHEN status = '失联' THEN 1 ELSE 0 END)      AS 失联,
    ROUND(100.0 * SUM(is_present) / COUNT(*), 2)          AS 出勤率
FROM v_att_enriched
WHERE grade_status = 'active' AND student_status = 'active'
GROUP BY week_id, grade;

DROP VIEW IF EXISTS v_stats_overall;
CREATE VIEW v_stats_overall AS
SELECT
    term, week_no,
    COUNT(*)                                              AS 应到人次,
    SUM(is_present)                                       AS 无异常,
    SUM(CASE WHEN status = '公假' THEN 1 ELSE 0 END)      AS 公假,
    SUM(CASE WHEN status = '事假' THEN 1 ELSE 0 END)      AS 事假,
    SUM(CASE WHEN status = '旷到' THEN 1 ELSE 0 END)      AS 旷到,
    SUM(CASE WHEN status = '失联' THEN 1 ELSE 0 END)      AS 失联,
    ROUND(100.0 * SUM(is_present) / COUNT(*), 2)          AS 出勤率
FROM v_att_enriched
WHERE grade_status = 'active' AND student_status = 'active'
GROUP BY week_id;

-- ============================================================
-- Web 应用层（账号 / 假条 / 审计）
-- ============================================================

-- 登录账号：学生(role=user, student_id 指向本人) / 管理员 / 超管
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,               -- 学号 或 admin_xxx（全局唯一登录标识）
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user'
                  CHECK (role IN ('user', 'admin', 'superadmin')),
    display_name  TEXT,
    student_id    TEXT REFERENCES student (id),   -- 学生账号指向本人；纯管理员为 NULL
    must_change_password INTEGER NOT NULL DEFAULT 0
                  CHECK (must_change_password IN (0, 1)),
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    last_login_at TEXT
) STRICT;
-- 一个学生最多一个账号
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_student ON users (student_id)
    WHERE student_id IS NOT NULL;

-- 登录审计（含失败记录，应用层限速依据）
CREATE TABLE IF NOT EXISTS login_event (
    id         INTEGER PRIMARY KEY,
    user_id    TEXT,                              -- 失败时可能是不存在的账号，不设 FK
    success    INTEGER NOT NULL DEFAULT 1 CHECK (success IN (0, 1)),
    ip         TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_login_event_user ON login_event (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_login_event_ip   ON login_event (ip, created_at);

-- 假条：学生申请 → 管理员审批 → 自动写考勤
CREATE TABLE IF NOT EXISTS leave_request (
    id          INTEGER PRIMARY KEY,
    student_id  TEXT NOT NULL REFERENCES student (id),
    type        TEXT NOT NULL CHECK (type IN ('事假', '公假')),
    start_date  TEXT NOT NULL CHECK (start_date LIKE '____-__-__'),
    end_date    TEXT NOT NULL CHECK (end_date   LIKE '____-__-__'),
    reason      TEXT NOT NULL,
    return_date TEXT,                             -- 预计返校日 → 写进 attendance.return_date
    attachment_path TEXT,                         -- 证明材料（data/uploads/ 下相对路径）
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    reviewed_by    TEXT REFERENCES users (id),
    reviewed_at    TEXT,
    review_comment TEXT,
    applied_dates  TEXT,                          -- 审批实际写入的日期 JSON 数组（审计+撤销依据）
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    CHECK (end_date >= start_date)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_leave_student ON leave_request (student_id, status);
CREATE INDEX IF NOT EXISTS idx_leave_status  ON leave_request (status, created_at);

-- 审计日志：所有写操作留痕（与业务写同一事务，业务回滚则日志回滚）
CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users (id),
    action     TEXT NOT NULL,                     -- attendance.update / leave.approve / week.create / ...
    target     TEXT,                              -- 如 '20231303001:2026-06-02' 或 'leave:5'
    detail     TEXT,                              -- JSON：变更前→后值 / 参数 / skipped 等
    ip         TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_audit_user   ON audit_log (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log (action, created_at);

-- ------------------------------------------------------------
-- 自检视图：期望均为 0 行（提交前跑一遍）
-- ------------------------------------------------------------
-- 状态值不在字典内（FK 关闭时写入的脏数据）
DROP VIEW IF EXISTS v_check_unknown_status;
CREATE VIEW v_check_unknown_status AS
SELECT a.student_id, a.date, a.status
FROM attendance a
LEFT JOIN status_def sd ON sd.code = a.status
WHERE sd.code IS NULL;

-- 考勤日期落在非点名日：周五('5')/周六('6')（不应存在）
DROP VIEW IF EXISTS v_check_saturday;
DROP VIEW IF EXISTS v_check_non_rollcall;
CREATE VIEW v_check_non_rollcall AS
SELECT student_id, date, status
FROM attendance
WHERE strftime('%w', date) IN ('5', '6');

-- 考勤日期不在所属周范围内
DROP VIEW IF EXISTS v_check_date_outside_week;
CREATE VIEW v_check_date_outside_week AS
SELECT a.student_id, a.date, w.term, w.week_no, w.start_date, w.end_date
FROM attendance a
JOIN week w ON w.id = a.week_id
WHERE a.date < w.start_date OR a.date > w.end_date;
