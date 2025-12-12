// const express = require("express");
// const cors = require("cors");
// // require('dotenv').config();
// const logger = require('./utils/logger');

// const authRoutes = require("./routes/auth");
// const noteRoutes = require("./routes/notes");
// const profileRoutes = require("./routes/profile");

// const app = express();
// app.use(cors({ origin: "http://localhost:3000" })); // your frontend dev port
// app.use(express.json());

// app.use("/auth", authRoutes);
// app.use("/note", noteRoutes);
// app.use("/user", profileRoutes);


// const PORT = process.env.PORT || 5000;
// // Only start server if not in test mode
// if (process.env.NODE_ENV !== "test") {
//   app.listen(PORT, () => {
//     console.log("Server running at http://localhost:5000");
//   });
// }

// module.exports = app;

const express = require("express");
const cors = require("cors");
require("dotenv").config();   // keep this enabled for DB credentials
const logger = require("./utils/logger");

const authRoutes = require("./routes/auth");
const noteRoutes = require("./routes/notes");
const profileRoutes = require("./routes/profile");
const tasksRoutes = require("./routes/tasks");
const notebooksRoutes = require("./routes/notebooks");
const noteActionsRoutes = require("./routes/noteActions");

// Initialize app
const app = express();
// CORS configuration - allow both local dev and Azure Static Web App
const allowedOrigins = [
  "http://localhost:3000",
  "https://lemon-smoke-0150f1400.3.azurestaticapps.net"
];
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());

// Register routes
app.use("/auth", authRoutes);
app.use("/note", noteRoutes);
app.use("/user", profileRoutes);
app.use("/tasks", tasksRoutes);
app.use("/notebooks", notebooksRoutes);
app.use("/note-actions", noteActionsRoutes);


// Server port
const PORT = process.env.PORT || 5000;

// Only start server if not in test mode
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    logger.info(`Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;