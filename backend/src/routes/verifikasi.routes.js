const express = require('express');
const router = express.Router();
const { verifySurat, previewPDFPublik } = require('../controllers/verifikasi.controller');

// Publik - tidak perlu autentikasi
router.get('/:token', verifySurat);
router.get('/:token/pdf', previewPDFPublik);

module.exports = router;
