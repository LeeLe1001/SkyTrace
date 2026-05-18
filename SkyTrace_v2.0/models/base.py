"""
SkyTrace v2.0 — SQLAlchemy Declarative Base
"""
from extensions import db


class Base(db.Model):
    __abstract__ = True
