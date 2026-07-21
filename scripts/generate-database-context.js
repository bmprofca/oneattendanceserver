import "dotenv/config";
import { generateDatabaseContext } from "../config/generateDatabaseContext.js";

try {
  const context = await generateDatabaseContext();

  console.log(
    `Database context written (${context.table_count} tables) → database-context.json`
  );

  process.exit(0);
} catch (err) {
  console.error("Failed to generate database context:", err.message);
  process.exit(1);
}
