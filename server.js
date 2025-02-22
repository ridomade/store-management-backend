const express = require("express");
const pool = require("./config/dbConnection");
require("dotenv").config();
const cors = require("cors");
const app = express();

app.use(
    cors({
        origin: "*", // Allow all domains (replace with specific origins if needed)
        methods: ["GET", "POST", "PUT", "DELETE"], // Allowed HTTP methods
        allowedHeaders: ["Content-Type", "Authorization", "adminAuth"], // Allowed headers in requests
    })
);

// Middleware to parse incoming JSON requests
app.use(express.json());

// Define the port number from environment variables or use 5000 as a default
const port = process.env.PORT || 5000;

// // Import and use authentication and employee management routes
app.use("/api/shop", require("./routes/shopRoutes"));
app.use("/api/account", require("./routes/accountRoutes"));

const initializeDatabase = async () => {
    try {
        console.log("🔄 Initializing database...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS account (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_by VARCHAR(255) NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS shop (
                id INT AUTO_INCREMENT PRIMARY KEY,
                shop_name VARCHAR(255) NOT NULL,
                account_id INT NOT NULL,
                CONSTRAINT fk_shop_account_id FOREIGN KEY (account_id) REFERENCES account(id) ON DELETE RESTRICT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS owner (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                phone VARCHAR(255) NOT NULL,
                account_id INT NOT NULL,
                CONSTRAINT fk_owner_account_id FOREIGN KEY (account_id) REFERENCES account(id) ON DELETE RESTRICT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS employee (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                phone VARCHAR(255) NOT NULL,
                owner_id INT NOT NULL,
                shop_id INT NOT NULL,
                account_id INT NOT NULL,
                CONSTRAINT fk_employee_account_id FOREIGN KEY (account_id) REFERENCES account(id) ON DELETE RESTRICT,
                CONSTRAINT fk_employee_shop_id FOREIGN KEY (shop_id) REFERENCES shop(id) ON DELETE RESTRICT,
                CONSTRAINT fk_employee_owner_id FOREIGN KEY (owner_id) REFERENCES owner(id) ON DELETE RESTRICT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS product (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_name VARCHAR(255) NOT NULL,
                product_quantity INT NOT NULL,
                product_price INT NOT NULL,
                shop_id INT NOT NULL,
                CONSTRAINT fk_product_shop FOREIGN KEY (shop_id) REFERENCES shop(id) ON DELETE RESTRICT,
                created_by INT NOT NULL,
                CONSTRAINT fk_product_created_by FOREIGN KEY (created_by) REFERENCES account(id) ON DELETE RESTRICT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS transaction (
                id INT AUTO_INCREMENT PRIMARY KEY,
                customer_phone VARCHAR(255) NOT NULL,
                customer_name VARCHAR(255) NOT NULL,
                customer_product VARCHAR(255) NOT NULL,
                created_by INT NOT NULL,
                total_price INT NOT NULL,
                status ENUM('success', 'failed') NOT NULL,
                shop_id INT NOT NULL,
                CONSTRAINT fk_shop_transaction FOREIGN KEY (shop_id) REFERENCES shop(id) ON DELETE RESTRICT,
                account_id INT NOT NULL,
                CONSTRAINT fk_transaction_created_by FOREIGN KEY (created_by) REFERENCES account(id) ON DELETE RESTRICT,
                product_id INT NOT NULL,
                CONSTRAINT fk_product FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE RESTRICT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("✅ Database initialized successfully!");
    } catch (error) {
        console.error("❌ Error initializing database:", error);
        process.exit(1); // Stop execution if database setup fails
    }
};
// Start the server only if not in test mode
if (process.env.NODE_ENV !== "test") {
    initializeDatabase().then(() => {
        app.listen(port, () => {
            console.log(`🚀 Server running on port ${port}`);
        });
    });
}

// Export the app instance for testing purposes
module.exports = app;
