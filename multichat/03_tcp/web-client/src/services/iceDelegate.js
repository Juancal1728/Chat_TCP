/**
 * ICE Delegate Service - Comunicación con el backend Java vía Ice
 */

import * as Ice from 'ice';

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

const HOSTNAME = window.location.hostname || 'localhost';
const ICE_PORT = 10000;

let communicator = null;
let chatProxy = null;
let callbackProxy = null;
let callbackAdapter = null; // adapter instance to export callbacks with endpoints
let currentUserId = null;
let chatProxyWithUserQuery = null; // Fallback: proxy string including ?user= for rare cases

/**
 * Initialize ICE with user context
 */
export function initializeICE(userId) {
    currentUserId = userId;
    // If communicator already exists, set implicit context now so later calls include the user
    if (communicator && currentUserId) {
        try {
            const implicitCtx = communicator.getImplicitContext();
            implicitCtx.set('user', currentUserId);
            console.log('[iceDelegate] Implicit context set via initializeICE → user =', currentUserId);
        } catch (ctxErr) {
            console.warn('[iceDelegate] Could not set implicit context in initializeICE:', ctxErr);
        }
    }
}

/**
 * Initialize Ice communicator and get proxy
 */
async function getProxy() {
    if (chatProxy) {
        return chatProxy;
    }

    if (!currentUserId) {
        throw new Error('ICE not initialized with user ID');
    }

    // Re-check window.chat in case it wasn't ready during module initialization
    if (!chat || !chat.ChatServicePrx) {
        chat = window.chat;
        console.log('[iceDelegate] Re-checking window.chat:', !!window.chat);
    }

    // Ensure chat namespace is available
    if (!chat || !chat.ChatServicePrx) {
        console.error('[iceDelegate] ChatService module not loaded!');
        console.error('[iceDelegate] window.Ice:', !!window.Ice);
        console.error('[iceDelegate] window.chat:', !!window.chat);
        throw new Error('ChatService module not loaded. Please refresh the page.');
    }

    try {
        const props = Ice.Ice.createProperties();
        props.setProperty('Ice.ImplicitContext', 'Shared');
        const id = new Ice.Ice.InitializationData();
        id.properties = props;
        communicator = Ice.Ice.initialize(id);

        // Set implicit context with the current user ID (server will read it via Current.implicitContext())
        if (currentUserId) {
            try {
                const implicitCtx = communicator.getImplicitContext();
                if (implicitCtx && typeof implicitCtx.set === 'function') {
                    implicitCtx.set('user', currentUserId);
                    console.log('[iceDelegate] Implicit context set → user =', currentUserId);
                    // Print the implicit context Map for debugging
                    try {
                        const implicitMap = implicitCtx.getContext();
                        console.log('[iceDelegate] implicit context map: ', implicitMap instanceof Map ? Array.from(implicitMap.entries()) : implicitMap);
                    } catch (mErr) {
                        console.warn('[iceDelegate] Could not read implicit context map:', mErr);
                    }
                } else {
                    console.warn('[iceDelegate] Communicator.getImplicitContext() returned null/undefined — implicit context not available.');
                }
            } catch (ctxErr) {
                console.warn('[iceDelegate] Could not set implicit context:', ctxErr);
            }
        }

        // Create proxy WITHOUT user query parameter; implicit context is used instead
        const proxyString = `ChatService:ws -h ${HOSTNAME} -p ${ICE_PORT}`;
        const proxy = communicator.stringToProxy(proxyString);

        chatProxy = await chat.ChatServicePrx.checkedCast(proxy);

        if (!chatProxy) {
            throw new Error('Invalid proxy');
        }

        console.log('[ICE] Connected to chat server for user:', currentUserId);
        try {
            // Check the proxy context
            const prxCtx = chatProxy.ice_getContext();
            console.log('[iceDelegate] initial proxy context:', prxCtx instanceof Map ? Array.from(prxCtx.entries()) : prxCtx);
        } catch (errCtx) {
            console.warn('[iceDelegate] Could not introspect proxy context:', errCtx);
        }
        return chatProxy;
    } catch (error) {
        console.error('[ICE] Connection error:', error);
        throw error;
    }
}

