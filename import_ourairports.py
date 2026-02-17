"""
从 OurAirports CSV 数据导入机场数据库
数据源: https://ourairports.com/data/

会读取:
  - airports.csv (机场主数据)
  - countries.csv (国家名)
  - regions.csv (区域/省份名)
生成:
  - data/airports.json (全部有 IATA 代码且有定期航班的机场)
"""

import csv
import json
import os

DATA_DIR = 'data'
RESOURCES_DIR = 'resources'
AIRPORTS_CSV = os.path.join(RESOURCES_DIR, 'airports.csv')
COUNTRIES_CSV = os.path.join(RESOURCES_DIR, 'countries.csv')
REGIONS_CSV = os.path.join(RESOURCES_DIR, 'regions.csv')
OUTPUT_FILE = os.path.join(DATA_DIR, 'airports.json')

# ==================== 中文翻译字典 ====================
# 用于把英文名翻译成中文的常用机场/城市/国家

COUNTRY_ZH = {
    'CN': '中国', 'US': '美国', 'JP': '日本', 'KR': '韩国', 'GB': '英国',
    'FR': '法国', 'DE': '德国', 'IT': '意大利', 'ES': '西班牙', 'PT': '葡萄牙',
    'NL': '荷兰', 'BE': '比利时', 'CH': '瑞士', 'AT': '奥地利', 'SE': '瑞典',
    'NO': '挪威', 'DK': '丹麦', 'FI': '芬兰', 'PL': '波兰', 'CZ': '捷克',
    'HU': '匈牙利', 'RO': '罗马尼亚', 'GR': '希腊', 'TR': '土耳其', 'RU': '俄罗斯',
    'UA': '乌克兰', 'IE': '爱尔兰', 'IS': '冰岛', 'LU': '卢森堡', 'SK': '斯洛伐克',
    'SI': '斯洛文尼亚', 'HR': '克罗地亚', 'RS': '塞尔维亚', 'BG': '保加利亚',
    'LT': '立陶宛', 'LV': '拉脱维亚', 'EE': '爱沙尼亚', 'CY': '塞浦路斯',
    'MT': '马耳他', 'AL': '阿尔巴尼亚', 'MK': '北马其顿', 'BA': '波黑',
    'ME': '黑山', 'MD': '摩尔多瓦', 'BY': '白俄罗斯', 'GE': '格鲁吉亚',
    'AM': '亚美尼亚', 'AZ': '阿塞拜疆', 'KZ': '哈萨克斯坦', 'UZ': '乌兹别克斯坦',
    'TM': '土库曼斯坦', 'KG': '吉尔吉斯斯坦', 'TJ': '塔吉克斯坦',
    'IN': '印度', 'PK': '巴基斯坦', 'BD': '孟加拉', 'LK': '斯里兰卡',
    'NP': '尼泊尔', 'MM': '缅甸', 'TH': '泰国', 'VN': '越南', 'KH': '柬埔寨',
    'LA': '老挝', 'MY': '马来西亚', 'SG': '新加坡', 'ID': '印度尼西亚',
    'PH': '菲律宾', 'BN': '文莱', 'TL': '东帝汶', 'MN': '蒙古',
    'TW': '中国台湾', 'HK': '中国香港', 'MO': '中国澳门',
    'AU': '澳大利亚', 'NZ': '新西兰', 'FJ': '斐济', 'PG': '巴布亚新几内亚',
    'TO': '汤加', 'WS': '萨摩亚', 'VU': '瓦努阿图', 'NC': '新喀里多尼亚',
    'PF': '法属波利尼西亚', 'GU': '关岛',
    'CA': '加拿大', 'MX': '墨西哥', 'BR': '巴西', 'AR': '阿根廷',
    'CL': '智利', 'CO': '哥伦比亚', 'PE': '秘鲁', 'VE': '委内瑞拉',
    'EC': '厄瓜多尔', 'BO': '玻利维亚', 'UY': '乌拉圭', 'PY': '巴拉圭',
    'GY': '圭亚那', 'SR': '苏里南',
    'CU': '古巴', 'JM': '牙买加', 'HT': '海地', 'DO': '多米尼加',
    'TT': '特立尼达', 'PR': '波多黎各', 'PA': '巴拿马', 'CR': '哥斯达黎加',
    'GT': '危地马拉', 'HN': '洪都拉斯', 'SV': '萨尔瓦多', 'NI': '尼加拉瓜',
    'BZ': '伯利兹', 'BS': '巴哈马', 'BB': '巴巴多斯',
    'SA': '沙特阿拉伯', 'AE': '阿联酋', 'QA': '卡塔尔', 'KW': '科威特',
    'BH': '巴林', 'OM': '阿曼', 'YE': '也门', 'IQ': '伊拉克', 'IR': '伊朗',
    'IL': '以色列', 'JO': '约旦', 'LB': '黎巴嫩', 'SY': '叙利亚',
    'PS': '巴勒斯坦', 'AF': '阿富汗',
    'EG': '埃及', 'MA': '摩洛哥', 'TN': '突尼斯', 'DZ': '阿尔及利亚',
    'LY': '利比亚', 'SD': '苏丹', 'SS': '南苏丹', 'ET': '埃塞俄比亚',
    'KE': '肯尼亚', 'TZ': '坦桑尼亚', 'UG': '乌干达', 'RW': '卢旺达',
    'NG': '尼日利亚', 'GH': '加纳', 'SN': '塞内加尔', 'CI': '科特迪瓦',
    'CM': '喀麦隆', 'CD': '刚果(金)', 'CG': '刚果(布)', 'AO': '安哥拉',
    'MZ': '莫桑比克', 'ZW': '津巴布韦', 'ZM': '赞比亚', 'BW': '博茨瓦纳',
    'NA': '纳米比亚', 'MG': '马达加斯加', 'MU': '毛里求斯', 'SC': '塞舌尔',
    'ZA': '南非', 'RE': '留尼汪', 'ML': '马里', 'BF': '布基纳法索',
    'NE': '尼日尔', 'TD': '乍得', 'GA': '加蓬', 'GN': '几内亚',
    'SL': '塞拉利昂', 'LR': '利比里亚', 'DJ': '吉布提', 'ER': '厄立特里亚',
    'SO': '索马里', 'MW': '马拉维', 'BI': '布隆迪', 'CV': '佛得角',
    'MR': '毛里塔尼亚', 'GM': '冈比亚', 'GQ': '赤道几内亚', 'ST': '圣多美',
    'SZ': '斯威士兰', 'LS': '莱索托', 'KM': '科摩罗', 'BJ': '贝宁',
    'TG': '多哥', 'CF': '中非', 'GW': '几内亚比绍',
    'AD': '安道尔', 'MC': '摩纳哥', 'SM': '圣马力诺', 'LI': '列支敦士登',
    'XK': '科索沃',
    'KP': '朝鲜',
    'AW': '阿鲁巴', 'CW': '库拉索', 'BM': '百慕大', 'KY': '开曼群岛',
    'VI': '美属维尔京群岛', 'VG': '英属维尔京群岛',
    'TC': '特克斯和凯科斯', 'AG': '安提瓜', 'DM': '多米尼克', 'GD': '格林纳达',
    'LC': '圣卢西亚', 'VC': '圣文森特', 'KN': '圣基茨', 'AI': '安圭拉',
    'MS': '蒙特塞拉特', 'MF': '法属圣马丁', 'SX': '荷属圣马丁', 'GP': '瓜德罗普',
    'MQ': '马提尼克', 'GF': '法属圭亚那',
    'GL': '格陵兰', 'FO': '法罗群岛',
}

