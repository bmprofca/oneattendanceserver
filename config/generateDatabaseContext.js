import fs from "fs/promises";
import path from "path";
import db from "./db.js";
import { DB_NAME } from "./config.js";

const OUTPUT_FILE = path.join(
  process.cwd(),
  "database-context.json"
);

const buildTablesMap = (
  tables,
  columns,
  foreignKeys,
  indexes
) => {
  const result = {};

  for (const table of tables) {
    const tableName = table.TABLE_NAME;

    result[tableName] = {
      type: table.TABLE_TYPE,
      engine: table.ENGINE,
      estimated_rows: table.TABLE_ROWS,
      comment: table.TABLE_COMMENT || null,
      columns: [],
      primary_key: [],
      foreign_keys: [],
      indexes: []
    };
  }

  for (const column of columns) {
    const table = result[column.TABLE_NAME];

    if (!table) {
      continue;
    }

    const columnDef = {
      name: column.COLUMN_NAME,
      position: column.ORDINAL_POSITION,
      data_type: column.DATA_TYPE,
      column_type: column.COLUMN_TYPE,
      nullable: column.IS_NULLABLE === "YES",
      default: column.COLUMN_DEFAULT,
      key: column.COLUMN_KEY || null,
      extra: column.EXTRA || null,
      comment: column.COLUMN_COMMENT || null
    };

    table.columns.push(columnDef);

    if (column.COLUMN_KEY === "PRI") {
      table.primary_key.push(column.COLUMN_NAME);
    }
  }

  for (const fk of foreignKeys) {
    const table = result[fk.TABLE_NAME];

    if (!table) {
      continue;
    }

    table.foreign_keys.push({
      constraint: fk.CONSTRAINT_NAME,
      column: fk.COLUMN_NAME,
      references: {
        table: fk.REFERENCED_TABLE_NAME,
        column: fk.REFERENCED_COLUMN_NAME
      }
    });
  }

  const indexMap = new Map();

  for (const index of indexes) {
    const key = `${index.TABLE_NAME}:${index.INDEX_NAME}`;
    let entry = indexMap.get(key);

    if (!entry) {
      entry = {
        table: index.TABLE_NAME,
        name: index.INDEX_NAME,
        unique: index.NON_UNIQUE === 0,
        columns: []
      };

      indexMap.set(key, entry);
    }

    entry.columns.push(index.COLUMN_NAME);
  }

  for (const entry of indexMap.values()) {
    const table = result[entry.table];

    if (!table) {
      continue;
    }

    table.indexes.push({
      name: entry.name,
      unique: entry.unique,
      columns: entry.columns
    });
  }

  return result;
};

export const generateDatabaseContext = async () => {
  const database = DB_NAME;

  if (!database) {
    throw new Error("DB_NAME is not set");
  }

  const [tables] = await db.query(
    `
    SELECT
      TABLE_NAME,
      TABLE_TYPE,
      ENGINE,
      TABLE_ROWS,
      TABLE_COMMENT
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = ?
    ORDER BY TABLE_NAME
    `,
    [database]
  );

  const [columns] = await db.query(
    `
    SELECT
      TABLE_NAME,
      COLUMN_NAME,
      ORDINAL_POSITION,
      COLUMN_DEFAULT,
      IS_NULLABLE,
      DATA_TYPE,
      COLUMN_TYPE,
      COLUMN_KEY,
      EXTRA,
      COLUMN_COMMENT
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ?
    ORDER BY TABLE_NAME, ORDINAL_POSITION
    `,
    [database]
  );

  const [foreignKeys] = await db.query(
    `
    SELECT
      TABLE_NAME,
      COLUMN_NAME,
      CONSTRAINT_NAME,
      REFERENCED_TABLE_NAME,
      REFERENCED_COLUMN_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = ?
      AND REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION
    `,
    [database]
  );

  const [indexes] = await db.query(
    `
    SELECT
      TABLE_NAME,
      INDEX_NAME,
      NON_UNIQUE,
      SEQ_IN_INDEX,
      COLUMN_NAME
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = ?
    ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
    `,
    [database]
  );

  const tablesMap = buildTablesMap(
    tables,
    columns,
    foreignKeys,
    indexes
  );

  const context = {
    generated_at: new Date().toISOString(),
    database,
    table_count: tables.length,
    tables: tablesMap
  };

  await fs.writeFile(
    OUTPUT_FILE,
    JSON.stringify(context, null, 2),
    "utf8"
  );

  return context;
};

export const loadDatabaseContext = async () => {
  try {
    const raw = await fs.readFile(OUTPUT_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const DATABASE_CONTEXT_FILE = OUTPUT_FILE;
