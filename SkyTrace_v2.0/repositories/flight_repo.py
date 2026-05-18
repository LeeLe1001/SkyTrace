import uuid

from extensions import db
from models.flight import Flight


class FlightRepository:
    @staticmethod
    def list_by_user(user_id: int) -> list[dict]:
        flights = db.session.scalars(
            db.select(Flight)
            .where(Flight.user_id == user_id)
            .order_by(Flight.created_at.asc(), Flight.id.asc())
        ).all()
        return [_serialize(f) for f in flights]

    @staticmethod
    def create(user_id: int, data: dict) -> dict:
        normalized = _normalize(data)
        flight = Flight(user_id=user_id, **normalized)
        db.session.add(flight)
        db.session.commit()
        return _serialize(flight)

    @staticmethod
    def update(user_id: int, flight_id: str, data: dict) -> dict | None:
        flight = db.session.scalar(
            db.select(Flight).where(Flight.user_id == user_id, Flight.id == flight_id)
        )
        if not flight:
            return None
        normalized = _normalize({**data, 'id': flight_id})
        for key, value in normalized.items():
            if key != 'id':
                setattr(flight, key, value)
        db.session.commit()
        return _serialize(flight)

    @staticmethod
    def delete(user_id: int, flight_id: str) -> bool:
        flight = db.session.scalar(
            db.select(Flight).where(Flight.user_id == user_id, Flight.id == flight_id)
        )
        if not flight:
            return False
        db.session.delete(flight)
        db.session.commit()
        return True

    @staticmethod
    def connect(user_id: int, flight_ids: list[str]) -> str | None:
        if len(flight_ids) < 2:
            return None
        flights = db.session.scalars(
            db.select(Flight).where(Flight.user_id == user_id)
        ).all()

        existing_groups = {
            f.connected_group for f in flights
            if f.id in flight_ids and f.connected_group
        }
        if existing_groups:
            group_id = sorted(existing_groups)[0]
            for f in flights:
                if f.connected_group in existing_groups:
                    f.connected_group = group_id
        else:
            group_id = str(uuid.uuid4())[:8]

        for f in flights:
            if f.id in flight_ids:
                f.connected_group = group_id

        db.session.commit()
        return group_id

    @staticmethod
    def disconnect(user_id: int, flight_ids: list[str] | None = None, group_id: str = '') -> bool:
        target_ids = set(flight_ids or [])
        if not group_id and not target_ids:
            return False

        flights = db.session.scalars(
            db.select(Flight).where(Flight.user_id == user_id)
        ).all()

        if target_ids:
            affected_groups = set()
            for f in flights:
                if f.id in target_ids and f.connected_group:
                    affected_groups.add(f.connected_group)
                    f.connected_group = None
            for grp in affected_groups:
                remaining = [f for f in flights if f.connected_group == grp]
                if len(remaining) <= 1:
                    for f in remaining:
                        f.connected_group = None
        else:
            for f in flights:
                if f.connected_group == group_id:
                    f.connected_group = None

        db.session.commit()
        return True

    @staticmethod
    def find_by_number(user_id: int, flight_no: str) -> dict | None:
        normalized = (flight_no or '').strip().upper().replace(' ', '').replace('-', '')
        if not normalized:
            return None
        flights = db.session.scalars(
            db.select(Flight).where(Flight.user_id == user_id)
        ).all()
        for f in flights:
            candidate = (f.flight_no or '').strip().upper().replace(' ', '').replace('-', '')
            if candidate == normalized:
                return _serialize(f)
        return None

    @staticmethod
    def replace_all(user_id: int, payloads: list[dict]) -> list[dict]:
        normalized = [_normalize(p) for p in (payloads or [])]
        db.session.execute(
            db.delete(Flight).where(Flight.user_id == user_id)
        )
        for p in normalized:
            db.session.add(Flight(user_id=user_id, **p))
        db.session.commit()
        return FlightRepository.list_by_user(user_id)

    @staticmethod
    def import_legacy(user_id: int, legacy_flights: list[dict]):
        existing = db.session.scalar(
            db.select(Flight.id).where(Flight.user_id == user_id).limit(1)
        )
        if existing is not None:
            return
        for raw in legacy_flights:
            normalized = _normalize(raw)
            db.session.add(Flight(user_id=user_id, **normalized))
        db.session.commit()


# ---- 内部序列化 ----

def _normalize(data: dict) -> dict:
    return {
        'id': (data.get('id') or str(uuid.uuid4())[:8]).strip(),
        'flight_no': (data.get('flight_no') or '').strip(),
        'airline': (data.get('airline') or '').strip(),
        'departure': (data.get('departure') or '').strip(),
        'arrival': (data.get('arrival') or '').strip(),
        'date': (data.get('date') or '').strip(),
        'dep_time': (data.get('dep_time') or '').strip(),
        'arr_time': (data.get('arr_time') or '').strip(),
        'dep_terminal': (data.get('dep_terminal') or '').strip(),
        'arr_terminal': (data.get('arr_terminal') or '').strip(),
        'dep_gate': (data.get('dep_gate') or '').strip(),
        'arr_gate': (data.get('arr_gate') or '').strip(),
        'aircraft': (data.get('aircraft') or '').strip(),
        'seat': (data.get('seat') or '').strip(),
        'cabin_class': (data.get('class') or data.get('cabin_class') or 'economy').strip(),
        'notes': (data.get('notes') or '').strip(),
        'stopover': (data.get('stopover') or '').strip(),
        'arr_day_offset': int(data.get('arr_day_offset') or 0),
        'status': (data.get('status') or 'scheduled').strip(),
        'connected_group': (data.get('connected_group') or '').strip() or None,
    }


def _serialize(f: Flight) -> dict:
    return {
        'id': f.id,
        'flight_no': f.flight_no or '',
        'airline': f.airline or '',
        'departure': f.departure or '',
        'arrival': f.arrival or '',
        'date': f.date or '',
        'dep_time': f.dep_time or '',
        'arr_time': f.arr_time or '',
        'dep_terminal': f.dep_terminal or '',
        'arr_terminal': f.arr_terminal or '',
        'dep_gate': f.dep_gate or '',
        'arr_gate': f.arr_gate or '',
        'aircraft': f.aircraft or '',
        'seat': f.seat or '',
        'class': f.cabin_class or 'economy',
        'notes': f.notes or '',
        'stopover': f.stopover or '',
        'arr_day_offset': f.arr_day_offset or 0,
        'status': f.status or 'scheduled',
        'connected_group': f.connected_group,
    }
