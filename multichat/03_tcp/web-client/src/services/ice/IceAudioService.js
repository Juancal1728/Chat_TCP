/**
 * ICE Audio Service - Maneja operaciones de audio vía ICE
 */

export class IceAudioService {
    constructor(connectionManager) {
        this.connectionManager = connectionManager;
    }

    async sendAudio(receiver, audioBase64) {
        try {
            let proxy;
            try {
                proxy = await this.connectionManager.getProxyWithUserQuery();
            } catch (e) {
                proxy = await this.connectionManager.getProxy();
            }
            const ctx = this.connectionManager.buildUserCtx();
            console.log('[IceAudioService] sendAudioViaICE using context ->', ctx);

            // WORKAROUND: Embed sender in payload because Ice context propagation is failing
            const payload = JSON.stringify({
                sender: this.connectionManager.currentUserId,
                data: audioBase64
            });

            await this.connectionManager.invokeWithCtxFallback(proxy, ctx, async (prx) => await prx.sendAudio(receiver, payload));
            console.log(`[ICE] Audio sent to ${receiver}`);
        } catch (error) {
            console.error('[ICE] Send audio error:', error);
            throw error;
        }
    }
}