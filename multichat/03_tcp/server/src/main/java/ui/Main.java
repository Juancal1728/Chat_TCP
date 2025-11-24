package ui;

import com.zeroc.Ice.Communicator;
import com.zeroc.Ice.ObjectAdapter;
import com.zeroc.Ice.Util;

import chat.ChatServiceImpl;
import controllers.TCPJSONController;
import services.ChatServicesImpl;
import util.TCPConnection;

public class Main implements TCPConnection.Listener {

    public static void main(String[] args) {
        System.out.println("=== SERVIDOR DE CHAT  ===");
        System.out.println("Servidor TCP original (puerto 6000)");
        System.out.println("Servidor TCP-JSON para proxy HTTP (puerto 12345)");
        System.out.println("Servidor ICE RPC (puerto 10000)");
        System.out.println("====================================\n");

        ChatServicesImpl chatServices = new ChatServicesImpl();

        Main m = new Main();
        TCPConnection srv = TCPConnection.getInstance();
        srv.initAsServer(6000);
        srv.setListener(m);
        new Thread(() -> srv.start()).start();

        TCPJSONController tcpJsonController = new TCPJSONController(chatServices, 12345);
        tcpJsonController.start();

        // Iniciar servidor ICE
        startIceServer(chatServices);

        // Iniciar servidor de Audio (WebSocket) — manejamos errores si el puerto ya está en uso
        try {
            chat.AudioServer audioServer = new chat.AudioServer(8888);
            audioServer.start();
            chat.AudioServer.INSTANCE = audioServer;
            System.out.println("Audio Server started on port 8888");
        } catch (Exception e) {
            // Audio server failing to start (port in use etc.). Log and continue.
            System.err.println("Could not start Audio Server (port 8888 may be in use). Continuing without audio server: " + e.getMessage());
        }

        System.out.println("\nServidores iniciados correctamente");
        System.out.println("Presiona Ctrl+C para detener\n");

        try {
            Thread.currentThread().join();
        } catch (InterruptedException e) {
            System.out.println("Servidor detenido");
        }
    }

    private static void startIceServer(ChatServicesImpl chatServices) {
        try {
            com.zeroc.Ice.InitializationData initData = new com.zeroc.Ice.InitializationData();
            initData.properties = com.zeroc.Ice.Util.createProperties();
            initData.properties.setProperty("Ice.MessageSizeMax", "10240"); // 10MB

            Communicator communicator = Util.initialize(initData);
            ObjectAdapter adapter = communicator.createObjectAdapterWithEndpoints("ChatAdapter", "ws -p 10000");

            ChatServiceImpl chatService = new ChatServiceImpl(chatServices);
            adapter.add(chatService, Util.stringToIdentity("ChatService"));

            adapter.activate();
            System.out.println("ICE server started on port 10000");
        } catch (Exception e) {
            System.err.println("Error starting ICE server: " + e.getMessage());
            e.printStackTrace();
        }
    }

    @Override
    public void onLog(String line) {
        System.out.println(line);
    }
}
