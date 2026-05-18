"""
SkyTrace v2.0 — Flight ORM Model
"""
from datetime import datetime

from extensions import db
from models.base import Base


class Flight(Base):
    __tablename__ = 'flights'

    id = db.Column(db.String(36), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), index=True, nullable=False)
    flight_no = db.Column(db.String(32), default='')
    airline = db.Column(db.String(255), default='')
    departure = db.Column(db.String(16), default='')
    arrival = db.Column(db.String(16), default='')
    date = db.Column(db.String(16), default='')
    dep_time = db.Column(db.String(16), default='')
    arr_time = db.Column(db.String(16), default='')
    dep_terminal = db.Column(db.String(32), default='')
    arr_terminal = db.Column(db.String(32), default='')
    dep_gate = db.Column(db.String(32), default='')
    arr_gate = db.Column(db.String(32), default='')
    aircraft = db.Column(db.String(120), default='')
    seat = db.Column(db.String(32), default='')
    cabin_class = db.Column(db.String(32), default='economy')
    notes = db.Column(db.Text, default='')
    stopover = db.Column(db.String(16), default='')
    arr_day_offset = db.Column(db.Integer, default=0)
    status = db.Column(db.String(32), default='scheduled')
    connected_group = db.Column(db.String(64), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', back_populates='flights')
