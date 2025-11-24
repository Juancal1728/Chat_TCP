package chat;

import java.io.IOException;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.zeroc.Ice.Current;

import services.ChatServicesImpl;

public class ChatServiceImpl implements ChatService {
    private final ChatServicesImpl chatServices;
    private final Map<String, ChatCallbackPrx> subscribers = new ConcurrentHashMap<>();

    public ChatServiceImpl(ChatServicesImpl chatServices) {
        this.chatServices = chatServices;
    }

    @Override
    public Message[] getHistory(String userOrGroupId, Current current) {
        try {
            List<String> history = chatServices.getHistory(userOrGroupId);
            List<Message> messages = new ArrayList<>();

            for (String line : history) {
                // Parse the JSON-like string to Message
                // This is a simple parser, adjust as needed
                Message msg = parseMessage(line);
                if (msg != null) {
                    messages.add(msg);
                }
            }

            return messages.toArray(new Message[0]);
        } catch (IOException e) {
            throw new RuntimeException("Error getting history", e);
        }
    }

    @Override
    public void sendMessage(String receiver, String content, Current current) {
        String sender = getUserFromCurrent(current);
        System.out.println("[SERVER] sendMessage called — sender: " + sender + ", receiver: " + receiver + ", content: "
                + content);
        try {
            if (receiver.startsWith("#")) {
                // Group message
                chatServices.sendMessageToGroup(sender, receiver.substring(1), content);
            } else {
                // Private message
                chatServices.sendMessageToUser(sender, receiver, content);
            }

            // Notify subscribers
            Message msg = new Message();
            msg.id = System.currentTimeMillis() + "";
            msg.sender = sender;
            msg.receiver = receiver;
            msg.content = content;
            msg.isAudio = false;
            msg.timestamp = System.currentTimeMillis();

            notifySubscribers(msg);

            // If message is a special CALL_ACCEPT payload, also signal via AudioServer
            // (fallback)
            try {
                if (content != null && content.trim().startsWith("{")) {
                    // Parse JSON to find 'type' and optional 'from' and 'format' fields
                    @SuppressWarnings("unchecked")
                    java.util.Map<String, Object> parsed = new com.google.gson.Gson().fromJson(content,
                            java.util.Map.class);
                    if (parsed != null && "CALL_ACCEPT".equals(parsed.get("type"))) {
                        String format = parsed.get("format") != null ? (String) parsed.get("format") : "webm";
                        String acceptFrom = parsed.get("from") != null ? (String) parsed.get("from") : msg.sender;
                        if (AudioServer.INSTANCE != null) {
                            boolean sent = AudioServer.INSTANCE.sendSignalTo(receiver,
                                    "SIGNAL|" + acceptFrom + "|CALL_ACCEPT|format=" + format);
                            if (sent)
                                System.out.println("[SERVER] Sent CALL_ACCEPT signal via AudioServer to " + receiver
                                        + " (from=" + acceptFrom + ")");
                        }
                    }
                }
            } catch (Exception e) {
                // Ignore parse issues
            }
        } catch (IOException e) {
            throw new RuntimeException("Error sending message", e);
        }
    }

    @Override
    public void sendAudio(String receiver, String audioBase64, Current current) {
        String sender = getUserFromCurrent(current);
        String actualAudioData = audioBase64;

        // WORKAROUND: Check if audioBase64 is a JSON payload with sender info
        // This is necessary because Ice context propagation is failing in some
        // environments
        if (audioBase64 != null && audioBase64.trim().startsWith("{")) {
            try {
                @SuppressWarnings("unchecked")
                java.util.Map<String, Object> payload = new com.google.gson.Gson().fromJson(audioBase64,
                        java.util.Map.class);
                if (payload.containsKey("sender") && payload.containsKey("data")) {
                    sender = (String) payload.get("sender");
                    actualAudioData = (String) payload.get("data");
                    System.out.println("[SERVER] Extracted sender from payload: " + sender);
                }
            } catch (Exception e) {
                System.err.println("[SERVER] Failed to parse audio payload: " + e.getMessage());
            }
        }

        System.out.println("[SERVER] sendAudio called — sender: " + sender + ", receiver: " + receiver
                + ", size(base64): " + (actualAudioData != null ? actualAudioData.length() : 0));
        try {
            // Decode base64 to bytes
            byte[] audioData = java.util.Base64.getDecoder().decode(actualAudioData);

            if (receiver.startsWith("#")) {
                chatServices.sendVoiceNoteToGroup(sender, receiver.substring(1), audioData);
            } else {
                chatServices.sendVoiceNoteToUser(sender, receiver, audioData);
            }

            // Notify subscribers - use JSON content for audio so clients can parse
            // structured audio messages.
            Message msg = new Message();
            msg.id = System.currentTimeMillis() + "";
            msg.sender = sender;
            msg.receiver = receiver;
            // Build JSON payload so clients can parse: { type:'audio', data: '<base64>' }
            java.util.Map<String, Object> audioObj = new java.util.HashMap<>();
            audioObj.put("type", "audio");
            audioObj.put("data", actualAudioData);
            try {
                msg.content = new com.google.gson.Gson().toJson(audioObj);
            } catch (Exception gsonEx) {
                // Fallback to raw base64 string if JSON serialization fails
                msg.content = actualAudioData;
            }
            msg.isAudio = true;
            msg.timestamp = System.currentTimeMillis();

            notifySubscribers(msg);

            // Also log the audio message to history (since sendVoiceNoteToUser doesn't log
            // the JSON)
            try {
                chatServices.sendMessageToUser(sender, receiver, msg.content);
            } catch (IOException e) {
                System.err.println("[SERVER] Failed to log audio message to history: " + e.getMessage());
            }
        } catch (IOException e) {
            throw new RuntimeException("Error sending audio", e);
        }
    }

