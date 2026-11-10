from flask import Blueprint, render_template, current_app, request, jsonify, g, send_file, session
import os
import hashlib

bp = Blueprint('main', __name__)

@bp.route('/')
def index():
    # Load all sections in both Amharic and English for bilingual sidebar rendering
    sections_am = current_app.content_service.get_all_sections('am')
    sections_en = current_app.content_service.get_all_sections('en')
    en_by_id = {s['id']: s for s in sections_en}

    sections = []
    for sec_am in sections_am:
        sec_id = sec_am['id']
        sec_en = en_by_id.get(sec_id, {})
        sections.append({
            'id': sec_id,
            'label': sec_am.get('label', f'Law {sec_id}'),
            'label_en': sec_en.get('label', f'Law {sec_id}'),
            'title': sec_am.get('title', ''),
            'title_en': sec_en.get('title', ''),
            'body': sec_am.get('body', '')
        })
    
    # Identify requested law, default to Law 1
    law_id_str = request.args.get('law', '1')
    try:
        law_id = int(law_id_str)
    except ValueError:
        law_id = 1

    # Fetch active section
    active_section = current_app.content_service.get_section(law_id)
    if not active_section:
        active_section = current_app.content_service.get_section(1)
        law_id = 1

    db_available = current_app.db_service.check_availability()

    # Check user login and progress
    username = session.get('username') if db_available else None
    completed_laws = []
    if username and db_available:
        completed_laws = current_app.user_service.get_progress(username)

    # Fetch likes metadata for active section
    if db_available and username:
        likes_count = current_app.likes_service.get_likes(law_id)
        has_liked = current_app.likes_service.has_liked(username, law_id)
    elif db_available:
        likes_count = current_app.likes_service.get_likes(law_id)
        has_liked = False
    else:
        likes_count = 0
        has_liked = False

    return render_template(
        'index.html',
        sections=sections,
        active_section=active_section,
        likes_count=likes_count,
        has_liked=has_liked,
        username=username,
        completed_laws=completed_laws,
        db_available=db_available
    )

@bp.route('/api/sections/<int:section_id>')
def get_section_api(section_id):
    lang = request.args.get('lang', 'am')
    section = current_app.content_service.get_section(section_id, lang=lang)
    if not section:
        return jsonify({'error': 'Section not found'}), 404

    # Fetch likes metrics
    db_available = current_app.db_service.check_availability()
    username = session.get('username') if db_available else None
    if db_available and username:
        likes_count = current_app.likes_service.get_likes(section_id)
        has_liked = current_app.likes_service.has_liked(username, section_id)
    elif db_available:
        likes_count = current_app.likes_service.get_likes(section_id)
        has_liked = False
    else:
        likes_count = 0
        has_liked = False

    # Calculate or estimate audio duration (in seconds)
    body_text = section.get('body', '').strip()
    duration = 0
    if body_text:
        text_utf8 = body_text.encode('utf-8')
        text_hash = hashlib.sha256(text_utf8).hexdigest()
        # Choose the correct cache directory based on language
        if lang == 'en':
            cache_dir = current_app.config['AUDIO_CACHE_DIR_EN']
        else:
            cache_dir = current_app.config['AUDIO_CACHE_DIR']
        cache_file_path = os.path.join(cache_dir, f"{text_hash}.mp3")
        if os.path.exists(cache_file_path):
            try:
                # Estimate duration: 64 kbps = 8 kB/s (English), 48 kbps = 6 kB/s (Amharic)
                file_size = os.path.getsize(cache_file_path)
                bytes_per_sec = 8000.0 if lang == 'en' else 6000.0
                duration = file_size / bytes_per_sec
            except Exception:
                pass
        if not duration:
            # Fallback estimation: average reading speed 2.0 words per second
            words_count = len(body_text.split())
            duration = max(10, words_count / 2.0)

    # Return section info along with likes data and audio duration
    return jsonify({
        'id': section['id'],
        'label': section['label'],
        'title': section['title'],
        'body': section['body'],
        'language': section.get('language', lang),
        'likes': likes_count,
        'liked': has_liked,
        'audio_duration': duration
    })

