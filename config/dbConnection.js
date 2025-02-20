// Import MySQL2 with promise support to enable async/await usage
const mysql = require("mysql2/promise");

// Import dotenv to load environment variables from .env file
require("dotenv").config();

/**
 * @desc    Create a connection pool to the MySQL database
 *          - Uses environment variables for database credentials
 *          - Enables connection pooling for efficient database usage
 */
const pool = mysql.createPool({
    host: process.env.DB_HOST, // Database host (e.g., localhost, 127.0.0.1, or a remote server)
    user: process.env.DB_USER, // Database username
    password: process.env.DB_PASSWORD, // Database password
    database: process.env.DB_NAME, // Database name
    waitForConnections: true, // Determines whether connection requests should wait if the pool is full
    connectionLimit: 10, // Maximum number of concurrent connections in the pool
    queueLimit: 0, // Maximum number of connection requests in the queue (0 means unlimited)
});

/**
 * @desc    Test database connection (optional)
 *          - Ensures the database connection is established correctly
 *          - Prints a success or error message
 */
const testConnection = async () => {
    try {
        const connection = await pool.getConnection();
        console.log("✅ Database connection successful!");
        connection.release(); // Release the connection back to the pool
    } catch (error) {
        console.error("❌ Database connection failed:", error);
    }
};

// Call testConnection only in non-test environments
if (process.env.NODE_ENV !== "test") {
    testConnection();
}

// Export the connection pool to be used in other parts of the project
module.exports = pool;
