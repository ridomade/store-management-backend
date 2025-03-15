const request = require("supertest");
const app = require("../server"); // Import aplikasi Express
const pool = require("../config/dbConnection"); // Koneksi database
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

let server;

let ownerToken;
let ownerId;
let ownerAccountId;

let shopId;

let employeeToken;
let employeeId;
let employeeAccountId;

let ownerToken2;
let ownerId2;
let ownerAccountId2;

const adminToken = process.env.ADMIN_KEY;

beforeAll(async () => {
    server = app.listen(4000);

    // Hapus semua data sebelum pengujian dimulai
    await pool.query("DELETE FROM account");
    await pool.query("DELETE FROM owner");
    await pool.query("DELETE FROM shop");
    await pool.query("DELETE FROM admin");

    // Insert akun owner
    const ownerPassword = await bcrypt.hash("ownerpassword", 10);
    const [accountResult] = await pool.query(
        "INSERT INTO account (email, password, created_by) VALUES (?, ?, ?)",
        ["owner@example.com", ownerPassword, 0]
    );
    ownerAccountId = accountResult.insertId;

    const [ownerResult] = await pool.query(
        "INSERT INTO owner (name, phone, account_id) VALUES (?, ?, ?)",
        ["Owner", "0001112222", ownerAccountId]
    );
    ownerId = ownerResult.insertId;

    ownerToken = jwt.sign({ id: ownerId, role: "owner" }, process.env.PRIVATE_KEY, {
        expiresIn: "1h",
    });
    //insert shop baru
    const [shopResult] = await pool.query(
        "INSERT INTO shop (shop_name, created_by, owner_id) VALUES (?, ?, ?)",
        ["shop test", ownerAccountId, ownerId]
    );

    shopId = shopResult.insertId;

    // Insert akun employee
    const employeePassword = await bcrypt.hash("employeepassword", 10);
    const [employeeAccountResult] = await pool.query(
        "INSERT INTO account (email, password, created_by) VALUES (?, ?, ?)",
        ["employee@example.com", employeePassword, 0]
    );
    employeeAccountId = employeeAccountResult.insertId;

    const [employeeResult] = await pool.query(
        "INSERT INTO employee (name, phone, owner_id, shop_id, account_id) VALUES (?, ?, ?, ?, ?)",
        ["Employee", "0001112222", ownerId, shopId, employeeAccountId]
    );
    employeeId = employeeResult.insertId;

    employeeToken = jwt.sign({ id: employeeId, role: "employee" }, process.env.PRIVATE_KEY, {
        expiresIn: "1h",
    });

    // Insert akun owner2
    const ownerPassword2 = await bcrypt.hash("ownerpassword", 10);
    const [accountResult2] = await pool.query(
        "INSERT INTO account (email, password, created_by) VALUES (?, ?, ?)",
        ["owner2@example.com", ownerPassword2, 0]
    );
    ownerAccountId2 = accountResult2.insertId;

    const [ownerResult2] = await pool.query(
        "INSERT INTO owner (name, phone, account_id) VALUES (?, ?, ?)",
        ["Owner", "0001112222", ownerAccountId2]
    );
    ownerId2 = ownerResult2.insertId;

    ownerToken2 = jwt.sign({ id: ownerId, role: "owner" }, process.env.PRIVATE_KEY, {
        expiresIn: "1h",
    });
});

afterAll(async () => {
    await pool.end(); // Tutup koneksi database
    server.close(); // Matikan server setelah pengujian selesai
});

it("❌ it should reject to register account without token ", async () => {
    const response = await request(app).post("/api/account/register").send({
        email: "erroradmin@example.com",
        password: "securepassword",
        name: "test user admin",
        phone: "0001112222",
        role: "admin",
    });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty("message", "Not authorized, no token provided");
});

