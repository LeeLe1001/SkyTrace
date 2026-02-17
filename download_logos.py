"""Download airline logos from soaring-symbols to local static folder."""
import os, urllib.request, ssl

LOGO_MAP = {
    'A3':'aegean-airlines','EI':'aer-lingus','AR':'aerolineas-argentinas','AM':'aeromexico',
    'ZB':'air-albania','AH':'air-algerie','KC':'air-astana','AC':'air-canada',
    'EN':'air-dolomiti','UX':'air-europa','AF':'air-france','AI':'air-india',
    'MK':'air-mauritius','NZ':'air-new-zealand','JU':'air-serbia','TS':'air-transat',
    'AK':'airasia','PG':'bangkok-airways','BT':'airbaltic','QP':'akasa-air',
    'AS':'alaska-airlines','OZ':'asiana-airlines','RC':'atlantic-airways','AV':'avianca',
    'J2':'azerbaijan-airlines','QH':'bamboo-airways',
    'BA':'british-airways','SN':'brussels-airlines','CX':'cathay-pacific','CM':'copa-airlines',
    'EK':'emirates','ET':'ethiopian-airlines','EY':'etihad-airways','EW':'eurowings',
    'ZD':'ewa-air','FJ':'fiji-airways','FY':'firefly','XY':'flynas',
    'GA':'garuda-indonesia','UO':'hk-express','IB':'iberia','FI':'icelandair',
    '6E':'indigo','JL':'japan-airlines','JQ':'jetstar',
    'KQ':'kenya-airways','KL':'klm','KE':'korean-air','KU':'kuwait-airways',
    'LA':'latam-airlines','LO':'lot-polish-airlines','LH':'lufthansa',
    'MH':'malaysia-airlines','UB':'myanmar-national-airlines','WY':'oman-air',
    'ZP':'paranair','MM':'peach-aviation','PR':'philippine-airlines','QF':'qantas',
    'QR':'qatar-airways','RX':'riyadh-air','AT':'royal-air-maroc','BI':'royal-brunei-airlines',
    'FR':'ryanair','SV':'saudia','SK':'scandinavian-airlines',
    'TR':'scoot','SQ':'singapore-airlines','WN':'southwest-airlines','JX':'starlux-airlines',
    '9G':'sun-phuquoc-airways','LX':'swiss','TW':'tway-air','TP':'tap-air-portugal',
    'RO':'tarom','TG':'thai-airways','HV':'transavia','TK':'turkish-airlines',
    'UA':'united-airlines','VJ':'vietjet-air','VN':'vietnam-airlines',
    'VS':'virgin-atlantic','VA':'virgin-australia','WS':'westjet',
    'W6':'wizz-air','MF':'xiamenair',
}

BASE = 'https://raw.githubusercontent.com/anhthang/soaring-symbols/main/assets/'
OUT_DIR = os.path.join(os.path.dirname(__file__), 'static', 'img', 'airlines')
os.makedirs(OUT_DIR, exist_ok=True)

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

seen = set()
ok = 0
fail = 0
for iata, slug in LOGO_MAP.items():
    if slug in seen:
        continue
    seen.add(slug)
    url = f'{BASE}{slug}/icon.svg'
    out = os.path.join(OUT_DIR, f'{slug}.svg')
    if os.path.exists(out):
        ok += 1
        continue
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            data = resp.read()
        with open(out, 'wb') as f:
            f.write(data)
        ok += 1
        print(f'  ✓ {slug}')
    except Exception as e:
        fail += 1
        print(f'  ✗ {slug}: {e}')

print(f'\nDone: {ok} downloaded, {fail} failed')
