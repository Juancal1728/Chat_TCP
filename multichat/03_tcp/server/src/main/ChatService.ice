module chat {

    struct Message {
        string id;
        string sender;
        string receiver;
        string content;
        bool isAudio;
        long timestamp;
    };

    // Información de una llamada
    struct Call {
        string callId;
        string caller;
        string callee;
        bool active;
        long startedAt;
    };

    sequence<Message> MessageSeq;
    sequence<Call> CallSeq;

    // Definir primero ChatCallback
    interface ChatCallback {
        void onNewMessage(Message msg);
        void onCallStarted(Call call);
        void onCallEnded(string callId);
    };

    interface ChatService {
        MessageSeq getHistory(string userOrGroupId);
        void sendMessage(string receiver, string content);
        void sendAudio(string receiver, string audioBase64);

        // Llamadas
        Call startCall(string caller, string callee);
        void endCall(string callId);
        CallSeq getActiveCalls(string userId);

        // Suscripción a eventos en tiempo real
        void subscribe(string userId, ChatCallback* cb);
    };
};
