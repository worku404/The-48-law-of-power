document.addEventListener('DOMContentLoaded', () => {
    // --- State Variables ---
    let currentLawId = getLawIdFromUrl() || 1;
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

    // --- DOM Elements ---
    const appContainer = document.querySelector('.app-container');
    const sidebarToggle = document.getElementById('sidebar-toggle');
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
    const audioBtn = document.getElementById('audio-btn');
    const audioBtnText = document.getElementById('audio-btn-text');
    const audioIconContainer = document.getElementById('audio-icon-container');
    const audioPlayer = document.getElementById('tts-audio-player');
    const toast = document.getElementById('toast-notification');
    const readerViewport = document.getElementById('reader-viewport');
    
    const langBtn = document.getElementById('lang-btn');
    const langBtnText = document.getElementById('lang-btn-text');
    const mobileLangBtn = document.getElementById('mobile-lang-btn');
    const mobileLangBtnText = document.getElementById('mobile-lang-btn-text');
    const mobileLangLabel = document.getElementById('mobile-lang-label');
    const mobileThemeToggle = document.getElementById('mobile-theme-toggle');
    const mobileThemeLabel = document.getElementById('mobile-theme-label');
    const mobileMoonIcon = mobileThemeToggle ? mobileThemeToggle.querySelector('.mobile-moon-icon') : null;
    const mobileSunIcon = mobileThemeToggle ? mobileThemeToggle.querySelector('.mobile-sun-icon') : null;
    const headerMenuBtn = document.getElementById('header-menu-btn');
    const headerDropdown = document.getElementById('header-dropdown');

    // --- Theme & Language Management ---
    initializeTheme();
    updateLanguageUI();
    updateGlobalStaticTexts();

    function toggleLanguage() {
        currentLang = currentLang === 'en' ? 'am' : 'en';
        localStorage.setItem('lang', currentLang);
        updateLanguageUI();
        updateGlobalStaticTexts();
        loadLaw(currentLawId);
    }

    langBtn.addEventListener('click', toggleLanguage);
    if (mobileLangBtn) {
        mobileLangBtn.addEventListener('click', () => {
            toggleLanguage();
            closeHeaderDropdown();
        });
    }

    function updateLanguageUI() {
        if (currentLang === 'en') {
            langBtnText.textContent = 'አማ';
            langBtn.setAttribute('title', 'ወደ አማርኛ ቀይር (Switch to Amharic)');
            if (mobileLangBtnText) mobileLangBtnText.textContent = 'አማ';
            if (mobileLangLabel) mobileLangLabel.textContent = 'Language / ቋንቋ';
            document.documentElement.setAttribute('lang', 'en');
        } else {
            langBtnText.textContent = 'EN';
            langBtn.setAttribute('title', 'Switch to English / ወደ እንግሊዝኛ ቀይር');
            if (mobileLangBtnText) mobileLangBtnText.textContent = 'EN';
            if (mobileLangLabel) mobileLangLabel.textContent = 'ቋንቋ / Language';
            document.documentElement.setAttribute('lang', 'am');
        }
    }

    function updateGlobalStaticTexts() {
        const logoText = document.querySelector('.logo-text');
        const sidebarHeaderH2 = document.querySelector('.sidebar-header h2');
        const sidebarHeaderP = document.querySelector('.sidebar-header p');
        const shareBtnText = document.getElementById('share-btn-text');
        
        if (currentLang === 'en') {
            if (logoText) logoText.textContent = 'The 48 Laws of Power';
            if (sidebarHeaderH2) sidebarHeaderH2.textContent = 'The 48 Laws of Power';
            if (sidebarHeaderP) sidebarHeaderP.textContent = '48ቱ የሥልጣን ሕጎች';
            if (shareBtnText) shareBtnText.textContent = 'Share';
        } else {
            if (logoText) logoText.textContent = '48ቱ የሥልጣን ሕጎች';
            if (sidebarHeaderH2) sidebarHeaderH2.textContent = '48ቱ የሥልጣን ሕጎች';
            if (sidebarHeaderP) sidebarHeaderP.textContent = 'The 48 Laws of Power';
            if (shareBtnText) shareBtnText.textContent = 'አጋራ (Share)';
        }
        
        renderUserProgressContainer();
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
    }

    themeToggle.addEventListener('click', toggleTheme);
    if (mobileThemeToggle) {
        mobileThemeToggle.addEventListener('click', () => {
            toggleTheme();
            closeHeaderDropdown();
        });
    }

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
            if (mobileMoonIcon) mobileMoonIcon.style.display = 'none';
            if (mobileSunIcon) mobileSunIcon.style.display = 'block';
            if (mobileThemeLabel) mobileThemeLabel.textContent = 'Light mode';
        } else {
            moonIcon.style.display = 'block';
            sunIcon.style.display = 'none';
            if (mobileMoonIcon) mobileMoonIcon.style.display = 'block';
            if (mobileSunIcon) mobileSunIcon.style.display = 'none';
            if (mobileThemeLabel) mobileThemeLabel.textContent = 'Dark mode';
        }
    }

    function openHeaderDropdown() {
        if (!headerDropdown || !headerMenuBtn) return;
        headerDropdown.hidden = false;
        headerMenuBtn.setAttribute('aria-expanded', 'true');
    }

    function closeHeaderDropdown() {
        if (!headerDropdown || !headerMenuBtn) return;
        headerDropdown.hidden = true;
        headerMenuBtn.setAttribute('aria-expanded', 'false');
    }

    if (headerMenuBtn && headerDropdown) {
        headerMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (headerDropdown.hidden) {
                openHeaderDropdown();
            } else {
                closeHeaderDropdown();
            }
        });

        document.addEventListener('click', (e) => {
            if (!headerDropdown.hidden &&
                !headerDropdown.contains(e.target) &&
                e.target !== headerMenuBtn &&
                !headerMenuBtn.contains(e.target)) {
                closeHeaderDropdown();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !headerDropdown.hidden) {
                closeHeaderDropdown();
            }
        });
    }

    // --- Sidebar Responsiveness & Collapsing ---
    sidebarToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.innerWidth < 768) {
            appContainer.classList.toggle('sidebar-open');
        } else {
            appContainer.classList.toggle('sidebar-collapsed');
        }
    });

    // Close mobile sidebar when clicking outside or on layout content
    document.addEventListener('click', (e) => {
        if (window.innerWidth < 768 && appContainer.classList.contains('sidebar-open')) {
            const sidebar = document.getElementById('sidebar');
            const toggle = document.getElementById('sidebar-toggle');
            if (sidebar && !sidebar.contains(e.target) && e.target !== toggle) {
                appContainer.classList.remove('sidebar-open');
            }
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
                appContainer.classList.remove('sidebar-open');
            }
        });
    });

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
            viewLawLabel.textContent = data.label;
            
            if (data.title) {
                viewLawTitle.textContent = data.title;
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
                viewLawBody.innerHTML = `<p>${data.body.replace(/\n\n/g, '</p><p>')}</p>`;
                viewLawBody.classList.remove('coming-soon');
                audioBtn.removeAttribute('disabled');
                if (currentLang === 'en') {
                    audioBtn.setAttribute('title', 'Listen to this law aloud in English');
                } else {
                    audioBtn.setAttribute('title', 'Listen to this law aloud in Amharic');
                }
            } else {
                if (currentLang === 'en') {
                    viewLawBody.innerHTML = 'This law has not been translated yet. Coming soon!';
                } else {
                    viewLawBody.innerHTML = 'ይህ ክፍል ገና አልተተረጎመም። በቅርቡ ይደርሳል! (This law has not been translated yet. Coming soon!)';
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
                } else {
                    link.classList.remove('active');
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

    // --- Likes Action API ---
    likeBtn.addEventListener('click', async () => {
        if (likeBtn.classList.contains('liked')) {
            showToast(currentLang === 'en' ? 'You already liked this law' : 'ይህንን ሕግ ቀድመው ወድደውታል (You already liked this law)');
            return;
        }

        try {
            const response = await fetch(`/api/sections/${currentLawId}/like`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) {
                throw new Error('Failed to post like');
            }
            const data = await response.json();
            
            // Update likes counter
            likesCountEl.textContent = data.likes;
            likeBtn.classList.add('liked');
            likeBtn.setAttribute('title', 'You have liked this law');
            showToast(currentLang === 'en' ? 'You liked this law!' : 'ሕጉን ወድደውታል! (You liked this law!)');
        } catch (error) {
            console.error('Error liking section:', error);
            showToast(currentLang === 'en' ? 'Failed to submit like' : 'ምርጫ ማዘመን አልተቻለም (Failed to submit like)');
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
        audioBtnText.textContent = currentLang === 'en' ? 'Generating...' : 'በማዘጋጀት ላይ... (Generating...)';
        
        // Show indicator in icon
        audioIconContainer.innerHTML = `
            <svg class="loading-spinner" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3">
                <circle cx="12" cy="12" r="10" stroke-dasharray="40 10" stroke-linecap="round"></circle>
                <style>
                    .loading-spinner { animation: spin 1s linear infinite; transform-origin: center; }
                    @keyframes spin { 100% { transform: rotate(360deg); } }
                </style>
            </svg>
        `;

        try {
            const audioSrc = `/api/sections/${currentLawId}/audio?lang=${currentLang}`;
            audioPlayer.src = audioSrc;
            
            // Preload and verify availability
            await new Promise((resolve, reject) => {
                audioPlayer.oncanplaythrough = resolve;
                audioPlayer.onerror = (e) => {
                    reject(new Error('Audio load failed.'));
                };
                audioPlayer.load();
            });

            isLoadingAudio = false;
            isPlaying = true;
            audioIsPaused = false;
            audioBtnText.textContent = currentLang === 'en' ? 'Pause' : 'ቆም አድርግ (Pause)';
            
            // Update to Pause symbol SVG
            audioIconContainer.innerHTML = `
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="6" y1="4" x2="6" y2="20"></line>
                    <line x1="14" y1="4" x2="14" y2="20"></line>
                </svg>
            `;
            
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
        audioBtnText.textContent = currentLang === 'en' ? 'Resume' : 'ቀጥል (Resume)';
        
        // Show standard Play Speaker SVG
        audioIconContainer.innerHTML = `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
        `;
    }

    async function resumeAudio() {
        isPlaying = true;
        audioIsPaused = false;
        
        audioBtn.classList.add('playing');
        audioBtn.classList.remove('paused');
        audioBtnText.textContent = currentLang === 'en' ? 'Pause' : 'ቆም አድርግ (Pause)';
        
        // Show Pause symbol SVG
        audioIconContainer.innerHTML = `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="6" y1="4" x2="6" y2="20"></line>
                <line x1="14" y1="4" x2="14" y2="20"></line>
            </svg>
        `;
        
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
        audioBtnText.textContent = currentLang === 'en' ? 'Listen' : 'አድምጥ (Listen)';
        
        // Reset to standard Play Speaker SVG
        audioIconContainer.innerHTML = `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
        `;
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
            }).catch(err => {
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
            if (completedLaws.has(currentLawId)) return;

            // Detect if scrolled to the absolute bottom (with 50px buffer)
            const threshold = 50;
            const scrollPosition = readerViewport.scrollTop + readerViewport.clientHeight;
            const totalHeight = readerViewport.scrollHeight;

            if (totalHeight - scrollPosition <= threshold) {
                completeCurrentLaw("scroll");
            }
        });
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

        const totalLaws = 48;
        const completedCount = completedLaws.size;
        const percent = Math.min(100, Math.round((completedCount / totalLaws) * 100));

        fillEl.style.width = `${percent}%`;
        textEl.textContent = currentLang === 'en' 
            ? `${percent}% completed (${completedCount}/${totalLaws})`
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
    }

    // --- Authentication UI and Modal Controller ---
    const authModal = document.getElementById('auth-modal');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const tabLoginBtn = document.getElementById('tab-login-btn');
    const tabRegisterBtn = document.getElementById('tab-register-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');

    function openAuthModal() {
        if (!authModal) return;
        authModal.classList.add('show');
        authModal.style.display = 'flex';
        switchAuthTab('login');
    }

    function closeAuthModal() {
        if (!authModal) return;
        authModal.classList.remove('show');
        setTimeout(() => {
            authModal.style.display = 'none';
        }, 300);
    }

    function switchAuthTab(tab) {
        if (!tabLoginBtn || !tabRegisterBtn || !loginForm || !registerForm) return;
        
        if (tab === 'login') {
            tabLoginBtn.classList.add('active');
            tabRegisterBtn.classList.remove('active');
            loginForm.classList.add('active');
            registerForm.classList.remove('active');
            document.getElementById('login-error-msg').style.display = 'none';
        } else {
            tabRegisterBtn.classList.add('active');
            tabLoginBtn.classList.remove('active');
            registerForm.classList.add('active');
            loginForm.classList.remove('active');
            document.getElementById('register-error-msg').style.display = 'none';
        }
    }

    if (tabLoginBtn && tabRegisterBtn) {
        tabLoginBtn.addEventListener('click', () => switchAuthTab('login'));
        tabRegisterBtn.addEventListener('click', () => switchAuthTab('register'));
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
    }

    // Login Form Submit handler
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const usernameInput = document.getElementById('login-username').value;
            const passwordInput = document.getElementById('login-password').value;
            const errorMsgEl = document.getElementById('login-error-msg');

            errorMsgEl.style.display = 'none';

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
                closeAuthModal();
                showToast('በስኬት ገብተዋል! (Logged in successfully!)');
                loginForm.reset();

            } catch (error) {
                errorMsgEl.textContent = error.message;
                errorMsgEl.style.display = 'block';
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
                closeAuthModal();
                showToast('አካውንትዎ በስኬት ተፈጥሯል! (Account created successfully!)');
                registerForm.reset();

            } catch (error) {
                errorMsgEl.textContent = error.message;
                errorMsgEl.style.display = 'block';
            }
        });
    }

    // Logout request handler
    async function handleLogout() {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            isLoggedIn = false;
            username = "";
            completedLaws = new Set();

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
            const welcomeText = currentLang === 'en' 
                ? `Welcome, <strong id="logged-username">${username}</strong>` 
                : `እንኳን ደህና መጡ፣ <strong id="logged-username">${username}</strong>`;
            const logoutText = currentLang === 'en' ? 'Logout' : 'ውጣ (Logout)';
            const progressText = currentLang === 'en' ? '0% completed' : '0% ተጠናቋል';
            container.innerHTML = `
                <div class="user-info">
                    <span class="user-welcome">${welcomeText}</span>
                    <button class="logout-link-btn" id="logout-btn">${logoutText}</button>
                </div>
                <div class="progress-bar-wrapper">
                    <div class="progress-bar-tube">
                        <div class="progress-bar-fill" id="progress-bar-fill" style="width: 0%;"></div>
                    </div>
                    <span class="progress-percentage-text" id="progress-percentage-text">${progressText}</span>
                </div>
            `;
            // Attach event listener
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
                        <button class="login-link-btn" id="open-login-btn">${loginText}</button>
                    </div>
                `;
                document.getElementById('open-login-btn').addEventListener('click', openAuthModal);
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

    // Initialize Progress tracking and login state from DOM attributes rendered by Flask
    const initialProgressContainer = document.getElementById('user-progress-container');
    if (initialProgressContainer) {
        isDbAvailable = initialProgressContainer.getAttribute('data-db-available') !== 'false';
        isLoggedIn = initialProgressContainer.getAttribute('data-logged-in') === 'true';
        if (isLoggedIn) {
            const loggedUsernameEl = document.getElementById('logged-username');
            username = loggedUsernameEl ? loggedUsernameEl.textContent.trim() : "";
            const initialCompleted = JSON.parse(initialProgressContainer.getAttribute('data-completed') || '[]');
            completedLaws = new Set(initialCompleted);
            
            const currentLogoutBtn = document.getElementById('logout-btn');
            if (currentLogoutBtn) {
                currentLogoutBtn.addEventListener('click', handleLogout);
            }
            updateProgressUI();
            syncSidebarCompletion();
        } else {
            const currentOpenBtn = document.getElementById('open-login-btn');
            if (currentOpenBtn) {
                currentOpenBtn.addEventListener('click', openAuthModal);
            }
        }
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
