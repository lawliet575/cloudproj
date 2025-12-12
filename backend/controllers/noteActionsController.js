const { GoogleGenerativeAI } = require("@google/generative-ai");
const notesModel = require("../models/notesModel");
const notebooksModel = require("../models/notebooksModel");
const userModel = require("../models/userModel");
const logger = require("../utils/logger");

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Get highlight suggestions for a note
 * Returns array of text segments to highlight
 */
const getHighlightSuggestions = async (req, res) => {
    const { noteId } = req.params;
    const userId = req.user.userId;

    try {
        // Get note content
        const note = await notesModel.LoadHTMLByNoteID(noteId, userId);
        if (!note) {
            return res.status(404).json({ error: "Note not found" });
        }

        if (note.is_protected) {
            return res.status(400).json({ error: "Cannot analyze protected notes" });
        }

        // Strip HTML for analysis
        const cleanContent = note.content_html
            ? note.content_html.replace(/<[^>]*>/g, ' ').trim()
            : "";

        if (!cleanContent || cleanContent.length < 10) {
            return res.status(400).json({ error: "Note content is too short to analyze" });
        }

        // Call Gemini to identify key points
        const model = genAI.getGenerativeModel({
            model: process.env.GEMINI_MODEL || "gemini-1.5-flash"
        });

        const prompt = `Analyze this text and identify the most important phrases/sentences that should be highlighted.

Text:
${cleanContent}

Return ONLY a valid JSON array of objects with the exact text to highlight. Maximum 10 items.
Format: [{"text": "exact phrase to highlight", "color": "#ffeb3b"}, ...]

Rules:
- Use EXACT text from the document (must match character-for-character)
- Highlight key facts, important terms, conclusions, or action items
- Use yellow (#ffeb3b) for general highlights
- Use green (#a5d6a7) for positive/success items
- Use red (#ef9a9a) for warnings/important alerts
- Keep each highlight under 100 characters`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Parse JSON from response
        let highlights = [];
        try {
            const jsonMatch = responseText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                highlights = JSON.parse(jsonMatch[0]);
            }
        } catch (parseErr) {
            logger.warn({ parseErr }, "Failed to parse highlight suggestions");
            return res.status(500).json({ error: "Failed to parse AI response" });
        }

        logger.info({ userId, noteId, highlightCount: highlights.length }, "Generated highlight suggestions");
        res.status(200).json({ highlights });

    } catch (err) {
        logger.error({ err, userId, noteId }, "Error getting highlight suggestions");
        res.status(500).json({ error: "Failed to analyze note" });
    }
};

/**
 * Get divide suggestions and execute the split
 * Creates a new notebook with multiple notes from the content
 */
const divideNote = async (req, res) => {
    const { noteId } = req.params;
    const userId = req.user.userId;

    try {
        // Get note content
        const note = await notesModel.LoadHTMLByNoteID(noteId, userId);
        if (!note) {
            return res.status(404).json({ error: "Note not found" });
        }

        if (note.is_protected) {
            return res.status(400).json({ error: "Cannot divide protected notes" });
        }

        // Get note name for notebook naming
        const noteDetails = await notesModel.findNoteByUserID(userId, noteId);
        const noteName = noteDetails?.note_name || "Divided Note";

        const cleanContent = note.content_html
            ? note.content_html.replace(/<[^>]*>/g, ' ').trim()
            : "";

        if (!cleanContent || cleanContent.length < 50) {
            return res.status(400).json({ error: "Note content is too short to divide" });
        }

        // Call Gemini to suggest divisions
        const model = genAI.getGenerativeModel({
            model: process.env.GEMINI_MODEL || "gemini-1.5-flash"
        });

        const prompt = `Analyze this note content and divide it into logical sections.

Original Note Title: "${noteName}"
Content:
${cleanContent}

Return ONLY a valid JSON object with a suggested notebook name and sections.
Format:
{
  "notebook_name": "Suggested Notebook Name",
  "sections": [
    {"title": "Section 1 Title", "content": "<p>HTML formatted content for this section</p>"},
    {"title": "Section 2 Title", "content": "<p>HTML formatted content for this section</p>"}
  ]
}

Rules:
- Create 2-6 logical sections based on topics/themes
- Each section should have a descriptive title
- Preserve meaning but you can reorganize for clarity
- Wrap content in proper HTML tags (<p>, <ul>, <li>, etc.)
- The notebook name should describe the overall topic`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Parse JSON from response
        let divisionData;
        try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                divisionData = JSON.parse(jsonMatch[0]);
            }
        } catch (parseErr) {
            logger.warn({ parseErr }, "Failed to parse division suggestions");
            return res.status(500).json({ error: "Failed to parse AI response" });
        }

        if (!divisionData || !divisionData.sections || divisionData.sections.length === 0) {
            return res.status(500).json({ error: "AI could not determine how to divide this note" });
        }

        // Create the notebook
        const newNotebook = await notebooksModel.createNotebook(
            userId,
            divisionData.notebook_name || `${noteName} - Sections`
        );

        // Create notes for each section
        const createdNotes = [];
        for (const section of divisionData.sections) {
            if (!section.title || !section.content) continue;

            const newNote = await notesModel.CreateNote(userId, newNotebook.id);
            await notesModel.SaveNewNameInNoteID(section.title, newNote.id, userId);
            await notesModel.SaveHTMLInNoteID(section.content, newNote.id, userId);

            createdNotes.push({
                id: newNote.id,
                title: section.title,
            });
        }

        // Delete the original note
        await notesModel.DeleteNote(noteId, userId);

        // Clear graph cache
        await userModel.clearGraphMetadata(userId);

        logger.info({
            userId,
            originalNoteId: noteId,
            notebookId: newNotebook.id,
            notesCreated: createdNotes.length,
        }, "Note divided successfully via toolbar action");

        res.status(200).json({
            message: "Note divided successfully",
            notebook: {
                id: newNotebook.id,
                name: newNotebook.notebook_name,
            },
            notes: createdNotes,
        });

    } catch (err) {
        logger.error({ err, userId, noteId }, "Error dividing note");
        res.status(500).json({ error: "Failed to divide note" });
    }
};

