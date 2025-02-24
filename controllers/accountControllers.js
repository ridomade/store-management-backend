const pool = require("../config/dbConnection");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const registerNewAccount = async (req, res) => {
    const { email, password, name, phone } = req.body;
    let role = req.body.role ? req.body.role.trim().toLowerCase() : "employee"; // Default ke 'employee'
    let created_by = 0; // 0 Means admin
    try {
        if (!email || !password || !name || !phone) {
            return res
                .status(400)
                .json({ message: "All fields are required: email, password, name, phone" });
        }

        const validRoles = ["owner", "employee", "admin"];

        if (!req.user.admin) {
            created_by = req.user.id;
            role = "employee"; // Paksa menjadi 'employee' jika bukan admin
        }

        if (!validRoles.includes(role)) {
            return res.status(400).json({ message: "Invalid role" });
        }

        // Cek apakah email sudah ada
        const [[existingUser]] = await pool.query("SELECT id FROM account WHERE email = ?", [
            email,
        ]);
        if (existingUser) {
            return res.status(400).json({ message: "Email is already registered" });
        }

        // Mulai transaksi
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // Hash password dan insert ke akun
            const hashedPassword = await bcrypt.hash(password, 10);
            const [accountResult] = await connection.query(
                "INSERT INTO account (email, password,created_by) VALUES (?, ?,?)",
                [email, hashedPassword, created_by]
            );

            // Dapatkan ID akun yang baru saja dibuat
            const accountId = accountResult.insertId;
            const tableInsert = role;
            // Insert data ke tabel owner/employee
            await connection.query(
                `INSERT INTO ${tableInsert} (name, phone, account_id) VALUES (?, ?, ?)`,
                [name, phone, accountId]
            );

            // Commit transaksi
            await connection.commit();
            connection.release();

            res.status(201).json({
                message: "Employee successfully registered",
                email,
                name,
                phone,
                role,
            });
        } catch (err) {
            // Rollback jika ada error dalam transaksi
            await connection.rollback();
            connection.release();
            throw err;
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

        // Generate a JWT token
        const token = jwt.sign({ id: account.id, role: account.role }, process.env.PRIVATE_KEY, {
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
    const { email, password, name, phone } = req.body;

    try {
        if (req.user.id !== Number(id) && req.user.role !== "admin") {
            return res.status(403).json({
                message: "Unauthorized: Only admins or the account itself can update account data",
            });
        }

        const [[existingUser]] = await pool.query("SELECT * FROM account WHERE id = ?", [id]);

        if (!existingUser) {
            return res.status(404).json({ message: "Account not found" });
        }

        const updates = {};
        if (email) {
            const [[emailExists]] = await pool.query(
                "SELECT id FROM account WHERE email = ? AND id != ?",
                [email, id]
            );
            if (emailExists) {
                return res
                    .status(400)
                    .json({ message: "Email is already in use by another account" });
            }
            updates.email = email;
        }
        if (password) {
            updates.password = await bcrypt.hash(password, 10);
        }
        if (name) updates.name = name;
        if (phone) updates.phone = phone;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: "No changes submitted" });
        }

        await pool.query("UPDATE account SET ? WHERE id = ?", [updates, id]);

        res.json({ message: "Account data updated successfully" });
    } catch (error) {
        console.error("Error updating account data:", error);
        res.status(500).json({ error: "Failed to update account data" });
    }
};
const validateToken = async (req, res) => {
    res.json(req.user);
};
module.exports = { registerNewAccount, loginAccount, validateToken, updateAccountData };
