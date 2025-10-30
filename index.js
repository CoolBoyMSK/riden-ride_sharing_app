import app from './src/app.js';
import connectDB from './src/config/db.js';
import startServer from './src/config/server.js';
import crons from './src/crons/cronjobs.js';

const bootstrap = async () => {
  await connectDB();
  startServer(app);
  crons;
};

bootstrap();
