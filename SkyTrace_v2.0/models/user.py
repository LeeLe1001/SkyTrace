"""
SkyTrace v2.0 — User ORM Model
"""
from datetime import datetime

from extensions import db
from models.base import Base


class User(Base):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(64), unique=True, index=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    display_name = db.Column(db.String(120), default='')
    is_admin = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    settings = db.relationship(
        'UserSetting', back_populates='user',
        cascade='all, delete-orphan', uselist=False
    )
    flights = db.relationship(
        'Flight', back_populates='user',
        cascade='all, delete-orphan'
    )
