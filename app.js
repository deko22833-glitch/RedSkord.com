// Автоматическое определение адреса сервера
const SERVER_PORT = window.location.port || '3000';
const SERVER_HOST = window.location.hostname || 'localhost';
let SERVER_URL = `${window.location.protocol}//${SERVER_HOST}:${SERVER_PORT}`;

// Проверяем сохраненный адрес сервера
const savedServerUrl = localStorage.getItem('redskord_server_url');
if (savedServerUrl) {
    SERVER_URL = savedServerUrl;
}

// Создаем подключение
const socket = io(SERVER_URL, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
    timeout: 20000
});

// Пытаемся получить информацию о сервере
async function fetchServerInfo() {
    try {
        const response = await fetch('/api/info');
        const info = await response.json();
        return info;
    } catch (error) {
        console.warn('Не удалось получить информацию о сервере:', error);
        return null;
    }
}

// При загрузке страницы проверяем адрес
window.addEventListener('DOMContentLoaded', async () => {
    const serverInfo = await fetchServerInfo();
    if (serverInfo && serverInfo.publicIp) {
        // Показываем уведомление если используем локальный адрес
        const currentHost = window.location.hostname;
        if (currentHost.startsWith('192.168.') || currentHost.startsWith('10.') || currentHost === 'localhost' || currentHost === '127.0.0.1') {
            setTimeout(() => {
                const notification = document.createElement('div');
                notification.className = 'server-info-notification';
                notification.innerHTML = `
                    <div class="server-info-content">
                        <span>🌐</span>
                        <div>
                            <strong>Локальное подключение</strong>
                            <p>Вы подключены через локальную сеть. Для доступа из интернета используйте:</p>
                            <p style="color: #7289da; font-weight: 600; margin-top: 4px;">http://${serverInfo.publicIp}:${serverInfo.port}</p>
                            <button class="server-info-btn" onclick="copyServerUrl('http://${serverInfo.publicIp}:${serverInfo.port}')">📋 Копировать адрес</button>
                        </div>
                        <button class="permission-close" onclick="this.parentElement.parentElement.remove()">×</button>
                    </div>
                `;
                document.body.appendChild(notification);
                setTimeout(() => notification.remove(), 15000);
            }, 2000);
        }
    }
});

// Функция копирования адреса
window.copyServerUrl = (url) => {
    navigator.clipboard.writeText(url).then(() => {
        alert('Адрес скопирован в буфер обмена!');
    }).catch(() => {
        // Fallback для старых браузеров
        const textarea = document.createElement('textarea');
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        alert('Адрес скопирован в буфер обмена!');
    });
};

let currentUser = null;
let currentChat = 'general'; // 'general' или userId друга
let currentFriendId = null;
let friends = [];
let friendRequests = [];
let onlineUsers = [];
let currentRoomId = null;
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let isInCall = false;

// ICE серверы для WebRTC (поддержка мобильных провайдеров)
const iceServers = {
    iceServers: [
        // STUN серверы (для определения публичного IP)
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        // Публичные TURN серверы (для обхода NAT мобильных провайдеров)
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:80?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ],
    iceCandidatePoolSize: 10
};

// Элементы DOM
const authScreen = document.getElementById('authScreen');
const appContainer = document.getElementById('appContainer');
const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const loginError = document.getElementById('loginError');
const registerError = document.getElementById('registerError');

const messagesArea = document.getElementById('messagesArea');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messageInputContainer = document.querySelector('.message-input-container');
const chatTitle = document.getElementById('chatTitle');
const friendsList = document.getElementById('friendsList');
const usersList = document.getElementById('usersList');
const addFriendBtn = document.getElementById('addFriendBtn');
const callButtonsGroup = document.getElementById('callButtonsGroup');
const voiceCallBtn = document.getElementById('voiceCallBtn');
const videoCallBtn = document.getElementById('videoCallBtn');

const addFriendModal = document.getElementById('addFriendModal');
const closeAddFriendModal = document.getElementById('closeAddFriendModal');
const searchUserInput = document.getElementById('searchUserInput');
const searchResults = document.getElementById('searchResults');
const friendRequestsList = document.getElementById('friendRequestsList');

const callModal = document.getElementById('callModal');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const endCallBtn = document.getElementById('endCallBtn');
const incomingCallModal = document.getElementById('incomingCallModal');
const answerCallBtn = document.getElementById('answerCallBtn');
const rejectCallBtn = document.getElementById('rejectCallBtn');
const callerName = document.getElementById('callerName');
const callStatus = document.getElementById('callStatus');
const videoContainer = document.getElementById('videoContainer');
const voiceContainer = document.getElementById('voiceContainer');
const voiceAvatar = document.getElementById('voiceAvatar');
const voiceName = document.getElementById('voiceName');
const toggleVideoBtn = document.getElementById('toggleVideoBtn');
const toggleMuteBtn = document.getElementById('toggleMuteBtn');
const incomingCallIcon = document.getElementById('incomingCallIcon');
const incomingCallTitle = document.getElementById('incomingCallTitle');
const shareScreenBtn = document.getElementById('shareScreenBtn');
const passwordStrength = document.getElementById('passwordStrength');
const voiceMessageBtn = document.getElementById('voiceMessageBtn');
const voiceRecording = document.getElementById('voiceRecording');
const stopRecordingBtn = document.getElementById('stopRecordingBtn');
const sendVoiceBtn = document.getElementById('sendVoiceBtn');
const recordingTime = document.getElementById('recordingTime');
let currentCallType = 'video';
let isMuted = false;
let isVideoEnabled = true;
let isSharingScreen = false;
let screenStream = null;
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let recordingTimer = null;

