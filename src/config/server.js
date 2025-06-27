import env from './envConfig.js';

const startServer = (app) => {
  app.listen(env.PORT, () => {
    console.log(`✅ Server is listening on port ${env.PORT}`);
  });
};

export default startServer;
