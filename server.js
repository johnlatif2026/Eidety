require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const { ADMIN_USER, ADMIN_PASS, JWT_SECRET, TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env;

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    console.log('Authorization header:', authHeader); // للتصحيح
    const token = authHeader?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized - no token' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Forbidden - invalid token' });
        req.user = user;
        next();
    });
}

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (username === ADMIN_USER && password === ADMIN_PASS) {
        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '2h' });
        return res.json({ success: true, token });
    }

    res.status(401).json({ success: false, message: 'خطأ في اسم المستخدم أو كلمة المرور' });
});

app.post('/send-to-telegram', async (req, res) => {
    try {
        const { username, gift, boxNumber, timestamp, ip } = req.body;
        const message = `
🎄 *مفاجأة السنة الجديدة* 🎁

👤 *اسم المستخدم:* ${username}
🎁 *الهدية المختارة:* ${gift}
🔢 *رقم الصندوق:* ${boxNumber}
⏰ *الوقت:* ${new Date(timestamp).toLocaleString('ar-EG')}
🌐 *عنوان IP:* ${ip}

✅ تم اختيار الهدية بنجاح!
        `;
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
        });

        saveToFile({ username, gift, boxNumber, timestamp, ip });
        res.json({ success: true, message: 'تم إرسال البيانات إلى التليجرام بنجاح' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'خطأ في إرسال البيانات' });
    }
});

app.get('/dashboard/data', authenticateToken, (req, res) => {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.json([]);
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/dashboard', authenticateToken, (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));

function saveToFile(data) {
    const filePath = path.join(__dirname, 'data.json');
    let existingData = [];
    try { existingData = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (err) {}
    existingData.push({ ...data, savedAt: new Date().toISOString() });
    fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));
}

app.listen(PORT, () => {
    console.log(`✅ السيرفر يعمل على http://localhost:${PORT}`);
});
