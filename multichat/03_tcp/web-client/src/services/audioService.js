/**
 * Audio Service - Handles Real-time Audio Calls via WebSocket
 * Now uses WebRTC for peer-to-peer audio connections
 */

import { startCallViaICE, sendMessageViaICE } from './iceDelegate.js';
import * as WebRTCService from './webrtcService.js';

const AUDIO_WS_URL = `ws://${window.location.hostname || 'localhost'}:8888`;
let ws = null;
let currentCall = null; // { target: string, peerConnection: null, stream: null }
let localStream = null;
let audioContext = null;
let nextStartTime = 0;

// Callbacks
let onIncomingCallCallback = null;
let onCallEndedCallback = null;
let onAudioMessageReceivedCallback = null;
let onCallRejectedCallback = null;
let audioUsername = null; // set when initializeAudioService called
const pendingOffers = new Map(); // cache incoming offers keyed by caller

export function initializeAudioService(username, onIncomingCall, onCallEnded, onCallAccepted, onAudioMessageReceived, onCallRejected) {
    if (ws) {
        ws.close();
    }

    onIncomingCallCallback = onIncomingCall;
    onCallEndedCallback = onCallEnded;
    // Optional: callback invoked when a CALL_ACCEPT signal arrives
    window.onCallAcceptedCallback = onCallAccepted;
    onAudioMessageReceivedCallback = onAudioMessageReceived;
    onCallRejectedCallback = onCallRejected;
    audioUsername = username;

    ws = new WebSocket(`${AUDIO_WS_URL}/${encodeURIComponent(username)}`);

    ws.onopen = () => {
        console.log('[AUDIO] Connected to Audio Server');
    };

    ws.onclose = (event) => {
        console.warn('[AUDIO] WebSocket closed:', event.code, event.reason);
        // Simple reconnect attempt after 1s
        setTimeout(() => {
            if (!ws || ws.readyState === WebSocket.CLOSED) {
                console.log('[AUDIO] Reconnecting to audio server..');
                initializeAudioService(username, onIncomingCall, onCallEnded);
            }
        }, 1000);
    };

    ws.onmessage = async (event) => {
        const data = event.data;

        if (typeof data === 'string') {
            // Signaling message: SIGNAL|SENDER|TYPE|PAYLOAD
            const parts = data.split('|', 4);
            if (parts[0] === 'SIGNAL') {
                const sender = parts[1];
                const type = parts[2];
                const payload = parts.length > 3 ? parts[3] : '';

                handleSignal(sender, type, payload);
            } else if (parts[0] === 'ERROR') {
                console.error('[AUDIO] Server error:', parts[1]);
            }
        } else if (data instanceof Blob || data instanceof ArrayBuffer) {
            // Audio data
            playAudioChunk(data);
        }
    };

    ws.onerror = (error) => {
        console.error('[AUDIO] WebSocket error:', error);
    };

    // Initialize AudioContext for playback
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Initialize WebRTC service
    WebRTCService.initializeWebRTC(username, ws, {
        onIncomingCall: (from, offer) => {
            // When we receive an OFFER, notify UI about incoming call
            const callObj = {
                caller: from,
                callId: `${from}_${username}_${Date.now()}`,
                active: true,
                offer: offer // Store offer for when user accepts
            };
            if (offer) {
                pendingOffers.set(from, offer);
            } else {
                pendingOffers.delete(from);
            }
            if (onIncomingCallCallback) {
                onIncomingCallCallback(callObj);
            }
        },
        onCallConnected: (remoteUser) => {
            console.log('[AUDIO] WebRTC call connected with:', remoteUser);
            if (window.onCallAcceptedCallback) {
                window.onCallAcceptedCallback(remoteUser);
            }
        },
        onCallEnded: (remoteUser) => {
            console.log('[AUDIO] WebRTC call ended with:', remoteUser);
            if (onCallEndedCallback) {
                onCallEndedCallback(remoteUser);
            }
        },
        onRemoteStream: (stream) => {
            console.log('[AUDIO] Received remote stream via WebRTC');
        }
    });
}

