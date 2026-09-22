import express from "express";
import crypto from "crypto";
import db from "../config/db.js";
import auth from "../middleware/authMiddleware.js";
import { sendSuccess, sendError } from "../utils/sendResponse.js";
import {
    getISTNow,
    parseISTDateTime,
    formatIST,
    isDateTimeBefore,
    isDateTimeAfter,
    isDateTimeSame,
    getDateTimeDiffDays,
} from "../utils/time.js";
import { buildFileUrl } from "../utils/fileService.js";
import axios from "axios";
import { ZWITCH_PAYMENT_TOKEN_URL, ZWITCH_API_KEY, ZWITCH_API_SECRET } from "../config/config.js";

const router = express.Router();

// Alias for backward compatibility
const toISTString = (date) => formatIST(date);

const ALLOWED_PACKAGE_PERIODS = [
    "monthly",
    "quarterly",
    "half_yearly",
    "yearly"
];

function getSubscriptionAmount(subscriptionPackage, package_period) {
    switch (package_period) {
        case "monthly":
            return Number(subscriptionPackage.monthly_price || 0);
        case "quarterly":
            return Number(subscriptionPackage.quarterly_price || 0);
        case "half_yearly":
            return Number(subscriptionPackage.half_yearly_price || 0);
        case "yearly":
            return Number(subscriptionPackage.yearly_price || 0);
        default:
            return 0;
    }
}

function validateOwnerProfile(owner) {
    if (!owner) {
        return "User not found.";
    }

    if (!owner.name?.trim()) {
        return "Name is required. Please update name in your profile.";
    }

    if (!owner.phone?.trim()) {
        return "Phone is required. Please update phone in your profile.";
    }

    if (!owner.email?.trim()) {
        return "Email is required. Please update email in your profile.";
    }

    return null;
}

async function createZwitchPaymentToken({
    amount_paid,
    name,
    mobile,
    email,
    package_id,
    subscriptionPackage
}) {
    const apiUrl = ZWITCH_PAYMENT_TOKEN_URL;
    const accessKey = ZWITCH_API_KEY;
    const apiSecret = ZWITCH_API_SECRET;

    if (!apiUrl || !accessKey || !apiSecret) {
        throw new Error("Payment gateway is not configured.");
    }

    const order_id = crypto.randomBytes(16).toString("hex");
    const authToken = `${accessKey}:${apiSecret}`;

    const payload = {
        amount: amount_paid,
        contact_number: mobile,
        email_id: email,
        currency: "INR",
        mtx: order_id,
        udf: {
            key_1: name,
            key_2: String(subscriptionPackage.min_employee_count ?? 0),
            key_3: String(subscriptionPackage.max_employee_count ?? 0),
            key_4: String(package_id)
        }
    };

    const { data } = await axios.post(apiUrl, payload, {
        headers: {
            "Access-Key": accessKey,
            Authorization: `Bearer ${authToken}`,
            Accept: "application/json",
            "Content-Type": "application/json"
        }
    });

    if (data?.status !== "created" || !data?.id) {
        throw new Error(data?.message || "Failed to create payment token.");
    }

    return {
        payment_token: data.id,
        order_id
    };
}

async function createCompanySubscription(
    conn,
    {
        company_id,
        user_id,
        subscriptionPackage,
        package_period,
        amount_paid,
        payment_reference = null,
        package_type = "normal",
        payment_status = "1",
        payment_order_id = null
    }
) {
    const now = getISTNow();

    const [lastSubscriptionRows] = await conn.query(
        `
        SELECT
            expires_at
        FROM company_subscriptions
        WHERE company_id = ?
            AND is_active = 1
            AND is_deleted = 0
            AND payment_status = '1'
        ORDER BY expires_at DESC
        LIMIT 1
        `,
        [company_id]
    );

    let startsAt = now;

    const latestExpiry =
        lastSubscriptionRows.length
            ? parseISTDateTime(
                lastSubscriptionRows[0].expires_at
            )
            : null;

    if (latestExpiry && latestExpiry.isAfter(now)) {
        startsAt = latestExpiry;
    }

    let expiresAt = startsAt.clone();

    switch (package_period) {
        case "monthly":
            expiresAt = expiresAt.add(1, "month");
            break;
        case "quarterly":
            expiresAt = expiresAt.add(3, "month");
            break;
        case "half_yearly":
            expiresAt = expiresAt.add(6, "month");
            break;
        case "yearly":
            expiresAt = expiresAt.add(1, "year");
            break;
    }

    await conn.query(
        `
        INSERT INTO company_subscriptions
        (
            company_id,
            package_id,
            package_type,
            employee_limit,
            subscription_type,
            amount_paid,
            starts_at,
            expires_at,
            payment_reference,
            payment_status,
            payment_order_id,
            is_active,
            created_by,
            updated_by
        )
        VALUES
        (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?
        )
        `,
        [
            company_id,
            subscriptionPackage.id,
            package_type,
            subscriptionPackage.max_employee_count,
            package_period,
            amount_paid,
            toISTString(startsAt),
            toISTString(expiresAt),
            payment_reference,
            payment_status,
            payment_order_id,
            user_id,
            user_id
        ]
    );
}

