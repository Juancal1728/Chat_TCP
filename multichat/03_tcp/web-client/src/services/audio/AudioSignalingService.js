/**
 * Audio Signaling Service - Maneja el signaling WebSocket para llamadas de audio
 */

export class AudioSignalingService {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.ws = null;
        this.username = null;
        this.onIncomingCallCallback = null;
        this.onCallEndedCallback = null;
        this.onAudioMessageReceivedCallback = null;
        this.onCallRejectedCallback = null;
        this.pendingOffers = new Map();
    }

    initialize(username, callbacks) {
        this.username = username;
        this.onIncomingCallCallback = callbacks.onIncomingCall;
        this.onCallEndedCallback = callbacks.onCallEnded;
        this.onAudioMessageReceivedCallback = callbacks.onAudioMessageReceived;
        this.onCallRejectedCallback = callbacks.onCallRejected;

        if (this.ws) {
            this.ws.close();
        }

        this.ws = new WebSocket(`${this.wsUrl}/${encodeURIComponent(username)}`);

        this.ws.onopen = () => {
            console.log('[AudioSignalingService] Connected to Audio Server');
        };

        this.ws.onclose = (event) => {
            console.warn('[AudioSignalingService] WebSocket closed:', event.code, event.reason);
            // Simple reconnect attempt after 1s
            setTimeout(() => {
                if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
                    console.log('[AudioSignalingService] Reconnecting to audio server..');
                    this.initialize(username, callbacks);
                }
            }, 1000);
        };

        this.ws.onmessage = async (event) => {
            const data = event.data;
            console.log('[AudioSignalingService] Raw message received:', typeof data === 'string' ? data : 'Binary data');

            if (typeof data === 'string') {
                const parts = data.split('|', 4);
                if (parts[0] === 'SIGNAL') {
                    const sender = parts[1];
                    const type = parts[2];
                    const payload = parts.length > 3 ? parts[3] : '';
                    this.handleSignal(sender, type, payload);
                } else if (parts[0] === 'INCOMING_CALL') {
                    const caller = parts[1];
                    const callId = parts[2];
                    console.log('[AudioSignalingService] Received INCOMING_CALL from', caller, 'callId:', callId);

                    const callObj = {
                        caller: caller,
                        callId: callId,
                        active: true
                    };
                    if (this.onIncomingCallCallback) {
                        this.onIncomingCallCallback(callObj);
                    }
                } else if (parts[0] === 'ERROR') {
                    console.error('[AudioSignalingService] Server error:', parts[1]);
                }
            }
        };

        this.ws.onerror = (error) => {
            console.error('[AudioSignalingService] WebSocket error:', error);
        };
    }

    handleSignal(sender, signalType, payload) {
        console.log('[AudioSignalingService] Signal from', sender, ':', signalType);

        switch (signalType) {
            case 'CALL_REQUEST':
                console.log('[AudioSignalingService] Received CALL_REQUEST from', sender);
                let offer = null;
                try {
                    const data = JSON.parse(payload);
                    offer = data.offer;
                    console.log('[AudioSignalingService] Extracted WebRTC offer from CALL_REQUEST', offer && typeof offer === 'object' ? { type: offer.type } : offer);
                    if (offer) {
                        this.pendingOffers.set(sender, offer);
                    } else {
                        this.pendingOffers.delete(sender);
                    }
                } catch (e) {
                    console.warn('[AudioSignalingService] No WebRTC offer in CALL_REQUEST payload');
                }

                const callObj = {
                    caller: sender,
                    callId: `${sender}_${this.username}_${Date.now()}`,
                    active: true,
                    offer: offer
                };

                if (typeof this.onIncomingCallCallback === 'function') {
                    this.onIncomingCallCallback(callObj);
                }
                break;

            case 'CALL_ACCEPT':
                console.log('[AudioSignalingService] Call accepted by', sender);
                if (typeof window.onCallAcceptedCallback === 'function') {
                    window.onCallAcceptedCallback(sender);
                }
                break;

            case 'CALL_REJECT':
                console.log('[AudioSignalingService] Call rejected by', sender);
                if (typeof this.onCallRejectedCallback === 'function') {
                    this.onCallRejectedCallback(sender);
                }
                break;

            case 'CALL_END':
                console.log('[AudioSignalingService] Call ended by', sender);
                this.pendingOffers.delete(sender);
                if (typeof this.onCallEndedCallback === 'function') {
                    this.onCallEndedCallback(sender);
                }
                break;

            case 'MSG':
                this.handleAudioMessage(sender, payload);
                break;
        }
    }

    async handleAudioMessage(sender, payload) {
        try {
            let p = payload;
            try { p = decodeURIComponent(payload); } catch (e) { /* ignore */ }

            let base64 = null;
            try {
                const parsed = JSON.parse(p);
                if (parsed && parsed.type === 'audio') {
                    base64 = parsed.data;
                }
            } catch (jsonErr) {
                // Not JSON, continue
            }

            if (!base64) {
                if (p.startsWith('data:')) {
                    const parts = p.split(',');
                    if (parts.length > 1) base64 = parts[1];
                } else {
                    base64 = p;
                }
            }

            const binaryStr = atob(base64);
            const len = binaryStr.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }

            const blob = new Blob([bytes.buffer], { type: 'audio/wav' });
            console.log('[AudioSignalingService] Received MSG (audio) from', sender, 'playing...');

            // Dispatch event for audio playback
            const event = new CustomEvent('incoming-audio-chunk', { detail: { blob } });
            window.dispatchEvent(event);

            const audioMessage = { type: 'audio', data: base64, duration: 0, timestamp: Date.now() };
            if (typeof this.onAudioMessageReceivedCallback === 'function') {
                this.onAudioMessageReceivedCallback(sender, audioMessage);
            } else {
                const event = new CustomEvent('incoming-audio', { detail: { from: sender, audio: audioMessage } });
                window.dispatchEvent(event);
            }
        } catch (err) {
            console.warn('[AudioSignalingService] Received MSG signal, but payload is not playable audio or decoding failed:', err);
        }
    }

    sendSignal(target, signalType, payload = '') {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(`SIGNAL|${target}|${signalType}|${payload}`);
            return true;
        }
        return false;
    }

    getPendingOffer(caller) {
        return this.pendingOffers.get(caller);
    }

    clearPendingOffers() {
        this.pendingOffers.clear();
    }

    close() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}