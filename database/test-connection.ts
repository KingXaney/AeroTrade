import { connectToDatabase } from "./mongoose";

async function testConnection() {
  try {
    const conn = await connectToDatabase();
    console.log("Database connection test passed");
    await conn.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("Database connection test failed:", err);
    process.exit(1);
  }
}

testConnection();
