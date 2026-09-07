const { Router } = require('express');

const { usersController } = require('./users.controller');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const { PERMISSIONS } = require('../../constants/permissions');

const router = Router();

router.get('/', authenticate, authorize(PERMISSIONS.USERS_READ), usersController.list);
router.post('/', authenticate, authorize(PERMISSIONS.USERS_CREATE), usersController.create);
router.get('/:id', authenticate, authorize(PERMISSIONS.USERS_READ), usersController.getById);
router.patch('/:id', authenticate, authorize(PERMISSIONS.USERS_UPDATE), usersController.update);
router.delete('/:id', authenticate, authorize(PERMISSIONS.USERS_DELETE), usersController.remove);

// Dijaga roles.update, BUKAN users.update. Kalau dijaga users.update, setiap
// pemegang izin itu dapat memberikan role superadmin kepada dirinya sendiri
// dan seluruh pembatasan RBAC hilang dalam satu permintaan.
router.put(
  '/:id/roles',
  authenticate,
  authorize(PERMISSIONS.ROLES_UPDATE),
  usersController.setRoles
);

module.exports = router;
