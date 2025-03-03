const express = require("express");
const multer = require("multer");
const path = require("path");
const pool = require("../config/dbConnection");
const router = express.Router();

// Konfigurasi Multer (Simpan ke folder uploads/images)
const storage = multer.diskStorage({
    destination: "./uploads/images",
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Contoh: 1698493457854.jpg
    },
});

const upload = multer({ storage });

// Upload Gambar
router.post("/images", upload.single("image"), async (req, res) => {
    const { name, phone } = req.body;
    const imagePath = `/uploads/images/${req.file.filename}`;

    try {
        await pool.query("INSERT INTO userBookings (name, phone, imagePath) VALUES (?, ?, ?)", [
            name,
            phone,
            imagePath,
        ]);
        res.status(201).json({ message: "Gambar berhasil diunggah!", imagePath });
    } catch (error) {
        console.error("Error saat upload:", error);
        res.status(500).json({ error: "Gagal menyimpan data" });
    }
});

// Ambil Semua Data Booking
router.get("/bookings", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM userBookings");
        res.status(200).json(rows);
    } catch (error) {
        console.error("Error saat mengambil data:", error);
        res.status(500).json({ error: "Gagal mengambil data" });
    }
});

// Ambil Gambar Berdasarkan ID
router.get("/image/:id", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT imagePath FROM userBookings WHERE id = ?", [
            req.params.id,
        ]);
        if (rows.length === 0) return res.status(404).json({ error: "Gambar tidak ditemukan" });
        res.sendFile(path.join(__dirname, "..", rows[0].imagePath));
    } catch (error) {
        console.error("Error saat mengambil gambar:", error);
        res.status(500).json({ error: "Gagal mengambil gambar" });
    }
});

module.exports = router;