router.get("/packages", auth([], { owner_only: true }), async (req, res) => {
    let conn;

    try {
        conn = await db.getConnection();

        const [rows] = await conn.query(
            `
            SELECT
                sp.id,
                sp.name,
                sp.min_employee_count,
                sp.max_employee_count,
                sp.monthly_price,
                sp.quarterly_price,
                sp.half_yearly_price,
                sp.yearly_price,
                sp.accept_periods
            FROM subscription_packages sp
            WHERE sp.is_active = 1
              AND sp.is_deleted = 0
            ORDER BY sp.min_employee_count ASC
            `
        );

        const packages = rows.map((pkg) => {
            let acceptedPeriods = [];

            try {
                acceptedPeriods = JSON.parse(
                    pkg.accept_periods || "[]"
                );
            } catch {
                acceptedPeriods = [];
            }

            const packageData = {
                id: pkg.id,
                name: pkg.name,
                min_employee_count: pkg.min_employee_count,
                max_employee_count: pkg.max_employee_count,
            };

            if (acceptedPeriods.includes("monthly")) {
                packageData.monthly_price = Number(pkg.monthly_price || 0);
            }

            if (acceptedPeriods.includes("quarterly")) {
                packageData.quarterly_price = Number(pkg.quarterly_price || 0);
            }

            if (acceptedPeriods.includes("half_yearly")) {
                packageData.half_yearly_price = Number(pkg.half_yearly_price || 0);
            }

            if (acceptedPeriods.includes("yearly")) {
                packageData.yearly_price = Number(pkg.yearly_price || 0);
            }

            return packageData;
        });

        return sendSuccess(
            res,
            200,
            "Subscription packages fetched successfully",
            packages
        );

    } catch (error) {
        console.error(
            "Error fetching subscription packages:",
            {
                message: error.message,
                stack: error.stack
            }
        );

        return sendError(
            res,
            500,
            "Failed to fetch subscription packages"
        );

    } finally {
        if (conn) conn.release();
    }
});

