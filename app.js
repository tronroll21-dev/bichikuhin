const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { sequelize, User, StorageLocation, Bichikuhin, StockRecord, Unit, Stocktaking } = require('./models');
const path = require('path');

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
    const accessToken = jwt.sign({ id: user.id, name: user.name, role: user.role }, ACCESS_SECRET, { expiresIn: '5m' });
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

app.get('/change_password', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'change_password.html'));
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

// 新規ユーザー登録API
app.post('/api/register', async (req, res) => {
    const { name, password } = req.body;

    if (!name || !password) {
        return res.status(400).json({ message: 'ユーザー名とパスワードは必須です' });
    }

    try {
        // ユーザー名の重複チェック
        const existingUser = await User.findOne({ where: { name } });
        if (existingUser) {
            return res.status(409).json({ message: 'このユーザー名はすでに使用されています' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({ name, password: hashedPassword, role: 'user' }); // デフォルトロールを'user'とする
        
        res.status(201).json({ success: true, message: 'ユーザー登録が完了しました', user: { id: newUser.id, name: newUser.name } });
    } catch (error) {
        console.error('ユーザー登録エラー:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
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

// 5. 棚卸データ取得API
app.get('/api/stocktakings', authenticateToken, async (req, res) => {
    try {
        const stocktakings = await Stocktaking.findAll({
            order: [['date', 'DESC']]
        });
        res.json(stocktakings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/stocktakings', authenticateToken, async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { name, date, copyFromId } = req.body;
        if (!name || !date) {
            return res.status(400).json({ error: 'Name and date are required' });
        }

        // Deactivate all other stocktakings
        await Stocktaking.update({ active: false }, { where: {}, transaction: t });

        // Create the new stocktaking as active
        const newStocktaking = await Stocktaking.create({ name, date, active: true }, { transaction: t });

        // If there's a stocktaking to copy from, do it
        if (copyFromId) {
            const recordsToCopy = await StockRecord.findAll({
                where: { StocktakingId: copyFromId },
                raw: true // Get plain data objects
            });

            if (recordsToCopy.length > 0) {
                const newRecords = recordsToCopy.map(record => {
                    delete record.id; // Remove original ID
                    delete record.entry_timestamp;
                    return {
                        ...record,
                        StocktakingId: newStocktaking.id
                    };
                });
                await StockRecord.bulkCreate(newRecords, { transaction: t });
            }
        }

        await t.commit();
        res.status(201).json(newStocktaking);
    } catch (err) {
        await t.rollback();
        console.error("Error creating stocktaking:", err);
        res.status(500).json({ error: err.message });
    }
});

// GET expired records from active stocktaking
app.get('/api/records/expired', async (req, res) => {
    // セキュリティ：簡易的なAPIキーチェック（.envに定義）
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.CRON_API_KEY) {
        return res.sendStatus(403);
    }

    try {
        const activeStocktaking = await Stocktaking.findOne({ where: { active: true } });

        if (!activeStocktaking) {
            return res.json([]);
        }

        const records = await StockRecord.findAll({
            where: { 
                StocktakingId: activeStocktaking.id,
                expiry_date: {
                    [Op.ne]: null,
                    [Op.lt]: new Date()
                }
            },
            include: [{ model: Bichikuhin, include: [Unit] }, StorageLocation],
            order: [['expiry_date', 'ASC']]
        });
        res.json(records);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. 備蓄品データ取得API
app.get('/api/records/:stocktakingId', authenticateToken, async (req, res) => {
    try {
        const { stocktakingId } = req.params;
        const records = await StockRecord.findAll({
            where: { StocktakingId: stocktakingId },
            include: [{ model: Bichikuhin, include: [Unit] }, StorageLocation],
            order: [['entry_timestamp', 'DESC']]
        });
        res.json(records);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. マスターデータ取得（フロントエンドのセレクトボックス用）
app.get('/api/masters', authenticateToken, async (req, res) => {
    const locations = await StorageLocation.findAll();
    const units = await Unit.findAll();
    res.json({ locations, units });
});

// 7. 新規登録/更新API
const recordHandler = async (req, res) => {
    try {
        const { id, bichikuhinId, locationId, quantity, expiryDate, stocktakingId } = req.body;
        if (id) {
            // 更新
            await StockRecord.update(
                { BichikuhinId: bichikuhinId, StorageLocationId: locationId, quantity, expiry_date: expiryDate, StocktakingId: stocktakingId },
                { where: { id } }
            );
        } else {
            // 新規作成
            await StockRecord.create({
                BichikuhinId: bichikuhinId,
                StorageLocationId: locationId,
                quantity,
                expiry_date: expiryDate,
                StocktakingId: stocktakingId
            });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

app.post('/api/records', authenticateToken, recordHandler);
app.put('/api/records', authenticateToken, recordHandler);

// 8. 備蓄品検索API
app.get('/api/bichikuhin', authenticateToken, async (req, res) => {
    const { name } = req.query;
    if (!name) {
        return res.json([]);
    }
    try {
        const items = await Bichikuhin.findAll({
            where: {
                name: {
                    [Op.like]: `%${name}%`
                }
            },
            include: [Unit]
        });
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 9. 備蓄品登録API
app.post('/api/bichikuhin', authenticateToken, async (req, res) => {
    const { name, unitId } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }
    try {
        const newItem = await Bichikuhin.create({ name, UnitId: unitId });
        const result = await Bichikuhin.findByPk(newItem.id, { include: [Unit] });
        res.status(201).json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/user', authenticateToken, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ id: user.id, name: user.name, name_jp: user.name_jp, role: user.role });
    } catch (error) {
        console.error('Failed to fetch user:', error);
        res.status(500).json({ message: 'Failed to fetch user data' });
    }
});

app.post('/api/change_password', authenticateToken, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!oldPassword || !newPassword) {
        return res.status(400).json({ message: '両方のパスワードフィールドは必須です' });
    }

    try {
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'ユーザーが見つかりません' });
        }

        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: '現在のパスワードが正しくありません' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await user.update({ password: hashedPassword });

        res.json({ success: true, message: 'パスワードが正常に変更されました' });
    } catch (error) {
        console.error('パスワード変更エラー:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});

const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'アクセス権がありません' });
    }
    next();
};

app.put('/api/users/:id/password', async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ message: 'パスワードは必須です' });
    }

    try {
        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ message: 'ユーザーが見つかりません' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await user.update({ password: hashedPassword });

        res.json({ success: true, message: 'ユーザーのパスワードが正常に変更されました' });
    } catch (error) {
        console.error('管理者によるパスワード変更エラー:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
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