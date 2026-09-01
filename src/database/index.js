const { Sequelize } = require('sequelize');

const env = require('../config/env');
const databaseConfig = require('../config/database');

const config = databaseConfig[env.nodeEnv];

if (!config) {
  throw new Error(`Konfigurasi database untuk NODE_ENV="${env.nodeEnv}" tidak ditemukan`);
}

const sequelize = new Sequelize(config);

const models = {
  User: require('./models/user')(sequelize),
  Role: require('./models/role')(sequelize),
  Permission: require('./models/permission')(sequelize),
};

Object.values(models).forEach((model) => {
  if (typeof model.associate === 'function') {
    model.associate(models);
  }
});

module.exports = { sequelize, Sequelize, ...models };