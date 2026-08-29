/* ============================================================
   SOS FOREST ALGERIA - Main Application JavaScript
   PWA Forest Fire Monitoring App for Algeria
   Version: 2.0
   ============================================================ */

/* ============================================================
   CONFIGURATION
   ============================================================ */

const ADMIN_EMAILS = ['biohadji@gmail.com'];
const EMAILJS_PUBLIC_KEY = 'YOUR_EMAILJS_PUBLIC_KEY';
const EMAILJS_SERVICE_ID = 'YOUR_SERVICE_ID';
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';
const APP_URL = window.location.origin + window.location.pathname;

const FIREMAP_BBOX = [-8.68, 18.97, 11.99, 37.34];
const ALGERIA_CENTER = [28.03, 1.65];
const FIREMAP_URL = 'https://geo.firemap.live/geoserver/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=FireDB%3Acombined_fire_pt_active&outputFormat=application%2Fjson';

/* ============================================================
   GLOBAL VARIABLES
   ============================================================ */

let currentUser = null;
let currentSection = 'predictions';
let map = null;
let fireMarkers = [];
let shelterMarkers = [];
let predictionsMapInstance = null;
let dangerPointsData = [];
let worldviewEONETEvents = [];
let worldviewTransferredCount = 0;
let pendingRegistration = null;
var firemapFireData = [];
var solidarityPosts = JSON.parse(localStorage.getItem('solidarityPosts') || '[]');

/* ============================================================
   1. INITIALIZATION
   ============================================================ */

function isAdmin() {
    return currentUser && currentUser.email && ADMIN_EMAILS.indexOf(currentUser.email) !== -1;
}

function getCurrentTimestamp() {
    return new Date().toISOString();
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    var day = String(d.getDate()).padStart(2, '0');
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var year = d.getFullYear();
    return year + '-' + month + '-' + day;
}

function formatTime(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    var hours = String(d.getHours()).padStart(2, '0');
    var minutes = String(d.getMinutes()).padStart(2, '0');
    return hours + ':' + minutes;
}

function formatDateTime(dateStr) {
    if (!dateStr) return '';
    return formatDate(dateStr) + ' ' + formatTime(dateStr);
}

function debounce(fn, delay) {
    var timer = null;
    return function () {
        var context = this;
        var args = arguments;
        clearTimeout(timer);
        timer = setTimeout(function () {
            fn.apply(context, args);
        }, delay);
    };
}

function sanitizeHTML(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function isValidEmail(email) {
    if (!email) return false;
    var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function isValidPhone(phone) {
    if (!phone) return false;
    var clean = phone.replace(/[\s\-]/g, '');
    var re = /^(05|06|07)\d{8}$/;
    return re.test(clean);
}

function generateId(prefix) {
    return (prefix || 'id') + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

document.addEventListener('DOMContentLoaded', function () {
    try {
        if (typeof emailjs !== 'undefined') {
            emailjs.init(EMAILJS_PUBLIC_KEY);
        }
    } catch (e) {
        console.log('EmailJS init skipped:', e.message);
    }
    checkConfirmation();
    initApp();
    initPWAInstall();
});

/* ============================================================
   PWA INSTALL
   ============================================================ */
var deferredPrompt = null;

function initPWAInstall() {
    var installBtn = document.getElementById('installBtn');
    var installBtnLogin = document.getElementById('installBtnLogin');
    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredPrompt = e;
        if (installBtn) installBtn.style.display = 'inline-flex';
        if (installBtnLogin) installBtnLogin.style.display = 'block';
    });
    window.addEventListener('appinstalled', function () {
        deferredPrompt = null;
        if (installBtn) installBtn.style.display = 'none';
        if (installBtnLogin) installBtnLogin.style.display = 'none';
        showToast('تم تثبيت التطبيق بنجاح!', 'success');
    });
}

function installPWA() {
    if (!deferredPrompt) {
        showToast('يمكنك التثبيت من قائمة المتصفح', 'info');
        return;
    }
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function (result) {
        if (result.outcome === 'accepted') {
            showToast('جاري تثبيت التطبيق...', 'info');
        }
        deferredPrompt = null;
        var installBtn = document.getElementById('installBtn');
        if (installBtn) installBtn.style.display = 'none';
    });
}

function checkConfirmation() {
    var params = new URLSearchParams(window.location.search);
    var confirmToken = params.get('confirm');
    var confirmEmailAddress = params.get('email');
    if (confirmToken && confirmEmailAddress) {
        pendingRegistration = {
            token: confirmToken,
            email: confirmEmailAddress
        };
        doConfirmEmail();
    }
}

function initApp() {
    createParticles();
    initAuthForms();
    var savedLang = localStorage.getItem('sosForestLang') || 'ar';
    changeLang(savedLang);
    var savedUser = localStorage.getItem('sosForestUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            if (!currentUser || !currentUser.email) {
                currentUser = null;
                showLogin();
            } else {
                showDashboard();
            }
        } catch (e) {
            currentUser = null;
            localStorage.removeItem('sosForestUser');
            showLogin();
        }
    } else {
        showLogin();
    }
    window.addEventListener('online', function () {
        showToast('تم الاتصال بالإنترنت', 'success');
    });
    window.addEventListener('offline', function () {
        showToast('لا يوجد اتصال بالإنترنت', 'error');
    });
}

function initAuthForms() {
    var loginForm = document.getElementById('loginForm');
    var registerForm = document.getElementById('registerForm');
    if (loginForm) {
        loginForm.removeEventListener('submit', handleLogin);
        loginForm.addEventListener('submit', handleLogin);
    }
    if (registerForm) {
        registerForm.removeEventListener('submit', handleRegister);
        registerForm.addEventListener('submit', handleRegister);
    }
}

/* ============================================================
   2. AUTH SYSTEM
   ============================================================ */

function showLogin() {
    var loginForm = document.getElementById('loginForm');
    var registerForm = document.getElementById('registerForm');
    var confirmScreen = document.getElementById('confirmScreen');
    var successScreen = document.getElementById('successScreen');
    var errorScreen = document.getElementById('errorScreen');
    if (loginForm) loginForm.style.display = 'block';
    if (registerForm) registerForm.style.display = 'none';
    if (confirmScreen) confirmScreen.style.display = 'none';
    if (successScreen) successScreen.style.display = 'none';
    if (errorScreen) errorScreen.style.display = 'none';
}

function showRegister() {
    var loginForm = document.getElementById('loginForm');
    var registerForm = document.getElementById('registerForm');
    var confirmScreen = document.getElementById('confirmScreen');
    var successScreen = document.getElementById('successScreen');
    var errorScreen = document.getElementById('errorScreen');
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'block';
    if (confirmScreen) confirmScreen.style.display = 'none';
    if (successScreen) successScreen.style.display = 'none';
    if (errorScreen) errorScreen.style.display = 'none';
}

function showConfirmScreen(email) {
    var loginForm = document.getElementById('loginForm');
    var registerForm = document.getElementById('registerForm');
    var confirmScreen = document.getElementById('confirmScreen');
    var successScreen = document.getElementById('successScreen');
    var errorScreen = document.getElementById('errorScreen');
    var confirmEmailDisplay = document.getElementById('confirmEmailDisplay');
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'none';
    if (confirmScreen) confirmScreen.style.display = 'block';
    if (successScreen) successScreen.style.display = 'none';
    if (errorScreen) errorScreen.style.display = 'none';
    if (confirmEmailDisplay) confirmEmailDisplay.textContent = email;
}

function showConfirmationSuccess(email) {
    var loginForm = document.getElementById('loginForm');
    var registerForm = document.getElementById('registerForm');
    var confirmScreen = document.getElementById('confirmScreen');
    var successScreen = document.getElementById('successScreen');
    var errorScreen = document.getElementById('errorScreen');
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'none';
    if (confirmScreen) confirmScreen.style.display = 'none';
    if (successScreen) successScreen.style.display = 'block';
    if (errorScreen) errorScreen.style.display = 'none';
}

function showConfirmationError() {
    var loginForm = document.getElementById('loginForm');
    var registerForm = document.getElementById('registerForm');
    var confirmScreen = document.getElementById('confirmScreen');
    var successScreen = document.getElementById('successScreen');
    var errorScreen = document.getElementById('errorScreen');
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'none';
    if (confirmScreen) confirmScreen.style.display = 'none';
    if (successScreen) successScreen.style.display = 'none';
    if (errorScreen) errorScreen.style.display = 'block';
    showToast('حدث خطأ في التأكيد. حاول مرة أخرى.', 'error');
}

function handleLogin(e) {
    e.preventDefault();
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    if (!email || !password) {
        showToast('يرجى ملء جميع الحقول', 'error');
        return;
    }
    if (!isValidEmail(email)) {
        showToast('البريد الإلكتروني غير صحيح', 'error');
        return;
    }
    var users = getUsers();
    var user = users.find(function (u) {
        return u.email === email && u.password === password;
    });
    if (!user && ADMIN_EMAILS.indexOf(email) !== -1 && password === 'admin123') {
        user = {
            email: email,
            phone: '0555000000',
            wilaya: 'الجزائر',
            password: password,
            confirmed: true,
            isAdmin: true,
            createdAt: getCurrentTimestamp()
        };
        var allUsers = getUsers();
        allUsers.push(user);
        saveUsers(allUsers);
    }
    if (user && ADMIN_EMAILS.indexOf(email) !== -1) {
        user.isAdmin = true;
        user.confirmed = true;
    }
    if (user && user.confirmed) {
        currentUser = user;
        localStorage.setItem('sosForestUser', JSON.stringify(user));
        showDashboard();
        showToast('مرحباً ' + user.email, 'success');
    } else if (user && !user.confirmed) {
        showToast('يرجى تأكيد بريدك الإلكتروني أولاً', 'error');
        showConfirmScreen(email);
    } else {
        showToast('البريد الإلكتروني أو كلمة المرور غير صحيحة', 'error');
    }
}

function handleRegister(e) {
    e.preventDefault();
    var email = document.getElementById('regEmail').value.trim();
    var phone = document.getElementById('regPhone').value.trim();
    var wilaya = document.getElementById('regWilaya').value;
    var password = document.getElementById('regPassword').value;
    var passwordConfirm = document.getElementById('regPasswordConfirm').value;
    if (!email || !phone || !wilaya || !password || !passwordConfirm) {
        showToast('يرجى ملء جميع الحقول', 'error');
        return;
    }
    if (!isValidEmail(email)) {
        showToast('البريد الإلكتروني غير صحيح', 'error');
        return;
    }
    var cleanPhone = phone.replace(/[\s\-]/g, '');
    if (!isValidPhone(cleanPhone)) {
        showToast('رقم الهاتف غير صحيح. مثال: 0555123456', 'error');
        return;
    }
    if (password !== passwordConfirm) {
        showToast('كلمتا المرور غير متطابقتين', 'error');
        return;
    }
    if (password.length < 6) {
        showToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
        return;
    }
    var users = getUsers();
    var exists = users.find(function (u) {
        return u.email === email;
    });
    if (exists) {
        showToast('البريد الإلكتروني مسجل مسبقاً', 'error');
        return;
    }

    var newUser = {
        email: email,
        phone: cleanPhone,
        wilaya: wilaya,
        password: password,
        confirmed: true,
        createdAt: getCurrentTimestamp()
    };
    users.push(newUser);
    saveUsers(users);

    showToast('تم التسجيل بنجاح! يمكنك تسجيل الدخول الآن', 'success');
    showLogin();
}

function doConfirmEmail() {
    if (!pendingRegistration) return;
    var pendingUsers = getPendingUsers();
    var pendingIdx = pendingUsers.findIndex(function (u) {
        return u.email === pendingRegistration.email && u.token === pendingRegistration.token;
    });
    if (pendingIdx !== -1) {
        var pending = pendingUsers[pendingIdx];
        var confirmedUser = {
            email: pending.email,
            phone: pending.phone || '',
            wilaya: pending.wilaya || '',
            password: pending.password,
            confirmed: true,
            isAdmin: ADMIN_EMAILS.indexOf(pending.email) !== -1,
            createdAt: pending.createdAt || getCurrentTimestamp()
        };
        var users = getUsers();
        users.push(confirmedUser);
        saveUsers(users);
        pendingUsers.splice(pendingIdx, 1);
        savePendingUsers(pendingUsers);
        showConfirmationSuccess(pending.email);
        showToast('تم تأكيد الحساب بنجاح! يمكنك تسجيل الدخول الآن.', 'success');
    } else {
        showConfirmationError();
    }
    pendingRegistration = null;
    window.history.replaceState({}, '', window.location.pathname);
}

function logout() {
    currentUser = null;
    localStorage.removeItem('sosForestUser');
    var dashboard = document.getElementById('dashboard');
    var loginPage = document.getElementById('loginPage');
    if (dashboard) dashboard.style.display = 'none';
    if (loginPage) loginPage.style.display = 'flex';
    showLogin();
    showToast('تم تسجيل الخروج', 'info');
}

