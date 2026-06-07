"""点名日判定（单一真相源）：基础星期规则 + 特殊日期覆盖。

规则：is_rollcall(d) = (星期 ∈ {一,二,三,四,日} AND d 非 holiday) OR (d 是 makeup)
  - 基础点名日：周一(1)~周四(4) + 周日(0)
  - holiday（法定假日）：落在基础点名日上，宣布后该日停点
  - makeup（调休补课）：落在周五(5)/周六(6)上，宣布后该日加点

seed_week / leave_backfill / 后端 attendance 校验全部经此模块，保证语义一致。
"""

from datetime import date, timedelta

BASE_ROLLCALL_WEEKDAYS = {0, 1, 2, 3, 6}  # Python weekday(): 周一=0..周日=6 → 一二三四 + 日
# 注意：Python date.weekday() 周一=0、周日=6；与 SQLite strftime('%w') 周日=0 不同。


def _special_kinds(conn, dates: list[str]) -> dict[str, str]:
    """批量查 special_date，返回 {date: kind}。"""
    if not dates:
        return {}
    qs = ",".join("?" for _ in dates)
    return {
        r[0]: r[1]
        for r in conn.execute(
            f"SELECT date, kind FROM special_date WHERE date IN ({qs})", dates
        )
    }


def is_base_rollcall(d: date) -> bool:
    return d.weekday() in BASE_ROLLCALL_WEEKDAYS


def is_rollcall(conn, d: date | str) -> bool:
    """该日是否点名（已计入特殊日期）。"""
    if isinstance(d, date):
        d = d.isoformat()
    kind = _special_kinds(conn, [d]).get(d)
    if kind == "holiday":
        return False
    if kind == "makeup":
        return True
    return date.fromisoformat(d).weekday() in BASE_ROLLCALL_WEEKDAYS


def reject_reason(conn, d: str) -> str | None:
    """不可点名时返回中文原因，可点名返回 None。"""
    kinds = _special_kinds(conn, [d])
    kind = kinds.get(d)
    if kind == "holiday":
        note = conn.execute(
            "SELECT note FROM special_date WHERE date = ?", (d,)
        ).fetchone()
        suffix = f"（{note[0]}）" if note and note[0] else ""
        return f"{d} 是节假日{suffix}，不点名"
    if kind == "makeup":
        return None
    wd = date.fromisoformat(d).weekday()
    if wd == 4:
        return f"{d} 是周五，非补课日不点名"
    if wd == 5:
        return f"{d} 是周六，非补课日不点名"
    return None


def effective_dates(conn, monday: date) -> list[str]:
    """给定周一，返回该周所有「有考勤行」的日期（ISO，升序）。
    = 基础点名日（含假日，假日行打节假日）+ 落在本周的 makeup。
    用于 seed 预填与 grid 列：假日仍占一行/一列（显示节假日），不剔除。"""
    week = [(monday + timedelta(days=i)) for i in range(7)]
    iso = [d.isoformat() for d in week]
    kinds = _special_kinds(conn, iso)
    out = []
    for d, ds in zip(week, iso):
        if kinds.get(ds) == "makeup" or d.weekday() in BASE_ROLLCALL_WEEKDAYS:
            out.append(ds)
    return sorted(out)


def date_range_rollcall(conn, start_date: str, end_date: str) -> list[str]:
    """闭区间内的所有「可点名」日（用于假条枚举）：剔除假日、含补课日。"""
    d0, d1 = date.fromisoformat(start_date), date.fromisoformat(end_date)
    iso = []
    d = d0
    while d <= d1:
        iso.append(d.isoformat())
        d += timedelta(days=1)
    kinds = _special_kinds(conn, iso)
    out = []
    for ds in iso:
        k = kinds.get(ds)
        if k == "holiday":
            continue
        if k == "makeup" or date.fromisoformat(ds).weekday() in BASE_ROLLCALL_WEEKDAYS:
            out.append(ds)
    return out


def holiday_dates_in(conn, start_date: str, end_date: str) -> set[str]:
    """区间内的假日集合（预填时这些日期打『节假日』）。"""
    return {
        r[0]
        for r in conn.execute(
            "SELECT date FROM special_date WHERE kind='holiday' "
            "AND date BETWEEN ? AND ?",
            (start_date, end_date),
        )
    }