// Переключение между вкладками
loginTab.addEventListener('click', () => {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    loginForm.style.display = 'flex';
    registerForm.style.display = 'none';
});

registerTab.addEventListener('click', () => {
    registerTab.classList.add('active');
    loginTab.classList.remove('active');
    registerForm.style.display = 'flex';
    loginForm.style.display = 'none';
});

// Функция сохранения данных входа
function saveLoginData(username, password) {
    try {
        const loginData = {
            username: username,
            password: password,
            timestamp: Date.now()
        };
        localStorage.setItem('redskord_remember', JSON.stringify(loginData));
    } catch (error) {
        console.error('Ошибка сохранения данных:', error);
    }
}

// Функция загрузки сохраненных данных
function loadLoginData() {
    try {
        const saved = localStorage.getItem('redskord_remember');
        if (saved) {
            const loginData = JSON.parse(saved);
            // Проверяем, не устарели ли данные (храним максимум 30 дней)
            const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 дней
            if (Date.now() - loginData.timestamp < maxAge) {
                return loginData;
            } else {
                localStorage.removeItem('redskord_remember');
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        localStorage.removeItem('redskord_remember');
    }
    return null;
}

// Функция очистки сохраненных данных
function clearLoginData() {
    localStorage.removeItem('redskord_remember');
}

// Автоматический вход при загрузке страницы
window.addEventListener('DOMContentLoaded', async () => {
    const savedData = loadLoginData();
    if (savedData) {
        const rememberMeCheckbox = document.getElementById('rememberMe');
        if (rememberMeCheckbox) {
            rememberMeCheckbox.checked = true;
        }
        
        // Заполняем форму
        const usernameInput = document.getElementById('loginUsername');
        const passwordInput = document.getElementById('loginPassword');
        if (usernameInput && passwordInput) {
            usernameInput.value = savedData.username;
            passwordInput.value = savedData.password;
            
            // Автоматически входим
            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        username: savedData.username, 
                        password: savedData.password 
                    })
                });

                const result = await response.json();
                
                if (result.success) {
                    currentUser = result.user;
                    socket.emit('authenticate', { userId: currentUser.id });
                } else {
                    // Если автоматический вход не удался, очищаем данные
                    clearLoginData();
                    passwordInput.value = '';
                }
            } catch (error) {
                console.error('Ошибка автоматического входа:', error);
                passwordInput.value = '';
            }
        }
    }
});

// Авторизация
loginBtn.addEventListener('click', async () => {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    
    if (!username || !password) {
        loginError.textContent = 'Заполните все поля';
        return;
    }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();
        
        if (result.success) {
            // Сохраняем данные, если отмечено "Запомнить меня"
            if (rememberMe) {
                saveLoginData(username, password);
            } else {
                clearLoginData();
            }
            
            currentUser = result.user;
            socket.emit('authenticate', { userId: currentUser.id });
        } else {
            loginError.textContent = result.error || 'Ошибка входа';
        }
    } catch (error) {
        loginError.textContent = 'Ошибка подключения к серверу';
    }
});

// Валидация имени пользователя
document.getElementById('registerUsername')?.addEventListener('input', (e) => {
    const username = e.target.value.trim();
    const error = registerError;
    
    if (username.length > 0 && username.length < 3) {
        error.textContent = 'Имя пользователя должно содержать минимум 3 символа';
    } else if (username.length > 20) {
        error.textContent = 'Имя пользователя не должно превышать 20 символов';
    } else if (!/^[a-zA-Zа-яА-Я0-9_]+$/.test(username)) {
        error.textContent = 'Имя пользователя может содержать только буквы, цифры и подчеркивание';
    } else {
        error.textContent = '';
    }
});

// Проверка силы пароля
document.getElementById('registerPassword')?.addEventListener('input', (e) => {
    const password = e.target.value;
    const strengthDiv = passwordStrength;
    
    if (password.length === 0) {
        strengthDiv.innerHTML = '';
        return;
    }
    
    let strength = 0;
    let feedback = [];
    
    if (password.length >= 6) strength++;
    else feedback.push('Минимум 6 символов');
    
    if (password.length >= 8) strength++;
    
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
        strength++;
    } else if (/[a-zA-Z]/.test(password)) {
        feedback.push('Добавьте заглавные буквы');
    }
    
    if (/\d/.test(password)) strength++;
    else feedback.push('Добавьте цифры');
    
    if (/[^a-zA-Z0-9]/.test(password)) strength++;
    else feedback.push('Добавьте спец. символы');
    
    let strengthText = '';
    let strengthClass = '';
    
    if (strength <= 2) {
        strengthText = 'Слабый';
        strengthClass = 'weak';
    } else if (strength <= 3) {
        strengthText = 'Средний';
        strengthClass = 'medium';
    } else {
        strengthText = 'Сильный';
        strengthClass = 'strong';
    }
    
    strengthDiv.innerHTML = `
        <div class="strength-bar ${strengthClass}">
            <div class="strength-fill" style="width: ${(strength / 5) * 100}%"></div>
        </div>
        <div class="strength-text">${strengthText}</div>
    `;
});

