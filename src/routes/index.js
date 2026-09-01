const { Router } = require('express');

const healthRoutes = require('../modules/health/health.routes');
const authRoutes = require('../modules/auth/auth.routes');
const profileRoutes = require('../modules/profile/profile.routes');
const usersRoutes = require('../modules/users/users.routes');
const rolesRoutes = require('../modules/roles/roles.routes');
const permissionsRoutes = require('../modules/roles/permissions.routes');

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/users', usersRoutes);
router.use('/roles', rolesRoutes);
router.use('/permissions', permissionsRoutes);

module.exports = router;
