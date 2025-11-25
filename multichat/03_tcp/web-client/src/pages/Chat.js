import { navigateTo } from '../router/Router.js';
import {
    login,
    getOnlineUsers,
    getAllUsers,
    sendMessageToUser,
    sendMessageToGroup,
    createGroup,
    addMemberToGroup,
    getUserGroups,
    getHistory,
    getPendingMessages
} from '../services/restDelegate.js';
import {
    initializeICE,
    sendAudioViaICE,
    startCallViaICE,
    sendMessageViaICE,
    recordAudio,
    subscribeViaICE,
    endCallViaICE,
    getActiveCallsViaICE,
    getHistoryViaICE,
    stopRecording
} from '../services/iceDelegate.js';
import {
    initializeAudioService,
    startCall as startAudioCall,
    acceptCall as acceptAudioCall,
    rejectCall as rejectAudioCall,
    endCall as endAudioCall,
    startStreaming as startAudioStreaming,
    startStreamingPCM as startAudioStreamingPCM,
    getPendingOffer
} from '../services/audioService.js';
import { getCurrentCall as getWebRTCCurrentCall } from '../services/webrtcService.js';
import ProfilePanel from '../components/ProfilePanel.js';
import UserInfoPanel from '../components/UserInfoPanel.js';

function Chat() {
    const username = sessionStorage.getItem('username');

    if (!username) {
        window.location.href = '/';
        return document.createElement('div');
    }

    const container = document.createElement('div');
    container.className = 'chat-container';

    // Panel de perfil propio
    const profilePanel = ProfilePanel(username);
    container.appendChild(profilePanel);

    // Panel de información del usuario (se crea dinámicamente)
    let userInfoPanel = null;

    const sidebar = createSidebar(username, () => {
        profilePanel.classList.add('visible');
    });
    container.appendChild(sidebar);

    const chatArea = createChatArea(() => {
        // Callback para abrir el panel de información del usuario
        if (currentChat && currentChat.type === 'user') {
            // Remover panel anterior si existe
            if (userInfoPanel) {
                container.removeChild(userInfoPanel);
            }
            // Crear nuevo panel con el usuario actual
            userInfoPanel = UserInfoPanel(currentChat.name);
            container.appendChild(userInfoPanel);
            userInfoPanel.classList.add('visible');
        }
    });
    container.appendChild(chatArea);

    initializeChat(username);

    return container;
}

import defaultAvatar from '../assets/default-avatar.svg';

function createSidebar(username, onProfileClick) {
    const sidebar = document.createElement('div');
    sidebar.className = 'sidebar';

    const header = document.createElement('div');
    header.className = 'sidebar-header';

    const profileImg = document.createElement('img');
    const savedImage = localStorage.getItem(`profile-image-${username}`);
    profileImg.src = savedImage || defaultAvatar;
    profileImg.alt = "Profile";
    profileImg.className = 'profile-avatar';
    profileImg.onclick = onProfileClick;
    header.appendChild(profileImg);

    const userTitle = document.createElement('h2');
    userTitle.innerText = username;
    header.appendChild(userTitle);

    sidebar.appendChild(header);

    const tabs = document.createElement('div');
    tabs.className = 'sidebar-tabs';

    const usersTab = document.createElement('button');
    usersTab.innerText = 'Users';
    usersTab.className = 'active';
    usersTab.onclick = () => {
        usersTab.classList.add('active');
        groupsTab.classList.remove('active');
        showUsers();
    };

    const groupsTab = document.createElement('button');
    groupsTab.innerText = 'Groups';
    groupsTab.onclick = () => {
        groupsTab.classList.add('active');
        usersTab.classList.remove('active');
        showGroups();
    };

    tabs.appendChild(usersTab);
    tabs.appendChild(groupsTab);
    sidebar.appendChild(tabs);

    // Content
    const content = document.createElement('div');
    content.className = 'sidebar-content';
    content.id = 'sidebar-content';
    sidebar.appendChild(content);

    return sidebar;
}

function createChatArea(onHeaderClick) {
    const chatArea = document.createElement('div');
    chatArea.className = 'chat-area';

    // Header
    const header = document.createElement('div');
    header.className = 'chat-header';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.gap = '15px';

    // Header left side (avatar + title) - Clickeable para ver info del usuario
    const headerLeft = document.createElement('div');
    headerLeft.style.display = 'flex';
    headerLeft.style.alignItems = 'center';
    headerLeft.style.gap = '15px';
    headerLeft.style.flex = '1';
    headerLeft.style.cursor = 'pointer';
    headerLeft.id = 'chat-header-left';
    headerLeft.onclick = () => {
        if (onHeaderClick) {
            onHeaderClick();
        }
    };

    const chatAvatar = document.createElement('img');
    chatAvatar.id = 'chat-avatar';
    chatAvatar.style.cssText = 'width: 40px; height: 40px; border-radius: 50%; object-fit: cover; display: none;';
    chatAvatar.alt = 'Chat Avatar';
    headerLeft.appendChild(chatAvatar);

    const title = document.createElement('h3');
    title.id = 'chat-title';
    title.innerText = 'Select a conversation';
    headerLeft.appendChild(title);

    header.appendChild(headerLeft);

    // Call button (only for user chats)
    const callBtn = document.createElement('button');
    callBtn.id = 'call-btn';
    callBtn.innerHTML = '📞';
    callBtn.className = 'header-btn';
    callBtn.title = 'Start Call';
    callBtn.style.cssText = 'background: transparent; border: none; font-size: 24px; cursor: pointer; padding: 5px 15px; opacity: 0.7; transition: opacity 0.2s; display: none;';
    callBtn.onmouseover = () => callBtn.style.opacity = '1';
    callBtn.onmouseout = () => callBtn.style.opacity = '0.7';
    callBtn.onclick = () => {
        console.log('[UI] Call button clicked');
        if (currentChat && currentChat.type === 'user') {
            try {
                startCall();
            } catch (e) {
                console.error('[UI] Error calling startCall:', e);
                alert('Error starting call: ' + e.message);
            }
        }
    };
    header.appendChild(callBtn);

    // Diagnostics Button
    const diagBtn = document.createElement('button');
    diagBtn.innerHTML = '🩺';
    diagBtn.className = 'header-btn';
    diagBtn.title = 'Run Diagnostics';
    diagBtn.style.cssText = 'background: transparent; border: none; font-size: 24px; cursor: pointer; padding: 5px 15px; opacity: 0.7; transition: opacity 0.2s;';
    diagBtn.onclick = async () => {
        console.log('[UI] Running diagnostics...');
        const report = [];
        report.push('--- Diagnostics ---');

        // Check Microphone
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            report.push('✅ Microphone access granted');
            stream.getTracks().forEach(t => t.stop());
        } catch (e) {
            report.push('❌ Microphone access denied: ' + e.message);
        }

        // Check REST API
        try {
            const res = await fetch('http://localhost:5001/api/users/online');
            if (res.ok) report.push('✅ REST API reachable');
            else report.push('❌ REST API error: ' + res.status);
        } catch (e) {
            report.push('❌ REST API unreachable: ' + e.message);
        }

        alert(report.join('\n'));
    };
    header.appendChild(diagBtn);

    const groupSettingsBtn = document.createElement('button');
    groupSettingsBtn.id = 'group-settings-btn';
    groupSettingsBtn.innerText = '⚙️';
    groupSettingsBtn.style.cssText = 'display: none; background: transparent; border: none; font-size: 24px; cursor: pointer; padding: 5px 15px; opacity: 0.7; transition: opacity 0.2s;';
    groupSettingsBtn.onmouseover = () => groupSettingsBtn.style.opacity = '1';
    groupSettingsBtn.onmouseout = () => groupSettingsBtn.style.opacity = '0.7';
    groupSettingsBtn.onclick = () => showGroupSettings();
    header.appendChild(groupSettingsBtn);

    chatArea.appendChild(header);

    const messages = document.createElement('div');
    messages.className = 'chat-messages';
    messages.id = 'chat-messages';
    chatArea.appendChild(messages);

    const inputArea = document.createElement('div');
    inputArea.className = 'chat-input';
    inputArea.id = 'chat-input-area';
    inputArea.style.display = 'none';

    // File/Attachment button
    const fileBtn = document.createElement('button');
    fileBtn.innerHTML = '📎';
    fileBtn.style.cssText = 'width: 48px; height: 48px; font-size: 1.5rem; color: var(--text-secondary); background: transparent; border: none; border-radius: 50%; cursor: pointer; transition: background-color 0.3s, color 0.3s; display: flex; align-items: center; justify-content: center;';
    fileBtn.onmouseover = () => {
        fileBtn.style.backgroundColor = 'var(--input-background)';
        fileBtn.style.color = 'var(--primary-green)';
    };
    fileBtn.onmouseout = () => {
        fileBtn.style.backgroundColor = 'transparent';
        fileBtn.style.color = 'var(--text-secondary)';
    };
    fileBtn.onclick = () => attachFile();

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Type a message...';
    input.id = 'message-input';
    input.onkeypress = (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    };

    // Audio recording button
    const audioBtn = document.createElement('button');
    audioBtn.innerHTML = '🎤';
    audioBtn.style.cssText = 'width: 48px; height: 48px; font-size: 1.5rem; color: var(--text-secondary); background: transparent; border: none; border-radius: 50%; cursor: pointer; transition: background-color 0.3s, color 0.3s; display: flex; align-items: center; justify-content: center;';
    audioBtn.onmouseover = () => {
        audioBtn.style.backgroundColor = 'var(--input-background)';
        audioBtn.style.color = 'var(--primary-green)';
    };
    audioBtn.onmouseout = () => {
        audioBtn.style.backgroundColor = 'transparent';
        audioBtn.style.color = 'var(--text-secondary)';
    };
    audioBtn.onclick = () => recordAndSendAudio();

    const sendBtn = document.createElement('button');
    sendBtn.innerText = 'Send';
    sendBtn.onclick = sendMessage;

    inputArea.appendChild(fileBtn);
    inputArea.appendChild(input);
    inputArea.appendChild(audioBtn);
    inputArea.appendChild(sendBtn);
    chatArea.appendChild(inputArea);

    return chatArea;
}