function generateToken() {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var token = '';
    for (var i = 0; i < 32; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

function sendConfirmationEmail(toEmail, confirmLink) {
    if (typeof emailjs === 'undefined' || EMAILJS_PUBLIC_KEY === 'YOUR_EMAILJS_PUBLIC_KEY') {
        console.log('EmailJS not configured, skipping email');
        return;
    }
    try {
        var templateParams = {
            to_email: toEmail,
            confirm_link: confirmLink,
            app_name: 'SOS FOREST ALGERIA',
            message: 'مرحباً! يرجى النقر على الرابط التالي لتأكيد بريدك الإلكتروني:'
        };
        emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams)
            .then(function (response) {
                console.log('Confirmation email sent:', response.status);
            })
            .catch(function (error) {
                console.error('Email send failed:', error);
            });
    } catch (e) {
        console.error('EmailJS error:', e);
    }
}

function getUsers() {
    try {
        return JSON.parse(localStorage.getItem('sosForestUsers') || '[]');
    } catch (e) {
        return [];
    }
}

function saveUsers(users) {
    try {
        localStorage.setItem('sosForestUsers', JSON.stringify(users));
    } catch (e) {
        console.error('Failed to save users:', e);
    }
}

function getPendingUsers() {
    try {
        return JSON.parse(localStorage.getItem('sosForestPendingUsers') || '[]');
    } catch (e) {
        return [];
    }
}

function savePendingUsers(users) {
    try {
        localStorage.setItem('sosForestPendingUsers', JSON.stringify(users));
    } catch (e) {
        console.error('Failed to save pending users:', e);
    }
}

function getAllReports() {
    try {
        return JSON.parse(localStorage.getItem('fireReports') || '[]');
    } catch (e) {
        return [];
    }
}

function saveAllReports(reports) {
    try {
        localStorage.setItem('fireReports', JSON.stringify(reports));
    } catch (e) {
        console.error('Failed to save reports:', e);
    }
}

function getAllShelters() {
    try {
        return JSON.parse(localStorage.getItem('shelters') || '[]');
    } catch (e) {
        return [];
    }
}

function saveAllShelters(shelters) {
    try {
        localStorage.setItem('shelters', JSON.stringify(shelters));
    } catch (e) {
        console.error('Failed to save shelters:', e);
    }
}

function getAllSolidarityPosts() {
    try {
        return JSON.parse(localStorage.getItem('solidarityPosts') || '[]');
    } catch (e) {
        return [];
    }
}

function saveAllSolidarityPosts(posts) {
    try {
        localStorage.setItem('solidarityPosts', JSON.stringify(posts));
    } catch (e) {
        console.error('Failed to save solidarity posts:', e);
    }
}

/* ============================================================
   3. NAVIGATION
   ============================================================ */

function showDashboard() {
    var loginPage = document.getElementById('loginPage');
    var dashboard = document.getElementById('dashboard');
    if (loginPage) loginPage.style.display = 'none';
    if (dashboard) dashboard.style.display = 'block';
    initNavigation();
    updateUserInfo();
    setupAdminAccess();
    switchSection(currentSection);
}

function initNavigation() {
    var tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(function (tab) {
        tab.removeEventListener('click', handleNavClick);
        tab.addEventListener('click', handleNavClick);
    });
}

function handleNavClick(e) {
    var section = this.getAttribute('data-section');
    if (section) {
        switchSection(section);
    }
}

function switchSection(section) {
    if (section === 'admin' && !isAdmin()) {
        showToast('ليس لديك صلاحية للوصول', 'error');
        return;
    }
    if (section === 'solidarity' && !currentUser) {
        showToast('يجب تسجيل الدخول أولاً', 'error');
        return;
    }
    currentSection = section;
    updateMobileMenuActive();
    var tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(function (tab) {
        tab.classList.remove('active');
        if (tab.getAttribute('data-section') === section) {
            tab.classList.add('active');
        }
    });
    var sections = document.querySelectorAll('.section');
    sections.forEach(function (s) {
        s.style.display = 'none';
    });
    var target = document.getElementById('section-' + section);
    if (target) {
        target.style.display = 'block';
    }
    switch (section) {
        case 'predictions':
            initPredictions();
            break;
        case 'reports':
            initReportForm();
            loadAlerts();
            break;
        case 'shelters':
            initShelterForm();
            break;
        case 'solidarity':
            initSolidarity();
            break;
        case 'admin':
            initAdminPanel();
            break;
        case 'ai-assistant':
            break;
    }
}

function updateUserInfo() {
    var userNameEl = document.getElementById('userName');
    var userAvatarEl = document.getElementById('userAvatar');
    if (currentUser) {
        if (userNameEl) {
            var displayName = currentUser.email.split('@')[0];
            if (isAdmin()) {
                displayName += ' <span class="admin-badge">ADMIN</span>';
            }
            if (currentUser.wilaya) {
                displayName += ' <span class="wilaya-badge">🏛️ ' + currentUser.wilaya + '</span>';
            }
            userNameEl.innerHTML = displayName;
        }
        if (userAvatarEl) {
            var initial = currentUser.email.charAt(0).toUpperCase();
            userAvatarEl.textContent = initial;
        }
    }
}

function setupAdminAccess() {
    var adminTab = document.querySelector('[data-section="admin"]');
    if (adminTab) {
        if (isAdmin()) {
            adminTab.style.display = 'flex';
        } else {
            adminTab.style.display = 'none';
        }
    }
    var adminMobileItem = document.querySelector('.mobile-menu-item[data-section="admin"]');
    if (adminMobileItem) {
        adminMobileItem.style.display = isAdmin() ? 'flex' : 'none';
    }
}

/* ============================================================
    3b. MOBILE HAMBURGER MENU
    ============================================================ */

function toggleMobileMenu() {
    var menu = document.getElementById('mobileMenu');
    var overlay = document.getElementById('mobileMenuOverlay');
    var hamburger = document.getElementById('hamburgerBtn');
    var isOpen = menu && menu.classList.contains('active');

    if (isOpen) {
        if (menu) menu.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        if (hamburger) hamburger.classList.remove('active');
        document.body.style.overflow = '';
    } else {
        updateMobileMenuActive();
        if (menu) menu.classList.add('active');
        if (overlay) overlay.classList.add('active');
        if (hamburger) hamburger.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function mobileMenuNavigate(section) {
    switchSection(section);
    toggleMobileMenu();
}

function updateMobileMenuActive() {
    var items = document.querySelectorAll('.mobile-menu-item');
    items.forEach(function (item) {
        item.classList.remove('active');
        if (item.getAttribute('data-section') === currentSection) {
            item.classList.add('active');
        }
    });
}

/* ============================================================
   4. FIRE MAP (predictions section)
   ============================================================ */

function initPredictions() {
    loadWeatherData();
    fetchFiremapLiveData();
}

function loadWeatherData() {
    var today = getTodayFormatted();
    var yesterday = getYesterdayFormatted();
    var url = 'https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,RH2M,WS2M,PRECTOTCORR&community=AG&longitude=' + ALGERIA_CENTER[1] + '&latitude=' + ALGERIA_CENTER[0] + '&start=' + yesterday + '&end=' + today + '&format=JSON';
    fetch(url)
        .then(function (response) {
            if (!response.ok) throw new Error('Weather API error: ' + response.status);
            return response.json();
        })
        .then(function (data) {
            if (data && data.properties && data.properties.parameter) {
                var params = data.properties.parameter;
                var todayKey = today;
                var temp = params.T2M ? params.T2M[todayKey] : null;
                var humidity = params.RH2M ? params.RH2M[todayKey] : null;
                var wind = params.WS2M ? params.WS2M[todayKey] : null;
                var rain = params.PRECTOTCORR ? params.PRECTOTCORR[todayKey] : null;
                var tempEl = document.getElementById('currentTemp');
                var humEl = document.getElementById('currentHumidity');
                var windEl = document.getElementById('currentWind');
                var rainEl = document.getElementById('currentRain');
                if (tempEl) tempEl.textContent = temp !== null && temp !== -999 ? temp.toFixed(1) + '°C' : '--';
                if (humEl) humEl.textContent = humidity !== null && humidity !== -999 ? humidity.toFixed(1) + '%' : '--';
                if (windEl) windEl.textContent = wind !== null && wind !== -999 ? wind.toFixed(1) + ' m/s' : '--';
                if (rainEl) rainEl.textContent = rain !== null && rain !== -999 ? rain.toFixed(2) + ' mm' : '--';
            }
        })
        .catch(function (err) {
            console.log('Weather fetch error:', err);
            var tempEl = document.getElementById('currentTemp');
            var humEl = document.getElementById('currentHumidity');
            var windEl = document.getElementById('currentWind');
            var rainEl = document.getElementById('currentRain');
            if (tempEl) tempEl.textContent = '--';
            if (humEl) humEl.textContent = '--';
            if (windEl) windEl.textContent = '--';
            if (rainEl) rainEl.textContent = '--';
        });
}

function getTodayFormatted() {
    var d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function getYesterdayFormatted() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function fetchFiremapLiveData() {
    var cqlFilter = 'INTERSECTS(geom,ENVELOPE(' + FIREMAP_BBOX.join(',') + '))';
    var url = FIREMAP_URL + '&CQL_FILTER=' + encodeURIComponent(cqlFilter) + '&maxFeatures=500';
    fetch(url)
        .then(function (response) {
            if (!response.ok) throw new Error('Network response was not ok: ' + response.status);
            return response.json();
        })
        .then(function (data) {
            if (data && data.features && data.features.length > 0) {
                firemapFireData = data.features.filter(function (f) {
                    var props = f.properties || {};
                    var status = (props.status || '').toLowerCase().trim();
                    return status !== 'out' && status !== 'closed' && status !== '';
                });
                console.log('Loaded ' + firemapFireData.length + ' active fire points from firemap.live');
            } else {
                console.log('No firemap features found, using simulated data');
                firemapFireData = generateSimulatedFiremapData();
            }
            updateFiremapStats();
            renderFiremapPoints();
        })
        .catch(function (err) {
            console.log('Firemap fetch error, using simulated data:', err.message);
            firemapFireData = generateSimulatedFiremapData();
            updateFiremapStats();
            renderFiremapPoints();
        });
}

function refreshFiremapData() {
    var iframe = document.getElementById('firemapIframe');
    if (iframe) {
        var src = iframe.src;
        iframe.src = '';
        setTimeout(function () {
            iframe.src = src;
        }, 100);
    }
    fetchFiremapLiveData();
    showToast('تم تحديث بيانات الحرائق', 'success');
}

function generateSimulatedFiremapData() {
    var fires = [
        { lat: 36.75, lng: 3.06, name: 'الجزائر العاصمة', frp: 45.2, brightness: 312, size: 1200, confidence: 85, sat: 'VIIRS' },
        { lat: 36.28, lng: 6.26, name: 'قسنطينة', frp: 32.1, brightness: 308, size: 800, confidence: 78, sat: 'VIIRS' },
        { lat: 35.69, lng: -0.63, name: 'وهران', frp: 28.7, brightness: 305, size: 650, confidence: 72, sat: 'MODIS' },
        { lat: 36.83, lng: 10.17, name: 'near Tunis', frp: 55.3, brightness: 318, size: 2100, confidence: 92, sat: 'VIIRS' },
        { lat: 35.76, lng: 0.55, name: 'عنابة', frp: 18.9, brightness: 301, size: 400, confidence: 65, sat: 'MODIS' },
        { lat: 34.88, lng: -1.31, name: 'تلمسان', frp: 42.6, brightness: 315, size: 1500, confidence: 88, sat: 'VIIRS' },
        { lat: 36.17, lng: 5.41, name: 'سطيف', frp: 35.4, brightness: 310, size: 950, confidence: 80, sat: 'VIIRS' },
        { lat: 36.38, lng: 2.75, name: 'المدية', frp: 22.3, brightness: 303, size: 550, confidence: 70, sat: 'MODIS' },
        { lat: 36.91, lng: 7.77, name: 'قالمة', frp: 62.1, brightness: 322, size: 2800, confidence: 95, sat: 'VIIRS' },
        { lat: 35.39, lng: 1.32, name: 'تيارت', frp: 15.8, brightness: 299, size: 300, confidence: 60, sat: 'MODIS' },
        { lat: 36.06, lng: 4.75, name: 'بجاية', frp: 38.9, brightness: 313, size: 1100, confidence: 83, sat: 'VIIRS' },
        { lat: 35.85, lng: -0.08, name: 'الشلف', frp: 27.4, brightness: 307, size: 700, confidence: 75, sat: 'MODIS' },
        { lat: 36.46, lng: 7.44, name: 'جيجل', frp: 31.2, brightness: 309, size: 850, confidence: 77, sat: 'VIIRS' },
        { lat: 35.19, lng: 1.29, name: 'سيدي بلعباس', frp: 19.6, brightness: 302, size: 420, confidence: 67, sat: 'MODIS' },
        { lat: 36.71, lng: 5.08, name: 'بومرداس', frp: 24.8, brightness: 306, size: 600, confidence: 73, sat: 'VIIRS' },
        { lat: 33.80, lng: 2.87, name: 'الأغواط', frp: 12.3, brightness: 296, size: 200, confidence: 55, sat: 'MODIS' },
        { lat: 34.85, lng: 5.73, name: 'بسكرة', frp: 33.7, brightness: 311, size: 900, confidence: 79, sat: 'VIIRS' },
        { lat: 35.56, lng: 6.17, name: 'باتنة', frp: 41.2, brightness: 314, size: 1300, confidence: 86, sat: 'VIIRS' },
        { lat: 36.27, lng: 2.75, name: 'المدية الشمالية', frp: 16.5, brightness: 300, size: 350, confidence: 62, sat: 'MODIS' },
        { lat: 36.59, lng: 2.45, name: 'تيبازة', frp: 20.1, brightness: 304, size: 480, confidence: 69, sat: 'MODIS' }
    ];

    return fires.map(function (f, i) {
        var now = new Date();
        var acqDate = now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0');
        var acqTime = String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0');
        var dayNight = (now.getHours() >= 6 && now.getHours() < 18) ? 'D' : 'N';

        return {
            id: 'sim_' + i + '_' + Date.now(),
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [f.lng, f.lat]
            },
            properties: {
                name: f.name,
                frp: f.frp,
                brightness: f.brightness,
                area: f.size,
                confidence: f.confidence,
                daynight: dayNight,
                acq_date: acqDate,
                acq_time: acqTime,
                satellite: f.sat,
                instrument: f.sat === 'VIIRS' ? 'VIIRS' : 'MODIS',
                status: 'Active',
                bright_t31: f.brightness - 20,
                scan: 1,
                track: 1
            }
        };
    });
}

function updateFiremapStats() {
    var total = firemapFireData.length;
    var high = 0;
    var medium = 0;
    var low = 0;
    var byWilaya = {};
    var totalFRP = 0;
    var maxFRP = 0;
    var satellites = { VIIRS: 0, MODIS: 0, other: 0 };

    firemapFireData.forEach(function (f) {
        var props = f.properties || {};
        var frp = parseFloat(props.frp) || 0;
        var confidence = parseFloat(props.confidence) || 0;
        var sat = (props.satellite || '').toUpperCase();

        totalFRP += frp;
        if (frp > maxFRP) maxFRP = frp;

        if (sat === 'VIIRS') satellites.VIIRS++;
        else if (sat === 'MODIS') satellites.MODIS++;
        else satellites.other++;

        if (frp > 40 || confidence > 85) {
            high++;
        } else if (frp > 20 || confidence > 65) {
            medium++;
        } else {
            low++;
        }

        var coords = (f.geometry && f.geometry.coordinates) ? f.geometry.coordinates : [0, 0];
        var lat = parseFloat(coords[1]) || 0;
        var lng = parseFloat(coords[0]) || 0;
        var wilaya = getWilayaFromCoords(lat, lng);
        if (wilaya) {
            byWilaya[wilaya] = (byWilaya[wilaya] || 0) + 1;
        }
    });

    setEl('firmsCount', total);
    setEl('firmsHigh', high);
    setEl('firmsMedium', medium);
    setEl('firmsLow', low);
    setEl('statCritical', high);
    setEl('statHigh', medium);
    setEl('statLow', low);

    var avgFRP = total > 0 ? (totalFRP / total).toFixed(1) : 0;
    setEl('avgFrp', avgFRP);
    setEl('maxFrp', maxFRP.toFixed(1));
    setEl('satViirs', satellites.VIIRS);
    setEl('satModis', satellites.MODIS);

    var topWilayas = Object.entries(byWilaya).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
    var wilayaContainer = document.getElementById('topWilayas');
    if (wilayaContainer) {
        if (topWilayas.length === 0) {
            wilayaContainer.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:8px;">لا توجد بيانات</div>';
        } else {
            var html = '';
            topWilayas.forEach(function (item) {
                var pct = total > 0 ? ((item[1] / total) * 100).toFixed(0) : 0;
                html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-glass);font-size:12px;">' +
                    '<span style="color:var(--text-primary);">' + item[0] + '</span>' +
                    '<span style="color:#e74c3c;font-weight:700;">' + item[1] + ' <span style="color:var(--text-muted);font-weight:400;">(' + pct + '%)</span></span>' +
                    '</div>';
            });
            wilayaContainer.innerHTML = html;
        }
    }
}

function getWilayaFromCoords(lat, lng) {
    var wilayasApprox = [
        { name: 'أدرار', lat: 27.87, lng: -0.29 },
        { name: 'الشلف', lat: 36.17, lng: 1.33 },
        { name: 'الأغواط', lat: 33.77, lng: 2.86 },
        { name: 'أم البواقي', lat: 35.87, lng: 7.11 },
        { name: 'باتنة', lat: 35.56, lng: 6.17 },
        { name: 'بجاية', lat: 36.75, lng: 5.08 },
        { name: 'بسكرة', lat: 34.85, lng: 5.73 },
        { name: 'بشار', lat: 31.62, lng: -2.22 },
        { name: 'البليدة', lat: 36.47, lng: 2.83 },
        { name: 'البويرة', lat: 36.38, lng: 3.90 },
        { name: 'تمنراست', lat: 19.06, lng: 1.75 },
        { name: 'تبسة', lat: 35.40, lng: 8.12 },
        { name: 'تلمسان', lat: 34.88, lng: -1.31 },
        { name: 'تيارت', lat: 35.39, lng: 1.32 },
        { name: 'تيزي وزو', lat: 36.71, lng: 4.05 },
        { name: 'الجزائر', lat: 36.75, lng: 3.06 },
        { name: 'الجلفة', lat: 34.67, lng: 3.25 },
        { name: 'جيجل', lat: 36.82, lng: 5.77 },
        { name: 'سطيف', lat: 36.19, lng: 5.41 },
        { name: 'سعيدة', lat: 34.83, lng: 0.15 },
        { name: 'سكيكدة', lat: 36.88, lng: 6.91 },
        { name: 'سيدي بلعباس', lat: 35.19, lng: 1.29 },
        { name: 'عنابة', lat: 36.90, lng: 7.77 },
        { name: 'قالمة', lat: 36.46, lng: 7.43 },
        { name: 'قسنطينة', lat: 36.37, lng: 6.61 },
        { name: 'المدية', lat: 36.27, lng: 2.75 },
        { name: 'مستغانم', lat: 35.93, lng: 0.09 },
        { name: 'المسيلة', lat: 35.70, lng: 4.54 },
        { name: 'معسكر', lat: 35.40, lng: 0.14 },
        { name: 'ورقلة', lat: 31.95, lng: 5.32 },
        { name: 'وهران', lat: 35.69, lng: -0.63 },
        { name: 'البيض', lat: 33.68, lng: 2.19 },
        { name: 'إليزي', lat: 26.38, lng: 8.47 },
        { name: 'برج بوعريريج', lat: 36.07, lng: 4.76 },
        { name: 'بومرداس', lat: 36.71, lng: 3.48 },
        { name: 'الطارف', lat: 36.77, lng: 8.31 },
        { name: 'تندوف', lat: 27.67, lng: -8.13 },
        { name: 'تيسمسيلت', lat: 35.60, lng: 1.81 },
        { name: 'الوادي', lat: 33.35, lng: 6.86 },
        { name: 'خنشلة', lat: 35.43, lng: 7.14 },
        { name: 'سوق أهراس', lat: 36.29, lng: 7.53 },
        { name: 'تيبازة', lat: 36.59, lng: 2.45 },
        { name: 'ميلة', lat: 36.30, lng: 6.27 },
        { name: 'عين الدفلى', lat: 36.26, lng: 1.97 },
        { name: 'النعامة', lat: 33.26, lng: -0.31 },
        { name: 'عين تموشنت', lat: 35.30, lng: -1.14 },
        { name: 'غرداية', lat: 32.49, lng: 3.67 },
        { name: 'غليزان', lat: 35.73, lng: 0.55 },
        { name: 'تيميمون', lat: 19.70, lng: 1.88 },
        { name: 'برج باجي مختار', lat: 21.32, lng: 0.95 },
        { name: 'أولاد جلال', lat: 34.42, lng: 1.66 },
        { name: 'بني عباس', lat: 30.13, lng: 1.95 },
        { name: 'عين صلاح', lat: 26.23, lng: 0.17 },
        { name: 'تقرت', lat: 33.13, lng: 6.06 },
        { name: 'جانت', lat: 24.55,_CID': 8.17 },
        { name: 'المغير', lat: 32.18, lng: 3.69 },
        { name: 'المنيعة', lat: 32.10, lng: 5.41 }
    ];

    var minDist = Infinity;
    var closest = null;
    wilayasApprox.forEach(function (w) {
        var dlat = lat - w.lat;
        var dlng = lng - w.lng;
        var dist = Math.sqrt(dlat * dlat + dlng * dlng);
        if (dist < minDist) {
            minDist = dist;
            closest = w.name;
        }
    });
    return minDist < 2.5 ? closest : null;
}

function setEl(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
}

function renderFiremapPoints() {
    var container = document.getElementById('heatmapPoints');
    if (!container) return;
    if (firemapFireData.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>🔥 لا توجد نقاط حرائق نشطة حالياً</p><p>الوضع آمن!</p></div>';
        return;
    }
    var sortedData = firemapFireData.slice().sort(function (a, b) {
        var frpA = (a.properties && a.properties.frp) || 0;
        var frpB = (b.properties && b.properties.frp) || 0;
        return frpB - frpA;
    });
    var html = '';
    sortedData.forEach(function (f, idx) {
        var props = f.properties || {};
        var coords = (f.geometry && f.geometry.coordinates) ? f.geometry.coordinates : [0, 0];
        var lng = parseFloat(coords[0]) || 0;
        var lat = parseFloat(coords[1]) || 0;
        var wilaya = getWilayaFromCoords(lat, lng);
        var frp = parseFloat(props.frp) || 0;
        var brightness = parseFloat(props.brightness) || 0;
        var size = parseInt(props.area) || 0;
        var confidence = parseInt(props.confidence) || 0;
        var date = props.acq_date || '';
        var time = props.acq_time || '';
        var satellite = props.satellite || 'VIIRS';
        var instrument = props.instrument || 'VIIRS';
        var status = props.status || 'Active';
        var daynight = props.daynight || 'D';
        var daynightLabel = daynight === 'D' ? '☀️ نهار' : '🌙 ليل';
        var statusClass = 'status-active';
        var statusLabel = 'نشط';
        if (status.toLowerCase() === 'out' || status.toLowerCase() === 'closed') {
            statusClass = 'status-out';
            statusLabel = 'منطفئ';
        } else if (frp > 40) {
            statusClass = 'status-high';
            statusLabel = 'خطير';
        } else if (frp > 20) {
            statusClass = 'status-medium';
            statusLabel = 'متوسط';
        } else {
            statusClass = 'status-low';
            statusLabel = 'منخفض';
        }
        var gmapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng;
        var osmUrl = 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lng + '#map=15/' + lat + '/' + lng;

        html += '<div class="heatmap-point" data-index="' + idx + '" data-lat="' + lat + '" data-lng="' + lng + '">';
        html += '<div class="point-header">';
        html += '<span class="point-status ' + statusClass + '">' + statusLabel + '</span>';
        html += '<span class="point-frp">🔥 ' + frp.toFixed(1) + ' MW</span>';
        html += '</div>';
        html += '<div class="point-details">';
        html += '<div class="point-detail"><span class="label">📍 الإحداثيات:</span> <span class="value">' + lat.toFixed(4) + ', ' + lng.toFixed(4) + '</span></div>';
        html += '<div class="point-detail"><span class="label">🏛️ الولاية:</span> <span class="value">' + sanitizeHTML(wilaya) + '</span></div>';
        html += '<div class="point-detail"><span class="label">🌡️ السطوع:</span> <span class="value">' + brightness.toFixed(0) + ' K</span></div>';
        html += '<div class="point-detail"><span class="label">📐 المساحة:</span> <span class="value">' + size + ' هكتار</span></div>';
        html += '<div class="point-detail"><span class="label">✅ الثقة:</span> <span class="value">' + confidence + '%</span></div>';
        html += '<div class="point-detail"><span class="label">🛰️ القمر:</span> <span class="value">' + satellite + ' (' + instrument + ')</span></div>';
        html += '<div class="point-detail"><span class="label">☀️ الوقت:</span> <span class="value">' + daynightLabel + '</span></div>';
        html += '<div class="point-detail"><span class="label">📅 التاريخ:</span> <span class="value">' + date + '</span></div>';
        html += '<div class="point-detail"><span class="label">🕐 الوقت:</span> <span class="value">' + time + '</span></div>';
        html += '</div>';
        html += '<div class="point-actions">';
        html += '<a href="' + gmapsUrl + '" target="_blank" class="btn-gps" title="فتح في خرائط جوجل"><i class="fas fa-directions"></i> GPS</a>';
        html += '<a href="' + osmUrl + '" target="_blank" class="btn-gps btn-osm" title="فتح في OpenStreetMap"><i class="fas fa-map"></i> خريطة</a>';
        html += '<button class="btn-report-fire" onclick="reportFireAtPoint(' + lat + ',' + lng + ')" title="الإبلاغ عن هذه النقطة"><i class="fas fa-exclamation-triangle"></i> إبلاغ</button>';
        html += '</div>';
        html += '</div>';
    });
    container.innerHTML = html;
}

function reportFireAtPoint(lat, lng) {
    if (!currentUser) {
        showToast('يجب تسجيل الدخول أولاً', 'error');
        return;
    }
    switchSection('reports');
    setTimeout(function () {
        var latEl = document.getElementById('reportLat');
        var lngEl = document.getElementById('reportLng');
        var gpsCoords = document.getElementById('gpsCoords');
        if (latEl) latEl.value = lat.toFixed(6);
        if (lngEl) lngEl.value = lng.toFixed(6);
        if (gpsCoords) gpsCoords.textContent = lat.toFixed(4) + ', ' + lng.toFixed(4);
    }, 300);
}

function getWilayaFromCoords(lat, lng) {
    var wilayas = [
        { code: '01', name: 'أدرار', lat: 27.87, lng: -0.29, r: 2.0 },
        { code: '02', name: 'الشلف', lat: 36.17, lng: 1.33, r: 1.0 },
        { code: '03', name: 'الأغواط', lat: 33.80, lng: 2.87, r: 1.5 },
        { code: '04', name: 'أم البواقي', lat: 35.87, lng: 5.82, r: 1.2 },
        { code: '05', name: 'باتنة', lat: 35.56, lng: 6.17, r: 1.5 },
        { code: '06', name: 'بجاية', lat: 36.75, lng: 5.08, r: 0.8 },
        { code: '07', name: 'بسكرة', lat: 34.85, lng: 5.73, r: 1.3 },
        { code: '08', name: 'بشار', lat: 31.62, lng: -2.22, r: 2.5 },
        { code: '09', name: 'البليدة', lat: 36.47, lng: 2.83, r: 0.6 },
        { code: '10', name: 'البويرة', lat: 36.37, lng: 3.90, r: 1.0 },
        { code: '11', name: 'تمنراست', lat: 19.06, lng: 1.81, r: 4.0 },
        { code: '12', name: 'تبسة', lat: 35.40, lng: 8.12, r: 1.2 },
        { code: '13', name: 'تلمسان', lat: 34.88, lng: -1.31, r: 1.2 },
        { code: '14', name: 'تيارت', lat: 35.39, lng: 1.32, r: 1.1 },
        { code: '15', name: 'تيزي وزو', lat: 36.71, lng: 4.05, r: 0.7 },
        { code: '16', name: 'الجزائر', lat: 36.75, lng: 3.06, r: 0.7 },
        { code: '17', name: 'الجلفة', lat: 34.67, lng: 3.25, r: 1.5 },
        { code: '18', name: 'جيجل', lat: 36.82, lng: 5.77, r: 0.8 },
        { code: '19', name: 'سطيف', lat: 36.19, lng: 5.41, r: 1.2 },
        { code: '20', name: 'سعيدة', lat: 34.83, lng: 0.15, r: 1.1 },
        { code: '21', name: 'سكيكدة', lat: 36.88, lng: 6.91, r: 0.8 },
        { code: '22', name: 'سيدي بلعباس', lat: 35.19, lng: -0.63, r: 1.1 },
        { code: '23', name: 'عنابة', lat: 36.90, lng: 7.77, r: 0.6 },
        { code: '24', name: 'قالمة', lat: 36.46, lng: 7.43, r: 0.9 },
        { code: '25', name: 'قسنطينة', lat: 36.37, lng: 6.61, r: 0.7 },
        { code: '26', name: 'المدية', lat: 36.27, lng: 2.75, r: 1.0 },
        { code: '27', name: 'مستغانم', lat: 35.93, lng: 0.09, r: 1.0 },
        { code: '28', name: 'المسيلة', lat: 35.70, lng: 4.54, r: 1.2 },
        { code: '29', name: 'معسكر', lat: 35.40, lng: 0.14, r: 1.1 },
        { code: '30', name: 'ورقلة', lat: 31.95, lng: 5.33, r: 2.5 },
        { code: '31', name: 'وهران', lat: 35.69, lng: -0.63, r: 0.9 },
        { code: '32', name: 'البيض', lat: 33.68, lng: 2.19, r: 2.0 },
        { code: '33', name: 'إليزي', lat: 26.48, lng: 8.17, r: 2.5 },
        { code: '34', name: 'برج بوعريريج', lat: 36.07, lng: 4.76, r: 1.0 },
        { code: '35', name: 'بومرداس', lat: 36.75, lng: 3.48, r: 0.7 },
        { code: '36', name: 'الطارف', lat: 36.77, lng: 8.31, r: 0.9 },
        { code: '37', name: 'تندوف', lat: 27.67, lng: -8.14, r: 3.0 },
        { code: '38', name: 'تيسمسيلت', lat: 35.61, lng: 1.81, r: 1.0 },
        { code: '39', name: 'الوادي', lat: 33.35, lng: 6.86, r: 1.3 },
        { code: '40', name: 'خنشلة', lat: 35.44, lng: 7.14, r: 1.1 },
        { code: '41', name: 'سوق أهراس', lat: 36.29, lng: 7.53, r: 0.9 },
        { code: '42', name: 'تيبازة', lat: 36.59, lng: 2.45, r: 0.6 },
        { code: '43', name: 'ميلة', lat: 36.30, lng: 6.27, r: 0.8 },
        { code: '44', name: 'النعامة', lat: 33.26, lng: -1.17, r: 1.5 },
        { code: '45', name: 'عين تموشنت', lat: 35.30, lng: -1.14, r: 1.0 },
        { code: '46', name: 'غرداية', lat: 32.49, lng: 3.67, r: 2.0 },
        { code: '47', name: 'غليزان', lat: 35.73, lng: 0.55, r: 1.0 },
        { code: '48', name: 'تيميمون', lat: 23.30, lng: 5.48, r: 3.0 },
        { code: '49', name: 'برج باجي مختار', lat: 27.85, lng: 8.12, r: 2.5 },
        { code: '50', name: 'أولاد جلال', lat: 34.42, lng: 5.67, r: 1.3 },
        { code: '51', name: 'بني عباس', lat: 30.13, lng: -2.17, r: 2.5 },
        { code: '52', name: 'توقرت', lat: 28.43, lng: 5.87, r: 1.8 },
        { code: '53', name: 'جانت', lat: 24.55, lng: 9.47, r: 3.0 },
        { code: '54', name: 'المغير', lat: 33.94, lng: 5.92, r: 1.0 },
        { code: '55', name: 'المنيعة', lat: 34.74, lng: 2.24, r: 1.2 },
        { code: '56', name: 'ورقلة', lat: 31.95, lng: 5.33, r: 2.5 },
        { code: '57', name: 'تيبازة', lat: 36.59, lng: 2.45, r: 0.6 },
        { code: '58', name: 'ال.Read', lat: 36.75, lng: 3.06, r: 0.8 }
    ];

    var bestMatch = 'غير معروف';
    var bestDist = Infinity;
    var bestRadius = Infinity;

    wilayas.forEach(function (w) {
        var dist = Math.sqrt(Math.pow(lat - w.lat, 2) + Math.pow(lng - w.lng, 2));
        if (dist < w.r && dist < bestDist) {
            bestDist = dist;
            bestMatch = w.name + ' (' + w.code + ')';
            bestRadius = w.r;
        }
    });

    if (bestMatch === 'غير معروف') {
        var closestWilaya = null;
        var closestDist = Infinity;
        wilayas.forEach(function (w) {
            var dist = Math.sqrt(Math.pow(lat - w.lat, 2) + Math.pow(lng - w.lng, 2));
            if (dist < closestDist) {
                closestDist = dist;
                closestWilaya = w;
            }
        });
        if (closestWilaya) {
            bestMatch = closestWilaya.name + ' (قريبة)';
        }
    }

    return bestMatch;
}

/* ============================================================
   5. REPORTS SECTION
   ============================================================ */

function initReportForm() {
    var form = document.getElementById('reportForm');
    var gpsBtn = document.getElementById('gpsBtn');
    var imageInput = document.getElementById('reportImage');
    if (form) {
        form.removeEventListener('submit', handleReportSubmit);
        form.addEventListener('submit', handleReportSubmit);
    }
    if (gpsBtn) {
        gpsBtn.removeEventListener('click', getCurrentPosition);
        gpsBtn.addEventListener('click', getCurrentPosition);
    }
    if (imageInput) {
        imageInput.removeEventListener('change', handleImagePreview);
        imageInput.addEventListener('change', handleImagePreview);
    }
}

function getCurrentPosition() {
    var gpsCoords = document.getElementById('gpsCoords');
    var gpsBtn = document.getElementById('gpsBtn');
    if (gpsCoords) gpsCoords.textContent = 'جاري تحديد الموقع...';
    if (gpsBtn) {
        gpsBtn.disabled = true;
        gpsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري...';
    }
    if (!navigator.geolocation) {
        showToast('المتصفح لا يدعم خدمة تحديد الموقع', 'error');
        if (gpsCoords) gpsCoords.textContent = 'غير مدعوم';
        if (gpsBtn) {
            gpsBtn.disabled = false;
            gpsBtn.innerHTML = '<i class="fas fa-location-arrow"></i> GPS';
        }
        return;
    }
    navigator.geolocation.getCurrentPosition(
        function (position) {
            var lat = position.coords.latitude;
            var lng = position.coords.longitude;
            var accuracy = position.coords.accuracy;
            var latEl = document.getElementById('reportLat');
            var lngEl = document.getElementById('reportLng');
            if (latEl) latEl.value = lat.toFixed(6);
            if (lngEl) lngEl.value = lng.toFixed(6);
            if (gpsCoords) gpsCoords.textContent = lat.toFixed(4) + ', ' + lng.toFixed(4) + ' (دقة: ' + accuracy.toFixed(0) + 'م)';
            if (gpsBtn) {
                gpsBtn.disabled = false;
                gpsBtn.innerHTML = '<i class="fas fa-location-arrow"></i> GPS';
            }
            showToast('تم تحديد الموقع بنجاح', 'success');
        },
        function (error) {
            var msg = 'فشل تحديد الموقع';
            if (error.code === 1) msg = 'تم رفض إذن الموقع. يرجى تفعيله من إعدادات المتصفح';
            else if (error.code === 2) msg = 'الموقع غير متاح حالياً';
            else if (error.code === 3) msg = 'انتهت مهلة تحديد الموقع';
            showToast(msg, 'error');
            if (gpsCoords) gpsCoords.textContent = msg;
            if (gpsBtn) {
                gpsBtn.disabled = false;
                gpsBtn.innerHTML = '<i class="fas fa-location-arrow"></i> GPS';
            }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

function handleReportSubmit(e) {
    e.preventDefault();
    var phone = document.getElementById('reportPhone').value.trim();
    var wilaya = document.getElementById('reportWilaya').value;
    var municipality = document.getElementById('reportMunicipality').value.trim();
    var neighborhood = document.getElementById('reportNeighborhood').value.trim();
    var lat = document.getElementById('reportLat').value;
    var lng = document.getElementById('reportLng').value;
    var date = document.getElementById('reportDate').value;
    var time = document.getElementById('reportTime').value;
    var imagePreview = document.getElementById('reportImagePreview');
    var image = (imagePreview && imagePreview.src && imagePreview.style.display !== 'none') ? imagePreview.src : '';

    if (!phone || !wilaya || !neighborhood || !lat || !lng) {
        showToast('يرجى ملء جميع الحقول المطلوبة', 'error');
        return;
    }
    if (!isValidPhone(phone)) {
        showToast('رقم الهاتف غير صحيح', 'error');
        return;
    }

    var report = {
        id: generateId('report'),
        phone: phone,
        wilaya: wilaya,
        municipality: sanitizeHTML(municipality),
        neighborhood: sanitizeHTML(neighborhood),
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        image: image,
        date: date,
        time: time,
        status: 'active',
        userEmail: currentUser ? currentUser.email : '',
        userName: currentUser ? currentUser.email.split('@')[0] : 'مجهول',
        createdAt: getCurrentTimestamp()
    };

    var reports = getAllReports();
    reports.unshift(report);
    saveAllReports(reports);

    document.getElementById('reportForm').reset();
    var preview = document.getElementById('reportImagePreview');
    if (preview) {
        preview.src = '';
        preview.style.display = 'none';
    }
    var gpsCoords = document.getElementById('gpsCoords');
    if (gpsCoords) gpsCoords.textContent = '';
    var rd = document.getElementById('reportDate');
    var rt = document.getElementById('reportTime');
    if (rd) rd.valueAsDate = new Date();
    if (rt) {
        var now = new Date();
        rt.value = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    }

    showToast('تم إرسال البلاغ بنجاح! شكراً لك على مساعدتنا', 'success');
    loadAlerts();
}

function handleImagePreview(e) {
    var file = e.target.files[0];
    var preview = document.getElementById('reportImagePreview');
    if (!file || !preview) return;

    if (file.size > 5 * 1024 * 1024) {
        showToast('حجم الصورة يجب أن يكون أقل من 5 ميجا', 'error');
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast('يرجى اختيار ملف صورة فقط', 'error');
        return;
    }

    var reader = new FileReader();
    reader.onload = function (ev) {
        preview.src = ev.target.result;
        preview.style.display = 'block';
    };
    reader.onerror = function () {
        showToast('فشل تحميل الصورة', 'error');
    };
    reader.readAsDataURL(file);
}

function loadAlerts() {
    var container = document.getElementById('alertsList');
    if (!container) return;
    var reports = getAllReports();

    if (reports.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>📋 لا توجد بلاغات حالياً</p><p>كن أول من يُبلّغ عن حريق!</p></div>';
        return;
    }

    var html = '';
    reports.forEach(function (report) {
        var statusClass = report.status === 'active' ? 'status-active' : 'status-resolved';
        var statusText = report.status === 'active' ? 'نشط' : 'تم الحل';
        var imageHtml = report.image ? '<img src="' + report.image + '" class="report-image" alt="صورة البلاغ" loading="lazy">' : '';
        var gmapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + report.lat + ',' + report.lng;

        html += '<div class="alert-card ' + statusClass + '" data-id="' + report.id + '">';
        html += '<div class="alert-header">';
        html += '<span class="alert-status ' + statusClass + '">' + statusText + '</span>';
        html += '<span class="alert-time">' + getTimeAgo(report.createdAt) + '</span>';
        html += '</div>';
        html += '<div class="alert-body">';
        html += '<div class="alert-detail">🏛️ الولاية: <strong>' + sanitizeHTML(report.wilaya) + '</strong></div>';
        if (report.municipality) html += '<div class="alert-detail">🏘️ البلدية: ' + sanitizeHTML(report.municipality) + '</div>';
        if (report.neighborhood) html += '<div class="alert-detail">📍 الحي: ' + sanitizeHTML(report.neighborhood) + '</div>';
        html += '<div class="alert-detail">📱 الهاتف: <a href="tel:' + report.phone + '">' + report.phone + '</a></div>';
        html += '<div class="alert-detail">📍 الإحداثيات: ' + report.lat.toFixed(4) + ', ' + report.lng.toFixed(4) + '</div>';
        if (report.date) html += '<div class="alert-detail">📅 التاريخ: ' + report.date + '</div>';
        if (report.time) html += '<div class="alert-detail">🕐 الوقت: ' + report.time + '</div>';
        html += '<div class="alert-detail">👤 المُبلّغ: ' + sanitizeHTML(report.userName || report.userEmail) + '</div>';
        html += imageHtml;
        html += '</div>';
        html += '<div class="alert-actions">';
        html += '<a href="' + gmapsUrl + '" target="_blank" class="btn-gps"><i class="fas fa-directions"></i> GPS</a>';
        if (currentUser && currentUser.email === report.userEmail) {
            html += '<button class="btn-resolve" onclick="resolveReport(\'' + report.id + '\')"><i class="fas fa-check"></i> تم الحل</button>';
        }
        html += '</div>';
        html += '</div>';
    });
    container.innerHTML = html;
    // Update report count badge
    var badge = document.getElementById('reportCount');
    if (badge) {
        var activeReports = reports.filter(function (r) { return r.status === 'active'; });
        badge.textContent = activeReports.length;
    }
}

function resolveReport(reportId) {
    var reports = getAllReports();
    var report = reports.find(function (r) { return r.id === reportId; });
    if (report) {
        report.status = 'resolved';
        report.resolvedAt = getCurrentTimestamp();
        saveAllReports(reports);
        loadAlerts();
        showToast('تم تحديث حالة البلاغ', 'success');
    }
}

function getTimeAgo(dateString) {
    if (!dateString) return '';
    var now = new Date();
    var date = new Date(dateString);
    var seconds = Math.floor((now - date) / 1000);

    if (seconds < 0) return 'الآن';
    if (seconds < 60) return 'الآن';
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return 'منذ ' + minutes + ' دقيقة';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return 'منذ ' + hours + ' ساعة';
    var days = Math.floor(hours / 24);
    if (days < 7) return 'منذ ' + days + ' يوم';
    if (days < 30) return 'منذ ' + Math.floor(days / 7) + ' أسبوع';
    var months = Math.floor(days / 30);
    if (months < 12) return 'منذ ' + months + ' شهر';
    var years = Math.floor(months / 12);
    return 'منذ ' + years + ' سنة';
}

/* ============================================================
   6. SHELTERS SECTION
   ============================================================ */

function initShelterForm() {
    var form = document.getElementById('shelterForm');
    var gpsBtn = document.getElementById('shelterGpsBtn');
    var imageInput = document.getElementById('shelterImage');
    if (form) {
        form.removeEventListener('submit', handleShelterSubmit);
        form.addEventListener('submit', handleShelterSubmit);
    }
    if (gpsBtn) {
        gpsBtn.removeEventListener('click', getShelterPosition);
        gpsBtn.addEventListener('click', getShelterPosition);
    }
    if (imageInput) {
        imageInput.removeEventListener('change', handleShelterImagePreview);
        imageInput.addEventListener('change', handleShelterImagePreview);
    }
}

function getShelterPosition() {
    var coordsEl = document.getElementById('shelterGpsCoords');
    var gpsBtn = document.getElementById('shelterGpsBtn');
    if (coordsEl) coordsEl.textContent = 'جاري تحديد الموقع...';
    if (gpsBtn) {
        gpsBtn.disabled = true;
        gpsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري...';
    }
    if (!navigator.geolocation) {
        showToast('المتصفح لا يدعم خدمة تحديد الموقع', 'error');
        if (coordsEl) coordsEl.textContent = 'غير مدعوم';
        if (gpsBtn) {
            gpsBtn.disabled = false;
            gpsBtn.innerHTML = '<i class="fas fa-location-arrow"></i> GPS';
        }
        return;
    }
    navigator.geolocation.getCurrentPosition(
        function (position) {
            var lat = position.coords.latitude;
            var lng = position.coords.longitude;
            var accuracy = position.coords.accuracy;
            var latEl = document.getElementById('shelterLat');
            var lngEl = document.getElementById('shelterLng');
            if (latEl) latEl.value = lat.toFixed(6);
            if (lngEl) lngEl.value = lng.toFixed(6);
            if (coordsEl) coordsEl.textContent = lat.toFixed(4) + ', ' + lng.toFixed(4) + ' (دقة: ' + accuracy.toFixed(0) + 'م)';
            if (gpsBtn) {
                gpsBtn.disabled = false;
                gpsBtn.innerHTML = '<i class="fas fa-location-arrow"></i> GPS';
            }
            showToast('تم تحديد موقع المأوى بنجاح', 'success');
        },
        function (error) {
            var msg = 'فشل تحديد الموقع';
            if (error.code === 1) msg = 'تم رفض إذن الموقع';
            else if (error.code === 2) msg = 'الموقع غير متاح';
            else if (error.code === 3) msg = 'انتهت المهلة';
            showToast(msg, 'error');
            if (coordsEl) coordsEl.textContent = msg;
            if (gpsBtn) {
                gpsBtn.disabled = false;
                gpsBtn.innerHTML = '<i class="fas fa-location-arrow"></i> GPS';
            }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

function handleShelterSubmit(e) {
    e.preventDefault();
    var name = document.getElementById('shelterName').value.trim();
    var wilaya = document.getElementById('shelterWilaya').value;
    var municipality = document.getElementById('shelterMunicipality').value.trim();
    var phone = document.getElementById('shelterPhone').value.trim();
    var lat = document.getElementById('shelterLat').value;
    var lng = document.getElementById('shelterLng').value;
    var imagePreview = document.getElementById('shelterImagePreview');
    var image = (imagePreview && imagePreview.src && imagePreview.style.display !== 'none') ? imagePreview.src : '';

    if (!name || !wilaya || !lat || !lng) {
        showToast('يرجى ملء جميع الحقول المطلوبة', 'error');
        return;
    }

    if (phone && !isValidPhone(phone)) {
        showToast('رقم الهاتف غير صحيح', 'error');
        return;
    }

    var shelter = {
        id: generateId('shelter'),
        name: sanitizeHTML(name),
        wilaya: wilaya,
        municipality: sanitizeHTML(municipality),
        phone: phone,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        image: image,
        userEmail: currentUser ? currentUser.email : '',
        userName: currentUser ? currentUser.email.split('@')[0] : 'مجهول',
        status: 'active',
        createdAt: getCurrentTimestamp()
    };

    var shelters = getAllShelters();
    shelters.unshift(shelter);
    saveAllShelters(shelters);

    document.getElementById('shelterForm').reset();
    var preview = document.getElementById('shelterImagePreview');
    if (preview) {
        preview.src = '';
        preview.style.display = 'none';
    }
    var coordsEl = document.getElementById('shelterGpsCoords');
    if (coordsEl) coordsEl.textContent = '';

    showToast('تم تسجيل المأوى بنجاح!', 'success');
}

function handleShelterImagePreview(e) {
    var file = e.target.files[0];
    var preview = document.getElementById('shelterImagePreview');
    if (!file || !preview) return;

    if (file.size > 5 * 1024 * 1024) {
        showToast('حجم الصورة يجب أن يكون أقل من 5 ميجا', 'error');
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast('يرجى اختيار ملف صورة فقط', 'error');
        return;
    }

    var reader = new FileReader();
    reader.onload = function (ev) {
        preview.src = ev.target.result;
        preview.style.display = 'block';
    };
    reader.onerror = function () {
        showToast('فشل تحميل الصورة', 'error');
    };
    reader.readAsDataURL(file);
}

/* ============================================================
   7. SOLIDARITY SECTION
   ============================================================ */

function initSolidarity() {
    loadSolidarityPosts();
    initSolidarityForm();
}

function initSolidarityForm() {
    var form = document.getElementById('solidarityForm');
    var imageInput = document.getElementById('solidarityImage');
    if (form) {
        form.removeEventListener('submit', handleSolidaritySubmit);
        form.addEventListener('submit', handleSolidaritySubmit);
    }
    if (imageInput) {
        imageInput.removeEventListener('change', handleSolidarityImagePreview);
        imageInput.addEventListener('change', handleSolidarityImagePreview);
    }
}

function handleSolidaritySubmit(e) {
    e.preventDefault();
    publishSolidarityPost();
}

function publishSolidarityPost() {
    var orgName = document.getElementById('solidarityOrgName').value.trim();
    var type = document.getElementById('solidarityType').value;
    var wilaya = document.getElementById('solidarityWilaya').value;
    var description = document.getElementById('solidarityDescription').value.trim();
    var phone = document.getElementById('solidarityPhone').value.trim();
    var whatsapp = document.getElementById('solidarityWhatsApp').value.trim();
    var facebook = document.getElementById('solidarityFacebook').value.trim();
    var startDate = document.getElementById('solidarityStartDate').value;
    var endDate = document.getElementById('solidarityEndDate').value;
    var imagePreview = document.getElementById('solidarityImagePreview');
    var image = (imagePreview && imagePreview.src && imagePreview.style.display !== 'none') ? imagePreview.src : '';

    if (!orgName || !type || !wilaya || !description) {
        showToast('يرجى ملء جميع الحقول المطلوبة', 'error');
        return;
    }

    var typeLabels = {
        'donation': '💰 جمع التبرعات',
        'relief': '📦 عمليات الإغاثة',
        'solidarity': '🤲 حملات التضامن',
        'medical': '🏥 مساعدة طبية',
        'shelter': '🏕️ إيواء المتضررين',
        'food': '🍎 توزيع الغذاء',
        'other': '📋 أخرى'
    };

    var post = {
        id: generateId('solidarity'),
        orgName: sanitizeHTML(orgName),
        type: type,
        typeLabel: typeLabels[type] || type,
        wilaya: wilaya,
        description: sanitizeHTML(description),
        phone: phone,
        whatsapp: whatsapp.replace(/[^0-9]/g, ''),
        facebook: facebook,
        startDate: startDate,
        endDate: endDate,
        image: image,
        userEmail: currentUser ? currentUser.email : '',
        userName: currentUser ? currentUser.email.split('@')[0] : 'مجهول',
        status: 'active',
        createdAt: getCurrentTimestamp()
    };

    solidarityPosts = getAllSolidarityPosts();
    solidarityPosts.unshift(post);
    saveAllSolidarityPosts(solidarityPosts);

    document.getElementById('solidarityForm').reset();
    var preview = document.getElementById('solidarityImagePreview');
    if (preview) {
        preview.src = '';
        preview.style.display = 'none';
    }

    showToast('تم نشر المنشور بنجاح!', 'success');
    loadSolidarityPosts();
}

function handleSolidarityImagePreview(e) {
    var file = e.target.files[0];
    var preview = document.getElementById('solidarityImagePreview');
    if (!file || !preview) return;

    if (file.size > 5 * 1024 * 1024) {
        showToast('حجم الصورة يجب أن يكون أقل من 5 ميجا', 'error');
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast('يرجى اختيار ملف صورة فقط', 'error');
        return;
    }

    var reader = new FileReader();
    reader.onload = function (ev) {
        preview.src = ev.target.result;
        preview.style.display = 'block';
    };
    reader.onerror = function () {
        showToast('فشل تحميل الصورة', 'error');
    };
    reader.readAsDataURL(file);
}

function loadSolidarityPosts() {
    var container = document.getElementById('solidarityList');
    if (!container) return;

    solidarityPosts = getAllSolidarityPosts();

    if (solidarityPosts.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>❤️ لا توجد منشورات تضامن حالياً</p><p>كن أول من ينشر منشور تضامن!</p></div>';
        return;
    }

    var html = '';
    solidarityPosts.forEach(function (post) {
        var imageHtml = post.image ? '<img src="' + post.image + '" class="solidarity-image" alt="صورة" loading="lazy">' : '';
        var typeIcon = '❤️';
        if (post.type === 'donation') typeIcon = '💰';
        else if (post.type === 'volunteer') typeIcon = '🤝';
        else if (post.type === 'shelter') typeIcon = '🏠';

        html += '<div class="solidarity-card">';
        html += '<div class="solidarity-header">';
        html += '<span class="solidarity-type ' + post.type + '">' + typeIcon + ' ' + post.typeLabel + '</span>';
        html += '<span class="solidarity-time">' + getTimeAgo(post.createdAt) + '</span>';
        html += '</div>';
        html += '<div class="solidarity-org">' + post.orgName + '</div>';
        html += '<div class="solidarity-body">';
        html += '<p class="solidarity-desc">' + post.description + '</p>';
        html += '<div class="solidarity-details">';
        html += '<div class="detail-item">🏛️ الولاية: ' + sanitizeHTML(post.wilaya) + '</div>';
        if (post.startDate) html += '<div class="detail-item">📅 يبدأ: ' + post.startDate + '</div>';
        if (post.endDate) html += '<div class="detail-item">📅 ينتهي: ' + post.endDate + '</div>';
        html += '</div>';
        html += imageHtml;
        html += '</div>';
        html += '<div class="solidarity-contact">';
        if (post.phone) {
            html += '<a href="tel:' + post.phone + '" class="contact-btn phone"><i class="fas fa-phone"></i> ' + post.phone + '</a>';
        }
        if (post.whatsapp) {
            html += '<a href="https://wa.me/' + post.whatsapp + '" target="_blank" class="contact-btn whatsapp"><i class="fab fa-whatsapp"></i> WhatsApp</a>';
        }
        if (post.facebook) {
            html += '<a href="' + post.facebook + '" target="_blank" class="contact-btn facebook"><i class="fab fa-facebook"></i> Facebook</a>';
        }
        html += '</div>';
        html += '<div class="solidarity-poster">';
        html += '<span class="poster-info">نشر بواسطة: ' + sanitizeHTML(post.userName || post.userEmail) + '</span>';
        html += '</div>';
        html += '</div>';
    });
    container.innerHTML = html;
}

/* ============================================================
   8. AI ASSISTANT — Real API-powered
   ============================================================ */

var AI_API_KEY = localStorage.getItem('sosForestAIKey') || '';
var AI_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

function setAiApiKey(key) {
    AI_API_KEY = key.trim();
    localStorage.setItem('sosForestAIKey', AI_API_KEY);
    showToast(AI_API_KEY ? 'تم حفظ مفتاح API' : 'تم إزالة مفتاح API', 'success');
}

function sendAiMessage() {
    var input = document.getElementById('aiChatInput');
    if (!input) return;
    var question = input.value.trim();
    if (!question) return;
    addAiMessage(question, 'user');
    input.value = '';
    input.focus();
    showAiTyping();
    getAiResponse(question).then(function (response) {
        hideAiTyping();
        addAiMessage(response, 'ai');
    });
}

function aiQuickQuestion(question) {
    addAiMessage(question, 'user');
    showAiTyping();
    getAiResponse(question).then(function (response) {
        hideAiTyping();
        addAiMessage(response, 'ai');
    });
}

function handleAiKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAiMessage();
    }
}

function showAiTyping() {
    var container = document.getElementById('aiChatMessages');
    if (!container) return;
    var typing = document.createElement('div');
    typing.className = 'ai-message ai';
    typing.id = 'aiTyping';
    typing.innerHTML = '<div class="message-content ai-message-bubble">' +
        '<div class="ai-avatar">🤖</div>' +
        '<div class="ai-text typing-dots"><span></span><span></span><span></span></div>' +
        '</div>';
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;
}

function hideAiTyping() {
    var typing = document.getElementById('aiTyping');
    if (typing) typing.remove();
}

function addAiMessage(text, type) {
    var container = document.getElementById('aiChatMessages');
    if (!container) return;
    var msgDiv = document.createElement('div');
    msgDiv.className = 'ai-message ' + type;
    var time = new Date().toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' });
    if (type === 'user') {
        msgDiv.innerHTML = '<div class="message-content user-message">' +
            '<p>' + sanitizeHTML(text) + '</p>' +
            '<span class="message-time">' + time + '</span>' +
            '</div>';
    } else {
        msgDiv.innerHTML = '<div class="message-content ai-message-bubble">' +
            '<div class="ai-avatar">🤖</div>' +
            '<div class="ai-text">' + text + '</div>' +
            '<span class="message-time">' + time + '</span>' +
            '</div>';
    }
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

async function getAiResponse(question) {
    var q = question.toLowerCase().trim();

    if (AI_API_KEY) {
        try {
            var systemPrompt = 'أنت مساعد ذكي متخصص في مراقبة حرائق الغابات في الجزائر. أنت تعمل في تطبيق "SOS FOREST ALGERIA". ' +
                'أجب على الأسئلة بدقة باستخدام معرفتك العامة والمعلومات الرسمية. ' +
                'إذا كان السؤال يتعلق بالجزائر، استخدم معلومات دقيقة عن Algeria. ' +
                'أجب بلغة المستخدم (عربي أو فرنسي أو إنجليزي). ' +
                'كن مفيداً ومختصاً ودقيقاً.';

            var response = await fetch(AI_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + AI_API_KEY
                },
                body: JSON.stringify({
                    model: 'deepseek/deepseek-chat-v3-0324:free',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: question }
                    ],
                    max_tokens: 1024,
                    temperature: 0.7
                })
            });

            if (response.ok) {
                var data = await response.json();
                if (data.choices && data.choices[0]) {
                    return data.choices[0].message.content.replace(/\n/g, '<br>');
                }
            }
        } catch (err) {
            console.log('AI API error, falling back to local:', err);
        }
    }

    return getLocalAiResponse(question);
}

function getLocalAiResponse(question) {
    var q = question.toLowerCase().trim();
    var reports = getAllReports();
    var shelters = getAllShelters();
    var posts = getAllSolidarityPosts();
    var activeFires = firemapFireData.length;

    if (q.includes('طوارئ') || q.includes('رقم') || q.includes('اتصال') || q.includes('نجدة') || q.includes('numéro') || q.includes('urgence') || q.includes('numeros')) {
        return '🚨 <strong>أرقام الطوارئ في الجزائر:</strong><br><br>' +
            '🔥 الإطفاء (الحماية المدنية): <strong>14</strong><br>' +
            '👮 الأمن والشرطة: <strong>17</strong><br>' +
            '🚑 الإسعاف والطوارئ: <strong>1055</strong><br>' +
            '🛡️ الحماية المدنية: <strong>1414</strong><br>' +
            '📞 خط نجدة الطفل: <strong>116</strong><br><br>' +
            '⚠️ <strong>اتصل فوراً عند رؤية حريق!</strong> لا تحاول الإطفاء وحدك.';
    }

    if (q.includes('إبلاغ') || q.includes('بلاغ') || q.includes('report') || q.includes('signaler') || q.includes('حريق') || q.includes('fire')) {
        return '📋 <strong>كيفية الإبلاغ عن حريق غابات:</strong><br><br>' +
            '1️⃣ انتقل إلى قسم "البلاغات" من القائمة<br>' +
            '2️⃣ أدخل بياناتك (رقم الهاتف، الولاية، اسم الحي)<br>' +
            '3️⃣ حدد موقع الحريق عبر زر GPS<br>' +
            '4️⃣ أرفق صورة للحريق إن أمكن<br>' +
            '5️⃣ اضغط "إرسال البلاغ"<br><br>' +
            '📞 أو اتصل فوراً بـ: <strong>14</strong> (الإطفاء) أو <strong>1414</strong> (الحماية المدنية)<br><br>' +
            '⚠️ <strong>مهم:</strong> لا تقترب من الحريق. حافظ على مسافة أمان.';
    }

    if (q.includes('سلامة') || q.includes('نصائح') || q.includes('sécurité') || q.includes('safety') || q.includes('حماية') || q.includes('آمن')) {
        return '🛡️ <strong>نصائح السلامة أثناء حريق الغابات:</strong><br><br>' +
            '❌ لا تحاول إطفاء الحريق وحدك أبداً<br>' +
            '🏃 ابتعد فوراً عن منطقة الحريق والدخان<br>' +
            '📞 اتصل بالإطفاء فوراً (14)<br>' +
            '🚗 أبعد سياراتك ومنزلك عن منطقة الخطر<br>' +
            '💨 تجنب مناطق الدخان الكثيف<br>' +
            '👁️ أبلغ عن أي حريق تراه فوراً<br>' +
            '🏠 إذا كنت في مبنى ابتعد عن النوافذ<br>' +
            '🚗 إذا كنت في سيارة: أغلق النوافذ، فعّل التكييف على الدوار، اقطع الطريق بسرعة<br>' +
            '📱 شحن هاتفك دائماً في حالة الطوارئ<br>' +
            '🎒 حضّر حقيبة طوارئ (وثائق، أدوية، ماء، طعام)';
    }

    if (q.includes('تبرع') || q.includes('don') || q.includes('donner') || q.includes('donate') || q.includes('volunteer') || q.includes('تطوع') || q.includes('مساعدة')) {
        var solidarityCount = posts.length;
        return '❤️ <strong>التضامن والمساعدة:</strong><br><br>' +
            'يوجد <strong>' + solidarityCount + '</strong> منشور تضامن متاح في التطبيق.<br><br>' +
            '🤝 <strong>كيف تساعد:</strong><br>' +
            '• نشر منشور تضامن من قسم "التضامن"<br>' +
            '• التبرع للمؤسسات المعتمدة عبر الأرقام الرسمية<br>' +
            '• التطوع في جهود الإطفاء والإغاثة<br>' +
            '• مساعدة المتضررين بالهجر والمؤن<br>' +
            '• مشاركة المعلومات عبر وسائل التواصل<br><br>' +
            '💡 <strong>نصيحة:</strong> تواصل مع جمعيات محلية معتمدة في ولايتك.';
    }

    if (q.includes('جمعية') || q.includes('association') || q.includes('منظمة') || q.includes('مؤسسة') || q.includes('organization')) {
        return '🏛️ <strong>جمعيات ومؤسسات مختصة:</strong><br><br>' +
            '• الحماية المدنية الجزائرية - <strong>1414</strong><br>' +
            '• جمعية الإسعاف الجزائري - <strong>1055</strong><br>' +
            '• الهلال الأحمر الجزائري<br>' +
            '• الجمعية الوطنية لحماية الغابات<br>' +
            '• جمعية حماية البيئة<br><br>' +
            '📞 يمكنك التواصل معهم عبر أرقام الطوارئ أو زيارة مقراتهم المحلية.<br>' +
            '💡 تواصل مع الجهات المحلية في ولايتك.';
    }

    if (q.includes('مأوى') || q.includes('shelter') || q.includes('refuge') || q.includes('إيواء') || q.includes('نزوح')) {
        var shelterCount = shelters.length;
        return '🏠 <strong>مراكز الإيواء والحماية:</strong><br><br>' +
            'عدد مراكز الإيواء المسجلة: <strong>' + shelterCount + '</strong><br><br>' +
            '📍 <strong>يمكنك:</strong><br>' +
            '• تسجيل مأوى جديد من قسم "الإيواء"<br>' +
            '• الاطلاع على المراكز القريبة<br>' +
            '• الاتصال بالحماية المدنية: <strong>14</strong><br><br>' +
            '🏗️ إذا كنت تعرف مكان آمن يُمكن استعماله كمأوى، سجّله في التطبيق!';
    }

    if (q.includes('عن التطبيق') || q.includes('about app') || q.includes('à propos') || q.includes('تطبيق') || q.includes('sos forest') || q.includes('ما هو')) {
        return '🌍 <strong>SOS FOREST ALGERIA</strong><br>' +
            '🔥 تطبيق مراقبة حرائق الغابات في الجزائر<br><br>' +
            '✨ <strong>الميزات الرئيسية:</strong><br>' +
            '• 🔥 مراقبة الحرائق في الوقت الحقيقي<br>' +
            '• 📋 الإبلاغ عن الحرائق مع تحديد الموقع<br>' +
            '• 🏠 البحث عن مراكز الإيواء<br>' +
            '• ❤️ منشورات التضامن والمساعدة<br>' +
            '• 🤖 مساعد ذكي للإجابة على الأسئلة<br>' +
            '• 🌐 دعم متعدد اللغات (عربي، فرنسي، إنجليزي)<br>' +
            '• 📊 إحصائيات وبيانات مباشرة<br>' +
            '• 🗺️ خرائط تفاعلية<br><br>' +
            '📱 يعمل كتطبيق ويب تقدمي (PWA)';
    }

    if (q.includes('مساعد') || q.includes('assistant') || q.includes('bot') || q.includes('آلي') || q.includes('من أنت') || q.includes('who are you')) {
        return '🤖 <strong>مرحباً! أنا مساعد SOS FOREST ALGERIA</strong><br><br>' +
            'يمكنني مساعدتك في:<br><br>' +
            '🚨 أرقام الطوارئ والإسعاف<br>' +
            '📋 الإبلاغ عن حرائق الغابات<br>' +
            '🛡️ نصائح السلامة والحماية<br>' +
            '❤️ التبرع والتطوع والمساعدة<br>' +
            '🏛️ الجمعيات والمؤسسات المتخصصة<br>' +
            '📍 المناطق المتضررة والحرائق النشطة<br>' +
            '🏠 مراكز الإيواء والحماية<br>' +
            'ℹ️ معلومات عن التطبيق<br><br>' +
            (!AI_API_KEY ? '⚙️ <strong>للمزيد من الإمكانات:</strong> أضف مفتاح OpenRouter API من إعدادات المساعد<br><br>' : '') +
            '💡 اسألني أي سؤال وسأحاول مساعدتك! 😊';
    }

    if (q.includes('إحصائيات') || q.includes('stat') || q.includes('stats') || q.includes('عدد')) {
        return '📊 <strong>إحصائيات التطبيق:</strong><br><br>' +
            '🔥 حرائق نشطة: <strong>' + activeFires + '</strong><br>' +
            '📋 بلاغات مسجلة: <strong>' + reports.length + '</strong><br>' +
            '✅ بلاغات محلولة: <strong>' + reports.filter(function (r) { return r.status === 'resolved'; }).length + '</strong><br>' +
            '🏠 مراكز إيواء: <strong>' + shelters.length + '</strong><br>' +
            '❤️ منشورات تضامن: <strong>' + posts.length + '</strong><br><br>' +
            '💡 ساهم في تحسين الإحصائيات بالإبلاغ والمشاركة!';
    }

    return '🤖 <strong>أحتاج إلى مفتاح API للإجابة على هذا السؤال.</strong><br><br>' +
        'لتفعيل المساعد الذكي الكامل:<br>' +
        '1️⃣ احصل على مفتاح مجاني من <a href="https://openrouter.ai/keys" target="_blank">OpenRouter</a><br>' +
        '2️⃣ اضغط على ⚙️ في أعلى المحادثة<br>' +
        '3️⃣ أدخل المفتاح<br><br>' +
        '💡 <strong>بدون مفتاح API، يمكنني مساعدتك في:</strong><br>' +
        '• 🚨 أرقام الطوارئ والإسعاف<br>' +
        '• 📋 الإبلاغ عن حرائق الغابات<br>' +
        '• 🛡️ نصائح السلامة والحماية<br>' +
        '• ❤️ التبرع والتطوع<br>' +
        '• 🏠 مراكز الإيواء<br>' +
        '• ℹ️ معلومات التطبيق';
}

function showAiSettings() {
    var currentKey = AI_API_KEY;
    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = '<div style="background:var(--card-bg);border:1px solid var(--border-glass);border-radius:16px;padding:24px;max-width:450px;width:100%;max-height:90vh;overflow-y:auto;">' +
        '<h3 style="margin:0 0 16px;color:var(--text-primary);font-size:18px;">⚙️ إعدادات المساعد الذكي</h3>' +
        '<p style="font-size:13px;color:var(--text-secondary);margin:0 0 16px;line-height:1.6;">لتفعيل المساعد الذكي الكامل، أضف مفتاح API مجاني من OpenRouter. بدون مفتاح، يعمل المساعد بالأسئلة الشائعة فقط.</p>' +
        '<label style="display:block;font-size:13px;color:var(--text-primary);margin-bottom:6px;">مفتاح API (OpenRouter)</label>' +
        '<input type="password" id="aiApiKeyInput" value="' + (currentKey || '') + '" placeholder="sk-or-v1-..." style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.05);border:1px solid var(--border-glass);border-radius:8px;color:var(--text-primary);font-size:14px;box-sizing:border-box;font-family:monospace;">' +
        '<div style="margin-top:12px;display:flex;gap:8px;">' +
        '<a href="https://openrouter.ai/keys" target="_blank" style="padding:8px 16px;background:rgba(0,150,255,0.1);border:1px solid rgba(0,150,255,0.2);border-radius:8px;color:#0096ff;font-size:13px;text-decoration:none;font-family:Cairo;">🔑 احصل على مفتاح مجاني</a>' +
        '</div>' +
        '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">' +
        '<button onclick="this.closest(\'.modal-overlay\').remove()" style="padding:8px 16px;background:rgba(255,255,255,0.05);border:1px solid var(--border-glass);border-radius:8px;color:var(--text-secondary);cursor:pointer;font-family:Cairo;font-size:13px;">إلغاء</button>' +
        '<button onclick="saveAiSettings()" style="padding:8px 16px;background:#00c853;color:white;border:none;border-radius:8px;cursor:pointer;font-family:Cairo;font-size:13px;font-weight:700;">حفظ</button>' +
        '</div>' +
        '</div>';
    document.body.appendChild(modal);
}

function saveAiSettings() {
    var key = document.getElementById('aiApiKeyInput').value.trim();
    setAiApiKey(key);
    var modal = document.querySelector('.modal-overlay');
    if (modal) modal.remove();
}

/* ============================================================
   9. ADMIN PANEL
   ============================================================ */

function initAdminPanel() {
    if (!isAdmin()) {
        showToast('ليس لديك صلاحية للوصول', 'error');
        return;
    }
    initAdminMap();
    loadAdminStats();
    loadAdminAlerts();
    loadAdminSolidarity();
}

function initAdminMap() {
    var mapContainer = document.getElementById('adminMap');
    if (mapContainer) {
        var iframe = document.createElement('iframe');
        iframe.src = 'https://www.openstreetmap.org/export/embed.html?bbox=-8.68%2C18.97%2C11.99%2C37.34&layer=mapnik';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.borderRadius = '12px';
        mapContainer.innerHTML = '';
        mapContainer.appendChild(iframe);
    }
}

function loadAdminStats() {
    var reports = getAllReports();
    var shelters = getAllShelters();
    var posts = getAllSolidarityPosts();
    var users = getUsers();
    var activeReports = reports.filter(function (r) { return r.status === 'active'; }).length;
    var resolvedReports = reports.filter(function (r) { return r.status === 'resolved'; }).length;
    var todayStr = new Date().toISOString().split('T')[0];
    var todayReports = reports.filter(function (r) {
        return r.createdAt && r.createdAt.indexOf(todayStr) === 0;
    }).length;

    var setEl = function (id, val) {
        var el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setEl('adminTotalReports', reports.length);
    setEl('adminActiveReports', activeReports);
    setEl('adminResolvedReports', resolvedReports);
    setEl('adminTotalShelters', shelters.length);
    setEl('adminTotalSolidarity', posts.length);
    setEl('adminActiveFires', firemapFireData.length);
    setEl('adminTotalUsers', users.length);
    setEl('adminTodayReports', todayReports);
    setEl('adminAiQuestions', '0');
}

function loadAdminAlerts() {
    var container = document.getElementById('adminAlertsList');
    if (!container) return;

    var reports = getAllReports();

    if (reports.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>📋 لا توجد بلاغات للمراجعة حالياً</p></div>';
        return;
    }

    var html = '';
    reports.slice(0, 20).forEach(function (report) {
        var statusClass = report.status === 'active' ? 'status-active' : 'status-resolved';
        var statusText = report.status === 'active' ? 'نشط' : 'تم الحل';
        var gmapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + report.lat + ',' + report.lng;

        html += '<div class="admin-alert-card ' + statusClass + '">';
        html += '<div class="alert-header">';
        html += '<span class="alert-status ' + statusClass + '">' + statusText + '</span>';
        html += '<span class="alert-time">' + getTimeAgo(report.createdAt) + '</span>';
        html += '</div>';
        html += '<div class="alert-body">';
        html += '<div>🏛️ ' + sanitizeHTML(report.wilaya) + '</div>';
        if (report.municipality) html += '<div>🏘️ ' + sanitizeHTML(report.municipality) + '</div>';
        html += '<div>📱 ' + report.phone + '</div>';
        html += '<div>👤 ' + sanitizeHTML(report.userName || report.userEmail) + '</div>';
        html += '<div>📍 ' + report.lat.toFixed(4) + ', ' + report.lng.toFixed(4) + '</div>';
        html += '</div>';
        html += '<div class="alert-actions">';
        html += '<a href="' + gmapsUrl + '" target="_blank" class="btn-gps"><i class="fas fa-directions"></i></a>';
        if (report.status === 'active') {
            html += '<button class="btn-resolve" onclick="adminResolveReport(\'' + report.id + '\')"><i class="fas fa-check"></i></button>';
        }
        html += '</div>';
        html += '</div>';
    });
    container.innerHTML = html;
}

function adminResolveReport(reportId) {
    var reports = getAllReports();
    var report = reports.find(function (r) { return r.id === reportId; });
    if (report) {
        report.status = 'resolved';
        report.resolvedAt = getCurrentTimestamp();
        report.resolvedBy = currentUser ? currentUser.email : 'admin';
        saveAllReports(reports);
        loadAdminStats();
        loadAdminAlerts();
        loadAlerts();
        showToast('تم تحديث حالة البلاغ', 'success');
    }
}

function loadAdminSolidarity() {
    var container = document.getElementById('adminSolidarityList');
    if (!container) return;

    solidarityPosts = getAllSolidarityPosts();

    if (solidarityPosts.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>❤️ لا توجد منشورات تضامن</p></div>';
        return;
    }

    var html = '';
    solidarityPosts.forEach(function (post) {
        var typeIcon = '❤️';
        if (post.type === 'donation') typeIcon = '💰';
        else if (post.type === 'volunteer') typeIcon = '🤝';
        else if (post.type === 'shelter') typeIcon = '🏠';

        html += '<div class="admin-solidarity-card">';
        html += '<div class="card-header">';
        html += '<span class="org-name">' + post.orgName + '</span>';
        html += '<span class="post-type">' + typeIcon + ' ' + post.typeLabel + '</span>';
        html += '</div>';
        html += '<div class="card-body">';
        html += '<p>' + post.description + '</p>';
        html += '<div class="post-details">';
        html += '<span>🏛️ ' + sanitizeHTML(post.wilaya) + '</span>';
        if (post.startDate) html += '<span>📅 ' + post.startDate + '</span>';
        if (post.endDate) html += '<span>→ ' + post.endDate + '</span>';
        html += '<span>👤 ' + sanitizeHTML(post.userName || post.userEmail) + '</span>';
        html += '</div>';
        html += '</div>';
        html += '<div class="card-contact">';
        if (post.phone) {
            html += '<a href="tel:' + post.phone + '" class="contact-btn phone"><i class="fas fa-phone"></i> ' + post.phone + '</a>';
        }
        if (post.whatsapp) {
            html += '<a href="https://wa.me/' + post.whatsapp + '" target="_blank" class="contact-btn whatsapp"><i class="fab fa-whatsapp"></i> WhatsApp</a>';
        }
        if (post.facebook) {
            html += '<a href="' + post.facebook + '" target="_blank" class="contact-btn facebook"><i class="fab fa-facebook"></i> Facebook</a>';
        }
        html += '</div>';
        html += '</div>';
    });
    container.innerHTML = html;
}

/* ============================================================
   10. LANGUAGE SYSTEM
   ============================================================ */

var currentLang = localStorage.getItem('sosForestLang') || 'ar';

var translations = {
    ar: {
        navPredictions: '🔥 وضعية الحرائق',
        navReports: '🚨 التبليغات',
        navShelters: '🏕️ الإيواء',
        navSolidarity: '🤲 التضامن',
        navAiAssistant: '🤖 المساعد',
        navAdmin: '⚙️ التحكم',
        sectionPredictionsTitle: '🔥 وضعية الحرائق الآن',
        sectionPredictionsDescription: 'مراقبة حرائق الغابات في الجزائر بالوقت الحقيقي — بيانات مباشرة من الأقمار الصناعية',
        sectionReportsTitle: '🚨 التبليغات عن الحرائق',
        sectionReportsDescription: 'إرسال تبليغات فورية عن حرائق الغابات إلى المصالح المعنية',
        sectionSheltersTitle: '🏕️ الإيواء والمؤونة',
        sectionSheltersDescription: 'تحديد أماكن الإيواء والمؤونة لمساعدة العائلات المنكوبة',
        sectionSolidarityTitle: '🤲 التضامن والإغاثة',
        sectionSolidarityDescription: 'الجمعيات الخيرية والمؤسسات والمنظمات التي تنظم عمليات التضامن وجمع التبرعات',
        sectionAiAssistantTitle: '🤖 المساعد الذكي',
        sectionAiAssistantDescription: 'مساعد بالذكاء الاصطناعي للإجابة على أسئلتك حول الحرائق في الجزائر',
        sectionAdminTitle: '⚙️ لوحة التحكم',
        sectionAdminDescription: 'مراقبة وإدارة جميع التبليغات ومراكز الإيواء',
        btnRefresh: '🔄 تحيين البيانات',
        btnGps: '📍 تحديد موقعي GPS',
        btnSend: 'إرسال',
        btnLogin: 'دخول التطبيق',
        btnRegister: 'حساب جديد',
        btnLogout: 'خروج',
        loginTitle: 'تسجيل الدخول',
        registerTitle: 'حساب جديد',
        loginEmail: 'البريد الإلكتروني',
        loginPassword: 'كلمة المرور',
        registerEmail: 'البريد الإلكتروني',
        registerPhone: 'رقم الهاتف',
        registerWilaya: 'الولاية',
        registerPassword: 'كلمة المرور',
        registerPasswordConfirm: 'تأكيد كلمة المرور',
        aiPlaceholder: 'اكتب سؤالك هنا...',
        aiSend: 'إرسال',
        quickEmergency: '📞 أرقام الطوارئ',
        quickReport: '🔥 التبليغ عن حريق',
        quickSafety: '💡 نصائح السلامة',
        quickDonate: '🤲 المساهمة',
        quickShelter: '🏠 مراكز الإيواء',
        quickFires: '🔥 الحرائق النشطة',
        weatherTitle: 'الطقس الحالي',
        fireStatsTitle: 'إحصائيات الحرائق',
        firemapPointsTitle: 'النقاط النشطة',
        firemapIframeTitle: 'خريطة الحرائق التفاعلية',
        reportFormTitle: '🚨 نموذج التبليغ',
        reportPhone: 'رقم الهاتف',
        reportWilaya: 'الولاية',
        reportMunicipality: 'البلدية (اختياري)',
        reportNeighborhood: 'اسم الحي',
        reportLat: 'خط العرض',
        reportLng: 'خط الطول',
        reportDate: 'التاريخ (اختياري)',
        reportTime: 'الوقت (اختياري)',
        reportImage: 'صورة الموقع (اختياري)',
        reportSubmit: 'إرسال التبليغ',
        shelterFormTitle: 'تسجيل مركز الإيواء',
        shelterName: 'اسم المركز',
        shelterWilaya: 'الولاية',
        shelterMunicipality: 'البلدية',
        shelterPhone: 'رقم هاتف المركز',
        shelterLat: 'خط العرض',
        shelterLng: 'خط الطول',
        shelterImage: 'صورة المركز',
        shelterSubmit: 'تسجيل المركز',
        solidarityFormTitle: 'نشر حملة تضامن',
        solidarityOrgName: 'اسم الجمعية / المؤسسة',
        solidarityType: 'نوع الحملة',
        solidarityWilaya: 'الولاية',
        solidarityDescription: 'وصف الحملة',
        solidarityPhone: 'رقم الهاتف',
        solidarityWhatsApp: 'رقم الواتساب',
        solidarityFacebook: 'رابط صفحة الفيسبوك',
        solidarityStartDate: 'تاريخ البداية',
        solidarityEndDate: 'تاريخ النهاية',
        solidarityImage: 'صورة الحملة',
        solidaritySubmit: 'نشر الحملة',
        adminMapTitle: 'خريطة التبليغات والمراكز',
        adminStatsTitle: 'إحصائيات الأداء',
        adminAlertsTitle: 'التبليغات الحديثة',
        adminSolidarityTitle: 'حملات التضامن والإغاثة'
    },
    fr: {
        navPredictions: '🔥 Situation feux',
        navReports: '🚨 Signalements',
        navShelters: '🏕️ Accueil',
        navSolidarity: '🤲 Solidarité',
        navAiAssistant: '🤖 Assistant',
        navAdmin: '⚙️ Admin',
        sectionPredictionsTitle: '🔥 Situation des feux actuelle',
        sectionPredictionsDescription: 'Surveillance des feux de forêt en temps réel - données satellitaires en direct',
        sectionReportsTitle: '🚨 Signalements de feux',
        sectionReportsDescription: 'Envoyer des signalements de feux de forêt aux services compétents',
        sectionSheltersTitle: '🏕️ Hébergement et ravitaillement',
        sectionSheltersDescription: 'Localiser les centres d\'hébergement et de ravitaillement pour aider les familles sinistrées',
        sectionSolidarityTitle: '🤝 Solidarité et secours',
        sectionSolidarityDescription: 'Associations, organisations et institutions organisant des opérations de solidarité et de collecte',
        sectionAiAssistantTitle: '🤖 Assistant intelligent',
        sectionAiAssistantDescription: 'Assistant intelligent pour répondre à vos questions sur les feux en Algérie',
        sectionAdminTitle: '⚙️ Panneau de contrôle',
        sectionAdminDescription: 'Surveillance et gestion de tous les signalements et centres d\'hébergement',
        btnRefresh: '🔄 Actualiser les données',
        btnGps: '📍 Localiser mon GPS',
        btnSend: 'Envoyer',
        btnLogin: 'Se connecter',
        btnRegister: 'Nouveau compte',
        btnLogout: 'Déconnexion',
        loginTitle: 'Connexion',
        registerTitle: 'Nouveau compte',
        loginEmail: 'Email',
        loginPassword: 'Mot de passe',
        registerEmail: 'Email',
        registerPhone: 'Téléphone',
        registerWilaya: 'Wilaya',
        registerPassword: 'Mot de passe',
        registerPasswordConfirm: 'Confirmer le mot de passe',
        aiPlaceholder: 'Tapez votre question ici...',
        aiSend: 'Envoyer',
        quickEmergency: '📞 Numéros d\'urgence',
        quickReport: '🔥 Signaler un feu',
        quickSafety: '💡 Conseils sécurité',
        quickDonate: '🤲 Contribuer',
        quickShelter: '🏠 Centres d\'accueil',
        quickFires: '🔥 Feux actifs',
        weatherTitle: 'Météo actuelle',
        fireStatsTitle: 'Statistiques des feux',
        firemapPointsTitle: 'Points actifs',
        firemapIframeTitle: 'Carte interactive des feux',
        reportFormTitle: '🚨 Formulaire de signalement',
        reportPhone: 'Téléphone',
        reportWilaya: 'Wilaya',
        reportMunicipality: 'Commune (optionnel)',
        reportNeighborhood: 'Quartier',
        reportLat: 'Latitude',
        reportLng: 'Longitude',
        reportDate: 'Date (optionnel)',
        reportTime: 'Heure (optionnel)',
        reportImage: 'Image du site (optionnel)',
        reportSubmit: 'Envoyer le signalement',
        shelterFormTitle: 'Enregistrer un centre d\'accueil',
        shelterName: 'Nom du centre',
        shelterWilaya: 'Wilaya',
        shelterMunicipality: 'Commune',
        shelterPhone: 'Téléphone du centre',
        shelterLat: 'Latitude',
        shelterLng: 'Longitude',
        shelterImage: 'Image du centre',
        shelterSubmit: 'Enregistrer le centre',
        solidarityFormTitle: 'Publier une campagne de solidarité',
        solidarityOrgName: 'Nom de l\'association / institution',
        solidarityType: 'Type de campagne',
        solidarityWilaya: 'Wilaya',
        solidarityDescription: 'Description de la campagne',
        solidarityPhone: 'Téléphone',
        solidarityWhatsApp: 'Numéro WhatsApp',
        solidarityFacebook: 'Lien Facebook',
        solidarityStartDate: 'Date de début',
        solidarityEndDate: 'Date de fin',
        solidarityImage: 'Image de la campagne',
        solidaritySubmit: 'Publier la campagne',
        adminMapTitle: 'Carte des signalements et centres',
        adminStatsTitle: 'Statistiques de performance',
        adminAlertsTitle: 'Signalements récents',
        adminSolidarityTitle: 'Campagnes de solidarité et secours'
    },
    en: {
        navPredictions: '🔥 Fire Status',
        navReports: '🚨 Reports',
        navShelters: '🏕️ Shelter',
        navSolidarity: '🤲 Solidarity',
        navAiAssistant: '🤖 Assistant',
        navAdmin: '⚙️ Control',
        sectionPredictionsTitle: '🔥 Current Fire Status',
        sectionPredictionsDescription: 'Real-time forest fire monitoring in Algeria - live satellite data',
        sectionReportsTitle: '🚨 Fire Reports',
        sectionReportsDescription: 'Send instant reports about forest fires to the relevant authorities',
        sectionSheltersTitle: '🏕️ Shelter & Relief',
        sectionSheltersDescription: 'Locate shelter and relief centers to help affected families',
        sectionSolidarityTitle: '🤝 Solidarity & Relief',
        sectionSolidarityDescription: 'Charities, organizations and institutions organizing solidarity and donation drives',
        sectionAiAssistantTitle: '🤖 Smart Assistant',
        sectionAiAssistantDescription: 'AI assistant to answer your questions about fires in Algeria',
        sectionAdminTitle: '⚙️ Control Panel',
        sectionAdminDescription: 'Monitor and manage all reports and shelter centers',
        btnRefresh: '🔄 Refresh Data',
        btnGps: '📍 My GPS Location',
        btnSend: 'Send',
        btnLogin: 'Login',
        btnRegister: 'New Account',
        btnLogout: 'Logout',
        loginTitle: 'Login',
        registerTitle: 'New Account',
        loginEmail: 'Email',
        loginPassword: 'Password',
        registerEmail: 'Email',
        registerPhone: 'Phone',
        registerWilaya: 'Wilaya',
        registerPassword: 'Password',
        registerPasswordConfirm: 'Confirm Password',
        aiPlaceholder: 'Type your question here...',
        aiSend: 'Send',
        quickEmergency: '📞 Emergency Numbers',
        quickReport: '🔥 Report a Fire',
        quickSafety: '💡 Safety Tips',
        quickDonate: '🤲 Contribute',
        quickShelter: '🏠 Shelter Centers',
        quickFires: '🔥 Active Fires',
        weatherTitle: 'Current Weather',
        fireStatsTitle: 'Fire Statistics',
        firemapPointsTitle: 'Active Points',
        firemapIframeTitle: 'Interactive Fire Map',
        reportFormTitle: '🚨 Report Form',
        reportPhone: 'Phone',
        reportWilaya: 'Wilaya',
        reportMunicipality: 'Municipality (optional)',
        reportNeighborhood: 'Neighborhood',
        reportLat: 'Latitude',
        reportLng: 'Longitude',
        reportDate: 'Date (optional)',
        reportTime: 'Time (optional)',
        reportImage: 'Site Image (optional)',
        reportSubmit: 'Submit Report',
        shelterFormTitle: 'Register Shelter Center',
        shelterName: 'Center Name',
        shelterWilaya: 'Wilaya',
        shelterMunicipality: 'Municipality',
        shelterPhone: 'Center Phone',
        shelterLat: 'Latitude',
        shelterLng: 'Longitude',
        shelterImage: 'Center Image',
        shelterSubmit: 'Register Center',
        solidarityFormTitle: 'Publish Solidarity Campaign',
        solidarityOrgName: 'Organization / Institution Name',
        solidarityType: 'Campaign Type',
        solidarityWilaya: 'Wilaya',
        solidarityDescription: 'Campaign Description',
        solidarityPhone: 'Phone',
        solidarityWhatsApp: 'WhatsApp Number',
        solidarityFacebook: 'Facebook Page Link',
        solidarityStartDate: 'Start Date',
        solidarityEndDate: 'End Date',
        solidarityImage: 'Campaign Image',
        solidaritySubmit: 'Publish Campaign',
        adminMapTitle: 'Reports & Centers Map',
        adminStatsTitle: 'Performance Statistics',
        adminAlertsTitle: 'Recent Reports',
        adminSolidarityTitle: 'Solidarity & Relief Campaigns'
    }
};

function changeLang(lang) {
    currentLang = lang;
    localStorage.setItem('sosForestLang', lang);
    if (lang === 'ar') {
        document.documentElement.dir = 'rtl';
    } else {
        document.documentElement.dir = 'ltr';
    }
    document.documentElement.lang = lang;
    document.body.className = 'lang-' + lang;
    applyTranslations();
    updateLanguageButtons();
}

function updateLanguageButtons() {
    var langBtns = document.querySelectorAll('.lang-btn');
    langBtns.forEach(function (btn) {
        btn.classList.remove('active');
        if (btn.getAttribute('data-lang') === currentLang) {
            btn.classList.add('active');
        }
    });
}

function t(key) {
    if (translations[currentLang] && translations[currentLang][key]) {
        return translations[currentLang][key];
    }
    if (translations['ar'] && translations['ar'][key]) {
        return translations['ar'][key];
    }
    return key;
}

function sectionToCamelCase(section) {
    return section.split('-').map(function (part, i) {
        return i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1);
    }).join('');
}

function applyTranslations() {
    var navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(function (tab) {
        var section = tab.getAttribute('data-section');
        if (section) {
            var key = 'nav' + sectionToCamelCase(section);
            var translated = t(key);
            if (translated !== key) {
                var textSpan = tab.querySelector('span:not(.tab-icon):not(.tab-badge)');
                if (textSpan) textSpan.textContent = translated;
            }
        }
    });

    var mobileMenuItems = document.querySelectorAll('.mobile-menu-item');
    mobileMenuItems.forEach(function (item) {
        var section = item.getAttribute('data-section');
        if (section) {
            var key = 'nav' + sectionToCamelCase(section);
            var translated = t(key);
            if (translated !== key) {
                var textSpan = item.querySelector('span:not(.menu-icon)');
                if (textSpan) textSpan.textContent = translated;
            }
        }
    });

    var sectionIds = ['predictions', 'reports', 'shelters', 'solidarity', 'ai-assistant', 'admin'];
    sectionIds.forEach(function (id) {
        var sectionEl = document.getElementById('section-' + id);
        if (!sectionEl) return;
        var titleEl = sectionEl.querySelector('.section-title');
        var descEl = sectionEl.querySelector('.section-desc');
        var camelId = sectionToCamelCase(id);
        var titleKey = 'section' + camelId.charAt(0).toUpperCase() + camelId.slice(1) + 'Title';
        var descKey = 'section' + camelId.charAt(0).toUpperCase() + camelId.slice(1) + 'Description';
        if (titleEl) {
            var iconSpan = titleEl.querySelector('.icon');
            var iconHtml = iconSpan ? iconSpan.outerHTML + ' ' : '';
            var translatedTitle = t(titleKey);
            if (translatedTitle !== titleKey) titleEl.innerHTML = iconHtml + translatedTitle;
        }
        if (descEl) {
            var translatedDesc = t(descKey);
            if (translatedDesc !== descKey) descEl.textContent = translatedDesc;
        }
    });

    var refreshBtn = document.getElementById('firemapRefreshBtn');
    if (refreshBtn) {
        var refreshText = t('btnRefresh');
        if (refreshText !== 'btnRefresh') refreshBtn.innerHTML = refreshText;
    }

    var gpsBtn = document.getElementById('gpsBtn');
    if (gpsBtn) {
        var gpsText = t('btnGps');
        if (gpsText !== 'btnGps') gpsBtn.innerHTML = gpsText;
    }

    var shelterGpsBtn = document.getElementById('shelterGpsBtn');
    if (shelterGpsBtn) {
        var shelterGpsText = t('btnGps');
        if (shelterGpsText !== 'btnGps') shelterGpsBtn.innerHTML = shelterGpsText;
    }

    var quickBtns = document.querySelectorAll('.ai-quick-btn');
    var quickKeys = ['quickEmergency', 'quickReport', 'quickSafety', 'quickDonate'];
    quickBtns.forEach(function (btn, idx) {
        if (idx < quickKeys.length) {
            var quickText = t(quickKeys[idx]);
            if (quickText !== quickKeys[idx]) btn.textContent = quickText;
        }
    });

    var aiInput = document.getElementById('aiChatInput');
    if (aiInput) {
        var placeholder = t('aiPlaceholder');
        if (placeholder !== 'aiPlaceholder') aiInput.placeholder = placeholder;
    }

    var submitBtns = document.querySelectorAll('.btn-submit');
    submitBtns.forEach(function (btn) {
        var btnText = t('btnSend');
        if (btnText !== 'btnSend') btn.textContent = btnText;
    });
}

/* ============================================================
   11. UI HELPERS
   ============================================================ */

function showToast(message, type) {
    type = type || 'info';
    var container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    var icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '❌';
    else if (type === 'info') icon = 'ℹ️';
    else if (type === 'warning') icon = '⚠️';

    toast.innerHTML = '<span class="toast-icon">' + icon + '</span>' +
        '<span class="toast-message">' + message + '</span>' +
        '<button class="toast-close" onclick="this.parentElement.remove()">×</button>';

    container.appendChild(toast);

    setTimeout(function () {
        toast.classList.add('toast-hide');
        setTimeout(function () {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 4000);
}

function createParticles() {
    var container = document.querySelector('.particles');
    if (!container) return;
    container.innerHTML = '';
    var emojis = ['🔥', '🌲', '🍃', '💨', '🌫️', '🌿', '🌳', '🍂'];
    var count = 25;
    for (var i = 0; i < count; i++) {
        var particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = (Math.random() * 100) + '%';
        particle.style.animationDelay = (Math.random() * 8) + 's';
        particle.style.animationDuration = (Math.random() * 12 + 8) + 's';
        particle.style.opacity = (Math.random() * 0.4 + 0.1).toString();
        particle.style.fontSize = (Math.random() * 18 + 8) + 'px';
        particle.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        container.appendChild(particle);
    }
}

function closePointModal() {
    var modal = document.getElementById('pointModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

function openPointModal(title, body) {
    var modal = document.getElementById('pointModal');
    var titleEl = document.getElementById('pointModalTitle');
    var bodyEl = document.getElementById('pointModalBody');
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.innerHTML = body;
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

function showSectionLoader(sectionId) {
    var section = document.getElementById(sectionId + 'Section');
    if (!section) return;
    var loader = section.querySelector('.section-loader');
    if (loader) loader.style.display = 'flex';
}

function hideSectionLoader(sectionId) {
    var section = document.getElementById(sectionId + 'Section');
    if (!section) return;
    var loader = section.querySelector('.section-loader');
    if (loader) loader.style.display = 'none';
}

function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () {
            showToast('تم النسخ', 'success');
        });
    } else {
        var textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast('تم النسخ', 'success');
    }
}

/* ============================================================
   12. DEAD/LEGACY FUNCTIONS
   ============================================================ */

function renderPredictionsMap() {
    // no-op - iframe replaces Leaflet
}

function addFiremapMarkersToMap() {
    if (!predictionsMapInstance) return;
    // no-op
}

function renderDangerPointsList() {
    // removed
}

function renderDangerTable() {
    // removed
}

function transferWorldviewPointsToDangerData() {
    // no-op
}

function refreshPredictionsFromWorldview() {
    // no-op
}

function loadWorldviewEONETEvents() {
    // no-op
}

function renderEONETEvents() {
    // no-op
}

function addEONETMarkersToMap() {
    // no-op
}

function updateWorldviewTimeBadge() {
    // no-op
}

/* ============================================================
   15. ADDITIONAL UI HELPERS & UTILITIES
   ============================================================ */

function escapeHtml(text) {
    if (!text) return '';
    var map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function (m) { return map[m]; });
}

function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function isElementVisible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

function scrollToElement(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function generateStars(rating) {
    var stars = '';
    var fullStars = Math.floor(rating);
    var halfStar = rating % 1 >= 0.5;
    for (var i = 0; i < fullStars; i++) {
        stars += '⭐';
    }
    if (halfStar) {
        stars += '🌟';
    }
    return stars || '☆';
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c;
    return d;
}

function formatDistance(km) {
    if (km < 1) {
        return Math.round(km * 1000) + ' م';
    }
    return km.toFixed(1) + ' كم';
}

function isRTL() {
    return currentLang === 'ar';
}

function getDirectionClass() {
    return isRTL() ? 'rtl' : 'ltr';
}

function validateForm(formId) {
    var form = document.getElementById(formId);
    if (!form) return false;
    var requiredFields = form.querySelectorAll('[required]');
    var valid = true;
    requiredFields.forEach(function (field) {
        if (!field.value.trim()) {
            field.classList.add('field-error');
            valid = false;
        } else {
            field.classList.remove('field-error');
        }
    });
    return valid;
}

function clearFormErrors(formId) {
    var form = document.getElementById(formId);
    if (!form) return;
    var errorFields = form.querySelectorAll('.field-error');
    errorFields.forEach(function (field) {
        field.classList.remove('field-error');
    });
}

function showModal(modalId) {
    var modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

function hideModal(modalId) {
    var modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

function createConfirmDialog(message, onConfirm, onCancel) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '9999';
    var dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';
    dialog.innerHTML = '<div class="confirm-content">' +
        '<p>' + message + '</p>' +
        '<div class="confirm-actions">' +
        '<button class="btn-confirm-yes">نعم</button>' +
        '<button class="btn-confirm-no">إلغاء</button>' +
        '</div>' +
        '</div>';
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    var yesBtn = dialog.querySelector('.btn-confirm-yes');
    var noBtn = dialog.querySelector('.btn-confirm-no');
    yesBtn.addEventListener('click', function () {
        document.body.removeChild(overlay);
        if (onConfirm) onConfirm();
    });
    noBtn.addEventListener('click', function () {
        document.body.removeChild(overlay);
        if (onCancel) onCancel();
    });
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
            if (onCancel) onCancel();
        }
    });
}

function loadUserPreferences() {
    try {
        return JSON.parse(localStorage.getItem('sosForestPreferences') || '{}');
    } catch (e) {
        return {};
    }
}

function saveUserPreferences(prefs) {
    try {
        localStorage.setItem('sosForestPreferences', JSON.stringify(prefs));
    } catch (e) {
        console.error('Failed to save preferences:', e);
    }
}

function getUserPreference(key, defaultValue) {
    var prefs = loadUserPreferences();
    return prefs[key] !== undefined ? prefs[key] : defaultValue;
}

function setUserPreference(key, value) {
    var prefs = loadUserPreferences();
    prefs[key] = value;
    saveUserPreferences(prefs);
}

function getFormattedDate(date) {
    var d = date ? new Date(date) : new Date();
    var options = { year: 'numeric', month: 'long', day: 'numeric' };
    if (currentLang === 'ar') {
        return d.toLocaleDateString('ar-DZ', options);
    } else if (currentLang === 'fr') {
        return d.toLocaleDateString('fr-FR', options);
    } else {
        return d.toLocaleDateString('en-US', options);
    }
}

function getFormattedDateTime(date) {
    var d = date ? new Date(date) : new Date();
    var options = {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    };
    if (currentLang === 'ar') {
        return d.toLocaleDateString('ar-DZ', options);
    } else if (currentLang === 'fr') {
        return d.toLocaleDateString('fr-FR', options);
    } else {
        return d.toLocaleDateString('en-US', options);
    }
}

function getRelativeDay(dateString) {
    if (!dateString) return '';
    var date = new Date(dateString);
    var today = new Date();
    var yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    var tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
        return 'اليوم';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'أمس';
    } else if (date.toDateString() === tomorrow.toDateString()) {
        return 'غداً';
    } else {
        return getFormattedDate(dateString);
    }
}

function isValidGeoCoord(lat, lng) {
    if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
    var latNum = parseFloat(lat);
    var lngNum = parseFloat(lng);
    return !isNaN(latNum) && !isNaN(lngNum) &&
        latNum >= -90 && latNum <= 90 &&
        lngNum >= -180 && lngNum <= 180;
}

function getFireSeverityLevel(frp) {
    if (frp > 50) return { level: 'حرج', class: 'critical', color: '#dc3545', icon: '🔴' };
    if (frp > 30) return { level: 'مرتفع', class: 'high', color: '#fd7e14', icon: '🟠' };
    if (frp > 15) return { level: 'متوسط', class: 'medium', color: '#ffc107', icon: '🟡' };
    return { level: 'منخفض', class: 'low', color: '#28a745', icon: '🟢' };
}

function getConfidenceLabel(confidence) {
    if (confidence >= 80) return { label: 'عالي', class: 'high' };
    if (confidence >= 60) return { label: 'متوسط', class: 'medium' };
    return { label: 'منخفض', class: 'low' };
}

function searchInArray(array, query, fields) {
    if (!array || !query || !fields) return [];
    var q = query.toLowerCase().trim();
    return array.filter(function (item) {
        return fields.some(function (field) {
            var value = item[field];
            if (typeof value === 'string') {
                return value.toLowerCase().indexOf(q) !== -1;
            }
            return false;
        });
    });
}

function groupBy(array, key) {
    if (!array) return {};
    return array.reduce(function (result, item) {
        var groupKey = item[key] || 'unknown';
        if (!result[groupKey]) result[groupKey] = [];
        result[groupKey].push(item);
        return result;
    }, {});
}

function sortBy(array, key, direction) {
    if (!array) return [];
    direction = direction || 'asc';
    return array.slice().sort(function (a, b) {
        var valA = a[key];
        var valB = b[key];
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
    });
}

function filterByDateRange(array, dateField, startDate, endDate) {
    if (!array) return [];
    return array.filter(function (item) {
        var itemDate = new Date(item[dateField]);
        var start = startDate ? new Date(startDate) : new Date('1970-01-01');
        var end = endDate ? new Date(endDate) : new Date('2099-12-31');
        return itemDate >= start && itemDate <= end;
    });
}

function countByStatus(array, statusField) {
    var counts = {};
    array.forEach(function (item) {
        var status = item[statusField] || 'unknown';
        counts[status] = (counts[status] || 0) + 1;
    });
    return counts;
}

function getLatestItems(array, count) {
    if (!array) return [];
    return array.slice(0, count || 5);
}

function chunkArray(array, size) {
    if (!array) return [];
    var chunks = [];
    for (var i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

function flattenArray(array) {
    if (!array) return [];
    return array.reduce(function (flat, toFlatten) {
        return flat.concat(Array.isArray(toFlatten) ? flattenArray(toFlatten) : toFlatten);
    }, []);
}

function uniqueArray(array, key) {
    if (!array) return [];
    if (!key) return [...new Set(array)];
    var seen = {};
    return array.filter(function (item) {
        var val = item[key];
        if (seen[val]) return false;
        seen[val] = true;
        return true;
    });
}

function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch (e) {
        return obj;
    }
}

function mergeObjects(target) {
    var sources = Array.prototype.slice.call(arguments, 1);
    sources.forEach(function (source) {
        if (source) {
            Object.keys(source).forEach(function (key) {
                target[key] = source[key];
            });
        }
    });
    return target;
}

/* ============================================================
   13. POPULATE WILAYA DROPDOWNS
   ============================================================ */

function populateWilayaDropdowns() {
    var selects = document.querySelectorAll('.wilaya-select');
    selects.forEach(function (select) {
        var currentValue = select.value;
        select.innerHTML = '<option value="">-- اختر الولاية --</option>';
        if (typeof wilayas !== 'undefined' && Array.isArray(wilayas)) {
            wilayas.forEach(function (w) {
                var option = document.createElement('option');
                option.value = w.name;
                option.textContent = w.code + ' - ' + w.name;
                select.appendChild(option);
            });
        } else {
            var defaultWilayas = [
                { code: '01', name: 'أدرار' },
                { code: '02', name: 'الشلف' },
                { code: '03', name: 'الأغواط' },
                { code: '04', name: 'أم البواقي' },
                { code: '05', name: 'باتنة' },
                { code: '06', name: 'بجاية' },
                { code: '07', name: 'بسكرة' },
                { code: '08', name: 'بشار' },
                { code: '09', name: 'البليدة' },
                { code: '10', name: 'البويرة' },
                { code: '11', name: 'تمنراست' },
                { code: '12', name: 'تبسة' },
                { code: '13', name: 'تلمسان' },
                { code: '14', name: 'تيارت' },
                { code: '15', name: 'تيزي وزو' },
                { code: '16', name: 'الجزائر' },
                { code: '17', name: 'الجلفة' },
                { code: '18', name: 'جيجل' },
                { code: '19', name: 'سطيف' },
                { code: '20', name: 'سعيدة' },
                { code: '21', name: 'سكيكدة' },
                { code: '22', name: 'سيدي بلعباس' },
                { code: '23', name: 'عنابة' },
                { code: '24', name: 'قالمة' },
                { code: '25', name: 'قسنطينة' },
                { code: '26', name: 'المدية' },
                { code: '27', name: 'مستغانم' },
                { code: '28', name: 'المسيلة' },
                { code: '29', name: 'معسكر' },
                { code: '30', name: 'ورقلة' },
                { code: '31', name: 'وهران' },
                { code: '32', name: 'البيض' },
                { code: '33', name: 'إليزي' },
                { code: '34', name: 'برج بوعريريج' },
                { code: '35', name: 'بومرداس' },
                { code: '36', name: 'الطارف' },
                { code: '37', name: 'تندوف' },
                { code: '38', name: 'تيسمسيلت' },
                { code: '39', name: 'الوادي' },
                { code: '40', name: 'خنشلة' },
                { code: '41', name: 'سوق أهراس' },
                { code: '42', name: 'تيبازة' },
                { code: '43', name: 'ميلة' },
                { code: '44', name: 'النعامة' },
                { code: '45', name: 'عين تموشنت' },
                { code: '46', name: 'غرداية' },
                { code: '47', name: 'غليزان' },
                { code: '48', name: 'تيميمون' },
                { code: '49', name: 'برج باجي مختار' },
                { code: '50', name: 'أولاد جلال' },
                { code: '51', name: 'بني عباس' },
                { code: '52', name: 'توقرت' },
                { code: '53', name: 'جانت' },
                { code: '54', name: 'المغير' },
                { code: '55', name: 'المنيعة' }
            ];
            defaultWilayas.forEach(function (w) {
                var option = document.createElement('option');
                option.value = w.name;
                option.textContent = w.code + ' - ' + w.name;
                select.appendChild(option);
            });
        }
        if (currentValue) {
            select.value = currentValue;
        }
    });
}

/* ============================================================
   14. AUTO-INITIALIZATION
   ============================================================ */

populateWilayaDropdowns();

var reportDateEl = document.getElementById('reportDate');
var reportTimeEl = document.getElementById('reportTime');
if (reportDateEl) {
    try {
        reportDateEl.valueAsDate = new Date();
    } catch (e) {
        reportDateEl.value = formatDate(new Date().toISOString());
    }
}
if (reportTimeEl) {
    try {
        reportTimeEl.valueAsDate = new Date();
    } catch (e) {
        reportTimeEl.value = formatTime(new Date().toISOString());
    }
}

console.log('🌍 SOS FOREST ALGERIA - App initialized');
console.log('📍 Version 2.0 - Forest Fire Monitoring for Algeria');
