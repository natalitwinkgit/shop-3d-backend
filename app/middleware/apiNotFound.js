export const apiNotFoundHandler = (req, res) => {
  res.status(404).json({
    message: "API route not found",
    path: req.originalUrl,
  });
};