async function initializeChat(username) {
    try {
        // Initialize ICE with user context
        initializeICE(username);

        // Login via REST API
        const loginResult = await login(username);
        console.log('Login result:', loginResult);

        if (!loginResult.success) {
            alert('Error al conectar: ' + loginResult.message);
            return;
        }

        // Subscribe to ICE events for real-time notifications
        try {
            await subscribeViaICE(username,
                (message) => handleIncomingMessageViaICE(message),
                (call) => handleCallStartedViaICE(call),
                (callId) => handleCallEndedViaICE(callId)
            );
            console.log('[UI] Subscribed to ICE events');
        } catch (iceError) {
            console.warn('[UI] ICE subscription failed, continuing with REST polling:', iceError);
        }

        // Load users
        await showUsers();

        // Start polling for messages every 2 seconds
        startMessagePolling(username);

        // Load message history from server
        await loadMessageHistory(username);
    } catch (error) {
        console.error('Error initializing chat:', error);
        // Show a more detailed error and a retry option
        showConnectionError(error);
    }

    // Initialize Audio Service
    initializeAudioService(username,
        (callOrCaller) => {
            // On incoming call (fallback from AudioServer)
            console.log('[UI] Incoming call signal received:', callOrCaller);

            let callObj;
            if (typeof callOrCaller === 'string') {
                callObj = { caller: callOrCaller, callId: `${callOrCaller}_${Date.now()}`, active: true };
            } else {
                callObj = callOrCaller;
            }

            // Use the same UI handler as Ice calls
            handleCallStartedViaICE(callObj);
        },
        (ender) => {
            // On call ended
            console.log('[UI] Call ended callback triggered by', ender);
            const peer = ender || activeCallPeer;
            const durationMs = activeCallStartTime ? Date.now() - activeCallStartTime : 0;
            logCallEndOnce(peer, durationMs);
            activeCallPeer = null;
            activeCallStartTime = null;
            localHangupInitiated = false;
            localHangupPeer = null;
            hideCallUI();
        },
        (remoteUser) => {
            // onCallConnected callback - update UI for both sides
            const currentCallInfo = getWebRTCCurrentCall ? getWebRTCCurrentCall() : null;
            activeCallPeer = remoteUser || activeCallPeer;
            if (currentCallInfo && currentCallInfo.state === 'connected') {
                activeCallStartTime = Date.now();
                activeCallEndLogged = false;
                const isCaller = currentCallInfo && currentCallInfo.isCaller;
                if (remoteUser) {
                    // Caller sends to both; callee logs locally to ensure visibility even if ICE delivery fails
                    logCallEvent(remoteUser, 'started', 0, isCaller);
                }
                updateCallUIStatus('In call');
            } else {
                updateCallUIStatus('Connecting...');
            }
        },
        (sender, message) => {
            // onAudioMessageReceived callback
            if (message.type === 'audio') {
                const chatKey = `user_${sender}`;
                if (!messageCache[chatKey]) {
                    messageCache[chatKey] = [];
                }
                messageCache[chatKey].push({ from: sender, content: JSON.stringify(message), isSent: false, timestamp: new Date() });
                if (currentChat && currentChat.type === 'user' && currentChat.name === sender) {
                    addAudioMessageToUI(sender, message, false);
                }
            }
        },
        (from) => {
            // onCallRejected callback
            alert(`Call rejected by ${from}`);
            hideCallUI();
        }
    );
    // Listen to custom incoming-audio events (fallback from audioService)
    window.addEventListener('incoming-audio', (ev) => {
        const { from, audio } = ev.detail || {};
        if (from && audio) {
            addAudioMessageToUI(from, audio, false);
        }
    });
}

async function testConnections(username) {
    const restResult = await getAllUsers();
    let iceResult = { success: false };
    try {
        await getHistoryViaICE(username);
        iceResult.success = true;
    } catch (err) {
        iceResult.success = false;
        iceResult.message = err.message;
    }
    return { rest: restResult, ice: iceResult };
}

async function loadMessageHistory(username) {
    try {
        const result = await getHistory(username);

        if (result.success && result.history) {
            console.log('[DEBUG] Loading history, total entries:', result.history.length);

            // Procesar mensajes históricos
            result.history.forEach(entry => {
                try {
                    // Parsear el registro (formato: {type:text,from:X,target:Y,isGroup:false,msg:...,ts:...})
                    const from = entry.match(/from:([^,]+)/)?.[1];
                    const target = entry.match(/target:([^,]+)/)?.[1];
                    const isGroup = entry.includes('isGroup:true');
                    const msg = entry.match(/msg:(.*?),ts:/)?.[1];
                    const tsStr = entry.match(/ts:([^}]+)[}\]]?$/)?.[1];
                    const ts = tsStr ? new Date(tsStr) : new Date();

                    if (!from || !target || !msg) return;

                    // Determinar la clave del chat
                    let chatKey;
                    let messageFrom;

                    if (isGroup) {
                        chatKey = `group_${target}`;
                        messageFrom = from;
                    } else {
                        // Para mensajes privados, la clave es el otro usuario
                        chatKey = from === username ? `user_${target}` : `user_${from}`;
                        messageFrom = from;
                    }

                    // Agregar al cache SIN DUPLICAR
                    if (!messageCache[chatKey]) {
                        messageCache[chatKey] = [];
                    }

                    // Verificar si el mensaje ya existe (por contenido y from)
                    const isDuplicate = messageCache[chatKey].some(m =>
                        m.from === messageFrom && m.content === msg
                    );

                    if (!isDuplicate) {
                        messageCache[chatKey].push({
                            from: messageFrom,
                            content: msg,
                            isSent: (from === username),
                            timestamp: ts
                        });
                    }
                } catch (err) {
                    console.error('Error parsing history entry:', entry, err);
                }
            });

            console.log('[DEBUG] Loaded message history, cache:', messageCache);
        }
    } catch (error) {
        console.error('Error loading message history:', error);
    }
}

let pollingInterval = null;

function startMessagePolling(username) {
    // Clear any existing interval
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }

    // Poll every 2 seconds
    pollingInterval = setInterval(async () => {
        try {
            const result = await getPendingMessages(username);
            if (result.success && result.messages && result.messages.length > 0) {
                result.messages.forEach(msg => {
                    processIncomingMessage(msg);
                });
            }
        } catch (error) {
            console.error('Error polling messages:', error);
        }
    }, 2000);
}

