import express from "express";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import checkPermission from "../middleware/permissionValidationMiddleware.js";
import { convertToISTFields, toISTString } from "../utils/time.js";
import { toBooleanFields, toBool } from "../utils/toBooleanFields.js";
import axios from "axios";
import { checkCompanyPermissions } from "../utils/checkPermissions.js";
import { buildFileUrl } from "../utils/fileService.js";
import { getEnumObject } from "../utils/constantsValidator.js";
import { DESIGNATIONS, EMPLOYMENT_TYPES, SALARY_TYPES } from "../constants/constants_values.js";
import { CMP_BANK, EMP_BANK } from "../constants/permissions.js";


const router = express.Router();


const BANK = {
  ALL: [
    ...EMP_BANK.MNG,
    ...CMP_BANK.MNG
  ]
};


router.get("/ifsc/:ifsc_code", auth(), async (req, res) => {
  const sendError = (status, message) =>
    res.status(status).json({ success: false, message });

  const sendSuccess = (data) =>
    res.status(200).json({ success: true, data });

  try {
    let { ifsc_code } = req.params;

    if (!ifsc_code) {
      return sendError(400, "IFSC code is required");
    }

    ifsc_code = ifsc_code.trim().toUpperCase();

    const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

    if (!IFSC_REGEX.test(ifsc_code)) {
      return sendError(400, "Invalid IFSC format (e.g. SBIN0001234)");
    }

    const response = await axios.get(
      `https://ifsc.razorpay.com/${ifsc_code}`,
      {
        timeout: 5000
      }
    );

    const bankData = response.data;

    if (!bankData) {
      return sendError(404, "Bank details not found");
    }

    const result = {
      ifsc: bankData.IFSC,
      bank_name: bankData.BANK,
      branch: bankData.BRANCH,
      address: bankData.ADDRESS,
      city: bankData.CITY,
      district: bankData.DISTRICT,
      state: bankData.STATE,
      micr: bankData.MICR,
      contact: bankData.CONTACT,
      upi: bankData.UPI
    };

    return sendSuccess(result);

  } catch (err) {
    console.error("IFSC fetch error:", err.message);

    if (err.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: "Invalid IFSC or bank not found"
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to fetch bank details"
    });
  }
});

