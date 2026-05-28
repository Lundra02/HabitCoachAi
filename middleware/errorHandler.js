const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode).json({
    error: err.message || "Internal Server Error"
  });
};

export default errorHandler;
