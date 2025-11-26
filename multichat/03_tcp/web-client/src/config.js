// Centralized configuration for REST, Audio WS, and ICE endpoints.
// Allows override via window.__CHAT_CONFIG__ injected at runtime.
const hostname = window.location.hostname || 'localhost';
const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
const pagePort = window.location.port || null;

const userConfig = (window.__CHAT_CONFIG__ && typeof window.__CHAT_CONFIG__ === 'object')
    ? window.__CHAT_CONFIG__
    : {};

const defaultApiBaseUrl = isLocalhost
    ? `http://${hostname}:3000/api`
    : `${window.location.protocol}//${window.location.host}/api`;

const defaultAudioWsUrl = isLocalhost
    ? `ws://${hostname}:8888`
    : `wss://${window.location.host}/ws`;

// Choose ICE port based on environment: localhost -> 10000, https -> same port (or 8443 fallback), otherwise NodePort 30751
const defaultIcePort = isLocalhost
    ? 10000
    : (window.location.protocol === 'https:'
        ? (pagePort ? Number(pagePort) : 8443)
        : 30751);

const config = {
    apiBaseUrl: userConfig.apiBaseUrl || defaultApiBaseUrl,
    audioWsUrl: userConfig.audioWsUrl || defaultAudioWsUrl,
    ice: {
        host: userConfig.iceHost || hostname,
        port: userConfig.icePort ?? defaultIcePort,
        resource: userConfig.iceResource || '/ice',
        useWss: userConfig.iceUseWss ?? !isLocalhost
    },
    turnServers: userConfig.turnServers || []
};

export default config;