// Проверка совпадения паролей
document.getElementById('registerPasswordConfirm')?.addEventListener('input', (e) => {
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = e.target.value;
    const error = registerError;
    
    if (confirmPassword.length > 0 && password !== confirmPassword) {
        error.textContent = 'Пароли не совпадают';
    } else if (confirmPassword.length > 0 && password === confirmPassword) {
        error.textContent = '';
    }
});

// Регистрация
registerBtn.addEventListener('click', async () => {
    const username = document.getElementById('registerUsername').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
    
    registerError.textContent = '';
    
    // Валидация
    if (!username) {
        registerError.textContent = 'Введите имя пользователя';
        return;
    }
    
    if (username.length < 3 || username.length > 20) {
        registerError.textContent = 'Имя пользователя должно быть от 3 до 20 символов';
        return;
    }
    
    if (!/^[a-zA-Zа-яА-Я0-9_]+$/.test(username)) {
        registerError.textContent = 'Имя пользователя может содержать только буквы, цифры и подчеркивание';
        return;
    }
    
    if (!password) {
        registerError.textContent = 'Введите пароль';
        return;
    }
    
    if (password.length < 6) {
        registerError.textContent = 'Пароль должен содержать минимум 6 символов';
        return;
    }
    
    if (password !== passwordConfirm) {
        registerError.textContent = 'Пароли не совпадают';
        return;
    }
    
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        registerError.textContent = 'Некорректный email адрес';
        return;
    }

    registerBtn.disabled = true;
    registerBtn.textContent = 'Регистрация...';

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        const result = await response.json();
        
        if (result.success) {
            currentUser = result.user;
            socket.emit('authenticate', { userId: currentUser.id });
        } else {
            registerError.textContent = result.error || 'Ошибка регистрации';
            registerBtn.disabled = false;
            registerBtn.textContent = 'Зарегистрироваться';
        }
    } catch (error) {
        registerError.textContent = 'Ошибка подключения к серверу';
        registerBtn.disabled = false;
        registerBtn.textContent = 'Зарегистрироваться';
    }
});

// Enter для авторизации/регистрации
document.getElementById('loginUsername').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loginBtn.click();
});
document.getElementById('loginPassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loginBtn.click();
});
document.getElementById('registerUsername').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('registerEmail').focus();
    }
});
document.getElementById('registerEmail').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('registerPassword').focus();
    }
});
document.getElementById('registerPassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('registerPasswordConfirm').focus();
    }
});
document.getElementById('registerPasswordConfirm').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') registerBtn.click();
});

// Socket события
socket.on('connect', () => {
    console.log('Подключен к серверу');
});

socket.on('authError', (data) => {
    // При ошибке авторизации очищаем сохраненные данные
    clearLoginData();
    loginError.textContent = data.error || 'Ошибка авторизации';
    registerError.textContent = data.error || 'Ошибка авторизации';
});

socket.on('authenticated', async (data) => {
    authScreen.style.display = 'none';
    appContainer.style.display = 'flex';
    friends = data.user.friends || [];
    friendRequests = data.friendRequests || [];
    updateFriendsList();
    updateFriendRequests();
    updateFriendRequestsBadge();
    loadGeneralChat();
    
    // Запрашиваем разрешение на микрофон сразу после авторизации
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Сразу останавливаем поток, нужен только для получения разрешения
        stream.getTracks().forEach(track => track.stop());
        console.log('Разрешение на микрофон получено');
    } catch (error) {
        console.warn('Разрешение на микрофон не получено:', error);
        // Показываем уведомление, но не блокируем работу приложения
        if (error.name === 'NotAllowedError') {
            setTimeout(() => {
                const notification = document.createElement('div');
                notification.className = 'permission-notification';
                notification.innerHTML = `
                    <div class="permission-notification-content">
                        <span>🎤</span>
                        <div>
                            <strong>Разрешение на микрофон отклонено</strong>
                            <p>Для использования голосовых сообщений и звонков необходимо разрешить доступ к микрофону</p>
                        </div>
                        <button class="permission-close" onclick="this.parentElement.parentElement.remove()">×</button>
                    </div>
                `;
                document.body.appendChild(notification);
                setTimeout(() => notification.remove(), 10000);
            }, 2000);
        }
    }
    
    // Обработчик клика на канал "общий-чат"
    document.querySelector('.channel-item[data-channel="general"]')?.addEventListener('click', () => {
        loadGeneralChat();
    });
});

