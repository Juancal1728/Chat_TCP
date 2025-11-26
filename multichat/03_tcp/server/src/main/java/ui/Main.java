package ui;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;
import java.util.logging.Logger;

import com.zeroc.Ice.Communicator;
import com.zeroc.Ice.InitializationData;
import com.zeroc.Ice.ObjectAdapter;
import com.zeroc.Ice.Util;

import chat.ChatServiceImpl;
import controllers.TCPJSONController;
import services.ChatServicesImpl;
import util.TCPConnection;

/**
 * Main application class for the Chat Server.
 * Manages all server components: TCP, HTTP proxy, ICE RPC, and Audio WebSocket.
 *
 * @author Juan David Calderón & Juan Felipe Nieto
 * @version 3.1
 */
public class Main implements TCPConnection.Listener {

    private static final Logger LOGGER = Logger.getLogger(Main.class.getName());

    // Server configuration loaded from properties
    private final ServerConfig config;
    private final ExecutorService executorService;

    public Main() {
        this.config = loadServerConfig();
        this.executorService = Executors.newCachedThreadPool();
        setupShutdownHook();
    }

    public static void main(String[] args) {
        printBanner();
        Main server = new Main();
        server.start();
    }

    /**
     * Loads server configuration from properties file
     */
    private ServerConfig loadServerConfig() {
        Properties props = new Properties();
        try (InputStream is = getClass().getClassLoader().getResourceAsStream("server.properties")) {
            if (is != null) {
                props.load(is);
            } else {
                LOGGER.warning("server.properties not found, using defaults");
            }
        } catch (IOException e) {
            LOGGER.log(Level.WARNING, "Failed to load server.properties, using defaults", e);
        }

        return new ServerConfig(props);
    }

    /**
     * Starts all server components
     */
    private void start() {
        try {
            LOGGER.info("Initializing Chat Server components...");

            // Validate configuration
            validateConfiguration();

            // Initialize core services
            ChatServicesImpl chatServices = new ChatServicesImpl();

            // Start servers in order
            startTCPServer();
            startHTTPProxyServer(chatServices);
            startIceServer(chatServices);
            startAudioServer();

            LOGGER.info("All servers started successfully");
            LOGGER.info("Server ready. Press Ctrl+C to stop.");

            // Keep main thread alive
            waitForShutdown();

        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Failed to start server", e);
            shutdown();
            System.exit(1);
        }
    }

    /**
     * Validates server configuration
     */
    private void validateConfiguration() throws IllegalArgumentException {
        if (config.tcpPort <= 0 || config.tcpPort > 65535) {
            throw new IllegalArgumentException("Invalid TCP port: " + config.tcpPort);
        }
        if (config.httpProxyPort <= 0 || config.httpProxyPort > 65535) {
            throw new IllegalArgumentException("Invalid HTTP proxy port: " + config.httpProxyPort);
        }
        if (config.audioWsPort <= 0 || config.audioWsPort > 65535) {
            throw new IllegalArgumentException("Invalid Audio WS port: " + config.audioWsPort);
        }
        if (config.iceWsPort <= 0 || config.iceWsPort > 65535) {
            throw new IllegalArgumentException("Invalid ICE WS port: " + config.iceWsPort);
        }
        if (config.iceWssPort <= 0 || config.iceWssPort > 65535) {
            throw new IllegalArgumentException("Invalid ICE WSS port: " + config.iceWssPort);
        }
        LOGGER.info("Configuration validation passed");
    }

    /**
     * Starts the legacy TCP server
     */
    private void startTCPServer() {
        LOGGER.info(String.format("Starting TCP server on port %d", config.tcpPort));
        TCPConnection srv = TCPConnection.getInstance();
        srv.initAsServer(config.tcpPort);
        srv.setListener(this);

        executorService.submit(() -> {
            try {
                srv.start();
                LOGGER.info("TCP server started successfully");
            } catch (Exception e) {
                LOGGER.log(Level.SEVERE, "TCP server failed", e);
            }
        });
    }

    /**
     * Starts the HTTP proxy server for REST API
     */
    private void startHTTPProxyServer(ChatServicesImpl chatServices) {
        LOGGER.info(String.format("Starting HTTP proxy server on port %d", config.httpProxyPort));
        TCPJSONController tcpJsonController = new TCPJSONController(chatServices, config.httpProxyPort);

        executorService.submit(() -> {
            try {
                tcpJsonController.start();
                LOGGER.info("HTTP proxy server started successfully");
            } catch (Exception e) {
                LOGGER.log(Level.SEVERE, "HTTP proxy server failed", e);
            }
        });
    }

