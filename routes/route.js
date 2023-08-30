const express = require("express");
const router = express.Router();
const controller = require("../controllers/controller");


router.post("/", [ controller.insertOne]);
router.get("/:id", [ controller.getOne]);
router.patch("/:id", [ controller.updateOne]);
router.delete("/:id", [ controller.deleteOne]);

module.exports = router;