# 常用中国城市翻译
CITY_ZH = {
    # 特殊: CSV中中国机场的municipality是英文, 需要翻译
    'Beijing': '北京', 'Shanghai': '上海', 'Guangzhou': '广州', 'Shenzhen': '深圳',
    'Chengdu': '成都', 'Chongqing': '重庆', 'Hangzhou': '杭州', 'Wuhan': '武汉',
    'Nanjing': '南京', 'Xian': '西安', "Xi'an": '西安', 'Kunming': '昆明',
    'Changsha': '长沙', 'Xiamen': '厦门', 'Zhengzhou': '郑州', 'Qingdao': '青岛',
    'Dalian': '大连', 'Tianjin': '天津', 'Shenyang': '沈阳', 'Harbin': '哈尔滨',
    'Changchun': '长春', 'Urumqi': '乌鲁木齐', 'Ürümqi': '乌鲁木齐',
    'Haikou': '海口', 'Sanya': '三亚', 'Nanning': '南宁', 'Guiyang': '贵阳',
    'Fuzhou': '福州', 'Jinan': '济南', 'Taiyuan': '太原', 'Hefei': '合肥',
    'Nanchang': '南昌', 'Lhasa': '拉萨', 'Lanzhou': '兰州', 'Yinchuan': '银川',
    'Xining': '西宁', 'Hohhot': '呼和浩特', 'Shijiazhuang': '石家庄',
    'Wenzhou': '温州', 'Ningbo': '宁波', 'Wuxi': '无锡', 'Zhuhai': '珠海',
    'Guilin': '桂林', 'Lijiang': '丽江', 'Luoyang': '洛阳', 'Yantai': '烟台',
    'Huangshan': '黄山', 'Zhangjiajie': '张家界', 'Dunhuang': '敦煌',
    'Dali': '大理', 'Mianyang': '绵阳', 'Nantong': '南通', 'Xuzhou': '徐州',
    'Yichang': '宜昌', 'Xishuangbanna': '西双版纳', 'Lhasa': '拉萨',
    'Turpan': '吐鲁番', 'Kashgar': '喀什', 'Hotan': '和田', 'Korla': '库尔勒',
    'Yining': '伊宁', 'Altay': '阿勒泰', 'Karamay': '克拉玛依',
    'Mudanjiang': '牡丹江', 'Qiqihar': '齐齐哈尔', 'Jiamusi': '佳木斯',
    'Heihe': '黑河', 'Mohe': '漠河', 'Manzhouli': '满洲里',
    'Baotou': '包头', 'Ordos': '鄂尔多斯', 'Tongliao': '通辽',
    'Hulunbuir': '呼伦贝尔', 'Hailar': '海拉尔', 'Chifeng': '赤峰',
    'Wuhai': '乌海', 'Xilinhot': '锡林浩特',
    'Yan\'an': '延安', 'Yulin': '榆林', 'Hanzhong': '汉中',
    'Yuncheng': '运城', 'Datong': '大同', 'Changzhi': '长治',
    'Luzhou': '泸州', 'Panzhihua': '攀枝花', 'Dazhou': '达州',
    'Leshan': '乐山', 'Yibin': '宜宾', 'Nanchong': '南充',
    'Liupanshui': '六盘水', 'Zunyi': '遵义', 'Anshun': '安顺',
    'Beihai': '北海', 'Liuzhou': '柳州', 'Wuzhou': '梧州', 'Hechi': '河池',
    'Zhanjiang': '湛江', 'Meizhou': '梅州', 'Shantou': '汕头', 'Jieyang': '揭阳',
    'Shaoguan': '韶关', 'Huizhou': '惠州', 'Foshan': '佛山',
    'Ganzhou': '赣州', 'Jingdezhen': '景德镇', 'Jiujiang': '九江', 'Yichun': '宜春',
    'Quanzhou': '泉州', 'Wuyishan': '武夷山', 'Longyan': '龙岩', 'Nanping': '南平',
    'Sanming': '三明',
    'Yiwu': '义乌', 'Zhoushan': '舟山', 'Quzhou': '衢州', 'Taizhou': '台州',
    'Huai\'an': '淮安', 'Lianyungang': '连云港', 'Yancheng': '盐城',
    'Changzhou': '常州', 'Yangzhou': '扬州',
    'Jining': '济宁', 'Linyi': '临沂', 'Weihai': '威海', 'Dongying': '东营',
    'Enshi': '恩施', 'Xiangyang': '襄阳', 'Jingzhou': '荆州',
    'Zhuzhou': '株洲', 'Yongzhou': '永州', 'Huaihua': '怀化', 'Hengyang': '衡阳',
    'Luoyang': '洛阳', 'Nanyang': '南阳', 'Xinyang': '信阳',
    'Wuhu': '芜湖', 'Fuyang': '阜阳', 'Anqing': '安庆', 'Chizhou': '池州',
    'Bengbu': '蚌埠',
    'Tengchong': '腾冲', 'Shangri-La': '香格里拉', 'Mangshi': '芒市', 'Pu\'er': '普洱',
    'Baoshan': '保山', 'Zhaotong': '昭通', 'Lincang': '临沧', 'Wenshan': '文山',
    # 日本
    'Tokyo': '东京', 'Osaka': '大阪', 'Nagoya': '名古屋', 'Sapporo': '札幌',
    'Fukuoka': '福冈', 'Naha': '那霸', 'Sendai': '仙台', 'Hiroshima': '广岛',
    'Kobe': '神户', 'Kagoshima': '鹿儿岛', 'Kumamoto': '熊本', 'Nagasaki': '长崎',
    'Oita': '大分', 'Miyazaki': '宫崎', 'Matsuyama': '松山', 'Takamatsu': '高松',
    'Tokushima': '德岛', 'Kochi': '高知', 'Kitakyushu': '北九州',
    'Niigata': '新潟', 'Toyama': '富山', 'Komatsu': '小松', 'Okayama': '冈山',
    'Izumo': '出云', 'Asahikawa': '旭川', 'Hakodate': '函馆',
    'Obihiro': '带广', 'Kushiro': '�的路', 'Memanbetsu': '女满别',
    'Aomori': '青森', 'Akita': '秋田', 'Yamagata': '山形', 'Shonai': '庄内',
    'Narita': '东京', 'Chitose': '札幌',  # 多机场城市: 机场所在地 → 城市名
    'Orly': '巴黎', 'Roissy-en-France': '巴黎',  # 巴黎多机场
    'Gatwick': '伦敦', 'Stansted': '伦敦', 'Luton': '伦敦',  # 伦敦多机场
    'Newark': '纽约', 'Queens': '纽约',  # 纽约多机场
    'Minhang': '上海', 'Pudong': '上海',  # 上海多机场区名
    'Shuangliu': '成都', 'Jianyang': '成都',  # 成都多机场区名
    'Huadu': '广州',  # 广州白云机场所在区
    # 韩国
    'Seoul': '首尔', 'Incheon': '仁川', 'Busan': '釜山', 'Jeju': '济州',
    'Daegu': '大邱', 'Gwangju': '光州', 'Cheongju': '清州', 'Ulsan': '蔚山',
    'Wonju': '原州', 'Yeosu': '丽水', 'Gunsan': '群山', 'Sacheon': '泗川',
    'Pohang': '浦项', 'Jinju': '晋州', 'Yangyang': '襄阳',
    # 东南亚
    'Bangkok': '曼谷', 'Singapore': '新加坡', 'Kuala Lumpur': '吉隆坡',
    'Jakarta': '雅加达', 'Manila': '马尼拉', 'Hanoi': '河内', 'Ho Chi Minh City': '胡志明市',
    'Phnom Penh': '金边', 'Vientiane': '万象', 'Yangon': '仰光',
    'Bali': '巴厘岛', 'Denpasar': '登巴萨', 'Phuket': '普吉', 'Chiang Mai': '清迈',
    'Cebu': '宿雾', 'Da Nang': '岘港', 'Nha Trang': '芽庄',
    'Siem Reap': '暹粒', 'Kota Kinabalu': '亚庇', 'Penang': '槟城',
    'Surabaya': '泗水', 'Medan': '棉兰', 'Makassar': '望加锡',
    'Luang Prabang': '琅勃拉邦', 'Mandalay': '曼德勒',
    'Langkawi': '兰卡威', 'Johor Bahru': '新山', 'Kuching': '古晋',
    'Yogyakarta': '日惹', 'Bandung': '万隆', 'Lombok': '龙目',
    # 南亚
    'New Delhi': '新德里', 'Delhi': '德里', 'Mumbai': '孟买', 'Bangalore': '班加罗尔',
    'Bengaluru': '班加罗尔',
    'Chennai': '金奈', 'Kolkata': '加尔各答', 'Hyderabad': '海德拉巴',
    'Colombo': '科伦坡', 'Kathmandu': '加德满都', 'Dhaka': '达卡',
    'Karachi': '卡拉奇', 'Lahore': '拉合尔', 'Islamabad': '伊斯兰堡',
    'Male': '马累', 'Malé': '马累',
    # 中东
    'Dubai': '迪拜', 'Abu Dhabi': '阿布扎比', 'Doha': '多哈', 'Riyadh': '利雅得',
    'Jeddah': '吉达', 'Muscat': '马斯喀特', 'Kuwait City': '科威特城',
    'Manama': '麦纳麦', 'Amman': '安曼', 'Beirut': '贝鲁特',
    'Tel Aviv': '特拉维夫', 'Baghdad': '巴格达', 'Tehran': '德黑兰',
    'Istanbul': '伊斯坦布尔', 'Ankara': '安卡拉', 'Antalya': '安塔利亚',
    'Baku': '巴库', 'Tbilisi': '第比利斯', 'Yerevan': '埃里温',
    'Almaty': '阿拉木图', 'Astana': '阿斯塔纳', 'Nur-Sultan': '努尔苏丹',
    'Tashkent': '塔什干',
    # 欧洲
    'London': '伦敦', 'Paris': '巴黎', 'Frankfurt': '法兰克福', 'Munich': '慕尼黑',
    'Amsterdam': '阿姆斯特丹', 'Rome': '罗马', 'Milan': '米兰', 'Madrid': '马德里',
    'Barcelona': '巴塞罗那', 'Lisbon': '里斯本', 'Vienna': '维也纳',
    'Zurich': '苏黎世', 'Geneva': '日内瓦', 'Brussels': '布鲁塞尔',
    'Copenhagen': '哥本哈根', 'Stockholm': '斯德哥尔摩', 'Oslo': '奥斯陆',
    'Helsinki': '赫尔辛基', 'Dublin': '都柏林', 'Edinburgh': '爱丁堡',
    'Manchester': '曼彻斯特', 'Birmingham': '伯明翰', 'Glasgow': '格拉斯哥',
    'Berlin': '柏林', 'Hamburg': '汉堡', 'Düsseldorf': '杜塞尔多夫',
    'Cologne': '科隆', 'Stuttgart': '斯图加特', 'Hanover': '汉诺威',
    'Prague': '布拉格', 'Warsaw': '华沙', 'Budapest': '布达佩斯',
    'Bucharest': '布加勒斯特', 'Athens': '雅典', 'Moscow': '莫斯科',
    'Saint Petersburg': '圣彼得堡', 'St. Petersburg': '圣彼得堡',
    'Kyiv': '基辅', 'Kiev': '基辅', 'Reykjavik': '雷克雅未克',
    'Bratislava': '布拉迪斯拉发', 'Ljubljana': '卢布尔雅那',
    'Zagreb': '萨格勒布', 'Belgrade': '贝尔格莱德', 'Sofia': '索非亚',
    'Vilnius': '维尔纽斯', 'Riga': '里加', 'Tallinn': '塔林',
    'Sarajevo': '萨拉热窝', 'Skopje': '斯科普里', 'Tirana': '地拉那',
    'Podgorica': '波德戈里察', 'Chisinau': '基希讷乌', 'Minsk': '明斯克',
    'Nice': '尼斯', 'Lyon': '里昂', 'Marseille': '马赛', 'Toulouse': '图卢兹',
    'Venice': '威尼斯', 'Naples': '那不勒斯', 'Florence': '佛罗伦萨',
    'Palermo': '巴勒莫', 'Bologna': '博洛尼亚', 'Pisa': '比萨',
    'Malaga': '马拉加', 'Seville': '塞维利亚', 'Valencia': '瓦伦西亚',
    'Bilbao': '毕尔巴鄂', 'Porto': '波尔图', 'Faro': '法罗',
    'Bergen': '卑尔根', 'Gothenburg': '哥德堡', 'Malmö': '马尔默',
    'Salzburg': '萨尔茨堡', 'Innsbruck': '因斯布鲁克', 'Basel': '巴塞尔',
    'Luxembourg': '卢森堡', 'Thessaloniki': '塞萨洛尼基',
    'Nuremberg': '纽伦堡', 'Leipzig': '莱比锡', 'Dresden': '德累斯顿',
    'Krakow': '克拉科夫', 'Gdansk': '格但斯克', 'Wroclaw': '弗罗茨瓦夫',
    'Dubrovnik': '杜布罗夫尼克', 'Split': '斯普利特',
    # 北美
    'New York': '纽约', 'Los Angeles': '洛杉矶', 'Chicago': '芝加哥',
    'San Francisco': '旧金山', 'Washington': '华盛顿', 'Seattle': '西雅图',
    'Boston': '波士顿', 'Dallas': '达拉斯', 'Houston': '休斯敦',
    'Atlanta': '亚特兰大', 'Miami': '迈阿密', 'Denver': '丹佛',
    'Las Vegas': '拉斯维加斯', 'Phoenix': '凤凰城', 'San Diego': '圣迭戈',
    'Orlando': '奥兰多', 'Minneapolis': '明尼阿波利斯', 'Detroit': '底特律',
    'Philadelphia': '费城', 'Charlotte': '夏洛特', 'Honolulu': '檀香山',
    'San Jose': '圣何塞', 'Austin': '奥斯汀', 'Nashville': '纳什维尔',
    'Portland': '波特兰', 'Salt Lake City': '盐湖城', 'Tampa': '坦帕',
    'Toronto': '多伦多', 'Vancouver': '温哥华', 'Montreal': '蒙特利尔',
    'Calgary': '卡尔加里', 'Edmonton': '埃德蒙顿', 'Ottawa': '渥太华',
    'Winnipeg': '温尼伯', 'Halifax': '哈利法克斯', 'Victoria': '维多利亚',
    'Quebec': '魁北克', 'Quebec City': '魁北克城',
    'Mexico City': '墨西哥城', 'Cancun': '坎昆', 'Cancún': '坎昆',
    'Guadalajara': '瓜达拉哈拉', 'Monterrey': '蒙特雷',
    'Havana': '哈瓦那', 'San Juan': '圣胡安', 'Nassau': '拿骚',
    'Panama City': '巴拿马城', 'San Jose': '圣何塞',
    # 南美
    'São Paulo': '圣保罗', 'Sao Paulo': '圣保罗', 'Rio de Janeiro': '里约热内卢',
    'Buenos Aires': '布宜诺斯艾利斯', 'Santiago': '圣地亚哥',
    'Lima': '利马', 'Bogota': '波哥大', 'Bogotá': '波哥大',
    'Quito': '基多', 'Caracas': '加拉加斯', 'Montevideo': '蒙得维的亚',
    'Brasilia': '巴西利亚', 'Brasília': '巴西利亚',
    'Medellín': '麦德林', 'Medellin': '麦德林',
    # 非洲
    'Cairo': '开罗', 'Casablanca': '卡萨布兰卡', 'Johannesburg': '约翰内斯堡',
    'Cape Town': '开普敦', 'Nairobi': '内罗毕', 'Addis Ababa': '亚的斯亚贝巴',
    'Lagos': '拉各斯', 'Accra': '阿克拉', 'Dakar': '达喀尔',
    'Dar es Salaam': '达累斯萨拉姆', 'Tunis': '突尼斯城',
    'Algiers': '阿尔及尔', 'Marrakech': '马拉喀什',
    'Durban': '德班', 'Windhoek': '温得和克', 'Luanda': '罗安达',
    'Kigali': '基加利', 'Entebbe': '恩德培', 'Maputo': '马普托',
    'Antananarivo': '塔那那利佛',
    # 大洋洲
    'Sydney': '悉尼', 'Melbourne': '墨尔本', 'Brisbane': '布里斯班',
    'Perth': '珀斯', 'Adelaide': '阿德莱德', 'Auckland': '奥克兰',
    'Wellington': '惠灵顿', 'Christchurch': '基督城', 'Queenstown': '皇后镇',
    'Gold Coast': '黄金海岸', 'Cairns': '凯恩斯', 'Darwin': '达尔文',
    'Hobart': '霍巴特', 'Canberra': '堪培拉', 'Nadi': '楠迪',
    'Suva': '苏瓦', 'Port Moresby': '莫尔兹比港',
    # 中国台湾城市
    'Taipei': '台北', 'Kaohsiung': '高雄', 'Taichung': '台中',
    'Tainan': '台南', 'Hualien': '花莲', 'Taitung': '台东',
    'Kinmen': '金门', 'Penghu': '澎湖', 'Magong': '马公',
    # 中国香港/澳门
    'Hong Kong': '香港', 'Macau': '澳门', 'Macao': '澳门',
}

