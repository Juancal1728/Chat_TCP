/**
 * ICE Subscription Service - Maneja suscripciones a eventos en tiempo real vía ICE
 */

export class IceSubscriptionService {
    constructor(connectionManager) {
        this.connectionManager = connectionManager;
    }

    async subscribe(userId, onNewMessage, onCallStarted, onCallEnded) {
        try {
            const proxy = await this.connectionManager.getProxy();

            // Create callback implementation
            const callbackImpl = {
                onNewMessage: onNewMessage,
                onCallStarted: onCallStarted,
                onCallEnded: onCallEnded
            };

            // Create callback proxy
            if (!this.connectionManager.getCallbackAdapter()) {
                const host = window.location.hostname || 'localhost';
                try {
                    this.connectionManager.callbackAdapter = await this.connectionManager.communicator.createObjectAdapterWithEndpoints("", `ws -h ${host} -p 0`);
                } catch (e) {
                    console.warn('[IceSubscriptionService] createObjectAdapterWithEndpoints failed, falling back to default adapter:', e);
                    this.connectionManager.callbackAdapter = await this.connectionManager.communicator.createObjectAdapter("");
                }
            }
            const adapter = this.connectionManager.callbackAdapter;
            const callbackServant = new this.connectionManager.chat.ChatCallback(callbackImpl);
            const callbackProxy = this.connectionManager.chat.ChatCallbackPrx.uncheckedCast(adapter.addWithUUID(callbackServant));

            try {
                adapter.activate();
            } catch (actErr) {
                console.warn('[IceSubscriptionService] adapter.activate() failed:', actErr);
            }

            this.connectionManager.setCallbackProxy(callbackProxy);

            // Debug: show callback proxy info
            try {
                if (callbackProxy && typeof callbackProxy.ice_getIdentity === 'function') {
                    console.log('[IceSubscriptionService] callbackProxy identity:', callbackProxy.ice_getIdentity());
                } else {
                    console.log('[IceSubscriptionService] callbackProxy created:', !!callbackProxy);
                }
                try {
                    const prxStr = this.connectionManager.communicator.proxyToString(callbackProxy);
                    console.log('[IceSubscriptionService] callbackProxy string:', prxStr);
                } catch (strErr) {
                    console.warn('[IceSubscriptionService] Could not stringify callback proxy:', strErr);
                }
            } catch (cbInfoErr) {
                console.warn('[IceSubscriptionService] Could not introspect callback proxy:', cbInfoErr);
            }

            const ctx = new Map([['user', this.connectionManager.currentUserId]]);
            let proxyWithCtx;
            try {
                proxyWithCtx = proxy.ice_context(ctx);
            } catch (e) {
                console.warn('[IceSubscriptionService] Proxy.ice_context failed for subscribe with Map ctx, attempting implicit context fallback:', e);
                proxyWithCtx = proxy;
                try {
                    if (this.connectionManager.communicator && this.connectionManager.currentUserId) {
                        const implicitCtx = this.connectionManager.communicator.getImplicitContext();
                        if (implicitCtx && typeof implicitCtx.set === 'function') {
                            implicitCtx.set('user', String(this.connectionManager.currentUserId));
                            console.log('[IceSubscriptionService] Reapplied implicit context via communicator as subscribe fallback');
                        }
                    }
                } catch (ctxEx) {
                    console.warn('[IceSubscriptionService] subscribe fallback: failed to set implicit context:', ctxEx);
                }
            }
            console.log('[IceSubscriptionService] subscribeViaICE using context ->', ctx);
            try {
                const prxCtxBefore = proxy && typeof proxy.ice_getContext === 'function' ? proxy.ice_getContext() : null;
                console.log('[IceSubscriptionService] proxy current context:', prxCtxBefore instanceof Map ? Array.from(prxCtxBefore.entries()) : prxCtxBefore);
            } catch (ctxErr) {
                console.warn('[IceSubscriptionService] Could not read proxy context before subscribe:', ctxErr);
            }
            try {
                await proxyWithCtx.subscribe(userId, callbackProxy);
            } catch (e) {
                console.warn('[IceSubscriptionService] subscribeViaICE with ctx failed, retrying without ctx:', e);
                try {
                    await proxy.subscribe(userId, callbackProxy);
                } catch (origErr) {
                    console.warn('[IceSubscriptionService] subscribe without ctx also failed, attempting fallback proxy with ?user= query param:', origErr);
                    const fallbackPrx = await this.connectionManager.getProxyWithUserQuery();
                    await fallbackPrx.subscribe(userId, callbackProxy);
                }
            }
            console.log(`[ICE] Subscribed to events for ${userId}`);
        } catch (error) {
            console.error('[ICE] Subscribe error:', error);
            throw error;
        }
    }
}