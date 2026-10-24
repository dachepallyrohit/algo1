const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

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

const router = express.Router();

// Share a document
router.post('/', authenticateToken, (req, res) => {
  try {
    const { document_id, shared_with_email, permission = 'view', is_public = false } = req.body;

    if (!document_id) {
      return res.status(400).json({ error: 'Document ID is required' });
    }

    // Verify document ownership
    const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND owner_id = ?').get(document_id, req.user.id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found or access denied' });
    }

    // Validate permission
    if (!['view', 'edit', 'download'].includes(permission)) {
      return res.status(400).json({ error: 'Invalid permission. Must be view, edit, or download' });
    }

    const id = uuidv4();
    let shareLink = null;

    if (is_public) {
      shareLink = crypto.randomBytes(32).toString('hex');

      // Check if public share already exists
      const existingPublic = db.prepare(
        'SELECT * FROM shares WHERE document_id = ? AND is_public = 1'
      ).get(document_id);

      if (existingPublic) {
        return res.json({ share: existingPublic });
      }

      db.prepare(
        `INSERT INTO shares (id, document_id, owner_id, permission, share_link, is_public)
         VALUES (?, ?, ?, ?, ?, 1)`
      ).run(id, document_id, req.user.id, permission, shareLink);
    } else {
      const cleanInput = (shared_with_email || '').trim();
      if (!cleanInput) {
        return res.status(400).json({ error: 'Email or username is required for private sharing' });
      }

      const targetUser = db.prepare(
        'SELECT id, email, full_name FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)'
      ).get(cleanInput, cleanInput);

      if (!targetUser) {
        return res.status(404).json({ error: `User "${cleanInput}" not found. Please choose from suggested workspace users or enter their exact email/username.` });
      }

      if (targetUser.id === req.user.id) {
        return res.status(400).json({ error: 'Cannot share with yourself' });
      }

      // Check if already shared
      const existingShare = db.prepare(
        'SELECT * FROM shares WHERE document_id = ? AND shared_with_id = ?'
      ).get(document_id, targetUser.id);

      if (existingShare) {
        // Update permission
        db.prepare('UPDATE shares SET permission = ? WHERE id = ?').run(permission, existingShare.id);
        const updated = db.prepare(`
          SELECT s.*, u.full_name as shared_with_name, u.email as shared_with_email_user
          FROM shares s LEFT JOIN users u ON s.shared_with_id = u.id WHERE s.id = ?
        `).get(existingShare.id);
        return res.json({ share: updated });
      }

      db.prepare(
        `INSERT INTO shares (id, document_id, owner_id, shared_with_id, shared_with_email, permission)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, document_id, req.user.id, targetUser.id, shared_with_email, permission);
    }

    const share = db.prepare(`
      SELECT s.*, u.full_name as shared_with_name, u.email as shared_with_email_user
      FROM shares s LEFT JOIN users u ON s.shared_with_id = u.id WHERE s.id = ?
    `).get(id);

    res.status(201).json({ share });
  } catch (err) {
    console.error('Share error:', err);
    res.status(500).json({ error: 'Failed to share document' });
  }
});

// Get shares for a document
router.get('/document/:documentId', authenticateToken, (req, res) => {
  try {
    const shares = db.prepare(`
      SELECT s.*, u.full_name as shared_with_name, u.email as shared_with_email_user, u.avatar_color
      FROM shares s
      LEFT JOIN users u ON s.shared_with_id = u.id
      WHERE s.document_id = ? AND s.owner_id = ?
      ORDER BY s.created_at DESC
    `).all(req.params.documentId, req.user.id);

    res.json({ shares });
  } catch (err) {
    console.error('Get shares error:', err);
    res.status(500).json({ error: 'Failed to fetch shares' });
  }
});

// Access via share link metadata
router.get('/link/:shareLink', optionalAuth, (req, res) => {
  try {
    const share = db.prepare(`
      SELECT s.*, d.name, d.mime_type, d.size, d.original_name, d.storage_path,
             u.full_name as owner_name, u.avatar_color as owner_avatar
      FROM shares s
      JOIN documents d ON s.document_id = d.id
      JOIN users u ON s.owner_id = u.id
      WHERE s.share_link = ? AND s.is_public = 1
    `).get(req.params.shareLink);

    if (!share) {
      return res.status(404).json({ error: 'Share link not found or expired' });
    }

    // Check expiry
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Share link has expired' });
    }

    res.json({ share });
  } catch (err) {
    console.error('Share link error:', err);
    res.status(500).json({ error: 'Failed to access share link' });
  }
});

// Download via public share link
router.get('/link/:shareLink/download', (req, res) => {
  try {
    const share = db.prepare(`
      SELECT s.*, d.name, d.mime_type, d.size, d.original_name, d.storage_path, d.id as doc_id
      FROM shares s
      JOIN documents d ON s.document_id = d.id
      WHERE s.share_link = ? AND s.is_public = 1
    `).get(req.params.shareLink);

    if (!share) {
      return res.status(404).json({ error: 'Share link not found or expired' });
    }

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Share link has expired' });
    }

    const cloudStorage = require('../services/cloudStorage');
    const filePath = cloudStorage.getAbsolutePath(share.storage_path);
    if (!require('fs').existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on cloud storage' });
    }

    // Log public download activity
    db.prepare(
      'INSERT INTO activity_log (id, user_id, action, target_type, target_id, target_name, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), share.owner_id, 'public_download', 'document', share.doc_id, share.name, 'Downloaded via public link');

    const effectiveMime = resolveMimeType(share.original_name || share.name, share.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(share.original_name || share.name)}"`);
    res.setHeader('Content-Type', effectiveMime);
    res.sendFile(filePath);
  } catch (err) {
    console.error('Share download error:', err);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Inline preview via public share link
router.get('/link/:shareLink/preview', (req, res) => {
  try {
    const share = db.prepare(`
      SELECT s.*, d.name, d.mime_type, d.size, d.original_name, d.storage_path
      FROM shares s
      JOIN documents d ON s.document_id = d.id
      WHERE s.share_link = ? AND s.is_public = 1
    `).get(req.params.shareLink);

    if (!share) {
      return res.status(404).json({ error: 'Share link not found or expired' });
    }

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Share link has expired' });
    }

    const cloudStorage = require('../services/cloudStorage');
    const filePath = cloudStorage.getAbsolutePath(share.storage_path);
    if (!require('fs').existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on cloud storage' });
    }

    const effectiveMime = resolveMimeType(share.original_name || share.name, share.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(share.original_name || share.name)}"`);
    res.setHeader('Content-Type', effectiveMime);
    res.sendFile(filePath);
  } catch (err) {
    console.error('Share preview error:', err);
    res.status(500).json({ error: 'Preview failed' });
  }
});

