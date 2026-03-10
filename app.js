const express = require('express');
const vhost = require('vhost');
const bcrypt = require('bcryptjs');
const { sequelize, User, Stocktaking } = require('./models');

const bichikuhinkanri = require('./apps/bichikuhinkanri');

const app = express();
const PORT = 3000;

app.use(vhost('bichikuhinkanri', bichikuhinkanri));

// --- データベース同期とサーバー起動 ---
sequelize.sync({ alter: true }).then(async () => {
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