# 知名机场的中文名（手动维护常用的）
AIRPORT_NAME_ZH = {
    # 中国
    'PEK': '北京首都国际机场', 'PKX': '北京大兴国际机场',
    'PVG': '上海浦东国际机场', 'SHA': '上海虹桥国际机场',
    'CAN': '广州白云国际机场', 'SZX': '深圳宝安国际机场',
    'CTU': '成都双流国际机场', 'TFU': '成都天府国际机场',
    'CKG': '重庆江北国际机场', 'HGH': '杭州萧山国际机场',
    'WUH': '武汉天河国际机场', 'NKG': '南京禄口国际机场',
    'XIY': '西安咸阳国际机场', 'KMG': '昆明长水国际机场',
    'CSX': '长沙黄花国际机场', 'XMN': '厦门高崎国际机场',
    'CGO': '郑州新郑国际机场', 'TAO': '青岛胶东国际机场',
    'DLC': '大连周水子国际机场', 'TSN': '天津滨海国际机场',
    'SHE': '沈阳桃仙国际机场', 'HRB': '哈尔滨太平国际机场',
    'CGQ': '长春龙嘉国际机场', 'URC': '乌鲁木齐地窝堡国际机场',
    'HAK': '海口美兰国际机场', 'SYX': '三亚凤凰国际机场',
    'NNG': '南宁吴圩国际机场', 'KWE': '贵阳龙洞堡国际机场',
    'FOC': '福州长乐国际机场', 'TNA': '济南遥墙国际机场',
    'TYN': '太原武宿国际机场', 'HFE': '合肥新桥国际机场',
    'KHN': '南昌昌北国际机场', 'LXA': '拉萨贡嘎国际机场',
    'LHW': '兰州中川国际机场', 'INC': '银川河东国际机场',
    'XNN': '西宁曹家堡国际机场', 'HET': '呼和浩特白塔国际机场',
    'SJW': '石家庄正定国际机场', 'WNZ': '温州龙湾国际机场',
    'NGB': '宁波栎社国际机场', 'ZUH': '珠海金湾机场', 'KWL': '桂林两江国际机场',
    # 中国港澳台
    'HKG': '香港国际机场', 'MFM': '澳门国际机场',
    'TPE': '台北桃园国际机场', 'TSA': '台北松山机场',
    'KHH': '高雄国际机场', 'RMQ': '台中清泉岗机场',
    # 日本
    'NRT': '东京成田国际机场', 'HND': '东京羽田国际机场',
    'KIX': '大阪关西国际机场', 'ITM': '大阪伊丹机场',
    'NGO': '名古屋中部国际机场', 'CTS': '札幌新千岁机场',
    'FUK': '福冈机场', 'OKA': '那霸机场',
    # 韩国
    'ICN': '仁川国际机场', 'GMP': '首尔金浦国际机场',
    'PUS': '釜山金海国际机场', 'CJU': '济州国际机场',
    # 东南亚
    'SIN': '新加坡樟宜机场', 'BKK': '曼谷素万那普机场',
    'DMK': '曼谷廊曼机场', 'KUL': '吉隆坡国际机场',
    'CGK': '雅加达苏加诺-哈达国际机场', 'MNL': '马尼拉尼诺伊·阿基诺国际机场',
    'HAN': '河内内排国际机场', 'SGN': '胡志明市新山一国际机场',
    'REP': '暹粒吴哥国际机场', 'PNH': '金边国际机场',
    'DPS': '巴厘岛伍拉·赖国际机场',
    # 中东
    'DXB': '迪拜国际机场', 'AUH': '阿布扎比国际机场',
    'DOH': '多哈哈马德国际机场', 'IST': '伊斯坦布尔机场',
    # 欧洲
    'LHR': '伦敦希思罗机场', 'LGW': '伦敦盖特威克机场',
    'STN': '伦敦斯坦斯特德机场', 'LTN': '伦敦卢顿机场',
    'CDG': '巴黎戴高乐机场', 'ORY': '巴黎奥利机场',
    'FRA': '法兰克福机场', 'MUC': '慕尼黑机场',
    'AMS': '阿姆斯特丹史基浦机场', 'FCO': '罗马菲乌米奇诺机场',
    'MXP': '米兰马尔彭萨机场', 'MAD': '马德里巴拉哈斯机场',
    'BCN': '巴塞罗那埃尔普拉特机场', 'LIS': '里斯本机场',
    'VIE': '维也纳机场', 'ZRH': '苏黎世机场',
    'BRU': '布鲁塞尔机场', 'CPH': '哥本哈根机场',
    'ARN': '斯德哥尔摩阿兰达机场', 'OSL': '奥斯陆加勒穆恩机场',
    'HEL': '赫尔辛基万塔机场', 'DUB': '都柏林机场',
    'BER': '柏林勃兰登堡机场', 'PRG': '布拉格机场',
    'WAW': '华沙肖邦机场', 'BUD': '布达佩斯机场',
    'ATH': '雅典机场', 'SVO': '莫斯科谢列梅捷沃机场',
    'DME': '莫斯科多莫杰多沃机场', 'LED': '圣彼得堡普尔科沃机场',
    'KEF': '雷克雅未克凯夫拉维克机场',
    # 北美
    'JFK': '纽约肯尼迪国际机场', 'EWR': '纽瓦克自由国际机场',
    'LGA': '纽约拉瓜迪亚机场',
    'LAX': '洛杉矶国际机场', 'SFO': '旧金山国际机场',
    'ORD': "芝加哥奥黑尔国际机场", 'ATL': '亚特兰大国际机场',
    'DFW': '达拉斯沃思堡国际机场', 'IAH': '休斯顿洲际机场',
    'SEA': '西雅图-塔科马国际机场', 'BOS': '波士顿洛根国际机场',
    'MIA': '迈阿密国际机场', 'DEN': '丹佛国际机场',
    'LAS': '拉斯维加斯麦卡伦国际机场', 'IAD': '华盛顿杜勒斯国际机场',
    'DCA': '华盛顿里根国际机场',
    'YYZ': '多伦多皮尔逊国际机场', 'YVR': '温哥华国际机场',
    'YUL': '蒙特利尔特鲁多机场',
    'MEX': '墨西哥城国际机场', 'CUN': '坎昆国际机场',
    # 南美
    'GRU': '圣保罗瓜鲁柳斯国际机场', 'GIG': '里约热内卢加利昂国际机场',
    'EZE': '布宜诺斯艾利斯埃塞萨国际机场', 'SCL': '圣地亚哥国际机场',
    'LIM': '利马国际机场', 'BOG': '波哥大国际机场',
    # 非洲/大洋洲
    'CAI': '开罗国际机场', 'JNB': '约翰内斯堡奥利弗·坦博国际机场',
    'CPT': '开普敦国际机场', 'NBO': '内罗毕肯雅塔国际机场',
    'ADD': '亚的斯亚贝巴博莱国际机场', 'CMN': '卡萨布兰卡穆罕默德五世机场',
    'SYD': '悉尼金斯福德·史密斯机场', 'MEL': '墨尔本机场',
    'BNE': '布里斯班机场', 'AKL': '奥克兰机场',
}