/**
 * Extract potential tasks from all user notes
 * Returns list of suggested tasks for user confirmation
 */
const extractTasks = async (req, res) => {
    const userId = req.user.userId;

    try {
        // Get all notes with content
        const notes = await notesModel.findAllNotesWithContentByUserID(userId);

        if (!notes || notes.length === 0) {
            return res.status(200).json({
                tasks: [],
                message: "No notes found to analyze"
            });
        }

        // Filter out protected notes and combine content
        const unprotectedNotes = notes.filter(n => !n.is_protected);

        if (unprotectedNotes.length === 0) {
            return res.status(200).json({
                tasks: [],
                message: "All notes are protected - cannot analyze"
            });
        }

        // Build content for analysis
        let notesContext = "";
        unprotectedNotes.forEach((note, idx) => {
            const cleanContent = note.content_html
                ? note.content_html.replace(/<[^>]*>/g, ' ').trim().substring(0, 1000)
                : "";
            if (cleanContent.length > 10) {
                notesContext += `\nNote "${note.note_name}":\n${cleanContent}\n`;
            }
        });

        if (notesContext.length < 50) {
            return res.status(200).json({
                tasks: [],
                message: "Notes don't contain enough content to extract tasks"
            });
        }

        // Call Gemini to identify tasks
        const model = genAI.getGenerativeModel({
            model: process.env.GEMINI_MODEL || "gemini-1.5-flash"
        });

        const prompt = `Analyze these notes and identify any actionable tasks, to-dos, or action items that should be tracked.

Notes:
${notesContext}

Return ONLY a valid JSON object with the tasks found.
Format:
{
  "found": true,
  "tasks": [
    {"text": "Task description", "source": "Note name where this was found"},
    {"text": "Another task", "source": "Another note"}
  ]
}

If no actionable tasks are found, return:
{
  "found": false,
  "message": "No actionable tasks found in the notes"
}

Rules:
- Look for action items, deadlines, things to do, reminders
- Task text should be clear and actionable
- Maximum 10 tasks
- Be selective - only include genuine tasks, not general information`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Parse JSON from response
        let taskData;
        try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                taskData = JSON.parse(jsonMatch[0]);
            }
        } catch (parseErr) {
            logger.warn({ parseErr }, "Failed to parse task extraction response");
            return res.status(500).json({ error: "Failed to parse AI response" });
        }

        if (!taskData) {
            return res.status(200).json({
                tasks: [],
                message: "Could not analyze notes for tasks"
            });
        }

        if (!taskData.found || !taskData.tasks || taskData.tasks.length === 0) {
            return res.status(200).json({
                tasks: [],
                message: taskData.message || "No actionable tasks found in your notes"
            });
        }

        logger.info({ userId, taskCount: taskData.tasks.length }, "Extracted potential tasks from notes");
        res.status(200).json({
            tasks: taskData.tasks,
            message: `Found ${taskData.tasks.length} potential task(s)`
        });

    } catch (err) {
        logger.error({ err, userId }, "Error extracting tasks from notes");
        res.status(500).json({ error: "Failed to analyze notes for tasks" });
    }
};

/**
 * Create multiple tasks at once
 */
const createTasks = async (req, res) => {
    const userId = req.user.userId;
    const { tasks } = req.body;

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
        return res.status(400).json({ error: "No tasks provided" });
    }

    try {
        const tasksModel = require("../models/tasksModel");
        const createdTasks = [];

        for (const task of tasks) {
            if (task.text && task.text.trim()) {
                const newTask = await tasksModel.createTask(userId, task.text.trim());
                createdTasks.push(newTask);
            }
        }

        logger.info({ userId, count: createdTasks.length }, "Created tasks from extraction");
        res.status(200).json({
            message: `Created ${createdTasks.length} task(s)`,
            tasks: createdTasks
        });

    } catch (err) {
        logger.error({ err, userId }, "Error creating extracted tasks");
        res.status(500).json({ error: "Failed to create tasks" });
    }
};

