import os
import sys
import json
import time
import wave
import hashlib
import tempfile
import subprocess
import shutil
import re
import argparse

# Enable UTF-8 console output on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def load_keys():
    """
    Loads Gemini API keys from environment variables or .env file.
    Supports single GEMINI_API_KEY, comma-separated keys, or API2_KEY, API3_KEY...
    """
    keys = []
    # 1. Comma-separated or single GEMINI_API_KEY
    main_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if main_key:
        for k in main_key.split(','):
            k = k.strip()
            if k and k not in keys:
                keys.append(k)

    # 2. Key rotation variables (API2_KEY, API3_KEY, etc.)
    for i in range(2, 10):
        extra_key = os.environ.get(f"API{i}_KEY")
        if extra_key and extra_key.strip() and extra_key.strip() not in keys:
            keys.append(extra_key.strip())

    # 3. If keys still empty, parse local .env file if it exists
    if not keys and os.path.exists(".env"):
        with open(".env", "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip("'\"")
                if k in ("GEMINI_API_KEY", "GOOGLE_API_KEY") or k.startswith("API"):
                    if v and v not in keys:
                        keys.append(v)

    return keys

def find_ffmpeg():
    """Finds ffmpeg executable from PATH, env var, or common local paths."""
    env_path = os.environ.get("FFMPEG_PATH")
    if env_path and os.path.exists(env_path):
        return env_path
    which_path = shutil.which("ffmpeg")
    if which_path:
        return which_path
    common_paths = [
        r"C:\Users\hi\Downloads\webdev\Django_Projects\e-learning\tools\ffmpeg\ffmpeg-8.1-essentials_build\bin\ffmpeg.exe",
        r"C:\ffmpeg\bin\ffmpeg.exe",
        "/usr/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
    ]
    for p in common_paths:
        if os.path.exists(p):
            return p
    return None

def split_text_into_chunks(text, lang='am', max_chars=1400):
    """
    Splits text cleanly at sentence boundaries so TTS pauses sound natural.
    Amharic uses '።' as full stop; English uses '. ! ?'.
    """
    if lang == 'am':
        sentence_re = re.compile(r'([^።\n]+[።\n]*)\s*')
    else:
        sentence_re = re.compile(r'([^.!?\n]+[.!?\n]*)\s*')

    sentences = sentence_re.findall(text)
    if not sentences:
        sentences = [text]

    chunks = []
    current_chunk = []
    current_len = 0

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        slen = len(sentence)

        if current_len + slen + 1 > max_chars:
            if current_chunk:
                chunks.append(" ".join(current_chunk))
                current_chunk = []
                current_len = 0
            if slen > max_chars:
                # Long sentence fallback: split on whitespace
                words = sentence.split()
                part = []
                part_len = 0
                for w in words:
                    wlen = len(w) + 1
                    if part_len + wlen > max_chars and part:
                        chunks.append(" ".join(part))
                        part = []
                        part_len = 0
                    part.append(w)
                    part_len += wlen
                if part:
                    chunks.append(" ".join(part))
                continue

        current_chunk.append(sentence)
        current_len += slen + 1

    if current_chunk:
        chunks.append(" ".join(current_chunk))

    return [c.strip() for c in chunks if c.strip()]

def generate_pcm_chunk(client_rotator, text_chunk, lang='am', voice_name='Aoede', model="gemini-2.5-flash-preview-tts"):
    """Calls Gemini TTS API with retry and key rotation for rate limits."""
    from google.genai import types

    config = types.GenerateContentConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name=voice_name
                )
            )
        )
    )

    if lang == 'am':
        prompt = f"Please read the following Amharic text aloud exactly as written, with clear, smooth, natural pronunciation:\n\n{text_chunk}"
    else:
        prompt = f"Please read the following English text aloud exactly as written, with clear, smooth, natural pronunciation:\n\n{text_chunk}"

    max_retries = 6
    for attempt in range(max_retries):
        client = client_rotator.get_client()
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=config
            )

            if not response.candidates:
                raise ValueError("No candidates returned from Gemini.")
            cand = response.candidates[0]
            if cand.content is None:
                reason = getattr(cand, 'finish_reason', 'unknown')
                raise ValueError(f"No content in response (finish_reason={reason})")
            part = cand.content.parts[0]
            if not part.inline_data or not part.inline_data.data:
                raise ValueError("No audio inline data returned.")

            return part.inline_data.data

        except Exception as e:
            err_str = str(e)
            print(f"    [Warning] Attempt {attempt+1}/{max_retries} failed: {err_str[:120]}")
            client_rotator.rotate()
            if "RESOURCE_EXHAUSTED" in err_str or "429" in err_str:
                wait_time = 30 + (attempt * 10)
            else:
                wait_time = 10
            print(f"    [Wait] Sleeping {wait_time}s before retry...")
            time.sleep(wait_time)

    raise RuntimeError(f"All {max_retries} retries exhausted for text chunk.")

