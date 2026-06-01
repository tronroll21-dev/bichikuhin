const express = require('express');
const path = require('path');
const multer = require('multer');
const { Kottouhin, KottouhinCategory } = require('../models');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const ACCESS_SECRET = process.env.ACCESS_SECRET || 'access_secret_123';

// --- 設定 ---
app.use(express.json());
app.use(cookieParser());

// --- 画像アップロードの設定 (multer) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/kottouhin/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// --- 認証ミドルウェア (bichikuhinkanri.js と同様) ---
const authenticateToken = (req, res, next) => {
    const token = req.cookies.accessToken;
    
    if (!token) {
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

// --- ルート設定 ---

// 1. 骨董品一覧ページ
app.get('/', authenticateToken, (req, res) => {
    res.sendFile(path.resolve(__dirname, '../views/kottouhin.html'));
});

// 2. 骨董品データ取得API
app.get('/api/kottouhin', authenticateToken, async (req, res) => {
    try {
        const items = await Kottouhin.findAll({
            include: [KottouhinCategory],
            order: [['entry_date', 'DESC']]
        });
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. 骨董品登録・更新API
app.post('/api/kottouhin', authenticateToken, upload.single('photo'), async (req, res) => {
    try {
        const { id, name, categoryId, entry_date } = req.body;
        const photo = req.file ? `/uploads/kottouhin/${req.file.filename}` : undefined;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        if (id) {
            // 更新
            const item = await Kottouhin.findByPk(id);
            if (!item) return res.status(404).json({ error: 'Item not found' });

            const updateData = {
                name,
                KottouhinCategoryId: categoryId || null,
                entry_date: entry_date || new Date()
            };
            if (photo) updateData.photo = photo;

            await item.update(updateData);
            return res.json(item);
        } else {
            // 新規作成
            const newItem = await Kottouhin.create({
                name,
                KottouhinCategoryId: categoryId || null,
                photo: photo || null,
                entry_date: entry_date || new Date()
            });
            res.status(201).json(newItem);
        }
    } catch (err) {
        console.error('Kottouhin save error:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT route (alias for POST with ID for RESTful compliance if needed, but we can just use the POST logic)
app.put('/api/kottouhin/:id', authenticateToken, upload.single('photo'), async (req, res) => {
    req.body.id = req.params.id;
    // Redirect to post logic or duplicate logic
    try {
        const { name, categoryId, entry_date } = req.body;
        const photo = req.file ? `/uploads/kottouhin/${req.file.filename}` : undefined;

        const item = await Kottouhin.findByPk(req.params.id);
        if (!item) return res.status(404).json({ error: 'Item not found' });

        const updateData = {
            name,
            KottouhinCategoryId: categoryId || null,
            entry_date: entry_date || new Date()
        };
        if (photo) updateData.photo = photo;

        await item.update(updateData);
        res.json(item);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. カテゴリー取得API
app.get('/api/categories', authenticateToken, async (req, res) => {
    try {
        const categories = await KottouhinCategory.findAll({
            order: [['name', 'ASC']]
        });
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. カテゴリー登録API
app.post('/api/categories', authenticateToken, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });
        
        const category = await KottouhinCategory.create({ name });
        res.status(201).json(category);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = app;
