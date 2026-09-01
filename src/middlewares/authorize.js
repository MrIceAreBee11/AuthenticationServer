const AppError = require('../utils/AppError');
const { getUserPermissions } = require('../services/permission.service');

const authorize = (...requiredPermissions) => {
  if (requiredPermissions.length === 0) {
    throw new Error('authorize() harus dipanggil dengan minimal satu permission');
  }

  return async (req, res, next) => {
    if (!req.user) {
      throw new Error('authorize() harus dipasang setelah authenticate()');
    }

    const ownedPermissions = await getUserPermissions(req.user.id);

    const missingPermissions = requiredPermissions.filter(
      (permission) => !ownedPermissions.includes(permission)
    );

    if (missingPermissions.length > 0) {
      throw new AppError(
        'Anda tidak memiliki izin untuk mengakses sumber daya ini',
        403
      );
    }

    req.permissions = ownedPermissions;

    return next();
  };
};

module.exports = authorize;