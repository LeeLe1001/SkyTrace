"""
SkyTrace v2.0 Sprint 3 — API 兼容适配器
保持 API v1 响应格式不变，内部使用增强数据模型
"""
from repositories.flight_repo import FlightRepository, _serialize as _v1_serialize


class FlightRepoAdapter:
    """
    适配器：对外 API 格式不变，内部可逐步迁移到关联表。
    Sprint 3 阶段：保持原始 Flight 表结构，同时可选写入增强表。
    """

    @staticmethod
    def list_by_user(user_id: int) -> list[dict]:
        return FlightRepository.list_by_user(user_id)

    @staticmethod
    def create(user_id: int, data: dict) -> dict:
        flight = FlightRepository.create(user_id, data)

        # 可选：自动填充增强表 (best-effort)
        _try_populate_enhanced_tables(data)

        return flight

    @staticmethod
    def update(user_id: int, flight_id: str, data: dict) -> dict | None:
        return FlightRepository.update(user_id, flight_id, data)

    @staticmethod
    def delete(user_id: int, flight_id: str) -> bool:
        return FlightRepository.delete(user_id, flight_id)


def _try_populate_enhanced_tables(data: dict):
    """尽力填充增强表，失败不阻塞主流程"""
    from extensions import db
    from models.enhanced import Airline, AircraftType, Airport

    try:
        # 填充航空公司
        airline_name = (data.get('airline') or '').strip()
        if airline_name:
            code = (data.get('airline_code') or data.get('flight_no', '')[:2]).upper()
            existing = db.session.scalar(db.select(Airline).where(Airline.iata == code))
            if not existing:
                db.session.add(Airline(iata=code, name=airline_name))
                db.session.commit()
    except Exception:
        db.session.rollback()

    try:
        # 填充机型
        aircraft = (data.get('aircraft') or '').strip()
        if aircraft:
            existing = db.session.scalar(db.select(AircraftType).where(AircraftType.icao_code == aircraft))
            if not existing:
                db.session.add(AircraftType(icao_code=aircraft, model_name=aircraft))
                db.session.commit()
    except Exception:
        db.session.rollback()

    try:
        # 填充机场
        for code_field in ['departure', 'arrival']:
            code = (data.get(code_field) or '').strip().upper()
            if len(code) == 3:
                existing = db.session.scalar(db.select(Airport).where(Airport.iata == code))
                if not existing:
                    db.session.add(Airport(iata=code))
                    db.session.commit()
    except Exception:
        db.session.rollback()
