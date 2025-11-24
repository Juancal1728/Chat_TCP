/**
 * WebRTC Service for Audio Calls
 * Handles peer-to-peer audio connections using WebRTC
 */

// Configuration for ICE servers (STUN/TURN)
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// State
let localStream = null;
let peerConnection = null;
let currentCall = null;
let signalingWebSocket = null;
let localUsername = null;

// Callbacks
let onIncomingCallCallback = null;
let onCallConnectedCallback = null;
let onCallEndedCallback = null;
let onRemoteStreamCallback = null;

/**
 * Initialize WebRTC service
 */
export function initializeWebRTC(username, ws, callbacks = {}) {
    localUsername = username;
    signalingWebSocket = ws;

    onIncomingCallCallback = callbacks.onIncomingCall;
    onCallConnectedCallback = callbacks.onCallConnected;
    onCallEndedCallback = callbacks.onCallEnded;
    onRemoteStreamCallback = callbacks.onRemoteStream;

    console.log('[WebRTC] Initialized for user:', username);
}

/**
 * Create and initiate a call to another user
 */
export async function createCall(targetUser) {
    try {
        console.log('[WebRTC] Creating call to:', targetUser);

        // Get local audio stream
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        // Create peer connection
        peerConnection = createPeerConnection(targetUser);

        // Add local stream to peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Create and set offer (don't send it yet - will be sent with CALL_REQUEST)
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        currentCall = {
            remoteUser: targetUser,
            isCaller: true,
            state: 'calling',
            localDescription: offer // Include the offer for external use
        };

        console.log('[WebRTC] Offer created for:', targetUser);
        return currentCall;

    } catch (error) {
        console.error('[WebRTC] Error creating call:', error);
        cleanupCall();
        throw error;
    }
}

/**
 * Accept an incoming call
 */
export async function acceptCall(callerUser, offer) {
    try {
        console.log('[WebRTC] Accepting call from:', callerUser);

        // Get local audio stream
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        // Create peer connection
        peerConnection = createPeerConnection(callerUser);

        // Add local stream to peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Set remote description (offer)
        const offerDesc = typeof offer === 'string' ? { type: 'offer', sdp: offer } : offer;
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offerDesc));

        // Create and send answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // Send answer via signaling
        sendSignalingMessage('ANSWER', callerUser, JSON.stringify(answer));

        currentCall = {
            remoteUser: callerUser,
            isCaller: false,
            state: 'connected'
        };

        console.log('[WebRTC] Answer sent to:', callerUser);
        return currentCall;

    } catch (error) {
        console.error('[WebRTC] Error accepting call:', error);
        cleanupCall();
        throw error;
    }
}

/**
 * End the current call
 */
export function endCall(notifyRemote = true) {
    console.log('[WebRTC] Ending call, notify:', notifyRemote);

    const remoteUser = currentCall ? currentCall.remoteUser : null;

    if (currentCall && notifyRemote) {
        sendSignalingMessage('CALL_END', remoteUser, '');
    }

    cleanupCall();

    if (onCallEndedCallback) {
        onCallEndedCallback(remoteUser);
    }
}

/**
 * Handle incoming signaling messages
 */
export async function handleSignalingMessage(type, from, data) {
    console.log('[WebRTC] Received signaling:', type, 'from:', from);

    try {
        switch (type) {
            case 'OFFER':
                const offer = JSON.parse(data);
                // Notify UI about incoming call
                if (onIncomingCallCallback) {
                    onIncomingCallCallback(from, offer);
                }
                break;

            case 'ANSWER':
                const answer = JSON.parse(data);
                if (peerConnection) {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                    console.log('[WebRTC] Remote description set (answer)');

                    if (currentCall) {
                        currentCall.state = 'connected';
                    }

                    if (onCallConnectedCallback) {
                        onCallConnectedCallback(from);
                    }
                }
                break;

            case 'ICE_CANDIDATE':
                const candidate = JSON.parse(data);
                if (peerConnection && candidate) {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                    console.log('[WebRTC] ICE candidate added');
                }
                break;

            case 'CALL_END':
                console.log('[WebRTC] Call ended by remote user');
                cleanupCall();
                if (onCallEndedCallback) {
                    onCallEndedCallback(from);
                }
                break;

            default:
                console.warn('[WebRTC] Unknown signaling type:', type);
        }
    } catch (error) {
        console.error('[WebRTC] Error handling signaling message:', error);
    }
}

/**
 * Create RTCPeerConnection with event handlers
 */
function createPeerConnection(remoteUser) {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('[WebRTC] Sending ICE candidate');
            sendSignalingMessage('ICE_CANDIDATE', remoteUser, JSON.stringify(event.candidate));
        }
    };

    // Handle remote stream
    pc.ontrack = (event) => {
        console.log('[WebRTC] Received remote track');
        const remoteStream = event.streams[0];

        // Play remote audio
        const audioElement = new Audio();
        audioElement.srcObject = remoteStream;
        audioElement.play().catch(e => {
            console.error('[WebRTC] Error playing remote audio:', e);
        });

        if (onRemoteStreamCallback) {
            onRemoteStreamCallback(remoteStream);
        }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
        console.log('[WebRTC] Connection state:', pc.connectionState);

        if (pc.connectionState === 'connected') {
            console.log('[WebRTC] Peer connection established!');
            if (onCallConnectedCallback && currentCall) {
                onCallConnectedCallback(currentCall.remoteUser);
            }
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
            console.log('[WebRTC] Connection failed/closed');
            cleanupCall();
        }
    };

    // Handle ICE connection state
    pc.oniceconnectionstatechange = () => {
        console.log('[WebRTC] ICE connection state:', pc.iceConnectionState);
    };

    return pc;
}

/**
 * Send signaling message via WebSocket
 */
function sendSignalingMessage(type, targetUser, data) {
    if (!signalingWebSocket || signalingWebSocket.readyState !== WebSocket.OPEN) {
        console.error('[WebRTC] WebSocket not connected');
        return;
    }

    const message = `SIGNAL|${targetUser}|${type}|${data}`;
    signalingWebSocket.send(message);
    console.log('[WebRTC] Sent signaling message:', type, 'to:', targetUser);
}

/**
 * Cleanup call resources
 */
function cleanupCall() {
    console.log('[WebRTC] Cleaning up call resources');

    // Stop local stream
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    // Close peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    currentCall = null;
}

/**
 * Get current call state
 */
export function getCurrentCall() {
    return currentCall;
}

/**
 * Check if in a call
 */
export function isInCall() {
    return currentCall !== null && peerConnection !== null;
}