router.post("/purchase-subscription", auth([], { owner_only: true }), async (req, res) => {
    let conn;

    try {
        const company_id = req.company?.id;
        const user_id = req.user?.id;
        const { package_id, package_period } = req.body;

        if (!company_id) {
            return sendError(res, 400, "Company not found.");
        }

        if (!package_id) {
            return sendError(res, 400, "Package is required.");
        }

        if (!ALLOWED_PACKAGE_PERIODS.includes(package_period)) {
            return sendError(res, 400, "Invalid package period.");
        }

        conn = await db.getConnection();

        const [companyRows] = await conn.query(
            `
            SELECT
                id,
                owner_user_id,
                is_active
            FROM companies
            WHERE id = ?
              AND is_deleted = 0
            LIMIT 1
            `,
            [company_id]
        );

        if (!companyRows.length) {
            return sendError(res, 404, "Company not found.");
        }

        const company = companyRows[0];

        if (!company.is_active) {
            return sendError(res, 400, "Company is inactive.");
        }

        if (Number(company.owner_user_id) !== Number(user_id)) {
            return sendError(
                res,
                403,
                "Only company owner can purchase subscriptions."
            );
        }

        const [packageRows] = await conn.query(
            `
            SELECT *
            FROM subscription_packages
            WHERE id = ?
              AND is_active = 1
              AND is_deleted = 0
            LIMIT 1
            `,
            [package_id]
        );

        if (!packageRows.length) {
            return sendError(res, 404, "Subscription package not found.");
        }

        const subscriptionPackage = packageRows[0];

        let acceptedPeriods = [];

        try {
            acceptedPeriods = JSON.parse(
                subscriptionPackage.accept_periods || "[]"
            );
        } catch {
            acceptedPeriods = [];
        }

        if (
            acceptedPeriods.length &&
            !acceptedPeriods.includes(package_period)
        ) {
            return sendError(
                res,
                400,
                `Package does not support '${package_period}' subscription.`
            );
        }

        const amount_paid = getSubscriptionAmount(
            subscriptionPackage,
            package_period
        );

        if (amount_paid > 0) {
            const [ownerRows] = await conn.query(
                `
                SELECT name, phone, email
                FROM users
                WHERE id = ?
                LIMIT 1
                `,
                [user_id]
            );

            const profileError = validateOwnerProfile(ownerRows[0]);

            if (profileError) {
                return sendError(res, 400, profileError);
            }

            const { name, phone, email } = ownerRows[0];

            const payment = await createZwitchPaymentToken({
                amount_paid,
                name: name.trim(),
                mobile: phone.trim(),
                email: email.trim(),
                package_id,
                subscriptionPackage
            });

            await conn.beginTransaction();

            await createCompanySubscription(conn, {
                company_id,
                user_id,
                subscriptionPackage,
                package_period,
                amount_paid,
                payment_reference: payment.payment_token,
                payment_status: "0",
                payment_order_id: payment.order_id
            });

            await conn.commit();

            return sendSuccess(
                res,
                200,
                "Payment token generated successfully",
                {
                    payment_token: payment.payment_token,
                    order_id: payment.order_id
                }
            );
        }

        await conn.beginTransaction();

        await createCompanySubscription(conn, {
            company_id,
            user_id,
            subscriptionPackage,
            package_period,
            amount_paid,
            payment_reference: null,
            payment_status: "1"
        });

        await conn.commit();

        return sendSuccess(
            res,
            200,
            "Subscription purchased successfully."
        );

    } catch (err) {
        console.error("[PURCHASE_SUBSCRIPTION_ERROR]", err);

        if (conn) {
            try {
                await conn.rollback();
            } catch (rollbackErr) {
                console.error(
                    "[PURCHASE_SUBSCRIPTION_ROLLBACK_ERROR]",
                    rollbackErr
                );
            }
        }

        const statusCode =
            err.response?.status >= 400 && err.response?.status < 500
                ? 400
                : 500;

        const message =
            err.response?.data?.message ||
            err.message ||
            "An error occurred while processing the subscription.";

        return sendError(res, statusCode, message);

    } finally {
        if (conn) {
            conn.release();
        }
    }
});