function processIncomingMessage(msg) {
    // Format: "MSG|from|content" or "GROUP|groupName|from|content"
    const parts = msg.split('|');

    console.log('Processing incoming message:', msg, 'Parts:', parts);

    if (parts[0] === 'MSG') {
        // Direct message
        const from = parts[1];
        const content = parts.slice(2).join('|');
        const chatKey = `user_${from}`;
        const ts = new Date();

        console.log('Direct message from:', from, 'Current chat:', currentChat);

        // Check if it's a special message type (file or audio)
        try {
            const parsedContent = JSON.parse(content);
            if (parsedContent.type === 'file') {
                // Handle file message
                if (!messageCache[chatKey]) {
                    messageCache[chatKey] = [];
                }
                const isDuplicate = messageCache[chatKey].some(m =>
                    m.from === from && m.content === content
                );
                if (!isDuplicate) {
                    messageCache[chatKey].push({ from, content, isSent: false, timestamp: ts });
                    if (currentChat && currentChat.type === 'user' && currentChat.name === from) {
                        parsedContent.timestamp = ts;
                        addFileMessageToUI(from, parsedContent, false);
                    }
                }
                return;
            } else if (parsedContent.type === 'audio') {
                // Handle audio message
                if (!messageCache[chatKey]) {
                    messageCache[chatKey] = [];
                }
                const isDuplicate = messageCache[chatKey].some(m =>
                    m.from === from && m.content === content
                );
                if (!isDuplicate) {
                    messageCache[chatKey].push({ from, content, isSent: false, timestamp: ts });
                    if (currentChat && currentChat.type === 'user' && currentChat.name === from) {
                        parsedContent.timestamp = ts;
                        addAudioMessageToUI(from, parsedContent, false);
                    }
                }
                return;
            }
        } catch (e) {
            // Not a JSON message, treat as regular text
        }

        // Check if this is an INCOMING_CALL message
        if (content.startsWith('INCOMING_CALL|')) {
            const callParts = content.split('|');
            if (callParts.length >= 3) {
                const caller = callParts[1];
                const callId = callParts[2];
                console.log('[UI] Intercepted INCOMING_CALL from', caller, 'callId:', callId);

                // Show incoming call UI directly
                showIncomingCallUI({
                    caller: caller,
                    callId: callId,
                    active: true
                });

                // Don't display this as a regular message
                return;
            }
        }

        // Regular text message
        // Agregar al cache SIN DUPLICAR
        if (!messageCache[chatKey]) {
            messageCache[chatKey] = [];
        }

        // Verificar si el mensaje ya existe
        const isDuplicate = messageCache[chatKey].some(m =>
            m.from === from && m.content === content
        );

        if (!isDuplicate) {
            messageCache[chatKey].push({ from, content, isSent: false, timestamp: ts });
            if (currentChat && currentChat.type === 'user' && currentChat.name === from) {
                addMessageToUI(from, content, false, ts);
            }
        }

    } else if (parts[0] === 'GROUP') {
        // Group message
        const groupName = parts[1];
        const from = parts[2];
        const content = parts.slice(3).join('|');
        const chatKey = `group_${groupName}`;
        const ts = new Date();

        console.log(`Group message in ${groupName} from ${from}: ${content}`);

        // Ignore messages from self (already added locally)
        const username = sessionStorage.getItem('username');
        if (from === username) return;

        // Check if it's a special message type (file or audio)
        try {
            const parsedContent = JSON.parse(content);
            if (parsedContent.type === 'file') {
                if (!messageCache[chatKey]) {
                    messageCache[chatKey] = [];
                }
                const isDuplicate = messageCache[chatKey].some(m =>
                    m.from === from && m.content === content
                );
                if (!isDuplicate) {
                    messageCache[chatKey].push({ from, content, isSent: false, timestamp: ts });
                    if (currentChat && currentChat.type === 'group' && currentChat.name === groupName) {
                        addFileMessageToUI(from, parsedContent, false);
                    }
                }
                return;
            } else if (parsedContent.type === 'audio') {
                if (!messageCache[chatKey]) {
                    messageCache[chatKey] = [];
                }
                const isDuplicate = messageCache[chatKey].some(m =>
                    m.from === from && m.content === content
                );
                if (!isDuplicate) {
                    messageCache[chatKey].push({ from, content, isSent: false, timestamp: ts });
                    if (currentChat && currentChat.type === 'group' && currentChat.name === groupName) {
                        parsedContent.timestamp = ts;
                        addAudioMessageToUI(from, parsedContent, false);
                    }
                }
                return;
            }
        } catch (e) {
            // Not a JSON message
        }

        if (!messageCache[chatKey]) {
            messageCache[chatKey] = [];
        }

        const isDuplicate = messageCache[chatKey].some(m =>
            m.from === from && m.content === content
        );
        if (!isDuplicate) {
            messageCache[chatKey].push({ from, content, isSent: false, timestamp: ts });
            if (currentChat && currentChat.type === 'group' && currentChat.name === groupName) {
                addMessageToUI(from, content, false, ts);
            }
        }
    }
}

async function showUsers() {
    const content = document.getElementById('sidebar-content');
    content.innerHTML = '<p style="padding: 20px; text-align: center;">Loading users...</p>';

    // Clear group polling interval if active
    if (groupListInterval) {
        clearInterval(groupListInterval);
        groupListInterval = null;
    }
    // Start user list polling
    if (!userListInterval) {
        userListInterval = setInterval(loadUsersList, 5001); // Refresh every 5 seconds
    }

    await loadUsersList();
}

async function loadUsersList() {
    const content = document.getElementById('sidebar-content');

    try {
        const result = await getAllUsers();
        content.innerHTML = '';

        if (!result.success || !result.users) {
            content.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">No users found</p>';
            return;
        }

        const currentUsername = sessionStorage.getItem('username');
        const usersMap = result.users; // {username: isOnline}

        // Mostrar todos los usuarios sin distinción de estado
        const allUsers = Object.keys(usersMap).filter(username => username !== currentUsername);

        if (allUsers.length === 0) {
            content.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">No other users</p>';
            return;
        }

        // Crear header simple
        const header = document.createElement('div');
        header.style.cssText = 'padding: 10px 15px; font-weight: 600; color: #E9EDEF; font-size: 0.85rem;';
        header.innerText = `USERS (${allUsers.length})`;
        content.appendChild(header);

        // Mostrar todos los usuarios
        allUsers.forEach(username => {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            userItem.setAttribute('data-username', username);
            userItem.onclick = () => selectUser(username);

            // Verificar si el usuario tiene imagen de perfil
            const savedImage = localStorage.getItem(`profile-image-${username}`);

            const avatar = document.createElement('div');
            avatar.className = 'user-avatar';

            if (savedImage) {
                // Si tiene imagen, usar como background
                avatar.style.backgroundImage = `url(${savedImage})`;
                avatar.style.backgroundSize = 'cover';
                avatar.style.backgroundPosition = 'center';
            } else {
                // Si no tiene imagen, usar el avatar estilo WhatsApp
                avatar.classList.add('user-avatar-default');
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('viewBox', '0 0 24 24');
                svg.setAttribute('fill', 'currentColor');
                svg.setAttribute('width', '24px');
                svg.setAttribute('height', '24px');

                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z');

                svg.appendChild(path);
                avatar.appendChild(svg);
            }

            userItem.appendChild(avatar);

            const info = document.createElement('div');
            info.className = 'user-info';

            const name = document.createElement('div');
            name.className = 'user-name';
            name.innerText = username;

            info.appendChild(name);
            userItem.appendChild(avatar);
            userItem.appendChild(info);
            content.appendChild(userItem);
        });

    } catch (error) {
        console.error('Error loading users:', error);
        content.innerHTML = '<p style="padding: 20px; text-align: center; color: red;">Error loading users</p>';
    }
}

async function showGroups() {
    const content = document.getElementById('sidebar-content');
    content.innerHTML = '<p style="padding: 20px; text-align: center;">Loading groups...</p>';

    // Clear user polling interval if active
    if (userListInterval) {
        clearInterval(userListInterval);
        userListInterval = null;
    }

    // Start group list polling
    if (!groupListInterval) {
        groupListInterval = setInterval(loadGroupsList, 5001); // Refresh every 5 seconds
    }

    await loadGroupsList();
}

async function loadGroupsList() {
    const content = document.getElementById('sidebar-content');

    try {
        const username = sessionStorage.getItem('username');
        const result = await getUserGroups(username);
        content.innerHTML = '';

        const createBtn = document.createElement('button');
        createBtn.className = 'create-group-btn';
        createBtn.innerText = '+ Create Group';
        createBtn.style.cssText = 'margin: 10px; padding: 10px; width: calc(100% - 20px); background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;';
        createBtn.onclick = showCreateGroupDialog;
        content.appendChild(createBtn);

        if (!result.success || !result.groups || result.groups.length === 0) {
            const noGroups = document.createElement('p');
            noGroups.style.cssText = 'padding: 20px; text-align: center; color: #999;';
            noGroups.innerText = 'No groups yet. Create one!';
            content.appendChild(noGroups);
            return;
        }

        result.groups.forEach(groupName => {
            const groupItem = document.createElement('div');
            groupItem.className = 'group-item';
            groupItem.setAttribute('data-groupname', groupName);
            groupItem.onclick = () => selectGroup(groupName);

            const avatar = document.createElement('div');
            avatar.className = 'user-avatar';

            // Cargar ícono personalizado si existe
            const savedIcon = localStorage.getItem(`group-icon-${groupName}`);
            if (savedIcon) {
                avatar.style.backgroundImage = `url(${savedIcon})`;
                avatar.style.backgroundSize = 'cover';
                avatar.style.backgroundPosition = 'center';
                avatar.innerText = '';
            } else {
                avatar.innerText = groupName.charAt(0).toUpperCase();
                avatar.style.background = '#28a745';
            }

            const info = document.createElement('div');
            info.className = 'user-info';

            const name = document.createElement('div');
            name.className = 'user-name';
            name.innerText = groupName;

            const status = document.createElement('div');
            status.className = 'user-status';
            status.innerText = 'group';

            info.appendChild(name);
            info.appendChild(status);
            groupItem.appendChild(avatar);
            groupItem.appendChild(info);
            content.appendChild(groupItem);
        });
    } catch (error) {
        console.error('Error loading groups:', error);
        content.innerHTML = '<p style="padding: 20px; text-align: center; color: red;">Error loading groups</p>';
    }
}

