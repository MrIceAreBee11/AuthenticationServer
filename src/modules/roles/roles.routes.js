const { Router } = require('express');

const {
  listRoles,
  getRole,
  createRole,
  updateRole,
  setRolePermissions,
  deleteRole,
} = require('./roles.controller');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const { PERMISSIONS } = require('../../constants/permissions');

const router = Router();

router.get('/', authenticate, authorize(PERMISSIONS.ROLES_READ), listRoles);
router.post('/', authenticate, authorize(PERMISSIONS.ROLES_CREATE), createRole);
router.get('/:id', authenticate, authorize(PERMISSIONS.ROLES_READ), getRole);
router.patch('/:id', authenticate, authorize(PERMISSIONS.ROLES_UPDATE), updateRole);
router.put('/:id/permissions', authenticate, authorize(PERMISSIONS.ROLES_UPDATE), setRolePermissions);
router.delete('/:id', authenticate, authorize(PERMISSIONS.ROLES_DELETE), deleteRole);

module.exports = router;
