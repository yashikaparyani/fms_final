const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

const errorHandler = (err, req, res, next) => {
  // An error carrying its own status is one the caller can act on — a setup
  // step not yet done, a value out of range. Honour it rather than reporting
  // every such case as a 500, which reads as "the server is broken" for
  // something the user can fix themselves.
  const statusCode =
    err.status || (res.statusCode === 200 ? 500 : res.statusCode);

  res.status(statusCode);
  res.json({
    message: err.message,
    // Lets the client key off the cause rather than matching on prose.
    ...(err.code ? { code: err.code } : {}),
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
};

module.exports = { notFound, errorHandler };
