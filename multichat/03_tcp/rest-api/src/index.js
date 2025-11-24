import express from 'express';
import cors from 'cors';
import {
  login,
  logout,
  sendMessageToUser,
  sendMessageToGroup,
  getOnlineUsers,
  getAllUsers,
  createGroup,
  addToGroup,
  getHistory,
  getGroups,
  getUserGroups,
  getPendingMessages,
  clearChatHistory,
  deleteUser,
  cleanupInvalidUsers
} from './services/delegateService.js';

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, udpPort } = req.body;
    const result = await login(username, udpPort || 0);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// Logout
app.post('/api/logout', async (req, res) => {
  try {
    const { username } = req.body;
    const result = await logout(username);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// Get online users
app.get('/api/users/online', async (req, res) => {
  try {
    const result = await getOnlineUsers();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// Get all users (with online/offline status)
app.get('/api/users/all', async (req, res) => {
  try {
    const result = await getAllUsers();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// Send message to user
app.post('/api/message/user', async (req, res) => {
  try {
    const { from, to, content } = req.body;
    const result = await sendMessageToUser(from, to, content);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// Send message to group
app.post('/api/message/group', async (req, res) => {
  try {
    const { from, groupName, content } = req.body;
    const result = await sendMessageToGroup(from, groupName, content);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// Create group
app.post('/api/group/create', async (req, res) => {
  try {
    const { groupName, creator, members } = req.body;
    const result = await createGroup(groupName, creator);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// Add user to group
app.post('/api/group/add-member', async (req, res) => {
  try {
    const { groupName, username } = req.body;
    const result = await addToGroup(groupName, username);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// Get groups for user
app.get('/api/groups/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const result = await getUserGroups(username);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// Get history
app.get('/api/history/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const result = await getHistory(username);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// Get pending messages (for polling)
app.get('/api/messages/pending/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const result = await getPendingMessages(username);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// Clear chat history between two users
app.post('/api/chat/clear', async (req, res) => {
  try {
    const { user1, user2 } = req.body;
    const result = await clearChatHistory(user1, user2);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// Delete user permanently
app.delete('/api/user/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const result = await deleteUser(username);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// Cleanup invalid users (empty or whitespace usernames)
app.post('/api/admin/cleanup', async (req, res) => {
  try {
    const result = await cleanupInvalidUsers();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`[REST-API] Server listening on port ${PORT}`);
});