    @Override
    public Call startCall(String caller, String callee, Current current) {
        String implicitUser = getUserFromCurrent(current);
        System.out.println("[SERVER] startCall called — caller param: " + caller + ", callee: " + callee
                + ", implicit user: " + implicitUser);
        // Log whether callUser returns a valid transport/result
        String result = chatServices.callUser(caller, callee);
        System.out.println("[SERVER] callUser result: " + result);
        if (result == null) {
            throw new RuntimeException("Cannot start call");
        }

        Call call = new Call();
        call.callId = caller + "_" + callee + "_" + System.currentTimeMillis();
        call.caller = caller;
        call.callee = callee;
        call.active = true;
        call.startedAt = System.currentTimeMillis();

        // Notify callee (preferred via callback if available)
        ChatCallbackPrx callback = subscribers.get(callee);
        boolean notified = false;
        if (callback != null) {
            try {
                callback.onCallStarted(call);
                notified = true;
            } catch (Exception e) {
                System.err.println("[SERVER] Error delivering onCallStarted to callback: " + e.getMessage());
                e.printStackTrace();
                subscribers.remove(callee);
            }
        }
        // If not notified via ICE callback, try AudioServer websocket signaling as
        // fallback
        if (!notified) {
            if (chatServices != null && chat.AudioServer.INSTANCE != null) {
                boolean sentSignal = chat.AudioServer.INSTANCE.sendSignalTo(callee,
                        "SIGNAL|" + caller + "|CALL_REQUEST|" + call.callId);
                if (sentSignal) {
                    System.out.println("[SERVER] Sent CALL_REQUEST signal via AudioServer to " + callee);
                    notified = true;
                } else {
                    System.out.println("[SERVER] AudioServer couldn't find callee for CALL_REQUEST: " + callee);
                    // Fallback: if no ICE callback and no AudioServer, queue the incoming call as a
                    // pending message
                    System.out.println(
                            "[SERVER] Queuing INCOMING_CALL for " + callee + " so UI can pick it up via polling");
                    try {
                        chatServices.sendMessageToUser(caller, callee, "INCOMING_CALL|" + caller + "|" + call.callId);
                    } catch (IOException e) {
                        System.err.println("[SERVER] Failed to queue INCOMING_CALL for polling: " + e.getMessage());
                    }
                }
            }
        }

        return call;
    }

    @Override
    public void endCall(String callId, Current current) {
        // Parse callId to get caller and callee
        String[] parts = callId.split("_");
        if (parts.length >= 2) {
            String caller = parts[0];
            String callee = parts[1];

            Call call = new Call();
            call.callId = callId;
            call.caller = caller;
            call.callee = callee;
            call.active = false;
            call.startedAt = 0; // Not relevant

            // Notify both
            notifyCallEnded(caller, call);
            notifyCallEnded(callee, call);
        }
    }

    @Override
    public Call[] getActiveCalls(String userId, Current current) {
        // For simplicity, return empty array, as active calls tracking is not
        // implemented
        return new Call[0];
    }

    @Override
    public void subscribe(String userId, ChatCallbackPrx cb, Current current) {
        System.out.println(
                "[SERVER] ICE subscribe called for user: " + userId + ", connection: " + current.con.toString());
        subscribers.put(userId, cb);
    }

