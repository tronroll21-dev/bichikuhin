const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

/* Sequelizeのインスタンス初期化
   .envファイルから接続情報を読み込みます
*/
const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
        logging: false, // コンソールのSQLログを非表示
        define: {
            timestamps: true, // createdAt, updatedAtを自動生成
            freezeTableName: true // テーブル名をモデル名と同じにする
        }
    }
);

// --- モデル定義 ---

// ユーザーテーブル
const User = sequelize.define('User', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    name_jp: { type: DataTypes.STRING, allowNull: true },
    role: { type: DataTypes.STRING },
    password: { type: DataTypes.STRING, allowNull: false }
});

// 保管場所マスター
const StorageLocation = sequelize.define('StorageLocation', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false }
});

// 単位マスター
const Unit = sequelize.define('Unit', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false }
});

// 備蓄品マスター
const Bichikuhin = sequelize.define('Bichikuhin', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
});

// 在庫記録テーブル
const StockRecord = sequelize.define('StockRecord', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    expiry_date: { type: DataTypes.DATEONLY, allowNull: true },
    entry_timestamp: { 
        type: DataTypes.DATE, 
        defaultValue: Sequelize.NOW 
    }
});

// --- リレーション（関連付け）の設定 ---

/* StockRecord は Bichikuhin と StorageLocation に属します。
   これにより StockRecord.findAll({ include: [...] }) が可能になります。
*/

// 備蓄品マスターとの紐付け (BichikuhinId カラムが生成されます)
Bichikuhin.hasMany(StockRecord, { foreignKey: 'BichikuhinId' });
StockRecord.belongsTo(Bichikuhin);

// 保管場所マスターとの紐付け (StorageLocationId カラムが生成されます)
StorageLocation.hasMany(StockRecord, { foreignKey: 'StorageLocationId' });
StockRecord.belongsTo(StorageLocation);

// 単位マスターとの紐付け (UnitId カラムが生成されます)
Unit.hasMany(StockRecord, { foreignKey: 'UnitId' });
StockRecord.belongsTo(Unit);

// 棚卸テーブル
const Stocktaking = sequelize.define('Stocktaking', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
});

// 棚卸テーブルとの紐付け
Stocktaking.hasMany(StockRecord, { foreignKey: 'StocktakingId' });
StockRecord.belongsTo(Stocktaking);


// データベース接続とモデルをエクスポート
module.exports = {
    sequelize,
    User,
    StorageLocation,
    Bichikuhin,
    StockRecord,
    Unit,
    Stocktaking
};