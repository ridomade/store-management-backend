const express = require("express");
const tokenHandler = require("../middleware/tokenHandler");
const requestLimiter = require("../middleware/requestLimiter");
const router = express.Router();

const {
    updateShopData,
    getShopDataById,
    getAllOwnerShops,
    createShop,
    // deleteShopAccount,
} = require("../controllers/shopControllers");

router.get("/", tokenHandler, getAllOwnerShops);
router.get("/:id", tokenHandler, getShopDataById);

router.post("/create", tokenHandler, createShop);

module.exports = router;
