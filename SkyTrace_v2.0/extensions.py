"""
SkyTrace v2.0 — Flask 扩展初始化 (延迟 init_app 模式)
"""
import os
import logging
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def init_extensions(app):
    """延迟初始化所有 Flask 扩展，避免循环导入"""
    db.init_app(app)

    # 确保数据目录存在 (使用绝对路径)
    import os as _os
    data_dir = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), app.config.get('DATA_DIR', 'data'))
    _os.makedirs(data_dir, exist_ok=True)

    # 确保 SQLite URI 有正确的路径
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', '')
    if uri.startswith('sqlite:///') and not uri.startswith('sqlite:////'):
        # 相对路径 → 绝对路径
        db_path = uri.replace('sqlite:///', '')
        if not db_path.startswith('/'):
            db_path = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), db_path)
            app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + db_path

    # 延迟建表
    with app.app_context():
        from models.base import Base
        try:
            Base.metadata.create_all(db.engine)
        except Exception as e:
            import logging
            logging.warning(f"Database init deferred: {e}")
