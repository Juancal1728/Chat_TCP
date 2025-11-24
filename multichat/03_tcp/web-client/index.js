import './index.css';
// import './src/services/ChatService.js'; // Load ICE chat module globally - commented out to avoid import issues
import { routes } from './src/router/routes.js';

const app = document.getElementById('app');
app.innerHTML = '';
app.appendChild(routes);
