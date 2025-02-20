const pool = require("../config/dbConnection");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const getAllOwnerShops = async (req, res) => {
    const id = req.user.id;
    const accountRole = req.user.role;
    try {
        // kalo admin yang login kasi semua
        if (accountRole === "admin") {
            const [shops] = await pool.query("SELECT * FROM shop");
            res.status(200).json(shops);
        }

        if (accountRole === "employee") {
            return res
                .status(403)
                .json({ message: "Unauthorized: Only owners or admin can access this data" });
        }
        const [shops] = await pool.query("SELECT * FROM shop WHERE account_id = ?", [id]);
        res.status(200).json(shops);
    } catch (error) {
        console.error("Error getting shops:", error);
        res.status(500).json({ error: "Failed to get shops" });
    }
};
const getShopDataById = async (req, res) => {
    const { id } = req.params;
    const { role, id: userId } = req.user; // Ambil role dan user ID dari token

    try {
        // tolak jika employee
        if (role === "employee") {
            return res.status(403).json({
                message: "Unauthorized: Only owners or admins can access this data",
            });
        }

        let query;
        let params;

        // admin bisa ambil mana saja
        if (role === "admin") {
            query = "SELECT * FROM shop WHERE id = ?";
            params = [id];
        } else {
            // owner hanya bisa ambil miliknya sediri
            query = "SELECT * FROM shop WHERE id = ? AND account_id = ?";
            params = [id, userId];
        }

        const [[shop]] = await pool.query(query, params);

        if (!shop) {
            return res.status(404).json({ message: "Shop not found or access denied" });
        }

        res.status(200).json(shop);
    } catch (error) {
        console.error("Error getting shop data:", error);
        res.status(500).json({ error: "Failed to get shop data" });
    }
};

const createShop = async (req, res) => {
    const { shop_name, account_id: providedAccountId } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;
    let account_id; // Variabel untuk menentukan siapa pemilik toko

    try {
        // Hanya owner dan admin yang boleh membuat toko
        if (userRole !== "owner" && userRole !== "admin") {
            return res.status(403).json({
                message: "Unauthorized: Only owners or admins can create shops",
            });
        }

        // Jika user adalah admin, gunakan account_id dari request, jika tidak, gunakan ID user yang login
        if (userRole === "admin") {
            if (!providedAccountId) {
                return res.status(400).json({
                    message: "account_id is required for admin users",
                });
            }
            account_id = providedAccountId;
        } else {
            account_id = userId; // Owner otomatis menjadi pemilik toko
        }

        // Masukkan data toko ke database
        const [newShop] = await pool.query(
            "INSERT INTO shop (shop_name, account_id) VALUES (?, ?)",
            [shop_name, account_id]
        );

        res.status(201).json({
            id: newShop.insertId,
            name: shop_name,
            account_id: account_id,
        });
    } catch (error) {
        console.error("Error creating shop:", error);
        res.status(500).json({ error: "Failed to create shop" });
    }
};
const updateShopData = async (req, res) => {
    const { id } = req.params;
    const { shop_name } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    try {
        // Hanya owner dan admin yang boleh mengupdate toko
        if (userRole !== "owner" && userRole !== "admin") {
            return res.status(403).json({
                message: "Unauthorized: Only owners or admins can update shops",
            });
        }

        // Cek apakah toko yang akan diupdate ada di database
        const [[shop]] = await pool.query("SELECT * FROM shop WHERE id = ?", [id]);

        if (!shop) {
            return res.status(404).json({ message: "Shop not found" });
        }

        // Owner hanya bisa mengupdate toko miliknya sendiri
        if (shop.account_id !== userId && userRole !== "admin") {
            return res.status(403).json({
                message: "Unauthorized: You can only update your own shop",
            });
        }

        // Menyiapkan data yang akan diupdate (hanya update field yang diberikan)
        const updates = [];
        const values = [];

        if (shop_name) {
            updates.push("shop_name = ?");
            values.push(shop_name);
        }

        // Jika tidak ada data yang diberikan untuk update, kirim pesan error
        if (updates.length === 0) {
            return res.status(400).json({ message: "No data provided to update" });
        }

        // Menjalankan query update hanya untuk field yang diberikan
        values.push(id);
        const query = `UPDATE shop SET ${updates.join(", ")} WHERE id = ?`;

        await pool.query(query, values);

        res.status(200).json({ message: "Shop data updated successfully" });
    } catch (error) {
        console.error("Error updating shop data:", error);
        res.status(500).json({ error: "Failed to update shop data" });
    }
};

module.exports = {
    getShopDataById,
    updateShopData,
    getAllOwnerShops,
    createShop,
};
