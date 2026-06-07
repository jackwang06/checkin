"""导入层：标准 roster.csv → SQLite 维度表（grade/major/class/student）。

用法：uv run python scripts/import_csv.py [--csv csv/roster.csv]
单事务、全程 UPSERT，幂等可重跑：
  - 维度按唯一键锚定（grade.name / major.name / class.full_name / student.id）
  - 已有学生只更新姓名，不改班级归属——入库后班级以数据库为准，
    转班/降级/转专业一律走 transfer.py（带历史记录）；
    名单与库内班级不一致时仅提示，不覆盖
  - 名单里消失的学生不会被删除（离校请手动改 student.status，保留考勤历史）
"""

import argparse
import csv
from pathlib import Path

from _db import PROJECT_ROOT, connect


def import_roster(csv_path: Path) -> None:
    """标准 roster csv → 维度表，单事务 UPSERT，幂等。"""
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    conn = connect()
    try:
        with conn:  # 单事务：要么全进，要么全不进
            for r in rows:
                conn.execute(
                    """
                    INSERT INTO grade (name, enroll_year)
                    VALUES (:grade, 2000 + CAST(:grade AS INTEGER))
                    ON CONFLICT(name) DO NOTHING
                    """,
                    r,
                )
                conn.execute(
                    "INSERT INTO major (name) VALUES (:major) ON CONFLICT(name) DO NOTHING",
                    r,
                )
                conn.execute(
                    """
                    INSERT INTO class (grade_id, major_id, class_no, tag, full_name)
                    SELECT g.id, m.id, :class_no, NULLIF(:class_tag, ''), :class_full_name
                    FROM grade g, major m
                    WHERE g.name = :grade AND m.name = :major
                    ON CONFLICT(full_name) DO UPDATE SET
                        tag = excluded.tag
                    """,
                    r,
                )
                conn.execute(
                    """
                    INSERT INTO student (id, name, class_id, enrolled_at)
                    SELECT :student_id, :student_name, c.id, date('now', 'localtime')
                    FROM class c WHERE c.full_name = :class_full_name
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name
                    """,
                    r,
                )

            # 名单班级 vs 库内班级漂移检查（只提示不覆盖，班级变动以 transfer.py 为准）
            drift = []
            for r in rows:
                cur = conn.execute(
                    """
                    SELECT c.full_name FROM student s JOIN class c ON c.id = s.class_id
                    WHERE s.id = ? AND c.full_name <> ?
                    """,
                    (r["student_id"], r["class_full_name"]),
                ).fetchone()
                if cur:
                    drift.append((r["student_id"], r["student_name"],
                                  cur[0], r["class_full_name"]))

        if drift:
            print(f"提示: {len(drift)} 名学生的库内班级与名单不一致（未覆盖，库内为准）：")
            for sid, name, db_cls, csv_cls in drift[:10]:
                print(f"  {name}({sid}) 库内 {db_cls} / 名单 {csv_cls}")
            if len(drift) > 10:
                print(f"  ... 等共 {len(drift)} 人")
            print("  若名单才是对的，请用 transfer.py 调整")

        stats = {
            t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            for t in ("grade", "major", "class", "student")
        }
        print(f"导入完成: 年级 {stats['grade']} | 专业 {stats['major']} | "
              f"班级 {stats['class']} | 学生 {stats['student']}")
    finally:
        conn.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--csv", default=PROJECT_ROOT / "csv" / "roster.csv", type=Path)
    args = ap.parse_args()
    import_roster(args.csv)


if __name__ == "__main__":
    main()
