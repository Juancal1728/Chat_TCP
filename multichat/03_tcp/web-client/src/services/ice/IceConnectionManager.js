/**
 * ICE Connection Manager - Maneja la conexión y configuración ICE
 */

export class IceConnectionManager {
    constructor(config, chat) {
        this.config = config;
        this.chat = chat;
        this.communicator = null;
        this.chatProxy = null;
        this.callbackProxy = null;
        this.callbackAdapter = null;
        this.currentUserId = null;
        this.chatProxyWithUserQuery = null;

        this.HOSTNAME = (config.ice && config.ice.host) || window.location.hostname || 'localhost';
        this.IS_LOCAL = this.HOSTNAME === 'localhost' || this.HOSTNAME === '127.0.0.1';
        this.ICE_PORT = (config.ice && typeof config.ice.port !== 'undefined')
            ? config.ice.port
            : (this.IS_LOCAL ? 10000 : 30751);
        this.ICE_RESOURCE = (config.ice && config.ice.resource) || '/ice';
        this.ICE_USE_WSS = (config.ice && typeof config.ice.useWss !== 'undefined')
            ? config.ice.useWss
            : !this.IS_LOCAL;
    }

    async initialize(userId) {
        this.currentUserId = userId;

        // If communicator already exists, set implicit context now so later calls include the user
        if (this.communicator && this.currentUserId) {
            try {
                const implicitCtx = this.communicator.getImplicitContext();
                implicitCtx.set('user', this.currentUserId);
                console.log('[IceConnectionManager] Implicit context set via initialize → user =', this.currentUserId);
            } catch (ctxErr) {
                console.warn('[IceConnectionManager] Could not set implicit context in initialize:', ctxErr);
            }
        }

        return await this.getProxy();
    }

    async getProxy() {
        if (this.chatProxy) {
            return this.chatProxy;
        }

        if (!this.currentUserId) {
            throw new Error('ICE not initialized with user ID');
        }

        // Re-check window.chat in case it wasn't ready during module initialization
        if (!this.chat || !this.chat.ChatServicePrx) {
            this.chat = window.chat;
            console.log('[IceConnectionManager] Re-checking window.chat:', !!window.chat);
        }

        // Ensure chat namespace is available
        if (!this.chat || !this.chat.ChatServicePrx) {
            console.error('[IceConnectionManager] ChatService module not loaded!');
            console.error('[IceConnectionManager] window.Ice:', !!window.Ice);
            console.error('[IceConnectionManager] window.chat:', !!window.chat);
            throw new Error('ChatService module not loaded. Please refresh the page.');
        }

        try {
            const props = Ice.Ice.createProperties();
            props.setProperty('Ice.ImplicitContext', 'Shared');
            const id = new Ice.Ice.InitializationData();
            id.properties = props;
            this.communicator = Ice.Ice.initialize(id);

            // Set implicit context with the current user ID
            if (this.currentUserId) {
                try {
                    const implicitCtx = this.communicator.getImplicitContext();
                    if (implicitCtx && typeof implicitCtx.set === 'function') {
                        implicitCtx.set('user', this.currentUserId);
                        console.log('[IceConnectionManager] Implicit context set → user =', this.currentUserId);
                        try {
                            const implicitMap = implicitCtx.getContext();
                            console.log('[IceConnectionManager] implicit context map: ', implicitMap instanceof Map ? Array.from(implicitMap.entries()) : implicitMap);
                        } catch (mErr) {
                            console.warn('[IceConnectionManager] Could not read implicit context map:', mErr);
                        }
                    } else {
                        console.warn('[IceConnectionManager] Communicator.getImplicitContext() returned null/undefined — implicit context not available.');
                    }
                } catch (ctxErr) {
                    console.warn('[IceConnectionManager] Could not set implicit context:', ctxErr);
                }
            }

            // Create proxy WITHOUT user query parameter; implicit context is used instead
            const resourceSegment = this.ICE_RESOURCE ? ` -r ${this.ICE_RESOURCE}` : '';
            const proxyString = this.ICE_USE_WSS
                ? `ChatService:wss -h ${this.HOSTNAME} -p ${this.ICE_PORT}${resourceSegment}`
                : `ChatService:ws -h ${this.HOSTNAME} -p ${this.ICE_PORT}`;
            const proxy = this.communicator.stringToProxy(proxyString);

            this.chatProxy = await this.chat.ChatServicePrx.checkedCast(proxy);

            if (!this.chatProxy) {
                throw new Error('Invalid proxy');
            }

            console.log('[ICE] Connected to chat server for user:', this.currentUserId);
            try {
                const prxCtx = this.chatProxy.ice_getContext();
                console.log('[IceConnectionManager] initial proxy context:', prxCtx instanceof Map ? Array.from(prxCtx.entries()) : prxCtx);
            } catch (errCtx) {
                console.warn('[IceConnectionManager] Could not introspect proxy context:', errCtx);
            }
            return this.chatProxy;
        } catch (error) {
            console.error('[ICE] Connection error:', error);
            return await this.tryFallbackConnection();
        }
    }

