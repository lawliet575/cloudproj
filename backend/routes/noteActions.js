const express = require("express");
const router = express.Router();
const noteActionsController = require("../controllers/noteActionsController");
const verifyToken = require('../middlewares/verifyToken');

// Get highlight suggestions for a note
router.post("/highlight/:noteId", verifyToken, noteActionsController.getHighlightSuggestions);

// Divide a note into multiple notes
router.post("/divide/:noteId", verifyToken, noteActionsController.divideNote);

// Summarize note content
router.post("/summarize/:noteId", verifyToken, noteActionsController.summarizeNote);

// Fix typo and grammar errors
router.post("/fix-typo/:noteId", verifyToken, noteActionsController.fixTypoGrammar);

// Extract tasks from all notes
router.post("/extract-tasks", verifyToken, noteActionsController.extractTasks);

// Create multiple tasks (from extraction)
router.post("/create-tasks", verifyToken, noteActionsController.createTasks);

module.exports = router;

