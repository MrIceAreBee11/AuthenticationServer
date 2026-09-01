const usersService = require('./users.service');
const { successResponse } = require('../../utils/response');

const listUsers = async (req, res) => {
  const { page, limit } = req.query;

  const { users, meta } = await usersService.listUsers({ page, limit });

  return successResponse(res, 200, 'Daftar user berhasil diambil', { users }, meta);
};

const getUser = async (req, res) => {
  const user = await usersService.getUser(req.params.id);

  return successResponse(res, 200, 'Detail user berhasil diambil', { user });
};

const createUser = async (req, res) => {
  const { email, password, fullName, phone, roleIds } = req.body ?? {};

  const user = await usersService.createUser({ email, password, fullName, phone, roleIds });

  return successResponse(res, 201, 'User berhasil dibuat', { user });
};

const updateUser = async (req, res) => {
  const { fullName, phone, isActive } = req.body ?? {};

  const user = await usersService.updateUser(req.user.id, req.params.id, {
    fullName,
    phone,
    isActive,
  });

  return successResponse(res, 200, 'User berhasil diperbarui', { user });
};

const setUserRoles = async (req, res) => {
  const { roleIds } = req.body ?? {};

  const user = await usersService.setUserRoles(req.user.id, req.params.id, roleIds);

  return successResponse(res, 200, 'Role user berhasil diperbarui', { user });
};

const deleteUser = async (req, res) => {
  await usersService.deleteUser(req.user.id, req.params.id);

  return successResponse(res, 200, 'User berhasil dihapus');
};

module.exports = { listUsers, getUser, createUser, updateUser, setUserRoles, deleteUser };