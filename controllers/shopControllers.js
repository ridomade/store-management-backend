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
    const { shop_name } = req.body;
    const id = req.user.id;

    try {
        if (req.user.role !== "owner" && req.user.role !== "admin") {
            return res
                .status(403)
                .json({ message: "Unauthorized: Only owners or admin can create shops" });
        }

        const [newShop] = await pool.query(
            "INSERT INTO shop (shop_name, account_id) VALUES (?, ?)",
            [shop_name, id]
        );
        res.status(201).json({
            id: newShop.insertId,
            name: shop_name,
            account_id: id,
        });
    } catch (error) {
        console.error("Error creating shop:", error);
        res.status(500).json({ error: "Failed to create shop" });
    }
};

/**
 * @desc    Update shop data (Accessible to authenticated users)
 * @route   GET /api/shop/update/:id
 * @access  Private (Authenticated users)
 */

const updateShopData = async (req, res) => {
    const { id } = req.params;
    const { email, password, name, phone } = req.body;

    try {
        if (req.user.id !== Number(id) && req.user.role !== "admin") {
            return res.status(403).json({
                message: "Unauthorized: Only admins or the shop itself can update shop data",
            });
        }

        const [[existingUser]] = await pool.query("SELECT * FROM shop WHERE id = ?", [id]);

        if (!existingUser) {
            return res.status(404).json({ message: "Shop not found" });
        }

        const updates = {};
        if (email) {
            const [[emailExists]] = await pool.query(
                "SELECT id FROM shop WHERE email = ? AND id != ?",
                [email, id]
            );
            if (emailExists) {
                return res.status(400).json({ message: "Email is already in use by another shop" });
            }
            updates.email = email;
        }
        if (password) {
            updates.password = await bcrypt.hash(password, 10);
        }
        if (name) updates.name = name;
        if (phone) updates.phone = phone;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: "No data provided for update" });
        }

        const fields = Object.keys(updates)
            .map((field) => `${field} = ?`)
            .join(", ");
        const values = Object.values(updates);
        values.push(id);

        await pool.query(`UPDATE shop SET ${fields} WHERE id = ?`, values);

        const response = {
            message: "Shop data successfully updated",
            id,
            email: updates.email || existingUser.email,
            name: updates.name || existingUser.name,
            phone: updates.phone || existingUser.phone,
            role: existingUser.role,
        };

        res.status(200).json(response);
    } catch (error) {
        console.error("Error updating shop:", error);
        res.status(500).json({ error: "Failed to update shop data" });
    }
};

module.exports = {
    getShopDataById,
    updateShopData,
    getAllOwnerShops,
    createShop,
};
