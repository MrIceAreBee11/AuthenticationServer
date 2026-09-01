const env = require('./env');

const baseConfig = {
  username: env.db.user,
  password: env.db.password,
  database: env.db.name,
  host: env.db.host,
  port: env.db.port,
  dialect: 'postgres',
  seederStorage: 'sequelize',
  define: {
    underscored: true,
    timestamps: true,
  },
};

module.exports = {
  development: {
    ...baseConfig,
    logging: (sql) => console.log(`[SQL] ${sql}`),
  },
  test: {
    ...baseConfig,
    database: `${env.db.name}_test`,
    logging: false,
  },
  production: {
    ...baseConfig,
    logging: false,
    pool: { max: 10, min: 2, idle: 10000 },
  },
};