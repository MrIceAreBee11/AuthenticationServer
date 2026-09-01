const { Router } = require('express');

const { checkHealth, checkReadiness } = require('./health.controller');

const router = Router();

router.get('/', checkHealth);
router.get('/ready', checkReadiness);

module.exports = router;