function handleSignal(sender, signalType, payload) {
    console.log('[AUDIO] Signal from', sender, ':', signalType);

    switch (signalType) {
        case 'CALL_REQUEST':
            console.log('[AUDIO] Received CALL_REQUEST from', sender);

            // Parse payload to extract WebRTC offer
            let offer = null;
            try {
                const data = JSON.parse(payload);
                offer = data.offer;
                console.log('[AUDIO] Extracted WebRTC offer from CALL_REQUEST', offer && typeof offer === 'object' ? { type: offer.type } : offer);
                if (offer) {
                    pendingOffers.set(sender, offer);
                } else {
                    pendingOffers.delete(sender);
                }
            } catch (e) {
                console.warn('[AUDIO] No WebRTC offer in CALL_REQUEST payload');
            }

            // Construct a call object for UI
            const callObj = {
                caller: sender,
                callId: `${sender}_${audioUsername}_${Date.now()}`,
                active: true,
                offer: offer // Store offer for when user accepts
            };

            if (typeof onIncomingCallCallback === 'function') {
                onIncomingCallCallback(callObj);
            }
            break;

        case 'CALL_ACCEPT':
            console.log('[AUDIO] Call accepted by', sender);
            if (typeof window.onCallAcceptedCallback === 'function') {
                window.onCallAcceptedCallback(sender);
            }
            break;

        case 'CALL_REJECT':
            console.log('[AUDIO] Call rejected by', sender);
            if (typeof onCallRejectedCallback === 'function') {
                onCallRejectedCallback(sender);
            }
            break;

        case 'CALL_END':
            console.log('[AUDIO] Call ended by', sender);
            pendingOffers.delete(sender);
            // Notify WebRTC layer to tear down the peer connection
            WebRTCService.handleSignalingMessage('CALL_END', sender, '');
            if (typeof onCallEndedCallback === 'function') {
                onCallEndedCallback(sender);
            }
            break;

        // WebRTC Signaling Messages
        case 'OFFER':
            console.log('[AUDIO] Received WebRTC OFFER from', sender);
            try {
                const offer = JSON.parse(payload);
                pendingOffers.set(sender, offer);
                WebRTCService.handleSignalingMessage('OFFER', sender, payload);
            } catch (e) {
                console.error('[AUDIO] Failed to parse OFFER:', e);
            }
            break;

        case 'ANSWER':
            console.log('[AUDIO] Received WebRTC ANSWER from', sender);
            WebRTCService.handleSignalingMessage('ANSWER', sender, payload);
            break;

        case 'ICE_CANDIDATE':
            console.log('[AUDIO] Received ICE_CANDIDATE from', sender);
            WebRTCService.handleSignalingMessage('ICE_CANDIDATE', sender, payload);
            break;

        case 'MSG':
            // Fallback path: server may forward base64-encoded audio (voice note) as SIGNAL|sender|MSG|<base64>
            // Try to decode and play it. If it's not audio, ignore.
            (async () => {
                try {
                    // Payloads may be URI encoded; try decode for safety
                    let p = payload;
                    try { p = decodeURIComponent(payload); } catch (e) { /* ignore */ }

                    // If the payload is JSON (e.g., { type: 'audio', data: 'base64' }), parse it
                    let base64 = null;
                    try {
                        const parsed = JSON.parse(p);
                        if (parsed && parsed.type === 'audio') {
                            base64 = parsed.data;
                        } else if (parsed && parsed.type === 'file' && parsed.data) {
                            // File messages may also be sent via SIGNAL, but the client handles file messages via ICE
                        }
                    } catch (jsonErr) {
                        // Not JSON, continue
                    }

                    // If we didn't get base64 from JSON, check data URI or raw base64
                    if (!base64) {
                        if (p.startsWith('data:')) {
                            const parts = p.split(',');
                            if (parts.length > 1) base64 = parts[1];
                        } else {
                            base64 = p; // assume raw base64 string
                        }
                    }

                    // Quick sanity check: attempt to decode; atob throws on invalid base64
                    const binaryStr = atob(base64);
                    // Convert to ArrayBuffer
                    const len = binaryStr.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryStr.charCodeAt(i);
                    }

                    // Try to play as a WAV blob (recordAudio uses audio/wav)
                    const blob = new Blob([bytes.buffer], { type: 'audio/wav' });
                    console.log('[AUDIO] Received MSG (audio) from', sender, 'playing...');
                    await playAudioChunk(blob);
                    // Also notify UI about incoming audio (if Chat UI provided a callback)
                    try {
                        // Reconstruct an audioMessage object used by Chat.js
                        const audioMessage = { type: 'audio', data: base64, duration: 0, timestamp: Date.now() };
                        if (typeof onAudioMessageReceivedCallback === 'function') {
                            onAudioMessageReceivedCallback(sender, audioMessage);
                        } else {
                            // As a fallback, dispatch a CustomEvent with audio payload so Chat.js can listen
                            const event = new CustomEvent('incoming-audio', { detail: { from: sender, audio: audioMessage } });
                            window.dispatchEvent(event);
                        }
                    } catch (uiErr) {
                        console.warn('[AUDIO] Failed to notify UI about incoming audio:', uiErr);
                    }
                } catch (err) {
                    console.warn('[AUDIO] Received MSG signal, but payload is not playable audio or decoding failed:', err);
                }
            })();
            break;
    }
}

