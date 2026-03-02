/**
 * MySQL database layer using mysql2 with async/await.
 * Connects to XAMPP MySQL (localhost:3306).
 * The pool auto-creates the database if it doesn't exist.
 */

const mysql = require('mysql2/promise');

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'biolight_monitor';

let _pool = null;

/**
 * Get (or lazily create) the connection pool.
 * On first call, also ensures the database schema exists.
 */
async function getPool() {
  if (_pool) return _pool;

  // First connect WITHOUT selecting a database so we can CREATE it
  const bootstrap = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
  });
  await bootstrap.execute(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
  await bootstrap.end();

  _pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: 'Z',           // store datetimes in UTC
  });

  console.log(`[DB] MySQL pool connected → ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
  return _pool;
}

/**
 * Execute a query that returns rows (SELECT).
 * Returns an array of plain row objects.
 */
async function query(sql, params = []) {
  const pool = await getPool();
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * Execute a mutating query (INSERT / UPDATE / DELETE).
 * Returns the ResultSetHeader (contains insertId, affectedRows, etc.).
 */
async function execute(sql, params = []) {
  const pool = await getPool();
  const [result] = await pool.execute(sql, params);
  return result;
}

module.exports = { getPool, query, execute };
