import express from 'express';
import controller from '../controllers/controller.js';

const router = express.Router();

router.post("/", [ controller.insertOne]);
router.get("/:id", [ controller.getOne]);
router.patch("/:id", [ controller.updateOne]);
router.delete("/:id", [ controller.deleteOne]);

export { router };
