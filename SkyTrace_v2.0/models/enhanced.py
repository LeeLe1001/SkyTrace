"""
SkyTrace v2.0 Sprint 3 — 增强数据模型 (关联表)
"""
from datetime import datetime
from extensions import db
from models.base import Base


class Airline(Base):
    """航空公司独立表"""
    __tablename__ = 'airlines'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    iata = db.Column(db.String(4), unique=True, index=True)           # CA, MU, CZ
    icao = db.Column(db.String(4), unique=True)                       # CCA, CES, CSN
    name = db.Column(db.String(255))
    name_cn = db.Column(db.String(255))                                # 中文名
    country = db.Column(db.String(120))
    alliance = db.Column(db.String(32))                                # star/skyteam/oneworld
    logo_url = db.Column(db.Text, default='')
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    flights = db.relationship('Flight', backref='airline_rel', lazy='dynamic')


class AircraftType(Base):
    """机型独立表"""
    __tablename__ = 'aircraft_types'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    icao_code = db.Column(db.String(8), unique=True, index=True)      # B738, A359, B77W
    manufacturer = db.Column(db.String(120))                           # Boeing, Airbus
    model_name = db.Column(db.String(120))                             # 737-800, A350-900
    category = db.Column(db.String(32))                                # narrow_body/wide_body/regional
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    flights = db.relationship('Flight', backref='aircraft_type_rel', lazy='dynamic')


class Airport(Base):
    """机场独立表 (替代静态 JSON)"""
    __tablename__ = 'airports'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    iata = db.Column(db.String(4), unique=True, index=True)
    icao = db.Column(db.String(4), unique=True)
    name = db.Column(db.String(255))
    name_cn = db.Column(db.String(255))
    city = db.Column(db.String(120))
    city_cn = db.Column(db.String(120))
    country = db.Column(db.String(120))
    country_cn = db.Column(db.String(120))
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    timezone = db.Column(db.String(64))
    altitude_ft = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # 作为出发/到达的航班
    dep_flights = db.relationship('Flight', foreign_keys='Flight.departure_airport_id',
                                  backref='dep_airport', lazy='dynamic')
    arr_flights = db.relationship('Flight', foreign_keys='Flight.arrival_airport_id',
                                  backref='arr_airport', lazy='dynamic')
    stopover_flights = db.relationship('Flight', foreign_keys='Flight.stopover_airport_id',
                                       backref='stopover_airport', lazy='dynamic')
    terminals = db.relationship('Terminal', backref='airport', lazy='dynamic')


class Terminal(Base):
    """航站楼独立表"""
    __tablename__ = 'terminals'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    airport_id = db.Column(db.Integer, db.ForeignKey('airports.id'), index=True)
    terminal_code = db.Column(db.String(32))                           # T1, T2, MAIN
    name = db.Column(db.String(120))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class FlightEvent(Base):
    """航班状态变更事件链"""
    __tablename__ = 'flight_events'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    flight_id = db.Column(db.String(36), db.ForeignKey('flights.id'), index=True)
    event_type = db.Column(db.String(32))                              # delay/cancel/gate_change/divert/equipment_change
    old_value = db.Column(db.Text, default='')
    new_value = db.Column(db.Text, default='')
    source = db.Column(db.String(32), default='manual')                # AviationStack/AirLabs/manual
    recorded_at = db.Column(db.DateTime, default=datetime.utcnow)


class WeatherRecord(Base):
    """天气快照"""
    __tablename__ = 'weather_records'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    flight_id = db.Column(db.String(36), db.ForeignKey('flights.id'), index=True)
    airport_id = db.Column(db.Integer, db.ForeignKey('airports.id'))
    condition = db.Column(db.String(32))                               # clear/cloudy/rain/snow
    temperature_c = db.Column(db.Float)
    wind_speed_kmh = db.Column(db.Float)
    visibility_km = db.Column(db.Float)
    recorded_at = db.Column(db.DateTime, default=datetime.utcnow)