export async function startCall(targetUser) {
    console.log('[AUDIO] Starting WebRTC call to:', targetUser);

    try {
        // First create WebRTC connection and get the offer
        const call = await WebRTCService.createCall(targetUser);
        console.log('[AUDIO] WebRTC offer created');

        // Send CALL_REQUEST via WebSocket with the offer embedded
        if (ws && ws.readyState === WebSocket.OPEN) {
            // Get the offer from the peer connection
            const offer = call.localDescription;
            console.log('[AUDIO] Offer created:', offer && typeof offer === 'object' ? { type: offer.type } : offer);
            const payload = JSON.stringify({
                type: 'CALL_REQUEST',
                offer: offer
            });
            ws.send(`SIGNAL|${targetUser}|CALL_REQUEST|${payload}`);
            console.log('[AUDIO] CALL_REQUEST with WebRTC offer sent to:', targetUser);
        }

        // Also notify via ICE (for call state management)
        await startCallViaICE(audioUsername, targetUser);

        console.log('[AUDIO] WebRTC call initiated to:', targetUser);
    } catch (err) {
        console.error('[AUDIO] Error starting call:', err);
        throw err;
    }
}

export async function acceptCall(callerUser, callId, offer) {
    console.log('[AUDIO] Accepting WebRTC call from:', callerUser, 'callId:', callId);

    try {
        // If the offer is missing in the payload, try reading from the stored call
        // in the WebRTCService (it may have been set there when we received the OFFER).
        let effectiveOffer = offer;
        if (!effectiveOffer) {
            const cachedOffer = pendingOffers.get(callerUser);
            if (cachedOffer) {
                effectiveOffer = cachedOffer;
                console.log('[AUDIO] Using offer from pendingOffers cache');
            }
        }
        if (!effectiveOffer) {
            try {
                const current = WebRTCService.getCurrentCall();
                if (current && current.offer) {
                    effectiveOffer = current.offer;
                    console.log('[AUDIO] Using offer from WebRTCService.getCurrentCall() fallback');
                }
            } catch (getErr) {
                console.warn('[AUDIO] Could not get offer from WebRTCService.getCurrentCall():', getErr);
            }
        }

        if (!effectiveOffer) {
            console.error('[AUDIO] No offer available to accept the call');
            throw new Error('No offer available');
        }

        // Notify via ICE (call accept) for state management/compatibility with server
        try {
            const acceptMessage = JSON.stringify({ type: 'CALL_ACCEPT', from: audioUsername, callId: callId, format: 'webrtc' });
            await sendMessageViaICE(callerUser, acceptMessage);
        } catch (iceErr) {
            console.warn('[AUDIO] Failed to send CALL_ACCEPT via ICE fallback:', iceErr);
        }

        // Accept the WebRTC call
        await WebRTCService.acceptCall(callerUser, effectiveOffer);
        pendingOffers.delete(callerUser);

        console.log('[AUDIO] WebRTC call accepted from:', callerUser);
    } catch (err) {
        console.error('[AUDIO] Error accepting call:', err);
        throw err;
    }
}

export async function rejectCall(caller) {
    console.log('[AUDIO] Rejecting call from:', caller);
    try {
        pendingOffers.delete(caller);
        if (ws && ws.readyState === WebSocket.OPEN) {
            // Send a CALL_REJECT signal to the caller
            ws.send(`SIGNAL|${caller}|CALL_REJECT|{}`);
            return Promise.resolve();
        } else {
            return Promise.reject(new Error('WebSocket not connected'));
        }
    } catch (err) {
        console.error('[AUDIO] Error sending CALL_REJECT signal:', err);
        return Promise.reject(err);
    }
}

export function endCall(notifyTarget = true) {
    console.log('[AUDIO] Ending call, notify:', notifyTarget);

    // End WebRTC call
    WebRTCService.endCall(notifyTarget);

    // Clear state
    currentCall = null;
    audioQueue = [];
    isPlayingQueue = false;
    pendingOffers.clear();

    console.log('[AUDIO] Call ended and cleaned up');
}