socket.on('newMessage', (message) => {
    if (currentChat === 'general') {
        addMessage(message);
    }
});

socket.on('messageHistory', (messages) => {
    messagesArea.innerHTML = '';
    messages.forEach(msg => addMessage(msg));
});

socket.on('privateMessage', (message) => {
    if (currentChat === message.fromUserId || currentChat === message.toUserId) {
        addMessage(message, true);
    }
});

socket.on('privateMessagesHistory', (data) => {
    messagesArea.innerHTML = '';
    data.messages.forEach(msg => {
        const message = {
            ...msg,
            voiceMessage: msg.voiceMessage || null,
            voiceDuration: msg.voiceDuration || null
        };
        addMessage(message, true);
    });
});

socket.on('friendsOnline', (onlineFriends) => {
    friends.forEach(friend => {
        const online = onlineFriends.find(f => f.id === friend.id);
        friend.status = online ? 'online' : 'offline';
    });
    updateFriendsList();
});

socket.on('friendOnline', (friend) => {
    const friendObj = friends.find(f => f.id === friend.id);
    if (friendObj) {
        friendObj.status = 'online';
        updateFriendsList();
    }
});

socket.on('friendOffline', (data) => {
    const friendObj = friends.find(f => f.id === data.id);
    if (friendObj) {
        friendObj.status = 'offline';
        updateFriendsList();
    }
});

socket.on('friendRequest', (data) => {
    friendRequests.push(data);
    updateFriendRequests();
    updateFriendRequestsBadge();
});

socket.on('friendAdded', (data) => {
    // Проверяем, нет ли уже этого друга в списке
    if (!friends.find(f => f.id === data.friend.id)) {
        friends.push(data.friend);
        updateFriendsList();
    }
    
    // Удаляем заявку из списка после принятия
    friendRequests = friendRequests.filter(r => r.fromUserId !== data.friend.id);
    updateFriendRequests();
    updateFriendRequestsBadge();
});

socket.on('friendRequestsUpdated', (data) => {
    // Заявки уже приходят с сервера с полной информацией
    // Просто обновляем список
    friendRequests = data.friendRequests || [];
    updateFriendRequests();
    updateFriendRequestsBadge();
});

socket.on('friendRequestError', (data) => {
    alert(data.error || 'Ошибка при обработке заявки');
});

socket.on('friendRemoved', (data) => {
    friends = friends.filter(f => f.id !== data.friendId);
    updateFriendsList();
    if (currentChat === data.friendId) {
        currentChat = 'general';
        loadGeneralChat();
    }
});

socket.on('userList', (users) => {
    onlineUsers = users;
    updateUsersList();
});

// Отправка сообщения
sendBtn.addEventListener('click', () => {
    sendMessage();
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentUser) return;

    if (currentChat === 'general') {
        socket.emit('sendMessage', { text });
    } else {
        socket.emit('sendPrivateMessage', {
            toUserId: currentChat,
            text
        });
    }
    messageInput.value = '';
}

// Голосовые сообщения
voiceMessageBtn.addEventListener('mousedown', async (e) => {
    if (currentChat === 'general') {
        alert('Голосовые сообщения доступны только в личных чатах');
        return;
    }
    
    if (!currentUser) return;
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = () => {
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        recordingStartTime = Date.now();
        voiceRecording.style.display = 'flex';
        messageInputContainer.style.display = 'none';
        
        // Обновление таймера
        recordingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            recordingTime.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }, 100);
        
    } catch (error) {
        console.error('Ошибка при записи:', error);
        alert('Не удалось начать запись. Проверьте разрешения на микрофон.');
    }
});

// Отправка голосового сообщения
sendVoiceBtn.addEventListener('click', async () => {
    if (!mediaRecorder || audioChunks.length === 0) return;
    
    mediaRecorder.stop();
    clearInterval(recordingTimer);
    
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    const reader = new FileReader();
    
    reader.onloadend = () => {
        const base64Audio = reader.result.split(',')[1];
        
        socket.emit('sendPrivateMessage', {
            toUserId: currentChat,
            text: '',
            voiceMessage: base64Audio,
            voiceDuration: Math.floor((Date.now() - recordingStartTime) / 1000)
        });
        
        voiceRecording.style.display = 'none';
        messageInputContainer.style.display = 'flex';
        audioChunks = [];
        recordingStartTime = null;
    };
    
    reader.readAsDataURL(audioBlob);
});

// Остановка записи
stopRecordingBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    clearInterval(recordingTimer);
    voiceRecording.style.display = 'none';
    messageInputContainer.style.display = 'flex';
    audioChunks = [];
    recordingStartTime = null;
});