# ==================== 多机场城市: 机场标识符 ====================
# 用于区分同一城市多个机场, 格式: city_en = "CityName (Identifier)"
# 只对有多个机场的城市设置标识符
AIRPORT_TAG = {
    # 上海
    'SHA': 'Hongqiao', 'PVG': 'Pudong',
    # 北京
    'PEK': 'Capital', 'PKX': 'Daxing',
    # 成都
    'CTU': 'Shuangliu', 'TFU': 'Tianfu',
    # 东京
    'NRT': 'Narita', 'HND': 'Haneda',
    # 大阪
    'KIX': 'Kansai', 'ITM': 'Itami',
    # 首尔
    'ICN': 'Incheon', 'GMP': 'Gimpo',
    # 伦敦
    'LHR': 'Heathrow', 'LGW': 'Gatwick', 'STN': 'Stansted', 'LTN': 'Luton', 'LCY': 'City',
    # 巴黎
    'CDG': 'CDG', 'ORY': 'Orly', 'BVA': 'Beauvais',
    # 纽约
    'JFK': 'JFK', 'EWR': 'Newark', 'LGA': 'LaGuardia',
    # 华盛顿
    'IAD': 'Dulles', 'DCA': 'Reagan',
    # 芝加哥
    'ORD': "O'Hare", 'MDW': 'Midway',
    # 莫斯科
    'SVO': 'Sheremetyevo', 'DME': 'Domodedovo', 'VKO': 'Vnukovo',
    # 台北
    'TPE': 'Taoyuan', 'TSA': 'Songshan',
    # 圣保罗
    'GRU': 'Guarulhos', 'CGH': 'Congonhas',
    # 布宜诺斯艾利斯
    'EZE': 'Ezeiza', 'AEP': 'Aeroparque',
    # 里约
    'GIG': 'Galeão', 'SDU': 'Santos Dumont',
    # 米兰
    'MXP': 'Malpensa', 'LIN': 'Linate',
    # 罗马
    'FCO': 'Fiumicino', 'CIA': 'Ciampino',
    # 斯德哥尔摩
    'ARN': 'Arlanda', 'BMA': 'Bromma',
    # 曼谷
    'BKK': 'Suvarnabhumi', 'DMK': 'Don Mueang',
    # 吉隆坡
    'KUL': 'KLIA', 'SZB': 'Sultan Abdul Aziz Shah',
}

