import express from 'express';
import helmet from 'helmet';
import globalRateLimiter from './config/rateLimiter.js';
import routes from './routes/index.js';
import env from './config/envConfig.js';

const app = express();

app.use(helmet());
app.use(globalRateLimiter);
app.use(express.json());
app.use('/api', routes);

app.get('/', (req, res) => {
  res.send(`🚀 Backend running in ${env.NODE_ENV} mode`);
});

export default app;
