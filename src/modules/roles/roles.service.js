const { QueryTypes } = require('sequelize');

const { sequelize, Role, Permission } = require('../../database');
const AppError = require('../../utils/AppError');
const { bumpPermissionVersion } = require('../../services/permission.service');

const PROTECTED_ROLE_NAMES = ['superadmin'];

const PERMISSION_INCLUDE = {
  association: 'permissions',
  attributes: ['id', 'name', 'description'],
  through: { attributes: [] },
};

const countUsersPerRole = async () => {
  const rows = await sequelize.query(
    'SELECT role_id, COUNT(*)::int AS total FROM user_roles GROUP BY role_id',
    { type: QueryTypes.SELECT }
  );

  return Object.fromEntries(rows.map((row) => [row.role_id, row.total]));
};

const findRoleOrFail = async (roleId) => {
  const id = Number(roleId);

  if (!Number.isInteger(id) || id < 1) {
    throw new AppError('ID role tidak valid', 400);
  }

  const role = await Role.findByPk(id, { include: [PERMISSION_INCLUDE] });

  if (!role) {
    throw new AppError('Role tidak ditemukan', 404);
  }

  return role;
};

const assertNotProtected = (role, action) => {
  if (PROTECTED_ROLE_NAMES.includes(role.name)) {
    throw new AppError(`Role "${role.name}" dilindungi dan tidak dapat ${action}`, 403);
  }
};

const resolvePermissions = async (permissionIds) => {
  if (!Array.isArray(permissionIds)) {
    throw new AppError('permissionIds harus berupa array', 400);
  }

  if (permissionIds.length === 0) {
    return [];
  }

  const permissions = await Permission.findAll({ where: { id: permissionIds } });

  if (permissions.length !== new Set(permissionIds).size) {
    throw new AppError('Sebagian permissionIds tidak ditemukan', 400);
  }

  return permissions;
};

const listRoles = async () => {
  const [roles, userCounts] = await Promise.all([
    Role.findAll({ include: [PERMISSION_INCLUDE], order: [['id', 'ASC']] }),
    countUsersPerRole(),
  ]);

  return roles.map((role) => ({
    ...role.toJSON(),
    userCount: userCounts[role.id] ?? 0,
    isProtected: PROTECTED_ROLE_NAMES.includes(role.name),
  }));
};

const getRole = async (roleId) => {
  const role = await findRoleOrFail(roleId);
  const userCounts = await countUsersPerRole();

  return {
    ...role.toJSON(),
    userCount: userCounts[role.id] ?? 0,
    isProtected: PROTECTED_ROLE_NAMES.includes(role.name),
  };
};

const listPermissions = async () => {
  const permissions = await Permission.findAll({
    attributes: ['id', 'name', 'description'],
    order: [['name', 'ASC']],
  });

  // Kelompokkan berdasarkan bagian pertama nama, misalnya "users" dari "users.create".
  const groups = {};

  permissions.forEach((permission) => {
    const [resource] = permission.name.split('.');

    groups[resource] = groups[resource] ?? [];
    groups[resource].push(permission.toJSON());
  });

  return { permissions: permissions.map((item) => item.toJSON()), groups };
};

const createRole = async ({ name, description, permissionIds }) => {
  if (!name || String(name).trim().length === 0) {
    throw new AppError('Nama role wajib diisi', 400);
  }

  const permissions = permissionIds === undefined ? [] : await resolvePermissions(permissionIds);

  const created = await sequelize.transaction(async (transaction) => {
    const role = await Role.create(
      { name: String(name).trim().toLowerCase(), description: description ?? null },
      { transaction }
    );

    if (permissions.length > 0) {
      await role.setPermissions(permissions, { transaction });
    }

    return role;
  });

  return getRole(created.id);
};

const updateRole = async (roleId, { name, description }) => {
  const role = await findRoleOrFail(roleId);

  const changes = {};

  if (name !== undefined) {
    assertNotProtected(role, 'diubah namanya');

    if (String(name).trim().length === 0) {
      throw new AppError('Nama role tidak boleh kosong', 400);
    }

    changes.name = String(name).trim().toLowerCase();
  }

  if (description !== undefined) {
    changes.description = description;
  }

  if (Object.keys(changes).length === 0) {
    throw new AppError('Tidak ada data yang dikirim untuk diubah', 400);
  }

  await role.update(changes);

  return getRole(roleId);
};

const setRolePermissions = async (roleId, permissionIds) => {
  const role = await findRoleOrFail(roleId);
  const permissions = await resolvePermissions(permissionIds);

  await role.setPermissions(permissions);

  // Perubahan permission sebuah role memengaruhi SEMUA pengguna yang memakainya,
  // jadi seluruh cache izin harus dianggap kedaluwarsa sekaligus.
  await bumpPermissionVersion();

  return getRole(roleId);
};

const deleteRole = async (roleId) => {
  const role = await findRoleOrFail(roleId);

  assertNotProtected(role, 'dihapus');

  const userCounts = await countUsersPerRole();
  const userCount = userCounts[role.id] ?? 0;

  if (userCount > 0) {
    throw new AppError(
      `Role ini masih dipakai oleh ${userCount} pengguna. Pindahkan mereka ke role lain terlebih dahulu.`,
      409
    );
  }

  await role.destroy();
  await bumpPermissionVersion();
};

module.exports = {
  listRoles,
  getRole,
  listPermissions,
  createRole,
  updateRole,
  setRolePermissions,
  deleteRole,
};
