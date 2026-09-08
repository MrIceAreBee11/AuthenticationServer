/**
 * BERKAS INI: composition root — SATU-SATUNYA tempat kata `new` dipanggil.
 *
 * KENAPA ADA: sebelum berkas ini, setiap modul mengakhiri dirinya dengan
 * `module.exports = { AuthService, authService: new AuthService() }`. Ada 24
 * baris seperti itu. Constructor-nya memang menerima dependensi, tetapi nilai
 * bawaannya me-require implementasi konkret — jadi setiap berkas logika tetap
 * tahu siapa kolaboratornya, dan manfaat "loosely coupled" yang menjadi alasan
 * memakai class sejak awal tidak pernah benar-benar tercapai. Mengganti satu
 * implementasi masih berarti mengedit berkasnya.
 *
 * KENAPA DI src/ DAN BUKAN DI DALAM SALAH SATU MODUL: ia harus tahu segalanya.
 * Berkas yang tahu segalanya tidak boleh berada di dalam modul mana pun, atau
 * modul itu otomatis bergantung pada seluruh aplikasi.
 *
 * URUTAN PERAKITAN mengikuti arah ketergantungan, dari yang tidak bergantung
 * pada apa pun sampai yang bergantung pada segalanya:
 *
 *   config -> adapter -> repository -> service -> middleware -> controller
 *
 * Tidak ada anak panah yang menunjuk ke belakang. Kalau suatu saat ada, berarti
 * ada ketergantungan melingkar — dan tempat pertama yang akan meneriakkannya
 * adalah berkas ini, saat merakit.
 */
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');

const { config } = require('./config');

const { Database } = require('./database');
const { CacheClient } = require('./redis');
const { MessageQueue } = require('./queue');
const { ObjectStorage } = require('./storage');
const { TokenService } = require('./utils/token');

const { UserRepository } = require('./repositories/user.repository');
const { RoleRepository } = require('./repositories/role.repository');
const { PermissionRepository } = require('./repositories/permission.repository');
const { RefreshTokenRepository } = require('./repositories/refreshToken.repository');
const { TokenDenylistRepository } = require('./repositories/tokenDenylist.repository');
const {
  PasswordResetTokenRepository,
} = require('./repositories/passwordResetToken.repository');
const { HealthRepository } = require('./repositories/health.repository');

const { PermissionService } = require('./services/permission.service');
const { AuthService } = require('./modules/auth/auth.service');
const { PasswordService } = require('./modules/auth/password.service');
const { ProfileService } = require('./modules/profile/profile.service');
const { UsersService } = require('./modules/users/users.service');
const { RolesService } = require('./modules/roles/roles.service');

const { AuthenticateMiddleware } = require('./middlewares/authenticate');
const { AuthorizeMiddleware } = require('./middlewares/authorize');
const { RateLimiterFactory } = require('./middlewares/rateLimiter');
const { UploadMiddleware } = require('./middlewares/upload');
const { ErrorHandler } = require('./middlewares/errorHandler');

const { AuthController } = require('./modules/auth/auth.controller');
const { ProfileController } = require('./modules/profile/profile.controller');
const { UsersController } = require('./modules/users/users.controller');
const { RolesController } = require('./modules/roles/roles.controller');
const { HealthController } = require('./modules/health/health.controller');

class Container {
  constructor(settings = config) {
    // ---------- adapter: segalanya yang melewati batas proses ----------
    this.database = new Database(settings.app.env);
    this.cache = new CacheClient(settings.cache);
    this.queue = new MessageQueue(settings.queue.url);
    this.storage = new ObjectStorage(settings.storage);
    this.tokens = new TokenService(settings.token);

    const { models } = this.database;

    // ---------- repository: satu-satunya yang menyentuh model ----------
    const users = new UserRepository({ User: models.User });
    const roles = new RoleRepository({ Role: models.Role, database: this.database });
    const permissions = new PermissionRepository({ Permission: models.Permission });
    const refreshTokens = new RefreshTokenRepository({ RefreshToken: models.RefreshToken });
    const denylist = new TokenDenylistRepository(this.cache);
    const resetTokens = new PasswordResetTokenRepository(this.cache);
    const health = new HealthRepository({ database: this.database, cache: this.cache });

    // ---------- service ----------
    // permissionService dipakai lintas fitur, jadi ia dirakit lebih dulu.
    const permissionCache = new PermissionService({
      users,
      permissions,
      cache: this.cache,
      ttlSeconds: settings.permission.cacheTtlSeconds,
    });

    const auth = new AuthService({
      users,
      denylist,
      refreshTokens,
      tokens: this.tokens,
      ttlSeconds: settings.token.refreshTtlSeconds,

      // Hash tiruan untuk penyetaraan waktu login, dihitung dari cost factor
      // yang BERLAKU — bukan ditulis sebagai teks di dalam kode. Dengan begitu
      // ia tidak mungkin ketinggalan ketika BCRYPT_SALT_ROUNDS dinaikkan, dan
      // celah waktu yang seharusnya ditutup tidak terbuka diam-diam.
      // Biayanya satu perhitungan hash saat start.
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
    });

    const profiles = new ProfileService({
      users,
      storage: this.storage,
      avatar: settings.upload.avatar,
    });

    const usersService = new UsersService({
      database: this.database,
      users,
      roles,
      permissions: permissionCache,
      storage: this.storage,
      policy: settings.password,
      paging: settings.pagination.users,
    });

    const rolesService = new RolesService({
      database: this.database,
      roles,
      permissions,
      permissionCache,
    });

    this.permissionService = permissionCache;

    // ---------- middleware ----------
    this.authenticate = new AuthenticateMiddleware({
      users,
      denylist,
      tokens: this.tokens,
    });

    this.authorize = new AuthorizeMiddleware({ permissions: permissionCache });

    this.rateLimiters = new RateLimiterFactory({
      cache: this.cache,
      limits: settings.rateLimit,
    });

    this.upload = new UploadMiddleware({ avatar: settings.upload.avatar });

    this.errorHandler = new ErrorHandler({ exposeStack: settings.app.isDevelopment });

    // ---------- controller ----------
    this.controllers = {
      auth: new AuthController({
        auth,
        passwords,
        permissions: permissionCache,
        queue: this.queue,
        appUrl: settings.app.url,
      }),
      profile: new ProfileController({ profiles }),
      users: new UsersController({ users: usersService }),
      roles: new RolesController({ roles: rolesService }),
      health: new HealthController({ health, environment: settings.app.env }),
    };
  }

  /** Dipanggil server.js dan worker: membuktikan dependensi benar-benar hidup. */
  async connect() {
    await this.database.connect();
    await this.cache.connect();
  }

  /**
   * Ditutup dalam urutan terbalik dari perakitan. Kegagalan satu penutupan
   * tidak boleh menghentikan sisanya — tujuannya melepas sebanyak mungkin
   * sumber daya, bukan menutup dengan sempurna.
   */
  async close() {
    await this.queue.close().catch(() => {});
    await this.cache.close();
    await this.database.close();
  }
}

module.exports = { Container };
