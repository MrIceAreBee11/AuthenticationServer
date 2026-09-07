const { Router } = require('express');

const { rolesController } = require('./roles.controller');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const { PERMISSIONS } = require('../../constants/permissions');

const router = Router();

// Katalog permission tinggal di modul roles karena keduanya satu domain (RBAC),
// tetapi dipasang pada alamat sendiri agar sumber dayanya jelas terpisah.
router.get(
  '/',
  authenticate,
  authorize(PERMISSIONS.PERMISSIONS_READ),
  rolesController.listPermissions
);

module.exports = router;
