const express = require("express");
const tokenHandler = require("../middleware/tokenHandler");
const registerHandler = require("../middleware/registerHandler");
const requestLimiter = require("../middleware/requestLimiter");
const router = express.Router();

const { registerNewAccount, loginAccount } = require("../controllers/accountControllers");

router.post("/register", registerHandler, registerNewAccount);
router.post("/login", requestLimiter, loginAccount);
module.exports = router;
