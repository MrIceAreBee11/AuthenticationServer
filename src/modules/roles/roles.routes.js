const { Router } = require('express');

const { rolesController } = require('./roles.controller');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const { PERMISSIONS } = require('../../constants/permissions');

const router = Router();

router.get('/', authenticate, authorize(PERMISSIONS.ROLES_READ), rolesController.list);
router.post('/', authenticate, authorize(PERMISSIONS.ROLES_CREATE), rolesController.create);
router.get('/:id', authenticate, authorize(PERMISSIONS.ROLES_READ), rolesController.getById);
router.patch('/:id', authenticate, authorize(PERMISSIONS.ROLES_UPDATE), rolesController.update);
router.delete('/:id', authenticate, authorize(PERMISSIONS.ROLES_DELETE), rolesController.remove);

router.put(
  '/:id/permissions',
  authenticate,
  authorize(PERMISSIONS.ROLES_UPDATE),
  rolesController.setPermissions
);

module.exports = router;