async function showCreateGroupDialog() {
    // Crear modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.maxWidth = '500px';

    const title = document.createElement('h2');
    title.innerText = 'Create New Group';
    title.style.marginBottom = '20px';

    const groupNameLabel = document.createElement('label');
    groupNameLabel.innerText = 'Group Name:';
    groupNameLabel.style.display = 'block';
    groupNameLabel.style.marginBottom = '8px';
    groupNameLabel.style.fontWeight = '600';

    const groupNameInput = document.createElement('input');
    groupNameInput.type = 'text';
    groupNameInput.placeholder = 'Enter group name...';
    groupNameInput.style.marginBottom = '15px';

    const membersLabel = document.createElement('label');
    membersLabel.innerText = 'Select Members:';
    membersLabel.style.display = 'block';
    membersLabel.style.marginBottom = '8px';
    membersLabel.style.fontWeight = '600';

    const usersList = document.createElement('div');
    usersList.className = 'group-modal-users';
    usersList.innerHTML = '<p style="text-align: center; padding: 20px;">Loading users...</p>';

    // Obtener TODOS los usuarios (no solo online)
    try {
        const result = await getAllUsers();
        const currentUsername = sessionStorage.getItem('username');

        if (result.success && result.users) {
            usersList.innerHTML = '';

            // result.users es un objeto {username: isOnline}
            const allUsernames = Object.keys(result.users).filter(u => u !== currentUsername);

            if (allUsernames.length > 0) {
                allUsernames.forEach(username => {
                    const item = document.createElement('div');
                    item.className = 'user-checkbox-item';

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.id = `user-${username}`;
                    checkbox.value = username;

                    const label = document.createElement('label');
                    label.htmlFor = `user-${username}`;
                    label.innerText = username;

                    item.appendChild(checkbox);
                    item.appendChild(label);
                    usersList.appendChild(item);

                    // Make entire item clickable
                    item.onclick = (e) => {
                        if (e.target !== checkbox) {
                            checkbox.checked = !checkbox.checked;
                        }
                    };
                });

                const info = document.createElement('div');
                info.className = 'group-modal-info';
                info.innerText = `You will be added as admin automatically`;
                usersList.appendChild(info);
            } else {
                usersList.innerHTML = '<p style="text-align: center; padding: 20px; color: #999;">No other users available</p>';
            }
        } else {
            usersList.innerHTML = '<p style="text-align: center; padding: 20px; color: #999;">No other users available</p>';
        }
    } catch (error) {
        usersList.innerHTML = '<p style="text-align: center; padding: 20px; color: red;">Error loading users</p>';
    }

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-cancel';
    cancelBtn.innerText = 'Cancel';
    cancelBtn.onclick = () => {
        document.body.removeChild(modal);
    };

    const createBtn = document.createElement('button');
    createBtn.className = 'btn-create';
    createBtn.innerText = 'Create Group';
    createBtn.onclick = async () => {
        const groupName = groupNameInput.value.trim();
        if (!groupName) {
            alert('Please enter a group name');
            return;
        }

        const username = sessionStorage.getItem('username');
        const checkboxes = usersList.querySelectorAll('input[type="checkbox"]:checked');
        const selectedUsers = Array.from(checkboxes).map(cb => cb.value);

        try {
            // Crear grupo
            const result = await createGroup(groupName, username);
            if (!result.success) {
                alert('Error creating group: ' + result.message);
                return;
            }

            // Agregar miembros seleccionados
            for (const member of selectedUsers) {
                await addMemberToGroup(groupName, member);
            }

            document.body.removeChild(modal);
            alert(`Group "${groupName}" created with ${selectedUsers.length} members!`);
            showGroups(); // Refresh
        } catch (error) {
            alert('Error creating group: ' + error.message);
        }
    };

    actions.appendChild(cancelBtn);
    actions.appendChild(createBtn);

    modalContent.appendChild(title);
    modalContent.appendChild(groupNameLabel);
    modalContent.appendChild(groupNameInput);
    modalContent.appendChild(membersLabel);
    modalContent.appendChild(usersList);
    modalContent.appendChild(actions);

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    groupNameInput.focus();
}

async function showGroupSettings() {
    if (!currentChat || currentChat.type !== 'group') return;

    const groupName = currentChat.name;
    const username = sessionStorage.getItem('username');

    // Crear modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.maxWidth = '500px';

    const title = document.createElement('h2');
    title.innerText = 'Group Settings';
    title.style.cssText = 'margin-bottom: 10px; color: #E9EDEF; font-size: 24px;';

    const groupNameTitle = document.createElement('h3');
    groupNameTitle.innerText = groupName;
    groupNameTitle.style.cssText = 'color: #00A884; margin-bottom: 30px; font-size: 18px; font-weight: 500;';

    // Sección de ícono del grupo
    const iconSection = document.createElement('div');
    iconSection.className = 'settings-section';

    const iconLabel = document.createElement('label');
    iconLabel.innerText = 'Group Icon';
    iconLabel.className = 'settings-label';

    const iconPreview = document.createElement('div');
    iconPreview.style.cssText = 'width: 100px; height: 100px; border-radius: 50%; background: #28a745; display: flex; align-items: center; justify-content: center; font-size: 48px; color: white; margin: 0 auto 15px; position: relative; cursor: pointer;';

    // Cargar ícono guardado o usar inicial
    const savedIcon = localStorage.getItem(`group-icon-${groupName}`);
    if (savedIcon) {
        iconPreview.style.backgroundImage = `url(${savedIcon})`;
        iconPreview.style.backgroundSize = 'cover';
        iconPreview.style.backgroundPosition = 'center';
        iconPreview.innerText = '';
    } else {
        iconPreview.innerText = groupName.charAt(0).toUpperCase();
    }

    const iconUploadBtn = document.createElement('button');
    iconUploadBtn.className = 'settings-upload-btn';
    iconUploadBtn.innerText = 'Change Icon';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const imageData = event.target.result;
                localStorage.setItem(`group-icon-${groupName}`, imageData);
                iconPreview.style.backgroundImage = `url(${imageData})`;
                iconPreview.style.backgroundSize = 'cover';
                iconPreview.style.backgroundPosition = 'center';
                iconPreview.innerText = '';

                // Actualizar ícono en la lista de grupos
                updateGroupIconInList(groupName, imageData);
            };
            reader.readAsDataURL(file);
        }
    };

    iconUploadBtn.onclick = () => fileInput.click();
    iconPreview.onclick = () => fileInput.click();

    iconSection.appendChild(iconLabel);
    iconSection.appendChild(iconPreview);
    iconSection.appendChild(iconUploadBtn);
    iconSection.appendChild(fileInput);

    const membersSection = document.createElement('div');
    membersSection.className = 'settings-section';

    const membersLabel = document.createElement('label');
    membersLabel.innerText = 'Add Members';
    membersLabel.className = 'settings-label';

    const usersList = document.createElement('div');
    usersList.className = 'group-modal-users';
    usersList.innerHTML = '<p style="text-align: center; padding: 20px;">Loading users...</p>';

    try {
        const result = await getAllUsers();

        if (result.success && result.users) {
            usersList.innerHTML = '';

            const allUsernames = Object.keys(result.users).filter(u => u !== username);

            if (allUsernames.length > 0) {
                allUsernames.forEach(user => {
                    const item = document.createElement('div');
                    item.className = 'user-checkbox-item';

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.id = `add-user-${user}`;
                    checkbox.value = user;

                    const label = document.createElement('label');
                    label.htmlFor = `add-user-${user}`;
                    label.innerText = user;

                    item.appendChild(checkbox);
                    item.appendChild(label);
                    usersList.appendChild(item);

                    item.onclick = (e) => {
                        if (e.target !== checkbox) {
                            checkbox.checked = !checkbox.checked;
                        }
                    };
                });
            } else {
                usersList.innerHTML = '<p style="text-align: center; padding: 20px; color: #999;">No other users available</p>';
            }
        }
    } catch (error) {
        usersList.innerHTML = '<p style="text-align: center; padding: 20px; color: red;">Error loading users</p>';
    }

    const addMembersBtn = document.createElement('button');
    addMembersBtn.className = 'settings-action-btn';
    addMembersBtn.innerText = 'Add Selected Members';
    addMembersBtn.onclick = async () => {
        const checkboxes = usersList.querySelectorAll('input[type="checkbox"]:checked');
        const selectedUsers = Array.from(checkboxes).map(cb => cb.value);

        if (selectedUsers.length === 0) {
            alert('Please select at least one user');
            return;
        }

        try {
            for (const member of selectedUsers) {
                await addMemberToGroup(groupName, member);
            }
            alert(`Added ${selectedUsers.length} members to the group!`);
            checkboxes.forEach(cb => cb.checked = false);
        } catch (error) {
            alert('Error adding members: ' + error.message);
        }
    };

    membersSection.appendChild(membersLabel);
    membersSection.appendChild(usersList);
    membersSection.appendChild(addMembersBtn);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'settings-close-btn';
    closeBtn.innerText = 'Close';
    closeBtn.onclick = () => {
        document.body.removeChild(modal);
    };

    modalContent.appendChild(title);
    modalContent.appendChild(groupNameTitle);
    modalContent.appendChild(iconSection);
    modalContent.appendChild(membersSection);
    modalContent.appendChild(closeBtn);

    modal.appendChild(modalContent);
    document.body.appendChild(modal);
}

function updateGroupIconInList(groupName, imageData) {
    const groupItems = document.querySelectorAll('.user-item');
    groupItems.forEach(item => {
        const nameDiv = item.querySelector('.user-name');
        if (nameDiv && nameDiv.innerText === groupName) {
            const avatar = item.querySelector('.user-avatar');
            if (avatar) {
                avatar.style.backgroundImage = `url(${imageData})`;
                avatar.style.backgroundSize = 'cover';
                avatar.style.backgroundPosition = 'center';
                avatar.innerText = '';
            }
        }
    });
}

