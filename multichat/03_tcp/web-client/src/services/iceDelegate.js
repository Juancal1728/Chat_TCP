/**
 * ICE Delegate Service - Comunicación con el backend Java vía Ice
 * Módulo principal que coordina la comunicación ICE
 */

import * as Ice from 'ice';
import config from '../config.js';
import { IceConnectionManager } from './ice/IceConnectionManager.js';
import { IceMessageService } from './ice/IceMessageService.js';
import { IceCallService } from './ice/IceCallService.js';
import { IceAudioService } from './ice/IceAudioService.js';
import { IceSubscriptionService } from './ice/IceSubscriptionService.js';

// Ensure Ice is available globally BEFORE ChatService.js loads
window.Ice = Ice;

// Polyfill Ice._require if it doesn't exist
if (!window.Ice._require) {
    console.warn('[iceDelegate] Ice._require not found, creating polyfill');
    window.Ice._require = function (moduleName) {
        if (moduleName === 'ice') {
            return { Ice: window.Ice };
        }
        console.error('[iceDelegate] Unknown module requested:', moduleName);
        return {};
    };
}

// Load ChatService.js dynamically now that Ice is ready
if (!window.chat) {
    console.log('[iceDelegate] Loading ChatService.js dynamically...');
    const script = document.createElement('script');
    script.src = 'src/services/ChatService.js';
    script.onload = function () {
        console.log('[iceDelegate] ChatService.js loaded successfully');
        console.log('[iceDelegate] window.chat available:', !!window.chat);
    };
    script.onerror = function () {
        console.error('[iceDelegate] Failed to load ChatService.js');
    };
    document.head.appendChild(script);
}

// ChatService.js will be loaded dynamically and will set window.chat
// Access the chat namespace from global scope (set by ChatService.js UMD module)
let chat = window.chat;

// Debug logging
console.log('[iceDelegate] window.Ice available:', !!window.Ice);
console.log('[iceDelegate] window.Ice._require available:', !!(window.Ice && window.Ice._require));
console.log('[iceDelegate] window.chat available:', !!window.chat);
console.log('[iceDelegate] chat.ChatServicePrx available:', !!(chat && chat.ChatServicePrx));

// Connection manager instance
let connectionManager = null;

/**
 * Initialize ICE with user context
 */
export function initializeICE(userId) {
    if (!connectionManager) {
        connectionManager = new IceConnectionManager(config, chat);
    }
    return connectionManager.initialize(userId);
}

/**
 * Get message service instance
 */
function getMessageService() {
    if (!connectionManager) {
        throw new Error('ICE not initialized. Call initializeICE first.');
    }
    return new IceMessageService(connectionManager);
}

/**
 * Get call service instance
 */
function getCallService() {
    if (!connectionManager) {
        throw new Error('ICE not initialized. Call initializeICE first.');
    }
    return new IceCallService(connectionManager);
}

/**
 * Get audio service instance
 */
function getAudioService() {
    if (!connectionManager) {
        throw new Error('ICE not initialized. Call initializeICE first.');
    }
    return new IceAudioService(connectionManager);
}

/**
 * Get subscription service instance
 */
function getSubscriptionService() {
    if (!connectionManager) {
        throw new Error('ICE not initialized. Call initializeICE first.');
    }
    return new IceSubscriptionService(connectionManager);
}

// Export functions using service instances
export async function getHistoryViaICE(userOrGroupId) {
    return await getMessageService().getHistory(userOrGroupId);
}

export async function sendMessageViaICE(receiver, content) {
    return await getMessageService().sendMessage(receiver, content);
}

export async function sendAudioViaICE(receiver, audioBase64) {
    return await getAudioService().sendAudio(receiver, audioBase64);
}

export async function startCallViaICE(caller, callee) {
    return await getCallService().startCall(caller, callee);
}

export async function endCallViaICE(callId) {
    return await getCallService().endCall(callId);
}

export async function getActiveCallsViaICE(userId) {
    return await getCallService().getActiveCalls(userId);
}

export async function subscribeViaICE(userId, onNewMessage, onCallStarted, onCallEnded) {
    return await getSubscriptionService().subscribe(userId, onNewMessage, onCallStarted, onCallEnded);
}

/**
 * Record audio from microphone
 */
let currentMediaRecorder = null;
let recordingResolve = null;

export async function recordAudio(maxDuration = 60000) {
    return new Promise((resolve, reject) => {
        if (currentMediaRecorder && currentMediaRecorder.state === 'recording') {
            reject(new Error('Already recording'));
            return;
        }

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                currentMediaRecorder = new MediaRecorder(stream);
                const audioChunks = [];
                recordingResolve = resolve;

                currentMediaRecorder.ondataavailable = event => {
                    audioChunks.push(event.data);
                };

                currentMediaRecorder.onstop = () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const base64 = reader.result.split(',')[1];
                        if (recordingResolve) {
                            recordingResolve(base64);
                            recordingResolve = null;
                        }
                    };
                    reader.readAsDataURL(audioBlob);

                    // Stop all tracks
                    stream.getTracks().forEach(track => track.stop());
                    currentMediaRecorder = null;
                };

                currentMediaRecorder.start();

                // Auto-stop after maxDuration
                setTimeout(() => {
                    if (currentMediaRecorder && currentMediaRecorder.state === 'recording') {
                        currentMediaRecorder.stop();
                    }
                }, maxDuration);
            })
            .catch(error => {
                reject(error);
            });
    });
}

export function stopRecording() {
    if (currentMediaRecorder && currentMediaRecorder.state === 'recording') {
        currentMediaRecorder.stop();
        return true;
    }
    return false;
}

/**
 * Cleanup ICE connection
 */
export function cleanupICE() {
    if (connectionManager) {
        connectionManager.cleanup();
        connectionManager = null;
    }
}
