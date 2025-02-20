const jwt = require("jsonwebtoken");
require("dotenv").config();

const registerHandler = (req, res, next) => {
    try {
        const authHeaderAdmin = req.header("adminAuth"); // Header khusus admin
        const authHeader = req.headers.authorization || req.headers.Authorization;

        // Jika tidak ada token sama sekali, tolak akses
        if (!authHeader && !authHeaderAdmin) {
            return res.status(401).json({ message: "Not authorized, no token provided" });
        }

        // Jika ada admin token, validasi dulu
        if (authHeaderAdmin) {
            if (authHeaderAdmin !== process.env.ADMIN_KEY) {
                return res.status(401).json({ message: "Not authorized, invalid admin token" });
            }
            req.user = { admin: true }; // Pastikan req.user ada
            return next();
        }

        // Jika ada token user, validasi JWT
        if (authHeader && authHeader.startsWith("Bearer ")) {
            try {
                const token = authHeader.split(" ")[1]; // Ambil token setelah "Bearer"
                const decoded = jwt.verify(token, process.env.PRIVATE_KEY);
                req.user = decoded; // Set user berdasarkan token
                req.user.admin = false; // Pastikan admin=false jika bukan admin
                return next();
            } catch (error) {
                return res.status(403).json({ message: "Invalid or expired token" });
            }
        }

        // Jika tidak memenuhi kondisi di atas, tolak akses
        return res.status(401).json({ message: "Not authorized" });
    } catch (error) {
        console.error("Authorization error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = registerHandler;
