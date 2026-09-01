const successResponse = (res, statusCode, message, data = null, meta = null) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    ...(meta && { meta }),
  });
};

const errorResponse = (res, statusCode, message, details = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    ...(details && { details }),
  });
};

module.exports = { successResponse, errorResponse };