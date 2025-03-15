const express = require("express");
const tokenHandler = require("../middleware/tokenHandler");
const requestLimiter = require("../middleware/requestLimiter");
const router = express.Router();

const {
    updateShopData,
    getShopDataById,
    getAllShopData,
    createShop,
    // deleteShopAccount,
} = require("../controllers/shopControllers");
const { Route } = require("express");

router.get("/", tokenHandler, getAllShopData);
router.get("/:id", tokenHandler, getShopDataById);
router.put("/:id", tokenHandler, updateShopData);
router.post("/create", tokenHandler, createShop);

module.exports = router;
