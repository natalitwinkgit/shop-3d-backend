export const requestLogger = (req, _res, next) => {
  if (!req.originalUrl.startsWith("/uploads")) {
    console.log(`[${req.method}] ${req.originalUrl}`);
  }

  next();
};