router.post("/create", auth(BANK.ALL), async (req, res) => {

  let conn;
  let transactionStarted = false;

  const ENABLE_ACCOUNT_MASKING =
    false;

  const sendError = (
    status,
    message,
    extra = {}
  ) => {

    return res.status(status).json({
      success: false,
      message,
      ...extra
    });

  };

  const sendSuccess = (
    status,
    message,
    data = null
  ) => {

    return res.status(status).json({
      success: true,
      message,
      data
    });

  };

  const sanitizeString = (
    value,
    {
      lower = false,
      upper = false
    } = {}
  ) => {

    if (
      typeof value !== "string"
    ) {
      return null;
    }

    let sanitized =
      value.trim();

    if (!sanitized) {
      return null;
    }

    if (lower) {
      sanitized =
        sanitized.toLowerCase();
    }

    if (upper) {
      sanitized =
        sanitized.toUpperCase();
    }

    return sanitized;

  };

  const parseBoolean = (
    value
  ) => {

    return (
      value === true ||
      value === 1 ||
      value === "1" ||
      value === "true"
    );

  };

  const maskAccountNumber = (
    accountNumber
  ) => {

    if (!accountNumber) {
      return null;
    }

    if (
      accountNumber.length <= 4
    ) {
      return "XXXX";
    }

    return `XXXXXX${accountNumber.slice(-4)}`;

  };

  try {

    conn =
      await db.getConnection();

    await conn.beginTransaction();

    transactionStarted = true;

    const user_id =
      Number(req.user?.id);

    const company_id =
      Number(req.company?.id);

    let {
      bank_owner_type,

      employee_id = null,

      account_type,

      bank_name = null,
      account_holder_name = null,
      account_number = null,
      ifsc_code = null,
      branch_name = null,
      upi_id = null,

      is_primary = false
    } = req.body;

    bank_owner_type =
      sanitizeString(
        bank_owner_type,
        { lower: true }
      );

    employee_id =
      employee_id !== null
        ? Number(employee_id)
        : null;

    account_type =
      sanitizeString(
        account_type,
        { lower: true }
      );

    bank_name =
      sanitizeString(
        bank_name
      );

    account_holder_name =
      sanitizeString(
        account_holder_name
      );

    account_number =
      sanitizeString(
        account_number
      );

    ifsc_code =
      sanitizeString(
        ifsc_code,
        { upper: true }
      );

    branch_name =
      sanitizeString(
        branch_name
      );

    upi_id =
      sanitizeString(
        upi_id,
        { lower: true }
      );

    is_primary =
      parseBoolean(
        is_primary
      );

    const allowedOwnerTypes = [
      "company",
      "employee"
    ];

    if (
      !allowedOwnerTypes.includes(
        bank_owner_type
      )
    ) {

      throw {
        status: 400,
        message:
          `bank_owner_type must be one of: ${allowedOwnerTypes.join(", ")}`
      };

    }

    const companyAccountTypes = [
      "cash",
      "current",
      "savings",
      "loan",
      "upi"
    ];

    const employeeAccountTypes = [
      "current",
      "savings",
      "upi"
    ];

    const [[user]] =
      await conn.query(
        `
          SELECT
            id,
            is_active,
            is_deleted
          FROM users
          WHERE id = ?
          LIMIT 1
        `,
        [user_id]
      );

    if (
      !user ||
      user.is_deleted
    ) {

      throw {
        status: 404,
        message:
          "User not found"
      };

    }

    if (!user.is_active) {

      throw {
        status: 403,
        message:
          "User inactive"
      };

    }

    const [[company]] =
      await conn.query(
        `
          SELECT
            id,
            owner_user_id,
            is_active,
            is_deleted
          FROM companies
          WHERE id = ?
          LIMIT 1
        `,
        [company_id]
      );

    if (
      !company ||
      company.is_deleted
    ) {

      throw {
        status: 404,
        message:
          "Company not found"
      };

    }

    if (!company.is_active) {

      throw {
        status: 403,
        message:
          "Company inactive"
      };

    }

    const permissionResult =
      await checkCompanyPermissions({
        conn,
        user_id,
        company_id,
        permissions: [
          "emp_bnk_create"
        ]
      });

    const isOwner = permissionResult.role === "owner";

    if (bank_owner_type === "employee") {

      if (!employee_id) {

        throw {
          status: 400,
          message:
            "employee_id is required when bank_owner_type is employee"
        };

      }

      if (!employeeAccountTypes.includes(account_type)) {
        throw {
          status: 400,
          message:
            `Employee account_type must be one of: ${employeeAccountTypes.join(", ")}`
        };
      }
    } else {

      if (!isOwner) {
        throw {
          status: 403,
          message:
            "Only company owner can create company bank accounts"
        };
      }

      if (employee_id) {

        throw {
          status: 400,
          message:
            "employee_id is not allowed for company bank accounts"
        };

      }

      if (
        !companyAccountTypes.includes(
          account_type
        )
      ) {

        throw {
          status: 400,
          message:
            `Company account_type must be one of: ${companyAccountTypes.join(", ")}`
        };

      }

    }

    if (bank_owner_type === "employee") {

      const [[employee]] =
        await conn.query(
          `
            SELECT
              id,
              company_id,
              is_active,
              is_deleted
            FROM employees
            WHERE
              id = ?
              AND company_id = ?
            LIMIT 1
          `,
          [
            employee_id,
            company_id
          ]
        );

      if (!employee || employee.is_deleted) {
        throw {
          status: 404,
          message:
            "Employee not found"
        };
      }

      if (!employee.is_active) {
        throw {
          status: 403,
          message:
            "Employee inactive"
        };
      }

    }

    if (account_type === "cash") {
      const [[existingCash]] =
        await conn.query(
          `
            SELECT id
            FROM bank_accounts
            WHERE
              company_id = ?
              AND employee_id IS NULL
              AND account_type = 'cash'
              AND is_deleted = 0
            LIMIT 1
          `,
          [company_id]
        );

      if (existingCash) {
        throw {
          status: 409,
          message: "Cash account already exists"
        };
      }

    }

    if (
      [
        "current",
        "savings",
        "loan"
      ].includes(account_type)
    ) {

      if (
        !bank_name ||
        !account_holder_name ||
        !account_number ||
        !ifsc_code
      ) {

        throw {
          status: 400,
          message:
            "bank_name, account_holder_name, account_number and ifsc_code are required"
        };

      }

      if (
        account_number.length < 6 ||
        account_number.length > 50
      ) {

        throw {
          status: 400,
          message:
            "Invalid account number"
        };

      }

      const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

      if (
        !IFSC_REGEX.test(
          ifsc_code
        )
      ) {

        throw {
          status: 400,
          message:
            "Invalid IFSC code"
        };

      }

      const storedAccountNumber =
        ENABLE_ACCOUNT_MASKING
          ? maskAccountNumber(
            account_number
          )
          : account_number;

      const duplicateQuery =
        bank_owner_type ===
          "employee"
          ? `
              SELECT id
              FROM bank_accounts
              WHERE
                company_id = ?
                AND employee_id = ?
                AND account_number = ?
                AND ifsc_code = ?
                AND is_deleted = 0
              LIMIT 1
            `
          : `
              SELECT id
              FROM bank_accounts
              WHERE
                company_id = ?
                AND employee_id IS NULL
                AND account_number = ?
                AND ifsc_code = ?
                AND is_deleted = 0
              LIMIT 1
            `;

      const duplicateParams =
        bank_owner_type ===
          "employee"
          ? [
            company_id,
            employee_id,
            storedAccountNumber,
            ifsc_code
          ]
          : [
            company_id,
            storedAccountNumber,
            ifsc_code
          ];

      const [[duplicate]] =
        await conn.query(
          duplicateQuery,
          duplicateParams
        );

      if (duplicate) {

        throw {
          status: 409,
          message:
            "Bank account already exists"
        };

      }

      account_number = storedAccountNumber;

    }

    if (
      account_type === "upi"
    ) {

      if (!upi_id) {

        throw {
          status: 400,
          message:
            "upi_id is required"
        };

      }

      const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
      if (
        !UPI_REGEX.test(
          upi_id
        )
      ) {

        throw {
          status: 400,
          message:
            "Invalid UPI ID"
        };

      }

      const upiQuery =
        bank_owner_type ===
          "employee"
          ? `
              SELECT id
              FROM bank_accounts
              WHERE
                company_id = ?
                AND employee_id = ?
                AND upi_id = ?
                AND is_deleted = 0
              LIMIT 1
            `
          : `
              SELECT id
              FROM bank_accounts
              WHERE
                company_id = ?
                AND employee_id IS NULL
                AND upi_id = ?
                AND is_deleted = 0
              LIMIT 1
            `;

      const upiParams =
        bank_owner_type ===
          "employee"
          ? [
            company_id,
            employee_id,
            upi_id
          ]
          : [
            company_id,
            upi_id
          ];

      const [[existingUpi]] =
        await conn.query(
          upiQuery,
          upiParams
        );

      if (existingUpi) {

        throw {
          status: 409,
          message:
            "UPI already exists"
        };

      }

    }

    const [[existingPrimary]] =
      await conn.query(
        `
          SELECT id
          FROM bank_accounts
          WHERE
            company_id = ?
            AND (
              (
                ? = 'employee'
                AND employee_id = ?
              )
              OR
              (
                ? = 'company'
                AND employee_id IS NULL
              )
            )
            AND is_primary = 1
            AND is_deleted = 0
          LIMIT 1
        `,
        [
          company_id,
          bank_owner_type,
          employee_id,
          bank_owner_type
        ]
      );

    if (!existingPrimary) {
      is_primary = true;
    }

    if (is_primary) {

      if (
        bank_owner_type ===
        "employee"
      ) {

        await conn.query(
          `
            UPDATE bank_accounts
            SET
              is_primary = 0,
              updated_by = ?
            WHERE
              employee_id = ?
              AND is_deleted = 0
          `,
          [
            user_id,
            employee_id
          ]
        );

      } else {

        await conn.query(
          `
            UPDATE bank_accounts
            SET
              is_primary = 0,
              updated_by = ?
            WHERE
              company_id = ?
              AND employee_id IS NULL
              AND is_deleted = 0
          `,
          [
            user_id,
            company_id
          ]
        );

      }

    }

    const [insertResult] =
      await conn.query(
        `
          INSERT INTO bank_accounts (
            company_id,
            employee_id,

            account_type,

            bank_name,
            account_holder_name,
            account_number,
            ifsc_code,
            branch_name,
            upi_id,

            is_primary,

            created_by,
            updated_by
          )
          VALUES (
            ?, ?,
            ?,
            ?, ?, ?, ?, ?, ?,
            ?,
            ?, ?
          )
        `,
        [
          company_id,
          employee_id,

          account_type,

          bank_name,
          account_holder_name,
          account_number,
          ifsc_code,
          branch_name,
          upi_id,

          is_primary ? 1 : 0,

          user_id,
          user_id
        ]
      );

    const [[createdAccount]] =
      await conn.query(
        `
          SELECT
            id,
            company_id,
            employee_id,

            account_type,

            bank_name,
            account_holder_name,
            account_number,
            ifsc_code,
            branch_name,
            upi_id,

            is_primary,
            status,
            is_active,

            created_at
          FROM bank_accounts
          WHERE id = ?
          LIMIT 1
        `,
        [insertResult.insertId]
      );

    await conn.commit();

    transactionStarted = false;

    return sendSuccess(
      201,
      "Bank account created successfully",
      createdAccount
    );

  } catch (error) {

    if (
      conn &&
      transactionStarted
    ) {

      await conn.rollback();

    }

    console.error(
      "Create bank account error:",
      error
    );

    return sendError(
      error.status || 500,
      error.message ||
      "Internal server error",
      {
        missing_permissions:
          error.missing_permissions ||
          undefined
      }
    );

  } finally {

    if (conn) {
      conn.release();
    }

  }

});

