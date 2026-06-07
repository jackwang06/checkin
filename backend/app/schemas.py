"""请求体模型（出参手写 camelCase dict，不走 pydantic 序列化）。"""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class LoginIn(CamelModel):
    id: str
    password: str


class ChangePasswordIn(CamelModel):
    current_password: str
    new_password: str


class WeekIn(CamelModel):
    term: str
    week_no: int
    start: str                      # 周一 YYYY-MM-DD


class AttendancePatch(CamelModel):
    student_id: str
    date: str
    status: str
    reason: str | None = None
    return_date: str | None = None


class AttendanceBatch(CamelModel):
    items: list[AttendancePatch]


class LeaveReviewIn(CamelModel):
    decision: str                   # approved | rejected
    comment: str | None = None


class TransferIn(CamelModel):
    student_id: str
    to_class_full_name: str
    date: str | None = None


class AdminIn(CamelModel):
    id: str
    name: str | None = None
    password: str | None = None
