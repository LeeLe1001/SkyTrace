import base64
import json
import tempfile
import unittest
from unittest.mock import patch
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

    def test_github_backup_token_is_encrypted_at_rest_and_masked_in_api(self):
        with app.test_client() as client:
            self._bootstrap_admin(client)

            resp = client.post(
                "/api/settings",
                json={
                    "github_backup_token": "ghp_server_secret_1234",
                    "github_backup_repo": "octocat/skytrace-backups",
                },
            )
            self.assertEqual(resp.status_code, 200)

            with get_session() as db:
                settings = db.query(UserSetting).one()
                self.assertTrue(settings.github_backup_token.startswith("enc:v1:"))
                self.assertEqual(settings.github_backup_repo, "octocat/skytrace-backups")
                self.assertNotIn("secret_1234", settings.github_backup_token)

            safe = client.get("/api/settings").get_json()
            self.assertTrue(safe["github_backup_token_set"])
            self.assertEqual(safe["github_backup_token"], "ghp_****1234")
            self.assertEqual(safe["github_backup_repo"], "octocat/skytrace-backups")

    def test_github_backup_push_uses_server_side_github_api_and_persists_settings(self):
        with app.test_client() as client:
            user = create_user("pilot", "secret123", "Pilot")
            with client.session_transaction() as session:
                session["user_id"] = user["id"]

            add_resp = client.post(
                "/api/flights",
                json={
                    "flight_no": "OZ312",
                    "airline": "Asiana Airlines",
                    "departure": "ICN",
                    "arrival": "NRT",
                    "date": "2026-05-01",
                    "dep_time": "09:30",
                    "arr_time": "11:50",
                    "status": "scheduled",
                },
            )
            self.assertEqual(add_resp.status_code, 200)

            captured = {}

            def fake_github(path, method="GET", body=None, token=""):
                if method == "GET" and "/contents/" in path:
                    raise ValueError("Not Found")
                if method == "PUT":
                    captured["path"] = path
                    captured["body"] = body
                    captured["token"] = token
                    return {"content": {"sha": "newsha"}}
                raise AssertionError(f"Unexpected GitHub call: {method} {path}")

            with patch("app._github_api_request", side_effect=fake_github):
                resp = client.post(
                    "/api/backup/github/push",
                    json={"token": "ghp_server_secret_1234", "repo": "octocat/skytrace-backups"},
                )

            self.assertEqual(resp.status_code, 200)
            data = resp.get_json()
            self.assertTrue(data["success"])
            self.assertEqual(data["flight_count"], 1)
            self.assertEqual(captured["token"], "ghp_server_secret_1234")
            self.assertIn("/repos/octocat/skytrace-backups/contents/data/user-backups/pilot.json", captured["path"])

            exported = json.loads(base64.b64decode(captured["body"]["content"]).decode("utf-8"))
            self.assertEqual(exported["user"]["username"], "pilot")
            self.assertEqual(len(exported["flights"]), 1)
            self.assertEqual(exported["settings"]["preferred_api"], "auto")
            self.assertNotIn("github_backup_token", exported["settings"])

            safe = client.get("/api/settings").get_json()
            self.assertTrue(safe["github_backup_token_set"])
            self.assertEqual(safe["github_backup_repo"], "octocat/skytrace-backups")

    def test_github_backup_pull_replaces_user_flights_and_restores_safe_settings(self):
        with app.test_client() as client:
            user = create_user("backup-user", "secret123", "Backup User")
            with client.session_transaction() as session:
                session["user_id"] = user["id"]

            old_resp = client.post(
                "/api/flights",
                json={
                    "flight_no": "MU9999",
                    "airline": "China Eastern",
                    "departure": "PVG",
                    "arrival": "PEK",
                    "date": "2026-05-01",
                    "dep_time": "08:00",
                    "arr_time": "10:00",
                    "status": "scheduled",
                },
            )
            self.assertEqual(old_resp.status_code, 200)

            backup_payload = {
                "schema_version": 1,
                "user": {"username": "backup-user", "display_name": "Backup User"},
                "settings": {"preferred_api": "airlabs", "auto_cache": False},
                "flights": [
                    {
                        "flight_no": "KE842",
                        "airline": "Korean Air",
                        "departure": "ICN",
                        "arrival": "JFK",
                        "date": "2026-06-01",
                        "dep_time": "09:00",
                        "arr_time": "10:30",
                        "arr_day_offset": 0,
                        "status": "scheduled",
                    }
                ],
            }
            encoded = base64.b64encode(
                json.dumps(backup_payload, ensure_ascii=False).encode("utf-8")
            ).decode("ascii")

            with patch(
                "app._github_api_request",
                return_value={"content": encoded, "sha": "abc123"},
            ):
                resp = client.post(
                    "/api/backup/github/pull",
                    json={"token": "ghp_server_secret_9999", "repo": "octocat/skytrace-backups"},
                )

            self.assertEqual(resp.status_code, 200)
            data = resp.get_json()
            self.assertTrue(data["success"])
            self.assertEqual(data["flight_count"], 1)

            flights = client.get("/api/flights").get_json()
            self.assertEqual(len(flights), 1)
            self.assertEqual(flights[0]["flight_no"], "KE842")

            settings = client.get("/api/settings").get_json()
            self.assertEqual(settings["preferred_api"], "airlabs")
            self.assertFalse(settings["auto_cache"])
            self.assertTrue(settings["github_backup_token_set"])
            self.assertEqual(settings["github_backup_repo"], "octocat/skytrace-backups")

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
