/**
 * ICE Call Service - Maneja operaciones de llamadas vía ICE
 */

export class IceCallService {
    constructor(connectionManager) {
        this.connectionManager = connectionManager;
    }

    async startCall(caller, callee) {
        try {
            const proxy = await this.connectionManager.getProxy();
            const ctx = this.connectionManager.buildUserCtx();
            console.log('[IceCallService] startCallViaICE using context ->', ctx);
            const call = await this.connectionManager.invokeWithCtxFallback(proxy, ctx, async (prx) => await prx.startCall(caller, callee));
            console.log(`[ICE] Call started:`, call);
            return call;
        } catch (error) {
            console.error('[ICE] Start call error:', error);
            throw error;
        }
    }

    async endCall(callId) {
        try {
            const proxy = await this.connectionManager.getProxy();
            const ctx = this.connectionManager.buildUserCtx();
            console.log('[IceCallService] endCallViaICE using context ->', ctx);
            await this.connectionManager.invokeWithCtxFallback(proxy, ctx, async (prx) => await prx.endCall(callId));
            console.log(`[ICE] Call ended: ${callId}`);
        } catch (error) {
            console.error('[ICE] End call error:', error);
            throw error;
        }
    }

    async getActiveCalls(userId) {
        try {
            const proxy = await this.connectionManager.getProxy();
            const ctx = this.connectionManager.buildUserCtx();
            console.log('[IceCallService] getActiveCallsViaICE using context ->', ctx);
            const calls = await this.connectionManager.invokeWithCtxFallback(proxy, ctx, async (prx) => await prx.getActiveCalls(userId));
            console.log(`[ICE] Active calls for ${userId}:`, calls);
            return calls || [];
        } catch (error) {
            console.error('[ICE] Get active calls error:', error);
            return [];
        }
    }
}