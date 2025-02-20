const pool = require("../config/dbConnection");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const registerNewAccount = async (req, res) => {
    const { email, password, name, phone } = req.body;
    let role = req.body.role ? req.body.role.trim().toLowerCase() : "employee"; // Default ke 'employee' jika kosong

    try {
        // Validasi input: Pastikan semua field yang diperlukan diisi
        if (!email || !password || !name || !phone) {
            return res.status(400).json({
                message: "All fields are required: email, password, name, phone",
            });
        }

        // Role yang diperbolehkan
        const validRoles = ["owner", "employee", "admin"];

        // Jika req.admin = false, role HARUS menjadi employee
        if (!req.user.admin) {
            role = "employee"; // Paksa role menjadi 'employee'
        }

        // Validasi role: Hanya boleh 'owner', 'employee', atau 'admin'
        if (!validRoles.includes(role)) {
            return res.status(400).json({ message: "Invalid role" });
        }

        // Cek apakah email sudah terdaftar
        const [[existingUser]] = await pool.query("SELECT id FROM account WHERE email = ?", [
            email,
        ]);

        if (existingUser) {
            return res.status(400).json({ message: "Email is already registered" });
        }

        // Hash password sebelum menyimpannya ke database
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user ke database
        const [result] = await pool.query(
            "INSERT INTO account (email, password, name, phone, role) VALUES (?, ?, ?, ?, ?)",
            [email, hashedPassword, name, phone, role]
        );

        res.status(201).json({
            message: "Employee successfully registered",
            employeeId: result.insertId,
            email,
            name,
            phone,
            role,
        });
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

module.exports = { registerNewAccount, loginAccount };