def pcm_to_mp3(pcm_chunks, output_mp3_path, ffmpeg_path, bitrate="48k"):
    """Merges 24kHz 16-bit mono PCM chunks and encodes them to MP3 using ffmpeg."""
    combined_pcm = b""
    for data in pcm_chunks:
        if len(data) % 2 != 0:
            data += b'\x00'
        combined_pcm += data

    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_wav:
        temp_wav_path = temp_wav.name

    try:
        with wave.open(temp_wav_path, 'wb') as wav:
            wav.setnchannels(1)      # Mono
            wav.setsampwidth(2)      # 16-bit
            wav.setframerate(24000)  # 24 kHz
            wav.writeframes(combined_pcm)

        os.makedirs(os.path.dirname(output_mp3_path), exist_ok=True)

        if ffmpeg_path:
            cmd = [
                ffmpeg_path,
                "-y",
                "-i", temp_wav_path,
                "-codec:a", "libmp3lame",
                "-b:a", bitrate,
                output_mp3_path
            ]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if res.returncode != 0:
                raise RuntimeError(f"FFmpeg encoding error: {res.stderr[-300:]}")
        else:
            # Fallback if ffmpeg is somehow missing
            print("    [Warning] ffmpeg not found! Writing raw WAV to destination.")
            shutil.copy(temp_wav_path, output_mp3_path)
    finally:
        if os.path.exists(temp_wav_path):
            os.unlink(temp_wav_path)

class KeyRotator:
    def __init__(self, keys):
        from google import genai
        self.keys = keys
        self.index = 0
        self.genai = genai

    def get_client(self):
        k = self.keys[self.index % len(self.keys)]
        masked = f"...{k[-6:]}" if len(k) > 6 else "***"
        return self.genai.Client(api_key=k)

    def rotate(self):
        self.index += 1
        k = self.keys[self.index % len(self.keys)]
        masked = f"...{k[-6:]}" if len(k) > 6 else "***"
        print(f"    [Rotated] Switched to API key {masked}")