    async tryFallbackConnection() {
        // Fallback: if WSS failed, try WS on the same host/port (only if page is not HTTPS to avoid mixed content)
        const isHttpsPage = window.location.protocol === 'https:';
        if (this.ICE_USE_WSS && !isHttpsPage) {
            try {
                console.warn('[ICE] Retrying connection over WS (non-TLS) as fallback');
                const fallbackResource = this.ICE_RESOURCE ? ` -r ${this.ICE_RESOURCE}` : '';
                const fallbackProxyString = `ChatService:ws -h ${this.HOSTNAME} -p ${this.ICE_PORT}${fallbackResource}`;
                const fallbackProxy = this.communicator.stringToProxy(fallbackProxyString);
                this.chatProxy = await this.chat.ChatServicePrx.checkedCast(fallbackProxy);
                if (this.chatProxy) {
                    console.log('[ICE] Connected to chat server via WS fallback for user:', this.currentUserId);
                    return this.chatProxy;
                }
            } catch (fallbackErr) {
                console.error('[ICE] WS fallback connection error:', fallbackErr);
            }
        }
        throw new Error('Failed to connect to ICE server');
    }

    async getProxyWithUserQuery() {
        if (this.chatProxyWithUserQuery) {
            return this.chatProxyWithUserQuery;
        }

        if (!this.communicator) {
            await this.getProxy();
        }

        try {
            const resourceSegment = this.ICE_RESOURCE ? `-r ${this.ICE_RESOURCE}` : '';
            const query = `?user=${encodeURIComponent(this.currentUserId || '')}`;
            const proxyString = this.ICE_USE_WSS
                ? `ChatService:wss -h ${this.HOSTNAME} -p ${this.ICE_PORT} ${resourceSegment}${query}`
                : `ChatService:ws -h ${this.HOSTNAME} -p ${this.ICE_PORT}${query}`;
            const proxy = this.communicator.stringToProxy(proxyString);
            this.chatProxyWithUserQuery = await this.chat.ChatServicePrx.checkedCast(proxy);
            console.warn('[IceConnectionManager] Using fallback proxy with ?user= query param for user:', this.currentUserId);
            return this.chatProxyWithUserQuery;
        } catch (e) {
            console.error('[IceConnectionManager] Failed to get proxy with user query param:', e);
            return await this.tryFallbackProxyWithUserQuery();
        }
    }

    async tryFallbackProxyWithUserQuery() {
        const isHttpsPage = window.location.protocol === 'https:';
        if (this.ICE_USE_WSS && !isHttpsPage) {
            try {
                const query = `?user=${encodeURIComponent(this.currentUserId || '')}`;
                const fallbackResource = this.ICE_RESOURCE ? `-r ${this.ICE_RESOURCE}` : '';
                const proxyString = `ChatService:ws -h ${this.HOSTNAME} -p ${this.ICE_PORT} ${fallbackResource}${query}`;
                const proxy = this.communicator.stringToProxy(proxyString);
                this.chatProxyWithUserQuery = await this.chat.ChatServicePrx.checkedCast(proxy);
                console.warn('[IceConnectionManager] Using WS fallback proxy with ?user= query param for user:', this.currentUserId);
                return this.chatProxyWithUserQuery;
            } catch (fallbackErr) {
                console.error('[IceConnectionManager] WS fallback proxy with user query failed:', fallbackErr);
            }
        }
        throw new Error('Failed to get proxy with user query');
    }