// Text content preview via public share link
router.get('/link/:shareLink/content', (req, res) => {
  try {
    const share = db.prepare(`
      SELECT s.*, d.name, d.mime_type, d.size, d.original_name, d.storage_path
      FROM shares s
      JOIN documents d ON s.document_id = d.id
      WHERE s.share_link = ? AND s.is_public = 1
    `).get(req.params.shareLink);

    if (!share) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    const cloudStorage = require('../services/cloudStorage');
    const filePath = cloudStorage.getAbsolutePath(share.storage_path);
    const fs = require('fs');
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on cloud storage' });
    }

    if (share.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large for inline text preview' });
    }

    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ content, mime_type: share.mime_type, name: share.name });
  } catch (err) {
    console.error('Share content error:', err);
    res.status(500).json({ error: 'Failed to read content' });
  }
});

// Update share permission
router.patch('/:id', authenticateToken, (req, res) => {
  try {
    const { permission } = req.body;

    if (!['view', 'edit', 'download'].includes(permission)) {
      return res.status(400).json({ error: 'Invalid permission' });
    }

    const share = db.prepare('SELECT * FROM shares WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }

    db.prepare('UPDATE shares SET permission = ? WHERE id = ?').run(permission, req.params.id);

    const updated = db.prepare(`
      SELECT s.*, u.full_name as shared_with_name, u.email as shared_with_email_user
      FROM shares s LEFT JOIN users u ON s.shared_with_id = u.id WHERE s.id = ?
    `).get(req.params.id);

    res.json({ share: updated });
  } catch (err) {
    console.error('Update share error:', err);
    res.status(500).json({ error: 'Failed to update share' });
  }
});

// Revoke share
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const share = db.prepare('SELECT * FROM shares WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }

    db.prepare('DELETE FROM shares WHERE id = ?').run(req.params.id);
    res.json({ message: 'Share revoked' });
  } catch (err) {
    console.error('Revoke share error:', err);
    res.status(500).json({ error: 'Failed to revoke share' });
  }
});

module.exports = router;