@bp.route('/api/sections/<int:section_id>/like', methods=['POST'])
def like_section_api(section_id):
    if not current_app.db_service.check_availability():
        return jsonify({'error': 'የውሂብ ጎታው መስመር ላይ አይደለም። (Database is offline. Liking is temporarily unavailable.)'}), 503

    section = current_app.content_service.get_section(section_id)
    if not section:
        return jsonify({'error': 'Section not found'}), 404

    username = session.get('username')
    if not username:
        return jsonify({
            'error': 'ሕጉን ለመውደድ እባክዎ ይግቡ (Please log in to like this law.)',
            'auth_required': True
        }), 401

    likes_count, is_liked = current_app.likes_service.toggle_like(username, section_id)
    
    return jsonify({
        'likes': likes_count,
        'liked': is_liked
    })

@bp.route('/api/sections/<int:section_id>/audio')
def get_section_audio_api(section_id):
    lang = request.args.get('lang', 'am')
    section = current_app.content_service.get_section(section_id, lang=lang)
    if not section:
        return jsonify({'error': 'Section not found'}), 404

    body_text = section.get('body', '').strip()
    if not body_text:
        return jsonify({'error': 'Cannot play audio for empty content'}), 400

    audio_path = current_app.tts_service.get_audio_path(body_text, lang=lang)
    if audio_path and os.path.exists(audio_path):
        mimetype = 'audio/mpeg' if audio_path.endswith('.mp3') else 'audio/wav'
        return send_file(audio_path, mimetype=mimetype, as_attachment=False)

    error_msg = (
        'English audio for this law has not been generated yet.'
        if lang == 'en'
        else 'የዚህ ሕግ ድምጽ ገና አልተዘጋጀም። በቅርቡ ይደርሳል! (Audio for this law has not been generated yet.)'
    )
    return jsonify({
        'error': error_msg,
        'details': 'AUDIO_NOT_READY'
    }), 503

# --- Authentication APIs ---

@bp.route('/api/auth/register', methods=['POST'])
def register():
    if not current_app.db_service.check_availability():
        return jsonify({'error': 'የውሂብ ጎታው መስመር ላይ አይደለም። (Database is offline. Registration is temporarily unavailable.)'}), 503
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not username or not password:
        return jsonify({'error': 'Username and password are required.'}), 400

    if current_app.user_service.user_exists(username):
        return jsonify({'error': 'ይህ ተጠቃሚ ቀድሞ ተመዝግቧል። እባክዎ ይግቡ። (Username already exists. Please log in.)'}), 400

    success = current_app.user_service.create_user(username, password)
    if success:
        session['username'] = username
        return jsonify({'message': 'Registration successful.', 'username': username}), 200
    else:
        return jsonify({'error': 'Failed to create user.'}), 500

@bp.route('/api/auth/login', methods=['POST'])
def login():
    if not current_app.db_service.check_availability():
        return jsonify({'error': 'የውሂብ ጎታው መስመር ላይ አይደለም። (Database is offline. Login is temporarily unavailable.)'}), 503
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not username or not password:
        return jsonify({'error': 'Username and password are required.'}), 400

    if not current_app.user_service.user_exists(username):
        return jsonify({'error': 'ይህ ተጠቃሚ አልተመዘገበም። እባክዎ አዲስ አካውንት ይፍጠሩ። (Username does not exist. Please register.)'}), 404

    if current_app.user_service.verify_user(username, password):
        session['username'] = username
        return jsonify({'message': 'Login successful.', 'username': username}), 200
    else:
        return jsonify({'error': 'የይለፍ ቃል የተሳሳተ ነው። (Incorrect password.)'}), 401

@bp.route('/api/auth/logout', methods=['POST'])
def logout():
    session.pop('username', None)
    return jsonify({'message': 'Logged out successfully.'}), 200

# --- Progress Tracking APIs ---

@bp.route('/api/progress')
def get_progress():
    if not current_app.db_service.check_availability():
        return jsonify({'error': 'Database offline'}), 503
    username = session.get('username')
    if not username:
        return jsonify({'error': 'Unauthorized'}), 401
    completed_laws = current_app.user_service.get_progress(username)
    return jsonify({'completed_laws': completed_laws})

@bp.route('/api/progress/complete', methods=['POST'])
def complete_law():
    if not current_app.db_service.check_availability():
        return jsonify({'error': 'Database offline'}), 503
    username = session.get('username')
    if not username:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json() or {}
    try:
        law_id = int(data.get('law_id'))
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid law_id'}), 400

    success = current_app.user_service.save_progress(username, law_id, completed=True)
    if success:
        return jsonify({'message': 'Progress saved successfully.', 'completed_laws': current_app.user_service.get_progress(username)}), 200
    else:
        return jsonify({'error': 'Failed to save progress.'}), 500