function addMessage(message, isPrivate = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    
    const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });

    const username = isPrivate ? message.fromUsername : message.username;
    const avatarLetter = username[0].toUpperCase();
    
    let messageContent = '';
    
    if (message.voiceMessage) {
        // Голосовое сообщение
        const audioId = `audio_${message.id || Date.now()}`;
        messageContent = `
            <div class="voice-message">
                <audio id="${audioId}" src="data:audio/webm;base64,${message.voiceMessage}"></audio>
                <button class="play-voice-btn" onclick="playVoiceMessage('${audioId}')">
                    <span class="play-icon">▶️</span>
                    <span class="voice-duration">${formatDuration(message.voiceDuration || 0)}</span>
                </button>
                <div class="voice-waveform"></div>
            </div>
        `;
    } else {
        // Текстовое сообщение
        messageContent = `<div class="message-text">${escapeHtml(message.text)}</div>`;
    }
    
    messageDiv.innerHTML = `
        <div class="message-avatar">${avatarLetter}</div>
        <div class="message-content">
            <div class="message-header">
                <span class="message-username">${escapeHtml(username)}</span>
                <span class="message-time">${time}</span>
            </div>
            ${messageContent}
        </div>
    `;
    
    messagesArea.appendChild(messageDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

window.playVoiceMessage = (audioId) => {
    const audio = document.getElementById(audioId);
    const btn = audio.parentElement.querySelector('.play-voice-btn');
    const icon = btn.querySelector('.play-icon');
    
    if (audio.paused) {
        audio.play();
        icon.textContent = '⏸️';
        audio.onended = () => {
            icon.textContent = '▶️';
        };
    } else {
        audio.pause();
        icon.textContent = '▶️';
    }
};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Обновление списка друзей
function updateFriendsList() {
    friendsList.innerHTML = '';
    friends.forEach(friend => {
        const friendDiv = document.createElement('div');
        friendDiv.className = `friend-item ${currentChat === friend.id ? 'active' : ''}`;
        friendDiv.dataset.friendId = friend.id;
        friendDiv.innerHTML = `
            <div class="friend-avatar">${friend.username[0].toUpperCase()}</div>
            <span>${escapeHtml(friend.username)}</span>
            <div class="friend-status ${friend.status === 'online' ? 'online' : ''}"></div>
        `;
        friendDiv.addEventListener('click', () => {
            openFriendChat(friend.id, friend.username);
        });
        friendsList.appendChild(friendDiv);
    });
}

// Открытие чата с другом
function openFriendChat(friendId, friendName) {
    currentChat = friendId;
    currentFriendId = friendId;
    chatTitle.textContent = friendName;
    callButtonsGroup.style.display = 'flex';
    voiceMessageBtn.style.display = 'flex'; // Показываем кнопку голосовых сообщений
    socket.emit('getPrivateMessages', { otherUserId: friendId });
    
    // Обновляем активные элементы
    document.querySelectorAll('.channel-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelectorAll('.friend-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.friendId === friendId) {
            item.classList.add('active');
        }
    });
}

