"""
SkyTrace v2.0 — 航班服务
"""
from repositories.flight_repo import FlightRepository
from services.lookup_service import fill_terminal


class FlightService:
    @staticmethod
    def list_for_user(user_id: int) -> list[dict]:
        return FlightRepository.list_by_user(user_id)

    @staticmethod
    def add_for_user(user_id: int, data: dict) -> dict:
        fill_terminal(data)
        return FlightRepository.create(user_id, data)

    @staticmethod
    def update_for_user(user_id: int, flight_id: str, data: dict) -> dict | None:
        fill_terminal(data)
        return FlightRepository.update(user_id, flight_id, data)

    @staticmethod
    def delete_for_user(user_id: int, flight_id: str) -> bool:
        return FlightRepository.delete(user_id, flight_id)

    @staticmethod
    def connect(user_id: int, flight_ids: list[str]) -> str | None:
        return FlightRepository.connect(user_id, flight_ids)

    @staticmethod
    def disconnect(user_id: int, flight_ids: list[str] | None = None,
                   group_id: str = '') -> bool:
        return FlightRepository.disconnect(user_id, flight_ids, group_id)
