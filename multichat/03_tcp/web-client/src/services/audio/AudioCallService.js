/**
 * Audio Call Service - Maneja las operaciones de llamadas de audio
 */

import { startCallViaICE, sendMessageViaICE } from '../iceDelegate.js';
import { sendMessageToUser } from '../restDelegate.js';

export class AudioCallService {
    constructor(signalingService, webRTCService) {
        this.signalingService = signalingService;
        this.webRTCService = webRTCService;
        this.username = null;
    }

    setUsername(username) {
        this.username = username;
    }

    async startCall(targetUser) {
        console.log('[AudioCallService] Starting WebRTC call to:', targetUser);

        try {
            const call = await this.webRTCService.createCall(targetUser);
            console.log('[AudioCallService] WebRTC offer created');

            let callIdFromIce = null;

            if (this.signalingService.ws && this.signalingService.ws.readyState === WebSocket.OPEN) {
                const offer = call.localDescription;
                console.log('[AudioCallService] Offer created:', offer && typeof offer === 'object' ? { type: offer.type } : offer);
                const payload = JSON.stringify({
                    type: 'CALL_REQUEST',
                    offer: offer
                });
                this.signalingService.sendSignal(targetUser, 'CALL_REQUEST', payload);
                console.log('[AudioCallService] CALL_REQUEST with WebRTC offer sent to:', targetUser);
            }

            try {
                const iceCall = await startCallViaICE(this.username, targetUser);
                if (iceCall && iceCall.callId) {
                    callIdFromIce = iceCall.callId;
                }
            } catch (iceErr) {
                console.warn('[AudioCallService] startCallViaICE failed (will rely on other paths):', iceErr);
            }

            try {
                const callId = callIdFromIce || `${this.username}_${targetUser}_${Date.now()}`;
                const payload = {
                    type: 'CALL_REQUEST',
                    from: this.username,
                    callId,
                    offer: call.localDescription
                };
                const res = await sendMessageToUser(this.username, targetUser, JSON.stringify(payload));
                if (!res?.success) {
                    console.warn('[AudioCallService] REST fallback CALL_REQUEST failed:', res?.message);
                }
            } catch (restErr) {
                console.warn('[AudioCallService] Error sending REST fallback CALL_REQUEST:', restErr);
            }

            console.log('[AudioCallService] WebRTC call initiated to:', targetUser);
            return {
                offer: call.localDescription,
                callId: callIdFromIce
            };
        } catch (err) {
            console.error('[AudioCallService] Error starting call:', err);
            throw err;
        }
    }

    async acceptCall(callerUser, callId, offer) {
        console.log('[AudioCallService] Accepting WebRTC call from:', callerUser, 'callId:', callId);

        try {
            let effectiveOffer = offer;
            if (!effectiveOffer) {
                effectiveOffer = this.signalingService.getPendingOffer(callerUser);
            }
            if (!effectiveOffer) {
                try {
                    const current = this.webRTCService.getCurrentCall();
                    if (current && current.offer) {
                        effectiveOffer = current.offer;
                        console.log('[AudioCallService] Using offer from WebRTCService.getCurrentCall() fallback');
                    }
                } catch (getErr) {
                    console.warn('[AudioCallService] Could not get offer from WebRTCService.getCurrentCall():', getErr);
                }
            }

            if (!effectiveOffer) {
                console.warn('[AudioCallService] No offer available to accept the call. Proceeding with dummy connection for demo.');

                if (this.signalingService.ws && this.signalingService.ws.readyState === WebSocket.OPEN) {
                    const acceptPayload = JSON.stringify({ type: 'answer', sdp: '' });
                    this.signalingService.sendSignal(callerUser, 'CALL_ACCEPT', acceptPayload);
                    console.log('[AudioCallService] Sent dummy CALL_ACCEPT signal to', callerUser);
                }

                if (typeof window.onCallAcceptedCallback === 'function') {
                    window.onCallAcceptedCallback(callerUser);
                }
                return;
            }

            try {
                const acceptMessage = JSON.stringify({ type: 'CALL_ACCEPT', from: this.username, callId: callId, format: 'webrtc' });
                await sendMessageViaICE(callerUser, acceptMessage);
            } catch (iceErr) {
                console.warn('[AudioCallService] Failed to send CALL_ACCEPT via ICE fallback:', iceErr);
            }

            await this.webRTCService.acceptCall(callerUser, effectiveOffer);
            this.signalingService.pendingOffers.delete(callerUser);

            console.log('[AudioCallService] WebRTC call accepted from:', callerUser);
        } catch (err) {
            console.error('[AudioCallService] Error accepting call:', err);
            throw err;
        }
    }

    async rejectCall(caller) {
        console.log('[AudioCallService] Rejecting call from:', caller);
        try {
            this.signalingService.pendingOffers.delete(caller);
            const success = this.signalingService.sendSignal(caller, 'CALL_REJECT', '{}');
            if (!success) {
                throw new Error('WebSocket not connected');
            }
        } catch (err) {
            console.error('[AudioCallService] Error sending CALL_REJECT signal:', err);
            throw err;
        }
    }

    endCall(notifyTarget = true) {
        console.log('[AudioCallService] Ending call, notify:', notifyTarget);

        this.webRTCService.endCall(notifyTarget);
        this.signalingService.clearPendingOffers();

        console.log('[AudioCallService] Call ended and cleaned up');
    }
}