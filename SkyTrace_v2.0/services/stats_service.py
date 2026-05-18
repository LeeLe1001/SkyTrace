"""
SkyTrace v2.0 — 统计服务
"""
from repositories.flight_repo import FlightRepository
from services.lookup_service import norm_flight_no


class StatsService:
    @staticmethod
    def calculate(user_id: int, year: str = '') -> dict:
        flights = FlightRepository.list_by_user(user_id)

        if year and year != 'all':
            flights = [f for f in flights if f.get('date', '').startswith(year)]

        return StatsService._compute(flights)

    @staticmethod
    def _compute(flights: list[dict]) -> dict:
        import math
        from collections import Counter

        total = len(flights)
        total_distance = 0
        total_minutes = 0
        airports_visited = set()
        countries_visited = set()
        monthly = Counter()
        routes = Counter()
        airlines_used = Counter()

        for f in flights:
            dep = f.get('departure', '')
            arr = f.get('arrival', '')
            if dep:
                airports_visited.add(dep)
            if arr:
                airports_visited.add(arr)

            # Estimate distance via Haversine (requires airports data)
            # For now use a simple model
            dist = StatsService._estimate_distance(f)
            if dist:
                total_distance += dist

            duration = StatsService._estimate_duration(f)
            if duration:
                total_minutes += duration

            if dep and arr:
                routes[f"{dep}-{arr}"] += 1

            airline = f.get('airline', '')
            if airline:
                airlines_used[airline] += 1

            date = f.get('date', '')
            if len(date) >= 7:
                monthly[date[:7]] += 1

        return {
            'total_flights': total,
            'total_distance': round(total_distance, 0),
            'total_hours': round(total_minutes / 60, 1),
            'total_minutes': total_minutes,
            'visited_airports': len(airports_visited),
            'visited_countries': len(countries_visited),
            'earth_rounds': round(total_distance / 40075, 2),
            'monthly': dict(monthly.most_common()),
            'top_routes': [{'route': r, 'count': c} for r, c in routes.most_common(10)],
            'top_airlines': [{'airline': a, 'count': c} for a, c in airlines_used.most_common(10)],
        }

    @staticmethod
    def _estimate_distance(flight: dict) -> float | None:
        # Basic Haversine needs airport coordinates
        # For Sprint 1, return None (will be enhanced in Sprint 3)
        return None

    @staticmethod
    def _estimate_duration(flight: dict) -> int | None:
        dep_time = flight.get('dep_time', '')
        arr_time = flight.get('arr_time', '')
        if not dep_time or not arr_time:
            return None
        try:
            dep_h, dep_m = map(int, dep_time.split(':'))
            arr_h, arr_m = map(int, arr_time.split(':'))
            minutes = (arr_h * 60 + arr_m) - (dep_h * 60 + dep_m)
            offset = int(flight.get('arr_day_offset') or 0)
            if offset:
                minutes += offset * 24 * 60
            if minutes <= 0:
                return None
            return minutes
        except (ValueError, TypeError):
            return None