# 多机场城市中文标识符 (对应 AIRPORT_TAG)
AIRPORT_TAG_ZH = {
    # 上海
    'SHA': '虹桥', 'PVG': '浦东',
    # 北京
    'PEK': '首都', 'PKX': '大兴',
    # 成都
    'CTU': '双流', 'TFU': '天府',
    # 东京
    'NRT': '成田', 'HND': '羽田',
    # 大阪
    'KIX': '关西', 'ITM': '伊丹',
    # 首尔
    'ICN': '仁川', 'GMP': '金浦',
    # 伦敦
    'LHR': '希思罗', 'LGW': '盖特威克', 'STN': '斯坦斯特德', 'LTN': '卢顿', 'LCY': '城市',
    # 巴黎
    'CDG': '戴高乐', 'ORY': '奥利', 'BVA': '博韦',
    # 纽约
    'JFK': '肯尼迪', 'EWR': '纽瓦克', 'LGA': '拉瓜迪亚',
    # 华盛顿
    'IAD': '杜勒斯', 'DCA': '里根',
    # 芝加哥
    'ORD': '奥黑尔', 'MDW': '中途',
    # 莫斯科
    'SVO': '谢列梅捷沃', 'DME': '多莫杰多沃', 'VKO': '伏努科沃',
    # 台北
    'TPE': '桃园', 'TSA': '松山',
    # 圣保罗
    'GRU': '瓜鲁柳斯', 'CGH': '孔戈尼亚斯',
    # 布宜诺斯艾利斯
    'EZE': '埃塞萨', 'AEP': '豪尔赫纽贝里',
    # 里约
    'GIG': '加利昂', 'SDU': '桑托斯杜蒙特',
    # 米兰
    'MXP': '马尔彭萨', 'LIN': '利纳特',
    # 罗马
    'FCO': '菲乌米奇诺', 'CIA': '钱皮诺',
    # 斯德哥尔摩
    'ARN': '阿兰达', 'BMA': '布罗马',
    # 曼谷
    'BKK': '素万那普', 'DMK': '廊曼',
    # 吉隆坡
    'KUL': 'KLIA', 'SZB': '梳邦',
}

