function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { value, error } = schema.validate(req[source], { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        details: error.details.map((detail) => detail.message)
      });
    }
    req[source] = value;
    return next();
  };
}

module.exports = { validate };
