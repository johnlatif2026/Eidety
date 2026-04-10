const express = require('express');
const cors = require('cors');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');

const app = express();

app.use(cors());
app.use(express.json());

// ENV
const {
  ADMIN_USER,
  ADMIN_PASS,
  JWT_SECRET,
  TELEGRAM_TOKEN,
  TELEGRAM_CHAT_ID,
  FIREBASE_KEY
} = process.env;

// 🔥 حماية من crash
if (!FIREBASE_KEY) {
  console.error("Missing FIREBASE_KEY");
}

// Firebase init (safe)
let db;

try {
  const serviceAccount = JSON.parse(FIREBASE_KEY?.replace(/\\n/g, '\n') || '{}');

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }

  db = admin.firestore();

} catch (err) {
  console.error("Firebase init error:", err.message);
}

// site status doc
const siteRef = () => db.collection('config').doc('site');

// middleware auth
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'no token' });

  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ error: 'invalid token' });
  }
}

/* =========================
   SITE STATUS
========================= */

app.get('/api/site-status', async (req, res) => {
  try {
    const doc = await siteRef().get();

    if (!doc.exists) {
      await siteRef().set({ open: true });
      return res.json({ open: true });
    }

    res.json({ open: doc.data().open });
  } catch (e) {
    console.error(e);
    res.json({ open: true });
  }
});

app.post('/api/site-toggle', auth, async (req, res) => {
  try {
    const doc = await siteRef().get();
    const current = doc.exists ? doc.data().open : true;

    await siteRef().set({ open: !current });

    res.json({ success: true, open: !current });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

/* =========================
   SAVE + TELEGRAM
========================= */

app.post('/send-to-telegram', async (req, res) => { try { const data = req.body; // حفظ في Firebase await saveToFirebase(data); // رسالة Telegram const message = 🎁 New Gift Selection 👤 Name: ${data.username} 🎁 Gift: ${data.gift} 🔢 Box: ${data.boxNumber} 🕒 Time: ${data.timestamp} 🌍 IP: ${data.ip} ; await axios.post(https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage, { chat_id: TELEGRAM_CHAT_ID, text: message}); res.json({ success: true }); } catch (err) { console.error("❌ Error:", err.message); res.status(500).json({ success: false }); } });

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

app.get('/dashboard/data', auth, async (req, res) => {
  try {
    const snap = await db.collection('gifts').orderBy('savedAt', 'desc').get();

    const data = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    res.json(data);
  } catch (e) {
    console.error(e);
    res.json([]);
  }
});

app.delete('/dashboard/data/:id', auth, async (req, res) => {
  try {
    await db.collection('gifts').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

/* =========================
   EXPORT FOR VERCEL
========================= */

module.exports = app;