# 多机场城市日语标识符
AIRPORT_TAG_JA = {
    'SHA': '虹橋', 'PVG': '浦東',
    'PEK': '首都', 'PKX': '大興',
    'CTU': '双流', 'TFU': '天府',
    'NRT': '成田', 'HND': '羽田',
    'KIX': '関西', 'ITM': '伊丹',
    'ICN': '仁川', 'GMP': '金浦',
    'LHR': 'ヒースロー', 'LGW': 'ガトウィック', 'STN': 'スタンステッド', 'LTN': 'ルートン', 'LCY': 'シティ',
    'CDG': 'CDG', 'ORY': 'オルリー', 'BVA': 'ボーヴェ',
    'JFK': 'JFK', 'EWR': 'ニューアーク', 'LGA': 'ラガーディア',
    'IAD': 'ダレス', 'DCA': 'レーガン',
    'ORD': 'オヘア', 'MDW': 'ミッドウェー',
    'SVO': 'シェレメーチエヴォ', 'DME': 'ドモジェドヴォ', 'VKO': 'ヴヌーコヴォ',
    'TPE': '桃園', 'TSA': '松山',
    'GRU': 'グアルーリョス', 'CGH': 'コンゴーニャス',
    'EZE': 'エセイサ', 'AEP': 'アエロパルケ',
    'GIG': 'ガレオン', 'SDU': 'サントス・ドゥモン',
    'MXP': 'マルペンサ', 'LIN': 'リナーテ',
    'FCO': 'フィウミチーノ', 'CIA': 'チャンピーノ',
    'ARN': 'アーランダ', 'BMA': 'ブロンマ',
    'BKK': 'スワンナプーム', 'DMK': 'ドンムアン',
    'KUL': 'KLIA', 'SZB': 'スルタン',
}

# 多机场城市韩语标识符
AIRPORT_TAG_KO = {
    'SHA': '훙차오', 'PVG': '푸둥',
    'PEK': '서우두', 'PKX': '다싱',
    'CTU': '솽류', 'TFU': '톈푸',
    'NRT': '나리타', 'HND': '하네다',
    'KIX': '간사이', 'ITM': '이타미',
    'ICN': '인천', 'GMP': '김포',
    'LHR': '히드로', 'LGW': '개트윅', 'STN': '스탠스테드', 'LTN': '루턴', 'LCY': '시티',
    'CDG': 'CDG', 'ORY': '오를리', 'BVA': '보베',
    'JFK': 'JFK', 'EWR': '뉴어크', 'LGA': '라과디아',
    'IAD': '덜레스', 'DCA': '레이건',
    'ORD': '오헤어', 'MDW': '미드웨이',
    'SVO': '셰레메티예보', 'DME': '도모데도보', 'VKO': '브누코보',
    'TPE': '타오위안', 'TSA': '쑹산',
    'BKK': '수완나품', 'DMK': '돈므앙',
    'KUL': 'KLIA', 'SZB': '술탄',
}

# ==================== 多语言城市名翻译 ====================
# 日语城市名
CITY_JA = {
    '北京': '北京', '上海': '上海', '广州': '広州', '深圳': '深圳',
    '成都': '成都', '重庆': '重慶', '杭州': '杭州', '武汉': '武漢',
    '南京': '南京', '西安': '西安', '昆明': '昆明', '厦门': '廈門',
    '东京': '東京', '大阪': '大阪', '名古屋': '名古屋', '札幌': '札幌',
    '福冈': '福岡', '那霸': '那覇', '仙台': '仙台', '广岛': '広島',
    '首尔': 'ソウル', '釜山': '釜山', '济州': '済州',
    '曼谷': 'バンコク', '新加坡': 'シンガポール', '吉隆坡': 'クアラルンプール',
    '河内': 'ハノイ', '胡志明市': 'ホーチミン', '马尼拉': 'マニラ',
    '雅加达': 'ジャカルタ', '金边': 'プノンペン',
    '迪拜': 'ドバイ', '多哈': 'ドーハ', '伊斯坦布尔': 'イスタンブール',
    '伦敦': 'ロンドン', '巴黎': 'パリ', '法兰克福': 'フランクフルト',
    '慕尼黑': 'ミュンヘン', '阿姆斯特丹': 'アムステルダム',
    '罗马': 'ローマ', '米兰': 'ミラノ', '马德里': 'マドリード',
    '巴塞罗那': 'バルセロナ', '里斯本': 'リスボン',
    '维也纳': 'ウィーン', '苏黎世': 'チューリッヒ', '日内瓦': 'ジュネーヴ',
    '布鲁塞尔': 'ブリュッセル', '哥本哈根': 'コペンハーゲン',
    '斯德哥尔摩': 'ストックホルム', '奥斯陆': 'オスロ',
    '赫尔辛基': 'ヘルシンキ', '都柏林': 'ダブリン',
    '柏林': 'ベルリン', '布拉格': 'プラハ', '华沙': 'ワルシャワ',
    '莫斯科': 'モスクワ', '雅典': 'アテネ',
    '纽约': 'ニューヨーク', '洛杉矶': 'ロサンゼルス', '芝加哥': 'シカゴ',
    '旧金山': 'サンフランシスコ', '华盛顿': 'ワシントン', '西雅图': 'シアトル',
    '波士顿': 'ボストン', '迈阿密': 'マイアミ', '多伦多': 'トロント',
    '温哥华': 'バンクーバー', '墨西哥城': 'メキシコシティ',
    '圣保罗': 'サンパウロ', '里约热内卢': 'リオデジャネイロ',
    '布宜诺斯艾利斯': 'ブエノスアイレス',
    '悉尼': 'シドニー', '墨尔本': 'メルボルン', '奥克兰': 'オークランド',
    '开罗': 'カイロ', '约翰内斯堡': 'ヨハネスブルグ', '内罗毕': 'ナイロビ',
    '新德里': 'ニューデリー', '孟买': 'ムンバイ', '香港': '香港', '台北': '台北',
    '澳门': 'マカオ', '檀香山': 'ホノルル', '亚特兰大': 'アトランタ',
    '达拉斯': 'ダラス', '休斯敦': 'ヒューストン', '丹佛': 'デンバー',
    '拉斯维加斯': 'ラスベガス',
}