async function showAddMembersDialog(groupName) {
    try {
        const result = await getOnlineUsers();
        if (!result.success || !result.users) {
            alert('Error loading users');
            return;
        }

        const username = sessionStorage.getItem('username');
        const otherUsers = result.users.filter(u => u !== username);

        if (otherUsers.length === 0) {
            alert('No other users online');
            showGroups();
            return;
        }

        const membersToAdd = prompt(
            'Enter usernames to add (comma-separated):\nAvailable: ' + otherUsers.join(', ')
        );

        if (!membersToAdd) {
            showGroups();
            return;
        }

        const members = membersToAdd.split(',').map(m => m.trim());

        // Add each member
        for (const member of members) {
            if (otherUsers.includes(member)) {
                await addMemberToGroup(groupName, member);
            }
        }

        alert('Members added successfully!');
        showGroups();

    } catch (error) {
        console.error('Error adding members:', error);
        alert('Failed to add members');
        showGroups();
    }
}

async function selectGroup(groupName) {
    currentChat = { type: 'group', name: groupName };

    document.getElementById('chat-title').innerText = '👥 ' + groupName;

    // Cerrar panel de información de usuario si está abierto
    const userInfoPanel = document.querySelector('.user-info-panel');
    if (userInfoPanel) {
        userInfoPanel.classList.remove('visible');
    }

    // Ocultar avatar (no mostrar avatar para grupos)
    const chatAvatar = document.getElementById('chat-avatar');
    if (chatAvatar) {
        chatAvatar.style.display = 'none';
    }

    // Ocultar botón de llamada para grupos
    const callBtn = document.getElementById('call-btn');
    if (callBtn) {
        callBtn.style.display = 'none';
    }

    // Mostrar botón de configuración del grupo
    const groupSettingsBtn = document.getElementById('group-settings-btn');
    if (groupSettingsBtn) {
        groupSettingsBtn.style.display = 'block';
    }

    // Mostrar input de mensaje
    const inputArea = document.getElementById('chat-input-area');
    if (inputArea) {
        inputArea.style.display = 'flex';
    }

    // Clear previous selection
    document.querySelectorAll('.user-item, .group-item').forEach(item => {
        item.classList.remove('active');
    });

    // Mark selected by group name
    const selectedItem = document.querySelector(`.group-item[data-groupname="${groupName}"]`);
    if (selectedItem) {
        selectedItem.classList.add('active');
    }

    // Auto-join group if not already a member
    const username = sessionStorage.getItem('username');
    try {
        await addMemberToGroup(groupName, username);
    } catch (error) {
        console.log('Already in group or error joining:', error);
    }

    // Load messages from cache
    const messagesArea = document.getElementById('chat-messages');
    messagesArea.innerHTML = '';

    const chatKey = `group_${groupName}`;
    if (messageCache[chatKey] && messageCache[chatKey].length > 0) {
        messageCache[chatKey].forEach(msg => {
            addMessageToUI(msg.from, msg.content, msg.isSent, msg.timestamp);
        });
    } else {
        messagesArea.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">Group chat: ' + groupName + '</p>';
    }
}

let currentChat = null;
let messageCache = {}; // Cache de mensajes por conversación
let userListInterval = null;
let groupListInterval = null;
let activeCallPeer = null;
let activeCallStartTime = null;
let activeCallEndLogged = false;
let localHangupInitiated = false;
let localHangupPeer = null;

// Exponer messageCache globalmente para UserInfoPanel
window.messageCache = messageCache;

function selectUser(username) {
    currentChat = { type: 'user', name: username };

    const titleEl = document.getElementById('chat-title');
    if (titleEl) {
        titleEl.innerText = username;
    } else {
        console.error('[UI] chat-title element not found in selectUser');
    }

    // Cerrar panel de información de usuario si está abierto
    const userInfoPanel = document.querySelector('.user-info-panel');
    if (userInfoPanel) {
        userInfoPanel.classList.remove('visible');
    }

    // Mostrar avatar del usuario
    const chatAvatar = document.getElementById('chat-avatar');
    if (chatAvatar) {
        const savedImage = localStorage.getItem(`profile-image-${username}`);
        if (savedImage) {
            chatAvatar.src = savedImage;
        } else {
            // Si no hay imagen guardada, usar avatar por defecto
            chatAvatar.src = defaultAvatar;
        }
        chatAvatar.style.display = 'block';
    }

    // Mostrar botón de llamada para chats de usuario
    const callBtn = document.getElementById('call-btn');
    if (callBtn) {
        callBtn.style.display = 'block';
    }

    // Ocultar botón de configuración del grupo
    const groupSettingsBtn = document.getElementById('group-settings-btn');
    if (groupSettingsBtn) {
        groupSettingsBtn.style.display = 'none';
    }

    // Mostrar input de mensaje
    const inputArea = document.getElementById('chat-input-area');
    if (inputArea) {
        inputArea.style.display = 'flex';
    }

    // Clear previous selection
    document.querySelectorAll('.user-item, .group-item').forEach(item => {
        item.classList.remove('active');
    });

    // Mark selected by username
    const selectedItem = document.querySelector(`.user-item[data-username="${username}"]`);
    if (selectedItem) {
        selectedItem.classList.add('active');
    }

    // Load messages from cache
    const messagesArea = document.getElementById('chat-messages');
    messagesArea.innerHTML = '';

    const chatKey = `user_${username}`;
    if (messageCache[chatKey] && messageCache[chatKey].length > 0) {
        messageCache[chatKey].forEach(msg => {
            addMessageToUI(msg.from, msg.content, msg.isSent, msg.timestamp);
        });
    } else {
        messagesArea.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">Start a conversation with ' + username + '</p>';
    }
}

// Show a non-blocking connection error message and allow retrying
function showConnectionError(error) {
    console.error('Connection error details:', error);

    // Simple inline modal
    const existing = document.getElementById('connection-error-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'connection-error-overlay';
    overlay.className = 'modal';
    overlay.style.display = 'flex';
    overlay.style.zIndex = 9999;

    const content = document.createElement('div');
    content.className = 'modal-content';
    content.style.maxWidth = '480px';

    const title = document.createElement('h2');
    title.innerText = 'Connection error';
    const details = document.createElement('div');
    details.innerText = `Failed to connect to chat server: ${error && error.message ? error.message : 'Unknown error'}`;
    details.style.marginBottom = '16px';
    details.style.color = '#e74c3c';

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '8px';

    const closeBtn = document.createElement('button');
    closeBtn.innerText = 'Close';
    closeBtn.onclick = () => overlay.remove();

    const retryBtn = document.createElement('button');
    retryBtn.innerText = 'Retry';
    retryBtn.onclick = () => {
        overlay.remove();
        const username = sessionStorage.getItem('username');
        if (username) initializeChat(username);
    };

    const debugBtn = document.createElement('button');
    debugBtn.innerText = 'Check Connectivity';
    debugBtn.onclick = async () => {
        debugBtn.disabled = true;
        debugBtn.innerText = 'Checking...';
        try {
            const username = sessionStorage.getItem('username') || 'testuser-debug';
            const res = await testConnections(username);
            const debugResult = `REST: ${res.rest.success ? 'OK' : 'ERROR (' + (res.rest.message || 'unknown') + ')'}\nICE: ${res.ice.success ? 'OK' : 'ERROR (' + (res.ice.message || 'unknown') + ')'}`;
            alert(debugResult);
        } catch (err) {
            alert('Error running connectivity check: ' + err.message);
        } finally {
            debugBtn.disabled = false;
            debugBtn.innerText = 'Check Connectivity';
        }
    };

    actions.appendChild(debugBtn);
    actions.appendChild(closeBtn);
    actions.appendChild(retryBtn);

    content.appendChild(title);
    content.appendChild(details);
    content.appendChild(actions);
    overlay.appendChild(content);
    document.body.appendChild(overlay);
}

async function sendMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();

    if (!message || !currentChat) return;

    const username = sessionStorage.getItem('username');

    try {
        let result;
        let chatKey;

        if (currentChat.type === 'user') {
            result = await sendMessageToUser(username, currentChat.name, message);
            chatKey = `user_${currentChat.name}`;
        } else if (currentChat.type === 'group') {
            result = await sendMessageToGroup(username, currentChat.name, message);
            chatKey = `group_${currentChat.name}`;
        }

        if (!result.success) {
            alert('Error al enviar mensaje: ' + result.message);
            return;
        }

        // Guardar en cache
        if (!messageCache[chatKey]) {
            messageCache[chatKey] = [];
        }
        messageCache[chatKey].push({ from: username, content: message, isSent: true, timestamp: new Date() });

        // Add message to UI
        addMessageToUI(username, message, true, new Date());

        input.value = '';
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message');
    }
}

