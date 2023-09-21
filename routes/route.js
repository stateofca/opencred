import controller from '../controllers/controller.js';
import express from 'express';

export const router = express.Router();

router.get('/login', [ controller.login ]);
router.post('/token', [ controller.exchangeCodeForToken ]);