def process_language(lang, sections_path, cache_dir, rotator, args, ffmpeg_path):
    print(f"\n========================================================")
    print(f"  Processing {lang.upper()} audio (target dir: {cache_dir})")
    print(f"========================================================")

    if not os.path.exists(sections_path):
        print(f"Error: {sections_path} does not exist!")
        return 0

    with open(sections_path, 'r', encoding='utf-8') as f:
        sections = json.load(f)

    os.makedirs(cache_dir, exist_ok=True)
    voice = args.voice_am if lang == 'am' else args.voice_en
    generated_count = 0

    for section in sections:
        law_id = section.get('id', 0)
        if law_id < args.start or law_id > args.end:
            continue

        if args.limit > 0 and generated_count >= args.limit:
            print(f"\n[Limit reached] Processed {generated_count} law(s) for {lang}. Stopping.")
            break

        body = section.get('body', '').strip()
        label = section.get('label', f'Law {law_id}')
        if not body:
            print(f"[-] {label}: No text body. Skipping.")
            continue

        text_hash = hashlib.sha256(body.encode('utf-8')).hexdigest()
        output_mp3 = os.path.join(cache_dir, f"{text_hash}.mp3")

        if os.path.exists(output_mp3) and os.path.getsize(output_mp3) > 1000:
            print(f"[✓] {label}: Audio already cached ({os.path.basename(output_mp3)[:12]}...). Skipping.")
            continue

        print(f"\n[*] Generating audio for {label} (Law {law_id})...")
        print(f"    Hash: {text_hash}")
        print(f"    Output: {output_mp3}")

        if args.dry_run:
            print("    [Dry-run] Audio would be generated here.")
            generated_count += 1
            continue

        chunks = split_text_into_chunks(body, lang=lang, max_chars=1400)
        print(f"    Split into {len(chunks)} chunk(s). Synthesizing with voice '{voice}'...")

        pcm_chunks = []
        failed = False
        for i, chunk in enumerate(chunks):
            print(f"    Chunk {i+1}/{len(chunks)} ({len(chunk)} chars)...", end="", flush=True)
            try:
                pcm_data = generate_pcm_chunk(
                    client_rotator=rotator,
                    text_chunk=chunk,
                    lang=lang,
                    voice_name=voice,
                    model=args.model
                )
                pcm_chunks.append(pcm_data)
                print(f" Done ({len(pcm_data)} bytes).")
                # Polite rate-limit delay between chunks
                time.sleep(args.chunk_delay)
            except Exception as e:
                print(f" FAILED: {e}")
                failed = True
                break

        if not failed and pcm_chunks:
            try:
                pcm_to_mp3(pcm_chunks, output_mp3, ffmpeg_path, bitrate=args.bitrate)
                file_size = os.path.getsize(output_mp3)
                print(f"    [Success] {label} audio saved! Size: {file_size:,} bytes")
                generated_count += 1
                # Small pause between completed laws
                time.sleep(3)
            except Exception as e:
                print(f"    [Error] Failed to merge/encode audio: {e}")
        else:
            print(f"    [Failed] Skipping saving for {label}.")

    return generated_count

def main():
    parser = argparse.ArgumentParser(description="Generate audio files for The 48 Laws of Power using Gemini TTS.")
    parser.add_argument("--lang", choices=["am", "en", "both"], default="both", help="Language to generate (am, en, both)")
    parser.add_argument("--limit", type=int, default=2, help="Max number of laws to generate in this run (0 for unlimited)")
    parser.add_argument("--start", type=int, default=1, help="Start law id (inclusive)")
    parser.add_argument("--end", type=int, default=48, help="End law id (inclusive)")
    parser.add_argument("--voice-am", default="Aoede", help="Gemini TTS voice for Amharic")
    parser.add_argument("--voice-en", default="Puck", help="Gemini TTS voice for English")
    parser.add_argument("--model", default="gemini-2.5-flash-preview-tts", help="Gemini TTS model name")
    parser.add_argument("--bitrate", default="48k", help="MP3 output bitrate")
    parser.add_argument("--chunk-delay", type=float, default=4.0, help="Delay (seconds) between chunk API requests")
    parser.add_argument("--dry-run", action="store_true", help="Inspect what would be generated without calling API")

    args = parser.parse_args()

    # Base paths
    root_dir = os.path.dirname(os.path.abspath(__file__))
    am_sections = os.path.join(root_dir, "data", "sections.json")
    en_sections = os.path.join(root_dir, "data", "sections_en.json")
    am_cache = os.path.join(root_dir, "instance", "audio_cache")
    en_cache = os.path.join(root_dir, "instance", "audio_cache_en")

    ffmpeg_path = find_ffmpeg()
    print(f"FFmpeg path: {ffmpeg_path or 'NOT FOUND'}")

    keys = load_keys()
    if not keys and not args.dry_run:
        print("ERROR: No Gemini API keys found. Set GEMINI_API_KEY environment variable or create .env file.")
        sys.exit(1)

    print(f"Loaded {len(keys)} Gemini API key(s) for generation.")
    rotator = KeyRotator(keys) if keys else None

    total_generated = 0
    if args.lang in ("am", "both"):
        total_generated += process_language("am", am_sections, am_cache, rotator, args, ffmpeg_path)

    if args.lang in ("en", "both"):
        total_generated += process_language("en", en_sections, en_cache, rotator, args, ffmpeg_path)

    print(f"\nFinished! Total new laws generated in this run: {total_generated}")

if __name__ == "__main__":
    main()
