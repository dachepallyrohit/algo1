const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Create folder
router.post('/', authenticateToken, (req, res) => {
  try {
    const { name, parent_id } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    // Validate parent folder if provided
    if (parent_id) {
      const parent = db.prepare('SELECT * FROM folders WHERE id = ? AND owner_id = ?').get(parent_id, req.user.id);
      if (!parent) {
        return res.status(404).json({ error: 'Parent folder not found' });
      }
    }

    const id = uuidv4();
    db.prepare(
      'INSERT INTO folders (id, name, parent_id, owner_id) VALUES (?, ?, ?, ?)'
    ).run(id, name, parent_id || null, req.user.id);

    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(id);
    res.status(201).json({ folder });
  } catch (err) {
    console.error('Create folder error:', err);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// List folders
router.get('/', authenticateToken, (req, res) => {
  try {
    const { parent_id } = req.query;

    let folders;
    if (parent_id) {
      folders = db.prepare(
        'SELECT * FROM folders WHERE owner_id = ? AND parent_id = ? ORDER BY name ASC'
      ).all(req.user.id, parent_id);
    } else {
      folders = db.prepare(
        'SELECT * FROM folders WHERE owner_id = ? AND parent_id IS NULL ORDER BY name ASC'
      ).all(req.user.id);
    }

    // Get document count for each folder
    const docCountStmt = db.prepare('SELECT COUNT(*) as count FROM documents WHERE folder_id = ? AND is_trashed = 0');
    const subFolderCountStmt = db.prepare('SELECT COUNT(*) as count FROM folders WHERE parent_id = ?');

    folders.forEach(folder => {
      folder.document_count = docCountStmt.get(folder.id).count;
      folder.subfolder_count = subFolderCountStmt.get(folder.id).count;
    });

    res.json({ folders });
  } catch (err) {
    console.error('List folders error:', err);
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

// Get folder breadcrumbs
router.get('/:id/breadcrumbs', authenticateToken, (req, res) => {
  try {
    const breadcrumbs = [];
    let currentId = req.params.id;

    while (currentId) {
      const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND owner_id = ?').get(currentId, req.user.id);
      if (!folder) break;
      breadcrumbs.unshift(folder);
      currentId = folder.parent_id;
    }

    res.json({ breadcrumbs });
  } catch (err) {
    console.error('Breadcrumbs error:', err);
    res.status(500).json({ error: 'Failed to get breadcrumbs' });
  }
});

// Rename folder
router.patch('/:id', authenticateToken, (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    db.prepare('UPDATE folders SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, req.params.id);

    const updated = db.prepare('SELECT * FROM folders WHERE id = ?').get(req.params.id);
    res.json({ folder: updated });
  } catch (err) {
    console.error('Rename folder error:', err);
    res.status(500).json({ error: 'Failed to rename folder' });
  }
});

// Delete folder
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // Move all documents in folder to root
    db.prepare('UPDATE documents SET folder_id = NULL WHERE folder_id = ?').run(req.params.id);

    // Delete folder (cascade will handle sub-folders)
    db.prepare('DELETE FROM folders WHERE id = ?').run(req.params.id);

    res.json({ message: 'Folder deleted' });
  } catch (err) {
    console.error('Delete folder error:', err);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

module.exports = router;
