"""
SkyTrace v2.0 — 统计路由 (/api/stats)
"""
from flask import Blueprint, request, jsonify, g
from services.stats_service import StatsService
from routes._decorators import login_required

stats_bp = Blueprint('stats', __name__)


@stats_bp.route('/api/stats', methods=['GET'])
@login_required
def get_stats():
    if not g.get('current_user'):
        return jsonify({})
    year = request.args.get('year', '')
    stats = StatsService.calculate(g.current_user['id'], year)
    return jsonify(stats)
