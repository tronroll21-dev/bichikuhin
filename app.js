const express = require('express');
const bcrypt = require('bcryptjs');
const vhost = require('vhost');
const fs = require('fs');
const path = require('path');
const { sequelize, User, Stocktaking, Room, Department, Employee, Reservation } = require('./models');

const bichikuhinkanri = require('./apps/bichikuhinkanri');
const kottouhin = require('./apps/kottouhin');
const kikai = require('./apps/kikai');
const reservations = require('./apps/reservations');

const soumu = express();
const PORT = 3000;

// Create upload directory if it doesn't exist
const uploadDir = path.join(__dirname, 'public/uploads/kottouhin/');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

soumu.use('/', bichikuhinkanri);
soumu.use('/kottouhin', kottouhin);
soumu.use('/reservations', reservations);
// Static files (for images etc.)
soumu.use(express.static('public'));

const app = express();
app.use(vhost('bichikuhinkanri_local', soumu));
app.use(vhost('kikairollweb_local', kikai));
app.use(vhost('reservations_local', reservations));

// --- データベース同期とサーバー起動 ---
sequelize.sync({ alter: false }).then(async () => {
    console.log('Database synced');

    // テストユーザーがいない場合は作成 (ユーザー名: admin, パスワード: password123)
    const userCount = await User.count();
    if (userCount === 0) {
        const hashedPassword = await bcrypt.hash('password123', 10);
        await User.create({ name: 'admin', password: hashedPassword, role: 'admin' });
        console.log('Default user created');
    }

    // Add a default stocktaking if none exists
    const stocktakingCount = await Stocktaking.count();
    if (stocktakingCount === 0) {
        await Stocktaking.create({ name: '初期棚卸', date: new Date(), active: true });
        console.log('Default stocktaking created');
    }

    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
});