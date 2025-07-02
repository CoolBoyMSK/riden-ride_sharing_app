export const requestLogger = (req, res, next) => {
  const start = Date.now();
  const now = new Date().toISOString();
  console.log(`[${now}] → ${req.method} ${req.originalUrl}`);

  res.on('finish', () => {
    const later = new Date().toISOString();
    console.log(
      `[${later}] ← ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`,
    );
  });

  next();
};
