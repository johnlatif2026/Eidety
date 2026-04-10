const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const path = require('path');
const admin = require('firebase-admin');

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// ENV
const {
  ADMIN_USER,
  ADMIN_PASS,
  JWT_SECRET,
  TELEGRAM_TOKEN,
  TELEGRAM_CHAT_ID,
  FIREBASE_KEY
} = process.env;

// Firebase init
const serviceAccount = JSON.parse(FIREBASE_KEY);
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/* =========================
   GLOBAL SITE STATUS
========================= */

async function getSiteStatus() {
  const doc = await db.collection('settings').doc('global').get();
  if (!doc.exists) return true; // default open
  return doc.data().open;
}

/* =========================
   AUTH
========================= */

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

/* =========================
   SITE STATUS API (PUBLIC)
========================= */

app.get('/api/site-status', async (req, res) => {
  try {
    const open = await getSiteStatus();
    res.json({ open });
  } catch (e) {
    res.json({ open: true });
  }
});

/* =========================
   TOGGLE SITE (ADMIN ONLY)
========================= */

app.post('/api/site-toggle', authenticateToken, async (req, res) => {
  try {
    const docRef = db.collection('settings').doc('global');
    const doc = await docRef.get();

    const current = doc.exists ? doc.data().open : true;
    const newState = !current;

    await docRef.set({ open: newState }, { merge: true });

    res.json({ success: true, open: newState });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

/* =========================
   SEND GIFT (BLOCK WHEN CLOSED)
========================= */

app.post('/send-to-telegram', async (req, res) => {
  try {
    const open = await getSiteStatus();

    // 🔴 BLOCK IF CLOSED
    if (!open) {
      return res.status(403).json({
        success: false,
        message: 'Site is closed'
      });
    }

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
🕒 ${data.timestamp}
🌍 ${data.ip}
`;

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message
    });

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* =========================
   LOGIN
========================= */

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '2h' });
    return res.json({ success: true, token });
  }

  res.status(401).json({ success: false });
});

/* =========================
   DASHBOARD DATA
========================= */

app.get('/dashboard/data', authenticateToken, async (req, res) => {
  const snapshot = await db.collection('gifts').orderBy('savedAt', 'desc').get();

  const data = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  res.json(data);
});

app.delete('/dashboard/data/:id', authenticateToken, async (req, res) => {
  await db.collection('gifts').doc(req.params.id).delete();
  res.json({ success: true });
});

/* =========================
   PAGES
========================= */

app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'index.html'))
);

app.get('/login', (req, res) =>
  res.sendFile(path.join(__dirname, 'login.html'))
);

app.get('/dashboard', (req, res) =>
  res.sendFile(path.join(__dirname, 'dashboard.html'))
);

/* =========================
   VERCEL EXPORT
========================= */

module.exports = app;
