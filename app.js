require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { sequelize, User, StorageLocation, Bichikuhin, StockRecord, Unit } = require('./models');

const app = express();

// --- 設定 ---
const ACCESS_SECRET = process.env.ACCESS_SECRET || 'access_secret_123';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'refresh_secret_456';
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// --- 認証ミドルウェア ---
const authenticateToken = (req, res, next) => {
    const token = req.cookies.accessToken;
    
    if (!token) {
        // APIリクエストの場合は401を返し、ページ遷移の場合はログインへリダイレクト
        if (req.path.startsWith('/api/')) return res.sendStatus(401);
        return res.redirect('/login');
    }

    jwt.verify(token, ACCESS_SECRET, (err, user) => {
        if (err) {
            if (req.path.startsWith('/api/')) return res.sendStatus(401);
            return res.redirect('/login');
        }
        req.user = user;
        next();
    });
};

// --- トークン生成ヘルパー ---
const generateTokens = (user) => {
    const accessToken = jwt.sign({ id: user.id, name: user.name }, ACCESS_SECRET, { expiresIn: '5m' });
    const refreshToken = jwt.sign({ id: user.id }, REFRESH_SECRET, { expiresIn: '7d' });
    return { accessToken, refreshToken };
};

// --- ルート設定 ---

// 1. ルート（備蓄品一覧）
app.get('/', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// 2. ログインページ
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// 3. ログイン実行API
app.post('/api/login', async (req, res) => {
    const { name, password } = req.body;
    const user = await User.findOne({ where: { name } });

    if (user && await bcrypt.compare(password, user.password)) {
        const { accessToken, refreshToken } = generateTokens(user);
        
        // クッキーに保存 (セキュリティのためHttpOnlyを推奨)
        res.cookie('accessToken', accessToken, { httpOnly: true });
        res.cookie('refreshToken', refreshToken, { httpOnly: true });
        
        return res.json({ success: true });
    }
    res.status(401).json({ message: 'ユーザー名またはパスワードが正しくありません' });
});

// 4. トークンリフレッシュAPI
app.post('/api/refresh', (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.sendStatus(401);

    jwt.verify(refreshToken, REFRESH_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        
        const accessToken = jwt.sign({ id: user.id }, ACCESS_SECRET, { expiresIn: '5m' });
        res.cookie('accessToken', accessToken, { httpOnly: true });
        res.json({ success: true });
    });
});

// 5. 備蓄品データ取得API
app.get('/api/records', authenticateToken, async (req, res) => {
    try {
        const records = await StockRecord.findAll({
            include: [Bichikuhin, StorageLocation, Unit],
            order: [['entry_timestamp', 'DESC']]
        });
        res.json(records);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. マスターデータ取得（フロントエンドのセレクトボックス用）
app.get('/api/masters', authenticateToken, async (req, res) => {
    const items = await Bichikuhin.findAll();
    const locations = await StorageLocation.findAll();
    const units = await Unit.findAll();
    res.json({ items, locations, units });
});

// 7. 新規登録/更新API
app.post('/api/records', authenticateToken, async (req, res) => {
    try {
        const { id, bichikuhinId, locationId, quantity, expiryDate, unitId } = req.body;
        if (id) {
            // 更新
            await StockRecord.update(
                { BichikuhinId: bichikuhinId, StorageLocationId: locationId, quantity, expiry_date: expiryDate, UnitId: unitId },
                { where: { id } }
            );
        } else {
            // 新規作成
            await StockRecord.create({
                BichikuhinId: bichikuhinId,
                StorageLocationId: locationId,
                quantity,
                expiry_date: expiryDate,
                UnitId: unitId
            });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/user', authenticateToken, (req, res) => {
    res.json(req.user);
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.json({ success: true });
});

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

    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
});