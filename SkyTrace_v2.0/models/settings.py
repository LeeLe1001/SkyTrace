"""
SkyTrace v2.0 — UserSetting ORM Model
"""
from datetime import datetime

from extensions import db
from models.base import Base


class UserSetting(Base):
    __tablename__ = 'user_settings'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), unique=True, index=True, nullable=False)
    aviationstack_key = db.Column(db.Text, default='')
    airlabs_key = db.Column(db.Text, default='')
    aerodata_key = db.Column(db.Text, default='')
    github_backup_token = db.Column(db.Text, default='')
    github_backup_repo = db.Column(db.String(255), default='LeeLe1001/SkyTrace')
    preferred_api = db.Column(db.String(32), default='auto')
    auto_cache = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', back_populates='settings')
