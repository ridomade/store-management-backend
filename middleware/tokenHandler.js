const jwt = require("jsonwebtoken");
require("dotenv").config();

const tokenHandler = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization; // Header standar token

        // **Cek jika authorization token tersedia**
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ message: "Not authorized, no token provided" });
        }

        // **Extract token**
        const token = authHeader.split(" ")[1];

        // **Verifikasi token**
        const decoded = jwt.verify(token, process.env.PRIVATE_KEY);
        if (!decoded) {
            return res.status(401).json({ message: "Unauthorized: Invalid token data" });
        }

        req.user = decoded; // Simpan data user di req

        next();
    } catch (error) {
        console.error("Token verification failed:", error);
        return res.status(401).json({ message: "Not authorized, invalid token" });
    }
};

module.exports = tokenHandler;
