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

const getOwnersEmployee = async (req, res) => {
    try {
        if (req.user.admin || req.user.role === "admin") {
            if (!req.body.account_id) {
                return res.status(400).json({ message: "account_id is required" });
            }
            req.user.id = req.body.account_id;
        }
        if (req.user.role !== "owner" && !req.user.admin && !req.user.role === "admin") {
            return res.status(403).json({ message: "Unauthorized access" });
        }
        const [owner] = await pool.query("SELECT * FROM owner WHERE account_id = ?", [req.user.id]);
        if (owner.length === 0) {
            return res.status(404).json({ message: "Owner not found" });
        }

        const [employees] = await pool.query("SELECT * FROM employee WHERE owner_id = ?", [
            owner[0].id,
        ]);

        if (employees.length === 0) {
            return res.status(200).json({ message: "No employees found", employees: [] });
        }

        const employeeIds = employees.map((emp) => emp.account_id);

        const [employeeAccounts] = await pool.query(`SELECT email FROM account WHERE id IN (?)`, [
            employeeIds,
        ]);

        const employeesWithAccounts = employees.map((emp) => {
            const account = employeeAccounts.find((acc) => acc.account_id === emp.account_id);
            return { ...emp, account };
        });

        res.status(200).json(employeesWithAccounts);
    } catch (error) {
        console.error("Error getting employees:", error);
        res.status(500).json({ error: "Failed to get employees" });
    }
};

const getDataById = async (req, res) => {
    const { id } = req.params;

    try {
        const [account] = await pool.query("SELECT * FROM account WHERE id = ?", [id]);
        if (account.length === 0) {
            return res.status(404).json({ message: "Account not found" });
        }

        const { password, ...accountWithoutPassword } = account[0];

        // Fungsi untuk mengambil data tambahan dari tabel sesuai peran
        const getAdditionalData = async (role, accountId) => {
            if (role === "owner") {
                const [ownerData] = await pool.query("SELECT * FROM owner WHERE account_id = ?", [
                    accountId,
                ]);
                return ownerData[0] || {};
            } else if (role === "employee") {
                const [employeeData] = await pool.query(
                    "SELECT * FROM employee WHERE account_id = ?",
                    [accountId]
                );
                return employeeData[0] || {};
            } else if (role === "admin") {
                const [adminData] = await pool.query("SELECT * FROM admin WHERE account_id = ?", [
                    accountId,
                ]);
                return adminData[0] || {};
            }
            return {};
        };

        // Admin dapat mengakses semua data
        if (req.user.role === "admin") {
            const additionalData = await getAdditionalData("admin", id);
            return res.json({ ...accountWithoutPassword, ...additionalData });
        }

        // Karyawan hanya dapat mengakses datanya sendiri
        if (req.user.role === "employee" && id != req.user.id) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        if (req.user.role === "owner") {
            // Owner bisa akses datanya sendiri
            if (id == req.user.id) {
                const additionalData = await getAdditionalData("owner", id);
                return res.json({ ...accountWithoutPassword, ...additionalData });
            }

            // Ambil id owner dari account_id
            const [owner] = await pool.query("SELECT id FROM owner WHERE account_id = ?", [
                req.user.id,
            ]);

            // Cek apakah akun yang diminta adalah karyawan dari owner
            const [employee] = await pool.query(
                "SELECT * FROM employee WHERE owner_id = ? AND account_id = ?",
                [owner[0]?.id, id]
            );

            if (employee.length === 0) {
                return res.status(403).json({ message: "Unauthorized access" });
            }

            const additionalData = await getAdditionalData("employee", id);
            return res.json({ ...accountWithoutPassword, ...additionalData });
        }

        // Default: Kembalikan data untuk karyawan
        const additionalData = await getAdditionalData("employee", id);
        return res.json({ ...accountWithoutPassword, ...additionalData });
    } catch (error) {
        console.error("Error getting account data:", error);
        res.status(500).json({ error: "Failed to get account data" });
    }
};

