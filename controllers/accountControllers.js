const pool = require("../config/dbConnection");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const registerNewAccount = async (req, res) => {
    const { email, password, name, phone } = req.body;
    let role = req.body.role ? req.body.role.trim().toLowerCase() : "employee";
    let created_by = 0;
    let owner_id, shop_id;

    try {
        if (req.user.role === "employee") {
            return res.status(403).json({
                message: "Unauthorized: Only owners or admin can register new accounts",
            });
        }
        if (!email || !password || !name || !phone) {
            return res
                .status(400)
                .json({ message: "All fields are required: email, password, name, phone" });
        }

        const validRoles = ["owner", "employee", "admin"];
        if (!req.user.admin) {
            created_by = req.user.id;
            role = "employee";
        }
        if (!validRoles.includes(role)) {
            return res.status(400).json({ message: "Invalid role" });
        }

        const [[existingUser]] = await pool.query("SELECT id FROM account WHERE email = ?", [
            email,
        ]);
        if (existingUser) {
            return res.status(400).json({ message: "Email is already registered" });
        }

        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const [accountResult] = await connection.query(
                "INSERT INTO account (email, password, created_by) VALUES (?, ?, ?)",
                [email, hashedPassword, created_by]
            );

            const accountId = accountResult.insertId;
            const tableInsert = role;

            if (tableInsert === "admin" || tableInsert === "owner") {
                await connection.query(
                    `INSERT INTO ${tableInsert} (name, phone, account_id) VALUES (?, ?, ?)`,
                    [name, phone, accountId]
                );
                await connection.commit();
                connection.release();
                return res
                    .status(201)
                    .json({ message: "Account successfully registered", email, name, phone, role });
            }

            if (!req.body.shop_id) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ message: "shop_id is required" });
            }

            shop_id = req.body.shop_id;

            if (req.user.role === "owner") {
                const [shop] = await connection.query(
                    "SELECT * FROM shop WHERE id = ? AND owner_id = ?",
                    [shop_id, req.user.id]
                );
                if (shop.length === 0) {
                    await connection.rollback();
                    connection.release();
                    return res.status(404).json({ message: "Shop not found" });
                }
                await connection.query(
                    `INSERT INTO employee (name, phone, account_id, owner_id, shop_id) VALUES (?, ?, ?, ?, ?)`,
                    [name, phone, accountId, req.user.id, shop_id]
                );
            } else if (req.user.role === "admin" || req.user.admin) {
                const [shop] = await connection.query("SELECT * FROM shop WHERE id = ?", [shop_id]);
                if (shop.length === 0) {
                    await connection.rollback();
                    connection.release();
                    return res.status(404).json({ message: "Shop not found" });
                }
                owner_id = shop[0].owner_id;
                await connection.query(
                    `INSERT INTO employee (name, phone, account_id, owner_id, shop_id) VALUES (?, ?, ?, ?, ?)`,
                    [name, phone, accountId, owner_id, shop_id]
                );
            }

            await connection.commit();
            connection.release();
            res.status(201).json({
                message: "Account successfully registered",
                email,
                name,
                phone,
                role,
                shop_id,
            });
        } catch (err) {
            await connection.rollback(); // **Rollback sebelum release**
            connection.release();
            console.error("Error during transaction:", err);
            res.status(500).json({ error: "Failed to register account" });
        }
    } catch (error) {
        console.error("Error registering employee:", error);
        res.status(500).json({ error: "Failed to register employee" });
    }
};

const loginAccount = async (req, res) => {
    const { email, password } = req.body;

    try {
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        // Find the owner by email
        const [user] = await pool.query("SELECT * FROM account WHERE email = ?", [email]);

        if (user.length === 0) {
            return res.status(401).json({ message: "User not found" });
        }
        const account = user[0];

        // Verify the password
        const isMatch = await bcrypt.compare(password, account.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const [rows] = await pool.query(
            `SELECT
                CASE
                    WHEN EXISTS (SELECT 1 FROM employee WHERE account_id = ?) THEN 'employee'
                    WHEN EXISTS (SELECT 1 FROM admin WHERE account_id = ?) THEN 'admin'
                    WHEN EXISTS (SELECT 1 FROM owner WHERE account_id = ?) THEN 'owner'
                    ELSE NULL
                END AS role;`,
            [account.id, account.id, account.id]
        );

        if (!rows[0].role) {
            return res.status(404).json({ message: "Account not found" });
        }

        role = rows[0].role;

        // Generate a JWT token
        const token = jwt.sign({ id: account.id, role: role }, process.env.PRIVATE_KEY, {
            expiresIn: "1h",
        });

        res.json({
            message: "Login successful",
            owner: {
                id: account.id,
                email: account.email,
                name: account.name,
                phone: account.phone,
                role: account.role,
            },
            token,
        });
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({ error: "An error occurred during login" });
    }
};

const updateAccountData = async (req, res) => {
    const { id } = req.params;
    const { name, phone } = req.body;
    const role = req.user.role;
    const userId = req.user.id;
    try {
        let query;
        let params;

        // admin bisa update semua
        if (role === "admin") {
            const [rows] = await pool.query(
                `SELECT 
                    CASE 
                        WHEN EXISTS (SELECT 1 FROM employee WHERE account_id = ?) THEN 'employee'
                        WHEN EXISTS (SELECT 1 FROM admin WHERE account_id = ?) THEN 'admin'
                        WHEN EXISTS (SELECT 1 FROM owner WHERE account_id = ?) THEN 'owner'
                        ELSE NULL
                    END AS tableUpdate;`,
                [id, id, id]
            );

            if (!rows[0].tableUpdate) {
                return res.status(404).json({ message: "Account not found" });
            }

            const tableUpdate = rows[0].tableUpdate;
            query = `UPDATE ${tableUpdate} SET name = ?, phone = ? WHERE account_id = ?`;
            params = [name, phone, id];

            // owner hanya bisa update miliknya sendiri
        } else if (role === "owner") {
            query = "UPDATE owner SET name = ?, phone = ? WHERE account_id = ? AND account_id = ?";
            params = [name, phone, id, userId];
        } else {
            query =
                "UPDATE employee SET name = ?, phone = ? WHERE account_id = ? AND account_id = ?";
            params = [name, phone, id, userId];
        }

        const [result] = await pool.query(query, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Account not found or access denied" });
        }

        res.status(200).json({ message: "Account updated successfully" });
    } catch (error) {
        console.error("Error updating account:", error);
        res.status(500).json({ error: "Failed to update account" });
    }
};
const validateToken = async (req, res) => {
    res.json(req.user);
};
module.exports = { registerNewAccount, loginAccount, validateToken, updateAccountData };
