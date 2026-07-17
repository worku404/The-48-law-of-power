import os
import sqlite3
from flask import g, current_app

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    HAS_POSTGRES = True
except ImportError:
    HAS_POSTGRES = False

class DummyCursor:
    def execute(self, query, params=None):
        return self
    def fetchone(self):
        return None
    def fetchall(self):
        return []
    def close(self):
        pass

class DatabaseService:
    def __init__(self, db_path=None, database_url=None):
        self._db_path = db_path
        self._database_url = database_url
        self._is_available = None

    def check_availability(self):
        if self._is_available is not None:
            return self._is_available
        
        try:
            if self.is_postgres():
                if not HAS_POSTGRES:
                    self._is_available = False
                    return False
                conn = psycopg2.connect(self.database_url)
            else:
                db_path = self.db_path
                if not db_path:
                    self._is_available = False
                    return False
                db_dir = os.path.dirname(db_path)
                if db_dir:
                    os.makedirs(db_dir, exist_ok=True)
                conn = sqlite3.connect(db_path)
                conn.row_factory = sqlite3.Row
            
            # Run schema initialization to verify it is fully functional
            self._init_db(conn)
            conn.close()
            self._is_available = True
        except Exception as e:
            print(f"Database availability check failed: {e}")
            self._is_available = False
            
        return self._is_available


    @property
    def database_url(self):
        if self._database_url is None:
            self._database_url = os.environ.get('DATABASE_URL') or current_app.config.get('DATABASE_URL')
        return self._database_url

    @property
    def db_path(self):
        if self._db_path is None:
            self._db_path = current_app.config.get('DATABASE_PATH')
        return self._db_path

    def is_postgres(self):
        return bool(self.database_url)

    def get_connection(self):
        if 'db' not in g:
            if self.is_postgres():
                if not HAS_POSTGRES:
                    raise ImportError("psycopg2 is required for PostgreSQL. Please install psycopg2-binary.")
                g.db = psycopg2.connect(self.database_url)
            else:
                db_dir = os.path.dirname(self.db_path)
                os.makedirs(db_dir, exist_ok=True)
                g.db = sqlite3.connect(self.db_path)
                g.db.row_factory = sqlite3.Row
            
            # Initialize tables on first request connection
            self._init_db(g.db)
            
        return g.db

    def _init_db(self, conn):
        cursor = conn.cursor()
        
        # Check database engine type to generate matching schema
        if self.is_postgres():
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS section_likes (
                    section_id INTEGER PRIMARY KEY,
                    like_count INTEGER NOT NULL DEFAULT 0
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS visitor_likes (
                    visitor_cookie VARCHAR(255) NOT NULL,
                    section_id INTEGER NOT NULL,
                    PRIMARY KEY (visitor_cookie, section_id)
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    password VARCHAR(255) NOT NULL
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_progress (
                    username VARCHAR(255) NOT NULL,
                    law_id INTEGER NOT NULL,
                    completed INTEGER DEFAULT 1,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (username, law_id),
                    FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
                )
            """)
        else:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS section_likes (
                    section_id INTEGER PRIMARY KEY,
                    like_count INTEGER NOT NULL DEFAULT 0
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS visitor_likes (
                    visitor_cookie TEXT NOT NULL,
                    section_id INTEGER NOT NULL,
                    PRIMARY KEY (visitor_cookie, section_id)
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_progress (
                    username TEXT NOT NULL,
                    law_id INTEGER NOT NULL,
                    completed INTEGER DEFAULT 1,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (username, law_id),
                    FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
                )
            """)
        conn.commit()
        cursor.close()

    def get_cursor(self, conn):
        if self.is_postgres():
            return conn.cursor(cursor_factory=RealDictCursor)
        return conn.cursor()

    def execute(self, query, params=None):
        if not self.check_availability():
            return DummyCursor()
            
        conn = self.get_connection()
        cursor = self.get_cursor(conn)
        
        # PostgreSQL parameter translation
        if self.is_postgres():
            query = query.replace('?', '%s')
            
        cursor.execute(query, params or ())
        return cursor

    def commit(self):
        if 'db' in g:
            g.db.commit()

    def rollback(self):
        if 'db' in g:
            g.db.rollback()

    @staticmethod
    def close_db(e=None):
        db = g.pop('db', None)
        if db is not None:
            db.close()
