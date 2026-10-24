const express = require('express');
const { db } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get activity log
router.get('/', authenticateToken, (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const activities = db.prepare(`
      SELECT a.*, u.full_name, u.avatar_color
      FROM activity_log a
      JOIN users u ON a.user_id = u.id
      WHERE a.user_id = ?
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(req.user.id, parseInt(limit));

    res.json({ activities });
  } catch (err) {
    console.error('Activity error:', err);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// Get storage stats
router.get('/stats', authenticateToken, (req, res) => {
  try {
    const totalDocs = db.prepare('SELECT COUNT(*) as count FROM documents WHERE owner_id = ? AND is_trashed = 0').get(req.user.id);
    const totalSize = db.prepare('SELECT COALESCE(SUM(size), 0) as total FROM documents WHERE owner_id = ? AND is_trashed = 0').get(req.user.id);
    const totalFolders = db.prepare('SELECT COUNT(*) as count FROM folders WHERE owner_id = ?').get(req.user.id);
    const totalShared = db.prepare('SELECT COUNT(*) as count FROM shares WHERE owner_id = ?').get(req.user.id);
    const sharedWithMe = db.prepare('SELECT COUNT(*) as count FROM shares WHERE shared_with_id = ?').get(req.user.id);
    const trashedDocs = db.prepare('SELECT COUNT(*) as count FROM documents WHERE owner_id = ? AND is_trashed = 1').get(req.user.id);
    const starredDocs = db.prepare('SELECT COUNT(*) as count FROM documents WHERE owner_id = ? AND is_starred = 1 AND is_trashed = 0').get(req.user.id);

    // File type breakdown
    const typeBreakdown = db.prepare(`
      SELECT 
        CASE
          WHEN mime_type LIKE 'image/%' THEN 'Images'
          WHEN mime_type LIKE 'video/%' THEN 'Videos'
          WHEN mime_type LIKE 'audio/%' THEN 'Audio'
          WHEN mime_type LIKE '%pdf%' THEN 'PDFs'
          WHEN mime_type LIKE '%document%' OR mime_type LIKE '%msword%' THEN 'Documents'
          WHEN mime_type LIKE '%spreadsheet%' OR mime_type LIKE '%excel%' THEN 'Spreadsheets'
          WHEN mime_type LIKE '%presentation%' OR mime_type LIKE '%powerpoint%' THEN 'Presentations'
          WHEN mime_type LIKE 'text/%' THEN 'Text Files'
          ELSE 'Other'
        END as category,
        COUNT(*) as count,
        COALESCE(SUM(size), 0) as total_size
      FROM documents
      WHERE owner_id = ? AND is_trashed = 0
      GROUP BY category
      ORDER BY total_size DESC
    `).all(req.user.id);

    res.json({
      stats: {
        total_documents: totalDocs.count,
        total_size: totalSize.total,
        total_folders: totalFolders.count,
        total_shared: totalShared.count,
        shared_with_me: sharedWithMe.count,
        trashed: trashedDocs.count,
        starred: starredDocs.count,
        storage_limit: 5 * 1024 * 1024 * 1024, // 5GB
        type_breakdown: typeBreakdown
      }
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get active cloud storage provider configuration
router.get('/storage-config', authenticateToken, (req, res) => {
  try {
    const cloudStorage = require('../services/cloudStorage');
    const info = cloudStorage.getProviderInfo();
    res.json({ storage: info });
  } catch (err) {
    console.error('Storage config error:', err);
    res.status(500).json({ error: 'Failed to fetch storage config' });
  }
});

module.exports = router;
