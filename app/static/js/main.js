document.addEventListener('DOMContentLoaded', () => {
    // --- Constants ---
    const TOTAL_LAWS = 48;
    const ETHIOPIC_RE = /[\u1200-\u137F]/;
    // A paragraph that ends like a finished sentence (Latin + Ethiopic punctuation)
    const TERMINAL_RE = /[.!?።፧፨፡"”’»)\]:;…]\s*$/;
    const LAW_NUMBER_ONLY_RE = /^(ሕግ|ህግ|law)\s*\d+\s*[:.\-–—]?$/i;

    // Short interface strings (toasts keep their original bilingual wording)
    const UI = {
        en: {
            label: (n) => `Law ${n}`,
            listen: 'Listen',
            pause: 'Pause',
            resume: 'Resume',
            generating: 'Preparing audio…',
            share: 'Share',
            prev: 'Previous',
            next: 'Next',
            soon: 'Coming soon',
            lawComplete: (n) => `Law ${n} complete`,
            closeMenu: 'Close menu'
        },
        am: {
            label: (n) => `ሕግ ${n}`,
            listen: 'አድምጥ',
            pause: 'ቆም አድርግ',
            resume: 'ቀጥል',
            generating: 'በማዘጋጀት ላይ…',
            share: 'አጋራ',
            prev: 'ቀዳሚ',
            next: 'ቀጣይ',
            soon: 'በቅርብ ቀን',
            lawComplete: (n) => `ሕግ ${n} ተጠናቋል`,
            closeMenu: 'ዝጋ'
        }
    };

    const ICONS = {
        speaker: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`,
        pause: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>`,
        play: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="none"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"></path></svg>`,
        spinner: `<svg class="loading-spinner" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="9" stroke-dasharray="40 18" stroke-linecap="round"></circle></svg>`
    };

    // --- DOM Elements ---
    const appContainer = document.querySelector('.app-container');
    const sidebarEl = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebarClose = document.getElementById('sidebar-close');
    const themeToggle = document.getElementById('theme-toggle');
    const moonIcon = themeToggle.querySelector('.moon-icon');
    const sunIcon = themeToggle.querySelector('.sun-icon');

    const pageTitle = document.getElementById('page-title');
    const viewLawLabel = document.getElementById('view-law-label');
    const viewLawTitle = document.getElementById('view-law-title');
    const viewLawBody = document.getElementById('view-law-body');

    const likeBtn = document.getElementById('like-btn');
    const likesCountEl = document.getElementById('likes-count');
    const shareBtn = document.getElementById('share-btn');
    const shareBtnText = document.getElementById('share-btn-text');
    const audioBtn = document.getElementById('audio-btn');
    const audioBtnText = document.getElementById('audio-btn-text');
    const audioIconContainer = document.getElementById('audio-icon-container');
    const audioPlayer = document.getElementById('tts-audio-player');
    const toast = document.getElementById('toast-notification');
    const readerViewport = document.getElementById('reader-viewport');
    const readProgressFill = document.getElementById('read-progress-fill');

    const langBtn = document.getElementById('lang-btn');
    const langBtnText = document.getElementById('lang-btn-text');

    const pagerStatus = document.getElementById('pager-status');
    const prevLawBtn = document.getElementById('prev-law-btn');
    const nextLawBtn = document.getElementById('next-law-btn');
    const prevLawHint = document.getElementById('prev-law-hint');
    const nextLawHint = document.getElementById('next-law-hint');
    const prevLawTarget = document.getElementById('prev-law-target');
    const nextLawTarget = document.getElementById('next-law-target');

    // --- State Variables ---
    let currentLawId = getLawIdFromUrl()
        || parseInt(readerViewport ? readerViewport.dataset.lawId : '', 10)
        || 1;
    let isPlaying = false;
    let audioIsPaused = false;
    let isLoadingAudio = false;

    // Progress tracking state variables
    let currentAudioDuration = 0;
    let timeSpentOnLaw = 0;
    let progressTimer = null;
    let completedLaws = new Set();
    let isLoggedIn = false;
    let username = "";
    let isDbAvailable = true;
    let currentLang = localStorage.getItem('lang') || 'am';

    const strings = () => UI[currentLang] || UI.am;

    // --- Read the server-rendered login/progress state FIRST ---
    // (Previously this ran after the first re-render, which overwrote the
    //  server's "logged in" markup and made signed-in users look signed out.)
    const initialProgressContainer = document.getElementById('user-progress-container');
    if (initialProgressContainer) {
        isDbAvailable = initialProgressContainer.getAttribute('data-db-available') !== 'false';
        isLoggedIn = initialProgressContainer.getAttribute('data-logged-in') === 'true';
        if (isLoggedIn) {
            const loggedUsernameEl = document.getElementById('logged-username');
            username = loggedUsernameEl ? loggedUsernameEl.textContent.trim() : "";
            try {
                completedLaws = new Set(JSON.parse(initialProgressContainer.getAttribute('data-completed') || '[]'));
            } catch (e) {
                completedLaws = new Set();
            }
        }
    }

    // --- Text helpers (presentation only) ---
    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    // "ሕግ 1 በፍፁም ..." -> "በፍፁም ..." (the number is already shown above the title)
    function cleanTitle(title) {
        const raw = (title || '').replace(/\s+/g, ' ').trim();
        const stripped = raw.replace(/^(ሕግ|ህግ|law)\s*\d+\s*[:.\-–—]?\s*/i, '').trim();
        return stripped || raw;
    }

    // "NEVER OUTSHINE THE MASTER" -> "Never Outshine the Master"
    function prettyTitle(title) {
        const t = cleanTitle(title);
        const letters = t.replace(/[^A-Za-z]/g, '');
        if (letters.length < 4 || t !== t.toUpperCase()) return t;
        const small = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'if', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'than']);
        return t.toLowerCase().split(' ').map((w, i) => {
            if (i > 0 && small.has(w)) return w;
            return w.replace(/^([^a-z]*)([a-z])/, (m, p, c) => p + c.toUpperCase());
        }).join(' ');
    }

    function normalizeText(s) {
        return (s || '').replace(/\s+/g, ' ').replace(/[\s!.?።:፡]+$/, '').trim().toLowerCase();
    }

    function isHeadingText(text) {
        if (TERMINAL_RE.test(text) || /[,፣]$/.test(text)) return false;
        const words = text.split(/\s+/).length;
        if (ETHIOPIC_RE.test(text)) return text.length <= 40 && words <= 5;
        const hasLetters = /[A-Za-z]/.test(text);
        return hasLetters && text.length <= 48 && words <= 7 && text === text.toUpperCase();
    }

    // Turns the plain body text into readable structure:
    // drops repeated "Law N" / title lines, turns short headings (Judgment,
    // Keys to Power, ...) into section headings, highlights the judgment,
    // and re-joins Amharic paragraphs that were split mid-sentence.
    function renderLawBody(bodyText, title) {
        const paragraphs = String(bodyText || '')
            .split(/\n\s*\n/)
            .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
            .filter(Boolean);

        const merged = [];
        paragraphs.forEach((p) => {
            const prev = merged[merged.length - 1];
            if (prev && ETHIOPIC_RE.test(prev) && prev.length > 60 &&
                !TERMINAL_RE.test(prev) && !isHeadingText(prev) && !isHeadingText(p)) {
                merged[merged.length - 1] = `${prev} ${p}`;
            } else {
                merged.push(p);
            }
        });

        const duplicates = new Set(
            [title, cleanTitle(title)].filter(Boolean).map(normalizeText)
        );
        while (merged.length && (
            LAW_NUMBER_ONLY_RE.test(merged[0].trim()) ||
            duplicates.has(normalizeText(merged[0])) ||
            duplicates.has(normalizeText(cleanTitle(merged[0])))
        )) {
            merged.shift();
        }

        const fragment = document.createDocumentFragment();
        let nextIsJudgment = false;
        merged.forEach((text) => {
            if (isHeadingText(text)) {
                const h = document.createElement('h2');
                h.className = 'reader-section-title';
                h.textContent = text;
                fragment.appendChild(h);
                nextIsJudgment = /judg|ብያኔ/i.test(text);
                return;
            }
            const p = document.createElement('p');
            p.textContent = text;
            if (nextIsJudgment) {
                p.className = 'law-judgment';
                nextIsJudgment = false;
            }
            fragment.appendChild(p);
        });

        viewLawBody.replaceChildren(fragment);
    }

    // --- Theme & Language Management ---
    initializeTheme();
    updateLanguageUI();
    updateGlobalStaticTexts();
    enhanceInitialContent();

    function toggleLanguage() {
        currentLang = currentLang === 'en' ? 'am' : 'en';
        localStorage.setItem('lang', currentLang);
        updateLanguageUI();
        updateGlobalStaticTexts();
        loadLaw(currentLawId);
    }

    langBtn.addEventListener('click', toggleLanguage);

    function updateLanguageUI() {
        if (currentLang === 'en') {
            langBtnText.textContent = 'ወደ አማርኛ ቀይር (Switch to Amharic)';
            langBtn.setAttribute('title', 'ወደ አማርኛ ቀይር (Switch to Amharic)');
            document.documentElement.setAttribute('lang', 'en');
        } else {
            langBtnText.textContent = 'Switch to English / ወደ እንግሊዝኛ ቀይር';
            langBtn.setAttribute('title', 'Switch to English / ወደ እንግሊዝኛ ቀይር');
            document.documentElement.setAttribute('lang', 'am');
        }
    }

    function updateGlobalStaticTexts() {
        const s = strings();
        const logoText = document.querySelector('.logo-text');
        const sidebarHeaderH2 = document.querySelector('.sidebar-header h2');
        const sidebarHeaderP = document.querySelector('.sidebar-header p');

        if (currentLang === 'en') {
            if (logoText) logoText.textContent = 'The 48 Laws of Power';
            if (sidebarHeaderH2) sidebarHeaderH2.textContent = 'The 48 Laws of Power';
            if (sidebarHeaderP) sidebarHeaderP.textContent = '48ቱ የሥልጣን ሕጎች';
        } else {
            if (logoText) logoText.textContent = '48ቱ የሥልጣን ሕጎች';
            if (sidebarHeaderH2) sidebarHeaderH2.textContent = '48ቱ የሥልጣን ሕጎች';
            if (sidebarHeaderP) sidebarHeaderP.textContent = 'The 48 Laws of Power';
        }

        if (shareBtnText) shareBtnText.textContent = s.share;
        if (sidebarClose) sidebarClose.setAttribute('aria-label', s.closeMenu);
        if (!isPlaying && !audioIsPaused && !isLoadingAudio) {
            audioBtnText.textContent = s.listen;
        }

        // Update sidebar items to matching language titles
        document.querySelectorAll('.sidebar-link').forEach((link) => {
            const titleEl = link.querySelector('.law-name');
            const dotEl = link.querySelector('.law-dot');
            if (!titleEl) return;

            const titleAm = link.getAttribute('data-title-am') || '';
            const titleEn = link.getAttribute('data-title-en') || '';
            const rawTitle = currentLang === 'en' ? titleEn : titleAm;

            if (rawTitle) {
                titleEl.textContent = prettyTitle(rawTitle);
                titleEl.removeAttribute('data-soon');
                link.classList.remove('is-soon');
                if (dotEl) {
                    dotEl.className = 'law-dot filled';
                    dotEl.setAttribute('title', 'Content available');
                }
            } else {
                titleEl.textContent = s.soon;
                titleEl.setAttribute('data-soon', 'true');
                link.classList.add('is-soon');
                if (dotEl) {
                    dotEl.className = 'law-dot empty';
                    dotEl.setAttribute('title', s.soon);
                }
            }
        });

        viewLawLabel.textContent = s.label(currentLawId);

        renderUserProgressContainer();
        updatePager();
    }

    // Applies the reading layout to the server-rendered law on first load
    function enhanceInitialContent() {
        document.querySelectorAll('.sidebar-link .law-name:not([data-soon])').forEach((el) => {
            el.textContent = prettyTitle(el.textContent);
        });

        if (viewLawBody.classList.contains('coming-soon')) return;
        const rawTitle = viewLawTitle.textContent.trim();
        const bodyText = Array.from(viewLawBody.querySelectorAll('p'))
            .map((p) => p.textContent.trim())
            .join('\n\n');
        viewLawTitle.textContent = prettyTitle(rawTitle);
        renderLawBody(bodyText, rawTitle);
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
    }

    themeToggle.addEventListener('click', toggleTheme);

    function initializeTheme() {
        const storedTheme = localStorage.getItem('theme');
        if (storedTheme) {
            setTheme(storedTheme);
        } else {
            const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            setTheme(systemPrefersDark ? 'dark' : 'light');
        }
    }

    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        if (theme === 'dark') {
            moonIcon.style.display = 'none';
            sunIcon.style.display = 'block';
            themeToggle.setAttribute('title', 'Light mode');
        } else {
            moonIcon.style.display = 'block';
            sunIcon.style.display = 'none';
            themeToggle.setAttribute('title', 'Dark mode');
        }
    }

    // --- Sidebar Responsiveness & Collapsing ---
    function openMobileSidebar() {
        appContainer.classList.add('sidebar-open');
        const active = sidebarEl ? sidebarEl.querySelector('.sidebar-link.active') : null;
        if (active) active.scrollIntoView({ block: 'center' });
    }

    function closeMobileSidebar() {
        appContainer.classList.remove('sidebar-open');
    }

    sidebarToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.innerWidth < 768) {
            if (appContainer.classList.contains('sidebar-open')) {
                closeMobileSidebar();
            } else {
                openMobileSidebar();
            }
        } else {
            appContainer.classList.toggle('sidebar-collapsed');
        }
    });

    if (sidebarClose) {
        sidebarClose.addEventListener('click', (e) => {
            e.stopPropagation();
            closeMobileSidebar();
            sidebarToggle.focus();
        });
    }

    // Close mobile sidebar when clicking outside or on layout content
    document.addEventListener('click', (e) => {
        if (window.innerWidth < 768 && appContainer.classList.contains('sidebar-open')) {
            if (sidebarEl && !sidebarEl.contains(e.target) && e.target !== sidebarToggle) {
                closeMobileSidebar();
            }
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && appContainer.classList.contains('sidebar-open')) {
            closeMobileSidebar();
        }
    });

    // --- AJAX Navigation & Content Loading ---
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const sectionId = parseInt(link.getAttribute('data-id'));

            // Show spinner on this link's dot immediately
            const dot = link.querySelector('.law-dot');
            if (dot) dot.classList.add('loading');

            loadLaw(sectionId, true, dot);

            // On mobile, automatically dismiss the sidebar drawer
            if (window.innerWidth < 768) {
                closeMobileSidebar();
            }
        });
    });

    // Previous / next law at the end of each law
    function goToLaw(lawId) {
        if (lawId < 1 || lawId > TOTAL_LAWS) return;
        const link = document.getElementById(`sidebar-law-${lawId}`);
        const dot = link ? link.querySelector('.law-dot') : null;
        if (dot) dot.classList.add('loading');
        loadLaw(lawId, true, dot);
    }

    if (prevLawBtn) prevLawBtn.addEventListener('click', () => goToLaw(currentLawId - 1));
    if (nextLawBtn) nextLawBtn.addEventListener('click', () => goToLaw(currentLawId + 1));

    function updatePager() {
        const s = strings();
        if (prevLawBtn) {
            prevLawBtn.disabled = currentLawId <= 1;
            if (prevLawHint) prevLawHint.textContent = s.prev;
            if (prevLawTarget) prevLawTarget.textContent = s.label(Math.max(1, currentLawId - 1));
        }
        if (nextLawBtn) {
            nextLawBtn.disabled = currentLawId >= TOTAL_LAWS;
            if (nextLawHint) nextLawHint.textContent = s.next;
            if (nextLawTarget) nextLawTarget.textContent = s.label(Math.min(TOTAL_LAWS, currentLawId + 1));
        }
        if (pagerStatus) {
            const done = completedLaws.has(currentLawId);
            pagerStatus.hidden = !done;
            pagerStatus.textContent = done ? s.lawComplete(currentLawId) : '';
        }
    }

    // Handle browser back/forward buttons
    window.addEventListener('popstate', () => {
        const sectionId = getLawIdFromUrl() || 1;
        loadLaw(sectionId, false);
    });

    function getLawIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const law = params.get('law');
        return law ? parseInt(law, 10) : null;
    }

    async function loadLaw(lawId, pushState = true, loadingDot = null) {
        if (isPlaying || isLoadingAudio || audioIsPaused) {
            stopAudio();
        }
        audioIsPaused = false;

        try {
            const response = await fetch(`/api/sections/${lawId}?lang=${currentLang}`);
            if (!response.ok) {
                throw new Error('Section details failed to load.');
            }
            const data = await response.json();

            currentLawId = data.id;

            // Reset scroll position to top when loading new content
            if (readerViewport) {
                readerViewport.scrollTop = 0;
            }

            // Update page UI
            viewLawLabel.textContent = strings().label(data.id);

            if (data.title) {
                viewLawTitle.textContent = prettyTitle(data.title);
                if (currentLang === 'en') {
                    pageTitle.textContent = `${data.label} - ${data.title} | The 48 Laws of Power`;
                } else {
                    pageTitle.textContent = `${data.label} - ${data.title} | 48ቱ የሥልጣን ሕጎች`;
                }
            } else {
                if (currentLang === 'en') {
                    viewLawTitle.textContent = 'Coming soon';
                    pageTitle.textContent = `${data.label} - Coming soon | The 48 Laws of Power`;
                } else {
                    viewLawTitle.textContent = 'በቅርብ ቀን (Coming soon)';
                    pageTitle.textContent = `${data.label} - በቅርብ ቀን (Coming soon) | 48ቱ የሥልጣን ሕጎች`;
                }
            }

            if (data.body) {
                renderLawBody(data.body, data.title);
                viewLawBody.classList.remove('coming-soon');
                audioBtn.removeAttribute('disabled');
                if (currentLang === 'en') {
                    audioBtn.setAttribute('title', 'Listen to this law aloud in English');
                } else {
                    audioBtn.setAttribute('title', 'Listen to this law aloud in Amharic');
                }
            } else {
                if (currentLang === 'en') {
                    viewLawBody.textContent = 'This law has not been translated yet. Coming soon!';
                } else {
                    viewLawBody.textContent = 'ይህ ክፍል ገና አልተተረጎመም። በቅርቡ ይደርሳል! (This law has not been translated yet. Coming soon!)';
                }
                viewLawBody.classList.add('coming-soon');
                audioBtn.setAttribute('disabled', 'true');
                audioBtn.setAttribute('title', 'Audio reader unavailable for coming soon sections');
            }

            // Update active sidebar link
            sidebarLinks.forEach(link => {
                const linkId = parseInt(link.getAttribute('data-id'));
                if (linkId === currentLawId) {
                    link.classList.add('active');
                    link.setAttribute('aria-current', 'page');
                } else {
                    link.classList.remove('active');
                    link.removeAttribute('aria-current');
                }
            });

            // Update likes display
            likesCountEl.textContent = data.likes;
            if (data.liked) {
                likeBtn.classList.add('liked');
                likeBtn.setAttribute('title', 'You have liked this law');
            } else {
                likeBtn.classList.remove('liked');
                likeBtn.setAttribute('title', 'Like this law');
            }

            // Push state to browser history
            if (pushState) {
                const newUrl = `/?law=${data.id}`;
                history.pushState({ lawId: data.id }, '', newUrl);
            }

            updatePager();
            updateReadProgress();

            // Update duration and progress tracking
            currentAudioDuration = data.audio_duration;
            timeSpentOnLaw = 0;
            restartProgressTimer();

        } catch (error) {
            console.error('Error loading law:', error);
            showToast('የሕግ ይዘት መጫን አልተቻለም (Failed to load content)');
        } finally {
            // Remove spinner from the dot that triggered this load
            if (loadingDot) loadingDot.classList.remove('loading');
        }
    }

    // --- Likes Action API (Toggle Like / Unlike) ---
    likeBtn.addEventListener('click', async () => {
        if (!isLoggedIn) {
            showToast(currentLang === 'en'
                ? 'Please log in to like this law'
                : 'ሕጉን ለመውደድ እባክዎ ይግቡ (Please log in to like this law)');
            openAuthModal();
            return;
        }

        try {
            const response = await fetch(`/api/sections/${currentLawId}/like`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            if (response.status === 401) {
                isLoggedIn = false;
                renderUserProgressContainer();
                showToast(currentLang === 'en'
                    ? 'Please log in to like this law'
                    : 'ሕጉን ለመውደድ እባክዎ ይግቡ (Please log in to like this law)');
                openAuthModal();
                return;
            }
            if (!response.ok) {
                throw new Error('Failed to toggle like');
            }
            const data = await response.json();

            // Update likes counter and heart status based on server response
            likesCountEl.textContent = data.likes;
            if (data.liked) {
                likeBtn.classList.add('liked');
                likeBtn.setAttribute('title', currentLang === 'en' ? 'You have liked this law' : 'ይህንን ሕግ ወድደውታል (You have liked this law)');
                showToast(currentLang === 'en' ? 'You liked this law!' : 'ሕጉን ወድደውታል! (You liked this law!)');
            } else {
                likeBtn.classList.remove('liked');
                likeBtn.setAttribute('title', currentLang === 'en' ? 'Like this law' : 'ሕጉን ውደዱ (Like this law)');
                showToast(currentLang === 'en' ? 'Like removed' : 'ምርጫዎን ሰርዘዋል (Like removed)');
            }
        } catch (error) {
            console.error('Error toggling like for section:', error);
            showToast(currentLang === 'en' ? 'Failed to update like' : 'ምርጫ ማዘመን አልተቻለም (Failed to update like)');
        }
    });

    // --- TTS Audio Playback (with Resume continuation) ---
    audioBtn.addEventListener('click', () => {
        if (isPlaying) {
            pauseAudio();
        } else if (audioIsPaused) {
            resumeAudio();
        } else if (!isLoadingAudio) {
            playAudio();
        }
    });

    async function playAudio() {
        isLoadingAudio = true;
        audioBtn.classList.add('playing');
        audioBtn.setAttribute('aria-busy', 'true');
        audioBtnText.textContent = strings().generating;
        audioIconContainer.innerHTML = ICONS.spinner;

        try {
            const audioSrc = `/api/sections/${currentLawId}/audio?lang=${currentLang}`;
            audioPlayer.src = audioSrc;

            // Preload and verify availability
            await new Promise((resolve, reject) => {
                audioPlayer.oncanplaythrough = resolve;
                audioPlayer.onerror = () => {
                    reject(new Error('Audio load failed.'));
                };
                audioPlayer.load();
            });

            isLoadingAudio = false;
            isPlaying = true;
            audioIsPaused = false;
            audioBtn.removeAttribute('aria-busy');
            audioBtnText.textContent = strings().pause;
            audioIconContainer.innerHTML = ICONS.pause;

            await audioPlayer.play();

        } catch (error) {
            console.error('Error starting audio playback:', error);
            stopAudio();
            showToast(currentLang === 'en' ? 'Audio generation failed' : 'የንባብ ድምጽ ማመንጨት አልተቻለም (Audio generation failed)');
        }
    }

    function pauseAudio() {
        audioPlayer.pause();
        isPlaying = false;
        audioIsPaused = true;

        audioBtn.classList.remove('playing');
        audioBtn.classList.add('paused');
        audioBtnText.textContent = strings().resume;
        audioIconContainer.innerHTML = ICONS.play;
    }

    async function resumeAudio() {
        isPlaying = true;
        audioIsPaused = false;

        audioBtn.classList.add('playing');
        audioBtn.classList.remove('paused');
        audioBtnText.textContent = strings().pause;
        audioIconContainer.innerHTML = ICONS.pause;

        try {
            await audioPlayer.play();
        } catch (error) {
            console.error('Error resuming audio:', error);
            stopAudio();
        }
    }

    function stopAudio() {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
        isPlaying = false;
        audioIsPaused = false;
        isLoadingAudio = false;

        audioBtn.classList.remove('playing');
        audioBtn.classList.remove('paused');
        audioBtn.removeAttribute('aria-busy');
        audioBtnText.textContent = strings().listen;
        audioIconContainer.innerHTML = ICONS.speaker;
    }

    // Reset buttons when audio finishes playing
    audioPlayer.addEventListener('ended', () => {
        stopAudio();
    });

    // --- Sharing Link Feature ---
    shareBtn.addEventListener('click', () => {
        const shareUrl = `${window.location.origin}/?law=${currentLawId}`;

        if (navigator.share) {
            navigator.share({
                title: pageTitle.textContent,
                text: `48ቱ የሥልጣን ሕጎች - Law ${currentLawId}`,
                url: shareUrl
            }).catch(() => {
                copyUrlToClipboard(shareUrl);
            });
        } else {
            copyUrlToClipboard(shareUrl);
        }
    });

    function copyUrlToClipboard(url) {
        navigator.clipboard.writeText(url).then(() => {
            showToast('የማጋሪያ ሊንክ ተገልብጧል! (Link copied to clipboard!)');
        }).catch(err => {
            console.error('Failed to copy share link:', err);
            showToast('ሊንኩን መቅዳት አልተቻለም (Failed to copy link)');
        });
    }

    // --- Reading position bar ---
    function updateReadProgress() {
        if (!readerViewport || !readProgressFill) return;
        const max = readerViewport.scrollHeight - readerViewport.clientHeight;
        const ratio = max > 0 ? Math.min(1, Math.max(0, readerViewport.scrollTop / max)) : 0;
        readProgressFill.style.transform = `scaleX(${ratio})`;
    }

    // --- Progress Viewer Bar & Active Timer / Scroll completion logic ---

    function restartProgressTimer() {
        if (progressTimer) {
            clearInterval(progressTimer);
        }

        // If law is already completed, no need to track again
        if (completedLaws.has(currentLawId)) {
            return;
        }

        progressTimer = setInterval(() => {
            if (document.hidden) return; // count only when active

            timeSpentOnLaw++;

            // If stayed long enough (equal to generated audio duration)
            if (currentAudioDuration > 0 && timeSpentOnLaw >= currentAudioDuration) {
                completeCurrentLaw("timer");
            }
        }, 1000);
    }

    // Scroll fallback tracking
    if (readerViewport) {
        readerViewport.addEventListener('scroll', () => {
            updateReadProgress();

            if (completedLaws.has(currentLawId)) return;

            // Detect if scrolled to the absolute bottom (with 50px buffer)
            const threshold = 50;
            const scrollPosition = readerViewport.scrollTop + readerViewport.clientHeight;
            const totalHeight = readerViewport.scrollHeight;

            if (totalHeight - scrollPosition <= threshold) {
                completeCurrentLaw("scroll");
            }
        }, { passive: true });
    }

    async function completeCurrentLaw(method) {
        if (completedLaws.has(currentLawId)) return;

        completedLaws.add(currentLawId);

        if (progressTimer) {
            clearInterval(progressTimer);
        }

        // Highlight completion in sidebar list link
        const sidebarLink = document.getElementById(`sidebar-law-${currentLawId}`);
        if (sidebarLink) {
            sidebarLink.classList.add('completed');
        }

        // Update progress visualizer
        updateProgressUI();
        updatePager();

        // Save progress to database if logged in
        if (isLoggedIn) {
            try {
                const response = await fetch('/api/progress/complete', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ law_id: currentLawId })
                });
                if (!response.ok) {
                    throw new Error('Failed to sync progress.');
                }
            } catch (error) {
                console.error('Error syncing completed progress:', error);
            }
        }

        // Alert user
        if (method === "timer") {
            showToast(currentLang === 'en'
                ? `Law ${currentLawId} completed by staying!`
                : `ሕግ ${currentLawId} ተጠናቋል! (Law ${currentLawId} completed by staying!)`);
        } else {
            showToast(currentLang === 'en'
                ? `Law ${currentLawId} completed by scrolling!`
                : `ሕግ ${currentLawId} ተጠናቋል! (Law ${currentLawId} completed by scrolling!)`);
        }
    }

    function updateProgressUI() {
        const fillEl = document.getElementById('progress-bar-fill');
        const textEl = document.getElementById('progress-percentage-text');
        if (!fillEl || !textEl) return;

        const totalLaws = TOTAL_LAWS;
        const completedCount = completedLaws.size;
        const percent = Math.min(100, Math.round((completedCount / totalLaws) * 100));

        fillEl.style.width = `${percent}%`;
        textEl.textContent = currentLang === 'en'
            ? `${completedCount} of ${totalLaws} laws read (${percent}%)`
            : `${percent}% ተጠናቋል (${completedCount}/${totalLaws})`;
    }

    function syncSidebarCompletion() {
        const links = document.querySelectorAll('.sidebar-link');
        links.forEach(link => {
            const linkId = parseInt(link.getAttribute('data-id'));
            if (completedLaws.has(linkId)) {
                link.classList.add('completed');
            } else {
                link.classList.remove('completed');
            }
        });
        updatePager();
    }

    // --- Authentication UI and Modal Controller ---
    const authModal = document.getElementById('auth-modal');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const tabLoginBtn = document.getElementById('tab-login-btn');
    const tabRegisterBtn = document.getElementById('tab-register-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');
    let lastFocusedBeforeModal = null;

    function openAuthModal() {
        if (!authModal) return;
        lastFocusedBeforeModal = document.activeElement;
        authModal.style.display = 'flex';
        // next frame so the opening transition runs
        requestAnimationFrame(() => authModal.classList.add('show'));
        switchAuthTab('login');
        setTimeout(() => {
            const first = document.getElementById('login-username');
            if (first) first.focus();
        }, 60);
    }

    function closeAuthModal() {
        if (!authModal) return;
        authModal.classList.remove('show');
        setTimeout(() => {
            authModal.style.display = 'none';
        }, 300);
        if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
            lastFocusedBeforeModal.focus();
        }
    }

    function switchAuthTab(tab) {
        if (!tabLoginBtn || !tabRegisterBtn || !loginForm || !registerForm) return;

        if (tab === 'login') {
            tabLoginBtn.classList.add('active');
            tabRegisterBtn.classList.remove('active');
            tabLoginBtn.setAttribute('aria-selected', 'true');
            tabRegisterBtn.setAttribute('aria-selected', 'false');
            loginForm.classList.add('active');
            registerForm.classList.remove('active');
            document.getElementById('login-error-msg').style.display = 'none';
        } else {
            tabRegisterBtn.classList.add('active');
            tabLoginBtn.classList.remove('active');
            tabRegisterBtn.setAttribute('aria-selected', 'true');
            tabLoginBtn.setAttribute('aria-selected', 'false');
            registerForm.classList.add('active');
            loginForm.classList.remove('active');
            document.getElementById('register-error-msg').style.display = 'none';
        }
    }

    if (tabLoginBtn && tabRegisterBtn) {
        tabLoginBtn.addEventListener('click', () => switchAuthTab('login'));
        tabRegisterBtn.addEventListener('click', () => {
            switchAuthTab('register');
            const first = document.getElementById('register-username');
            if (first) first.focus();
        });
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeAuthModal);
    }

    if (authModal) {
        authModal.addEventListener('click', (e) => {
            if (e.target === authModal) {
                closeAuthModal();
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && authModal.classList.contains('show')) {
                closeAuthModal();
            }
        });
    }

    function setFormBusy(form, busy) {
        const btn = form.querySelector('[type="submit"]');
        if (btn) btn.disabled = busy;
    }

    // Login Form Submit handler
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const usernameInput = document.getElementById('login-username').value;
            const passwordInput = document.getElementById('login-password').value;
            const errorMsgEl = document.getElementById('login-error-msg');

            errorMsgEl.style.display = 'none';
            setFormBusy(loginForm, true);

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username: usernameInput, password: passwordInput })
                });
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Login failed.');
                }

                isLoggedIn = true;
                username = data.username;

                // Load progress list
                const progressResponse = await fetch('/api/progress');
                if (progressResponse.ok) {
                    const progressData = await progressResponse.json();
                    completedLaws = new Set(progressData.completed_laws);
                }

                renderUserProgressContainer();
                refreshCurrentLawLikes();
                closeAuthModal();
                showToast('በስኬት ገብተዋል! (Logged in successfully!)');
                loginForm.reset();

            } catch (error) {
                errorMsgEl.textContent = error.message;
                errorMsgEl.style.display = 'block';
            } finally {
                setFormBusy(loginForm, false);
            }
        });
    }

    // Register Form Submit handler
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const usernameInput = document.getElementById('register-username').value;
            const passwordInput = document.getElementById('register-password').value;
            const errorMsgEl = document.getElementById('register-error-msg');

            errorMsgEl.style.display = 'none';
            setFormBusy(registerForm, true);

            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username: usernameInput, password: passwordInput })
                });
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Registration failed.');
                }

                isLoggedIn = true;
                username = data.username;
                completedLaws = new Set(); // Newly registered user has no progress

                renderUserProgressContainer();
                refreshCurrentLawLikes();
                closeAuthModal();
                showToast('አካውንትዎ በስኬት ተፈጥሯል! (Account created successfully!)');
                registerForm.reset();

            } catch (error) {
                errorMsgEl.textContent = error.message;
                errorMsgEl.style.display = 'block';
            } finally {
                setFormBusy(registerForm, false);
            }
        });
    }

    // Refresh likes state for the currently loaded law
    async function refreshCurrentLawLikes() {
        try {
            const response = await fetch(`/api/sections/${currentLawId}?lang=${currentLang}`);
            if (response.ok) {
                const data = await response.json();
                likesCountEl.textContent = data.likes;
                if (data.liked) {
                    likeBtn.classList.add('liked');
                    likeBtn.setAttribute('title', currentLang === 'en' ? 'You have liked this law' : 'ይህንን ሕግ ወድደውታል (You have liked this law)');
                } else {
                    likeBtn.classList.remove('liked');
                    likeBtn.setAttribute('title', currentLang === 'en' ? 'Like this law' : 'ሕጉን ውደዱ (Like this law)');
                }
            }
        } catch (e) {
            console.error('Error refreshing likes:', e);
        }
    }

    // Logout request handler
    async function handleLogout() {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            isLoggedIn = false;
            username = "";
            completedLaws = new Set();

            likeBtn.classList.remove('liked');
            likeBtn.setAttribute('title', currentLang === 'en' ? 'Like this law' : 'ሕጉን ውደዱ (Like this law)');

            renderUserProgressContainer();
            showToast('ወጥተዋል! (Logged out successfully!)');

            // Restart progress timer to disable progress logic if any
            if (progressTimer) {
                clearInterval(progressTimer);
            }
        } catch (error) {
            console.error('Logout failed:', error);
            showToast('መውጣት አልተቻለም (Failed to log out)');
        }
    }

    // Dynamic re-render of user container
    function renderUserProgressContainer() {
        const container = document.getElementById('user-progress-container');
        if (!container) return;

        if (isLoggedIn) {
            container.setAttribute('data-logged-in', 'true');
            const safeName = escapeHtml(username);
            const welcomeText = currentLang === 'en'
                ? `Welcome, <strong id="logged-username">${safeName}</strong>`
                : `እንኳን ደህና መጡ፣ <strong id="logged-username">${safeName}</strong>`;
            const logoutText = currentLang === 'en' ? 'Logout' : 'ውጣ (Logout)';
            const progressText = currentLang === 'en' ? '0% completed' : '0% ተጠናቋል';
            container.innerHTML = `
                <div class="user-info">
                    <span class="user-welcome">${welcomeText}</span>
                    <button type="button" class="logout-link-btn" id="logout-btn">${logoutText}</button>
                </div>
                <div class="progress-bar-wrapper">
                    <div class="progress-bar-tube" role="progressbar" aria-valuemin="0" aria-valuemax="${TOTAL_LAWS}" aria-valuenow="${completedLaws.size}">
                        <div class="progress-bar-fill" id="progress-bar-fill" style="width: 0%;"></div>
                    </div>
                    <span class="progress-percentage-text" id="progress-percentage-text">${progressText}</span>
                </div>
            `;
            document.getElementById('logout-btn').addEventListener('click', handleLogout);
            updateProgressUI();
        } else {
            container.setAttribute('data-logged-in', 'false');
            if (isDbAvailable) {
                const loginText = currentLang === 'en'
                    ? 'Login to save progress'
                    : 'እድገትዎን ለማስቀመጥ ይግቡ (Login to save progress)';
                container.innerHTML = `
                    <div class="anon-progress-info">
                        <button type="button" class="login-link-btn" id="open-login-btn">${loginText}</button>
                    </div>
                `;
                document.getElementById('open-login-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (window.innerWidth < 768) closeMobileSidebar();
                    openAuthModal();
                });
            } else {
                const offlineText = currentLang === 'en'
                    ? 'Progress offline'
                    : 'የውሂብ ጎታ መስመር ውጪ ነው (Progress offline)';
                container.innerHTML = `
                    <div class="anon-progress-info db-offline-msg">
                        <span class="db-offline-badge">${offlineText}</span>
                    </div>
                `;
            }
        }

        syncSidebarCompletion();

        // Restart the timer since we might have signed in/out
        restartProgressTimer();
    }

    // Fetch initial law duration to start the timer correctly on DOM load
    async function fetchInitialLawDuration(lawId) {
        try {
            const response = await fetch(`/api/sections/${lawId}?lang=${currentLang}`);
            if (response.ok) {
                const data = await response.json();
                currentAudioDuration = data.audio_duration;
                timeSpentOnLaw = 0;
                restartProgressTimer();
            }
        } catch (error) {
            console.error('Error loading initial law duration details:', error);
        }
    }

    fetchInitialLawDuration(currentLawId);
    updateReadProgress();

    // --- Toast Controller ---
    let toastTimeout;
    function showToast(message) {
        clearTimeout(toastTimeout);
        toast.textContent = message;
        toast.classList.add('show');

        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3500);
    }
});