# 韩语城市名
CITY_KO = {
    '北京': '베이징', '上海': '상하이', '广州': '광저우', '深圳': '선전',
    '成都': '청두', '重庆': '충칭', '杭州': '항저우', '武汉': '우한',
    '南京': '난징', '西安': '시안', '昆明': '쿤밍', '厦门': '샤먼',
    '东京': '도쿄', '大阪': '오사카', '名古屋': '나고야', '札幌': '삿포로',
    '福冈': '후쿠오카', '那霸': '나하', '仙台': '센다이', '广岛': '히로시마',
    '首尔': '서울', '釜山': '부산', '济州': '제주',
    '曼谷': '방콕', '新加坡': '싱가포르', '吉隆坡': '쿠알라룸푸르',
    '河内': '하노이', '胡志明市': '호찌민', '马尼拉': '마닐라',
    '雅加达': '자카르타', '金边': '프놈펜',
    '迪拜': '두바이', '多哈': '도하', '伊斯坦布尔': '이스탄불',
    '伦敦': '런던', '巴黎': '파리', '法兰克福': '프랑크푸르트',
    '慕尼黑': '뮌헨', '阿姆斯特丹': '암스테르담',
    '罗马': '로마', '米兰': '밀라노', '马德里': '마드리드',
    '巴塞罗那': '바르셀로나', '里斯本': '리스본',
    '维也纳': '빈', '苏黎世': '취리히', '日内瓦': '제네바',
    '布鲁塞尔': '브뤼셀', '哥本哈根': '코펜하겐',
    '斯德哥尔摩': '스톡홀름', '奥斯陆': '오슬로',
    '赫尔辛基': '헬싱키', '都柏林': '더블린',
    '柏林': '베를린', '布拉格': '프라하', '华沙': '바르샤바',
    '莫斯科': '모스크바', '雅典': '아테네',
    '纽约': '뉴욕', '洛杉矶': '로스앤젤레스', '芝加哥': '시카고',
    '旧金山': '샌프란시스코', '华盛顿': '워싱턴', '西雅图': '시애틀',
    '波士顿': '보스턴', '迈阿密': '마이애미', '多伦多': '토론토',
    '温哥华': '밴쿠버', '墨西哥城': '멕시코시티',
    '圣保罗': '상파울루', '里约热内卢': '리우데자네이루',
    '布宜诺斯艾利斯': '부에노스아이레스',
    '悉尼': '시드니', '墨尔本': '멜버른', '奥克兰': '오클랜드',
    '开罗': '카이로', '约翰内斯堡': '요하네스버그', '内罗毕': '나이로비',
    '新德里': '뉴델리', '孟买': '뭄바이', '香港': '홍콩', '台北': '타이베이',
    '澳门': '마카오', '檀香山': '호놀룰루', '亚特兰大': '애틀랜타',
    '达拉斯': '댈러스', '休斯敦': '휴스턴', '丹佛': '덴버',
    '拉斯维加斯': '라스베이거스',
}

