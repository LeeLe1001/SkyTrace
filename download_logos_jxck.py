"""Download missing airline logo PNGs from Jxck-S/airline-logos GitHub repo."""

import os
import urllib.request
import urllib.error

TARGET_DIR = os.path.join(os.path.dirname(__file__), "static", "img", "airlines")
BASE_URL = "https://raw.githubusercontent.com/Jxck-S/airline-logos/main/flightaware_logos/{}.png"

# slug -> list of ICAO codes to try in order
AIRLINES = {
    "airasia":               ["AXM"],
    "airbaltic":             ["BTI"],
    "alaska-airlines":       ["ASA"],
    "etihad-airways":        ["ETD"],
    # ewa-air has no standard ICAO – skip
    "peach-aviation":        ["APJ"],
    "qantas":                ["QFA"],
    "royal-brunei-airlines": ["RBA"],
    "scandinavian-airlines": ["SAS", "SDN"],
    "scoot":                 ["TGW", "SCO"],
    "tway-air":              ["TWB"],
    "vietjet-air":           ["VJC"],
    "wizz-air":              ["WZZ"],
}


def download(slug: str, icao_codes: list[str]) -> bool:
    dest = os.path.join(TARGET_DIR, f"{slug}.png")
    for code in icao_codes:
        url = BASE_URL.format(code)
        try:
            urllib.request.urlretrieve(url, dest)
            print(f"  ✓ {slug}.png  ← {code}.png")
            return True
        except urllib.error.HTTPError as e:
            print(f"    {code}.png → HTTP {e.code}")
        except Exception as e:
            print(f"    {code}.png → {e}")
    return False


def main():
    os.makedirs(TARGET_DIR, exist_ok=True)
    successes, failures = [], []

    print(f"Downloading logos to {TARGET_DIR}\n")
    for slug, codes in AIRLINES.items():
        print(f"[{slug}]")
        if download(slug, codes):
            successes.append(slug)
        else:
            failures.append(slug)

    print(f"\n{'='*40}")
    print(f"Success: {len(successes)}/{len(AIRLINES)}")
    for s in successes:
        print(f"  ✓ {s}.png")
    if failures:
        print(f"\nFailed:  {len(failures)}/{len(AIRLINES)}")
        for f in failures:
            print(f"  ✗ {f}.png")


if __name__ == "__main__":
    main()
