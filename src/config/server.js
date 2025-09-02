import env from './envConfig.js';
import http from 'http';
import { initSocket } from '../realtime/socket.js';

const startServer = (app) => {
  const server = http.createServer(app);
  
  // Initialize Socket.IO server
  initSocket(server);
  
  server.listen(env.PORT, () => {
    console.log(`✅ Server is listening on port ${env.PORT}`);
    console.log(`🔌 Socket.IO server ready for connections`);
  });
};

export default startServer;