// --- PCM streaming support (for Java Player compatibility) ---
let pcmProcessor = null;
let pcmAudioContext = null;
async function startStreamingPCM(target) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Notify server: we will send PCM frames
        ws.send(`START_STREAM|${target}|format=pcm`);

        pcmAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = pcmAudioContext.createMediaStreamSource(localStream);
        const bufferSize = 4096;
        pcmProcessor = pcmAudioContext.createScriptProcessor(bufferSize, 1, 1);
        source.connect(pcmProcessor);
        // Optionally do not connect to destination to avoid local playback
        //pcmProcessor.connect(pcmAudioContext.destination);

        pcmProcessor.onaudioprocess = function (e) {
            const left = e.inputBuffer.getChannelData(0);
            const pcmBuffer = convertFloat32ToInt16(left);
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(pcmBuffer.buffer);
            }
        };

        // Start streaming: no explicit start call required for ScriptProcessor
        currentCall = currentCall || {};
        currentCall.format = 'pcm';
        console.log('[AUDIO] PCM streaming started to', target);
    } catch (err) {
        console.error('[AUDIO] Error starting PCM streaming:', err);
    }
}

function convertFloat32ToInt16(float32Array) {
    const l = float32Array.length;
    const buffer = new ArrayBuffer(l * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < l; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, float32Array[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Int16Array(buffer);
}

// --- Audio Streaming Logic ---

let mediaRecorder = null;

async function startStreaming(target) {
    // Use PCM instead of WebM since individual WebM chunks are not playable
    console.log('[AUDIO] Starting PCM streaming (WebM chunks are not playable individually)');
    return await startStreamingPCM(target);
}

export { startStreaming, startStreamingPCM };

function stopStreaming() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    // Stop PCM streaming if applicable
    if (pcmProcessor) {
        try {
            pcmProcessor.disconnect();
        } catch (e) { }
        pcmProcessor = null;
    }
    if (pcmAudioContext) {
        try {
            pcmAudioContext.close();
        } catch (e) { }
        pcmAudioContext = null;
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send('STOP_STREAM');
    }
}

export function getPendingOffer(caller) {
    return pendingOffers.get(caller);
}

// Audio playback queue
let audioQueue = [];
let isPlayingQueue = false;

async function playAudioChunk(blobOrArrayBuffer) {
    try {
        console.log('[AUDIO] Received audio chunk, type:', blobOrArrayBuffer instanceof Blob ? 'Blob' : 'ArrayBuffer', 'size:', blobOrArrayBuffer.size || blobOrArrayBuffer.byteLength);

        // For WebM streaming, we need to queue the chunks and play them sequentially
        // Individual WebM chunks are not playable on their own

        let blob;
        if (blobOrArrayBuffer instanceof Blob) {
            blob = blobOrArrayBuffer;
        } else {
            // Convert ArrayBuffer to Blob
            blob = new Blob([blobOrArrayBuffer], { type: 'audio/webm;codecs=opus' });
        }

        // Add to queue
        audioQueue.push(blob);

        // Start playing if not already playing
        if (!isPlayingQueue) {
            playNextInQueue();
        }
    } catch (e) {
        console.error('[AUDIO] Error queueing audio chunk:', e);
    }
}

async function playNextInQueue() {
    if (audioQueue.length === 0) {
        isPlayingQueue = false;
        return;
    }

    isPlayingQueue = true;
    const blob = audioQueue.shift();

    try {
        // Create a blob URL and play it
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        // Resume AudioContext if suspended (browser autoplay policy)
        if (audioContext && audioContext.state === 'suspended') {
            console.log('[AUDIO] Resuming suspended AudioContext');
            await audioContext.resume();
        }

        audio.onended = () => {
            console.log('[AUDIO] Chunk playback ended, queue length:', audioQueue.length);
            URL.revokeObjectURL(url);
            playNextInQueue(); // Play next chunk
        };

        audio.onerror = (e) => {
            console.error('[AUDIO] Audio playback error:', e, audio.error);
            URL.revokeObjectURL(url);
            playNextInQueue(); // Try next chunk even if this one failed
        };

        await audio.play();
        console.log('[AUDIO] Playing audio chunk from queue');
    } catch (err) {
        console.error('[AUDIO] Error playing audio from queue:', err);
        playNextInQueue(); // Continue with next chunk
    }
}