/**
 * Summarize note content
 * Returns a concise summary of the note
 */
const summarizeNote = async (req, res) => {
    const { noteId } = req.params;
    const userId = req.user.userId;

    try {
        // Get note content
        const note = await notesModel.LoadHTMLByNoteID(noteId, userId);
        if (!note) {
            return res.status(404).json({ error: "Note not found" });
        }

        if (note.is_protected) {
            return res.status(400).json({ error: "Cannot summarize protected notes" });
        }

        // Strip HTML for analysis
        const cleanContent = note.content_html
            ? note.content_html.replace(/<[^>]*>/g, ' ').trim()
            : "";

        if (!cleanContent || cleanContent.length < 50) {
            return res.status(400).json({ error: "Note content is too short to summarize" });
        }

        // Call Gemini to generate summary
        const model = genAI.getGenerativeModel({
            model: process.env.GEMINI_MODEL || "gemini-1.5-flash"
        });

        const prompt = `Summarize the following note content into a concise, well-organized summary. Preserve the key points and important information.

Content:
${cleanContent}

Return ONLY valid HTML formatted content with proper tags (<p>, <ul>, <li>, <strong>, etc.).
The summary should be:
- Concise but comprehensive
- Well-structured with headings if appropriate
- Preserve important facts, numbers, and action items
- Use bullet points for lists of items
- Typically 30-50% of the original length

Do NOT include any JSON wrapping or explanatory text, just return the HTML content directly.`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Clean up the response (remove markdown code blocks if present)
        let summaryHTML = responseText.trim();
        summaryHTML = summaryHTML.replace(/^```html\n?/i, '').replace(/\n?```$/, '');
        summaryHTML = summaryHTML.trim();

        // Ensure we have some content
        if (!summaryHTML || summaryHTML.length < 10) {
            return res.status(500).json({ error: "Failed to generate summary" });
        }

        logger.info({ userId, noteId, originalLength: cleanContent.length, summaryLength: summaryHTML.length }, "Generated note summary");
        res.status(200).json({ summary: summaryHTML });

    } catch (err) {
        logger.error({ err, userId, noteId }, "Error summarizing note");
        res.status(500).json({ error: "Failed to summarize note" });
    }
};

/**
 * Fix typo and grammar errors in note content
 * Returns corrected content
 */
const fixTypoGrammar = async (req, res) => {
    const { noteId } = req.params;
    const userId = req.user.userId;

    try {
        // Get note content
        const note = await notesModel.LoadHTMLByNoteID(noteId, userId);
        if (!note) {
            return res.status(404).json({ error: "Note not found" });
        }

        if (note.is_protected) {
            return res.status(400).json({ error: "Cannot fix protected notes" });
        }

        // Strip HTML for analysis
        const cleanContent = note.content_html
            ? note.content_html.replace(/<[^>]*>/g, ' ').trim()
            : "";

        if (!cleanContent || cleanContent.length < 5) {
            return res.status(400).json({ error: "Note content is too short to fix" });
        }

        // Call Gemini to fix typos and grammar
        const model = genAI.getGenerativeModel({
            model: process.env.GEMINI_MODEL || "gemini-1.5-flash"
        });

        const prompt = `Fix all spelling errors, typos, and grammar mistakes in the following text. Preserve the original meaning, tone, and formatting structure.

Content:
${cleanContent}

Return ONLY valid HTML formatted content with proper tags (<p>, <ul>, <li>, <strong>, etc.).
Rules:
- Fix spelling errors and typos
- Correct grammar mistakes
- Improve punctuation where needed
- Preserve the original meaning and tone
- Keep the same structure and organization
- Do NOT rephrase or summarize - only fix errors
- Maintain all facts, numbers, and important details exactly as they are

Do NOT include any JSON wrapping or explanatory text, just return the corrected HTML content directly.`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Clean up the response (remove markdown code blocks if present)
        let correctedHTML = responseText.trim();
        correctedHTML = correctedHTML.replace(/^```html\n?/i, '').replace(/\n?```$/, '');
        correctedHTML = correctedHTML.trim();

        // Ensure we have some content
        if (!correctedHTML || correctedHTML.length < 5) {
            return res.status(500).json({ error: "Failed to fix content" });
        }

        logger.info({ userId, noteId }, "Fixed typo and grammar in note");
        res.status(200).json({ correctedContent: correctedHTML });

    } catch (err) {
        logger.error({ err, userId, noteId }, "Error fixing typo/grammar");
        res.status(500).json({ error: "Failed to fix typo and grammar" });
    }
};

module.exports = {
    getHighlightSuggestions,
    divideNote,
    extractTasks,
    createTasks,
    summarizeNote,
    fixTypoGrammar,
};

