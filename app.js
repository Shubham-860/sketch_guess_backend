const express = require('express');
const createError = require('http-errors');
const logger = require('morgan');

const app = express();

// Middleware
app.use(logger('dev'));
app.use(express.json());

// Single route for now
app.get('/', (req, res) => {
  res.json({ message: 'Sketch Guess backend is running' });
});

// Handle unknown routes
app.use((req, res, next) => {
  next(createError(404, 'Route not found'));
});

// Handle errors
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});


// Handle errors
// app.use(function(err, req, res, next) {
//   res.status(err.status || 500).json({
//     error: err.message || 'Internal server error'
//   });
// });
module.exports = app;