# 西班牙语城市名
CITY_ES = {
    '北京': 'Pekín', '上海': 'Shanghái', '广州': 'Cantón', '深圳': 'Shenzhen',
    '成都': 'Chengdu', '重庆': 'Chongqing', '杭州': 'Hangzhou', '武汉': 'Wuhan',
    '南京': 'Nankín', '西安': "Xi'an", '昆明': 'Kunming', '厦门': 'Xiamen',
    '东京': 'Tokio', '大阪': 'Osaka', '名古屋': 'Nagoya', '札幌': 'Sapporo',
    '福冈': 'Fukuoka', '那霸': 'Naha', '仙台': 'Sendai', '广岛': 'Hiroshima',
    '首尔': 'Seúl', '釜山': 'Busan', '济州': 'Jeju',
    '曼谷': 'Bangkok', '新加坡': 'Singapur', '吉隆坡': 'Kuala Lumpur',
    '河内': 'Hanói', '胡志明市': 'Ho Chi Minh', '马尼拉': 'Manila',
    '雅加达': 'Yakarta', '金边': 'Nom Pen',
    '迪拜': 'Dubái', '多哈': 'Doha', '伊斯坦布尔': 'Estambul',
    '伦敦': 'Londres', '巴黎': 'París', '法兰克福': 'Fráncfort',
    '慕尼黑': 'Múnich', '阿姆斯特丹': 'Ámsterdam',
    '罗马': 'Roma', '米兰': 'Milán', '马德里': 'Madrid',
    '巴塞罗那': 'Barcelona', '里斯本': 'Lisboa',
    '维也纳': 'Viena', '苏黎世': 'Zúrich', '日内瓦': 'Ginebra',
    '布鲁塞尔': 'Bruselas', '哥本哈根': 'Copenhague',
    '斯德哥尔摩': 'Estocolmo', '奥斯陆': 'Oslo',
    '赫尔辛基': 'Helsinki', '都柏林': 'Dublín',
    '柏林': 'Berlín', '布拉格': 'Praga', '华沙': 'Varsovia',
    '莫斯科': 'Moscú', '雅典': 'Atenas',
    '纽约': 'Nueva York', '洛杉矶': 'Los Ángeles', '芝加哥': 'Chicago',
    '旧金山': 'San Francisco', '华盛顿': 'Washington', '西雅图': 'Seattle',
    '波士顿': 'Boston', '迈阿密': 'Miami', '多伦多': 'Toronto',
    '温哥华': 'Vancouver', '墨西哥城': 'Ciudad de México',
    '圣保罗': 'São Paulo', '里约热内卢': 'Río de Janeiro',
    '布宜诺斯艾利斯': 'Buenos Aires',
    '悉尼': 'Sídney', '墨尔本': 'Melbourne', '奥克兰': 'Auckland',
    '开罗': 'El Cairo', '约翰内斯堡': 'Johannesburgo', '内罗毕': 'Nairobi',
    '新德里': 'Nueva Delhi', '孟买': 'Bombay', '香港': 'Hong Kong', '台北': 'Taipéi',
    '澳门': 'Macao', '檀香山': 'Honolulu', '亚特兰大': 'Atlanta',
    '达拉斯': 'Dallas', '休斯敦': 'Houston', '丹佛': 'Denver',
    '拉斯维加斯': 'Las Vegas',
}


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    # ---------- 1. 加载国家数据 ----------
    countries = {}
    with open(COUNTRIES_CSV, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            countries[row['code']] = row['name']

    # ---------- 2. 加载区域数据 ----------
    regions = {}
    with open(REGIONS_CSV, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            regions[row['code']] = row['name']

    # ---------- 3. 多机场城市: IATA → 正确的英文城市名 ----------
    # 有些机场的 municipality 是行政区名(如 Narita)而不是通常意义的城市名(Tokyo)
    CITY_EN_OVERRIDE = {
        # 东京
        'NRT': 'Tokyo', 'HND': 'Tokyo',
        # 大阪
        'KIX': 'Osaka', 'ITM': 'Osaka',
        # 首尔
        'ICN': 'Seoul', 'GMP': 'Seoul',
        # 伦敦
        'LHR': 'London', 'LGW': 'London', 'STN': 'London', 'LTN': 'London', 'LCY': 'London',
        # 巴黎
        'CDG': 'Paris', 'ORY': 'Paris', 'BVA': 'Paris',
        # 纽约
        'JFK': 'New York', 'EWR': 'New York', 'LGA': 'New York',
        # 华盛顿
        'IAD': 'Washington', 'DCA': 'Washington',
        # 芝加哥
        'ORD': 'Chicago', 'MDW': 'Chicago',
        # 莫斯科
        'SVO': 'Moscow', 'DME': 'Moscow', 'VKO': 'Moscow',
        # 上海
        'PVG': 'Shanghai', 'SHA': 'Shanghai',
        # 北京
        'PEK': 'Beijing', 'PKX': 'Beijing',
        # 成都
        'CTU': 'Chengdu', 'TFU': 'Chengdu',
        # 广州
        'CAN': 'Guangzhou',
        # 台北
        'TPE': 'Taipei', 'TSA': 'Taipei',
        # 圣保罗
        'GRU': 'São Paulo', 'CGH': 'São Paulo',
        # 布宜诺斯艾利斯
        'EZE': 'Buenos Aires', 'AEP': 'Buenos Aires',
        # 里约
        'GIG': 'Rio de Janeiro', 'SDU': 'Rio de Janeiro',
        # 米兰
        'MXP': 'Milan', 'LIN': 'Milan',
        # 罗马
        'FCO': 'Rome', 'CIA': 'Rome',
        # 斯德哥尔摩
        'ARN': 'Stockholm', 'BMA': 'Stockholm',
        # 曼谷
        'BKK': 'Bangkok', 'DMK': 'Bangkok',
        # 新加坡
        'SIN': 'Singapore',
        # 吉隆坡
        'KUL': 'Kuala Lumpur', 'SZB': 'Kuala Lumpur',
        # 札幌
        'CTS': 'Sapporo',
    }

    # ---------- 4. 加载并过滤机场数据 ----------
    airports = {}
    skipped = 0
    with open(AIRPORTS_CSV, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            iata = (row.get('iata_code') or '').strip()
            atype = row.get('type', '')
            scheduled = row.get('scheduled_service', '')

            # 只保留有 IATA 代码且有定期航班的中大型机场
            if not iata or len(iata) != 3:
                continue
            if atype not in ('large_airport', 'medium_airport'):
                skipped += 1
                continue
            if scheduled != 'yes':
                skipped += 1
                continue

            name_en = row.get('name', '').strip()
            municipality = (row.get('municipality') or '').strip()
            iso_country = (row.get('iso_country') or '').strip()
            lat = row.get('latitude_deg', '')
            lon = row.get('longitude_deg', '')

            try:
                lat = round(float(lat), 6)
                lon = round(float(lon), 6)
            except (ValueError, TypeError):
                continue

            country_en = countries.get(iso_country, iso_country)
            country_zh = COUNTRY_ZH.get(iso_country, country_en)

            # ---- 智能城市名提取 ----
            # CSV 中 municipality 可能带括号后缀, 如:
            #   "Shanghai (Minhang)", "Chengdu (Shuangliu)", "Paris (Roissy-en-France, Val-d'Oise)"
            # 需要提取括号前的基础城市名, 同时括号内的区名也可以查字典
            raw_municipality = municipality
            base_city = municipality
            district = ''
            if municipality and '(' in municipality:
                base_city = municipality[:municipality.index('(')].strip()
                district = municipality[municipality.index('(')+1:].rstrip(')').split(',')[0].strip()

            # city_en: 优先使用多机场城市覆盖表, 否则使用基础城市名
            city_en_base = CITY_EN_OVERRIDE.get(iata, base_city) or country_en
            # 如果有多机场标识符, 加括号
            tag_en = AIRPORT_TAG.get(iata, '')
            city_en = f"{city_en_base} ({tag_en})" if tag_en else city_en_base

            # city_zh: 多级查找
            city_zh = ''
            if municipality or iata in CITY_EN_OVERRIDE:
                # 0. 先试 CITY_EN_OVERRIDE 对应的英文名
                override_en = CITY_EN_OVERRIDE.get(iata, '')
                if override_en:
                    city_zh = CITY_ZH.get(override_en, '')
                # 1. 再试精确匹配原始值
                if not city_zh:
                    city_zh = CITY_ZH.get(raw_municipality, '')
                # 2. 再试基础城市名
                if not city_zh:
                    city_zh = CITY_ZH.get(base_city, '')
                # 3. 再试括号内的区名(如 Narita, Orly 等)
                if not city_zh and district:
                    city_zh = CITY_ZH.get(district, '')
                # 4. fallback 到基础城市名(英文)
                if not city_zh:
                    city_zh = base_city or country_zh
            else:
                city_zh = country_zh

            # city_zh 也追加多机场中文标识符
            tag_zh = AIRPORT_TAG_ZH.get(iata, '')
            city_zh_display = f"{city_zh}({tag_zh})" if tag_zh else city_zh

            # 多语言城市名: ja / ko / es
            city_ja = CITY_JA.get(city_zh, '')
            tag_ja = AIRPORT_TAG_JA.get(iata, '')
            city_ja_display = f"{city_ja}({tag_ja})" if city_ja and tag_ja else city_ja

            city_ko = CITY_KO.get(city_zh, '')
            tag_ko = AIRPORT_TAG_KO.get(iata, '')
            city_ko_display = f"{city_ko}({tag_ko})" if city_ko and tag_ko else city_ko

            city_es = CITY_ES.get(city_zh, '')
            # 西语标识符直接用英文标识
            city_es_display = f"{city_es} ({tag_en})" if city_es and tag_en else city_es

            # 尝试获取中文机场名
            name_zh = AIRPORT_NAME_ZH.get(iata, '')
            if not name_zh:
                # 尝试自动构造: "[城市]机场"
                if city_zh and city_zh != base_city:
                    name_zh = f"{city_zh}机场"
                else:
                    name_zh = name_en  # fallback 到英文

            airports[iata] = {
                'name': name_zh,
                'name_en': name_en,
                'city': city_zh_display,
                'city_en': city_en,
                'city_ja': city_ja_display,
                'city_ko': city_ko_display,
                'city_es': city_es_display,
                'country': country_zh,
                'country_en': country_en,
                'iso_country': iso_country,
                'lat': lat,
                'lon': lon,
            }

    # ---------- 4. 保存 ----------
    # 添加元信息
    airports['_meta'] = {
        'source': 'OurAirports (https://ourairports.com/data/)',
        'total': len([k for k in airports if not k.startswith('_')]),
        'updated': __import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M'),
        'filter': 'large_airport + medium_airport with scheduled_service=yes and IATA code',
    }

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(airports, f, ensure_ascii=False, indent=2)

    total = len([k for k in airports if not k.startswith('_')])
    print(f"✅ 机场数据库已更新: {total} 个机场 (跳过 {skipped} 条)")
    print(f"   输出文件: {OUTPUT_FILE}")

    # 统计翻译覆盖率
    has_zh_name = sum(1 for k, v in airports.items()
                      if not k.startswith('_') and v.get('name', '') != v.get('name_en', ''))
    has_zh_city = sum(1 for k, v in airports.items()
                      if not k.startswith('_') and v.get('city', '') != v.get('city_en', ''))
    print(f"   中文机场名覆盖: {has_zh_name}/{total}")
    print(f"   中文城市名覆盖: {has_zh_city}/{total}")


if __name__ == '__main__':
    main()
