'use strict';

/**
 * Definisi tabel audit_logs.
 *
 * Tidak punya hook maupun scope: baris audit ditulis sekali dan tidak pernah
 * diubah. Sengaja tidak ada method update di repository-nya.
 */
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class AuditLog extends Model {}

  AuditLog.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      actorId: { type: DataTypes.UUID, allowNull: true },
      action: { type: DataTypes.STRING(60), allowNull: false },
      resourceType: { type: DataTypes.STRING(30), allowNull: false },
      resourceId: { type: DataTypes.STRING(64), allowNull: true },
      outcome: { type: DataTypes.STRING(10), allowNull: false },
      requestId: { type: DataTypes.STRING(64), allowNull: true },
      ip: { type: DataTypes.STRING(45), allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: true },
    },
    {
      sequelize,
      modelName: 'AuditLog',
      tableName: 'audit_logs',

      // Baris audit tidak pernah disunting, jadi updated_at tidak ada gunanya.
      updatedAt: false,
    }
  );

  return AuditLog;
};
