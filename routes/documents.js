const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const cloudStorage = require('../services/cloudStorage');

const router = express.Router();

// Configure multer temporary upload staging
const tempUploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads', '.tmp');
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `tmp-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    cb(null, true); // Accept all file types
  }
});

// Utility: MIME resolver
function resolveMimeType(originalName, mimeType) {
  const ext = path.extname(originalName || '').toLowerCase();
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.py': 'text/x-python',
    '.zip': 'application/zip'
  };
  if (map[ext]) return map[ext];
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType;
  return 'application/octet-stream';
}

// Utility: log activity
function logActivity(userId, action, targetType, targetId, targetName, details = null) {
  db.prepare(
    'INSERT INTO activity_log (id, user_id, action, target_type, target_id, target_name, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(uuidv4(), userId, action, targetType, targetId, targetName, details);
}

// Upload document(s)
router.post('/upload', authenticateToken, upload.array('files', 20), async (req, res) => {
  try {
    const folderId = req.body.folder_id || null;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    // Validate folder ownership if folder_id provided
    if (folderId) {
      const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND owner_id = ?').get(folderId, req.user.id);
      if (!folder) {
        return res.status(404).json({ error: 'Folder not found' });
      }
    }

    const savedDocs = [];

    // Save files through Cloud Storage manager (S3 / GCS / Local Vault)
    for (const file of req.files) {
      const id = uuidv4();
      const effectiveMime = resolveMimeType(file.originalname, file.mimetype);
      const storageResult = await cloudStorage.saveFile({
        userId: req.user.id,
        originalName: file.originalname,
        tempPath: file.path,
        mimeType: effectiveMime,
        size: file.size,
        fileId: id
      });

      // Remove temp staged file if distinct
      if (fs.existsSync(file.path) && file.path.includes('.tmp')) {
        try { fs.unlinkSync(file.path); } catch (e) {}
      }

      savedDocs.push({
        id,
        name: file.originalname,
        original_name: file.originalname,
        mime_type: effectiveMime,
        size: file.size,
        storage_path: storageResult.storagePath,
        folder_id: folderId,
        owner_id: req.user.id,
        cloud_url: storageResult.cloudUrl
      });
    }

    const insertStmt = db.prepare(
      `INSERT INTO documents (id, name, original_name, mime_type, size, storage_path, folder_id, owner_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const insertMany = db.transaction((docs) => {
      for (const doc of docs) {
        insertStmt.run(doc.id, doc.name, doc.original_name, doc.mime_type, doc.size, doc.storage_path, doc.folder_id, doc.owner_id);
        logActivity(req.user.id, 'upload', 'document', doc.id, doc.name, `Uploaded to ${cloudStorage.getProviderInfo().mode}`);
      }
    });

    insertMany(savedDocs);

    res.status(201).json({ documents: savedDocs });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// List documents
router.get('/', authenticateToken, (req, res) => {
  try {
    const { folder_id, starred, trashed, search } = req.query;
    let query = '';
    let params = [];

    if (search) {
      query = `SELECT d.*, u.full_name as owner_name FROM documents d
               JOIN users u ON d.owner_id = u.id
               WHERE d.owner_id = ? AND d.is_trashed = 0 AND d.name LIKE ?
               ORDER BY d.updated_at DESC`;
      params = [req.user.id, `%${search}%`];
    } else if (trashed === '1') {
      query = `SELECT d.*, u.full_name as owner_name FROM documents d
               JOIN users u ON d.owner_id = u.id
               WHERE d.owner_id = ? AND d.is_trashed = 1
               ORDER BY d.updated_at DESC`;
      params = [req.user.id];
    } else if (starred === '1') {
      query = `SELECT d.*, u.full_name as owner_name FROM documents d
               JOIN users u ON d.owner_id = u.id
               WHERE d.owner_id = ? AND d.is_starred = 1 AND d.is_trashed = 0
               ORDER BY d.updated_at DESC`;
      params = [req.user.id];
    } else {
      const folderCondition = folder_id ? 'd.folder_id = ?' : 'd.folder_id IS NULL';
      query = `SELECT d.*, u.full_name as owner_name FROM documents d
               JOIN users u ON d.owner_id = u.id
               WHERE d.owner_id = ? AND ${folderCondition} AND d.is_trashed = 0
               ORDER BY d.updated_at DESC`;
      params = folder_id ? [req.user.id, folder_id] : [req.user.id];
    }

    const documents = db.prepare(query).all(...params);

    // Get share count for each document
    const shareCountStmt = db.prepare('SELECT COUNT(*) as count FROM shares WHERE document_id = ?');
    documents.forEach(doc => {
      doc.share_count = shareCountStmt.get(doc.id).count;
    });

    res.json({ documents });
  } catch (err) {
    console.error('List documents error:', err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Get shared-with-me documents
router.get('/shared', authenticateToken, (req, res) => {
  try {
    const documents = db.prepare(`
      SELECT d.*, u.full_name as owner_name, s.permission, s.created_at as shared_at
      FROM shares s
      JOIN documents d ON s.document_id = d.id
      JOIN users u ON d.owner_id = u.id
      WHERE s.shared_with_id = ? AND d.is_trashed = 0
      ORDER BY s.created_at DESC
    `).all(req.user.id);

    res.json({ documents });
  } catch (err) {
    console.error('Shared documents error:', err);
    res.status(500).json({ error: 'Failed to fetch shared documents' });
  }
});

// Get documents shared by me
router.get('/shared-by-me', authenticateToken, (req, res) => {
  try {
    const documents = db.prepare(`
      SELECT DISTINCT d.*, u.full_name as owner_name,
             (SELECT COUNT(*) FROM shares WHERE document_id = d.id) as share_count
      FROM documents d
      JOIN shares s ON d.id = s.document_id
      JOIN users u ON d.owner_id = u.id
      WHERE d.owner_id = ? AND d.is_trashed = 0
      ORDER BY d.updated_at DESC
    `).all(req.user.id);

    res.json({ documents });
  } catch (err) {
    console.error('Shared-by-me error:', err);
    res.status(500).json({ error: 'Failed to fetch shared documents' });
  }
});

// Helper: check access permissions
function checkDocumentAccess(docId, userId) {
  const doc = db.prepare(`
    SELECT d.*, u.full_name as owner_name 
    FROM documents d JOIN users u ON d.owner_id = u.id 
    WHERE d.id = ?
  `).get(docId);

  if (!doc) return { error: 'Document not found', status: 404 };

  if (doc.owner_id === userId) {
    return { doc, permission: 'owner' };
  }

  const share = db.prepare(
    'SELECT * FROM shares WHERE document_id = ? AND (shared_with_id = ? OR is_public = 1)'
  ).get(doc.id, userId);

  if (!share) {
    return { error: 'Access denied', status: 403 };
  }

  return { doc, permission: share.permission, share };
}

// Get single document
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const access = checkDocumentAccess(req.params.id, req.user.id);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const doc = access.doc;
    doc.permission = access.permission;

    // Get shares for this document
    const shares = db.prepare(`
      SELECT s.*, u.full_name as shared_with_name, u.email as shared_with_email_user, u.avatar_color
      FROM shares s
      LEFT JOIN users u ON s.shared_with_id = u.id
      WHERE s.document_id = ?
    `).all(doc.id);

    doc.shares = shares;

    res.json({ document: doc });
  } catch (err) {
    console.error('Get document error:', err);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// Inline preview stream (for images, audio, video, PDF)
router.get('/:id/preview', authenticateToken, (req, res) => {
  try {
    const access = checkDocumentAccess(req.params.id, req.user.id);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const doc = access.doc;
    const filePath = cloudStorage.getAbsolutePath(doc.storage_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on storage' });
    }

    const effectiveMime = resolveMimeType(doc.original_name, doc.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.original_name)}"`);
    res.setHeader('Content-Type', effectiveMime);
    res.sendFile(filePath);
  } catch (err) {
    console.error('Preview error:', err);
    res.status(500).json({ error: 'Preview failed' });
  }
});

// Download document
router.get('/:id/download', authenticateToken, (req, res) => {
  try {
    const access = checkDocumentAccess(req.params.id, req.user.id);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const doc = access.doc;
    const filePath = cloudStorage.getAbsolutePath(doc.storage_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on storage' });
    }

    // Log download activity
    logActivity(req.user.id, 'download', 'document', doc.id, doc.name);

    const effectiveMime = resolveMimeType(doc.original_name, doc.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.original_name)}"`);
    res.setHeader('Content-Type', effectiveMime);
    res.sendFile(filePath);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Text & Code content preview
router.get('/:id/content', authenticateToken, (req, res) => {
  try {
    const access = checkDocumentAccess(req.params.id, req.user.id);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const doc = access.doc;
    const filePath = cloudStorage.getAbsolutePath(doc.storage_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on storage' });
    }

    if (doc.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'File exceeds 5MB size limit for text viewer' });
    }

    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ content, mime_type: doc.mime_type, name: doc.name });
  } catch (err) {
    console.error('Content error:', err);
    res.status(500).json({ error: 'Failed to read content' });
  }
});

// Update document (rename, move, star, trash)
router.patch('/:id', authenticateToken, (req, res) => {
  try {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found or access denied' });
    }

    const { name, folder_id, is_starred, is_trashed } = req.body;
    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (folder_id !== undefined) { updates.push('folder_id = ?'); values.push(folder_id || null); }
    if (is_starred !== undefined) { updates.push('is_starred = ?'); values.push(is_starred ? 1 : 0); }
    if (is_trashed !== undefined) { updates.push('is_trashed = ?'); values.push(is_trashed ? 1 : 0); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id, req.user.id);

    db.prepare(`UPDATE documents SET ${updates.join(', ')} WHERE id = ? AND owner_id = ?`).run(...values);

    const action = is_trashed !== undefined ? (is_trashed ? 'trash' : 'restore') :
                   is_starred !== undefined ? (is_starred ? 'star' : 'unstar') :
                   name !== undefined ? 'rename' : 'move';
    logActivity(req.user.id, action, 'document', doc.id, name || doc.name);

    const updated = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    res.json({ document: updated });
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// Delete document permanently
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found or access denied' });
    }

    // Delete file from cloud and local storage
    await cloudStorage.deleteFile(doc.storage_path);

    db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
    logActivity(req.user.id, 'delete', 'document', doc.id, doc.name);

    res.json({ message: 'Document deleted permanently' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