const updateAccountData = async (req, res) => {
    const { employee_id, account_id, email, password, name, phone } = req.body;
    const requester_id = req.user.id;
    let connection;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const isOwner = req.user.role === "owner";
        const isAdmin = req.user.role === "admin";

        // Validasi hak akses
        let target_id = requester_id;
        let target_table = req.user.role;

        if (isOwner && employee_id) {
            // Validasi apakah employee milik owner
            const [[owner]] = await connection.query("SELECT id FROM owner WHERE account_id = ?", [
                requester_id,
            ]);

            const [employees] = await connection.query(
                "SELECT id FROM employee WHERE owner_id = ?",
                [owner.id]
            );

            if (!employees.some((item) => item.id === employee_id)) {
                await connection.rollback();
                return res.status(404).json({ message: "Employee not found" });
            }

            target_id = employee_id;
            target_table = "employee";
        } else if (isAdmin && account_id) {
            // Admin dapat memperbarui semua akun
            target_id = account_id;

            // Tentukan tabel berdasarkan akun
            const [[role]] = await connection.query(
                `SELECT 
                    CASE 
                        WHEN EXISTS (SELECT 1 FROM employee WHERE account_id = ?) THEN 'employee'
                        WHEN EXISTS (SELECT 1 FROM admin WHERE account_id = ?) THEN 'admin'
                        WHEN EXISTS (SELECT 1 FROM owner WHERE account_id = ?) THEN 'owner'
                        ELSE NULL 
                    END AS role;`,
                [account_id, account_id, account_id]
            );

            if (!role.role) {
                await connection.rollback();
                return res.status(400).json({ message: "User role not found" });
            }

            target_table = role.role;
        } else if (isOwner && !employee_id) {
            target_table = "owner";
        }

        // Siapkan query update
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

        if (target_table === "employee") {
            const [[employeeAccountId]] = await connection.query(
                "SELECT account_id FROM employee WHERE id = ?",
                [target_id]
            );
            target_id = employeeAccountId.account_id;
        }

        // if (target_table === "owner") {
        //     const [[ownerAccountId]] = await connection.query(
        //         "SELECT account_id FROM owner WHERE id = ?",
        //         [target_id]
        //     );
        //     target_id = ownerAccountId.account_id;
        // }

        // if (target_table === "admin") {
        //     const [[adminAccountId]] = await connection.query(
        //         "SELECT account_id FROM admin WHERE id = ?",
        //         [target_id]
        //     );
        //     target_id = adminAccountId.account_id;
        // }

        // Perbarui tabel account jika ada email atau password

        console.log("target_ID", target_id);
        const accountUpdates = updates.filter((field) =>
            ["email = ?", "password = ?"].includes(field)
        );

        const [[existingUser]] = await pool.query("SELECT id FROM account WHERE email = ?", [
            email,
        ]);
        if (existingUser) {
            return res.status(400).json({ message: "Email is already registered" });
        }
        if (accountUpdates.length > 0) {
            await connection.query(`UPDATE account SET ${accountUpdates.join(", ")} WHERE id = ?`, [
                ...values,
                target_id,
            ]);
        }

        // Perbarui tabel sesuai role jika ada name atau phone
        const roleUpdates = updates.filter((field) => ["name = ?", "phone = ?"].includes(field));

        if (roleUpdates.length > 0) {
            await connection.query(
                `UPDATE ${target_table} SET ${roleUpdates.join(", ")} WHERE account_id = ?`,
                [...values, target_id]
            );
        }

        await connection.commit();

        // Ambil data terbaru
        const [updatedAccount] = await connection.query(
            `SELECT * FROM account 
             JOIN ${target_table} ON account.id = ${target_table}.account_id 
             WHERE account.id = ?`,
            [target_id]
        );

        const { password: pass, ...accountWithoutPassword } = updatedAccount[0];
        res.json({
            message: "Account updated successfully",
            account: accountWithoutPassword,
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Error updating account:", error);
        res.status(500).json({ error: "Failed to update account" });
    } finally {
        if (connection) connection.release();
    }
};

const validateToken = async (req, res) => {
    res.json({ message: "Token is valid" });
};

module.exports = {
    registerNewAccount,
    loginAccount,
    validateToken,
    updateAccountData,
    getDataById,
    getOwnersEmployee,
};
