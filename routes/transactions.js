import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import {
  sendSuccess,
  sendError,
  safeNumber,
  sanitizeText,
  buildMeta,
} from "../utils/sendResponse.js";
import {
  getCurrentDate,
  isDateAfter,
  isDateBefore,
  parseDate,
  formatIST,
} from "../utils/time.js";
import { generateTransactionId } from "../utils/auth.js";
import { buildFileUrl } from "../utils/fileService.js";

const router = express.Router();

// Local adapters to keep existing calls unchanged
const isValidDate = (value) => parseDate(value) !== null;
const formatToDate = (value) => formatIST(value, "YYYY-MM-DD");
const toISTString = (value) => formatIST(value); // default format "YYYY-MM-DD HH:mm:ss"

const LEDGER_MAX_LIMIT = Math.max(1, 100);

const hasQueryValue = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const resolveLedgerUserRoles = async (conn, companyId, userIds = []) => {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const roleMap = new Map();

  if (!uniqueIds.length) {
    return roleMap;
  }

  const [[company]] = await conn.query(
    `SELECT owner_user_id FROM companies WHERE id = ? LIMIT 1`,
    [companyId]
  );

  const ownerUserId = safeNumber(company?.owner_user_id, 0);
  const [employeeRows] = await conn.query(
    `
    SELECT user_id
    FROM employees
    WHERE company_id = ?
      AND user_id IN (?)
      AND is_deleted = 0
    `,
    [companyId, uniqueIds]
  );

  const employeeUserIds = new Set(
    employeeRows.map((row) => safeNumber(row.user_id, 0))
  );

  for (const userId of uniqueIds) {
    if (userId === ownerUserId) {
      roleMap.set(userId, "admin");
    } else if (employeeUserIds.has(userId)) {
      roleMap.set(userId, "employee");
    } else {
      roleMap.set(userId, "admin");
    }
  }

  return roleMap;
};

const mapLedgerActor = (userId, name, email, phone, roleMap) => {
  const id = safeNumber(userId, 0);
  if (!id) {
    return null;
  }

  return {
    id,
    name: name || null,
    email: email || null,
    phone: phone || null,
    role: roleMap.get(id) || "admin",
  };
};