// Create a proxy that includes the ?user= query param — used as a LAST-RESORT fallback
async function getProxyWithUserQuery() {
    if (chatProxyWithUserQuery) {
        return chatProxyWithUserQuery;
    }

    if (!communicator) {
        await getProxy(); // initialize communicator and chatProxy
    }

    try {
        const proxyString = `ChatService:ws -h ${HOSTNAME} -p ${ICE_PORT}?user=${encodeURIComponent(currentUserId || '')}`;
        const proxy = communicator.stringToProxy(proxyString);
        chatProxyWithUserQuery = await chat.ChatServicePrx.checkedCast(proxy);
        console.warn('[iceDelegate] Using fallback proxy with ?user= query param for user:', currentUserId);
        return chatProxyWithUserQuery;
    } catch (e) {
        console.error('[iceDelegate] Failed to get proxy with user query param:', e);
        throw e;
    }
}

// Helper: Try to invoke a function on a proxy using the provided context.
// If creating/applying the context fails, fallback to invoking on the original proxy.
async function invokeWithCtxFallback(proxy, ctx, fn) {
    try {
        let proxyWithCtx = proxy;
        if (ctx) {
            // Normalize keys and values to strings to avoid serialization issues
            try {
                const normalizedMap = (ctx instanceof Map) ? new Map([...ctx.entries()].map(([k, v]) => [String(k), String(v)])) : ctx;
                console.log('[iceDelegate] invokeWithCtxFallback attempting ice_context with normalized ctx ->', normalizedMap instanceof Map ? Array.from(normalizedMap.entries()) : normalizedMap);
                try {
                    // Log Ice runtime helpers presence
                    console.log('[iceDelegate] Ice.ContextHelper available:', !!(window.Ice && window.Ice.ContextHelper && typeof window.Ice.ContextHelper.write === 'function'));
                } catch (ctxLogErr) {
                    console.warn('[iceDelegate] Could not introspect Ice helper objects:', ctxLogErr);
                }
                // If the ICE JS runtime is not exposing ContextHelper.write, avoid calling ice_context to prevent serialization errors
                if (window.Ice && window.Ice.ContextHelper && typeof window.Ice.ContextHelper.write === 'function') {
                    proxyWithCtx = proxy.ice_context(normalizedMap);
                } else {
                    console.warn('[iceDelegate] Ice.ContextHelper.write is not available; skipping proxy.ice_context to avoid DictionaryHelper.write errors. Using implicit context fallback.');
                    proxyWithCtx = proxy;
                    try {
                        if (communicator && currentUserId) {
                            const implicitCtx = communicator.getImplicitContext();
                            if (implicitCtx && typeof implicitCtx.set === 'function') {
                                implicitCtx.set('user', String(currentUserId));
                                console.log('[iceDelegate] Reapplied implicit context via communicator due to missing ContextHelper.write');
                            }
                        }
                    } catch (ctxSetErr) {
                        console.warn('[iceDelegate] Failed to set implicit context in ContextHelper.write fallback:', ctxSetErr);
                    }
                }
            } catch (iceCtxErr) {
                console.warn('[iceDelegate] Proxy.ice_context failed (invokeWithCtxFallback) with normalized ctx, error:', iceCtxErr);
                if (iceCtxErr && iceCtxErr.stack) {
                    console.warn('[iceDelegate] Stacktrace from ice_context error:', iceCtxErr.stack);
                }
                // Try one last attempt: set implicit context on the communicator and call with original proxy
                try {
                    if (communicator && currentUserId) {
                        const implicitCtx = communicator.getImplicitContext();
                        if (implicitCtx && typeof implicitCtx.set === 'function') {
                            implicitCtx.set('user', String(currentUserId));
                            console.log('[iceDelegate] Reapplied implicit context via communicator as fallback');
                        }
                    }
                } catch (ctxSetErr) {
                    console.warn('[iceDelegate] Failed to set implicit context in fallback:', ctxSetErr);
                }
                proxyWithCtx = proxy;
            }
        }
        // Re-apply implicit context as a precaution before executing the call
        try {
            if (communicator && currentUserId) {
                const implicitCtx = communicator.getImplicitContext();
                if (implicitCtx && typeof implicitCtx.set === 'function') {
                    implicitCtx.set('user', String(currentUserId));
                    console.log('[iceDelegate] Reapplied implicit context before invocation');
                }
            }
        } catch (ctxErr) {
            console.warn('[iceDelegate] Failed to reapply implicit context before invocation:', ctxErr);
        }
        return await fn(proxyWithCtx);
    } catch (err) {
        console.warn('[iceDelegate] invokeWithCtxFallback failed, retrying without ctx if not already:', err);
        // as a last resort, retry with original proxy
        try {
            return await fn(proxy);
        } catch (origErr) {
            console.warn('[iceDelegate] Invocation without ctx also failed, trying fallback proxy with ?user= query param:', origErr);
            try {
                const proxyWithQuery = await getProxyWithUserQuery();
                return await fn(proxyWithQuery);
            } catch (queryErr) {
                console.error('[iceDelegate] Invocation with fallback ?user= proxy also failed:', queryErr);
                throw queryErr;
            }
        }
    }
}

