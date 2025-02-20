const rateLimit = require("express-rate-limit");

const requestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 5, // Maksimal 5 percobaan dalam 15 menit
    message: {
        status: 429, // HTTP 429 Too Many Requests
        message: "Terlalu banyak percobaan, coba lagi dalam 15 menit.",
    },
    keyGenerator: (req) => req.ip, // Gunakan IP sebagai identitas rate limit
    standardHeaders: true, // Mengirimkan informasi rate limit di header
    legacyHeaders: false, // Tidak menggunakan X-RateLimit-* headers (deprecated)
});

module.exports = requestLimiter;
