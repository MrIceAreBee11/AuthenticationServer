const { Router } = require('express');

const { healthController } = require('./health.controller');

const router = Router();

router.get('/', healthController.liveness);
router.get('/ready', healthController.readiness);

module.exports = router;