describe("Account Registration by admin", () => {
    describe("Registrationn with invalid admin token", () => {
        it("❌ it should reject to regist with invalid token", async () => {
            const response = await request(app)
                .post("/api/account/register")
                .set("adminAuth", "invalidAdminToken")
                .send({
                    email: "erroradmin@example.com",
                    password: "securepassword",
                    name: "test user admin",
                    phone: "0001112222",
                    role: "admin",
                });

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty("message", "Not authorized, invalid admin token");
        });
    });

    describe("Registration with valid token", () => {
        it("✅ Should accept register admin account without login using adminAuth", async () => {
            const response = await request(app)
                .post("/api/account/register")
                .set("adminAuth", adminToken) // Menggunakan adminAuth
                .send({
                    email: "testAdmin@example.com",
                    password: "securepassword",
                    name: "test user admin",
                    phone: "0001112222",
                    role: "admin",
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty("message", "Account successfully registered");
        });

        it("✅ Should accept register owner account without login using adminAuth", async () => {
            const response = await request(app)
                .post("/api/account/register")
                .set("adminAuth", adminToken) // Menggunakan adminAuth
                .send({
                    email: "testOwner@example.com",
                    password: "securepassword",
                    name: "test user owner",
                    phone: "0001112222",
                    role: "owner",
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty("message", "Account successfully registered");
        });

        describe("Employee registration", () => {
            it("✅ Should accept register employee account without login using adminAuth", async () => {
                const response = await request(app)
                    .post("/api/account/register")
                    .set("adminAuth", adminToken) // Menggunakan adminAuth
                    .send({
                        email: "testEmployee@example.com",
                        password: "securepassword",
                        name: "test user employee",
                        phone: "0001112222",
                        role: "employee",
                        shop_id: shopId,
                    });

                expect(response.status).toBe(201);
                expect(response.body).toHaveProperty("message", "Account successfully registered");
            });
            it("❌ it should reject employee registration without shop_id field in req body", async () => {
                const response = await request(app)
                    .post("/api/account/register")
                    .set("adminAuth", adminToken) // Menggunakan adminAuth
                    .send({
                        email: "testEmployee2@example.com",
                        password: "securepassword",
                        name: "test user employee",
                        phone: "0001112222",
                        role: "employee",
                    });

                expect(response.status).toBe(400);
                expect(response.body).toHaveProperty("message", "shop_id is required");
            });

            it("❌ it should reject employee registration with invalid shop_id", async () => {
                const response = await request(app)
                    .post("/api/account/register")
                    .set("adminAuth", adminToken) // Menggunakan adminAuth
                    .send({
                        email: "testEmploye3@example.com",
                        password: "securepassword",
                        name: "test user employee",
                        phone: "0001112222",
                        role: "employee",
                        shop_id: 9999,
                    });

                expect(response.status).toBe(404);
                expect(response.body).toHaveProperty("message", "Shop not found");
            });
        });
    });
});

describe("Account Registration by owner", () => {
    describe("Registration with invalid owner token", () => {
        it("❌ it should reject to regist with invalid token", async () => {
            const response = await request(app)
                .post("/api/account/register")
                .set("Authorization", `Bearer invalidtoken`)
                .send({
                    email: "erroradmin@example.com",
                    password: "securepassword",
                    name: "test user admin",
                    phone: "0001112222",
                    role: "admin",
                });

            expect(response.status).toBe(403);
            expect(response.body).toHaveProperty("message", "Invalid or expired token");
        });
    });

    describe("Registration with valid token", () => {
        it("❌ it should reject registration with missing shop_id field", async () => {
            const response = await request(app)
                .post("/api/account/register")
                .set("Authorization", `Bearer ${ownerToken}`)
                .send({
                    email: "erroraddingemnployee@example.com",
                    password: "securepassword",
                    name: "test employee",
                    phone: "0001112222",
                    role: "employee",
                });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty("message", "shop_id is required");
        });
        it("❌ it should reject registration with invalid shop_id", async () => {
            const response = await request(app)
                .post("/api/account/register")
                .set("Authorization", `Bearer ${ownerToken}`)
                .send({
                    email: "erroraddingemnployee@example.com",
                    password: "securepassword",
                    name: "test employee",
                    phone: "0001112222",
                    role: "employee",
                    shop_id: 9999,
                });

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty("message", "Shop not found");
        });
        it("✅ it should convert owner role into employee role", async () => {
            const response = await request(app)
                .post("/api/account/register")
                .set("Authorization", `Bearer ${ownerToken}`)
                .send({
                    email: "errorasssdmin@example.com",
                    password: "securepassword",
                    name: "test user admin",
                    phone: "0001112222",
                    role: "admin",
                    shop_id: shopId,
                });
            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty("role", "employee");
        });
        it("✅ it should convert  admin role into employee role", async () => {
            const response = await request(app)
                .post("/api/account/register")
                .set("Authorization", `Bearer ${ownerToken}`)
                .send({
                    email: "testconvertowner@example.com",
                    password: "securepassword",
                    name: "test user admin",
                    phone: "0001112222",
                    role: "owner",
                    shop_id: shopId,
                });
            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty("role", "employee");
        });
        it("✅ it should successfuly register a new employee ", async () => {
            const response = await request(app)
                .post("/api/account/register")
                .set("Authorization", `Bearer ${ownerToken}`)
                .send({
                    email: "testNewemployee@example.com",
                    password: "securepassword",
                    name: "test user admin",
                    phone: "0001112222",
                    role: "employe",
                    shop_id: shopId,
                });
            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty("role", "employee");
        });
    });
});

describe("Account Registration by employee", () => {
    it("❌ it should reject employee to regist an account ", async () => {
        const response = await request(app)
            .post("/api/account/register")
            .set("Authorization", `Bearer ${employeeToken}`)
            .send({
                email: "employeeAddingNewAccount@example.com",
                password: "securepassword",
                name: "test user admin",
                phone: "0001112222",
                role: "admin",
            });

        expect(response.status).toBe(403);
        expect(response.body).toHaveProperty(
            "message",
            "Unauthorized: Only owners or admin can register new accounts"
        );
    });
});

describe("Account Login", () => {
    it("✅ Should successfully login as owner", async () => {
        const response = await request(app).post("/api/account/login").send({
            email: "owner@example.com",
            password: "ownerpassword",
        });
        ownerToken = response.body.token;

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("message", "Login successful");
        expect(response.body).toHaveProperty("token");
        expect(response.body.data).toHaveProperty("role", "owner");
    });

    it("✅ Should successfully login as employee", async () => {
        const response = await request(app).post("/api/account/login").send({
            email: "employee@example.com",
            password: "employeepassword",
        });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("message", "Login successful");
        expect(response.body).toHaveProperty("token");
        expect(response.body.data).toHaveProperty("role", "employee");
    });

    it("❌ Should fail login with incorrect password", async () => {
        const response = await request(app).post("/api/account/login").send({
            email: "owner@example.com",
            password: "wrongpassword",
        });

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty("message", "Invalid email or password");
    });

    it("❌ Should fail login with unregistered email", async () => {
        const response = await request(app).post("/api/account/login").send({
            email: "notfound@example.com",
            password: "password",
        });

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty("message", "User not found");
    });

    it("❌ Should fail login without email or password", async () => {
        const response = await request(app).post("/api/account/login").send({});

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("message", "Email and password are required");
    });
});

describe("Account Validation", () => {
    it("✅ Should successfully validate token", async () => {
        const response = await request(app)
            .get("/api/account/validate")
            .set("Authorization", `Bearer ${ownerToken}`);

        expect(response.status).toBe(200);
    });

    it("❌ Should fail validation with invalid token", async () => {
        const response = await request(app)
            .get("/api/account/validate")
            .set("Authorization", `Bearer invalidtoken`);

        expect(response.status).toBe(403);
        expect(response.body).toHaveProperty("message", "Invalid or expired token");
    });

    it("❌ Should fail validation without token", async () => {
        const response = await request(app).get("/api/account/validate");

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty("message", "Not authorized, no token provided");
    });
});

describe("Get Account data by ID", () => {
    it("✅ Should successfully get account data by ID", async () => {
        const response = await request(app)
            .get(`/api/account/${ownerAccountId}`)
            .set("Authorization", `Bearer ${ownerToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("id", ownerId);
    });

    it("❌ Should fail get account data with invalid token", async () => {
        const response = await request(app)
            .get(`/api/account/${ownerId}`)
            .set("Authorization", `Bearer invalidtoken`);

        expect(response.status).toBe(403);
        expect(response.body).toHaveProperty("message", "Invalid or expired token");
    });

    it("❌ Should fail get account data with non-existent ID", async () => {
        const response = await request(app).get("/api/account/9999").set("adminAuth", adminToken);

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty("message", "Account not found");
    });
});

// Owner should be able to update their own data
it("✅ Should successfully update owner account data", async () => {
    const response = await request(app)
        .put(`/api/account/update`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
            name: "Updated Owner",
            phone: "1234567890",
        });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("message", "Account updated successfully");
});

//owner should be able to update employee data
it("✅ Should successfully update employee account data", async () => {
    const response = await request(app)
        .put(`/api/account/update`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
            id: employeeAccountId,
            name: "Updated Employee",
            phone: "1234567890",
        });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("message", "Account updated successfully");
});

// employee should be abble to update their own data

it("✅ Should successfully update employee account data", async () => {
    console.log(employeeToken);
    console.log(employeeAccountId);
    const response = await request(app)
        .put(`/api/account/update`)
        .set("Authorization", `Bearer ${employeeToken}`)
        .send({
            name: "Updated Employee2",
            phone: "1234567890",
        });

    console.log(response.body);
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("message", "Account updated successfully");
});

// admin should be able to update any account data

it("✅ Should successfully update employee account data", async () => {
    const response = await request(app)
        .put(`/api/account/update`)
        .set("adminAuth", adminToken)
        .send({
            id: employeeAccountId,
            name: "Updated Employee3",
            phone: "1234567890",
        });
    console.log(response.body);
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("message", "Account updated successfully");
});
