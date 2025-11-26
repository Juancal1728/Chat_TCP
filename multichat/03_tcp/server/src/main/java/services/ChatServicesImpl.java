package services;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.net.Socket;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Lógica de negocio del chat separada de la capa de transporte
 */
public class ChatServicesImpl {

    // ---- Estado compartido ----
    private final Map<String, ClientSession> users = new ConcurrentHashMap<>();
    private final Set<String> allKnownUsers = ConcurrentHashMap.newKeySet(); // Registro permanente de usuarios
    private final Map<String, Set<String>> groups = new ConcurrentHashMap<>();
    private final Map<String, List<String>> pendingMessages = new ConcurrentHashMap<>(); // Cola de mensajes pendientes para cada usuario
    private final File dataDir = new File("data");
    private final File historyDir = new File(dataDir, "history");
    private final File mediaDir = new File(dataDir, "media");
    private final File usersFile = new File(dataDir, "users.txt");
    private final File groupsFile = new File(dataDir, "groups.txt");

    public ChatServicesImpl() {
        historyDir.mkdirs();
        mediaDir.mkdirs();
        loadKnownUsers();
        loadGroups();
    }
    
    private void loadKnownUsers() {
        if (usersFile.exists()) {
            try (BufferedReader reader = new BufferedReader(new FileReader(usersFile))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    allKnownUsers.add(line.trim());
                }
                System.out.println("[DEBUG] Loaded " + allKnownUsers.size() + " known users");
            } catch (IOException e) {
                System.err.println("[ERROR] Failed to load users: " + e.getMessage());
            }
        }
    }
    
    private void saveKnownUsers() {
        try (FileWriter writer = new FileWriter(usersFile)) {
            for (String username : allKnownUsers) {
                writer.write(username + "\n");
            }
        } catch (IOException e) {
            System.err.println("[ERROR] Failed to save users: " + e.getMessage());
        }
    }
    
    private void loadGroups() {
        if (groupsFile.exists()) {
            try (BufferedReader reader = new BufferedReader(new FileReader(groupsFile))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    // Formato: groupName:member1,member2,member3
                    String[] parts = line.split(":", 2);
                    if (parts.length == 2) {
                        String groupName = parts[0].trim();
                        String[] members = parts[1].split(",");
                        
                        Set<String> memberSet = ConcurrentHashMap.newKeySet();
                        for (String member : members) {
                            String trimmedMember = member.trim();
                            if (!trimmedMember.isEmpty()) {
                                memberSet.add(trimmedMember);
                            }
                        }
                        
                        if (!memberSet.isEmpty()) {
                            groups.put(groupName, memberSet);
                        }
                    }
                }
                System.out.println("[DEBUG] Loaded " + groups.size() + " groups");
                for (Map.Entry<String, Set<String>> entry : groups.entrySet()) {
                    System.out.println("[DEBUG]   - " + entry.getKey() + ": " + entry.getValue());
                }
            } catch (IOException e) {
                System.err.println("[ERROR] Failed to load groups: " + e.getMessage());
            }
        }
    }
    
    private void saveGroups() {
        try (FileWriter writer = new FileWriter(groupsFile)) {
            for (Map.Entry<String, Set<String>> entry : groups.entrySet()) {
                String groupName = entry.getKey();
                String members = String.join(",", entry.getValue());
                writer.write(groupName + ":" + members + "\n");
            }
            System.out.println("[DEBUG] Saved " + groups.size() + " groups to file");
        } catch (IOException e) {
            System.err.println("[ERROR] Failed to save groups: " + e.getMessage());
        }
    }

    // ---- Sesión de cliente ----
    public static class ClientSession {
        public final String username;
        public Socket socket;
        public PrintWriter out;
        public volatile int udpPort;

        public ClientSession(String username, Socket socket) throws IOException {
            this.username = username;
            this.socket = socket;
            if (socket != null) {
                this.out = new PrintWriter(new OutputStreamWriter(socket.getOutputStream()), true);
            }
        }

        public ClientSession(String username) {
            this.username = username;
            this.socket = null;
            this.out = null;
        }
    }

    // ---- Gestión de usuarios ----
    public boolean login(String username, int udpPort, Socket socket) throws IOException {
        // Validar que el username no esté vacío o solo contenga espacios
        if (username == null || username.trim().isEmpty()) {
            System.err.println("[ERROR] Rejected login: username is null or empty");
            return false;
        }
        
        // Limpiar el username de espacios al inicio/final
        username = username.trim();
        
        // Registrar usuario si es nuevo
        if (!allKnownUsers.contains(username)) {
            allKnownUsers.add(username);
            saveKnownUsers();
            System.out.println("[DEBUG] New user registered: " + username);
        }
        
        // Permitir re-login del mismo usuario (actualizar sesión)
        if (users.containsKey(username)) {
            System.out.println("[DEBUG] User " + username + " reconnecting - updating session");
            ClientSession existingSession = users.get(username);
            existingSession.socket = socket;
            if (socket != null) {
                existingSession.out = new PrintWriter(new OutputStreamWriter(socket.getOutputStream()), true);
            }
            existingSession.udpPort = udpPort;
            broadcast("SYS " + username + " reconnected");
            return true;
        }
        
        ClientSession session = new ClientSession(username, socket);
        session.udpPort = udpPort;
        users.put(username, session);
        broadcast("SYS " + username + " joined");
        return true;
    }

    public boolean logout(String username) {
        ClientSession session = users.remove(username);
        if (session != null) {
            broadcast("SYS " + username + " left");
            return true;
        }
        return false;
    }

    /**
     * Limpia usuarios inválidos (vacíos o solo espacios)
     * @return número de usuarios limpiados
     */
    public int cleanupInvalidUsers() {
        int cleaned = 0;
        List<String> toRemove = new ArrayList<>();
        
        // Identificar usuarios inválidos
        for (String username : allKnownUsers) {
            if (username == null || username.trim().isEmpty()) {
                toRemove.add(username);
                cleaned++;
            }
        }
        
        // Eliminar usuarios inválidos
        for (String username : toRemove) {
            allKnownUsers.remove(username);
            users.remove(username);
            pendingMessages.remove(username);
            
            // Eliminar de grupos
            for (Map.Entry<String, Set<String>> entry : groups.entrySet()) {
                entry.getValue().remove(username);
            }
        }
        
        // Guardar cambios
        if (cleaned > 0) {
            saveKnownUsers();
            saveGroups();
            System.out.println("[CLEANUP] Removed " + cleaned + " invalid users");
        }
        
        return cleaned;
    }

    /**
     * Elimina un usuario permanentemente del sistema
     * @param username El nombre del usuario a eliminar
     * @return true si el usuario fue eliminado, false si no existía
     */
    public boolean deleteUser(String username) {
        if (!allKnownUsers.contains(username)) {
            return false; // Usuario no existe
        }
        
        // 1. Hacer logout si está online
        logout(username);
        
        // 2. Eliminar de todos los grupos
        for (Map.Entry<String, Set<String>> entry : groups.entrySet()) {
            entry.getValue().remove(username);
        }
        
        // 3. Eliminar mensajes pendientes
        pendingMessages.remove(username);
        
        // 4. Eliminar de la lista de usuarios conocidos
        allKnownUsers.remove(username);
        
        // 5. Eliminar archivo de historial del usuario
        File userHistoryFile = new File(historyDir, username + ".jsonl");
        if (userHistoryFile.exists()) {
            userHistoryFile.delete();
        }
        
        // 6. Guardar cambios en users.txt
        saveKnownUsers();
        
        // 7. Guardar cambios en groups.txt
        saveGroups();
        
        // 8. Broadcast de eliminación
        broadcast("SYS User " + username + " has been deleted from the system");
        
        return true;
    }

    public List<String> getOnlineUsers() {
        return new ArrayList<>(users.keySet());
    }
    
    public List<String> getAllUsers() {
        return new ArrayList<>(allKnownUsers);
    }
    
    public Map<String, Boolean> getAllUsersWithStatus() {
        Map<String, Boolean> usersStatus = new HashMap<>();
        for (String username : allKnownUsers) {
            usersStatus.put(username, users.containsKey(username));
        }
        return usersStatus;
    }

    public void setUserUdpPort(String username, int port) {
        ClientSession session = users.get(username);
        if (session != null) {
            session.udpPort = port;
        }
    }

    // ---- Gestión de grupos ----
    public boolean createGroup(String groupName) {
        groups.putIfAbsent(groupName, ConcurrentHashMap.newKeySet());
        saveGroups(); // Guardar inmediatamente
        System.out.println("[DEBUG] Group created (no creator): " + groupName);
        return true;
    }
    
    public boolean createGroup(String groupName, String creator) {
        groups.putIfAbsent(groupName, ConcurrentHashMap.newKeySet());
        groups.get(groupName).add(creator);
        saveGroups(); // Guardar inmediatamente
        System.out.println("[DEBUG] Group created: " + groupName + " by " + creator);
        System.out.println("[DEBUG] Members after creation: " + groups.get(groupName));
        return true;
    }

    public boolean addToGroup(String groupName, String username) {
        groups.putIfAbsent(groupName, ConcurrentHashMap.newKeySet());
        groups.get(groupName).add(username);
        saveGroups(); // Guardar inmediatamente
        System.out.println("[DEBUG] User " + username + " added to group " + groupName);
        System.out.println("[DEBUG] Group members now: " + groups.get(groupName));
        return true;
    }

    public List<String> getGroups() {
        return new ArrayList<>(groups.keySet());
    }
    
    public List<String> getUserGroups(String username) {
        List<String> userGroups = new ArrayList<>();
        for (Map.Entry<String, Set<String>> entry : groups.entrySet()) {
            if (entry.getValue().contains(username)) {
                userGroups.add(entry.getKey());
            }
        }
        return userGroups;
    }

    public List<String> getGroupMembers(String groupName) {
        Set<String> members = groups.get(groupName);
        return members != null ? new ArrayList<>(members) : new ArrayList<>();
    }

    // ---- Mensajes de texto ----
    public boolean sendMessageToUser(String from, String to, String message) throws IOException {
        String record = "{type:text,from:" + from + ",target:" + to + ",isGroup:false,msg:" + message + ",ts:" + Instant.now() + "}";
        persist(from, to, false, record);

        ClientSession session = users.get(to);
        
        // Solo agregar a pendientes si el usuario está OFFLINE
        if (session == null) {
            pendingMessages.putIfAbsent(to, new ArrayList<>());
            pendingMessages.get(to).add("MSG|" + from + "|" + message);
            System.out.println("[DEBUG] User " + to + " is offline, message queued");
        } else {
            // Usuario online - enviar vía polling (pendientes)
            pendingMessages.putIfAbsent(to, new ArrayList<>());
            pendingMessages.get(to).add("MSG|" + from + "|" + message);
            System.out.println("[DEBUG] User " + to + " is online, message sent to pending for polling");
        }
        
        return true;
    }

    public boolean sendMessageToGroup(String from, String groupName, String message) throws IOException {
        String record = "{type:text,from:" + from + ",target:" + groupName + ",isGroup:true,msg:" + message + ",ts:" + Instant.now() + "}";
        persist(from, groupName, true, record);

        Set<String> members = groups.getOrDefault(groupName, Set.of());
        System.out.println("[DEBUG] Sending message to group: " + groupName);
        System.out.println("[DEBUG] Group members: " + members);
        System.out.println("[DEBUG] Message: " + message + " from: " + from);
        
        for (String username : members) {
            // NO enviar el mensaje al remitente
            if (username.equals(from)) {
                continue;
            }
            
            // Agregar a cola de mensajes pendientes de cada miembro
            pendingMessages.putIfAbsent(username, new ArrayList<>());
            String pendingMsg = "GROUP|" + groupName + "|" + from + "|" + message;
            pendingMessages.get(username).add(pendingMsg);
            System.out.println("[DEBUG] Added to pending queue for " + username + ": " + pendingMsg);
            
            ClientSession session = users.get(username);
            if (session != null && session.out != null) {
                session.out.println("MSG " + from + " -> #" + groupName + ": " + message);
            }
        }
        return true;
    }
    
    // ---- Polling de mensajes pendientes ----
    public List<String> getPendingMessages(String username) {
        List<String> messages = pendingMessages.getOrDefault(username, new ArrayList<>());
        pendingMessages.put(username, new ArrayList<>()); // Limpiar mensajes después de obtenerlos
        return messages;
    }

    public List<String> getHistory(String username) throws IOException {
        File historyFile = new File(historyDir, username + ".jsonl");
        List<String> history = new ArrayList<>();
        
        // Cargar mensajes privados del usuario
        if (historyFile.exists()) {
            try (BufferedReader reader = new BufferedReader(new FileReader(historyFile))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    history.add(line);
                }
            }
        }
        
        // Cargar mensajes de grupos donde el usuario es miembro
        List<String> userGroups = getUserGroups(username);
        for (String groupName : userGroups) {
            File groupFile = new File(historyDir, "#" + groupName + ".jsonl");
            if (groupFile.exists()) {
                try (BufferedReader reader = new BufferedReader(new FileReader(groupFile))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        history.add(line);
                    }
                }
            }
        }
        
        return history;
    }

    /**
     * Limpia el historial de chat entre dos usuarios
     * @param user1 Primer usuario
     * @param user2 Segundo usuario
     * @return true si se limpió correctamente
     */
    public boolean clearChatHistory(String user1, String user2) {
        try {
            // Limpiar historial del usuario 1
            File historyFile1 = new File(historyDir, user1 + ".jsonl");
            if (historyFile1.exists()) {
                List<String> filteredHistory = new ArrayList<>();
                try (BufferedReader reader = new BufferedReader(new FileReader(historyFile1))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        // Mantener solo mensajes que NO sean entre user1 y user2
                        if (!line.contains("from:" + user2) && !line.contains("target:" + user2)) {
                            filteredHistory.add(line);
                        }
                    }
                }
                // Reescribir archivo sin los mensajes entre estos usuarios
                try (FileWriter writer = new FileWriter(historyFile1)) {
                    for (String line : filteredHistory) {
                        writer.write(line + "\n");
                    }
                }
            }

            // Limpiar historial del usuario 2
            File historyFile2 = new File(historyDir, user2 + ".jsonl");
            if (historyFile2.exists()) {
                List<String> filteredHistory = new ArrayList<>();
                try (BufferedReader reader = new BufferedReader(new FileReader(historyFile2))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        // Mantener solo mensajes que NO sean entre user2 y user1
                        if (!line.contains("from:" + user1) && !line.contains("target:" + user1)) {
                            filteredHistory.add(line);
                        }
                    }
                }
                // Reescribir archivo sin los mensajes entre estos usuarios
                try (FileWriter writer = new FileWriter(historyFile2)) {
                    for (String line : filteredHistory) {
                        writer.write(line + "\n");
                    }
                }
            }

            System.out.println("[CHAT] History cleared between " + user1 + " and " + user2);
            return true;
        } catch (IOException e) {
            System.err.println("[ERROR] Failed to clear chat history: " + e.getMessage());
            return false;
        }
    }

    // ---- Notas de voz ----
    public boolean sendVoiceNoteToUser(String from, String to, byte[] audioData) throws IOException {
        File audioFile = new File(mediaDir, "vn_" + System.currentTimeMillis() + ".raw");
        try (FileOutputStream fos = new FileOutputStream(audioFile)) {
            fos.write(audioData);
        }

        String record = "{type:voice_note,from:" + from + ",target:" + to + ",isGroup:false,file:" + audioFile.getPath() + ",ts:" + Instant.now() + "}";
        persist(from, to, false, record);

        ClientSession session = users.get(to);
        if (session != null && session.socket != null) {
            session.out.println("VOICE_NOTE_FROM " + from + " " + audioData.length);
            session.out.flush();
            session.socket.getOutputStream().write(audioData);
            session.socket.getOutputStream().flush();
        }
        return true;
    }

    public boolean sendVoiceNoteToGroup(String from, String groupName, byte[] audioData) throws IOException {
        File audioFile = new File(mediaDir, "vn_" + System.currentTimeMillis() + ".raw");
        try (FileOutputStream fos = new FileOutputStream(audioFile)) {
            fos.write(audioData);
        }

        String record = "{type:voice_note,from:" + from + ",target:" + groupName + ",isGroup:true,file:" + audioFile.getPath() + ",ts:" + Instant.now() + "}";
        persist(from, groupName, true, record);

        Set<String> members = groups.getOrDefault(groupName, Set.of());
        for (String username : members) {
            if (username.equals(from)) continue;
            
            ClientSession session = users.get(username);
            if (session != null && session.socket != null) {
                session.out.println("VOICE_NOTE_FROM " + from + " " + audioData.length);
                session.out.flush();
                session.socket.getOutputStream().write(audioData);
                session.socket.getOutputStream().flush();
            }
        }
        return true;
    }

    // ---- Llamadas ----
    public String callUser(String caller, String target) {
        ClientSession targetSession = users.get(target);
        ClientSession callerSession = users.get(caller);

        if (targetSession == null || callerSession == null) {
            // If either user isn't online we cannot place a call
            return null;
        }

        // If both users have udp ports configured (native clients), return the UDP address
        if (targetSession.udpPort != 0 && callerSession.udpPort != 0 && targetSession.socket != null) {
            // Notificar al target (native UDP capable clients)
            if (targetSession.out != null && targetSession.socket != null) {
                targetSession.out.println("INCOMING_CALL " + caller + " " +
                        callerSession.socket.getInetAddress().getHostAddress() + " " + callerSession.udpPort);
            }
            // Retornar información de conexión para el caller
            return targetSession.socket.getInetAddress().getHostAddress() + ":" + targetSession.udpPort;
        }

        // Web clients don't use UDP, but we still want to support calls via WebSocket/ICE.
        // Notify target that an incoming call is requested and return a simple 'websocket' token.
        if (targetSession.out != null) {
            targetSession.out.println("INCOMING_CALL_WS " + caller);
        }
        return "websocket";
    }

    public boolean endCall(String from, String to) {
        // For simplicity, just return true as calls are handled via ICE/WebRTC
        return true;
    }

    // ---- Utilidades ----
    private void broadcast(String message) {
        users.values().forEach(session -> {
            if (session.out != null) {
                session.out.println(message);
            }
        });
    }

    private void persist(String from, String target, boolean isGroup, String line) throws IOException {
        // Guardar en historial del remitente
        File senderFile = new File(historyDir, from + ".jsonl");
        try (FileWriter fw = new FileWriter(senderFile, true)) {
            fw.write(line + "\n");
        }

        // Guardar en historial del destinatario
        if (isGroup) {
            File groupFile = new File(historyDir, "#" + target + ".jsonl");
            try (FileWriter fw = new FileWriter(groupFile, true)) {
                fw.write(line + "\n");
            }
        } else {
            File targetFile = new File(historyDir, target + ".jsonl");
            try (FileWriter fw = new FileWriter(targetFile, true)) {
                fw.write(line + "\n");
            }
        }
    }

    public Map<String, ClientSession> getUsersMap() {
        return users;
    }

    public Map<String, Set<String>> getGroupsMap() {
        return groups;
    }
}