// Загрузка общего чата
function loadGeneralChat() {
    currentChat = 'general';
    currentFriendId = null;
    chatTitle.textContent = 'общий-чат';
    callButtonsGroup.style.display = 'none';
    voiceMessageBtn.style.display = 'none'; // Скрываем кнопку голосовых сообщений в общем чате
    socket.emit('getMessages');
    
    // Обновляем активный канал
    document.querySelectorAll('.channel-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector('.channel-item[data-channel="general"]')?.classList.add('active');
}

// Обновление списка пользователей
function updateUsersList() {
    usersList.innerHTML = '';
    onlineUsers.forEach(user => {
        if (user.id === currentUser.id) return;
        const userDiv = document.createElement('div');
        userDiv.className = 'user-item';
        userDiv.innerHTML = `
            <div class="user-avatar">${user.username[0].toUpperCase()}</div>
            <span>${escapeHtml(user.username)}</span>
            <div class="user-status ${user.status === 'online' ? 'online' : ''}"></div>
        `;
        usersList.appendChild(userDiv);
    });
}

// Поиск пользователей
searchUserInput.addEventListener('input', async (e) => {
    const query = e.target.value.trim();
    if (query.length < 2) {
        searchResults.innerHTML = '';
        return;
    }

    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&userId=${currentUser.id}`);
        const results = await response.json();
        
        searchResults.innerHTML = '';
        results.forEach(user => {
            const resultDiv = document.createElement('div');
            resultDiv.className = 'search-result';
            resultDiv.innerHTML = `
                <div class="search-result-info">
                    <div class="user-avatar">${user.username[0].toUpperCase()}</div>
                    <span>${escapeHtml(user.username)}</span>
                </div>
                <button onclick="sendFriendRequest('${user.id}')">Добавить</button>
            `;
            searchResults.appendChild(resultDiv);
        });
    } catch (error) {
        console.error('Ошибка поиска:', error);
    }
});

window.sendFriendRequest = (userId) => {
    socket.emit('sendFriendRequest', { friendId: userId });
    searchUserInput.value = '';
    searchResults.innerHTML = '';
};

// Обновление запросов в друзья
function updateFriendRequests() {
    friendRequestsList.innerHTML = '';
    if (friendRequests.length === 0) {
        friendRequestsList.innerHTML = '<p style="color: #72767d; font-size: 14px;">Нет запросов</p>';
        return;
    }

    friendRequests.forEach(request => {
        const requestDiv = document.createElement('div');
        requestDiv.className = 'friend-request-item';
        requestDiv.innerHTML = `
            <div class="friend-request-info">
                <div class="user-avatar">${request.fromUsername[0].toUpperCase()}</div>
                <span>${escapeHtml(request.fromUsername)}</span>
            </div>
            <div class="friend-request-actions">
                <button class="accept-request-btn" onclick="acceptFriendRequest('${request.fromUserId}')">✅ Принять</button>
                <button class="reject-request-btn" onclick="rejectFriendRequest('${request.fromUserId}')">❌ Отклонить</button>
            </div>
        `;
        friendRequestsList.appendChild(requestDiv);
    });
}

// Обновление бейджа с количеством заявок
function updateFriendRequestsBadge() {
    const badge = document.getElementById('friendRequestsBadge');
    if (!badge) return;
    
    const count = friendRequests.length;
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count.toString();
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

window.acceptFriendRequest = (userId) => {
    socket.emit('acceptFriendRequest', { friendId: userId });
    // Удаляем из списка локально
    friendRequests = friendRequests.filter(r => r.fromUserId !== userId);
    updateFriendRequests();
    updateFriendRequestsBadge();
};

window.rejectFriendRequest = (userId) => {
    // Отправляем запрос на сервер для отклонения
    socket.emit('rejectFriendRequest', { friendId: userId });
    // Удаляем из списка локально (сервер обновит через friendRequestsUpdated)
    friendRequests = friendRequests.filter(r => r.fromUserId !== userId);
    updateFriendRequests();
    updateFriendRequestsBadge();
};

// Модальное окно добавления друга
addFriendBtn.addEventListener('click', () => {
    addFriendModal.style.display = 'flex';
});

closeAddFriendModal.addEventListener('click', () => {
    addFriendModal.style.display = 'none';
});

// Звонки
voiceCallBtn.addEventListener('click', async () => {
    if (!currentFriendId) return;
    currentCallType = 'voice';
    await startCall(currentFriendId, 'voice');
});

videoCallBtn.addEventListener('click', async () => {
    if (!currentFriendId) return;
    currentCallType = 'video';
    await startCall(currentFriendId, 'video');
});

async function startCall(targetUserId, callType = 'video') {
    try {
        const constraints = {
            audio: true,
            video: callType === 'video'
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (callType === 'video') {
            localVideo.srcObject = localStream;
            videoContainer.style.display = 'block';
            voiceContainer.style.display = 'none';
            toggleVideoBtn.style.display = 'inline-block';
        } else {
            videoContainer.style.display = 'none';
            voiceContainer.style.display = 'block';
            toggleVideoBtn.style.display = 'none';
            // Устанавливаем имя и аватар для голосового звонка
            const friend = friends.find(f => f.id === targetUserId);
            if (friend) {
                voiceName.textContent = friend.username;
                voiceAvatar.textContent = friend.username[0].toUpperCase();
            }
        }
        
        // Создаем соединение с улучшенной конфигурацией для мобильных
        peerConnection = new RTCPeerConnection(iceServers);
        
        // Логирование ICE кандидатов для отладки
        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'failed') {
                console.warn('ICE connection failed, trying to restart...');
                peerConnection.restartIce();
            }
        };
        
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        peerConnection.ontrack = (event) => {
            if (callType === 'video') {
                remoteVideo.srcObject = event.streams[0];
            }
            remoteStream = event.streams[0];
        };
        
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', {
                    target: targetUserId,
                    candidate: event.candidate
                });
            }
        };
        
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        socket.emit('offer', {
            target: targetUserId,
            offer: offer
        });
        
        currentRoomId = `room_${Date.now()}`;
        socket.emit('callUser', {
            roomId: currentRoomId,
            targetUserId: targetUserId,
            callType: callType
        });
        
        callModal.style.display = 'flex';
        callStatus.textContent = callType === 'video' ? 'Видеозвонок...' : 'Голосовой звонок...';
        isInCall = true;
        isMuted = false;
        isVideoEnabled = callType === 'video';
        
        // Показываем кнопку демонстрации экрана только для видеозвонков
        if (callType === 'video') {
            shareScreenBtn.style.display = 'inline-flex';
        } else {
            shareScreenBtn.style.display = 'none';
        }
        
    } catch (error) {
        console.error('Ошибка при начале звонка:', error);
        
        // Более детальная обработка ошибок
        let errorMsg = '';
        if (error.name === 'NotAllowedError') {
            errorMsg = callType === 'video' 
                ? 'Доступ к камере и микрофону запрещен. Разрешите доступ в настройках браузера.'
                : 'Доступ к микрофону запрещен. Разрешите доступ в настройках браузера.';
        } else if (error.name === 'NotFoundError') {
            errorMsg = callType === 'video' 
                ? 'Камера или микрофон не найдены. Проверьте подключение устройств.'
                : 'Микрофон не найден. Проверьте подключение устройства.';
        } else if (error.name === 'NotReadableError') {
            errorMsg = 'Устройство используется другим приложением. Закройте другие программы.';
        } else {
            errorMsg = callType === 'video' 
                ? 'Не удалось начать видеозвонок. Проверьте разрешения на камеру и микрофон.'
                : 'Не удалось начать голосовой звонок. Проверьте разрешения на микрофон.';
        }
        
        // Показываем уведомление вместо alert
        const notification = document.createElement('div');
        notification.className = 'permission-notification';
        notification.style.background = '#f04747';
        notification.innerHTML = `
            <div class="permission-notification-content">
                <span>${callType === 'video' ? '📹' : '🎤'}</span>
                <div>
                    <strong>Ошибка звонка</strong>
                    <p>${errorMsg}</p>
                </div>
                <button class="permission-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 8000);
    }
}

// Переключение видео
toggleVideoBtn.addEventListener('click', async () => {
    if (!localStream) return;
    
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        if (isVideoEnabled) {
            videoTrack.enabled = false;
            toggleVideoBtn.style.opacity = '0.5';
            isVideoEnabled = false;
        } else {
            videoTrack.enabled = true;
            toggleVideoBtn.style.opacity = '1';
            isVideoEnabled = true;
        }
    }
});

