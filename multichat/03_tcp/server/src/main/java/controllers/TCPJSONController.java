package controllers;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import dtos.Request;
import dtos.Response;
import services.ChatServicesImpl;


public class TCPJSONController {

    private final ChatServicesImpl chatServices;
    private ServerSocket serverSocket;
    private boolean running;
    private final Executor executor;
    private final Gson gson;

    public TCPJSONController(ChatServicesImpl chatServices) {
        this(chatServices, 12345);
    }

    public TCPJSONController(ChatServicesImpl chatServices, int port) {
        this.chatServices = chatServices;
        this.gson = new GsonBuilder().create();
        this.executor = Executors.newFixedThreadPool(10);
        this.running = true;
        
        try {
            serverSocket = new ServerSocket(port);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public void start() {
        System.out.println("[TCP-JSON] Servidor TCP-JSON escuchando en puerto " + serverSocket.getLocalPort());
        
        new Thread(() -> {
            while (running) {
                try {
                    Socket clientSocket = serverSocket.accept();
                    executor.execute(new TCPClientHandler(clientSocket));
                } catch (Exception e) {
                    if (running) {
                        e.printStackTrace();
                    }
                }
            }
        }).start();
    }

    public void stop() {
        running = false;
        try {
            serverSocket.close();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    class TCPClientHandler implements Runnable {
        private final Socket clientSocket;

        public TCPClientHandler(Socket clientSocket) {
            this.clientSocket = clientSocket;
        }

        @Override
        public void run() {
            try {
                BufferedReader reader = new BufferedReader(new InputStreamReader(clientSocket.getInputStream()));
                BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(clientSocket.getOutputStream()));

                String line = reader.readLine();
                Request request = gson.fromJson(line, Request.class);
                Map<String, Object> data = request.data;
                
                Response response = new Response();

                try {
                    switch (request.action) {
                        case "LOGIN":
                            String username = (String) data.get("username");
                            int udpPort = data.get("udpPort") != null ? 
                                ((Number) data.get("udpPort")).intValue() : 0;
                            boolean loginSuccess = chatServices.login(username, udpPort, null);
                            response.setStatus(loginSuccess ? "OK" : "ERROR");
                            response.setSuccess(loginSuccess);
                            response.setMessage(loginSuccess ? "Login exitoso" : "Error en login");
                            break;
                        
                        case "LOGOUT":
                            username = (String) data.get("username");
                            boolean logoutSuccess = chatServices.logout(username);
                            response.setStatus(logoutSuccess ? "OK" : "ERROR");
                            response.setSuccess(logoutSuccess);
                            response.setMessage(logoutSuccess ? "Logout exitoso" : "Usuario no encontrado");
                            break;

                        case "SEND_MESSAGE_USER":
                            String from = (String) data.get("from");
                            String to = (String) data.get("to");
                            String content = (String) data.get("content");
                            boolean sent = chatServices.sendMessageToUser(from, to, content);
                            response.setStatus(sent ? "OK" : "ERROR");
                            response.setSuccess(sent);
                            response.setMessage(sent ? "Mensaje enviado" : "Error al enviar mensaje");
                            break;

                        case "SEND_MESSAGE_GROUP":
                            from = (String) data.get("from");
                            String groupName = (String) data.get("groupName");
                            content = (String) data.get("content");
                            sent = chatServices.sendMessageToGroup(from, groupName, content);
                            response.setStatus(sent ? "OK" : "ERROR");
                            response.setSuccess(sent);
                            response.setMessage(sent ? "Mensaje enviado al grupo" : "Error al enviar mensaje al grupo");
                            break;

                        case "GET_ONLINE_USERS":
                            List<String> users = chatServices.getOnlineUsers();
                            response.setStatus("OK");
                            response.setSuccess(true);
                            response.put("users", users);
                            break;
                        
                        case "GET_ALL_USERS":
                            Map<String, Boolean> usersStatus = chatServices.getAllUsersWithStatus();
                            response.setStatus("OK");
                            response.setSuccess(true);
                            response.put("users", usersStatus);
                            break;

                        case "CREATE_GROUP":
                            groupName = (String) data.get("groupName");
                            String creator = (String) data.get("creator");
                            boolean created = chatServices.createGroup(groupName, creator != null ? creator : "");
                            response.setStatus(created ? "OK" : "ERROR");
                            response.setSuccess(created);
                            response.setMessage(created ? "Grupo creado" : "Error al crear grupo");
                            break;

                        case "ADD_TO_GROUP":
                            groupName = (String) data.get("groupName");
                            username = (String) data.get("username");
                            boolean added = chatServices.addToGroup(groupName, username);
                            response.setStatus(added ? "OK" : "ERROR");
                            response.setSuccess(added);
                            response.setMessage(added ? "Usuario añadido al grupo" : "Error al añadir usuario");
                            break;

                        case "GET_HISTORY":
                            username = (String) data.get("username");
                            List<String> history = chatServices.getHistory(username);
                            response.setStatus("OK");
                            response.setSuccess(true);
                            response.put("history", history);
                            break;

                        case "GET_GROUPS":
                            List<String> groups = chatServices.getGroups();
                            response.setStatus("OK");
                            response.setSuccess(true);
                            response.put("groups", groups);
                            break;
                        
                        case "GET_USER_GROUPS":
                            username = (String) data.get("username");
                            List<String> userGroups = chatServices.getUserGroups(username);
                            response.setStatus("OK");
                            response.setSuccess(true);
                            response.put("groups", userGroups);
                            break;

                        case "GET_PENDING_MESSAGES":
                            username = (String) data.get("username");
                            List<String> pending = chatServices.getPendingMessages(username);
                            response.setStatus("OK");
                            response.setSuccess(true);
                            response.put("messages", pending);
                            break;

                        case "CLEAR_CHAT_HISTORY":
                            String user1 = (String) data.get("user1");
                            String user2 = (String) data.get("user2");
                            boolean cleared = chatServices.clearChatHistory(user1, user2);
                            response.setStatus(cleared ? "OK" : "ERROR");
                            response.setSuccess(cleared);
                            response.setMessage(cleared ? "Chat history cleared" : "Error clearing chat history");
                            break;

                        case "DELETE_USER":
                            username = (String) data.get("username");
                            boolean deleted = chatServices.deleteUser(username);
                            response.setStatus(deleted ? "OK" : "ERROR");
                            response.setSuccess(deleted);
                            response.setMessage(deleted ? "User deleted successfully" : "User not found");
                            break;

                        case "CLEANUP_INVALID_USERS":
                            int cleanedCount = chatServices.cleanupInvalidUsers();
                            response.setStatus("OK");
                            response.setSuccess(true);
                            response.put("cleaned", cleanedCount);
                            response.setMessage(cleanedCount + " invalid users cleaned");
                            break;

                        case "END_CALL":
                            String caller = (String) data.get("from");
                            String callee = (String) data.get("to");
                            boolean ended = chatServices.endCall(caller, callee);
                            response.setStatus(ended ? "OK" : "ERROR");
                            response.setSuccess(ended);
                            response.setMessage(ended ? "Call ended" : "Error ending call");
                            break;

                        default:
                            response.setStatus("ERROR");
                            response.setMessage("Unknown action: " + request.action);
                            break;
                    }
                } catch (Exception e) {
                    response.setStatus("ERROR");
                    response.setMessage(e.getMessage());
                    e.printStackTrace();
                }

                String json = gson.toJson(response);
                writer.write(json);
                writer.newLine();
                writer.flush();
                writer.close();
                reader.close();
                clientSocket.close();

            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }
}
