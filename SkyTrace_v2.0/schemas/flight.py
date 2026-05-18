"""
SkyTrace v2.0 — Pydantic 请求验证 - 航班
"""
from pydantic import BaseModel, Field


class FlightInput(BaseModel):
    flight_no: str = Field(default='')
    airline: str = Field(default='')
    departure: str = Field(default='')
    arrival: str = Field(default='')
    date: str = Field(default='')
    dep_time: str = Field(default='')
    arr_time: str = Field(default='')
    dep_terminal: str = Field(default='')
    arr_terminal: str = Field(default='')
    dep_gate: str = Field(default='')
    arr_gate: str = Field(default='')
    aircraft: str = Field(default='')
    seat: str = Field(default='')
    cabin_class: str = Field(default='economy')
    notes: str = Field(default='')
    stopover: str = Field(default='')
    arr_day_offset: int = Field(default=0)
    status: str = Field(default='scheduled')
    connected_group: str | None = Field(default=None)


class FlightConnectInput(BaseModel):
    flight_ids: list[str] = Field(min_length=2)


class FlightDisconnectInput(BaseModel):
    flight_ids: list[str] = Field(default_factory=list)
    group_id: str = Field(default='')