/**
 * Build user context for ICE invocations
 */
function buildUserCtx() {
    return { user: currentUserId };
}
export async function getHistoryViaICE(userOrGroupId) {
    try {
        const proxy = await getProxy();
        // Explicitly set the invocation context for this call to ensure the server
        // receives the calling user identity (fallback for cases where implicit
        // context might not be propagated through the transport/router).
        const ctx = buildUserCtx();
        console.log('[iceDelegate] getHistoryViaICE using context ->', ctx);
        const messages = await invokeWithCtxFallback(proxy, ctx, async (prx) => await prx.getHistory(userOrGroupId));
        console.log(`[ICE] History for ${userOrGroupId}:`, messages);
        return messages || [];
    } catch (error) {
        console.error('[ICE] Get history error:', error);
        return [];
    }
}

/**
 * Send message
 */
export async function sendMessageViaICE(receiver, content) {
    try {
        // Prefer query-param based proxy to ensure the server receives the 'user' context when ICE context helpers are unavailable.
        let proxy;
        try {
            proxy = await getProxyWithUserQuery();
        } catch (e) {
            proxy = await getProxy();
        }
        const ctx = buildUserCtx();
        console.log('[iceDelegate] sendMessageViaICE using context ->', ctx);
        await invokeWithCtxFallback(proxy, ctx, async (prx) => await prx.sendMessage(receiver, content));
        console.log(`[ICE] Message sent to ${receiver}`);
    } catch (error) {
        console.error('[ICE] Send message error:', error);
        throw error;
    }
}

/**
 * Send audio
 */
export async function sendAudioViaICE(receiver, audioBase64) {
    try {
        // Use query-param proxy to ensure server sees identity reliably
        let proxy;
        try {
            proxy = await getProxyWithUserQuery();
        } catch (e) {
            proxy = await getProxy();
        }
        const ctx = buildUserCtx();
        console.log('[iceDelegate] sendAudioViaICE using context ->', ctx);

        // WORKAROUND: Embed sender in payload because Ice context propagation is failing
        const payload = JSON.stringify({
            sender: currentUserId,
            data: audioBase64
        });

        await invokeWithCtxFallback(proxy, ctx, async (prx) => await prx.sendAudio(receiver, payload));
        console.log(`[ICE] Audio sent to ${receiver}`);
    } catch (error) {
        console.error('[ICE] Send audio error:', error);
        throw error;
    }
}

/**
 * Start call
 */
export async function startCallViaICE(caller, callee) {
    try {
        const proxy = await getProxy();
        const ctx = buildUserCtx();
        console.log('[iceDelegate] startCallViaICE using context ->', ctx);
        const call = await invokeWithCtxFallback(proxy, ctx, async (prx) => await prx.startCall(caller, callee));
        console.log(`[ICE] Call started:`, call);
        return call;
    } catch (error) {
        console.error('[ICE] Start call error:', error);
        throw error;
    }
}

/**
 * End call
 */
export async function endCallViaICE(callId) {
    try {
        const proxy = await getProxy();
        const ctx = buildUserCtx();
        console.log('[iceDelegate] endCallViaICE using context ->', ctx);
        await invokeWithCtxFallback(proxy, ctx, async (prx) => await prx.endCall(callId));
        console.log(`[ICE] Call ended: ${callId}`);
    } catch (error) {
        console.error('[ICE] End call error:', error);
        throw error;
    }
}

/**
 * Get active calls
 */
export async function getActiveCallsViaICE(userId) {
    try {
        const proxy = await getProxy();
        const ctx = buildUserCtx();
        console.log('[iceDelegate] getActiveCallsViaICE using context ->', ctx);
        const calls = await invokeWithCtxFallback(proxy, ctx, async (prx) => await prx.getActiveCalls(userId));
        console.log(`[ICE] Active calls for ${userId}:`, calls);
        return calls || [];
    } catch (error) {
        console.error('[ICE] Get active calls error:', error);
        return [];
    }
}

