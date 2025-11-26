/**
 * Audio Service - Servicio principal que coordina todas las funcionalidades de audio
 * Ahora usa WebRTC para conexiones peer-to-peer de audio
 */

import config from '../config.js';
import * as WebRTCService from './webrtcService.js';
import { AudioSignalingService } from './audio/AudioSignalingService.js';
import { AudioPlaybackService } from './audio/AudioPlaybackService.js';
import { AudioStreamingService } from './audio/AudioStreamingService.js';
import { AudioCallService } from './audio/AudioCallService.js';

// Instancias de servicios
let signalingService = null;
let playbackService = null;
let streamingService = null;
let callService = null;

// Callbacks
let onIncomingCallCallback = null;
let onCallEndedCallback = null;
let onCallAcceptedCallback = null;
let onAudioMessageReceivedCallback = null;
let onCallRejectedCallback = null;

export function initializeAudioService(username, onIncomingCall, onCallEnded, onCallAccepted, onAudioMessageReceived, onCallRejected) {
    // Inicializar servicios
    signalingService = new AudioSignalingService(config.audioWsUrl);
    playbackService = new AudioPlaybackService();
    streamingService = new AudioStreamingService(signalingService);
    callService = new AudioCallService(signalingService, WebRTCService);

    // Configurar callbacks
    onIncomingCallCallback = onIncomingCall;
    onCallEndedCallback = onCallEnded;
    onCallAcceptedCallback = onCallAccepted;
    onAudioMessageReceivedCallback = onAudioMessageReceived;
    onCallRejectedCallback = onCallRejected;

    callService.setUsername(username);

    // Inicializar signaling service
    signalingService.initialize(username, {
        onIncomingCall: onIncomingCall,
        onCallEnded: onCallEnded,
        onAudioMessageReceived: onAudioMessageReceived,
        onCallRejected: onCallRejected
    });

    // Inicializar WebRTC service
    WebRTCService.initializeWebRTC(username, signalingService.ws, {
        onIncomingCall: (from, offer) => {
            const callObj = {
                caller: from,
                callId: `${from}_${username}_${Date.now()}`,
                active: true,
                offer: offer
            };
            if (offer) {
                signalingService.pendingOffers.set(from, offer);
            } else {
                signalingService.pendingOffers.delete(from);
            }
            if (onIncomingCallCallback) {
                onIncomingCallCallback(callObj);
            }
        },
        onCallConnected: (remoteUser) => {
            console.log('[AUDIO] WebRTC call connected with:', remoteUser);
            if (onCallAcceptedCallback) {
                onCallAcceptedCallback(remoteUser);
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

    // Escuchar eventos de audio entrante
    window.addEventListener('incoming-audio-chunk', (event) => {
        playbackService.playAudioChunk(event.detail.blob);
    });
}

export async function startCall(targetUser) {
    return await callService.startCall(targetUser);
}

export async function acceptCall(callerUser, callId, offer) {
    return await callService.acceptCall(callerUser, callId, offer);
}

export async function rejectCall(caller) {
    return await callService.rejectCall(caller);
}

export function endCall(notifyTarget = true) {
    callService.endCall(notifyTarget);
    playbackService.clearQueue();
}

export async function startStreaming(target) {
    return await streamingService.startStreaming(target);
}

export function stopStreaming() {
    streamingService.stopStreaming();
}

export function getPendingOffer(caller) {
    return signalingService.getPendingOffer(caller);
}

// Función de compatibilidad para reproducción directa de audio
export async function playAudioChunk(blobOrArrayBuffer) {
    return await playbackService.playAudioChunk(blobOrArrayBuffer);
}

// Funciones de compatibilidad para mantener la interfaz anterior
export async function startStreamingPCM(target) {
    return await streamingService.startStreamingPCM(target);
}


