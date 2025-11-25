/**
 * REST API Delegate
 * Cliente HTTP que se comunica con el proxy Express (puerto 5001)
 * El proxy delega al backend Java TCP (puerto 12345)
 */

// Use Railway API URL or fallback to localhost for development
const API_BASE_URL = window.location.hostname.includes('railway.app')
    ? 'https://unique-smile-production.up.railway.app/api'
    : `http://${window.location.hostname}:3000/api`;

/**
 * Login de usuario
 * @param {string} username 
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function login(username) {
    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error en login:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Logout de usuario
 * @param {string} username 
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function logout(username) {
    try {
        const response = await fetch(`${API_BASE_URL}/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error en logout:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Obtener usuarios en línea
 * @returns {Promise<{success: boolean, users?: string[], message?: string}>}
 */
export async function getOnlineUsers() {
    try {
        const response = await fetch(`${API_BASE_URL}/users/online`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Obtener todos los usuarios (con estado online/offline)
 * @returns {Promise<{success: boolean, users?: Object, message?: string}>}
 */
export async function getAllUsers() {
    try {
        const response = await fetch(`${API_BASE_URL}/users/all`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error al obtener todos los usuarios:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Enviar mensaje a usuario
 * @param {string} from 
 * @param {string} to 
 * @param {string} content 
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function sendMessageToUser(from, to, content) {
    try {
        const response = await fetch(`${API_BASE_URL}/message/user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from, to, content })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error al enviar mensaje:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Enviar mensaje a grupo
 * @param {string} from 
 * @param {string} groupName 
 * @param {string} content 
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function sendMessageToGroup(from, groupName, content) {
    try {
        const response = await fetch(`${API_BASE_URL}/message/group`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from, groupName, content })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error al enviar mensaje a grupo:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Crear grupo
 * @param {string} groupName 
 * @param {string} creator 
 * @param {string[]} members 
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function createGroup(groupName, creator, members) {
    try {
        const response = await fetch(`${API_BASE_URL}/group/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupName, creator, members })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error al crear grupo:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Añadir miembro a grupo
 * @param {string} groupName 
 * @param {string} username 
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function addMemberToGroup(groupName, username) {
    try {
        const response = await fetch(`${API_BASE_URL}/group/add-member`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupName, username })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error al añadir miembro:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Obtener grupos del usuario
 * @param {string} username 
 * @returns {Promise<{success: boolean, groups?: string[], message?: string}>}
 */
export async function getUserGroups(username) {
    try {
        const response = await fetch(`${API_BASE_URL}/groups/${username}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error al obtener grupos:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Obtener historial de mensajes
 * @param {string} username 
 * @returns {Promise<{success: boolean, messages?: Array, message?: string}>}
 */
export async function getHistory(username) {
    try {
        const response = await fetch(`${API_BASE_URL}/history/${username}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error al obtener historial:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Obtener mensajes pendientes (polling)
 * @param {string} username 
 * @returns {Promise<{success: boolean, messages?: string[], message?: string}>}
 */
export async function getPendingMessages(username) {
    try {
        const response = await fetch(`${API_BASE_URL}/messages/pending/${username}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error al obtener mensajes pendientes:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Limpiar historial de chat entre dos usuarios
 * @param {string} user1 
 * @param {string} user2 
 * @returns {Promise<{status: string, message?: string}>}
 */
export async function clearChatHistory(user1, user2) {
    try {
        const response = await fetch(`${API_BASE_URL}/chat/clear`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user1, user2 })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error al limpiar historial:', error);
        return { status: 'ERROR', message: error.message };
    }
}

/**
 * Eliminar usuario permanentemente del sistema
 * @param {string} username 
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function deleteUser(username) {
    try {
        const response = await fetch(`${API_BASE_URL}/user/${username}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error al eliminar usuario:', error);
        return { success: false, message: error.message };
    }
}
