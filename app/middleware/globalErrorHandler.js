export const globalErrorHandler = (err, req, res, _next) => {
  console.error("[SERVER ERROR]", err);

  const status = err?.statusCode || err?.status || 500;
  res.status(status).json({
    message: err?.message || "Server error",
    path: req.originalUrl,
    ...(process.env.NODE_ENV === "production" ? {} : { stack: err?.stack }),
  });
};
