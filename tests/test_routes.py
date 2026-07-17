import pytest
import json

def test_home_page_renders_with_visitor_cookie(client):
    response = client.get('/')
    assert response.status_code == 200
    # Checks if cookie header was sent
    cookie_header = response.headers.get('Set-Cookie')
    assert cookie_header is not None
    assert 'visitor_id=' in cookie_header
    
    # Verify default Law 1 is rendered
    html = response.data.decode('utf-8')
    assert 'Law 1' in html
    assert 'የሙከራ ርዕስ 1' in html

def test_deep_linking_law_parameter(client):
    # Retrieve law=2 deep link
    response = client.get('/?law=2')
    assert response.status_code == 200
    html = response.data.decode('utf-8')
    assert 'Law 2' in html
    assert 'የሙከራ ርዕስ 2' in html

def test_invalid_law_parameter_fallbacks(client):
    # Invalid string parameter defaults to Law 1
    response = client.get('/?law=invalid')
    assert response.status_code == 200
    html = response.data.decode('utf-8')
    assert 'Law 1' in html

    # Out of bounds parameter defaults to Law 1
    response = client.get('/?law=100')
    assert response.status_code == 200
    html = response.data.decode('utf-8')
    assert 'Law 1' in html

def test_get_section_json_api(client):
    response = client.get('/api/sections/1')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['id'] == 1
    assert data['label'] == 'Law 1'
    assert data['title'] == 'የሙከራ ርዕስ 1'
    assert 'የሙከራ ይዘት እዚህ ይገኛል' in data['body']
    assert data['likes'] == 0
    assert data['liked'] is False

def test_get_nonexistent_section_api(client):
    response = client.get('/api/sections/99')
    assert response.status_code == 404

def test_like_section_api(client):
    # Get a visitor cookie session
    client.get('/')
    
    # Call like API
    response = client.post('/api/sections/1/like')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['likes'] == 1
    assert data['liked'] is True

    # Check updated GET API values
    get_response = client.get('/api/sections/1')
    get_data = json.loads(get_response.data)
    assert get_data['likes'] == 1
    assert get_data['liked'] is True

def test_audio_duration_calculation(client):
    response = client.get('/api/sections/1')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert 'audio_duration' in data
    assert data['audio_duration'] > 0

def test_user_registration_and_login_flow(client):
    # Register a new user
    reg_data = {'username': 'testuser', 'password': 'mypassword'}
    response = client.post('/api/auth/register', json=reg_data)
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['username'] == 'testuser'

    # Registering the same user should fail
    response_dup = client.post('/api/auth/register', json=reg_data)
    assert response_dup.status_code == 400
    assert 'ቀድሞ ተመዝግቧል' in json.loads(response_dup.data)['error']

    # Logout
    logout_resp = client.post('/api/auth/logout')
    assert logout_resp.status_code == 200

    # Login with wrong password should fail
    login_wrong = {'username': 'testuser', 'password': 'wrongpassword'}
    response_wrong = client.post('/api/auth/login', json=login_wrong)
    assert response_wrong.status_code == 401
    assert 'የይለፍ ቃል የተሳሳተ' in json.loads(response_wrong.data)['error']

    # Login with non-existent user should fail
    login_nonexistent = {'username': 'stranger', 'password': 'mypassword'}
    response_nonexistent = client.post('/api/auth/login', json=login_nonexistent)
    assert response_nonexistent.status_code == 404
    assert 'አልተመዘገበም' in json.loads(response_nonexistent.data)['error']

    # Login with correct credentials should succeed
    login_data = {'username': 'testuser', 'password': 'mypassword'}
    response_login = client.post('/api/auth/login', json=login_data)
    assert response_login.status_code == 200
    assert json.loads(response_login.data)['username'] == 'testuser'

def test_progress_tracking_api_flow(client):
    # Fetching progress when logged out should fail (401)
    response_unauth = client.get('/api/progress')
    assert response_unauth.status_code == 401

    # Register/Login user
    client.post('/api/auth/register', json={'username': 'proguser', 'password': 'password'})

    # Get progress (should be empty initially)
    prog_resp = client.get('/api/progress')
    assert prog_resp.status_code == 200
    data = json.loads(prog_resp.data)
    assert data['completed_laws'] == []

    # Complete Law 1
    complete_resp = client.post('/api/progress/complete', json={'law_id': 1})
    assert complete_resp.status_code == 200
    complete_data = json.loads(complete_resp.data)
    assert 1 in complete_data['completed_laws']

    # Get updated progress
    prog_resp_updated = client.get('/api/progress')
    assert prog_resp_updated.status_code == 200
    updated_data = json.loads(prog_resp_updated.data)
    assert updated_data['completed_laws'] == [1]

def test_get_section_json_api_en(client):
    response = client.get('/api/sections/1?lang=en')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['id'] == 1
    assert data['label'] == 'Law 1'
    assert data['title'] == 'NEVER OUTSHINE THE MASTER'
    assert 'comfortably superior' in data['body']
    assert data['language'] == 'en'

def test_get_section_audio_api_en(client):
    import os
    import hashlib
    
    # English audio expects the file to be pre-generated in the English audio cache directory
    cache_dir = client.application.config['AUDIO_CACHE_DIR_EN']
    os.makedirs(cache_dir, exist_ok=True)
    
    body_text = "Always make those above you feel comfortably superior." # Law 1 en body text
    text_hash = hashlib.sha256(body_text.encode('utf-8')).hexdigest()
    file_path = os.path.join(cache_dir, f"{text_hash}.mp3")
    
    with open(file_path, 'wb') as f:
        f.write(b"mocked-english-audio")
        
    try:
        response = client.get('/api/sections/1/audio?lang=en')
        assert response.status_code == 200
        assert response.data == b"mocked-english-audio"
        response.close()
    finally:
        if os.path.exists(file_path):
            os.unlink(file_path)

def test_home_page_when_db_offline(client):
    from unittest.mock import patch
    with patch.object(client.application.db_service, 'check_availability', return_value=False):
        response = client.get('/')
        assert response.status_code == 200
        html = response.data.decode('utf-8')
        assert 'db-offline-badge' in html or 'Progress offline' in html
        
        # Verify APIs return 503
        reg_response = client.post('/api/auth/register', json={'username': 'test', 'password': 'pwd'})
        assert reg_response.status_code == 503
        
        login_response = client.post('/api/auth/login', json={'username': 'test', 'password': 'pwd'})
        assert login_response.status_code == 503
        
        progress_response = client.get('/api/progress')
        assert progress_response.status_code == 503