router.get("/details", auth([], { owner_only: true }), async (req, res) => {
    let conn;

    try {
        conn = await db.getConnection();

        const company_id = req.company?.id;
        const user_id = req.user?.id;

        if (!company_id) {
            return sendError(
                res,
                404,
                "Company not found."
            );
        }

        const [companyRows] = await conn.query(
            `
            SELECT
                c.id,
                c.owner_user_id,
                c.name,
                c.legal_name,
                c.logo_url,
                c.is_active,
                c.address_line1,
                c.address_line2,
                c.city,
                c.state,
                c.postal_code,
                c.country
            FROM companies c
            WHERE c.id = ?
              AND c.is_deleted = 0
            LIMIT 1
            `,
            [company_id]
        );

        if (!companyRows.length) {
            return sendError(
                res,
                404,
                "Company not found."
            );
        }

        const company = companyRows[0];

        if (
            Number(company.owner_user_id) !== Number(user_id)
        ) {
            return sendError(
                res,
                403,
                "Access denied."
            );
        }

        const [employeeRows] = await conn.query(
            `
            SELECT COUNT(*) AS total
            FROM employees
            WHERE company_id = ?
              AND is_deleted = 0
              AND is_active = 1
            `,
            [company_id]
        );

        const employee_count = Number(
            employeeRows[0]?.total || 0
        );

        const [subscriptionRows] = await conn.query(
            `
            SELECT
                cs.id,
                cs.package_id,
                cs.package_type,
                cs.employee_limit,
                cs.subscription_type,
                cs.amount_paid,
                cs.starts_at,
                cs.expires_at,
                cs.payment_reference,
                cs.payment_status,
                cs.payment_order_id,
                cs.payment_vpa,
                cs.payment_utr,
                COALESCE(sp.name, csp.name) AS package_name
            FROM company_subscriptions cs
            LEFT JOIN subscription_packages sp
                ON cs.package_type = 'normal'
               AND sp.id = cs.package_id
               AND sp.is_deleted = 0
            LEFT JOIN custom_subscription_packages csp
                ON cs.package_type = 'custom'
               AND csp.id = cs.package_id
               AND csp.is_deleted = 0
            WHERE cs.company_id = ?
              AND cs.is_deleted = 0
              AND cs.payment_status = '1'
            ORDER BY cs.starts_at ASC
            `,
            [company_id]
        );

        const nowString = toISTString(
            getISTNow()
        );

        const subscriptions = subscriptionRows.map(
            (sub) => {
                let status = "used";

                if (
                    isDateTimeBefore(
                        nowString,
                        sub.starts_at
                    )
                ) {
                    status = "upcoming";
                } else if (
                    (
                        isDateTimeSame(
                            nowString,
                            sub.starts_at
                        ) ||
                        isDateTimeAfter(
                            nowString,
                            sub.starts_at
                        )
                    ) &&
                    isDateTimeBefore(
                        nowString,
                        sub.expires_at
                    )
                ) {
                    status = "active";
                }

                return {
                    id: sub.id,
                    package_id: sub.package_id,
                    subscription_package_id: sub.package_id,
                    package_type: sub.package_type,
                    package_name: sub.package_name,
                    subscription_type: sub.subscription_type,
                    employee_limit: sub.employee_limit,
                    amount_paid: sub.amount_paid,
                    starts_at: sub.starts_at,
                    expires_at: sub.expires_at,
                    payment_reference: sub.payment_reference,
                    status
                };
            }
        );

        const formattedSubscriptions = subscriptions
            .map((sub) => {
                let type = "used";

                if (sub.status === "active") {
                    type = "current";
                } else if (sub.status === "upcoming") {
                    type = "upcoming";
                }

                return {
                    id: sub.id,
                    package_id: sub.package_id,
                    subscription_package_id: sub.package_id,
                    package_name: sub.package_name,
                    subscription_type: sub.subscription_type,
                    package_type: sub.package_type,
                    employee_limit: sub.employee_limit,
                    amount_paid: sub.amount_paid,
                    starts_at: sub.starts_at,
                    expires_at: sub.expires_at,
                    payment_reference: sub.payment_reference,
                    type,

                    ...(type === "current" && {
                        days_remaining: getDateTimeDiffDays(
                            nowString,
                            sub.expires_at
                        )
                    }),

                    ...(type === "upcoming" && {
                        until_start: getDateTimeDiffDays(
                            nowString,
                            sub.starts_at
                        )
                    })
                };
            })
            .sort((a, b) => {
                const priority = {
                    current: 1,
                    upcoming: 2,
                    used: 3
                };

                if (priority[a.type] !== priority[b.type]) {
                    return priority[a.type] - priority[b.type];
                }

                // Upcoming subscriptions -> nearest first
                if (a.type === "upcoming") {
                    return (
                        new Date(a.starts_at) -
                        new Date(b.starts_at)
                    );
                }

                // Used subscriptions -> latest first
                if (a.type === "used") {
                    return (
                        new Date(b.starts_at) -
                        new Date(a.starts_at)
                    );
                }

                return 0;
            });

        const currentSubscription =
            formattedSubscriptions.find(
                (sub) =>
                    sub.type ===
                    "current"
            ) || null;

        const employee_available =
            currentSubscription
                ? Math.max(
                    0,
                    Number(
                        currentSubscription.employee_limit
                    ) - employee_count
                )
                : 0;

        const companyData = {
            id: company.id,
            name: company.name,
            legal_name:
                company.legal_name,
            logo_url:
                buildFileUrl(
                    company.logo_url
                ),
            is_active:
                Boolean(
                    company.is_active
                ),
            address_line1:
                company.address_line1,
            address_line2:
                company.address_line2,
            city: company.city,
            state: company.state,
            postal_code:
                company.postal_code,
            country:
                company.country,
            active_subscription:
                !!currentSubscription,
            employee_count,
            employee_available,
            queued_subscriptions:
                formattedSubscriptions.filter(
                    (sub) =>
                        sub.type ===
                        "upcoming"
                ).length
        };

        return sendSuccess(
            res,
            200,
            "Subscription details fetched successfully.",
            {
                company: companyData,
                subscriptions:
                    formattedSubscriptions
            }
        );
    } catch (err) {
        console.error(
            "[GET_SUBSCRIPTION_DETAILS_ERROR]",
            err
        );

        return sendError(
            res,
            500,
            err.message ||
            "Failed to fetch subscription details."
        );
    } finally {
        if (conn) {
            conn.release();
        }
    }
});

export default router;