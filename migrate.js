'use strict';
 
const { Sequelize } = require('sequelize');
require('dotenv').config();
const defineModels  = require('./models/reservations/index');
 
// ── Connection ────────────────────────────────────────────
// Adjust to match your existing Sequelize config/env setup
const sequelize = new Sequelize(
  process.env.DB_NAME_RESERVATIONS,
  process.env.DB_USER_RESERVATIONS,
  process.env.DB_PASS_RESERVATIONS,
  {
    host:    process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    logging: (sql) => console.log('[SQL]', sql),
  }
);
 
// ── Run ───────────────────────────────────────────────────
(async () => {
  try {
    await sequelize.authenticate();
    console.log('Connection established.');
 
    defineModels(sequelize);
 
    await sequelize.sync({ alter: true });
    console.log('Sync complete. All tables are up to date.');
 
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();