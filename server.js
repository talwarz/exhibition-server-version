require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("railway")
    ? { rejectUnauthorized: false }
    : false
});

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      mobile TEXT NOT NULL,
      notes TEXT DEFAULT '',
      added_by TEXT NOT NULL,
      date_key TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const countResult = await pool.query("SELECT COUNT(*) FROM users");
  const userCount = Number(countResult.rows[0].count);

  if (userCount === 0) {
    const adminUsername = process.env.ADMIN_USERNAME || "admin";
    const adminPassword = process.env.ADMIN_PASSWORD || "admin@123";

    await createUser(adminUsername, adminPassword, "admin");

    await createUser("user1", "rock@123", "employee");
    for (let i = 2; i <= 10; i++) {
      await createUser(`user${i}`, "hello", "employee");
    }

    console.log("Default users created.");
  }
}

async function createUser(username, password, role = "employee") {
  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)",
    [username, passwordHash, role]
  );
}

async function requireUser(req, res, next) {
  const username = req.headers["x-username"];
  const role = req.headers["x-role"];

  if (!username || !role) {
    return res.status(401).json({ message: "Please login again." });
  }

  req.user = { username, role };
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin only." });
  }
  next();
}

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Username and password required." });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1 AND is_active = true",
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Wrong username or password." });
    }

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      return res.status(401).json({ message: "Wrong username or password." });
    }

    res.json({
      username: user.username,
      role: user.role
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Login failed." });
  }
});

app.get("/api/leads", requireUser, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, mobile, notes, added_by, date_key,
      TO_CHAR(created_at, 'DD/MM/YYYY, HH12:MI:SS AM') AS date_time
      FROM leads
      ORDER BY id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not load data." });
  }
});

app.get("/api/counts", requireUser, async (req, res) => {
  try {
    const total = await pool.query("SELECT COUNT(*) FROM leads");
    const today = await pool.query("SELECT COUNT(*) FROM leads WHERE date_key = $1", [todayKey()]);
    const mine = await pool.query("SELECT COUNT(*) FROM leads WHERE added_by = $1", [req.user.username]);

    res.json({
      total: Number(total.rows[0].count),
      today: Number(today.rows[0].count),
      mine: Number(mine.rows[0].count)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not load counts." });
  }
});

app.post("/api/leads", requireUser, async (req, res) => {
  try {
    const { name, mobile, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Customer name required." });
    }

    if (!/^\d{10}$/.test(String(mobile || ""))) {
      return res.status(400).json({ message: "Mobile number must be exactly 10 digits." });
    }

    await pool.query(
      "INSERT INTO leads (name, mobile, notes, added_by, date_key) VALUES ($1, $2, $3, $4, $5)",
      [name.trim(), mobile, notes || "", req.user.username, todayKey()]
    );

    res.json({ message: "Data saved successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not save data." });
  }
});

app.delete("/api/leads/:id", requireUser, requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM leads WHERE id = $1", [req.params.id]);
    res.json({ message: "Record deleted." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not delete record." });
  }
});

app.delete("/api/leads", requireUser, requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM leads");
    res.json({ message: "All data deleted." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not delete data." });
  }
});

app.get("/api/users", requireUser, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, role, is_active FROM users ORDER BY id ASC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not load users." });
  }
});

app.post("/api/users", requireUser, requireAdmin, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Username and password required." });
    }

    await createUser(username.trim(), password.trim(), "employee");
    res.json({ message: "Employee user created successfully." });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(400).json({ message: "This username already exists." });
    }
    console.error(error);
    res.status(500).json({ message: "Could not create user." });
  }
});

app.get("/api/export", requireUser, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT name, mobile, notes, added_by,
      TO_CHAR(created_at, 'DD/MM/YYYY, HH12:MI:SS AM') AS date_time
      FROM leads
      ORDER BY id DESC
    `);

    let csv = "Customer Name,Mobile Number,Notes,Added By,Date & Time\n";

    result.rows.forEach(row => {
      const values = [
        row.name,
        row.mobile,
        row.notes || "",
        row.added_by,
        row.date_time
      ].map(value => `"${String(value).replace(/"/g, '""')}"`);
      csv += values.join(",") + "\n";
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=exhibition_customer_data.csv");
    res.send(csv);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not export data." });
  }
});

app.get("*", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(error => {
    console.error("Database setup failed:", error);
    process.exit(1);
  });