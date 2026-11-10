import os
import hashlib

class EmptyContentError(Exception):
    """Raised when text content is empty or only whitespace."""
    pass

class TTSService:
    """
    Service for resolving and serving pre-generated audio files.
    Audio files are generated locally/offline and stored in instance/audio_cache (Amharic)
    and instance/audio_cache_en (English). No on-demand server generation.
    """
    def __init__(self, cache_dir=None, cache_dir_en=None):
        self._cache_dir = cache_dir
        self._cache_dir_en = cache_dir_en

    @property
    def cache_dir(self):
        if self._cache_dir is None:
            from flask import current_app
            self._cache_dir = current_app.config.get('AUDIO_CACHE_DIR') or os.path.join(current_app.instance_path, 'audio_cache')
        return self._cache_dir

    @property
    def cache_dir_en(self):
        if self._cache_dir_en is None:
            from flask import current_app
            self._cache_dir_en = current_app.config.get('AUDIO_CACHE_DIR_EN') or os.path.join(current_app.instance_path, 'audio_cache_en')
        return self._cache_dir_en

    def get_audio_path(self, text, lang='am'):
        """
        Computes the SHA256 content hash of the text and checks if the pre-generated
        audio file exists in the respective cache directory.
        Returns the absolute file path if present, or None if not yet generated.
        """
        if not text or not text.strip():
            raise EmptyContentError("Cannot generate TTS audio for empty content.")

        text_utf8 = text.strip().encode('utf-8')
        text_hash = hashlib.sha256(text_utf8).hexdigest()

        target_dir = self.cache_dir_en if lang == 'en' else self.cache_dir
        if not target_dir:
            return None

        audio_file_path = os.path.join(target_dir, f"{text_hash}.mp3")
        if os.path.exists(audio_file_path):
            return audio_file_path

        return None
