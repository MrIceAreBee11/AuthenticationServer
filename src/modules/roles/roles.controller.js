const rolesService = require('./roles.service');
const { successResponse } = require('../../utils/response');

const listRoles = async (req, res) => {
  const roles = await rolesService.listRoles();

  return successResponse(res, 200, 'Daftar role berhasil diambil', { roles });
};

const getRole = async (req, res) => {
  const role = await rolesService.getRole(req.params.id);

  return successResponse(res, 200, 'Detail role berhasil diambil', { role });
};

const listPermissions = async (req, res) => {
  const { permissions, groups } = await rolesService.listPermissions();

  return successResponse(res, 200, 'Daftar permission berhasil diambil', {
    permissions,
    groups,
  });
};

const createRole = async (req, res) => {
  const { name, description, permissionIds } = req.body ?? {};

  const role = await rolesService.createRole({ name, description, permissionIds });

  return successResponse(res, 201, 'Role berhasil dibuat', { role });
};

const updateRole = async (req, res) => {
  const { name, description } = req.body ?? {};

  const role = await rolesService.updateRole(req.params.id, { name, description });

  return successResponse(res, 200, 'Role berhasil diperbarui', { role });
};

const setRolePermissions = async (req, res) => {
  const { permissionIds } = req.body ?? {};

  const role = await rolesService.setRolePermissions(req.params.id, permissionIds);

  return successResponse(res, 200, 'Permission role berhasil diperbarui', { role });
};

const deleteRole = async (req, res) => {
  await rolesService.deleteRole(req.params.id);

  return successResponse(res, 200, 'Role berhasil dihapus');
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