router.post("/add", auth(), async (req, res) => {
  let conn;
  try {
    const companyId = safeNumber(req.company?.id);
    const userId = safeNumber(req.user?.id);
    if (!companyId || !userId) {
      return sendError(res, 401, "Unauthorized access");
    }
    const {
      employee_id,
      transaction_type,
      amount,
      transaction_date,
      remark,
      employee_account,
      company_account,
    } = req.body;

    const ALLOWED_TRANSACTION_TYPES = Object.freeze([
      "payment",
      "receive",
      "opening_balance",
      "fine",
      "bonus",
    ]);

    const ENTRY_TYPE_MAP = Object.freeze({
      bonus: "credit",
      receive: "credit",
      payment: "debit",
      fine: "debit",
    });
    const DUPLICATE_CHECK_TYPES = Object.freeze(["opening_balance"]);
    const employeeId = safeNumber(employee_id);
    if (!employeeId || employeeId <= 0) {
      return sendError(res, 400, "Valid employee_id is required");
    }
    if (!transaction_type || typeof transaction_type !== "string") {
      return sendError(res, 400, "transaction_type is required");
    }
    if (!ALLOWED_TRANSACTION_TYPES.includes(transaction_type)) {
      return sendError(
        res,
        400,
        `Invalid transaction_type. Allowed values: ${ALLOWED_TRANSACTION_TYPES.join(
          ", "
        )}`
      );
    }
    const numAmount = safeNumber(amount);
    if (!numAmount || numAmount <= 0) {
      return sendError(res, 400, "Amount must be greater than 0");
    }
    if (!isValidDate(transaction_date)) {
      return sendError(
        res,
        400,
        "Invalid transaction_date format. Expected YYYY-MM-DD"
      );
    }
    let finalEntryType = null;
    if (transaction_type === "opening_balance") {
      const openingBalanceType = req.body?.entry_type;
      if (openingBalanceType !== "credit" && openingBalanceType !== "debit") {
        return sendError(
          res,
          400,
          "entry_type is required for opening_balance and must be debit or credit"
        );
      }
      finalEntryType = openingBalanceType;
    } else {
      finalEntryType = ENTRY_TYPE_MAP[transaction_type];
      if (!finalEntryType) {
        return sendError(
          res,
          400,
          `Unable to resolve entry_type for ${transaction_type}`
        );
      }
    }
    conn = await db.getConnection();
    await conn.beginTransaction();
    const [[company]] = await conn.query(
      `
      SELECT
        id,
        is_active,
        is_deleted
      FROM companies
      WHERE id = ?
      LIMIT 1
      `,
      [companyId]
    );
    if (!company || company.is_deleted === 1) {
      await conn.rollback();
      return sendError(res, 404, "Company not found");
    }
    if (company.is_active !== 1) {
      await conn.rollback();
      return sendError(res, 400, "Company is inactive");
    }
    const [[employee]] = await conn.query(
      `
      SELECT
        e.id,
        e.company_id,
        e.user_id,
        e.status,
        e.is_active,
        e.is_deleted,
        u.name AS employee_name
      FROM employees e
      INNER JOIN users u
        ON u.id = e.user_id
      WHERE e.id = ?
        AND e.company_id = ?
      LIMIT 1
      `,
      [employeeId, companyId]
    );
    if (!employee || employee.is_deleted === 1) {
      await conn.rollback();
      return sendError(res, 404, "Employee not found");
    }
    if (employee.is_active !== 1 || employee.status !== "active") {
      await conn.rollback();
      return sendError(res, 400, "Employee is inactive");
    }
    if (DUPLICATE_CHECK_TYPES.includes(transaction_type)) {
      const [[existingOpeningBalance]] = await conn.query(
        `
        SELECT id
        FROM transactions
        WHERE company_id = ?
          AND employee_id = ?
          AND transaction_type = 'opening_balance'
        LIMIT 1
        `,
        [companyId, employeeId]
      );
      if (existingOpeningBalance) {
        await conn.rollback();
        return sendError(
          res,
          409,
          "Opening balance already exists for this employee"
        );
      }
    }
    let resolvedEmployeeAccount = null;
    if (employee_account !== undefined && employee_account !== null) {
      const employeeAccountId = safeNumber(employee_account);
      if (!employeeAccountId || employeeAccountId <= 0) {
        await conn.rollback();
        return sendError(res, 400, "Invalid employee_account");
      }
      const [[employeeBankAccount]] = await conn.query(
        `
        SELECT
          id
        FROM bank_accounts
        WHERE id = ?
          AND company_id = ?
          AND employee_id = ?
          AND is_deleted = 0
          AND is_active = 1
          AND status = 'active'
        LIMIT 1
        `,
        [employeeAccountId, companyId, employeeId]
      );
      if (!employeeBankAccount) {
        await conn.rollback();
        return sendError(
          res,
          400,
          "Employee bank account not found or inactive"
        );
      }
      resolvedEmployeeAccount = employeeAccountId;
    }
    let resolvedCompanyAccount = null;
    if (company_account !== undefined && company_account !== null) {
      const companyAccountId = safeNumber(company_account);
      if (!companyAccountId || companyAccountId <= 0) {
        await conn.rollback();
        return sendError(res, 400, "Invalid company_account");
      }
      const [[companyBankAccount]] = await conn.query(
        `
        SELECT
          id
        FROM bank_accounts
        WHERE id = ?
          AND company_id = ?
          AND employee_id IS NULL
          AND is_deleted = 0
          AND is_active = 1
          AND status = 'active'
        LIMIT 1
        `,
        [companyAccountId, companyId]
      );
      if (!companyBankAccount) {
        await conn.rollback();
        return sendError(
          res,
          400,
          "Company bank account not found or inactive"
        );
      }
      resolvedCompanyAccount = companyAccountId;
    }
    const transactionId = generateTransactionId();
    const [insertResult] = await conn.query(
      `
      INSERT INTO transactions (
        transaction_id,
        create_by,
        amount,
        employee_id,
        employee_account,
        company_id,
        company_account,
        transaction_date,
        transaction_type,
        entry_type,
        remark
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        transactionId,
        userId,
        Number(numAmount.toFixed(2)),
        employeeId,
        resolvedEmployeeAccount,
        companyId,
        resolvedCompanyAccount,
        transaction_date,
        transaction_type,
        finalEntryType,
        sanitizeText(remark, 3000),
      ]
    );
    const [[createdTransaction]] = await conn.query(
      `
      SELECT
        t.id,
        t.transaction_id,
        t.company_id,
        t.employee_id,
        u.name AS employee_name,
        t.employee_account,
        t.company_account,
        t.transaction_type,
        t.entry_type,
        t.amount,
        t.transaction_date,
        t.remark,
        t.create_date,
        t.create_by
      FROM transactions t
      INNER JOIN employees e
        ON e.id = t.employee_id
      INNER JOIN users u
        ON u.id = e.user_id
      WHERE t.id = ?
      LIMIT 1
      `,
      [insertResult.insertId]
    );
    await conn.commit();
    return sendSuccess(
      res,
      201,
      "Transaction created successfully",
      createdTransaction
    );
  } catch (err) {
    console.error("CREATE_TRANSACTION_ERROR:", err);
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error("ROLLBACK_ERROR:", rollbackErr);
      }
    }
    return sendError(
      res,
      500,
      "Something went wrong while creating transaction"
    );
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

router.put("/update", auth(), async (req, res) => {
  let conn;
  try {
    const companyId = safeNumber(req.company?.id);
    const userId = safeNumber(req.user?.id);
    if (!companyId) {
      return sendError(res, 401, "Company authentication is missing");
    }
    const {
      id,
      amount,
      transaction_date,
      remark,
      entry_type,
      employee_account,
      company_account,
    } = req.body;
    const txnId = safeNumber(id);
    if (!txnId || txnId <= 0) {
      return sendError(res, 400, "Valid transaction id is required");
    }
    const today = getCurrentDate();
    if (transaction_date !== undefined) {
      if (!isValidDate(transaction_date)) {
        return sendError(
          res,
          400,
          "transaction_date must be in YYYY-MM-DD format"
        );
      }
      if (isDateAfter(transaction_date, today)) {
        return sendError(res, 400, "Future transaction dates are not allowed");
      }
    }
    if (entry_type !== undefined && !["debit", "credit"].includes(entry_type)) {
      return sendError(res, 400, "entry_type must be debit or credit");
    }
    conn = await db.getConnection();
    await conn.beginTransaction();
    const [[txn]] = await conn.query(
      `
        SELECT
          t.id,
          t.company_id,
          t.employee_id,
          t.transaction_id,
          t.transaction_type,
          t.transaction_date,
          t.entry_type,
          t.amount,
          t.employee_account,
          t.company_account,
          t.is_deleted,
          e.joining_date
        FROM transactions t
        INNER JOIN employees e
          ON e.id = t.employee_id
          AND e.is_deleted = 0
        WHERE
          t.id = ?
          AND t.company_id = ?
          AND t.is_deleted = 0
        LIMIT 1
        FOR UPDATE
      `,
      [txnId, companyId]
    );
    if (!txn) {
      await conn.rollback();
      return sendError(res, 404, "Transaction not found");
    }
    if (txn.transaction_type === "salary") {
      await conn.rollback();
      return sendError(
        res,
        400,
        "Salary transactions are locked and cannot be modified. Create an adjustment entry instead."
      );
    }
    if (txn.is_deleted) {
      await conn.rollback();
      return sendError(res, 400, "Deleted transactions cannot be modified");
    }
    const updates = [];
    const params = [];
    if (amount !== undefined) {
      const parsedAmount = Number(amount);
      if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        await conn.rollback();
        return sendError(res, 400, "amount must be greater than 0");
      }
      updates.push("amount = ?");
      params.push(parsedAmount);
    }
    if (transaction_date !== undefined) {
      const joiningDate = formatToDate(txn.joining_date);
      if (isDateBefore(transaction_date, joiningDate)) {
        await conn.rollback();
        return sendError(
          res,
          400,
          "Transaction date cannot be before employee joining date"
        );
      }
      updates.push("transaction_date = ?");
      params.push(transaction_date);
    }
    if (remark !== undefined) {
      updates.push("remark = ?");
      params.push(String(remark || "").trim() || null);
    }
    if (entry_type !== undefined) {
      if (txn.transaction_type !== "opening_balance") {
        await conn.rollback();
        return sendError(
          res,
          400,
          "entry_type can only be updated for opening_balance transactions"
        );
      }
      updates.push("entry_type = ?");
      params.push(entry_type);
    }
    if (employee_account !== undefined) {
      if (employee_account === null) {
        updates.push("employee_account = ?");
        params.push(null);
      } else {
        const employeeAccountId = safeNumber(employee_account);
        if (!employeeAccountId || employeeAccountId <= 0) {
          await conn.rollback();
          return sendError(
            res,
            400,
            "Valid employee_account id is required"
          );
        }
        const [[employeeAccount]] = await conn.query(
          `
            SELECT
              id
            FROM bank_accounts
            WHERE
              id = ?
              AND employee_id = ?
              AND company_id = ?
              AND is_deleted = 0
              AND is_active = 1
              AND status = 'active'
            LIMIT 1
          `,
          [employeeAccountId, txn.employee_id, companyId]
        );
        if (!employeeAccount) {
          await conn.rollback();
          return sendError(
            res,
            400,
            "Employee bank account not found or inactive"
          );
        }
        updates.push("employee_account = ?");
        params.push(employeeAccountId);
      }
    }
    if (company_account !== undefined) {
      if (company_account === null) {
        updates.push("company_account = ?");
        params.push(null);
      } else {
        const companyAccountId = safeNumber(company_account);
        if (!companyAccountId || companyAccountId <= 0) {
          await conn.rollback();
          return sendError(
            res,
            400,
            "Valid company_account id is required"
          );
        }
        const [[companyAccount]] = await conn.query(
          `
            SELECT
              id
            FROM bank_accounts
            WHERE
              id = ?
              AND employee_id IS NULL
              AND company_id = ?
              AND is_deleted = 0
              AND is_active = 1
              AND status = 'active'
            LIMIT 1
          `,
          [companyAccountId, companyId]
        );
        if (!companyAccount) {
          await conn.rollback();
          return sendError(
            res,
            400,
            "Company bank account not found or inactive"
          );
        }
        updates.push("company_account = ?");
        params.push(companyAccountId);
      }
    }
    if (updates.length === 0) {
      await conn.rollback();
      return sendError(res, 400, "No valid fields provided for update");
    }
    updates.push("modify_by = ?");
    params.push(userId);
    params.push(txnId, companyId);
    await conn.query(
      `
      UPDATE transactions
      SET ${updates.join(", ")}
      WHERE
        id = ?
        AND company_id = ?
        AND is_deleted = 0
      LIMIT 1
      `,
      params
    );
    const [[updatedTransaction]] = await conn.query(
      `
        SELECT
          t.id,
          t.transaction_id,
          t.transaction_date,
          t.transaction_type,
          t.entry_type,
          t.amount,
          t.remark,
          t.employee_account,
          t.company_account,
          t.modify_date,
          e.employee_code,
          u.name AS employee_name
        FROM transactions t
        INNER JOIN employees e
          ON e.id = t.employee_id
          AND e.is_deleted = 0
        INNER JOIN users u
          ON u.id = e.user_id
          AND u.is_deleted = 0
        WHERE
          t.id = ?
          AND t.company_id = ?
          AND t.is_deleted = 0
        LIMIT 1
      `,
      [txnId, companyId]
    );
    await conn.commit();
    return res.status(200).json({
      success: true,
      message: "Transaction updated successfully",
    });
  } catch (err) {
    if (conn) {
      await conn.rollback();
    }
    console.error("UPDATE_TRANSACTION_ERROR:", err);
    return sendError(res, 500, "Failed to update transaction");
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

const ALLOWED_LEDGER_TRANSACTION_TYPES = [
  "payment",
  "receive",
  "salary",
  "opening_balance",
  "fine",
  "bonus",
];

const fetchLedgerSummaryMeta = async (
  conn,
  whereClause,
  params,
  perspective = "company"
) => {
  const [[summary]] = await conn.query(
    `
    SELECT
      COALESCE(
        SUM(
          CASE
            WHEN t.entry_type = 'debit'
              THEN t.amount
            ELSE 0
          END
        ),
        0
      ) AS company_debit,
      COALESCE(
        SUM(
          CASE
            WHEN t.entry_type = 'credit'
              THEN t.amount
            ELSE 0
          END
        ),
        0
      ) AS company_credit
    FROM transactions t
    INNER JOIN employees e
      ON e.id = t.employee_id
    INNER JOIN users u
      ON u.id = e.user_id
    WHERE ${whereClause}
    `,
    params
  );

  const companyDebit = Number(summary?.company_debit) || 0;
  const companyCredit = Number(summary?.company_credit) || 0;

  if (perspective === "employee") {
    const credit = Number(companyDebit.toFixed(2));
    const debit = Number(companyCredit.toFixed(2));
    return {
      credit,
      debit,
      net: Number((debit - credit).toFixed(2)),
    };
  }

  const credit = Number(companyCredit.toFixed(2));
  const debit = Number(companyDebit.toFixed(2));
  return {
    credit,
    debit,
    net: Number((debit - credit).toFixed(2)),
  };
};

const mapLedgerEmployee = (txn) => ({
  id: safeNumber(txn.employee_id, 0) || null,
  name: txn.employee_name || null,
  email: txn.employee_email || null,
  mobile: txn.employee_phone || null,
  designation: txn.employee_designation || null,
  profile_picture: buildFileUrl(txn.employee_profile_picture),
});

const buildCompanyLedgerListItemDesc = (txn, runningBalanceRef, roleMap) => {
  const amount = Number(txn.amount) || 0;
  const type = txn.entry_type;
  const forwardEffect = type === "debit" ? amount : -amount;
  const newBalance = Number(runningBalanceRef.value.toFixed(2));
  const oldBalance = Number((newBalance - forwardEffect).toFixed(2));

  runningBalanceRef.value = oldBalance;

  return {
    id: txn.id,
    transaction_id: txn.transaction_id,
    transaction_date: formatToDate(txn.transaction_date),
    amount,
    transaction_type: txn.transaction_type,
    type,
    old_balance: oldBalance,
    new_balance: newBalance,
    remarks: txn.remark || null,
    employee: mapLedgerEmployee(txn),
    create_by: mapLedgerActor(
      txn.create_by,
      txn.create_by_name,
      txn.create_by_email,
      txn.create_by_phone,
      roleMap
    ),
    create_date: toISTString(txn.create_date),
    modify_by: mapLedgerActor(
      txn.modify_by,
      txn.modify_by_name,
      txn.modify_by_email,
      txn.modify_by_phone,
      roleMap
    ),
    modify_date: toISTString(txn.modify_date),
  };
};

router.get("/company-ledger", auth(), async (req, res) => {
  let conn;

  try {
    const companyId = safeNumber(req.company?.id);

    if (!companyId) {
      return sendError(res, 400, "Company id is required in header");
    }

    const {
      from_date,
      to_date,
      page_no,
      limit,
      search,
      employee_id,
      transaction_type,
    } = req.query;

    if (!hasQueryValue(limit)) {
      return sendError(res, 400, "limit is required");
    }

    if (!hasQueryValue(page_no)) {
      return sendError(res, 400, "page_no is required");
    }

    const hasFromDate = hasQueryValue(from_date);
    const hasToDate = hasQueryValue(to_date);

    if (hasFromDate !== hasToDate) {
      return sendError(
        res,
        400,
        "from_date and to_date must be provided together"
      );
    }

    const page = safeNumber(page_no, 0);
    const pageLimit = safeNumber(limit, 0);

    if (page < 1) {
      return sendError(res, 400, "page_no must be greater than 0");
    }

    if (pageLimit < 1) {
      return sendError(res, 400, "limit must be greater than 0");
    }

    if (pageLimit > LEDGER_MAX_LIMIT) {
      return sendError(
        res,
        400,
        `limit cannot exceed ${LEDGER_MAX_LIMIT}`
      );
    }

    const offset = (page - 1) * pageLimit;
    const today = getCurrentDate();

    if (hasFromDate && !isValidDate(from_date)) {
      return sendError(res, 400, "Invalid from_date");
    }

    if (hasToDate && !isValidDate(to_date)) {
      return sendError(res, 400, "Invalid to_date");
    }

    if (
      (hasFromDate && isDateAfter(from_date, today)) ||
      (hasToDate && isDateAfter(to_date, today))
    ) {
      return sendError(res, 400, "Future dates are not allowed");
    }

    if (hasFromDate && isDateAfter(from_date, to_date)) {
      return sendError(res, 400, "from_date cannot be after to_date");
    }

    const employeeId = hasQueryValue(employee_id)
      ? safeNumber(employee_id, 0)
      : 0;

    if (hasQueryValue(employee_id) && employeeId <= 0) {
      return sendError(res, 400, "Valid employee_id is required");
    }

    const txnType = hasQueryValue(transaction_type)
      ? String(transaction_type).trim()
      : null;

    if (txnType && !ALLOWED_LEDGER_TRANSACTION_TYPES.includes(txnType)) {
      return sendError(
        res,
        400,
        `Invalid transaction_type. Allowed values: ${ALLOWED_LEDGER_TRANSACTION_TYPES.join(
          ", "
        )}`
      );
    }

    conn = await db.getConnection();

    if (employeeId > 0) {
      const [[employee]] = await conn.query(
        `
        SELECT e.id
        FROM employees e
        WHERE e.id = ?
          AND e.company_id = ?
          AND e.is_deleted = 0
        LIMIT 1
        `,
        [employeeId, companyId]
      );

      if (!employee) {
        return sendError(res, 404, "Employee not found");
      }
    }

    const conditions = [
      "t.company_id = ?",
      "t.is_deleted = 0",
      "e.is_deleted = 0",
      "u.is_deleted = 0",
    ];
    const params = [companyId];

    if (employeeId > 0) {
      conditions.push("t.employee_id = ?");
      params.push(employeeId);
    }

    if (hasFromDate) {
      conditions.push("t.transaction_date >= ?");
      params.push(from_date);
    }

    if (hasToDate) {
      conditions.push("t.transaction_date <= ?");
      params.push(to_date);
    }

    if (txnType) {
      conditions.push("t.transaction_type = ?");
      params.push(txnType);
    }

    if (hasQueryValue(search)) {
      const searchValue = `%${String(search).trim()}%`;
      conditions.push(`
        (
          t.transaction_id LIKE ?
          OR t.remark LIKE ?
          OR e.employee_code LIKE ?
          OR u.name LIKE ?
          OR u.phone LIKE ?
          OR u.email LIKE ?
        )
      `);
      params.push(
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue
      );
    }

    const whereClause = conditions.join(" AND ");

    let openingBalance = 0;

    if (hasFromDate) {
      const openingConditions = [
        "t.company_id = ?",
        "t.is_deleted = 0",
        "t.transaction_date < ?",
      ];
      const openingParams = [companyId, from_date];

      if (employeeId > 0) {
        openingConditions.push("t.employee_id = ?");
        openingParams.push(employeeId);
      }

      const [[openingResult]] = await conn.query(
        `
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN t.entry_type = 'debit'
                  THEN t.amount
                ELSE -t.amount
              END
            ),
            0
          ) AS opening_balance
        FROM transactions t
        WHERE ${openingConditions.join(" AND ")}
        `,
        openingParams
      );

      openingBalance = Number(
        Number(openingResult?.opening_balance || 0).toFixed(2)
      );
    }

    const runningBalanceRef = { value: openingBalance };

    const meta = await fetchLedgerSummaryMeta(
      conn,
      whereClause,
      params,
      "company"
    );

    const closingBalance = Number(
      (openingBalance + meta.net).toFixed(2)
    );
    runningBalanceRef.value = closingBalance;

    if (offset > 0) {
      const [[offsetResult]] = await conn.query(
        `
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN x.entry_type = 'debit'
                  THEN x.amount
                ELSE -x.amount
              END
            ),
            0
          ) AS offset_balance
        FROM (
          SELECT
            t.entry_type,
            t.amount
          FROM transactions t
          INNER JOIN employees e
            ON e.id = t.employee_id
          INNER JOIN users u
            ON u.id = e.user_id
          WHERE ${whereClause}
          ORDER BY
            t.transaction_date DESC,
            t.id DESC
          LIMIT ?
        ) x
        `,
        [...params, offset]
      );

      runningBalanceRef.value -= Number(offsetResult?.offset_balance) || 0;
    }

    const [transactions] = await conn.query(
      `
      SELECT
        t.id,
        t.transaction_id,
        t.transaction_date,
        t.transaction_type,
        t.entry_type,
        t.amount,
        t.remark,
        t.create_date,
        t.modify_date,
        t.create_by,
        t.modify_by,
        e.id AS employee_id,
        e.designation AS employee_designation,
        u.name AS employee_name,
        u.email AS employee_email,
        u.phone AS employee_phone,
        u.profile_picture AS employee_profile_picture,
        cu.name AS create_by_name,
        cu.email AS create_by_email,
        cu.phone AS create_by_phone,
        mu.name AS modify_by_name,
        mu.email AS modify_by_email,
        mu.phone AS modify_by_phone
      FROM transactions t
      INNER JOIN employees e
        ON e.id = t.employee_id
        AND e.is_deleted = 0
      INNER JOIN users u
        ON u.id = e.user_id
        AND u.is_deleted = 0
      LEFT JOIN users cu
        ON cu.id = t.create_by
        AND cu.is_deleted = 0
      LEFT JOIN users mu
        ON mu.id = t.modify_by
        AND mu.is_deleted = 0
      WHERE ${whereClause}
      ORDER BY
        t.transaction_date DESC,
        t.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, pageLimit, offset]
    );

    const actorIds = transactions.flatMap((txn) => [
      txn.create_by,
      txn.modify_by,
    ]);
    const roleMap = await resolveLedgerUserRoles(conn, companyId, actorIds);

    const list = transactions.map((txn) =>
      buildCompanyLedgerListItemDesc(txn, runningBalanceRef, roleMap)
    );

    return sendSuccess(
      res,
      200,
      "Employee ledger fetched successfully",
      {
        opening_balance: openingBalance,
        list,
      },
      meta
    );
  } catch (err) {
    console.error("COMPANY_LEDGER_ERROR:", err);
    return sendError(res, 500, "Failed to fetch employee ledger");
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

const buildEmployeeLedgerListItemDesc = (txn, runningBalanceRef, roleMap) => {
  const amount = Number(txn.amount) || 0;
  const type = txn.entry_type === "debit" ? "credit" : "debit";
  const forwardEffect = txn.entry_type === "debit" ? amount : -amount;
  const newBalance = Number(runningBalanceRef.value.toFixed(2));
  const oldBalance = Number((newBalance - forwardEffect).toFixed(2));

  runningBalanceRef.value = oldBalance;

  return {
    id: txn.id,
    transaction_date: formatToDate(txn.transaction_date),
    amount,
    transaction_type: txn.transaction_type,
    type,
    old_balance: oldBalance,
    new_balance: newBalance,
    remarks: txn.remark || null,
    create_by: mapLedgerActor(
      txn.create_by,
      txn.create_by_name,
      txn.create_by_email,
      txn.create_by_phone,
      roleMap
    ),
    create_date: toISTString(txn.create_date),
    modify_by: mapLedgerActor(
      txn.modify_by,
      txn.modify_by_name,
      txn.modify_by_email,
      txn.modify_by_phone,
      roleMap
    ),
    modify_date: toISTString(txn.modify_date),
  };
};

router.get("/my-ledger", auth([], { employee_only: true }), async (req, res) => {
  let conn;

  try {
    const companyId = safeNumber(req.company?.id);
    const employeeId = safeNumber(req.employee?.id);
    const userId = safeNumber(req.user?.id);

    if (!companyId) {
      return sendError(res, 400, "Company id is required in header");
    }

    if (!userId || !employeeId) {
      return sendError(
        res,
        403,
        "User is not an employee of this company"
      );
    }

    const {
      from_date,
      to_date,
      search,
      limit,
      page_no,
      transaction_type,
    } = req.query;

    if (!hasQueryValue(limit)) {
      return sendError(res, 400, "limit is required");
    }

    if (!hasQueryValue(page_no)) {
      return sendError(res, 400, "page_no is required");
    }

    const hasFromDate = hasQueryValue(from_date);
    const hasToDate = hasQueryValue(to_date);

    if (hasFromDate !== hasToDate) {
      return sendError(
        res,
        400,
        "from_date and to_date must be provided together"
      );
    }

    let page = safeNumber(page_no, 0);
    let pageLimit = safeNumber(limit, 0);

    if (page < 1) {
      return sendError(res, 400, "page_no must be greater than 0");
    }

    if (pageLimit < 1) {
      return sendError(res, 400, "limit must be greater than 0");
    }

    if (pageLimit > LEDGER_MAX_LIMIT) {
      return sendError(
        res,
        400,
        `limit cannot exceed ${LEDGER_MAX_LIMIT}`
      );
    }

    const offset = (page - 1) * pageLimit;
    const today = getCurrentDate();

    if (hasFromDate && !isValidDate(from_date)) {
      return sendError(res, 400, "Invalid from_date");
    }

    if (hasToDate && !isValidDate(to_date)) {
      return sendError(res, 400, "Invalid to_date");
    }

    if (
      (hasFromDate && isDateAfter(from_date, today)) ||
      (hasToDate && isDateAfter(to_date, today))
    ) {
      return sendError(res, 400, "Future dates are not allowed");
    }

    const txnType = hasQueryValue(transaction_type)
      ? String(transaction_type).trim()
      : null;

    if (txnType && !ALLOWED_LEDGER_TRANSACTION_TYPES.includes(txnType)) {
      return sendError(
        res,
        400,
        `Invalid transaction_type. Allowed values: ${ALLOWED_LEDGER_TRANSACTION_TYPES.join(
          ", "
        )}`
      );
    }

    conn = await db.getConnection();

    const [[employee]] = await conn.query(
      `
      SELECT
        e.id,
        e.joining_date
      FROM employees e
      INNER JOIN users u
        ON u.id = e.user_id
        AND u.is_deleted = 0
      WHERE
        e.id = ?
        AND e.user_id = ?
        AND e.company_id = ?
        AND e.is_deleted = 0
        AND e.is_active = 1
      LIMIT 1
      `,
      [employeeId, userId, companyId]
    );

    if (!employee) {
      return sendError(
        res,
        403,
        "User is not an employee of this company"
      );
    }

    const joiningDate = formatToDate(employee.joining_date);
    let rangeFrom = hasFromDate ? from_date : joiningDate;
    let rangeTo = hasToDate ? to_date : today;

    if (isDateBefore(rangeFrom, joiningDate)) {
      return sendError(
        res,
        400,
        "Ledger cannot be viewed before joining date"
      );
    }

    if (isDateBefore(rangeTo, joiningDate)) {
      return sendError(
        res,
        400,
        "Ledger cannot be viewed before joining date"
      );
    }

    if (isDateAfter(rangeFrom, rangeTo)) {
      return sendError(res, 400, "from_date cannot be after to_date");
    }

    const conditions = [
      "t.company_id = ?",
      "t.employee_id = ?",
      "t.is_deleted = 0",
      "e.is_deleted = 0",
      "u.is_deleted = 0",
      "t.transaction_date >= ?",
      "t.transaction_date <= ?",
    ];

    const params = [companyId, employeeId, rangeFrom, rangeTo];

    if (txnType) {
      conditions.push("t.transaction_type = ?");
      params.push(txnType);
    }

    if (hasQueryValue(search)) {
      const searchValue = `%${String(search).trim()}%`;
      conditions.push(`
        (
          t.transaction_id LIKE ?
          OR t.remark LIKE ?
          OR e.employee_code LIKE ?
          OR u.name LIKE ?
          OR u.phone LIKE ?
          OR u.email LIKE ?
        )
      `);
      params.push(
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue
      );
    }

    const whereClause = conditions.join(" AND ");

    const [[openingResult]] = await conn.query(
      `
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN t.entry_type = 'debit'
                THEN t.amount
              ELSE -t.amount
            END
          ),
          0
        ) AS opening_balance
      FROM transactions t
      WHERE
        t.company_id = ?
        AND t.employee_id = ?
        AND t.is_deleted = 0
        AND t.transaction_date < ?
      `,
      [companyId, employeeId, rangeFrom]
    );

    const openingBalance = Number(
      (Number(openingResult?.opening_balance) || 0).toFixed(2)
    );

    let runningBalanceRef = { value: openingBalance };

    const meta = await fetchLedgerSummaryMeta(
      conn,
      whereClause,
      params,
      "employee"
    );

    const closingBalance = Number(
      (openingBalance + meta.credit - meta.debit).toFixed(2)
    );
    runningBalanceRef.value = closingBalance;

    if (offset > 0) {
      const [[offsetResult]] = await conn.query(
        `
        SELECT
          COALESCE(SUM(balance_amount), 0) AS offset_balance
        FROM (
          SELECT
            CASE
              WHEN t.entry_type = 'debit'
                THEN t.amount
              ELSE -t.amount
            END AS balance_amount
          FROM transactions t
          INNER JOIN employees e
            ON e.id = t.employee_id
          INNER JOIN users u
            ON u.id = e.user_id
          WHERE ${whereClause}
          ORDER BY
            t.transaction_date DESC,
            t.id DESC
          LIMIT ?
        ) x
        `,
        [...params, offset]
      );

      runningBalanceRef.value -= Number(offsetResult?.offset_balance) || 0;
    }

    const [transactions] = await conn.query(
      `
      SELECT
        t.id,
        t.transaction_date,
        t.transaction_type,
        t.entry_type,
        t.amount,
        t.remark,
        t.create_date,
        t.modify_date,
        t.create_by,
        t.modify_by,
        cu.name AS create_by_name,
        cu.email AS create_by_email,
        cu.phone AS create_by_phone,
        mu.name AS modify_by_name,
        mu.email AS modify_by_email,
        mu.phone AS modify_by_phone
      FROM transactions t
      INNER JOIN employees e
        ON e.id = t.employee_id
        AND e.is_deleted = 0
      INNER JOIN users u
        ON u.id = e.user_id
        AND u.is_deleted = 0
      LEFT JOIN users cu
        ON cu.id = t.create_by
        AND cu.is_deleted = 0
      LEFT JOIN users mu
        ON mu.id = t.modify_by
        AND mu.is_deleted = 0
      WHERE ${whereClause}
      ORDER BY
        t.transaction_date DESC,
        t.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, pageLimit, offset]
    );

    const actorIds = transactions.flatMap((txn) => [
      txn.create_by,
      txn.modify_by,
    ]);

    const roleMap = await resolveLedgerUserRoles(conn, companyId, actorIds);

    const list = transactions.map((txn) =>
      buildEmployeeLedgerListItemDesc(txn, runningBalanceRef, roleMap)
    );

    return sendSuccess(
      res,
      200,
      "Employee ledger fetched successfully",
      {
        opening_balance: openingBalance,
        list,
      },
      meta
    );
  } catch (err) {
    console.error("MY_LEDGER_ERROR:", err);
    return sendError(res, 500, "Failed to fetch my ledger");
  } finally {
    if (conn) {
      conn.release();
    }
  }
}
);

router.delete("/delete", auth(), async (req, res) => {
  let conn;
  try {
    const companyId = safeNumber(req.company?.id);
    const userId = safeNumber(req.user?.id);
    if (!companyId) {
      return sendError(
        res,
        401,
        "Company authentication information is missing."
      );
    }
    const txnId = safeNumber(req.body?.id);
    if (!txnId || txnId <= 0) {
      return sendError(res, 400, "A valid transaction id is required.");
    }
    conn = await db.getConnection();
    await conn.beginTransaction();
    const [[txn]] = await conn.query(
      `
          SELECT
            t.id,
            t.transaction_id,
            t.transaction_type,
            t.entry_type,
            t.amount,
            t.employee_id,
            t.company_id,
            t.is_deleted,
            e.employee_code,
            u.name AS employee_name
          FROM transactions t
          INNER JOIN employees e
            ON e.id = t.employee_id
            AND e.is_deleted = 0
          INNER JOIN users u
            ON u.id = e.user_id
            AND u.is_deleted = 0
          WHERE
            t.id = ?
            AND t.company_id = ?
            AND t.is_deleted = 0
          LIMIT 1
          FOR UPDATE
        `,
      [txnId, companyId]
    );
    if (!txn) {
      await conn.rollback();
      return sendError(res, 404, "Transaction not found or already deleted.");
    }
    const restrictedTransactionTypes = ["salary"];
    if (restrictedTransactionTypes.includes(txn.transaction_type)) {
      await conn.rollback();
      return sendError(
        res,
        400,
        `The '${txn.transaction_type}' transaction type is system-managed and cannot be deleted manually.`
      );
    }
    await conn.query(
      `
        UPDATE transactions
        SET
          is_deleted = 1,
          deleted_at = NOW(),
          deleted_by = ?
        WHERE
          id = ?
          AND company_id = ?
          AND is_deleted = 0
        LIMIT 1
      `,
      [userId || null, txnId, companyId]
    );
    await conn.commit();
    return sendSuccess(res, 200, "Transaction deleted successfully.");
  } catch (err) {
    if (conn) {
      await conn.rollback();
    }
    console.error("DELETE_TRANSACTION_API_ERROR:", err);
    return sendError(
      res,
      500,
      "Failed to delete transaction. Please try again later."
    );
  } finally {
    if (conn) {
      conn.release();
    }
  }
});

export default router;