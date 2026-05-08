import mongoose from "mongoose";
import { config } from "dotenv";

config();

const MONGO_URI = process.env.MONGO_URI;

async function testConnection() {
  if (!MONGO_URI) {
    console.error("MONGO_URI is not set in .env");
    process.exit(1);
  }

  console.log("Attempting to connect to MongoDB...");

  try {
    await mongoose.connect(MONGO_URI, { bufferCommands: false });
    console.log("Connection successful!");
    console.log(`  Host: ${mongoose.connection.host}`);
    console.log(`  Database: ${mongoose.connection.name}`);
    console.log(`  State: ${mongoose.connection.readyState === 1 ? "connected" : "not connected"}`);

    // Quick ping to confirm the server responds
    const admin = mongoose.connection.db!.admin();
    const info = await admin.ping();
    console.log(`  Ping: ${info.ok === 1 ? "ok" : "failed"}`);
  } catch (err) {
    console.error("Connection failed:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected.");
  }
}

testConnection();
