const express = require('express');
const router  = express.Router();
const { getAll, getById, create, update, remove } = require('../controllers/template.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);

router.get('/',    getAll);
router.get('/:id', getById);

// Hanya Admin yang bisa kelola template
router.post('/',    authorize('ADMIN'), create);
router.put('/:id',  authorize('ADMIN'), update);
router.delete('/:id', authorize('ADMIN'), remove);

module.exports = router;
