import json
import tempfile
import unittest
from pathlib import Path

from app import FLIGHTS_FILE, app
from storage import configure_database, get_database_url


ROOT = Path(__file__).resolve().parents[1]


class MultiUserFoundationTests(unittest.TestCase):
    def setUp(self):
        self.original_db_url = get_database_url()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.test_db = Path(self.temp_dir.name) / "skytrace-test.db"
        configure_database(f"sqlite:///{self.test_db.as_posix()}")
        app.config["TESTING"] = True

    def tearDown(self):
        configure_database(self.original_db_url)
        self.temp_dir.cleanup()

    def test_setup_creates_admin_and_imports_legacy_flights(self):
        legacy_count = len(json.loads(Path(FLIGHTS_FILE).read_text(encoding="utf-8")).get("flights", []))
        with app.test_client() as client:
            resp = client.post(
                "/api/setup",
                json={"username": "admin", "password": "secret123", "display_name": "Owner"},
            )
            self.assertEqual(resp.status_code, 200)
            state = client.get("/api/auth/state").get_json()
            self.assertTrue(state["authenticated"])
            self.assertEqual(state["user"]["username"], "admin")

            flights = client.get("/api/flights").get_json()
            self.assertEqual(len(flights), legacy_count)

    def test_second_user_starts_with_empty_flights(self):
        with app.test_client() as client:
            setup_resp = client.post(
                "/api/setup",
                json={"username": "admin", "password": "secret123", "display_name": "Owner"},
            )
            self.assertEqual(setup_resp.status_code, 200)

            create_resp = client.post(
                "/api/admin/users",
                json={"username": "alice", "password": "secret123", "display_name": "Alice"},
            )
            self.assertEqual(create_resp.status_code, 200)

            client.post("/api/auth/logout")
            login_resp = client.post("/api/auth/login", json={"username": "alice", "password": "secret123"})
            self.assertEqual(login_resp.status_code, 200)

            flights = client.get("/api/flights").get_json()
            self.assertEqual(flights, [])

    def test_requests_require_login_after_setup(self):
        with app.test_client() as client:
            setup_resp = client.post(
                "/api/setup",
                json={"username": "admin", "password": "secret123", "display_name": "Owner"},
            )
            self.assertEqual(setup_resp.status_code, 200)

        with app.test_client() as anonymous_client:
            resp = anonymous_client.get("/api/flights")
            self.assertEqual(resp.status_code, 401)
            self.assertTrue(resp.get_json()["auth_required"])


if __name__ == "__main__":
    unittest.main()