// Переключение микрофона
toggleMuteBtn.addEventListener('click', () => {
    if (!localStream) return;
    
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        if (isMuted) {
            audioTrack.enabled = true;
            toggleMuteBtn.style.opacity = '1';
            toggleMuteBtn.innerHTML = '<span>🔇</span>';
            isMuted = false;
        } else {
            audioTrack.enabled = false;
            toggleMuteBtn.style.opacity = '0.5';
            toggleMuteBtn.innerHTML = '<span>🔇</span>';
            isMuted = true;
        }
    }
});

// Демонстрация экрана
shareScreenBtn.addEventListener('click', async () => {
    if (!isInCall || !peerConnection) return;
    
    try {
        if (isSharingScreen) {
            // Останавливаем демонстрацию экрана
            if (screenStream) {
                screenStream.getTracks().forEach(track => track.stop());
                screenStream = null;
            }
            
            // Возвращаемся к обычной камере (если была)
            if (currentCallType === 'video') {
                const videoTrack = localStream?.getVideoTracks()[0];
                if (videoTrack) {
                    const sender = peerConnection.getSenders().find(s => 
                        s.track && s.track.kind === 'video'
                    );
                    if (sender) {
                        await sender.replaceTrack(videoTrack);
                    }
                }
                localVideo.srcObject = localStream;
            }
            
            isSharingScreen = false;
            shareScreenBtn.style.opacity = '1';
            shareScreenBtn.innerHTML = '<span>🖥️</span>';
            callStatus.textContent = currentCallType === 'video' ? 'Видеозвонок активен' : 'Голосовой звонок активен';
        } else {
            // Начинаем демонстрацию экрана
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });
            
            const videoTrack = screenStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => 
                s.track && s.track.kind === 'video'
            );
            
            if (sender) {
                await sender.replaceTrack(videoTrack);
            } else {
                // Если нет видеотрека, добавляем новый
                screenStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, screenStream);
                });
            }
            
            // Показываем экран в локальном видео
            localVideo.srcObject = screenStream;
            
            // Обработка остановки демонстрации экрана пользователем
            videoTrack.onended = () => {
                shareScreenBtn.click(); // Автоматически переключаем обратно
            };
            
            isSharingScreen = true;
            shareScreenBtn.style.opacity = '0.5';
            shareScreenBtn.innerHTML = '<span>🖥️</span>';
            callStatus.textContent = 'Демонстрация экрана';
        }
    } catch (error) {
        console.error('Ошибка при демонстрации экрана:', error);
        if (error.name === 'NotAllowedError') {
            alert('Разрешение на демонстрацию экрана отклонено');
        } else {
            alert('Не удалось начать демонстрацию экрана');
        }
    }
});