function formatTimestamp(ts) {
    const dateObj = ts ? new Date(ts) : new Date();
    const now = new Date();

    const sameDay = dateObj.toDateString() === now.toDateString();

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = dateObj.toDateString() === yesterday.toDateString();

    if (sameDay) {
        return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (isYesterday) {
        return `Yesterday ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function addMessageToUI(from, content, isSent, ts = null) {
    const messagesArea = document.getElementById('chat-messages');
    if (!messagesArea) return;

    // Remove placeholder if exists
    if (messagesArea.children.length === 1 && messagesArea.children[0].tagName === 'P') {
        messagesArea.innerHTML = '';
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ' + (isSent ? 'sent' : 'received');

    const header = document.createElement('div');
    header.className = 'message-header';
    header.innerText = from;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Check if content is a special message (file or audio)
    try {
        const parsedContent = JSON.parse(content);
        if (parsedContent.type === 'file') {
            if (!parsedContent.timestamp && ts) {
                parsedContent.timestamp = ts;
            }
            addFileMessageToUI(from, parsedContent, isSent);
            return;
        } else if (parsedContent.type === 'audio') {
            if (!parsedContent.timestamp && ts) {
                parsedContent.timestamp = ts;
            }
            addAudioMessageToUI(from, parsedContent, isSent);
            return;
        } else if (parsedContent.type === 'call_log') {
            const label = parsedContent.status === 'ended'
                ? `Call ended${parsedContent.durationMs ? ` • ${formatDuration(parsedContent.durationMs)}` : ''}`
                : 'Call started';
            bubble.innerText = `📞 ${label}`;
        } else {
            bubble.innerText = content;
        }
    } catch (e) {
        // Not a JSON message, treat as regular text
        bubble.innerText = content;
    }

    const time = document.createElement('div');
    time.className = 'message-time';
    time.innerText = formatTimestamp(ts);

    messageDiv.appendChild(header);
    messageDiv.appendChild(bubble);
    messageDiv.appendChild(time);

    messagesArea.appendChild(messageDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function logCallEvent(peer, status, durationMs = 0, shouldSend = true) {
    const username = sessionStorage.getItem('username');
    const payload = JSON.stringify({ type: 'call_log', status, durationMs });
    const chatKey = `user_${peer}`;

    if (!messageCache[chatKey]) {
        messageCache[chatKey] = [];
    }

    // Avoid duplicate call_log entries with the same payload
    const alreadyLogged = messageCache[chatKey].some(m => m.content === payload);
    if (alreadyLogged) {
        return;
    }

    const entry = {
        from: shouldSend ? username : peer,
        content: payload,
        isSent: shouldSend,
        timestamp: new Date()
    };
    messageCache[chatKey].push(entry);

    if (currentChat && currentChat.type === 'user' && currentChat.name === peer) {
        addMessageToUI(entry.from, entry.content, entry.isSent, entry.timestamp);
    }

    if (shouldSend) {
        try {
            await sendMessageViaICE(peer, payload);
        } catch (err) {
            console.warn('[UI] Failed to send call log via ICE:', err);
        }
    }
}

function logCallEndOnce(peer, durationMs) {
    if (!peer || activeCallEndLogged) return;
    activeCallEndLogged = true;
    logCallEvent(peer, 'ended', durationMs, true);
}

function addFileMessageToUI(from, fileMessage, isSent) {
    const messagesArea = document.getElementById('chat-messages');
    if (!messagesArea) return;

    // Remove placeholder if exists
    if (messagesArea.children.length === 1 && messagesArea.children[0].tagName === 'P') {
        messagesArea.innerHTML = '';
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ' + (isSent ? 'sent' : 'received');

    const header = document.createElement('div');
    header.className = 'message-header';
    header.innerText = from;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble file-message';

    // Create file preview/download element
    const fileElement = document.createElement('div');
    fileElement.className = 'file-attachment';

    // File icon based on type
    const fileIcon = document.createElement('div');
    fileIcon.className = 'file-icon';
    if (fileMessage.mimeType.startsWith('image/')) {
        fileIcon.innerHTML = '🖼️';
    } else if (fileMessage.mimeType.startsWith('audio/')) {
        fileIcon.innerHTML = '🎵';
    } else if (fileMessage.mimeType.startsWith('video/')) {
        fileIcon.innerHTML = '🎥';
    } else {
        fileIcon.innerHTML = '📄';
    }

    const fileInfo = document.createElement('div');
    fileInfo.className = 'file-info';

    const fileName = document.createElement('div');
    fileName.className = 'file-name';
    fileName.innerText = fileMessage.name;

    const fileSize = document.createElement('div');
    fileSize.className = 'file-size';
    fileSize.innerText = formatFileSize(fileMessage.size);

    fileInfo.appendChild(fileName);
    fileInfo.appendChild(fileSize);

    // Download button
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'file-download-btn';
    downloadBtn.innerHTML = '⬇️';
    downloadBtn.title = 'Download file';
    downloadBtn.onclick = () => downloadFile(fileMessage);

    fileElement.appendChild(fileIcon);
    fileElement.appendChild(fileInfo);
    fileElement.appendChild(downloadBtn);

    // If it's an image, show preview
    if (fileMessage.mimeType.startsWith('image/')) {
        const imagePreview = document.createElement('img');
        imagePreview.className = 'file-preview';
        imagePreview.src = fileMessage.data;
        imagePreview.onclick = () => downloadFile(fileMessage);
        fileElement.appendChild(imagePreview);
    }

    bubble.appendChild(fileElement);

    const time = document.createElement('div');
    time.className = 'message-time';
    const ts = fileMessage && fileMessage.timestamp ? fileMessage.timestamp : new Date();
    time.innerText = formatTimestamp(ts);

    messageDiv.appendChild(header);
    messageDiv.appendChild(bubble);
    messageDiv.appendChild(time);

    messagesArea.appendChild(messageDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function downloadFile(fileMessage) {
    const link = document.createElement('a');
    link.href = fileMessage.data;
    link.download = fileMessage.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function addAudioMessageToUI(from, audioMessage, isSent) {
    const messagesArea = document.getElementById('chat-messages');
    if (!messagesArea) return;

    // Remove placeholder if exists
    if (messagesArea.children.length === 1 && messagesArea.children[0].tagName === 'P') {
        messagesArea.innerHTML = '';
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ' + (isSent ? 'sent' : 'received');
    messageDiv.style.display = 'flex';
    messageDiv.style.flexDirection = 'column';
    messageDiv.style.alignItems = isSent ? 'flex-end' : 'flex-start';
    messageDiv.style.marginBottom = '10px';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble audio-message';
    bubble.style.padding = '10px';
    bubble.style.borderRadius = '10px';
    bubble.style.backgroundColor = isSent ? '#dcf8c6' : '#fff'; // WhatsApp-like colors
    bubble.style.boxShadow = '0 1px 1px rgba(0,0,0,0.1)';
    bubble.style.minWidth = '200px';
    bubble.style.maxWidth = '300px';
    bubble.style.position = 'relative';

    // Sender Name (only for received messages in groups, or always if desired)
    if (!isSent) {
        const senderName = document.createElement('div');
        senderName.innerText = from;
        senderName.style.fontSize = '12px';
        senderName.style.fontWeight = 'bold';
        senderName.style.color = '#e542a3'; // Random color or fixed
        senderName.style.marginBottom = '5px';
        bubble.appendChild(senderName);
    }

    // Audio Player Container
    const audioElement = document.createElement('div');
    audioElement.style.display = 'flex';
    audioElement.style.alignItems = 'center';
    audioElement.style.gap = '10px';

    // Play Button
    const playBtn = document.createElement('button');
    playBtn.innerHTML = '▶️';
    playBtn.style.background = 'none';
    playBtn.style.border = 'none';
    playBtn.style.fontSize = '20px';
    playBtn.style.cursor = 'pointer';
    playBtn.style.color = '#555';

    // Progress Bar
    const progressContainer = document.createElement('div');
    progressContainer.style.flex = '1';
    progressContainer.style.height = '4px';
    progressContainer.style.backgroundColor = '#ccc';
    progressContainer.style.borderRadius = '2px';
    progressContainer.style.position = 'relative';
    progressContainer.style.cursor = 'pointer';

    const progressBar = document.createElement('div');
    progressBar.style.width = '0%';
    progressBar.style.height = '100%';
    progressBar.style.backgroundColor = '#34b7f1'; // WhatsApp blueish
    progressBar.style.borderRadius = '2px';
    progressContainer.appendChild(progressBar);

    // Duration / Info
    const audioInfo = document.createElement('div');
    audioInfo.innerText = '0:00'; // Placeholder, update with duration
    audioInfo.style.fontSize = '11px';
    audioInfo.style.color = '#999';
    audioInfo.style.minWidth = '30px';
    audioInfo.style.textAlign = 'right';

    // Audio Object
    const audio = new Audio(`data:audio/wav;base64,${audioMessage.data}`);

    // Load metadata to get duration
    audio.onloadedmetadata = () => {
        const duration = Math.round(audio.duration);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        audioInfo.innerText = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    let isPlaying = false;

    playBtn.onclick = () => {
        if (isPlaying) {
            audio.pause();
            playBtn.innerHTML = '▶️';
            isPlaying = false;
        } else {
            // Stop other audios? (Optional)
            audio.play();
            playBtn.innerHTML = '⏸️';
            isPlaying = true;
        }
    };

    audio.onended = () => {
        playBtn.innerHTML = '▶️';
        isPlaying = false;
        progressBar.style.width = '0%';
    };

    audio.ontimeupdate = () => {
        if (audio.duration) {
            const progress = (audio.currentTime / audio.duration) * 100;
            progressBar.style.width = progress + '%';
        }
    };

    // Seek functionality
    progressContainer.onclick = (e) => {
        const rect = progressContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        const percentage = x / width;
        if (audio.duration) {
            audio.currentTime = percentage * audio.duration;
        }
    };

    audioElement.appendChild(playBtn);
    audioElement.appendChild(progressContainer);
    audioElement.appendChild(audioInfo);

    bubble.appendChild(audioElement);

    // Time
    const time = document.createElement('div');
    const ts = audioMessage && audioMessage.timestamp ? new Date(audioMessage.timestamp) : new Date();
    time.innerText = formatTimestamp(ts);
    time.style.fontSize = '10px';
    time.style.color = '#999';
    time.style.textAlign = 'right';
    time.style.marginTop = '4px';
    bubble.appendChild(time);

    messageDiv.appendChild(bubble);
    messagesArea.appendChild(messageDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

// ICE Event Handlers
function handleIncomingMessageViaICE(message) {
    console.log('[ICE] Incoming message:', message);

    // Resolve target chat key (user or group)
    const resolvedGroupName = (() => {
        if (message.receiver && message.receiver.startsWith('#')) {
            return message.receiver.replace(/^#/, '');
        }
        if (message.group || message.groupName) {
            return (message.group || message.groupName).replace(/^#/, '');
        }
        if (message.receiver && messageCache[`group_${message.receiver}`]) {
            return message.receiver.replace(/^#/, '');
        }
        // If current chat is a group and receiver matches that name, treat as group
        if (currentChat && currentChat.type === 'group' && message.receiver === currentChat.name) {
            return message.receiver;
        }
        return null;
    })();
    const isGroupMsg = !!resolvedGroupName;
    const groupName = resolvedGroupName;
    const chatKey = isGroupMsg ? `group_${groupName}` : `user_${message.sender}`;

    // Add to cache
    if (!messageCache[chatKey]) {
        messageCache[chatKey] = [];
    }

    const tsObj = message.timestamp ? new Date(message.timestamp) : new Date();

    // Check for duplicates
    const msgTime = tsObj.getTime();
    const isDuplicate = messageCache[chatKey].some(m => {
        const cachedTs = m.timestamp ? new Date(m.timestamp).getTime() : null;
        return m.from === message.sender && m.content === message.content && cachedTs === msgTime;
    });

    if (!isDuplicate) {
        messageCache[chatKey].push({
            from: message.sender,
            content: message.content,
            isSent: false,
            isAudio: message.isAudio,
            timestamp: tsObj
        });

        // Show if in conversation
        const inCurrentChat = currentChat && (
            (!isGroupMsg && currentChat.type === 'user' && currentChat.name === message.sender) ||
            (isGroupMsg && currentChat.type === 'group' && currentChat.name === groupName)
        );

        if (inCurrentChat) {
            // Check if it's an audio message
            if (message.isAudio) {
                console.log('[ICE] Received audio message');
                // Parse audio data from content (base64)
                try {
                    const audioData = JSON.parse(message.content);
                    audioData.timestamp = tsObj;
                    addAudioMessageToUI(message.sender, audioData, false);
                } catch (e) {
                    console.error('[ICE] Failed to parse audio message:', e);
                    addMessageToUI(message.sender, message.content, false, tsObj);
                }
            }
            // Check if it's a file message (content starts with FILE:)
            else if (message.content.startsWith('FILE:')) {
                console.log('[ICE] Received file message');
                try {
                    const fileData = JSON.parse(message.content.substring(5));
                    fileData.timestamp = tsObj;
                    addFileMessageToUI(message.sender, fileData, false);
                } catch (e) {
                    console.error('[ICE] Failed to parse file message:', e);
                    addMessageToUI(message.sender, message.content, false, tsObj);
                }
            }
            // Check for special call accept messages via ICE: content is JSON { type: 'CALL_ACCEPT', format }
            let iceHandled = false;
            try {
                const parsed = JSON.parse(message.content);
                if (parsed && parsed.type === 'CALL_ACCEPT') {
                    console.log('[ICE] Received CALL_ACCEPT from', message.sender, 'format=', parsed.format);
                    // If we are the caller, start streaming to the callee
                    const currentUser = sessionStorage.getItem('username');
                    if (currentUser === message.receiver) {
                        if (parsed.format === 'pcm') {
                            startAudioStreamingPCM(message.sender);
                        } else {
                            startAudioStreaming(message.sender);
                        }
                        updateCallUIStatus('In call');
                        addMessageToUI(message.sender, '(call accepted)', false, tsObj);
                        iceHandled = true;
                    }
                } else if (parsed && parsed.type === 'call_log') {
                    console.log('[ICE] Received call log from', message.sender, parsed);
                    const existing = messageCache[chatKey].some(m => m.content === message.content);
                    if (!existing) {
                        messageCache[chatKey].push({
                            from: message.sender,
                            content: message.content,
                            isSent: false,
                            timestamp: tsObj
                        });
                        // Only show in current chat
                        const inCurrentChat = currentChat && (
                            (!isGroupMsg && currentChat.type === 'user' && currentChat.name === message.sender) ||
                            (isGroupMsg && currentChat.type === 'group' && currentChat.name === groupName)
                        );
                        if (inCurrentChat) {
                            addMessageToUI(message.sender, message.content, false, tsObj);
                        }
                    }
                    iceHandled = true;
                }
            } catch (e) {
                // Not a JSON call accept, fall through
            }

            // Regular text message if not already handled by the ICE call accept
            if (!iceHandled) {
                addMessageToUI(message.sender, message.content, false, tsObj);
            }
        }
    }
}

function handleCallStartedViaICE(call) {
    console.log('[ICE] Call started:', call);

    // If the ICE event doesn't carry a WebRTC offer, try to attach a cached one from signaling
    if (!call.offer) {
        try {
            const cachedOffer = getPendingOffer(call.caller);
            if (cachedOffer) {
                call.offer = cachedOffer;
                console.log('[UI] Attached cached WebRTC offer for', call.caller);
            }
        } catch (e) {
            console.warn('[UI] Could not attach cached offer:', e);
        }
    }

    if (!call.offer) {
        console.warn('[UI] Ignoring call without WebRTC offer; waiting for signaling payload.');
        return;
    }

    // Show incoming call UI
    showIncomingCallUI(call);
}

function handleCallEndedViaICE(callId) {
    console.log('[ICE] Call ended:', callId);

    // Stop audio streaming without notifying (already ended)
    try {
        endAudioCall(false);
    } catch (e) {
        console.warn('[UI] Error stopping audio during handleCallEndedViaICE:', e);
    }

    const peer = activeCallPeer;
    const durationMs = activeCallStartTime ? Date.now() - activeCallStartTime : 0;
    logCallEndOnce(peer, durationMs);
    activeCallPeer = null;
    activeCallStartTime = null;
    localHangupInitiated = false;
    localHangupPeer = null;
    // Hide call UI if active
    hideCallUI();
}

// Call UI Functions
function showIncomingCallUI(call) {
    // Remove existing call UI
    hideCallUI();

    const overlay = document.createElement('div');
    overlay.className = 'call-overlay';
    overlay.id = 'call-overlay';

    const modal = document.createElement('div');
    modal.className = 'call-modal';

    const avatar = document.createElement('div');
    avatar.className = 'call-avatar';
    avatar.innerText = call.caller.charAt(0).toUpperCase();

    const name = document.createElement('div');
    name.className = 'call-name';
    name.innerText = call.caller;

    const status = document.createElement('div');
    status.className = 'call-status';
    status.id = 'call-status';
    status.innerText = 'Incoming voice call...';

    // Timer display
    const timer = document.createElement('div');
    timer.className = 'call-timer';
    timer.id = 'call-timer';
    timer.style.fontSize = '14px';
    timer.style.color = '#999';
    timer.style.marginTop = '10px';
    timer.style.display = 'none';
    timer.innerText = '00:00';

    const actions = document.createElement('div');
    actions.className = 'call-actions';

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'call-btn accept';
    acceptBtn.innerHTML = '📞';
    acceptBtn.title = 'Accept call';
    acceptBtn.onclick = () => acceptCall(call);

    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'call-btn reject';
    rejectBtn.innerHTML = '📞';
    rejectBtn.title = 'Reject call';
    rejectBtn.onclick = () => rejectCall(call);

    actions.appendChild(rejectBtn);
    actions.appendChild(acceptBtn);

    modal.appendChild(avatar);
    modal.appendChild(name);
    modal.appendChild(status);
    modal.appendChild(timer);
    modal.appendChild(actions);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

function hideCallUI() {
    // Stop call timer
    stopCallTimer();

    const overlay = document.getElementById('call-overlay');
    if (overlay) {
        document.body.removeChild(overlay);
    }
}

async function acceptCall(call) {
    console.log('[UI] Accepting call:', call);
    // Accept call through AudioService (ICE + WebRTC) and start audio streaming
    try {
        activeCallPeer = call.caller;
        activeCallStartTime = null;
        activeCallEndLogged = false;
        localHangupInitiated = false;
        localHangupPeer = null;
        await acceptAudioCall(call.caller, call.callId, call.offer);
        console.log('[UI] Audio accept sent via service. Starting streaming.');

        // Start call timer
        startCallTimer();

        // Update UI
        updateCallUIStatus('In call');
        const timerEl = document.getElementById('call-timer');
        if (timerEl) {
            timerEl.style.display = 'block';
        }
    } catch (err) {
        console.error('[UI] Error accepting call via service:', err);
        alert('Error accepting call: ' + (err.message || err));
    }
}

async function rejectCall(call) {
    console.log('[UI] Rejecting call:', call);
    try {
        await rejectAudioCall(call.caller);
        if (activeCallPeer === call.caller) {
            activeCallPeer = null;
            activeCallStartTime = null;
            localHangupInitiated = false;
            localHangupPeer = null;
        }
        hideCallUI();
    } catch (err) {
        console.error('[UI] Error rejecting call:', err);
    }
}

async function startCall() {
    if (!currentChat || currentChat.type !== 'user') return;
    const username = sessionStorage.getItem('username');
    const callee = currentChat.name;
    try {
        console.log(`[UI] Starting call from ${username} to ${callee}`);
        activeCallPeer = callee;
        activeCallStartTime = null;
        activeCallEndLogged = false;
        localHangupInitiated = false;
        localHangupPeer = null;
        // Show outgoing UI
        showOutgoingCallUI(callee);
        // Use audioService to create offer and send CALL_REQUEST
        await startAudioCall(callee);
        // Update UI status
        updateCallUIStatus('Calling...');
    } catch (error) {
        console.error('[UI] Error starting call:', error);
        hideCallUI();
        alert('Failed to start call: ' + error.message);
    }
}

function showOutgoingCallUI(callee) {
    // Remove existing call UI
    hideCallUI();

    const overlay = document.createElement('div');
    overlay.className = 'call-overlay';
    overlay.id = 'call-overlay';

    const modal = document.createElement('div');
    modal.className = 'call-modal ringing';

    const avatar = document.createElement('div');
    avatar.className = 'call-avatar';
    avatar.innerText = callee.charAt(0).toUpperCase();

    const name = document.createElement('div');
    name.className = 'call-name';
    name.innerText = callee;

    const status = document.createElement('div');
    status.className = 'call-status';
    status.id = 'call-status';
    status.innerText = 'Calling...';

    // Timer display
    const timer = document.createElement('div');
    timer.className = 'call-timer';
    timer.id = 'call-timer';
    timer.style.fontSize = '14px';
    timer.style.color = '#999';
    timer.style.marginTop = '10px';
    timer.style.display = 'none';
    timer.innerText = '00:00';

    const actions = document.createElement('div');
    actions.className = 'call-actions';

    const hangupBtn = document.createElement('button');
    hangupBtn.className = 'call-btn reject';
    hangupBtn.innerHTML = '📞';
    hangupBtn.title = 'Hang up';
    hangupBtn.onclick = () => hangupCall();

    actions.appendChild(hangupBtn);

    modal.appendChild(avatar);
    modal.appendChild(name);
    modal.appendChild(status);
    modal.appendChild(timer);
    modal.appendChild(actions);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

function updateCallUIStatus(statusText) {
    const statusEl = document.getElementById('call-status');
    if (statusEl) {
        statusEl.innerText = statusText;
    }

    // If call is connected, start timer
    if (statusText === 'In call' || statusText.includes('Connected')) {
        startCallTimer();
        const timerEl = document.getElementById('call-timer');
        if (timerEl) {
            timerEl.style.display = 'block';
        }
    }
}

function startCallTimer() {
    stopCallTimer(); // Clear any existing timer
    callStartTime = Date.now();

    callTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;

        const timerEl = document.getElementById('call-timer');
        if (timerEl) {
            timerEl.innerText = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
    }, 1000);
}

function stopCallTimer() {
    if (callTimer) {
        clearInterval(callTimer);
        callTimer = null;
    }
    callStartTime = null;
}

async function hangupCall() {
    console.log('[UI] Hanging up call');

    try {
        const currentCallInfo = getWebRTCCurrentCall ? getWebRTCCurrentCall() : null;
        if (!activeCallPeer && currentCallInfo && currentCallInfo.remoteUser) {
            activeCallPeer = currentCallInfo.remoteUser;
        }
        localHangupInitiated = true;
        localHangupPeer = activeCallPeer;
        // Stop audio streaming first
        endAudioCall(true); // Notify the other party

        // Get active calls and end them via ICE
        const username = sessionStorage.getItem('username');
        const activeCalls = await getActiveCallsViaICE(username);

        for (const call of activeCalls) {
            await endCallViaICE(call.callId);
        }

        const durationMs = activeCallStartTime ? Date.now() - activeCallStartTime : 0;
        logCallEndOnce(activeCallPeer, durationMs);
        hideCallUI();
    } catch (error) {
        console.error('[UI] Error hanging up call:', error);
        hideCallUI();
    }
}

let isRecording = false;
let callTimer = null;
let callStartTime = null;

async function recordAndSendAudio() {
    if (!currentChat) return;

    if (isRecording) {
        stopRecording();
        return;
    }

    const username = sessionStorage.getItem('username');
    const receiver = currentChat.name;

    try {
        isRecording = true;
        console.log('[UI] Recording audio...');

        // Show recording indicator
        const audioBtn = document.querySelector('.chat-input button:nth-child(3)');
        const originalText = audioBtn.innerHTML; // Should be mic
        const originalColor = audioBtn.style.color;

        audioBtn.innerHTML = '⏹️'; // Stop icon
        audioBtn.style.color = '#ff0000';
        audioBtn.style.animation = 'pulse 1s infinite';

        // Record audio (max 60s)
        const audioBase64 = await recordAudio(60000);

        // Reset button
        audioBtn.innerHTML = '🎤';
        audioBtn.style.color = originalColor;
        audioBtn.style.animation = 'none';

        console.log('[UI] Audio recorded, sending...');

        // Create audio message object
        const audioMessage = {
            type: 'audio',
            data: audioBase64,
            duration: 5000, // Placeholder, ideally we calculate this
            timestamp: Date.now()
        };

        // Send via ICE (RPC)
        if (currentChat.type === 'user') {
            await sendAudioViaICE(receiver, audioBase64);
        } else if (currentChat.type === 'group') {
            // Ensure group name has # prefix for Ice handler
            const target = receiver.startsWith('#') ? receiver : '#' + receiver;
            await sendAudioViaICE(target, audioBase64);
            // Fallback/broadcast via REST messaging so all group members receive the audio payload
            try {
                await sendMessageToGroup(username, receiver, JSON.stringify(audioMessage));
            } catch (restErr) {
                console.warn('[UI] Failed to send audio to group via REST fallback:', restErr);
            }
        }

        // Cache and add audio message to UI
        const chatKey = currentChat.type === 'group' ? `group_${receiver}` : `user_${receiver}`;
        if (!messageCache[chatKey]) {
            messageCache[chatKey] = [];
        }
        messageCache[chatKey].push({ from: username, content: JSON.stringify(audioMessage), isSent: true, timestamp: new Date() });
        addAudioMessageToUI(username, audioMessage, true);

        console.log('[UI] Audio sent successfully');
    } catch (error) {
        console.error('[UI] Error recording/sending audio:', error);
        alert('Failed to record/send audio: ' + (error.message || JSON.stringify(error)));

        // Reset button in case of error
        const audioBtn = document.querySelector('.chat-input button:nth-child(3)');
        if (audioBtn) {
            audioBtn.innerHTML = '🎤';
            audioBtn.style.color = 'var(--text-secondary)';
            audioBtn.style.animation = 'none';
        }
    } finally {
        isRecording = false;
    }
}

function attachFile() {
    if (!currentChat) return;

    // Create file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,audio/*,video/*,application/*,text/*';
    fileInput.style.display = 'none';

    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const username = sessionStorage.getItem('username');
        const receiver = currentChat.name;

        try {
            console.log('[UI] Attaching file:', file.name);

            // Convert file to base64
            const reader = new FileReader();
            reader.onload = async (event) => {
                const base64 = event.target.result.split(',')[1];
                const fileData = `data:${file.type};base64,${base64}`;

                // Create file message object
                const fileMessage = {
                    type: 'file',
                    name: file.name,
                    size: file.size,
                    mimeType: file.type,
                    data: fileData
                };

                // Send as JSON string via regular message
                const messageContent = JSON.stringify(fileMessage);

                if (currentChat.type === 'user') {
                    await sendMessageToUser(username, receiver, messageContent);
                } else if (currentChat.type === 'group') {
                    await sendMessageToGroup(username, receiver, messageContent);
                }

                // Add file message to UI
                addFileMessageToUI(username, fileMessage, true);

                console.log('[UI] File attached successfully');
            };

            reader.readAsDataURL(file);
        } catch (error) {
            console.error('[UI] Error attaching file:', error);
            alert('Failed to attach file: ' + error.message);
        }
    };

    // Trigger file selection
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}


export default Chat;