/**
 * Subscribe to real-time events
 */
export async function subscribeViaICE(userId, onNewMessage, onCallStarted, onCallEnded) {
    try {
        const proxy = await getProxy();

        // Create callback implementation
        const callbackImpl = {
            onNewMessage: onNewMessage,
            onCallStarted: onCallStarted,
            onCallEnded: onCallEnded
        };

        // Create callback proxy
        // Try to create an adapter with explicit endpoints so that the proxy includes
        // a reachable endpoint for the server to call back. If that fails, fall back
        // to the default createObjectAdapter.
        if (!callbackAdapter) {
            const host = window.location.hostname || 'localhost';
            try {
                callbackAdapter = await communicator.createObjectAdapterWithEndpoints("", `ws -h ${host} -p 0`);
            } catch (e) {
                console.warn('[iceDelegate] createObjectAdapterWithEndpoints failed, falling back to default adapter:', e);
                callbackAdapter = await communicator.createObjectAdapter("");
            }
        }
        const adapter = callbackAdapter;
        const callbackServant = new chat.ChatCallback(callbackImpl);
        callbackProxy = chat.ChatCallbackPrx.uncheckedCast(adapter.addWithUUID(callbackServant));

        try {
            adapter.activate();
        } catch (actErr) {
            console.warn('[iceDelegate] adapter.activate() failed:', actErr);
        }

        // Debug: show callback proxy info
        try {
            if (callbackProxy && typeof callbackProxy.ice_getIdentity === 'function') {
                console.log('[iceDelegate] callbackProxy identity:', callbackProxy.ice_getIdentity());
            } else {
                console.log('[iceDelegate] callbackProxy created:', !!callbackProxy);
            }
            // Print proxy string to inspect endpoints
            try {
                const prxStr = communicator.proxyToString(callbackProxy);
                console.log('[iceDelegate] callbackProxy string:', prxStr);
            } catch (strErr) {
                console.warn('[iceDelegate] Could not stringify callback proxy:', strErr);
            }
        } catch (cbInfoErr) {
            console.warn('[iceDelegate] Could not introspect callback proxy:', cbInfoErr);
        }

        const ctx = new Map([['user', currentUserId]]);
        let proxyWithCtx;
        try {
            proxyWithCtx = proxy.ice_context(ctx);
        } catch (e) {
            console.warn('[iceDelegate] Proxy.ice_context failed for subscribe with Map ctx, attempting implicit context fallback:', e);
            proxyWithCtx = proxy;
            try {
                if (communicator && currentUserId) {
                    const implicitCtx = communicator.getImplicitContext();
                    if (implicitCtx && typeof implicitCtx.set === 'function') {
                        implicitCtx.set('user', String(currentUserId));
                        console.log('[iceDelegate] Reapplied implicit context via communicator as subscribe fallback');
                    }
                }
            } catch (ctxEx) {
                console.warn('[iceDelegate] subscribe fallback: failed to set implicit context:', ctxEx);
            }
        }
        console.log('[iceDelegate] subscribeViaICE using context ->', ctx);
        try {
            const prxCtxBefore = proxy && typeof proxy.ice_getContext === 'function' ? proxy.ice_getContext() : null;
            console.log('[iceDelegate] proxy current context:', prxCtxBefore instanceof Map ? Array.from(prxCtxBefore.entries()) : prxCtxBefore);
        } catch (ctxErr) {
            console.warn('[iceDelegate] Could not read proxy context before subscribe:', ctxErr);
        }
        try {
            await proxyWithCtx.subscribe(userId, callbackProxy);
        } catch (e) {
            // If subscribe fails with context, try subscribing without context
            console.warn('[iceDelegate] subscribeViaICE with ctx failed, retrying without ctx:', e);
            try {
                await proxy.subscribe(userId, callbackProxy);
            } catch (origErr) {
                console.warn('[iceDelegate] subscribe without ctx also failed, attempting fallback proxy with ?user= query param:', origErr);
                const fallbackPrx = await getProxyWithUserQuery();
                await fallbackPrx.subscribe(userId, callbackProxy);
            }
        }
        console.log(`[ICE] Subscribed to events for ${userId}`);
    } catch (error) {
        console.error('[ICE] Subscribe error:', error);
        throw error;
    }
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
    if (communicator) {
        communicator.destroy();
        communicator = null;
        chatProxy = null;
        callbackProxy = null;
        callbackAdapter = null;
    }
}
