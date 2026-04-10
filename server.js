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
let serviceAccount;

try {
    serviceAccount = JSON.parse(FIREBASE_KEY);
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
} catch (err) {
    console.error("Firebase Error:", err.message);
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

console.log("Firebase Connected");

// Middleware
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

// Save
async function saveToFirebase(data) {
    await db.collection('gifts').add({
        ...data,
        savedAt: new Date().toISOString()
    });
}

// Telegram + Save
app.post('/send-to-telegram', async (req, res) => {
    try {
        const data = req.body;

        // حفظ في Firebase
        await saveToFirebase(data);

        // رسالة Telegram
        const message = `
🎁 تشكيلة هدايا جديدة
👤 الاسم: ${data.username}
🎁 الهدية: ${data.gift}
🔢 الصندوق: ${data.boxNumber}
🕒 الوقت: ${data.timestamp}
🌍 IP: ${data.ip}
`;

        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    chat_id: TELEGRAM_CHAT_ID,
    text: message
});

        res.json({ success: true });

    } catch (err) {
        console.error("❌ Error:", err.message);
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

// GET DATA (🔥 مهم: رجعنا الـ ID)
app.get('/dashboard/data', authenticateToken, async (req, res) => {
    try {
        const snapshot = await db
            .collection('gifts')
            .orderBy('savedAt', 'desc')
            .get();

        const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.json(data);

    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

// DELETE (🔥 شغال 100%)
app.delete('/dashboard/data/:id', authenticateToken, async (req, res) => {
    try {
        const id = req.params.id;

        console.log("Deleting ID:", id);

        const docRef = db.collection('gifts').doc(id);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).send('العنصر غير موجود');
        }

        await docRef.delete();

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).send('فشل الحذف');
    }
});

// Pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));

// Start
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
