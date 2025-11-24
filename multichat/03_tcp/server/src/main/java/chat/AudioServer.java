package chat;

import java.io.UnsupportedEncodingException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.ByteBuffer;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

public class AudioServer extends WebSocketServer {
    public static AudioServer INSTANCE = null;

    private final Map<String, WebSocket> userConnections = new ConcurrentHashMap<>();
    private final Map<WebSocket, String> connectionUsers = new ConcurrentHashMap<>();

    // Simple structure to keep the target and the format of the stream
    private static class CallTarget {
        public String target;
        public String format;
        public CallTarget(String t, String f) { this.target = t; this.format = f; }
    }

    public AudioServer(int port) {
        super(new InetSocketAddress(port));
    }

    @Override
    public void onOpen(WebSocket conn, ClientHandshake handshake) {
        // Expecting user ID in the resource descriptor, e.g.,
        // ws://localhost:8888/username
        String descriptor = handshake.getResourceDescriptor();
        String username = descriptor.length() > 1 ? descriptor.substring(1) : ""; // Remove leading slash
        try {
            username = URLDecoder.decode(username, "UTF-8");
        } catch (UnsupportedEncodingException e) {
            System.err.println("[AUDIO] Failed to decode username from descriptor: " + descriptor + " ; err=" + e.getMessage());
        }

        if (username.isEmpty()) {
            conn.close(1008, "Username required");
            return;
        }

        userConnections.put(username, conn);
        connectionUsers.put(conn, username);
        System.out.println("[AUDIO] User connected: " + username + " (remote=" + conn.getRemoteSocketAddress() + ", resource=" + descriptor + ")");
    }

    // Helper to send simple signaling messages to a specific user if they're connected
    public boolean sendSignalTo(String username, String message) {
        WebSocket conn = userConnections.get(username);
        if (conn != null && conn.isOpen()) {
            conn.send(message);
            return true;
        }
        return false;
    }

    @Override
    public void onClose(WebSocket conn, int code, String reason, boolean remote) {
        String username = connectionUsers.remove(conn);
        if (username != null) {
            userConnections.remove(username);
            activeCallTargets.remove(username);
            System.out.println("[AUDIO] User disconnected: " + username);
        }
    }

    @Override
    public void onMessage(WebSocket conn, String message) {
        // Handle signaling messages (JSON)
        // Format: { "type": "call_request", "target": "userB" }
        // Format: { "type": "call_accept", "target": "userA" }
        // Format: { "type": "call_end", "target": "userB" }

        // For simplicity, we'll just relay everything to the target
        // But we need to parse JSON to find the target
        try {
            // Simple manual parsing to avoid adding Gson dependency here if not needed,
            // but we already have Gson in the project.
            // Let's assume the client sends "TARGET|MESSAGE" for simplicity or just JSON

            // Using simple string protocol for signaling to match the project style
            // SIGNAL|TARGET_USER|TYPE|PAYLOAD

            String[] parts = message.split("\\|", 4);
            if (parts.length >= 3 && "SIGNAL".equals(parts[0])) {
                String targetUser = parts[1];
                String type = parts[2];
                String payload = parts.length > 3 ? parts[3] : "";

                WebSocket targetConn = userConnections.get(targetUser);
                if (targetConn != null && targetConn.isOpen()) {
                    String sender = connectionUsers.get(conn);
                    targetConn.send("SIGNAL|" + sender + "|" + type + "|" + payload);
                } else {
                    // Target not found or offline
                    conn.send("ERROR|Target offline");
                }
            } else if (parts.length >= 2 && "START_STREAM".equals(parts[0])) {
                String targetUser = parts[1];
                String format = "unknown";
                // Optional format in the protocol: START_STREAM|target|format=pcm
                if (parts.length > 2 && parts[2] != null && parts[2].startsWith("format=")) {
                    format = parts[2].substring("format=".length());
                }
                String sender = connectionUsers.get(conn);
                System.out.println("[AUDIO] START_STREAM from '" + sender + "' to '" + targetUser + "' (format=" + format + ")");
                if (sender == null || sender.isEmpty()) {
                    conn.send("ERROR|No sender associated with connection");
                } else if (targetUser == null || targetUser.isEmpty()) {
                    conn.send("ERROR|Invalid target user");
                } else {
                    activeCallTargets.put(sender, new CallTarget(targetUser, format));
                    System.out.println("[AUDIO] Stream started from " + sender + " to " + targetUser + " (format=" + format + ")");
                }
            } else if (parts.length >= 1 && "STOP_STREAM".equals(parts[0])) {
                String sender = connectionUsers.get(conn);
                if (sender != null) {
                    activeCallTargets.remove(sender);
                    System.out.println("[AUDIO] Stream stopped from " + sender);
                }
            }
        } catch (Exception e) {
            System.err.println("[AUDIO] Error parsing message: " + e.getMessage());
        }
    }

    @Override
    public void onMessage(WebSocket conn, ByteBuffer message) {
        // Handle binary audio data
        // We need a protocol to know who this audio is for.
        // Option 1: The first few bytes contain the target username length and
        // username.
        // Option 2: We set up a "call session" via text messages first, and then map
        // the connection to a target.

        // Let's go with Option 2: Active Call Mapping
        // For this simple implementation, we can assume a user is in ONLY ONE call at a
        // time.
        // We can store "activeCallTarget" in a map.

        // However, to keep it stateless-ish for the binary stream, let's use a simple
        // header.
        // But modifying the binary stream on the client is hard with MediaRecorder.

        // Better approach for this project:
        // The client sends a text message "START_STREAM|TARGET_USER" to set the current
        // target.
        // Then all subsequent binary messages are forwarded to that target.

        String sender = connectionUsers.get(conn);
        CallTarget ct = activeCallTargets.get(sender);
        String target = ct != null ? ct.target : null;

        if (target != null && ct != null) {
            WebSocket targetConn = userConnections.get(target);
            if (sender != null && sender.equals(target)) {
                System.out.println("[AUDIO] Warning: sender and target are the same (" + sender + "). Skipping forward to avoid echo.");
                return;
            }
            if (targetConn != null && targetConn.isOpen()) {
                // Optionally, we can log the stream format for debugging
                String format = ct.format != null ? ct.format : "unknown";
                System.out.println("[AUDIO] Forwarding audio from " + sender + " to " + target + " (format=" + format + ", size=" + message.remaining() + ")");
                targetConn.send(message);
            }
        }
    }

    // Map to store who is streaming to whom: Sender -> CallTarget
    private final Map<String, CallTarget> activeCallTargets = new ConcurrentHashMap<>();

    @Override
    public void onError(WebSocket conn, Exception ex) {
        System.err.println("[AUDIO] Error: " + ex.getMessage());
    }

    @Override
    public void onStart() {
        System.out.println("[AUDIO] Audio Server started on port " + getPort());
    }

    // Helper to set call target from the text handler
    public void setCallTarget(String sender, String target) {
        activeCallTargets.put(sender, new CallTarget(target, "unknown"));
    }

    public void removeCallTarget(String sender) {
        activeCallTargets.remove(sender);
    }
}
