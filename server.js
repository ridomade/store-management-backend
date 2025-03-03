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

// app.use(express.urlencoded({ extended: true }));

// // Menyajikan gambar secara statis
// app.use("/api/upload", express.static("uploads"), require("./routes/imageRoutes"));

const initializeDatabase = async () => {
    try {
        console.log("🔄 Initializing database...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS account (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_by INT NOT NULL,
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
                CONSTRAINT fk_owner_account_id FOREIGN KEY (account_id) REFERENCES account(id) ON DELETE CASCADE,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS shop (
                id INT AUTO_INCREMENT PRIMARY KEY,
                shop_name VARCHAR(255) NOT NULL,
                created_by INT NOT NULL,
                owner_id INT NOT NULL,
                CONSTRAINT fk_shop_owner_id FOREIGN KEY (owner_id) REFERENCES owner(id) ON DELETE CASCADE,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admin (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                phone VARCHAR(255) NOT NULL,
                account_id INT NOT NULL,
                CONSTRAINT fk_admin_account_id FOREIGN KEY (account_id) REFERENCES account(id) ON DELETE CASCADE,
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
                CONSTRAINT fk_employee_account_id FOREIGN KEY (account_id) REFERENCES account(id) ON DELETE CASCADE,
                CONSTRAINT fk_employee_shop_id FOREIGN KEY (shop_id) REFERENCES shop(id) ON DELETE CASCADE,
                CONSTRAINT fk_employee_owner_id FOREIGN KEY (owner_id) REFERENCES owner(id) ON DELETE CASCADE,
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
                CONSTRAINT fk_product_shop FOREIGN KEY (shop_id) REFERENCES shop(id) ON DELETE CASCADE,
                created_by INT NOT NULL,
                CONSTRAINT fk_product_created_by FOREIGN KEY (created_by) REFERENCES account(id) ON DELETE CASCADE,
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
                CONSTRAINT fk_shop_transaction FOREIGN KEY (shop_id) REFERENCES shop(id) ON DELETE CASCADE,
                account_id INT NOT NULL,
                CONSTRAINT fk_transaction_created_by FOREIGN KEY (created_by) REFERENCES account(id) ON DELETE CASCADE,
                product_id INT NOT NULL,
                CONSTRAINT fk_product FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE,
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

const createIndexes = async () => {
    try {
        console.log("🔄 Checking and Creating Indexes...");

        const checkAndCreateIndex = async (indexName, tableName, createIndexQuery) => {
            const [rows] = await pool.query(`SHOW INDEX FROM ${tableName} WHERE Key_name = ?`, [
                indexName,
            ]);
            if (rows.length === 0) {
                await pool.query(createIndexQuery);
                console.log(`✅ Index ${indexName} created on table ${tableName}`);
            }
        };

        // Index untuk pencarian cepat
        await checkAndCreateIndex(
            "idx_account_email",
            "account",
            `CREATE INDEX idx_account_email ON account(email);`
        );
        await checkAndCreateIndex(
            "idx_owner_phone",
            "owner",
            `CREATE INDEX idx_owner_phone ON owner(phone);`
        );
        await checkAndCreateIndex(
            "idx_employee_phone",
            "employee",
            `CREATE INDEX idx_employee_phone ON employee(phone);`
        );
        await checkAndCreateIndex(
            "idx_transaction_customer_phone",
            "transaction",
            `CREATE INDEX idx_transaction_customer_phone ON transaction(customer_phone);`
        );

        // Index untuk foreign key agar JOIN lebih cepat
        await checkAndCreateIndex(
            "idx_shop_account_id",
            "shop",
            `CREATE INDEX idx_shop_account_id ON shop(created_by);`
        );
        await checkAndCreateIndex(
            "idx_owner_account_id",
            "owner",
            `CREATE INDEX idx_owner_account_id ON owner(account_id);`
        );
        await checkAndCreateIndex(
            "idx_employee_shop_id",
            "employee",
            `CREATE INDEX idx_employee_shop_id ON employee(shop_id);`
        );
        await checkAndCreateIndex(
            "idx_employee_owner_id",
            "employee",
            `CREATE INDEX idx_employee_owner_id ON employee(owner_id);`
        );
        await checkAndCreateIndex(
            "idx_product_shop",
            "product",
            `CREATE INDEX idx_product_shop ON product(shop_id);`
        );
        await checkAndCreateIndex(
            "idx_transaction_shop",
            "transaction",
            `CREATE INDEX idx_transaction_shop ON transaction(shop_id);`
        );
        await checkAndCreateIndex(
            "idx_transaction_product",
            "transaction",
            `CREATE INDEX idx_transaction_product ON transaction(product_id);`
        );

        // Composite index untuk query kombinasi
        await checkAndCreateIndex(
            "idx_account_email_created",
            "account",
            `CREATE INDEX idx_account_email_created ON account(email, created_at);`
        );
        await checkAndCreateIndex(
            "idx_product_name_shop",
            "product",
            `CREATE INDEX idx_product_name_shop ON product(product_name, shop_id);`
        );

        console.log("✅ Indexing process completed!");
    } catch (error) {
        console.error("❌ Error creating indexes:", error);
    }
};

// Start the server only if not in test mode
if (process.env.NODE_ENV !== "test") {
    initializeDatabase().then(() => {
        createIndexes().then(() => {
            app.listen(port, () => {
                console.log(`🚀 Server running on port ${port}`);
            });
        });
    });
}

// Export the app instance for testing purposes
module.exports = app;