    /**
     * Starts the ICE RPC server with WebSocket support
     */
    private void startIceServer(ChatServicesImpl chatServices) {
        LOGGER.info("Starting ICE RPC server");
        try {
            // Initialize WS communicator
            Communicator wsCommunicator = Util.initialize();
            ObjectAdapter wsAdapter = wsCommunicator.createObjectAdapterWithEndpoints(
                "ChatAdapterWS", String.format("ws -p %d -h 0.0.0.0", config.iceWsPort));
            ChatServiceImpl chatServiceWS = new ChatServiceImpl(chatServices);
            wsAdapter.add(chatServiceWS, Util.stringToIdentity("ChatService"));
            wsAdapter.activate();

            // Initialize WSS communicator with SSL
            com.zeroc.Ice.Properties sslProps = Util.createProperties();
            sslProps.setProperty("Ice.Plugin.IceSSL", "IceSSL.PluginFactory");
            sslProps.setProperty("IceSSL.DefaultDir", config.sslCertDir);
            sslProps.setProperty("IceSSL.CertFile", config.sslCertFile);
            sslProps.setProperty("IceSSL.Password", config.sslPassword);
            sslProps.setProperty("IceSSL.CAs", config.sslCaFile);

            InitializationData sslInitData = new InitializationData();
            sslInitData.properties = sslProps;

            Communicator wssCommunicator = Util.initialize(sslInitData);
            ObjectAdapter wssAdapter = wssCommunicator.createObjectAdapterWithEndpoints(
                "ChatAdapterWSS", String.format("wss -p %d -h 0.0.0.0", config.iceWssPort));
            ChatServiceImpl chatServiceWSS = new ChatServiceImpl(chatServices);
            wssAdapter.add(chatServiceWSS, Util.stringToIdentity("ChatService"));
            wssAdapter.activate();

            LOGGER.info(String.format("ICE WS server started on port %d", config.iceWsPort));
            LOGGER.info(String.format("ICE WSS server started on port %d", config.iceWssPort));

        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "ICE server failed to start", e);
        }
    }

    /**
     * Starts the Audio WebSocket server
     */
    private void startAudioServer() {
        LOGGER.info(String.format("Starting Audio WebSocket server on port %d", config.audioWsPort));
        executorService.submit(() -> {
            try {
                chat.AudioServer audioServer = new chat.AudioServer(config.audioWsPort);
                audioServer.start();
                chat.AudioServer.INSTANCE = audioServer;
                LOGGER.info("Audio server started successfully");
            } catch (Exception e) {
                LOGGER.log(Level.WARNING, "Audio server failed to start (port may be in use), continuing without audio", e);
            }
        });
    }

    /**
     * Waits for shutdown signal
     */
    private void waitForShutdown() {
        try {
            Thread.currentThread().join();
        } catch (InterruptedException e) {
            LOGGER.info("Server shutdown requested");
            Thread.currentThread().interrupt();
        }
    }

    /**
     * Gracefully shuts down all services
     */
    private void shutdown() {
        LOGGER.info("Shutting down server...");

        executorService.shutdown();
        try {
            if (!executorService.awaitTermination(10, TimeUnit.SECONDS)) {
                LOGGER.warning("Forcing shutdown of remaining tasks");
                executorService.shutdownNow();
                if (!executorService.awaitTermination(5, TimeUnit.SECONDS)) {
                    LOGGER.warning("Some tasks did not terminate cleanly");
                }
            }
        } catch (InterruptedException e) {
            LOGGER.warning("Shutdown interrupted, forcing immediate shutdown");
            executorService.shutdownNow();
            Thread.currentThread().interrupt();
        }

        LOGGER.info("Server shutdown complete");
    }

    /**
     * Sets up JVM shutdown hook for graceful shutdown
     */
    private void setupShutdownHook() {
        Runtime.getRuntime().addShutdownHook(new Thread(this::shutdown, "shutdown-hook"));
    }

    /**
     * Prints application banner
     */
    private static void printBanner() {
        System.out.println("╔══════════════════════════════════════════════════════════════╗");
        System.out.println("║                    CHAT SERVER v3.1                         ║");
        System.out.println("║              Multi-Protocol TCP with ICE RPC                ║");
        System.out.println("╠══════════════════════════════════════════════════════════════╣");
        System.out.println("║  TCP Server          : 6000                                  ║");
        System.out.println("║  HTTP Proxy          : 12345                                 ║");
        System.out.println("║  ICE RPC (WS)        : 10000                                 ║");
        System.out.println("║  ICE RPC (WSS)       : 8443                                  ║");
        System.out.println("║  Audio WebSocket     : 8888                                  ║");
        System.out.println("╠══════════════════════════════════════════════════════════════╣");
        System.out.println("║  Authors: Juan David Calderón & Juan Felipe Nieto           ║");
        System.out.println("╚══════════════════════════════════════════════════════════════╝");
        System.out.println();
    }

    @Override
    public void onLog(String line) {
        LOGGER.info(String.format("[TCP] %s", line));
    }

    /**
     * Inner class for server configuration
     */
    private static class ServerConfig {
        final int tcpPort;
        final int httpProxyPort;
        final int audioWsPort;
        final int iceWsPort;
        final int iceWssPort;
        final String sslCertDir;
        final String sslCertFile;
        final String sslPassword;
        final String sslCaFile;

        ServerConfig(Properties props) {
            this.tcpPort = Integer.parseInt(props.getProperty("tcp.port", "6000"));
            this.httpProxyPort = Integer.parseInt(props.getProperty("http.proxy.port", "12345"));
            this.audioWsPort = Integer.parseInt(props.getProperty("audio.ws.port", "8888"));
            this.iceWsPort = Integer.parseInt(props.getProperty("ice.ws.port", "10000"));
            this.iceWssPort = Integer.parseInt(props.getProperty("ice.wss.port", "8443"));
            this.sslCertDir = props.getProperty("ssl.cert.dir", "server/src/main/resources/certs");
            this.sslCertFile = props.getProperty("ssl.cert.file", "server.p12");
            this.sslPassword = props.getProperty("ssl.cert.password", "password");
            this.sslCaFile = props.getProperty("ssl.ca.file", "ca.pem");
        }
    }
}
