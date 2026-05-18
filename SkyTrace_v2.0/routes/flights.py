"""
SkyTrace v2.0 — 航班路由 (/api/flights/*)
"""
from flask import Blueprint, request, jsonify, g
from services.flight_service import FlightService
from schemas.flight import FlightInput, FlightConnectInput, FlightDisconnectInput
from routes._decorators import login_required

flights_bp = Blueprint('flights', __name__)


@flights_bp.route('/api/flights', methods=['GET'])
@login_required
def list_flights():
    if not g.get('current_user'):
        return jsonify([])
    flights = FlightService.list_for_user(g.current_user['id'])
    return jsonify(flights)


@flights_bp.route('/api/flights', methods=['POST'])
@login_required
def add_flight():
    data = FlightInput(**request.json).model_dump()
    flight = FlightService.add_for_user(g.current_user['id'], data)
    return jsonify(flight)


@flights_bp.route('/api/flights/<flight_id>', methods=['PUT'])
@login_required
def update_flight(flight_id):
    data = FlightInput(**request.json).model_dump()
    flight = FlightService.update_for_user(g.current_user['id'], flight_id, data)
    if not flight:
        return jsonify({'success': False, 'error': 'Flight not found.'}), 404
    return jsonify(flight)


@flights_bp.route('/api/flights/<flight_id>', methods=['DELETE'])
@login_required
def delete_flight(flight_id):
    ok = FlightService.delete_for_user(g.current_user['id'], flight_id)
    return jsonify({'success': ok})


@flights_bp.route('/api/flights/connect', methods=['POST'])
@login_required
def connect_flights():
    data = FlightConnectInput(**request.json)
    group_id = FlightService.connect(g.current_user['id'], data.flight_ids)
    return jsonify({'success': bool(group_id), 'connected_group': group_id})


@flights_bp.route('/api/flights/disconnect', methods=['POST'])
@login_required
def disconnect_flights():
    data = FlightDisconnectInput(**request.json)
    ok = FlightService.disconnect(
        g.current_user['id'],
        flight_ids=data.flight_ids if data.flight_ids else None,
        group_id=data.group_id
    )
    return jsonify({'success': ok})
