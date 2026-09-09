/**
 * Composition root — tempat semua dependency dirakit.
 *
 * Modul lain tidak perlu membuat dependency konkret sendiri. Semua object
 * dibuat di sini lalu diberikan ke modul yang membutuhkannya. Dengan begitu,
 * mengganti implementasi cukup dilakukan dari satu tempat.
 *
 * File ini sengaja berada di src/ karena ia memang perlu mengetahui seluruh
 * dependency aplikasi. Modul di bawahnya tidak perlu tahu bagaimana object
 * tersebut dibuat.
 *
 * Urutan perakitan mengikuti arah dependency untuk mencegah circular dependency:
 *
 *   config -> adapter -> repository -> service -> middleware -> controller
 *
 * Mulai dari dependency paling dasar, lalu dirakit ke object yang
 * membutuhkan dependency tersebut.
 */
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');

const { config } = require('./config');

const { Database } = require('./infrastructure/database');
const { CacheClient } = require('./infrastructure/redis');
const { MessageQueue } = require('./infrastructure/queue');
const { ObjectStorage } = require('./infrastructure/storage');
const { TokenService } = require('./utils/token');
const { Logger } = require('./utils/logger');
const { RequestContext } = require('./utils/requestContext');

const { UserRepository } = require('./repositories/user.repository');
const { RoleRepository } = require('./repositories/role.repository');
const { PermissionRepository } = require('./repositories/permission.repository');
const { RefreshTokenRepository } = require('./repositories/refreshToken.repository');
const { TokenDenylistRepository } = require('./repositories/tokenDenylist.repository');
const { PasswordResetTokenRepository } = require('./repositories/passwordResetToken.repository');
const { HealthRepository } = require('./repositories/health.repository');
const { AuditRepository } = require('./repositories/audit.repository');
const { IdempotencyRepository } = require('./repositories/idempotency.repository');

const { PermissionService } = require('./services/permission.service');
const { AuditService } = require('./services/audit.service');
const { AvatarStore } = require('./services/avatar.store');
const { HealthService } = require('./modules/health/health.service');
const { AuthService } = require('./modules/auth/auth.service');
const { PasswordService } = require('./modules/auth/password.service');
const { ProfileService } = require('./modules/profile/profile.service');
const { UsersService } = require('./modules/users/users.service');
const { UserManagementPolicy } = require('./modules/users/users.policy');
const { RolesService } = require('./modules/roles/roles.service');

const { AuthenticateMiddleware } = require('./middlewares/authenticate');
const { AuthorizeMiddleware } = require('./middlewares/authorize');
const { RateLimiterFactory } = require('./middlewares/rateLimiter');
const { UploadMiddleware } = require('./middlewares/upload');
const { ErrorHandler } = require('./middlewares/errorHandler');
const { RequestLoggerMiddleware } = require('./middlewares/requestLogger');
const { IdempotencyMiddleware } = require('./middlewares/idempotency');

const { AuthController } = require('./modules/auth/auth.controller');
const { ProfileController } = require('./modules/profile/profile.controller');
const { UsersController } = require('./modules/users/users.controller');
const { RolesController } = require('./modules/roles/roles.controller');
const { HealthController } = require('./modules/health/health.controller');

