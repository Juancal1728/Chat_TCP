import net from 'net';

const HOST = process.env.TCP_SERVER_HOST || 'localhost';
const PORT = parseInt(process.env.TCP_SERVER_PORT || '12345');

/**
 * Send request to Java TCP-JSON server
 */
const sendRequest = (action, data) => {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();

    socket.connect(PORT, HOST, () => {
      const request = {
        action: action,
        data: data,
      };
      const reqStr = JSON.stringify(request);
      console.log('[delegateService] Sending TCP request → action:', action, 'data:', data);
      socket.write(reqStr);
      socket.write('\n');

      // Accumulate response chunks until a full JSON message is received (delimited by '\n')
      let buffer = '';
      // Add a timeout to prevent stuck sockets; 5s is reasonable for local dev
      socket.setTimeout(5000);

      const onData = (chunk) => {
        buffer += chunk.toString();
        // If we received at least one newline, parse up to the first newline
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex !== -1) {
          const message = buffer.substring(0, newlineIndex).trim();
          try {
            const parsed = JSON.parse(message);
            resolve(parsed);
          } catch (e) {
            console.error('[delegateService] Failed to parse TCP-JSON response:', message);
            reject(e);
          }
          socket.removeListener('data', onData);
          socket.removeListener('end', onEnd);
          socket.removeListener('timeout', onTimeout);
          socket.end();
        }
      };

      socket.on('data', onData);
      const onEnd = () => {
        // If we close without a newline, try to parse buffer anyway
        if (buffer.length > 0) {
          const message = buffer.trim();
          try {
            const parsed = JSON.parse(message);
            resolve(parsed);
            return;
          } catch (e) {
            console.error('[delegateService] Failed to parse TCP-JSON response on socket end:', message);
            reject(e);
            return;
          }
        }
        reject(new Error('TCP connection ended without data'));
      };

      const onTimeout = () => {
        socket.removeListener('data', onData);
        socket.removeListener('end', onEnd);
        reject(new Error('TCP request timeout'));
        socket.end();
      };
      socket.on('end', onEnd);
      socket.on('timeout', onTimeout);
    });

    socket.on('error', (err) => {
      reject(err);
    });
    // ensure all errors/timeouts are captured -- the 'timeout' handler is added per connection
  });
};

export const login = (username, udpPort) => {
  return sendRequest('LOGIN', { username, udpPort });
};

export const logout = (username) => {
  return sendRequest('LOGOUT', { username });
};

export const sendMessageToUser = (from, to, content) => {
  return sendRequest('SEND_MESSAGE_USER', { from, to, content });
};

export const sendMessageToGroup = (from, groupName, content) => {
  return sendRequest('SEND_MESSAGE_GROUP', { from, groupName, content });
};

export const getOnlineUsers = () => {
  return sendRequest('GET_ONLINE_USERS', {});
};

export const getAllUsers = () => {
  return sendRequest('GET_ALL_USERS', {});
};

export const createGroup = (groupName, creator) => {
  return sendRequest('CREATE_GROUP', { groupName, creator });
};

export const addToGroup = (groupName, username) => {
  return sendRequest('ADD_TO_GROUP', { groupName, username });
};

export const getHistory = (username) => {
  return sendRequest('GET_HISTORY', { username });
};

export const getGroups = () => {
  return sendRequest('GET_GROUPS', {});
};

export const getUserGroups = (username) => {
  return sendRequest('GET_USER_GROUPS', { username });
};

export const getPendingMessages = (username) => {
  return sendRequest('GET_PENDING_MESSAGES', { username });
};

export const clearChatHistory = (user1, user2) => {
  return sendRequest('CLEAR_CHAT_HISTORY', { user1, user2 });
};

export const deleteUser = (username) => {
  return sendRequest('DELETE_USER', { username });
};

export const cleanupInvalidUsers = () => {
  return sendRequest('CLEANUP_INVALID_USERS', {});
};
