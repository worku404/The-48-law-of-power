# Flask Single-Page Amharic Reader

An editorial-style Single-Page Web Application presenting **48ቱ የሥልጣን ሕጎች** (The 48 Laws of Power) translated into Amharic. The application includes a responsive collapsible sidebar navigation, light/dark reading modes, user-authenticated like counts, sharing options, and Text-to-Speech (TTS) audio narration powered by the Google Gemini API.

## Features

- **Single-Page Reader Architecture:** Smooth page content updates via AJAX transitions while preserving browser history state deep links.
- **Editorial Interface:** Muted warm-parchment light theme and deep-charcoal dark theme designed for optimal reading comfort. Font settings utilize Ethiopic-compatible typefaces.
- **User-Authenticated Likes Engine:** Thread-safe backend recording likes once per authenticated user, preventing duplicate likes across browsers or devices and stored persistently in PostgreSQL/Neon or SQLite.
- **Gemini TTS Narration:** Plays Amharic voice readings using standard Gemini audio modality generation. Caches generated `.wav` audio files inside `instance/audio_cache` by content hash to prevent duplicate API billing.
- **Share Capabilities:** Leverages native browser Web Share APIs (on mobile devices) with a secure fallback copy-to-clipboard trigger.

---

## Getting Started

### Prerequisites

- Python 3.8 or higher.
- A Google Gemini API Key (set as `GEMINI_API_KEY` or `GOOGLE_API_KEY` environment variables).

### Installation

1. Clone or download this repository:
   ```bash
   cd The_48_low_of_power
   ```

2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

---

## Configuration & Execution

### Environment Variables

For local development, copy `.env.example` to `.env` and set the values there.
The application reads the verified `NEON_DB` environment variable for
PostgreSQL/Neon. The URL must include `sslmode=require`.

`NEON_DB` connects the existing tables automatically on the first request:

- `users`: usernames and Werkzeug-hashed passwords
- `user_progress`: completed-law history per user
- `section_likes` and `user_likes`: aggregate and per-user authenticated likes

Set a long random `SECRET_KEY`; it signs the login session cookie. In HTTPS
production, also set `SESSION_COOKIE_SECURE=true`.

Set your Gemini API Key in the environment before launching the application:

```powershell
# In PowerShell (Windows)
$env:GEMINI_API_KEY="your-api-key-here"

# In Command Prompt (Windows)
set GEMINI_API_KEY=your-api-key-here

# In bash (macOS/Linux)
export GEMINI_API_KEY="your-api-key-here"
```

Never commit `.env` or paste a real database/API credential into source code.
If a credential is exposed, rotate it in the provider dashboard immediately.

### Running Locally

To run the Flask development server:

```bash
# Set Flask entrypoint
$env:FLASK_APP="app"
$env:FLASK_DEBUG="1"

# Run development server
flask run
```

Access the interface at `http://127.0.0.1:5000/`.

---

## Running Tests

Automated unit, integration, and service tests are implemented using `pytest`. Testing runs in complete isolation with mock API servers and temporary files.

To run the test suite:

```bash
pytest -v
```

---

## Production Deployment (Azure App Service)

This application is configured for deployment on Linux/Windows Azure App Service using `gunicorn`:

1. Ensure the `requirements.txt` contains `gunicorn`.
2. Map the environment variable `GEMINI_API_KEY` within the App Service Configuration panel under Application Settings.
3. Configure your startup command as:
   ```bash
   gunicorn --bind=0.0.0.0 --timeout 600 "app:create_app()"
   ```
