const { Router } = require('express');

const {
  listUsers,
  getUser,
  createUser,
  updateUser,
  setUserRoles,
  deleteUser,
} = require('./users.controller');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const { PERMISSIONS } = require('../../constants/permissions');

const router = Router();

router.get('/', authenticate, authorize(PERMISSIONS.USERS_READ), listUsers);
router.post('/', authenticate, authorize(PERMISSIONS.USERS_CREATE), createUser);
router.get('/:id', authenticate, authorize(PERMISSIONS.USERS_READ), getUser);
router.patch('/:id', authenticate, authorize(PERMISSIONS.USERS_UPDATE), updateUser);
router.delete('/:id', authenticate, authorize(PERMISSIONS.USERS_DELETE), deleteUser);
router.put('/:id/roles', authenticate, authorize(PERMISSIONS.ROLES_UPDATE), setUserRoles);

module.exports = router;