class Container {
  constructor(settings = config, { stream } = {}) {
    // Dirakit paling awal: hampir semua di bawah butuh logger, dan logger
    // sendiri tidak butuh apa pun.
    this.context = new RequestContext();
    this.logger = new Logger({
      level: settings.app.logLevel,
      context: this.context,
      bindings: { env: settings.app.env },
      ...(stream && { stream }),
    });

    // ---------- adapter: dependency yang berhubungan dengan resource eksternal ----------
    // Tiap adapter dapat child logger berpenanda komponen, supaya
    // "tampilkan semua error redis" jadi satu filter, bukan pencarian teks.
    this.database = new Database(settings.app.env);
    this.cache = new CacheClient(settings.cache, this.logger.child({ component: 'redis' }));
    this.queue = new MessageQueue(settings.queue.url, this.logger.child({ component: 'rabbitmq' }));
    this.storage = new ObjectStorage(settings.storage, this.logger.child({ component: 'minio' }));
    this.tokens = new TokenService(settings.token);

    const { models } = this.database;

    // ---------- repository: akses ke database lewat model ----------
    const users = new UserRepository({ User: models.User });
    const roles = new RoleRepository({ Role: models.Role, database: this.database });
    const permissions = new PermissionRepository({ Permission: models.Permission });
    const refreshTokens = new RefreshTokenRepository({ RefreshToken: models.RefreshToken });
    const denylist = new TokenDenylistRepository(this.cache);
    const resetTokens = new PasswordResetTokenRepository(this.cache);
    const auditRepository = new AuditRepository({ AuditLog: models.AuditLog });
    const idempotency = new IdempotencyRepository(this.cache);
    const health = new HealthRepository({
      database: this.database,
      cache: this.cache,
      logger: this.logger.child({ component: 'health' }),
    });

    // Services
    // Jejak audit dirakit paling awal di antara service: hampir semua service
    // yang mengubah data memakainya.
    const audit = new AuditService({
      audit: auditRepository,
      context: this.context,
      logger: this.logger.child({ component: 'audit' }),
    });

    // PermissionService di-cache dan di-share ke auth/roles/users
    // Dipakai oleh beberapa fitur, jadi dibuat sebelum service yang membutuhkannya.
    const permissionCache = new PermissionService({
      users,
      permissions,
      cache: this.cache,
      ttlSeconds: settings.permission.cacheTtlSeconds,
      logger: this.logger.child({ component: 'rbac' }),
    });

    const auth = new AuthService({
      users,
      denylist,
      refreshTokens,
      tokens: this.tokens,
      ttlSeconds: settings.token.refreshTtlSeconds,
      logger: this.logger.child({ component: 'auth' }),
      audit,

      // Hash ini dipakai untuk menjaga waktu proses login tetap mirip ketika
      // user tidak ditemukan. Cost factor-nya mengikuti konfigurasi yang aktif,
      // jadi tidak perlu diubah lagi kalau BCRYPT_SALT_ROUNDS berubah.
      // Hash hanya dibuat sekali saat aplikasi mulai.
      dummyPasswordHash: bcrypt.hashSync(
        crypto.randomBytes(32).toString('hex'),
        settings.password.saltRounds
      ),
    });

    const passwords = new PasswordService({
      users,
      resetTokens,
      refreshTokens,
      tokens: this.tokens,
      policy: settings.password,
      audit,
    });

    // Penyimpanan avatar dirakit sebelum kedua modul yang memakainya.
    const avatars = new AvatarStore({
      storage: this.storage,
      avatar: settings.upload.avatar,
      logger: this.logger.child({ component: 'avatar' }),
    });

    const profiles = new ProfileService({ users, avatars, audit });

    const usersService = new UsersService({
      database: this.database,
      users,
      roles,
      permissions: permissionCache,
      avatars,
      policy: new UserManagementPolicy({ users, audit }),
      passwords: settings.password,
      paging: settings.pagination.users,
      audit,
    });

    const rolesService = new RolesService({
      database: this.database,
      roles,
      permissions,
      permissionCache,
      audit,
    });

    this.permissionService = permissionCache;

    // Middlewares
    this.requestLogger = new RequestLoggerMiddleware({
      logger: this.logger.child({ component: 'http' }),
      context: this.context,
    });

    this.authenticate = new AuthenticateMiddleware({
      users,
      denylist,
      tokens: this.tokens,
      logger: this.logger.child({ component: 'auth' }),
      context: this.context,
    });

    this.authorize = new AuthorizeMiddleware({ permissions: permissionCache });

    this.rateLimiters = new RateLimiterFactory({
      cache: this.cache,
      limits: settings.rateLimit,
    });

    this.upload = new UploadMiddleware({ avatar: settings.upload.avatar });

    this.idempotency = new IdempotencyMiddleware({
      store: idempotency,
      ttlSeconds: settings.idempotency.ttlSeconds,
      logger: this.logger.child({ component: 'idempotency' }),
    });

    this.errorHandler = new ErrorHandler({
      exposeStack: settings.app.isDevelopment,
      logger: this.logger.child({ component: 'http' }),
    });

    // Controllers
    this.controllers = {
      auth: new AuthController({
        auth,
        passwords,
        permissions: permissionCache,
        queue: this.queue,
        appUrl: settings.app.url,
        logger: this.logger.child({ component: 'auth' }),
      }),
      profile: new ProfileController({ profiles }),
      users: new UsersController({ users: usersService }),
      roles: new RolesController({ roles: rolesService }),
      health: new HealthController({
        health: new HealthService({ health }),
        environment: settings.app.env,
      }),
    };
  }

  // Verifikasi kesiapan koneksi sebelum server/worker mulai menerima request
  async connect() {
    await this.database.connect();
    await this.cache.connect();

    // Sambungkan antrean di awal saat aplikasi mulai berjalan.
    // Kalau ditunda sampai ada request masuk, catatan error antrean bakal
    // ketempelan tanda pengenal request tersebut dan bikin isi log keliru/membingungkan.
    // Jika gagal, aplikasi tetap jalan karena antrean cuma dipakai untuk kirim email di latar belakang.
    await this.queue
      .connect()
      .catch((error) => this.logger.exception('antrean belum tersambung saat start', error));
  }

  // Menutup resource satu per satu. Kalau salah satu gagal, proses tetap
  // lanjut supaya resource lain tetap punya kesempatan untuk ditutup.
  async close() {
    await this.queue.close().catch(() => {});
    await this.cache.close().catch(() => {});
    await this.database.close().catch(() => {});
  }
}

module.exports = { Container };
