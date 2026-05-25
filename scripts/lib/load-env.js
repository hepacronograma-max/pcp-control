/**
 * Carrega .env e .env.local (override).
 */
const path = require("path");

function loadEnv() {
  require("dotenv").config();
  require("dotenv").config({
    path: path.join(__dirname, "..", "..", ".env.local"),
    override: true,
  });
}

module.exports = { loadEnv };
