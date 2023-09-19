import controller from '../controllers/controller.js';
import express from 'express';

export const router = express.Router();

router.post('/', [ controller.insertOne ]);
router.get('/:id', [ controller.getOne ]);
router.patch('/:id', [ controller.updateOne ]);
router.delete('/:id', [ controller.deleteOne ]);