// Входящий звонок
socket.on('incomingCall', async (data) => {
    incomingCallModal.style.display = 'flex';
    callerName.textContent = data.callerName;
    currentRoomId = data.roomId;
    currentCallType = data.callType || 'video';
    
    // Обновляем иконку и заголовок в зависимости от типа звонка
    if (currentCallType === 'voice') {
        incomingCallIcon.textContent = '🎤';
        incomingCallTitle.textContent = 'Входящий голосовой звонок';
    } else {
        incomingCallIcon.textContent = '📹';
        incomingCallTitle.textContent = 'Входящий видеозвонок';
    }
    
    let currentCallerId = data.callerId;
    
    const offerHandler = async (offerData) => {
        if (offerData.caller && peerConnection) {
            await peerConnection.setRemoteDescription(offerData.offer);
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            socket.emit('answer', {
                target: currentCallerId,
                answer: answer
            });
        }
    };
    
    socket.on('offer', offerHandler);
    
    answerCallBtn.onclick = async () => {
        incomingCallModal.style.display = 'none';
        
        try {
            const constraints = {
                audio: true,
                video: currentCallType === 'video'
            };
            
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            if (currentCallType === 'video') {
                localVideo.srcObject = localStream;
                videoContainer.style.display = 'block';
                voiceContainer.style.display = 'none';
                toggleVideoBtn.style.display = 'inline-block';
            } else {
                videoContainer.style.display = 'none';
                voiceContainer.style.display = 'block';
                toggleVideoBtn.style.display = 'none';
                const caller = friends.find(f => f.id === currentCallerId) || 
                              { username: data.callerName };
                voiceName.textContent = caller.username;
                voiceAvatar.textContent = caller.username[0].toUpperCase();
            }
            
            // Создаем соединение с улучшенной конфигурацией для мобильных
            peerConnection = new RTCPeerConnection(iceServers);
            
            // Логирование ICE кандидатов для отладки
            peerConnection.oniceconnectionstatechange = () => {
                console.log('ICE connection state:', peerConnection.iceConnectionState);
                if (peerConnection.iceConnectionState === 'failed') {
                    console.warn('ICE connection failed, trying to restart...');
                    peerConnection.restartIce();
                }
            };
            
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
            
            peerConnection.ontrack = (event) => {
                if (currentCallType === 'video') {
                    remoteVideo.srcObject = event.streams[0];
                }
                remoteStream = event.streams[0];
            };
            
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('ice-candidate', {
                        target: currentCallerId,
                        candidate: event.candidate
                    });
                }
            };
            
            socket.emit('answerCall', { roomId: currentRoomId });
            callModal.style.display = 'flex';
            callStatus.textContent = currentCallType === 'video' ? 'Видеозвонок активен' : 'Голосовой звонок активен';
            isInCall = true;
            isMuted = false;
            isVideoEnabled = currentCallType === 'video';
            
            // Показываем кнопку демонстрации экрана только для видеозвонков
            if (currentCallType === 'video') {
                shareScreenBtn.style.display = 'inline-flex';
            } else {
                shareScreenBtn.style.display = 'none';
            }
            
        } catch (error) {
            console.error('Ошибка при ответе на звонок:', error);
            
            // Более детальная обработка ошибок
            let errorMsg = '';
            if (error.name === 'NotAllowedError') {
                errorMsg = currentCallType === 'video' 
                    ? 'Доступ к камере и микрофону запрещен. Разрешите доступ в настройках браузера.'
                    : 'Доступ к микрофону запрещен. Разрешите доступ в настройках браузера.';
            } else if (error.name === 'NotFoundError') {
                errorMsg = currentCallType === 'video' 
                    ? 'Камера или микрофон не найдены. Проверьте подключение устройств.'
                    : 'Микрофон не найден. Проверьте подключение устройства.';
            } else if (error.name === 'NotReadableError') {
                errorMsg = 'Устройство используется другим приложением. Закройте другие программы.';
            } else {
                errorMsg = currentCallType === 'video' 
                    ? 'Не удалось ответить на видеозвонок. Проверьте разрешения.'
                    : 'Не удалось ответить на голосовой звонок. Проверьте разрешения.';
            }
            
            // Показываем уведомление
            const notification = document.createElement('div');
            notification.className = 'permission-notification';
            notification.style.background = '#f04747';
            notification.innerHTML = `
                <div class="permission-notification-content">
                    <span>${currentCallType === 'video' ? '📹' : '🎤'}</span>
                    <div>
                        <strong>Ошибка звонка</strong>
                        <p>${errorMsg}</p>
                    </div>
                    <button class="permission-close" onclick="this.parentElement.parentElement.remove()">×</button>
                </div>
            `;
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 8000);
            
            socket.off('offer', offerHandler);
            socket.emit('rejectCall', { roomId: currentRoomId });
            incomingCallModal.style.display = 'none';
        }
    };
    
    rejectCallBtn.onclick = () => {
        incomingCallModal.style.display = 'none';
        socket.emit('rejectCall', { roomId: currentRoomId });
        socket.off('offer', offerHandler);
        currentRoomId = null;
    };
});

socket.on('answer', async (data) => {
    if (peerConnection && data.answerer) {
        await peerConnection.setRemoteDescription(data.answer);
        callStatus.textContent = 'Звонок активен';
    }
});

socket.on('ice-candidate', async (data) => {
    if (peerConnection && data.sender && data.sender !== socket.id) {
        try {
            await peerConnection.addIceCandidate(data.candidate);
        } catch (error) {
            console.error('Ошибка добавления ICE candidate:', error);
        }
    }
});

endCallBtn.addEventListener('click', () => {
    endCall();
});

function endCall() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
        remoteStream = null;
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    
    callModal.style.display = 'none';
    incomingCallModal.style.display = 'none';
    
    if (currentRoomId) {
        socket.emit('endCall', { roomId: currentRoomId });
        currentRoomId = null;
    }
    
    isInCall = false;
    isMuted = false;
    isVideoEnabled = true;
    isSharingScreen = false;
    currentCallType = 'video';
}

socket.on('callEnded', () => {
    endCall();
});

socket.on('callRejected', () => {
    callModal.style.display = 'none';
    alert('Звонок отклонен');
    endCall();
});

socket.on('callError', (data) => {
    alert(data.error);
    endCall();
});
