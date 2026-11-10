import os
import pytest
import hashlib
from app.services.tts import TTSService, EmptyContentError

def test_tts_rejects_empty_content(app):
    with app.app_context():
        service = app.tts_service
        
        with pytest.raises(EmptyContentError):
            service.get_audio_path("")
            
        with pytest.raises(EmptyContentError):
            service.get_audio_path("   ")

def test_tts_serves_pregenerated_file_when_cached(app):
    with app.app_context():
        service = app.tts_service
        text = "ይህ የሙከራ የአማርኛ ጽሑፍ ነው።"
        text_hash = hashlib.sha256(text.strip().encode('utf-8')).hexdigest()
        
        # Place pre-generated audio file in the cache directory
        cache_file = os.path.join(service.cache_dir, f"{text_hash}.mp3")
        with open(cache_file, 'wb') as f:
            f.write(b"mocked-pregenerated-mp3-bytes")
            
        result_path = service.get_audio_path(text)
        assert result_path == cache_file
        assert os.path.exists(result_path)

def test_tts_returns_none_when_audio_not_pregenerated(app):
    with app.app_context():
        service = app.tts_service
        text = "ይህ ገና ያልተቀረጸ ጽሑፍ ነው።"
        
        # When no pre-generated file exists, return None (no on-demand server generation)
        result_path = service.get_audio_path(text)
        assert result_path is None

def test_audio_endpoint_with_pregenerated_file(client):
    cache_dir = client.application.config['AUDIO_CACHE_DIR']
    body_text = "የሙከራ ይዘት እዚህ ይገኛል::"  # Seeded Law 1 body in mock_sections_file
    text_hash = hashlib.sha256(body_text.strip().encode('utf-8')).hexdigest()
    file_path = os.path.join(cache_dir, f"{text_hash}.mp3")
    
    with open(file_path, 'wb') as f:
        f.write(b"mocked-amharic-audio-bytes")

    # GET audio endpoint for Law 1 should return 200 with the pre-generated file
    response = client.get('/api/sections/1/audio')
    assert response.status_code == 200
    assert response.data == b"mocked-amharic-audio-bytes"

def test_audio_endpoint_not_ready_returns_503(client):
    # For Law 2 whose audio has not been pre-generated, should return 503
    response = client.get('/api/sections/2/audio')
    assert response.status_code == 503
    data = response.get_json()
    assert data.get('details') == 'AUDIO_NOT_READY'

def test_audio_endpoint_empty_content_returns_400(client):
    # Law 3 has empty body
    response = client.get('/api/sections/3/audio')
    assert response.status_code == 400
