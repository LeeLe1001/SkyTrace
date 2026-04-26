import json
import tempfile
import unittest
from pathlib import Path

from app import app
from storage import UserSetting, configure_database, create_user, get_database_url, get_session
from time_utils import attach_airport_timezones, calculate_duration_minutes


class PhaseTwoRegressionTests(unittest.TestCase):
    def setUp(self):
        self.original_db_url = get_database_url()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.test_db = Path(self.temp_dir.name) / "skytrace-test.db"
        configure_database(f"sqlite:///{self.test_db.as_posix()}")
        app.config["TESTING"] = True

    def tearDown(self):
        configure_database(self.original_db_url)
        self.temp_dir.cleanup()

    def _bootstrap_admin(self, client):
        resp = client.post(
            "/api/setup",
            json={"username": "admin", "password": "secret123", "display_name": "Owner"},
        )
        self.assertEqual(resp.status_code, 200)

    def test_manual_cross_timezone_duration_uses_real_airport_timezones(self):
        airports = attach_airport_timezones(
            json.loads(Path("data/airports.json").read_text(encoding="utf-8"))
        )
        flight = {
            "date": "2026-04-26",
            "departure": "WEH",
            "arrival": "ICN",
            "dep_time": "11:00",
            "arr_time": "13:15",
        }
        self.assertEqual(calculate_duration_minutes(flight, airports_data=airports), 75)

    def test_api_keys_are_encrypted_at_rest_and_masked_in_api(self):
        with app.test_client() as client:
            self._bootstrap_admin(client)

            resp = client.post(
                "/api/settings",
                json={
                    "aviationstack_key": "avstack-secret-1234",
                    "airlabs_key": "airlabs-secret-5678",
                    "aerodata_key": "aerodata-secret-9999",
                },
            )
            self.assertEqual(resp.status_code, 200)

            with get_session() as db:
                settings = db.query(UserSetting).one()
                self.assertTrue(settings.aviationstack_key.startswith("enc:v1:"))
                self.assertTrue(settings.airlabs_key.startswith("enc:v1:"))
                self.assertTrue(settings.aerodata_key.startswith("enc:v1:"))
                self.assertNotIn("secret-1234", settings.aviationstack_key)

            safe = client.get("/api/settings").get_json()
            self.assertTrue(safe["aviationstack_key_set"])
            self.assertEqual(safe["aviationstack_key"], "avst****1234")
            self.assertEqual(safe["airlabs_key"], "airl****5678")
            self.assertEqual(safe["aerodata_key"], "aero****9999")

    def test_airports_api_returns_timezone_metadata(self):
        with app.test_client() as client:
            self._bootstrap_admin(client)
            airports = client.get("/api/airports").get_json()
            self.assertEqual(airports["WEH"]["timezone"], "Asia/Shanghai")
            self.assertEqual(airports["ICN"]["timezone"], "Asia/Seoul")

    def test_stats_api_uses_timezone_aware_duration_for_manual_flights(self):
        with app.test_client() as client:
            user = create_user("pilot", "secret123", "Pilot")
            with client.session_transaction() as session:
                session["user_id"] = user["id"]
            add_resp = client.post(
                "/api/flights",
                json={
                    "flight_no": "MU2017",
                    "airline": "中国东方航空",
                    "departure": "WEH",
                    "arrival": "ICN",
                    "date": "2026-04-30",
                    "dep_time": "11:00",
                    "arr_time": "13:15",
                    "arr_day_offset": 0,
                    "status": "scheduled",
                },
            )
            self.assertEqual(add_resp.status_code, 200)

            stats = client.get("/api/stats").get_json()
            self.assertEqual(stats["total_flights"], 1)
            self.assertEqual(stats["total_hours"], 1.2)
            self.assertEqual(stats["fun_stats"]["avg_hours"], 1.2)


if __name__ == "__main__":
    unittest.main()
