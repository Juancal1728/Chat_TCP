/**
 * ICE Message Service - Maneja operaciones de mensajes vía ICE
 */

export class IceMessageService {
    constructor(connectionManager) {
        this.connectionManager = connectionManager;
    }

    async getHistory(userOrGroupId) {
        try {
            const proxy = await this.connectionManager.getProxy();
            const ctx = this.connectionManager.buildUserCtx();
            console.log('[IceMessageService] getHistoryViaICE using context ->', ctx);
            const messages = await this.connectionManager.invokeWithCtxFallback(proxy, ctx, async (prx) => await prx.getHistory(userOrGroupId));
            console.log(`[ICE] History for ${userOrGroupId}:`, messages);
            return messages || [];
        } catch (error) {
            console.error('[ICE] Get history error:', error);
            return [];
        }
    }

    async sendMessage(receiver, content) {
        try {
            let proxy;
            try {
                proxy = await this.connectionManager.getProxyWithUserQuery();
            } catch (e) {
                proxy = await this.connectionManager.getProxy();
            }
            const ctx = this.connectionManager.buildUserCtx();
            console.log('[IceMessageService] sendMessageViaICE using context ->', ctx);
            await this.connectionManager.invokeWithCtxFallback(proxy, ctx, async (prx) => await prx.sendMessage(receiver, content));
            console.log(`[ICE] Message sent to ${receiver}`);
        } catch (error) {
            console.error('[ICE] Send message error:', error);
            throw error;
        }
    }
}