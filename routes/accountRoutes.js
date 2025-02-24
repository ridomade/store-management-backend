const express = require("express");
const tokenHandler = require("../middleware/tokenHandler");

const requestLimiter = require("../middleware/requestLimiter");
const router = express.Router();

const {
    registerNewAccount,
    loginAccount,
    validateToken,
    updateAccountData,
} = require("../controllers/accountControllers");

router.post("/register", tokenHandler, registerNewAccount);
router.post("/login", requestLimiter, loginAccount);
router.get("/validate", tokenHandler, validateToken);
router.put("/:id", tokenHandler, updateAccountData);
module.exports = router;
