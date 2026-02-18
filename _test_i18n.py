"""Test script to analyze i18n behavior and find map disappearance bug"""
import urllib.request, json, re, sys

# Get the homepage HTML
r = urllib.request.urlopen('http://127.0.0.1:5000/')
html = r.read().decode('utf-8')

# 1. Find all data-i18n elements in home-view section
home_start = html.find('id="home-view"')
home_end = html.find('</section>', home_start)
home_html = html[home_start:home_end]
home_i18n = re.findall(r'data-i18n="([^"]+)"', home_html)
print(f"[1] data-i18n keys in home-view: {home_i18n}")

# 2. Find ALL data-i18n elements that have child HTML elements (not just text)
print("\n[2] data-i18n elements with child HTML tags:")
# More robust regex: match opening tag with data-i18n, then content until closing tag
pattern = r'<(\w+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>(.*?)</\1>'
for m in re.finditer(pattern, html, re.DOTALL):
    tag, key, content = m.group(1), m.group(2), m.group(3)
    if '<' in content:
        print(f"  WARNING: <{tag} data-i18n=\"{key}\"> has child elements: {content.strip()[:100]}")

# 3. Check if any data-i18n element is an ancestor of #home-map
# Look for elements that start before home-map and close after it
home_map_pos = html.find('id="home-map"')
print(f"\n[3] Position of #home-map in HTML: char {home_map_pos}")
# Find all opening tags with data-i18n before home-map
before_map = html[:home_map_pos]
open_tags_before = list(re.finditer(r'<(\w+)\b[^>]*\bdata-i18n="([^"]+)"[^/>]*>', before_map))
for m in open_tags_before:
    tag, key = m.group(1), m.group(2)
    # Check if this tag's closing tag is after home-map
    close_tag = f'</{tag}>'
    close_pos = html.find(close_tag, home_map_pos)
    if close_pos > home_map_pos:
        print(f"  CRITICAL: <{tag} data-i18n=\"{key}\"> is an ANCESTOR of #home-map!")
    else:
        # The tag might close before home-map (not an ancestor)
        close_before = html.find(close_tag, m.end())
        if close_before < home_map_pos:
            pass  # closes before map, not ancestor
        else:
            print(f"  POSSIBLE: <{tag} data-i18n=\"{key}\"> might wrap #home-map")

# 4. Read i18n.js and check English translations for any problematic values
print("\n[4] Checking English translations...")
with open('static/js/i18n.js', 'r', encoding='utf-8') as f:
    i18n_content = f.read()

# Extract the en locale block
en_start = i18n_content.find("en: {")
en_end = i18n_content.find("\n  },", en_start)
en_block = i18n_content[en_start:en_end]

# Check for empty string values
for line in en_block.split('\n'):
    line = line.strip()
    if ": ''," in line or ': "",' in line:
        print(f"  WARNING: Empty translation: {line}")

# 5. Simulate the applyI18n effect on critical elements
# Check if filterAll translation affects nav/button elements with children
print("\n[5] Checking filter-tab buttons with data-i18n:")
filter_pattern = r'<button[^>]*class="[^"]*filter-tab[^"]*"[^>]*data-i18n="([^"]+)"[^>]*>(.*?)</button>'
for m in re.finditer(filter_pattern, html, re.DOTALL):
    key, content = m.group(1), m.group(2)
    print(f"  Button data-i18n=\"{key}\" content: '{content.strip()}'")

# 6. Check for buttons/elements where data-i18n is on parent with important children
print("\n[6] Checking for data-i18n on elements with important children:")
# Look for any elements that have data-i18n AND have id-bearing children
for m in re.finditer(r'<(\w+)\b([^>]*\bdata-i18n="[^"]+")[^>]*>(.*?)</\1>', html, re.DOTALL):
    tag, attrs, content = m.group(1), m.group(2), m.group(3)
    if 'id="' in content:
        key = re.search(r'data-i18n="([^"]+)"', attrs).group(1)
        ids = re.findall(r'id="([^"]+)"', content)
        print(f"  CRITICAL: <{tag} data-i18n=\"{key}\"> contains elements with ids: {ids}")
        print(f"    Content preview: {content[:200]}")

print("\n[7] Test Flask app.test_client for language switch scenario:")
sys.path.insert(0, 'D:/Files/Coding/FootPrint')
from app import app
with app.test_client() as c:
    # Fetch flights
    r = c.get('/api/flights')
    flights = json.loads(r.data)
    print(f"  Flights loaded: {len(flights)}")
    
    # Fetch stats
    r = c.get('/api/stats')
    stats = json.loads(r.data)
    print(f"  Stats: total_flights={stats.get('total_flights')}")

print("\nDone.")
