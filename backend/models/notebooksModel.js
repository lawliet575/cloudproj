const { sql, pool, poolConnect } = require("../db2");

// Get all notebooks for a user with note counts
const getAllNotebooks = async (userId) => {
  await poolConnect;
  const result = await pool.request()
    .input("userId", sql.Int, userId)
    .query(`
      SELECT 
        n.id,
        n.notebook_name,
        n.created_at,
        n.updated_at,
        COUNT(nt.id) as note_count
      FROM notebooks n
      LEFT JOIN notes nt ON nt.notebook_id = n.id
      WHERE n.user_id = @userId
      GROUP BY n.id, n.notebook_name, n.created_at, n.updated_at
      ORDER BY n.updated_at DESC
    `);
  return result.recordset;
};

// Create a new notebook
const createNotebook = async (userId, notebookName) => {
  await poolConnect;
  const result = await pool.request()
    .input("userId", sql.Int, userId)
    .input("notebookName", sql.NVarChar(255), notebookName || "New Notebook")
    .query(`
      INSERT INTO notebooks (user_id, notebook_name)
      OUTPUT inserted.*
      VALUES (@userId, @notebookName)
    `);
  return result.recordset[0];
};

// Update notebook name
const updateNotebookName = async (notebookId, userId, newName) => {
  await poolConnect;
  const result = await pool.request()
    .input("notebookId", sql.Int, notebookId)
    .input("userId", sql.Int, userId)
    .input("newName", sql.NVarChar(255), newName)
    .query(`
      UPDATE notebooks
      SET notebook_name = @newName, updated_at = SYSDATETIME()
      OUTPUT inserted.*
      WHERE id = @notebookId AND user_id = @userId
    `);
  return result.recordset[0];
};

// Delete a notebook
const deleteNotebook = async (notebookId, userId) => {
  await poolConnect;

  // First, get or create the Uncategorized notebook for this user
  let uncategorizedNotebook = await pool.request()
    .input("userId", sql.Int, userId)
    .query(`
      SELECT id FROM notebooks 
      WHERE user_id = @userId AND notebook_name = 'Uncategorized'
    `);

  let uncategorizedId;
  if (uncategorizedNotebook.recordset.length === 0) {
    // Create Uncategorized notebook if it doesn't exist
    const newNotebook = await pool.request()
      .input("userId", sql.Int, userId)
      .query(`
        INSERT INTO notebooks (user_id, notebook_name)
        OUTPUT inserted.id
        VALUES (@userId, 'Uncategorized')
      `);
    uncategorizedId = newNotebook.recordset[0].id;
  } else {
    uncategorizedId = uncategorizedNotebook.recordset[0].id;
  }

  // Move all notes from this notebook to Uncategorized
  await pool.request()
    .input("notebookId", sql.Int, notebookId)
    .input("userId", sql.Int, userId)
    .input("uncategorizedId", sql.Int, uncategorizedId)
    .query(`
      UPDATE notes
      SET notebook_id = @uncategorizedId
      WHERE notebook_id = @notebookId AND user_id = @userId
    `);

  // Now delete the notebook
  const result = await pool.request()
    .input("notebookId", sql.Int, notebookId)
    .input("userId", sql.Int, userId)
    .query(`
      DELETE FROM notebooks
      OUTPUT deleted.*
      WHERE id = @notebookId AND user_id = @userId
    `);

  return result.recordset[0];
};

// Get a specific notebook with its notes
const getNotebookWithNotes = async (notebookId, userId) => {
  await poolConnect;

  // Get notebook details
  const notebookResult = await pool.request()
    .input("notebookId", sql.Int, notebookId)
    .input("userId", sql.Int, userId)
    .query(`
      SELECT * FROM notebooks 
      WHERE id = @notebookId AND user_id = @userId
    `);

  if (notebookResult.recordset.length === 0) {
    return null;
  }

  const notebook = notebookResult.recordset[0];

  // Get all notes in this notebook
  const notesResult = await pool.request()
    .input("notebookId", sql.Int, notebookId)
    .input("userId", sql.Int, userId)
    .query(`
      SELECT id, note_name, content_html, updated_at, created_at, is_protected
      FROM notes
      WHERE notebook_id = @notebookId AND user_id = @userId
      ORDER BY updated_at DESC
    `);

  notebook.notes = notesResult.recordset;
  return notebook;
};

// Get notes count for a notebook
const getNotebookNoteCount = async (notebookId, userId) => {
  await poolConnect;
  const result = await pool.request()
    .input("notebookId", sql.Int, notebookId)
    .input("userId", sql.Int, userId)
    .query(`
      SELECT COUNT(*) as count
      FROM notes
      WHERE notebook_id = @notebookId AND user_id = @userId
    `);
  return result.recordset[0].count;
};

module.exports = {
  getAllNotebooks,
  createNotebook,
  updateNotebookName,
  deleteNotebook,
  getNotebookWithNotes,
  getNotebookNoteCount,
};
