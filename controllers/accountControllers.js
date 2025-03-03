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
            data: {
                id: account.id,
                email: account.email,
                name: account.name,
                phone: account.phone,
                role: role,
            },
            token,
        });
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({ error: "An error occurred during login" });
    }
};

const getDataById = async (req, res) => {
    const { id } = req.params;
    try {
        if (id != req.user.id && req.user.role !== "admin" && !req.user.admin) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const [accountData] = await pool.query("SELECT * FROM account WHERE id = ?", [id]);

        if (accountData.length === 0) {
            return res.status(404).json({ message: "Account not found" });
        }
        const [role] = await pool.query(
            `SELECT
            CASE
                WHEN EXISTS (SELECT 1 FROM employee WHERE account_id = ?) THEN 'employee'
                WHEN EXISTS (SELECT 1 FROM admin WHERE account_id = ?) THEN 'admin'
                WHEN EXISTS (SELECT 1 FROM owner WHERE account_id = ?) THEN 'owner'
                ELSE NULL
            END AS role;`,
            [id, id, id]
        );

        const [accountDataRole] = await pool.query(
            `SELECT * FROM ${role[0].role} WHERE account_id = ?`,
            [id]
        );

        const account = [];
        const { password, ...accountWithoutPassword } = accountData[0];
        account.push({ ...accountWithoutPassword, ...accountDataRole[0] });
        res.json(account[0]);
    } catch (error) {
        console.error("Error getting account data:", error);
        res.status(500).json({ error: "Failed to get account data" });
    }
};

const updateAccountData = async (req, res) => {
    const { id } = req.params;
    const { email, password, name, phone } = req.body;
    let connection;

    try {
        if (id != req.user.id && req.user.role !== "admin" && !req.user.admin) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        connection = await pool.getConnection(); // Dapatkan koneksi dari pool
        await connection.beginTransaction(); // Mulai transaksi

        const [account] = await connection.query("SELECT * FROM account WHERE id = ?", [id]);

        if (account.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Account not found" });
        }

        // Ambil peran pengguna berdasarkan ID akun
        const [roleResult] = await connection.query(
            `SELECT 
                CASE 
                    WHEN EXISTS (SELECT 1 FROM employee WHERE account_id = ?) THEN 'employee'
                    WHEN EXISTS (SELECT 1 FROM admin WHERE account_id = ?) THEN 'admin'
                    WHEN EXISTS (SELECT 1 FROM owner WHERE account_id = ?) THEN 'owner'
                    ELSE NULL 
                END AS role;`,
            [id, id, id]
        );

        const userRole = roleResult[0]?.role; // Periksa apakah role ditemukan

        if (!userRole) {
            await connection.rollback();
            return res.status(400).json({ message: "User role not found" });
        }

        // Kumpulkan data yang akan diperbarui
        const updates = [];
        const values = [];

        if (name) {
            updates.push("name = ?");
            values.push(name);
        }
        if (phone) {
            updates.push("phone = ?");
            values.push(phone);
        }
        if (email) {
            updates.push("email = ?");
            values.push(email);
        }
        if (password) {
            updates.push("password = ?");
            values.push(await bcrypt.hash(password, 10));
        }
        if (updates.length === 0) {
            await connection.rollback();
            return res.status(400).json({
                message: "No changes requested",
                fields: ["name", "phone", "email", "password"],
            });
        }

        // Perbarui tabel `account` jika ada perubahan email atau password
        if (email || password) {
            const accountUpdates = updates.filter(
                (field) => field.startsWith("email") || field.startsWith("password")
            );
            if (accountUpdates.length > 0) {
                await connection.query(
                    `UPDATE account SET ${accountUpdates.join(", ")} WHERE id = ?`,
                    [...values, id]
                );
            }
        }

        // Perbarui tabel yang sesuai dengan role pengguna (admin/employee/owner)
        if (name || phone) {
            const roleUpdates = updates.filter(
                (field) => field.startsWith("name") || field.startsWith("phone")
            );
            if (roleUpdates.length > 0) {
                await connection.query(
                    `UPDATE ${userRole} SET ${roleUpdates.join(", ")} WHERE account_id = ?`,
                    [...values, id]
                );
            }
        }

        await connection.commit(); // Commit transaksi jika semua berhasil

        const [updatedAccount] = await connection.query(
            `SELECT * FROM account JOIN ${userRole} ON account.id = ${userRole}.account_id WHERE account.id = ?`,
            [id]
        );
        const { password: pass, ...accountWithoutPassword } = updatedAccount[0];
        res.json({ message: "Account updated successfully", account: accountWithoutPassword });
    } catch (error) {
        if (connection) await connection.rollback(); // Rollback jika ada error
        console.error("Error updating account:", error);
        res.status(500).json({ error: "Failed to update account" });
    } finally {
        if (connection) connection.release(); // Pastikan koneksi dilepaskan
    }
};

const validateToken = async (req, res) => {
    res.json(req.user);
};
module.exports = {
    registerNewAccount,
    loginAccount,
    validateToken,
    updateAccountData,
    getDataById,
};
