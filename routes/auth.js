const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, full_name } = req.body;

    if (!username || !email || !password || !full_name) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check existing user
    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existing) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const id = uuidv4();
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6'];
    const avatar_color = colors[Math.floor(Math.random() * colors.length)];

    db.prepare(
      'INSERT INTO users (id, username, email, password, full_name, avatar_color) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, username, email, hashedPassword, full_name, avatar_color);

    // Create default folder
    const rootFolderId = uuidv4();
    db.prepare(
      'INSERT INTO folders (id, name, parent_id, owner_id) VALUES (?, ?, NULL, ?)'
    ).run(rootFolderId, 'My Documents', id);

    const user = { id, username, email, full_name, avatar_color };
    const token = generateToken(user);

    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({ error: 'Login and password are required' });
    }

    const user = db.prepare(
      'SELECT * FROM users WHERE username = ? OR email = ?'
    ).get(login, login);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);
    const { password: _, ...userData } = user;

    res.json({ user: userData, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
router.get('/me', authenticateToken, (req, res) => {
  const user = db.prepare(
    'SELECT id, username, email, full_name, avatar_color, created_at FROM users WHERE id = ?'
  ).get(req.user.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ user });
});

// Search / list users (for granting access & sharing)
router.get('/search', authenticateToken, (req, res) => {
  try {
    const { q } = req.query;
    let users;
    if (!q || q.trim().length === 0) {
      users = db.prepare(
        `SELECT id, username, email, full_name, avatar_color FROM users 
         WHERE id != ? 
         ORDER BY created_at DESC 
         LIMIT 15`
      ).all(req.user.id);
    } else {
      users = db.prepare(
        `SELECT id, username, email, full_name, avatar_color FROM users 
         WHERE (username LIKE ? OR email LIKE ? OR full_name LIKE ?) AND id != ?
         LIMIT 15`
      ).all(`%${q}%`, `%${q}%`, `%${q}%`, req.user.id);
    }

    res.json({ users });
  } catch (err) {
    console.error('User search error:', err);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

module.exports = router;
