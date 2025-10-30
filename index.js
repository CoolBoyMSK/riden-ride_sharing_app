import app from './src/app.js';
import connectDB from './src/config/db.js';
import startServer from './src/config/server.js';
import './src/crons/cronjobs.js';

const bootstrap = async () => {
  await connectDB();
  startServer(app);
};

bootstrap();