router.put("/update", auth(BANK.ALL), async (req, res) => {

  let conn;
  let transactionStarted = false;

  const ENABLE_ACCOUNT_MASKING =
    false;

  const sendError = (
    status,
    message,
    extra = {}
  ) => {

    return res.status(status).json({
      success: false,
      message,
      ...extra
    });

  };

  const sendSuccess = (
    status,
    message,
    data = null
  ) => {

    return res.status(status).json({
      success: true,
      message,
      data
    });

  };

  const sanitizeString = (
    value,
    {
      lower = false,
      upper = false
    } = {}
  ) => {

    if (
      typeof value !== "string"
    ) {
      return undefined;
    }

    let sanitized =
      value.trim();

    if (!sanitized) {
      return null;
    }

    if (lower) {
      sanitized =
        sanitized.toLowerCase();
    }

    if (upper) {
      sanitized =
        sanitized.toUpperCase();
    }

    return sanitized;

  };

  const parseBoolean = (
    value
  ) => {

    return (
      value === true ||
      value === 1 ||
      value === "1" ||
      value === "true"
    );

  };

  const maskAccountNumber = (
    accountNumber
  ) => {

    if (!accountNumber) {
      return null;
    }

    if (
      accountNumber.length <= 4
    ) {
      return "XXXX";
    }

    return `XXXXXX${accountNumber.slice(-4)}`;

  };

  try {

    conn =
      await db.getConnection();

    await conn.beginTransaction();

    transactionStarted = true;

    const user_id =
      Number(req.user?.id);

    const company_id =
      Number(req.company?.id);

    if (
      !user_id ||
      !company_id
    ) {

      throw {
        status: 401,
        message:
          "Unauthorized"
      };

    }

    let {
      bank_id,

      account_type,

      bank_name,
      account_holder_name,
      account_number,
      ifsc_code,
      branch_name,
      upi_id,

      is_primary,
      status
    } = req.body;

    bank_id =
      Number(bank_id);

    account_type =
      sanitizeString(
        account_type,
        { lower: true }
      );

    bank_name =
      sanitizeString(
        bank_name
      );

    account_holder_name =
      sanitizeString(
        account_holder_name
      );

    account_number =
      sanitizeString(
        account_number
      );

    ifsc_code =
      sanitizeString(
        ifsc_code,
        { upper: true }
      );

    branch_name =
      sanitizeString(
        branch_name
      );

    upi_id =
      sanitizeString(
        upi_id,
        { lower: true }
      );

    status =
      sanitizeString(
        status,
        { lower: true }
      );

    if (
      is_primary !== undefined
    ) {

      is_primary =
        parseBoolean(
          is_primary
        );

    }

    if (!bank_id) {

      throw {
        status: 400,
        message:
          "bank_id is required"
      };

    }

    const allowedStatuses = [
      "active",
      "inactive"
    ];

    if (
      status !== undefined &&
      status !== null &&
      !allowedStatuses.includes(
        status
      )
    ) {

      throw {
        status: 400,
        message:
          `status must be one of: ${allowedStatuses.join(", ")}`
      };

    }

    const companyAccountTypes = [
      "cash",
      "current",
      "savings",
      "loan",
      "upi"
    ];

    const employeeAccountTypes = [
      "current",
      "savings",
      "upi"
    ];

    const [[user]] =
      await conn.query(
        `
          SELECT
            id,
            is_active,
            is_deleted
          FROM users
          WHERE id = ?
          LIMIT 1
        `,
        [user_id]
      );

    if (
      !user ||
      user.is_deleted
    ) {

      throw {
        status: 404,
        message:
          "User not found"
      };

    }

    if (!user.is_active) {

      throw {
        status: 403,
        message:
          "User inactive"
      };

    }

    const [[company]] =
      await conn.query(
        `
          SELECT
            id,
            owner_user_id,
            is_active,
            is_deleted
          FROM companies
          WHERE id = ?
          LIMIT 1
        `,
        [company_id]
      );

    if (
      !company ||
      company.is_deleted
    ) {

      throw {
        status: 404,
        message:
          "Company not found"
      };

    }

    if (!company.is_active) {

      throw {
        status: 403,
        message:
          "Company inactive"
      };

    }

    const [[existingAccount]] =
      await conn.query(
        `
          SELECT
            *
          FROM bank_accounts
          WHERE
            id = ?
            AND company_id = ?
            AND is_deleted = 0
          LIMIT 1
          FOR UPDATE
        `,
        [
          bank_id,
          company_id
        ]
      );

    if (!existingAccount) {

      throw {
        status: 404,
        message:
          "Bank account not found"
      };

    }

    const permissionResult =
      await checkCompanyPermissions({
        conn,
        user_id,
        company_id,
        permissions: [
          "emp_bnk_update"
        ]
      });

    const isOwner =
      permissionResult.role ===
      "owner";

    const userPermissions =
      permissionResult.permissions || [];

    const bank_owner_type =
      existingAccount.employee_id
        ? "employee"
        : "company";

    if (bank_owner_type === "employee") {




      const [[targetEmployee]] =
        await conn.query(
          `
            SELECT
              id,
              user_id,
              company_id,
              is_active,
              is_deleted
            FROM employees
            WHERE
              id = ?
              AND company_id = ?
            LIMIT 1
          `,
          [
            existingAccount.employee_id,
            company_id
          ]
        );

      if (
        !targetEmployee ||
        targetEmployee.is_deleted
      ) {

        throw {
          status: 404,
          message:
            "Employee not found"
        };

      }

      if (
        !targetEmployee.is_active
      ) {

        throw {
          status: 403,
          message:
            "Employee inactive"
        };

      }




      if (!isOwner) {




        const [[currentEmployee]] =
          await conn.query(
            `
              SELECT
                id,
                user_id,
                is_active,
                is_deleted
              FROM employees
              WHERE
                user_id = ?
                AND company_id = ?
              LIMIT 1
            `,
            [
              user_id,
              company_id
            ]
          );

        if (
          !currentEmployee ||
          currentEmployee.is_deleted
        ) {

          throw {
            status: 403,
            message:
              "Employee not found"
          };

        }

        if (
          !currentEmployee.is_active
        ) {

          throw {
            status: 403,
            message:
              "Employee inactive"
          };

        }




        const isSelfAccount =
          currentEmployee.id ===
          targetEmployee.id;




        const canManageOthers =
          userPermissions.includes(
            "emp_bnk_manage_others"
          );




        if (
          !isSelfAccount &&
          !canManageOthers
        ) {

          throw {
            status: 403,
            message:
              "You do not have permission to update other employee bank accounts"
          };

        }

      }

    } else {




      if (!isOwner) {

        throw {
          status: 403,
          message:
            "Only company owner can update company bank accounts"
        };

      }

    }




    const final = {

      account_type:
        account_type ??
        existingAccount.account_type,

      bank_name:
        bank_name !== undefined
          ? bank_name
          : existingAccount.bank_name,

      account_holder_name:
        account_holder_name !== undefined
          ? account_holder_name
          : existingAccount.account_holder_name,

      account_number:
        account_number !== undefined
          ? account_number
          : existingAccount.account_number,

      ifsc_code:
        ifsc_code !== undefined
          ? ifsc_code
          : existingAccount.ifsc_code,

      branch_name:
        branch_name !== undefined
          ? branch_name
          : existingAccount.branch_name,

      upi_id:
        upi_id !== undefined
          ? upi_id
          : existingAccount.upi_id,

      is_primary:
        is_primary !== undefined
          ? (is_primary ? 1 : 0)
          : existingAccount.is_primary,

      status:
        status ??
        existingAccount.status

    };




    if (
      bank_owner_type ===
      "employee"
    ) {

      if (
        !employeeAccountTypes.includes(
          final.account_type
        )
      ) {

        throw {
          status: 400,
          message:
            `Employee account_type must be one of: ${employeeAccountTypes.join(", ")}`
        };

      }

    } else {

      if (
        !companyAccountTypes.includes(
          final.account_type
        )
      ) {

        throw {
          status: 400,
          message:
            `Company account_type must be one of: ${companyAccountTypes.join(", ")}`
        };

      }

    }




    if (
      final.is_primary === 1 &&
      final.status === "inactive"
    ) {

      throw {
        status: 400,
        message:
          "Inactive account cannot be primary"
      };

    }




    if (
      existingAccount.is_primary === 1 &&
      final.status === "inactive"
    ) {

      throw {
        status: 400,
        message:
          "Cannot deactivate primary account"
      };

    }




    if (
      final.account_type ===
      "cash"
    ) {

      final.bank_name = null;
      final.account_holder_name = null;
      final.account_number = null;
      final.ifsc_code = null;
      final.branch_name = null;
      final.upi_id = null;

      const [[existingCash]] =
        await conn.query(
          `
            SELECT id
            FROM bank_accounts
            WHERE
              company_id = ?
              AND employee_id IS NULL
              AND account_type = 'cash'
              AND id != ?
              AND is_deleted = 0
            LIMIT 1
          `,
          [
            company_id,
            bank_id
          ]
        );

      if (existingCash) {

        throw {
          status: 409,
          message:
            "Cash account already exists"
        };

      }

    }




    if (
      [
        "current",
        "savings",
        "loan"
      ].includes(
        final.account_type
      )
    ) {

      if (
        !final.bank_name ||
        !final.account_holder_name ||
        !final.account_number ||
        !final.ifsc_code
      ) {

        throw {
          status: 400,
          message:
            "bank_name, account_holder_name, account_number and ifsc_code are required"
        };

      }




      final.upi_id = null;




      if (
        final.account_number.length < 6 ||
        final.account_number.length > 50
      ) {

        throw {
          status: 400,
          message:
            "Invalid account number"
        };

      }




      const IFSC_REGEX =
        /^[[A-Z]{4}0[[A-Z0-9]{6}$/;

      if (
        !IFSC_REGEX.test(
          final.ifsc_code
        )
      ) {

        throw {
          status: 400,
          message:
            "Invalid IFSC code"
        };

      }




      final.account_number =
        ENABLE_ACCOUNT_MASKING
          ? maskAccountNumber(
            final.account_number
          )
          : final.account_number;




      const duplicateQuery =
        bank_owner_type ===
          "employee"
          ? `
              SELECT id
              FROM bank_accounts
              WHERE
                company_id = ?
                AND employee_id = ?
                AND account_number = ?
                AND ifsc_code = ?
                AND id != ?
                AND is_deleted = 0
              LIMIT 1
            `
          : `
              SELECT id
              FROM bank_accounts
              WHERE
                company_id = ?
                AND employee_id IS NULL
                AND account_number = ?
                AND ifsc_code = ?
                AND id != ?
                AND is_deleted = 0
              LIMIT 1
            `;

      const duplicateParams =
        bank_owner_type ===
          "employee"
          ? [
            company_id,
            existingAccount.employee_id,
            final.account_number,
            final.ifsc_code,
            bank_id
          ]
          : [
            company_id,
            final.account_number,
            final.ifsc_code,
            bank_id
          ];

      const [[duplicate]] =
        await conn.query(
          duplicateQuery,
          duplicateParams
        );

      if (duplicate) {

        throw {
          status: 409,
          message:
            "Bank account already exists"
        };

      }

    }




    if (
      final.account_type ===
      "upi"
    ) {

      if (!final.upi_id) {

        throw {
          status: 400,
          message:
            "upi_id is required"
        };

      }




      final.bank_name = null;
      final.account_holder_name = null;
      final.account_number = null;
      final.ifsc_code = null;
      final.branch_name = null;




      const UPI_REGEX =
        /^[[a-zA-Z0-9.\-_]{2,256}@[[a-zA-Z]{2,64}$/;

      if (
        !UPI_REGEX.test(
          final.upi_id
        )
      ) {

        throw {
          status: 400,
          message:
            "Invalid UPI ID"
        };

      }




      const upiQuery =
        bank_owner_type ===
          "employee"
          ? `
              SELECT id
              FROM bank_accounts
              WHERE
                company_id = ?
                AND employee_id = ?
                AND upi_id = ?
                AND id != ?
                AND is_deleted = 0
              LIMIT 1
            `
          : `
              SELECT id
              FROM bank_accounts
              WHERE
                company_id = ?
                AND employee_id IS NULL
                AND upi_id = ?
                AND id != ?
                AND is_deleted = 0
              LIMIT 1
            `;

      const upiParams =
        bank_owner_type ===
          "employee"
          ? [
            company_id,
            existingAccount.employee_id,
            final.upi_id,
            bank_id
          ]
          : [
            company_id,
            final.upi_id,
            bank_id
          ];

      const [[existingUpi]] =
        await conn.query(
          upiQuery,
          upiParams
        );

      if (existingUpi) {

        throw {
          status: 409,
          message:
            "UPI already exists"
        };

      }

    }




    if (
      final.is_primary === 1
    ) {

      if (
        bank_owner_type ===
        "employee"
      ) {

        await conn.query(
          `
            UPDATE bank_accounts
            SET
              is_primary = 0,
              updated_by = ?
            WHERE
              employee_id = ?
              AND id != ?
              AND is_deleted = 0
          `,
          [
            user_id,
            existingAccount.employee_id,
            bank_id
          ]
        );

      } else {

        await conn.query(
          `
            UPDATE bank_accounts
            SET
              is_primary = 0,
              updated_by = ?
            WHERE
              company_id = ?
              AND employee_id IS NULL
              AND id != ?
              AND is_deleted = 0
          `,
          [
            user_id,
            company_id,
            bank_id
          ]
        );

      }

    }




    await conn.query(
      `
        UPDATE bank_accounts
        SET
          account_type = ?,

          bank_name = ?,
          account_holder_name = ?,
          account_number = ?,
          ifsc_code = ?,
          branch_name = ?,
          upi_id = ?,

          is_primary = ?,

          status = ?,
          is_active = ?,

          updated_by = ?
        WHERE id = ?
      `,
      [
        final.account_type,

        final.bank_name,
        final.account_holder_name,
        final.account_number,
        final.ifsc_code,
        final.branch_name,
        final.upi_id,

        final.is_primary,

        final.status,
        final.status === "active"
          ? 1
          : 0,

        user_id,
        bank_id
      ]
    );




    const [[updatedAccount]] =
      await conn.query(
        `
          SELECT
            id,
            company_id,
            employee_id,

            account_type,

            bank_name,
            account_holder_name,
            account_number,
            ifsc_code,
            branch_name,
            upi_id,

            is_primary,
            status,
            is_active,

            created_at,
            updated_at
          FROM bank_accounts
          WHERE id = ?
          LIMIT 1
        `,
        [bank_id]
      );




    await conn.commit();

    transactionStarted = false;

    return sendSuccess(
      200,
      "Bank account updated successfully",
      updatedAccount
    );

  } catch (error) {




    if (
      conn &&
      transactionStarted
    ) {

      await conn.rollback();

    }

    console.error(
      "Update bank account error:",
      error
    );

    return sendError(
      error.status || 500,
      error.message ||
      "Internal server error",
      {
        missing_permissions:
          error.missing_permissions ||
          undefined
      }
    );

  } finally {




    if (conn) {
      conn.release();
    }

  }

});


router.delete("/delete", auth(BANK.ALL), async (req, res) => {
  let conn;

  const sendError = (status, message) =>
    res.status(status).json({ success: false, message });

  const sendSuccess = (status, message) =>
    res.status(status).json({ success: true, message });

  try {
    conn = await db.getConnection();

    const userId = Number(req.user?.id);
    const companyId = Number(req.company?.id);

    if (!userId) return sendError(401, "Unauthorized");
    if (!companyId) return sendError(400, "Company context missing");

    const { bank_id } = req.body;

    if (!bank_id) return sendError(400, "bank_id is required");

    await conn.beginTransaction();


    const [[account]] = await conn.query(
      `SELECT * FROM bank_accounts 
       WHERE id=? AND is_deleted=0 
       FOR UPDATE`,
      [bank_id]
    );

    if (!account) {
      await conn.rollback();
      return sendError(404, "Bank account not found");
    }


    const [[company]] = await conn.query(
      `SELECT owner_user_id 
       FROM companies 
       WHERE id=? AND is_deleted=0
       FOR UPDATE`,
      [account.company_id]
    );

    if (!company) {
      await conn.rollback();
      return sendError(404, "Company not found");
    }


    let isOwner = company.owner_user_id === userId;
    let employeeId = null;

    if (!isOwner) {
      const [[employee]] = await conn.query(
        `SELECT id, is_active
         FROM employees
         WHERE user_id=? AND company_id=? AND is_deleted=0
         FOR UPDATE`,
        [userId, account.company_id]
      );

      if (!employee) {
        await conn.rollback();
        return sendError(403, "Not authorized");
      }

      if (!employee.is_active) {
        await conn.rollback();
        return sendError(403, "Employee inactive");
      }

      employeeId = employee.id;


      if (account.employee_id !== employeeId) {
        await conn.rollback();
        return sendError(403, "Cannot delete others' accounts");
      }
    }




    if (!account.employee_id) {
      const [[count]] = await conn.query(
        `SELECT COUNT(*) as total
         FROM bank_accounts
         WHERE company_id=? 
           AND employee_id IS NULL
           AND is_deleted=0`,
        [account.company_id]
      );

      if (count.total <= 1) {
        await conn.rollback();
        return sendError(
          400,
          "Cannot delete last company account"
        );
      }
    }


    if (account.is_primary) {
      let nextPrimary = null;

      if (account.employee_id) {
        const [[other]] = await conn.query(
          `SELECT id FROM bank_accounts
           WHERE employee_id=? 
             AND id<>? 
             AND is_deleted=0
           LIMIT 1
           FOR UPDATE`,
          [account.employee_id, bank_id]
        );
        nextPrimary = other;
      } else {
        const [[other]] = await conn.query(
          `SELECT id FROM bank_accounts
           WHERE company_id=? 
             AND employee_id IS NULL
             AND id<>?
             AND is_deleted=0
           LIMIT 1
           FOR UPDATE`,
          [account.company_id, bank_id]
        );
        nextPrimary = other;
      }

      if (nextPrimary) {
        await conn.query(
          `UPDATE bank_accounts 
           SET is_primary=1 
           WHERE id=?`,
          [nextPrimary.id]
        );
      }
    }


    await conn.query(
      `UPDATE bank_accounts
       SET 
         is_deleted=1,
         deleted_at=NOW(),
         deleted_by=?,
         updated_by=?
       WHERE id=?`,
      [userId, userId, bank_id]
    );

    await conn.commit();

    return sendSuccess(200, "Bank account deleted successfully");

  } catch (err) {
    if (conn) await conn.rollback();

    console.error("Delete bank account error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  } finally {
    if (conn) conn.release();
  }
});


router.get("/my", auth(BANK.ALL), async (req, res) => {

  let conn;




  const sendError = (
    status,
    message,
    extra = {}
  ) => {

    return res.status(status).json({
      success: false,
      message,
      ...extra
    });

  };

  const sendSuccess = (
    data,
    meta = {}
  ) => {

    return res.status(200).json({
      success: true,
      message:
        "Employee bank accounts fetched successfully",
      data,
      meta
    });

  };




  const maskAccountNumber = (
    value
  ) => {

    if (!value) {
      return null;
    }

    const clean =
      String(value).trim();

    if (clean.length <= 4) {
      return clean;
    }

    return `${"*".repeat(
      clean.length - 4
    )}${clean.slice(-4)}`;

  };




  const maskUpiId = (
    value
  ) => {

    if (!value) {
      return null;
    }

    const clean =
      String(value).trim();

    const parts =
      clean.split("@");

    if (parts.length !== 2) {
      return clean;
    }

    const username =
      parts[0];

    const handle =
      parts[1];

    if (username.length <= 2) {
      return `**@${handle}`;
    }

    return `${username.slice(
      0,
      2
    )}${"*".repeat(
      username.length - 2
    )}@${handle}`;

  };

  try {




    conn =
      await db.getConnection();




    const user_id =
      Number(req.user?.id);

    const company_id =
      Number(req.company?.id);

    if (
      !Number.isInteger(user_id) ||
      user_id <= 0
    ) {

      return sendError(
        401,
        "Invalid user authentication"
      );

    }

    if (
      !Number.isInteger(company_id) ||
      company_id <= 0
    ) {

      return sendError(
        401,
        "Invalid company authentication"
      );

    }




    const [[employee]] =
      await conn.query(
        `
          SELECT
            e.id,
            e.company_id,
            e.user_id,
            e.employee_code,
            e.designation,
            e.employment_type,
            e.status,
            e.is_active,
            e.is_deleted,

            u.id AS user_exists,
            u.is_active AS user_is_active,
            u.is_deleted AS user_is_deleted,

            c.id AS company_exists,
            c.is_active AS company_is_active,
            c.is_deleted AS company_is_deleted

          FROM employees e

          INNER JOIN users u
            ON u.id = e.user_id

          INNER JOIN companies c
            ON c.id = e.company_id

          WHERE
            e.user_id = ?
            AND e.company_id = ?
          LIMIT 1
        `,
        [
          user_id,
          company_id
        ]
      );




    if (!employee) {

      return sendError(
        403,
        "Employee record not found"
      );

    }




    if (
      !employee.user_exists
    ) {

      return sendError(
        404,
        "User not found"
      );

    }

    if (
      employee.user_is_deleted
    ) {

      return sendError(
        403,
        "User account deleted"
      );

    }

    if (
      !employee.user_is_active
    ) {

      return sendError(
        403,
        "User account inactive"
      );

    }




    if (
      !employee.company_exists
    ) {

      return sendError(
        404,
        "Company not found"
      );

    }

    if (
      employee.company_is_deleted
    ) {

      return sendError(
        403,
        "Company deleted"
      );

    }

    if (
      !employee.company_is_active
    ) {

      return sendError(
        403,
        "Company inactive"
      );

    }




    if (
      employee.is_deleted
    ) {

      return sendError(
        403,
        "Employee deleted"
      );

    }

    if (
      !employee.is_active
    ) {

      return sendError(
        403,
        "Employee inactive"
      );

    }

    if (
      employee.status !== "active"
    ) {

      return sendError(
        403,
        "Employee not active"
      );

    }

    const employee_id =
      Number(employee.id);




    let {
      page = 1,
      limit = 10,

      search = "",

      status,
      account_type,
      is_primary,

      sort_by = "created_at",
      sort_order = "DESC"
    } = req.query;




    page =
      Number.parseInt(
        page,
        10
      );

    limit =
      Number.parseInt(
        limit,
        10
      );

    page =
      Number.isNaN(page) ||
        page < 1
        ? 1
        : page;

    limit =
      Number.isNaN(limit) ||
        limit < 1
        ? 10
        : limit;

    limit =
      Math.min(limit, 100);

    const offset =
      (page - 1) * limit;




    search =
      String(
        search || ""
      ).trim();




    const allowedStatuses = [
      "active",
      "inactive"
    ];

    const allowedAccountTypes = [
      "cash",
      "current",
      "savings",
      "loan",
      "upi"
    ];

    const allowedSortBy = {
      created_at:
        "ba.created_at",

      updated_at:
        "ba.updated_at",

      bank_name:
        "ba.bank_name",

      account_holder_name:
        "ba.account_holder_name",

      account_type:
        "ba.account_type"
    };

    const allowedSortOrder = [
      "ASC",
      "DESC"
    ];




    if (
      status &&
      !allowedStatuses.includes(
        status
      )
    ) {

      return sendError(
        400,
        "Invalid status filter"
      );

    }




    if (
      account_type &&
      !allowedAccountTypes.includes(
        account_type
      )
    ) {

      return sendError(
        400,
        "Invalid account type filter"
      );

    }




    if (
      !allowedSortBy[
      sort_by
      ]
    ) {

      sort_by =
        "created_at";

    }

    sort_order =
      String(
        sort_order || "DESC"
      ).toUpperCase();

    if (
      !allowedSortOrder.includes(
        sort_order
      )
    ) {

      sort_order =
        "DESC";

    }




    const where = [
      "ba.company_id = ?",
      "ba.employee_id = ?",
      "ba.is_deleted = 0"
    ];

    const params = [
      company_id,
      employee_id
    ];




    if (status) {

      where.push(
        "ba.status = ?"
      );

      params.push(status);

    }




    if (account_type) {

      where.push(
        "ba.account_type = ?"
      );

      params.push(
        account_type
      );

    }




    if (
      is_primary !== undefined &&
      is_primary !== null &&
      is_primary !== ""
    ) {

      const normalized =
        String(
          is_primary
        ).toLowerCase();

      if (
        ![
          "true",
          "false",
          "1",
          "0"
        ].includes(
          normalized
        )
      ) {

        return sendError(
          400,
          "Invalid is_primary filter"
        );

      }

      const primaryValue =
        [
          "true",
          "1"
        ].includes(
          normalized
        )
          ? 1
          : 0;

      where.push(
        "ba.is_primary = ?"
      );

      params.push(
        primaryValue
      );

    }




    if (search) {

      const searchValue =
        `%${search}%`;

      where.push(`
        (
          ba.bank_name LIKE ?
          OR ba.account_holder_name LIKE ?
          OR ba.account_number LIKE ?
          OR ba.ifsc_code LIKE ?
          OR ba.branch_name LIKE ?
          OR ba.upi_id LIKE ?
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

    const whereClause =
      where.join(" AND ");




    const [[countResult]] =
      await conn.query(
        `
          SELECT
            COUNT(*) AS total
          FROM bank_accounts ba
          WHERE ${whereClause}
        `,
        params
      );

    const total =
      Number(
        countResult?.total || 0
      );




    const [rows] =
      await conn.query(
        `
          SELECT
            ba.id,
            ba.company_id,
            ba.employee_id,

            ba.account_type,

            ba.bank_name,
            ba.account_holder_name,
            ba.account_number,
            ba.ifsc_code,
            ba.branch_name,
            ba.upi_id,

            ba.is_primary,

            ba.status,
            ba.is_active,

            ba.created_at,
            ba.updated_at,

            ba.created_by,
            ba.updated_by,

            e.employee_code,
            e.designation,
            e.employment_type

          FROM bank_accounts ba

          INNER JOIN employees e
            ON e.id = ba.employee_id
            AND e.is_deleted = 0

          WHERE ${whereClause}

          ORDER BY
            ba.is_primary DESC,
            ${allowedSortBy[sort_by]} ${sort_order},
            ba.id DESC

          LIMIT ?
          OFFSET ?
        `,
        [
          ...params,
          limit,
          offset
        ]
      );




    const data =
      rows.map((row) => ({

        bank_account_id:
          row.id,

        company_id:
          row.company_id,

        employee_id:
          row.employee_id,

        employee: {

          employee_code: row.employee_code,

          designation: getEnumObject(DESIGNATIONS, row.designation),

          employment_type: getEnumObject(EMPLOYMENT_TYPES, row.employment_type),
        },

        account_type: row.account_type,

        bank_name: row.bank_name,

        account_holder_name: row.account_holder_name,

        account_number: row.account_number,

        masked_account_number: maskAccountNumber(row.account_number),

        ifsc_code: row.ifsc_code,

        branch_name: row.branch_name,

        upi_id: row.upi_id,

        masked_upi_id: maskUpiId(row.upi_id),

        is_primary: Boolean(row.is_primary),

        status: row.status,

        is_active: Boolean(row.is_active),

        created_at: row.created_at,

        updated_at: row.updated_at,

        created_by: row.created_by,

        updated_by: row.updated_by

      }));




    return sendSuccess(
      data,
      {

        page,
        limit,

        total,

        total_pages:
          total > 0
            ? Math.ceil(
              total / limit
            )
            : 0,

        current_page_count:
          data.length,

        has_next_page:
          offset + data.length < total,

        has_previous_page:
          page > 1,

        is_last_page:
          offset + data.length >= total,

        filters: {

          search,

          status:
            status || null,

          account_type:
            account_type || null,

          is_primary:
            is_primary ?? null

        },

        sorting: {

          sort_by,
          sort_order

        }

      }
    );

  } catch (error) {

    console.error(
      "Get employee bank accounts error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Internal server error"
    });

  } finally {

    if (conn) {
      conn.release();
    }

  }

});


router.get("/management/employee", auth(CMP_BANK.MNG), async (req, res) => {

  let conn;

  const sendError = (
    status,
    message,
    extra = {}
  ) => {

    return res.status(status).json({
      success: false,
      message,
      ...extra
    });

  };

  const sendSuccess = (
    data,
    meta = {}
  ) => {

    return res.status(200).json({
      success: true,
      message:
        "Company employee bank accounts fetched successfully",
      data,
      meta
    });

  };

  const maskAccountNumber = (
    value
  ) => {

    if (!value) {
      return null;
    }

    const clean =
      String(value).trim();

    if (clean.length <= 4) {
      return clean;
    }

    return `${"*".repeat(
      clean.length - 4
    )}${clean.slice(-4)}`;

  };

  const maskUpiId = (
    value
  ) => {

    if (!value) {
      return null;
    }

    const clean =
      String(value).trim();

    const parts =
      clean.split("@");

    if (parts.length !== 2) {
      return clean;
    }

    const username =
      parts[0];

    const handle =
      parts[1];

    if (username.length <= 2) {
      return `**@${handle}`;
    }

    return `${username.slice(
      0,
      2
    )}${"*".repeat(
      username.length - 2
    )}@${handle}`;

  };

  try {

    conn =
      await db.getConnection();

    const user_id =
      Number(req.user?.id);

    const company_id =
      Number(req.company?.id);

    if (
      !Number.isInteger(user_id) ||
      user_id <= 0
    ) {

      return sendError(
        401,
        "Invalid user authentication"
      );

    }

    if (
      !Number.isInteger(company_id) ||
      company_id <= 0
    ) {

      return sendError(
        401,
        "Invalid company authentication"
      );

    }

    const [[companyUser]] =
      await conn.query(
        `
          SELECT

            u.id AS user_id,
            u.is_active AS user_is_active,
            u.is_deleted AS user_is_deleted,

            c.id AS company_id,
            c.is_active AS company_is_active,
            c.is_deleted AS company_is_deleted

          FROM users u

          INNER JOIN companies c
            ON c.id = ?

          WHERE
            u.id = ?
          LIMIT 1
        `,
        [
          company_id,
          user_id
        ]
      );

    if (!companyUser) {

      return sendError(
        404,
        "User or company not found"
      );

    }

    if (
      companyUser.user_is_deleted
    ) {

      return sendError(
        403,
        "User account deleted"
      );

    }

    if (
      !companyUser.user_is_active
    ) {

      return sendError(
        403,
        "User account inactive"
      );

    }

    if (
      companyUser.company_is_deleted
    ) {

      return sendError(
        403,
        "Company deleted"
      );

    }

    if (
      !companyUser.company_is_active
    ) {

      return sendError(
        403,
        "Company inactive"
      );

    }

    let {
      page = 1,
      limit = 10,

      search = "",

      employee_id,

      status,
      account_type,
      is_primary,

      sort_by = "created_at",
      sort_order = "DESC"
    } = req.query;

    page =
      Number.parseInt(
        page,
        10
      );

    limit =
      Number.parseInt(
        limit,
        10
      );

    employee_id =
      employee_id !== undefined
        ? Number.parseInt(employee_id, 10)
        : null;

    page =
      Number.isNaN(page) ||
        page < 1
        ? 1
        : page;

    limit =
      Number.isNaN(limit) ||
        limit < 1
        ? 10
        : limit;

    limit =
      Math.min(limit, 100);

    if (
      employee_id !== null &&
      (
        Number.isNaN(employee_id) ||
        employee_id <= 0
      )
    ) {

      return sendError(
        400,
        "Invalid employee_id filter"
      );

    }

    const offset =
      (page - 1) * limit;

    search =
      String(
        search || ""
      ).trim();

    const allowedStatuses = [
      "active",
      "inactive"
    ];

    const allowedAccountTypes = [
      "cash",
      "current",
      "savings",
      "loan",
      "upi"
    ];

    const allowedSortBy = {
      created_at:
        "ba.created_at",

      updated_at:
        "ba.updated_at",

      bank_name:
        "ba.bank_name",

      account_holder_name:
        "ba.account_holder_name",

      account_type:
        "ba.account_type"
    };

    const allowedSortOrder = [
      "ASC",
      "DESC"
    ];

    if (
      status &&
      !allowedStatuses.includes(
        status
      )
    ) {

      return sendError(
        400,
        "Invalid status filter"
      );

    }

    if (
      account_type &&
      !allowedAccountTypes.includes(
        account_type
      )
    ) {

      return sendError(
        400,
        "Invalid account type filter"
      );

    }

    if (
      !allowedSortBy[
      sort_by
      ]
    ) {

      sort_by =
        "created_at";

    }

    sort_order =
      String(
        sort_order || "DESC"
      ).toUpperCase();

    if (
      !allowedSortOrder.includes(
        sort_order
      )
    ) {

      sort_order =
        "DESC";

    }

    const where = [
      "ba.company_id = ?",
      "ba.employee_id IS NOT NULL",

      "ba.is_deleted = 0",
      "e.is_deleted = 0",
      "u.is_deleted = 0"
    ];

    const params = [
      company_id
    ];

    if (employee_id) {

      where.push(
        "ba.employee_id = ?"
      );

      params.push(
        employee_id
      );

    }

    if (status) {

      where.push(
        "ba.status = ?"
      );

      params.push(status);

    }

    if (account_type) {

      where.push(
        "ba.account_type = ?"
      );

      params.push(
        account_type
      );

    }

    if (
      is_primary !== undefined &&
      is_primary !== null &&
      is_primary !== ""
    ) {

      const normalized =
        String(
          is_primary
        ).toLowerCase();

      if (
        ![
          "true",
          "false",
          "1",
          "0"
        ].includes(
          normalized
        )
      ) {

        return sendError(
          400,
          "Invalid is_primary filter"
        );

      }

      const primaryValue =
        [
          "true",
          "1"
        ].includes(
          normalized
        )
          ? 1
          : 0;

      where.push(
        "ba.is_primary = ?"
      );

      params.push(
        primaryValue
      );

    }

    if (search) {

      const searchValue =
        `%${search}%`;

      where.push(`
        (
          ba.bank_name LIKE ?
          OR ba.account_holder_name LIKE ?
          OR ba.account_number LIKE ?
          OR ba.ifsc_code LIKE ?
          OR ba.branch_name LIKE ?
          OR ba.upi_id LIKE ?
          OR e.employee_code LIKE ?
          OR e.designation LIKE ?
          OR u.name LIKE ?
          OR u.email LIKE ?
          OR u.phone LIKE ?
        )
      `);

      params.push(
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue
      );

    }

    const whereClause =
      where.join(" AND ");

    const [[countResult]] =
      await conn.query(
        `
          SELECT
            COUNT(*) AS total

          FROM bank_accounts ba

          INNER JOIN employees e
            ON e.id = ba.employee_id

          INNER JOIN users u
            ON u.id = e.user_id

          WHERE ${whereClause}
        `,
        params
      );

    const total =
      Number(
        countResult?.total || 0
      );

    const [rows] =
      await conn.query(
        `
          SELECT

            ba.id,
            ba.company_id,
            ba.employee_id,

            ba.account_type,

            ba.bank_name,
            ba.account_holder_name,
            ba.account_number,
            ba.ifsc_code,
            ba.branch_name,
            ba.upi_id,

            ba.is_primary,

            ba.status,
            ba.is_active,

            ba.created_at,
            ba.updated_at,

            ba.created_by,
            ba.updated_by,

            e.id AS emp_id,
            e.employee_code,
            e.designation,
            e.employment_type,
            e.status AS employee_status,
            e.joining_date,

            u.id AS linked_user_id,
            u.name AS linked_user_name,
            u.email AS linked_user_email,
            u.phone AS linked_user_phone,
            u.profile_picture

          FROM bank_accounts ba

          INNER JOIN employees e
            ON e.id = ba.employee_id
            AND e.is_deleted = 0

          INNER JOIN users u
            ON u.id = e.user_id
            AND u.is_deleted = 0

          WHERE ${whereClause}

          ORDER BY
            ba.is_primary DESC,
            ${allowedSortBy[sort_by]} ${sort_order},
            ba.id DESC

          LIMIT ?
          OFFSET ?
        `,
        [
          ...params,
          limit,
          offset
        ]
      );

    const data =
      rows.map((row) => ({

        bank_account_id:
          row.id,

        company_id:
          row.company_id,

        employee_id:
          row.employee_id,

        owner_type:
          "employee",

        account_type:
          row.account_type,

        bank_name:
          row.bank_name,

        account_holder_name:
          row.account_holder_name,

        account_number:
          row.account_number,

        masked_account_number:
          maskAccountNumber(
            row.account_number
          ),

        ifsc_code:
          row.ifsc_code,

        branch_name:
          row.branch_name,

        upi_id:
          row.upi_id,

        masked_upi_id:
          maskUpiId(
            row.upi_id
          ),

        is_primary:
          Boolean(
            row.is_primary
          ),

        status:
          row.status,

        is_active:
          Boolean(
            row.is_active
          ),

        created_at:
          row.created_at,

        updated_at:
          row.updated_at,

        created_by:
          row.created_by,

        updated_by:
          row.updated_by,

        employee: {

          id:
            row.emp_id,

          employee_code:
            row.employee_code,

          designation:
            getEnumObject(
              DESIGNATIONS,
              row.designation
            ),

          employment_type:
            getEnumObject(
              DESIGNATIONS,
              row.employment_type
            ),

          joining_date:
            row.joining_date,

          status:
            row.employee_status,

          user: {

            id:
              row.linked_user_id,

            name:
              row.linked_user_name,

            email:
              row.linked_user_email,

            phone:
              row.linked_user_phone,

            profile_picture:
              buildFileUrl(
                row.profile_picture
              )

          }

        }

      }));

    return sendSuccess(
      data,
      {

        total,

        totalPages:
          total > 0
            ? Math.ceil(
              total / limit
            )
            : 0,

        page,
        limit,

        is_last_page:
          offset + rows.length >= total,

        has_next_page:
          offset + rows.length < total,

        has_previous_page:
          page > 1,

        current_page_count:
          rows.length,

        filters: {

          search,

          employee_id:
            employee_id || null,

          status:
            status || null,

          account_type:
            account_type || null,

          is_primary:
            is_primary ?? null

        },

        sorting: {

          sort_by,
          sort_order

        }

      }
    );

  } catch (error) {

    console.error(
      "Company employee bank account list error:",
      error
    );

    return res.status(
      error.status || 500
    ).json({
      success: false,
      message:
        error.message ||
        "Internal server error",

      missing_permissions:
        error.missing_permissions ||
        undefined
    });

  } finally {

    if (conn) {
      conn.release();
    }

  }

});


router.get("/management/company", auth(CMP_BANK.MNG), async (req, res) => {

  let conn;

  const sendError = (
    status,
    message,
    extra = {}
  ) => {

    return res.status(status).json({
      success: false,
      message,
      ...extra
    });

  };

  const sendSuccess = (
    data,
    meta = {}
  ) => {

    return res.status(200).json({
      success: true,
      message:
        "Company banks fetched successfully",
      data,
      meta
    });

  };

  const maskAccountNumber = (
    value
  ) => {

    if (!value) {
      return null;
    }

    const clean =
      String(value).trim();

    if (clean.length <= 4) {
      return clean;
    }

    return `${"*".repeat(
      clean.length - 4
    )}${clean.slice(-4)}`;

  };

  const maskUpiId = (
    value
  ) => {

    if (!value) {
      return null;
    }

    const clean =
      String(value).trim();

    const parts =
      clean.split("@");

    if (parts.length !== 2) {
      return clean;
    }

    const username =
      parts[0];

    const handle =
      parts[1];

    if (username.length <= 2) {
      return `**@${handle}`;
    }

    return `${username.slice(
      0,
      2
    )}${"*".repeat(
      username.length - 2
    )}@${handle}`;

  };

  try {

    conn =
      await db.getConnection();

    const user_id =
      Number(req.user?.id);

    const company_id =
      Number(req.company?.id);

    if (
      !user_id ||
      !company_id
    ) {

      return sendError(
        401,
        "Unauthorized"
      );

    }

    const [[user]] =
      await conn.query(
        `
          SELECT
            id,
            is_active
          FROM users
          WHERE
            id = ?
            AND is_deleted = 0
          LIMIT 1
        `,
        [user_id]
      );

    if (!user) {

      return sendError(
        404,
        "User not found"
      );

    }

    if (!user.is_active) {

      return sendError(
        403,
        "User inactive"
      );

    }

    const [[company]] =
      await conn.query(
        `
          SELECT
            id,
            is_active
          FROM companies
          WHERE
            id = ?
            AND is_deleted = 0
          LIMIT 1
        `,
        [company_id]
      );

    if (!company) {

      return sendError(
        404,
        "Company not found"
      );

    }

    if (!company.is_active) {

      return sendError(
        403,
        "Company inactive"
      );

    }

    await checkCompanyPermissions({
      conn,
      user_id,
      company_id,
      permissions: [
        "emp_bnk_view"
      ]
    });

    let {
      page = 1,
      limit = 10,

      search = "",

      status,
      account_type,
      is_primary,

      sort_by = "created_at",
      sort_order = "DESC"
    } = req.query;

    page =
      Number.parseInt(
        page,
        10
      );

    limit =
      Number.parseInt(
        limit,
        10
      );

    page =
      Number.isNaN(page) ||
        page < 1
        ? 1
        : page;

    limit =
      Number.isNaN(limit) ||
        limit < 1
        ? 10
        : limit;

    limit =
      Math.min(limit, 100);

    const offset =
      (page - 1) * limit;

    search =
      String(
        search || ""
      ).trim();

    const allowedStatuses = [
      "active",
      "inactive"
    ];

    const allowedAccountTypes = [
      "cash",
      "current",
      "savings",
      "loan",
      "upi"
    ];

    const allowedSortBy = {
      created_at:
        "ba.created_at",

      updated_at:
        "ba.updated_at",

      bank_name:
        "ba.bank_name",

      account_holder_name:
        "ba.account_holder_name",

      account_type:
        "ba.account_type"
    };

    const allowedSortOrder = [
      "ASC",
      "DESC"
    ];

    if (
      status &&
      !allowedStatuses.includes(
        status
      )
    ) {

      return sendError(
        400,
        "Invalid status filter"
      );

    }

    if (
      account_type &&
      !allowedAccountTypes.includes(
        account_type
      )
    ) {

      return sendError(
        400,
        "Invalid account type filter"
      );

    }

    if (
      !allowedSortBy[
      sort_by
      ]
    ) {

      sort_by =
        "created_at";

    }

    sort_order =
      String(
        sort_order || "DESC"
      ).toUpperCase();

    if (
      !allowedSortOrder.includes(
        sort_order
      )
    ) {

      sort_order =
        "DESC";

    }

    const where = [
      "ba.company_id = ?",
      "ba.employee_id IS NULL",
      "ba.is_deleted = 0"
    ];

    const params = [
      company_id
    ];

    if (status) {

      where.push(
        "ba.status = ?"
      );

      params.push(status);

    }

    if (account_type) {

      where.push(
        "ba.account_type = ?"
      );

      params.push(
        account_type
      );

    }

    if (
      is_primary !== undefined &&
      is_primary !== null &&
      is_primary !== ""
    ) {

      const normalized =
        String(
          is_primary
        ).toLowerCase();

      if (
        ![
          "true",
          "false",
          "1",
          "0"
        ].includes(
          normalized
        )
      ) {

        return sendError(
          400,
          "Invalid is_primary filter"
        );

      }

      const primaryValue =
        [
          "true",
          "1"
        ].includes(
          normalized
        )
          ? 1
          : 0;

      where.push(
        "ba.is_primary = ?"
      );

      params.push(
        primaryValue
      );

    }

    if (search) {

      const searchValue =
        `%${search}%`;

      where.push(`
        (
          ba.bank_name LIKE ?
          OR ba.account_holder_name LIKE ?
          OR ba.account_number LIKE ?
          OR ba.ifsc_code LIKE ?
          OR ba.branch_name LIKE ?
          OR ba.upi_id LIKE ?
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

    const whereClause =
      where.join(" AND ");

    const [[countResult]] =
      await conn.query(
        `
          SELECT
            COUNT(*) AS total
          FROM bank_accounts ba
          WHERE ${whereClause}
        `,
        params
      );

    const total =
      Number(
        countResult?.total || 0
      );

    const [rows] =
      await conn.query(
        `
          SELECT

            ba.id,
            ba.company_id,
            ba.employee_id,

            ba.account_type,

            ba.bank_name,
            ba.account_holder_name,
            ba.account_number,
            ba.ifsc_code,
            ba.branch_name,
            ba.upi_id,

            ba.is_primary,

            ba.status,
            ba.is_active,

            ba.created_at,
            ba.updated_at,

            ba.created_by,
            ba.updated_by

          FROM bank_accounts ba

          WHERE ${whereClause}

          ORDER BY
            ba.is_primary DESC,
            ${allowedSortBy[sort_by]} ${sort_order},
            ba.id DESC

          LIMIT ?
          OFFSET ?
        `,
        [
          ...params,
          limit,
          offset
        ]
      );

    const data =
      rows.map((row) => ({

        bank_id:
          row.id,

        company_id:
          row.company_id,

        owner_type:
          "company",

        account_type:
          row.account_type,

        bank_name:
          row.account_type === "cash"
            ? "Cash Account"
            : row.bank_name,

        account_holder_name:
          row.account_holder_name,

        account_number:
          row.account_number,

        masked_account_number:
          maskAccountNumber(
            row.account_number
          ),

        ifsc_code:
          row.ifsc_code,

        branch_name:
          row.branch_name,

        upi_id:
          row.upi_id,

        masked_upi_id:
          maskUpiId(
            row.upi_id
          ),

        is_primary:
          Boolean(
            row.is_primary
          ),

        status:
          row.status,

        is_active:
          Boolean(
            row.is_active
          ),

        created_at:
          row.created_at,

        updated_at:
          row.updated_at,

        created_by:
          row.created_by,

        updated_by:
          row.updated_by

      }));

    return sendSuccess(
      data,
      {

        total,

        totalPages:
          total > 0
            ? Math.ceil(
              total / limit
            )
            : 0,

        page,
        limit,

        is_last_page:
          offset + rows.length >= total,

        has_next_page:
          offset + rows.length < total,

        has_previous_page:
          page > 1,

        current_page_count:
          rows.length,

        filters: {

          search,

          status:
            status || null,

          account_type:
            account_type || null,

          is_primary:
            is_primary ?? null

        },

        sorting: {

          sort_by,
          sort_order

        }

      }
    );

  } catch (error) {

    console.error(
      "Company banks error:",
      error
    );

    return res.status(
      error.status || 500
    ).json({
      success: false,
      message:
        error.message ||
        "Internal server error",

      missing_permissions:
        error.missing_permissions ||
        undefined
    });

  } finally {

    if (conn) {
      conn.release();
    }

  }

});


export default router;