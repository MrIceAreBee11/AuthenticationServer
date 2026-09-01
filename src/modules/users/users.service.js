const { sequelize, User, Role } = require('../../database');
const AppError = require('../../utils/AppError');
const { removeObject } = require('../../storage');
const { invalidateUserPermissions } = require('../../services/permission.service');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MIN_PASSWORD_LENGTH = 12;
const SUPERADMIN_ROLE = 'superadmin';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROLE_INCLUDE = {
  association: 'roles',
  attributes: ['id', 'name'],
  through: { attributes: [] },
};

const findUserOrFail = async (userId) => {
  if (!UUID_PATTERN.test(String(userId))) {
    throw new AppError('ID user tidak valid', 400);
  }

  const user = await User.findByPk(userId, { include: [ROLE_INCLUDE] });

  if (!user) {
    throw new AppError('User tidak ditemukan', 404);
  }

  return user;
};

const isSuperadmin = (user) =>
  user.roles.some((role) => role.name === SUPERADMIN_ROLE);

const assertCanManage = async (actorId, target) => {
  if (actorId === target.id) {
    throw new AppError(
      'Gunakan endpoint /profile untuk mengubah akun Anda sendiri',
      403
    );
  }

  if (isSuperadmin(target)) {
    const actor = await findUserOrFail(actorId);

    if (!isSuperadmin(actor)) {
      throw new AppError('Anda tidak dapat mengelola akun superadmin', 403);
    }
  }
};

const resolveRoles = async (roleIds) => {
  if (roleIds === undefined) {
    return null;
  }

  if (!Array.isArray(roleIds)) {
    throw new AppError('roleIds harus berupa array', 400);
  }

  if (roleIds.length === 0) {
    return [];
  }

  const roles = await Role.findAll({ where: { id: roleIds } });

  if (roles.length !== new Set(roleIds).size) {
    throw new AppError('Sebagian roleIds tidak ditemukan', 400);
  }

  return roles;
};

const listUsers = async ({ page, limit }) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(limit) || DEFAULT_PAGE_SIZE)
  );

  const { rows, count } = await User.findAndCountAll({
    include: [ROLE_INCLUDE],
    order: [['createdAt', 'DESC']],
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
    distinct: true,
  });

  return {
    users: rows,
    meta: {
      total: count,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(count / safeLimit) || 1,
    },
  };
};

const getUser = async (userId) => findUserOrFail(userId);

const createUser = async ({ email, password, fullName, phone, roleIds }) => {
  if (!email || !password || !fullName) {
    throw new AppError('Email, password, dan nama lengkap wajib diisi', 400);
  }

  if (String(password).length < MIN_PASSWORD_LENGTH) {
    throw new AppError(`Password minimal ${MIN_PASSWORD_LENGTH} karakter`, 400);
  }

  const roles = await resolveRoles(roleIds);

  const created = await sequelize.transaction(async (transaction) => {
    const user = await User.create(
      {
        email,
        passwordHash: password,
        fullName,
        phone: phone ?? null,
      },
      { transaction }
    );

    if (roles && roles.length > 0) {
      await user.setRoles(roles, { transaction });
    }

    return user;
  });

  return findUserOrFail(created.id);
};

const updateUser = async (actorId, userId, { fullName, phone, isActive }) => {
  const target = await findUserOrFail(userId);

  await assertCanManage(actorId, target);

  const changes = {};

  if (fullName !== undefined) {
    changes.fullName = fullName;
  }

  if (phone !== undefined) {
    changes.phone = phone;
  }

  if (isActive !== undefined) {
    if (typeof isActive !== 'boolean') {
      throw new AppError('isActive harus bernilai true atau false', 400);
    }

    changes.isActive = isActive;
  }

  if (Object.keys(changes).length === 0) {
    throw new AppError('Tidak ada data yang dikirim untuk diubah', 400);
  }

  await target.update(changes);

  return findUserOrFail(userId);
};

const setUserRoles = async (actorId, userId, roleIds) => {
  const target = await findUserOrFail(userId);

  await assertCanManage(actorId, target);

  const roles = await resolveRoles(roleIds);

  if (roles === null) {
    throw new AppError('roleIds wajib dikirim', 400);
  }

  await target.setRoles(roles);
  await invalidateUserPermissions(userId);

  return findUserOrFail(userId);
};

const deleteUser = async (actorId, userId) => {
  const target = await findUserOrFail(userId);

  await assertCanManage(actorId, target);

  const { avatarKey } = target;

  await target.destroy();
  await invalidateUserPermissions(userId);

  if (avatarKey) {
    try {
      await removeObject(avatarKey);
    } catch (error) {
      console.error('[STORAGE] gagal menghapus avatar user terhapus:', error.message);
    }
  }
};

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  setUserRoles,
  deleteUser,
};