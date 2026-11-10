import os
import uuid
from flask import Flask, request, g
from app.services.content import ContentService
from app.services.likes import LikesService
from app.services.tts import TTSService
from app.services.user import UserService
from app.services.db import DatabaseService

def create_app(test_config=None):
    # Initialize the Flask application
    app = Flask(__name__, instance_relative_config=True)

    database_url = os.environ.get('NEON_DB') or os.environ.get('DATABASE_URL')

    secret_key = os.environ.get('SECRET_KEY')
    session_cookie_secure = os.environ.get('SESSION_COOKIE_SECURE', '').lower() == 'true'

    is_vercel = bool(os.environ.get('VERCEL'))
    default_db_dir = '/tmp' if is_vercel else app.instance_path
    default_db_path = os.path.join(default_db_dir, 'likes.sqlite3')
    default_cache_dir = os.path.join(app.instance_path, 'audio_cache')
    default_cache_dir_en = os.path.join(app.instance_path, 'audio_cache_en')
    
    # Configure default settings
    app.config.from_mapping(
        DATABASE_PATH=default_db_path,
        AUDIO_CACHE_DIR=default_cache_dir,
        AUDIO_CACHE_DIR_EN=default_cache_dir_en,
        CONTENT_JSON_PATH=os.path.join(app.root_path, '..', 'data', 'sections.json'),
        CONTENT_EN_JSON_PATH=os.path.join(app.root_path, '..', 'data', 'sections_en.json'),
        SECRET_KEY=secret_key or 'dev-key-placeholder-for-session-fallback',
        DATABASE_URL=database_url,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Lax',
        SESSION_COOKIE_SECURE=session_cookie_secure
    )

    if test_config:
        app.config.from_mapping(test_config)

    # Ensure cache folders exist
    try:
        os.makedirs(app.config['AUDIO_CACHE_DIR'], exist_ok=True)
        os.makedirs(app.config['AUDIO_CACHE_DIR_EN'], exist_ok=True)
    except OSError:
        pass

    # Initialize Services and attach to app context or app config
    db_service = DatabaseService(
        db_path=app.config['DATABASE_PATH'],
        database_url=app.config.get('DATABASE_URL')
    )
    content_service = ContentService(
        data_path=app.config['CONTENT_JSON_PATH'],
        data_path_en=app.config.get('CONTENT_EN_JSON_PATH')
    )
    likes_service = LikesService(db_service=db_service)
    tts_service = TTSService(cache_dir=app.config['AUDIO_CACHE_DIR'])
    user_service = UserService(db_service=db_service)
    
    # Store services on the app object for easy retrieval in blueprints/routes
    app.db_service = db_service
    app.content_service = content_service
    app.likes_service = likes_service
    app.tts_service = tts_service
    app.user_service = user_service

    # Register context teardown for database connections
    app.teardown_appcontext(DatabaseService.close_db)

    # Before request hook to ensure every visitor has a tracking cookie
    @app.before_request
    def ensure_visitor_id():
        if 'visitor_id' not in request.cookies:
            # Generate a new unique tracking identifier
            g.visitor_id = str(uuid.uuid4())
            g.visitor_id_new = True
        else:
            g.visitor_id = request.cookies.get('visitor_id')
            g.visitor_id_new = False

    # After request hook to set the cookie in the browser
    @app.after_request
    def set_visitor_cookie(response):
        if getattr(g, 'visitor_id_new', False):
            # Set cookie for 1 year, secure/httponly for standard tracking
            response.set_cookie(
                'visitor_id',
                g.visitor_id,
                max_age=365 * 24 * 60 * 60,  # 1 year in seconds
                httponly=True,
                samesite='Lax'
            )
        return response

    # Register blueprints and routes
    from app.routes import bp as main_bp
    app.register_blueprint(main_bp)

    return app