    async invokeWithCtxFallback(proxy, ctx, fn) {
        try {
            let proxyWithCtx = proxy;
            if (ctx) {
                try {
                    const normalizedMap = (ctx instanceof Map) ? new Map([...ctx.entries()].map(([k, v]) => [String(k), String(v)])) : ctx;
                    console.log('[IceConnectionManager] invokeWithCtxFallback attempting ice_context with normalized ctx ->', normalizedMap instanceof Map ? Array.from(normalizedMap.entries()) : normalizedMap);
                    try {
                        console.log('[IceConnectionManager] Ice.ContextHelper available:', !!(window.Ice && window.Ice.ContextHelper && typeof window.Ice.ContextHelper.write === 'function'));
                    } catch (ctxLogErr) {
                        console.warn('[IceConnectionManager] Could not introspect Ice helper objects:', ctxLogErr);
                    }
                    if (window.Ice && window.Ice.ContextHelper && typeof window.Ice.ContextHelper.write === 'function') {
                        proxyWithCtx = proxy.ice_context(normalizedMap);
                    } else {
                        console.warn('[IceConnectionManager] Ice.ContextHelper.write is not available; skipping proxy.ice_context to avoid DictionaryHelper.write errors. Using implicit context fallback.');
                        proxyWithCtx = proxy;
                        try {
                            if (this.communicator && this.currentUserId) {
                                const implicitCtx = this.communicator.getImplicitContext();
                                if (implicitCtx && typeof implicitCtx.set === 'function') {
                                    implicitCtx.set('user', String(this.currentUserId));
                                    console.log('[IceConnectionManager] Reapplied implicit context via communicator due to missing ContextHelper.write');
                                }
                            }
                        } catch (ctxSetErr) {
                            console.warn('[IceConnectionManager] Failed to set implicit context in ContextHelper.write fallback:', ctxSetErr);
                        }
                    }
                } catch (iceCtxErr) {
                    console.warn('[IceConnectionManager] Proxy.ice_context failed (invokeWithCtxFallback) with normalized ctx, error:', iceCtxErr);
                    if (iceCtxErr && iceCtxErr.stack) {
                        console.warn('[IceConnectionManager] Stacktrace from ice_context error:', iceCtxErr.stack);
                    }
                    try {
                        if (this.communicator && this.currentUserId) {
                            const implicitCtx = this.communicator.getImplicitContext();
                            if (implicitCtx && typeof implicitCtx.set === 'function') {
                                implicitCtx.set('user', String(this.currentUserId));
                                console.log('[IceConnectionManager] Reapplied implicit context via communicator as fallback');
                            }
                        }
                    } catch (ctxSetErr) {
                        console.warn('[IceConnectionManager] Failed to set implicit context in fallback:', ctxSetErr);
                    }
                    proxyWithCtx = proxy;
                }
            }
            try {
                if (this.communicator && this.currentUserId) {
                    const implicitCtx = this.communicator.getImplicitContext();
                    if (implicitCtx && typeof implicitCtx.set === 'function') {
                        implicitCtx.set('user', String(this.currentUserId));
                        console.log('[IceConnectionManager] Reapplied implicit context before invocation');
                    }
                }
            } catch (ctxErr) {
                console.warn('[IceConnectionManager] Failed to reapply implicit context before invocation:', ctxErr);
            }
            return await fn(proxyWithCtx);
        } catch (err) {
            console.warn('[IceConnectionManager] invokeWithCtxFallback failed, retrying without ctx if not already:', err);
            try {
                return await fn(proxy);
            } catch (origErr) {
                console.warn('[IceConnectionManager] Invocation without ctx also failed, trying fallback proxy with ?user= query param:', origErr);
                try {
                    const proxyWithQuery = await this.getProxyWithUserQuery();
                    return await fn(proxyWithQuery);
                } catch (queryErr) {
                    console.error('[IceConnectionManager] Invocation with fallback ?user= proxy also failed:', queryErr);
                    throw queryErr;
                }
            }
        }
    }

    buildUserCtx() {
        return { user: this.currentUserId };
    }

    getCallbackAdapter() {
        return this.callbackAdapter;
    }

    setCallbackProxy(proxy) {
        this.callbackProxy = proxy;
    }

    cleanup() {
        if (this.communicator) {
            this.communicator.destroy();
            this.communicator = null;
            this.chatProxy = null;
            this.callbackProxy = null;
            this.callbackAdapter = null;
        }
    }
}