    private void notifySubscribers(Message msg) {
        System.out.println("[SERVER] notifySubscribers called for msg to: " + msg.receiver + ", from: " + msg.sender);

        // 1. Send to receiver (if online)
        if (subscribers.containsKey(msg.receiver)) {
            try {
                System.out.println("[SERVER] Sending to receiver: " + msg.receiver);
                subscribers.get(msg.receiver).onNewMessage(msg);
            } catch (Exception e) {
                System.err.println("[SERVER] Error sending to receiver: "
                        + (e.getMessage() != null ? e.getMessage() : "(no message)"));
                e.printStackTrace();
                subscribers.remove(msg.receiver);
                // Fallback: send via AudioServer signaling if available
                if (AudioServer.INSTANCE != null) {
                    String encodedContent = msg.content;
                    try {
                        encodedContent = URLEncoder.encode(msg.content != null ? msg.content : "", "UTF-8");
                    } catch (Exception encEx) {
                        System.err.println("[SERVER] Failed to URL-encode message content for SIGNAL fallback: "
                                + encEx.getMessage());
                    }
                    String signal = "MSG|" + msg.sender + "|MSG|" + encodedContent;
                    boolean ok = AudioServer.INSTANCE.sendSignalTo(msg.receiver, signal);
                    if (ok) {
                        System.out.println("[SERVER] Fallback: sent message via AudioServer to " + msg.receiver);
                    } else {
                        System.out.println("[SERVER] Fallback: AudioServer couldn't find user " + msg.receiver);
                    }
                }
            }
        } else {
            System.out.println("[SERVER] Receiver " + msg.receiver + " not found in subscribers. Available: "
                    + subscribers.keySet());
        }

        // 2. If it's a group message, send to all members except sender
        if (msg.receiver.startsWith("#")) {
            String groupName = msg.receiver.substring(1);
            List<String> members = chatServices.getGroupMembers(groupName);
            for (String member : members) {
                if (!member.equals(msg.sender) && subscribers.containsKey(member)) {
                    try {
                        subscribers.get(member).onNewMessage(msg);
                    } catch (Exception e) {
                        subscribers.remove(member);
                    }
                }
            }
        }
    }

    private void notifyCallEnded(String userId, Call call) {
        ChatCallbackPrx callback = subscribers.get(userId);
        if (callback != null) {
            try {
                callback.onCallEnded(call.callId);
            } catch (Exception e) {
                // Ignore
            }
        }
    }

    private String getUserFromCurrent(Current current) {
        // Extract user from connection context or connection info
        // For WebSocket connections, we can try to get user from connection string
        String connectionInfo = current.con.toString();

        // Look for user parameter in connection string
        // (ws://host:port/ChatService?user=username)
        if (connectionInfo.contains("user=")) {
            String[] parts = connectionInfo.split("user=");
            if (parts.length > 1) {
                String userPart = parts[1].split("[&\\s]")[0]; // Extract until & or space
                return userPart;
            }
        }

        // Fallback: try context
        if (current.ctx != null && current.ctx.containsKey("user")) {
            Object ctxVal = current.ctx.get("user");
            System.out.println("[SERVER] current.ctx contains: user=" + ctxVal);
            return (String) ctxVal;
        }

        // Last resort: extract from connection string pattern
        // This is a temporary solution for demo purposes
        if (current.ctx != null) {
            System.out.println("[SERVER] Current.ctx entries: " + current.ctx);
        }
        System.out.println("[SERVER] Unable to extract user from current: " + connectionInfo + ", ctx: "
                + (current.ctx != null ? current.ctx : "null"));
        return "unknown_user";
    }

    private Message parseMessage(String line) {
        // Simple parser for the JSON-like format
        // {type:text,from:user1,target:user2,isGroup:false,msg:hello,ts:2023-...}
        try {
            Message msg = new Message();
            msg.id = System.currentTimeMillis() + ""; // Generate ID
            msg.isAudio = line.contains("type:voice_note");

            // Extract fields
            String[] parts = line.replace("{", "").replace("}", "").split(",");
            for (String part : parts) {
                String[] kv = part.split(":", 2);
                if (kv.length == 2) {
                    String key = kv[0].trim();
                    String value = kv[1].trim();
                    switch (key) {
                        case "from":
                            msg.sender = value;
                            break;
                        case "target":
                            msg.receiver = value;
                            break;
                        case "msg":
                        case "file":
                            msg.content = value;
                            break;
                        case "ts":
                            msg.timestamp = java.time.Instant.parse(value.replace(" ", "T")).toEpochMilli();
                            break;
                    }
                }
            }
            return msg;
        } catch (Exception e) {
            return null;
        }
    }
}