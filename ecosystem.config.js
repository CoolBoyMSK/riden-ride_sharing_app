module.exports = {
  apps: [
    {
      name: 'web',
      script: 'index.js',
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production',
      },
    },
    {
      name: 'worker',
      script: 'src/workers/emailWorker.js',
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production',
      },
    },
  ],
};
