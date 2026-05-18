import re
import tempfile
import unittest
from pathlib import Path

from app import APP_VERSION, app, get_flight_status_info
from storage import configure_database, get_database_url


ROOT = Path(__file__).resolve().parents[1]


class CleanupRegressionTests(unittest.TestCase):
    def setUp(self):
        self.original_db_url = get_database_url()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.test_db = Path(self.temp_dir.name) / "skytrace-test.db"
        configure_database(f"sqlite:///{self.test_db.as_posix()}")
        app.config["TESTING"] = True

    def tearDown(self):
        configure_database(self.original_db_url)
        self.temp_dir.cleanup()

    def test_completed_flight_without_times_stays_completed(self):
        status_info = get_flight_status_info({
            'date': '2025-01-10',
            'dep_time': '',
            'arr_time': '',
            'status': 'completed',
        })
        self.assertEqual(status_info['status'], 'completed')
        self.assertEqual(status_info['progress'], 100)
        self.assertIsNone(status_info['countdown'])

    def test_api_marks_historical_dtw_lga_completed(self):
        with app.test_client() as client:
            setup_resp = client.post(
                '/api/setup',
                json={'username': 'admin', 'password': 'secret123', 'display_name': 'Owner'},
            )
            self.assertEqual(setup_resp.status_code, 200)
            flights = client.get('/api/flights').get_json()

        target = next(
            flight for flight in flights
            if flight['departure'] == 'DTW' and flight['arrival'] == 'LGA' and flight['date'] == '2025-01-10'
        )
        self.assertEqual(target['status'], 'completed')
        self.assertEqual(target['status_info']['status'], 'completed')

    def test_frontend_uses_single_canonical_entrypoint(self):
        self.assertTrue((ROOT / 'index.html').exists())
        self.assertFalse((ROOT / 'templates' / 'index.html').exists())

    def test_version_is_consistent_across_backend_and_entrypoint(self):
        html = (ROOT / 'index.html').read_text(encoding='utf-8')
        self.assertIn(f'window.SKYTRACE_VERSION = {APP_VERSION};', html)
        self.assertIn(f'static/css/style.css?v={APP_VERSION}', html)
        self.assertIn(f'static/js/i18n.js?v={APP_VERSION}', html)
        self.assertIn(f'static/js/static-mode.js?v={APP_VERSION}', html)
        self.assertIn(f'static/js/app.js?v={APP_VERSION}', html)

    def test_new_translation_keys_exist_in_every_locale(self):
        i18n_text = (ROOT / 'static' / 'js' / 'i18n.js').read_text(encoding='utf-8')
        keys = [
            'splashSubtitle',
            'settingsTooltip',
            'shareGeneratedBy',
            'exportFailed',
            'prevYear',
            'nextYear',
            'arrivesNextDay',
            'searchCodePlaceholder',
        ]
        for key in keys:
            matches = re.findall(rf'^\s{{4}}{key}:', i18n_text, re.MULTILINE)
            self.assertEqual(
                len(matches),
                5,
                msg=f'Expected translation key "{key}" in all 5 locale blocks, found {len(matches)}',
            )


if __name__ == '__main__':
    unittest.main()
