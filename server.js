require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const path = require('path');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const {
  ADMIN_USER,
  ADMIN_PASS,
  JWT_SECRET,
  TELEGRAM_TOKEN,
  TELEGRAM_CHAT_ID,
  FIREBASE_KEY
} = process.env;

// Firebase
const serviceAccount = JSON.parse(FIREBASE_KEY.replace(/\\n/g, '\n'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// 🔥 SITE STATUS (global control)
const siteRef = db.collection('config').doc('site');

// افتراضيًا الموقع مفتوح
async function getSiteStatus() {
  const doc = await siteRef.get();
  if (!doc.exists) {
    await siteRef.set({ open: true });
    return true;
  }
  return doc.data().open;
}

// Middleware حماية الداشبورد
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Forbidden' });
    req.user = user;
    next();
  });
}

// 🔥 SITE STATUS API
app.get('/api/site-status', async (req, res) => {
  const open = await getSiteStatus();
  res.json({ open });
});

// 🔥 TOGGLE OPEN/CLOSE (Dashboard only)
app.post('/api/site-toggle', authenticateToken, async (req, res) => {
  const doc = await siteRef.get();
  const current = doc.exists ? doc.data().open : true;

  await siteRef.set({ open: !current });

  res.json({ success: true, open: !current });
});

// Save + Telegram
app.post('/send-to-telegram', async (req, res) => {
  try {
    const data = req.body;

    await db.collection('gifts').add({
      ...data,
      savedAt: new Date().toISOString()
    });

    const message = `
🎁 New Gift
👤 ${data.username}
🎁 ${data.gift}
🔢 ${data.boxNumber}
`;

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message
    });

    res.json({ success: true });

  } catch (e) {
    res.status(500).json({ success: false });
  }
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '2h' });
    return res.json({ success: true, token });
  }

  res.status(401).json({ success: false });
});

// Dashboard data
app.get('/dashboard/data', authenticateToken, async (req, res) => {
  const snapshot = await db.collection('gifts').orderBy('savedAt', 'desc').get();

  const data = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  res.json(data);
});

// Delete
app.delete('/dashboard/data/:id', authenticateToken, async (req, res) => {
  await db.collection('gifts').doc(req.params.id).delete();
  res.json({ success: true });
});

// Pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));

app.listen(PORT, () => console.log(`Server running ${PORT}`));
