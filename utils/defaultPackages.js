import { EMPLOYMENT_TYPES, SALARY_TYPES, LEAVE_TYPES, DESIGNATIONS, ATTENDANCE_METHODS } from "../constants/constants_values.js";
import {
    PROFILE, AT, LEAVE as LEAVE_PERM, LEAVE_CFG, LEAVE_BAL, EMP as EMP_PERM, INV, INV_PKG, SHIFT, SAL,
    SAL_COMP, SAL_PKG, PAY, PAY_ADJ, CMP_BANK, EMP_BANK, HOLIDAY, CMP, PERM_PKG, TXN
} from "../constants/permissions.js";

export async function createDefaultPackages(conn, companyId, userId) {
    const EMPLOYMENT = EMPLOYMENT_TYPES;
    const SALARY = SALARY_TYPES;
    const DESIGNATION = DESIGNATIONS;
    const ATTENDANCE = ATTENDANCE_METHODS;
    const LEAVE = LEAVE_TYPES;

    const [permissionRows] = await conn.query(`
        SELECT id, code FROM permissions
    `);

    if (!permissionRows.length) {
        throw new Error("Permissions table is empty. Run permission seeder first.");
    }

    const permissionMap = new Map();
    for (const row of permissionRows) {
        permissionMap.set(row.code, row.id);
    }

    const salaryComponents = [
        {
            code: "HRA",
            name: "House Rent Allowance",
            type: "earning",
            calcType: "percentage",
            calcValue: 40.00,
            isTaxable: 1,
            isStatutory: 0
        },
        {
            code: "DA",
            name: "Dearness Allowance",
            type: "earning",
            calcType: "percentage",
            calcValue: 10.00,
            isTaxable: 1,
            isStatutory: 0
        },
        {
            code: "SPECIAL_ALLOW",
            name: "Special Allowance",
            type: "earning",
            calcType: "percentage",
            calcValue: 20.00,
            isTaxable: 1,
            isStatutory: 0
        },
        {
            code: "MEDICAL_REIMB",
            name: "Medical Reimbursement",
            type: "earning",
            calcType: "fixed",
            calcValue: 1250.00,
            isTaxable: 0,
            isStatutory: 0
        },
        {
            code: "CONVEYANCE",
            name: "Conveyance Allowance",
            type: "earning",
            calcType: "fixed",
            calcValue: 1600.00,
            isTaxable: 0,
            isStatutory: 0
        },
        {
            code: "PF_EE",
            name: "Employee Provident Fund",
            type: "deduction",
            calcType: "percentage",
            calcValue: 12.00,
            isTaxable: 0,
            isStatutory: 1
        },
        {
            code: "PROF_TAX",
            name: "Professional Tax",
            type: "deduction",
            calcType: "fixed",
            calcValue: 200.00,
            isTaxable: 0,
            isStatutory: 1
        },
        {
            code: "TDS",
            name: "Tax Deduction at Source",
            type: "deduction",
            calcType: "percentage",
            calcValue: 10.00,
            isTaxable: 0,
            isStatutory: 1
        }
    ];

    const salaryPackages = [
        {
            code: "EXEC_CTC",
            name: "Executive CTC Package",
            description: "Comprehensive CTC package with allowances, statutory deductions, and tax withholdings for executive-level employees.",
            components: ["HRA", "DA", "SPECIAL_ALLOW", "CONVEYANCE", "PF_EE", "PROF_TAX", "TDS"]
        },
        {
            code: "STAFF_STANDARD",
            name: "Staff Standard Package",
            description: "Standard salary structure with basic pay, house rent allowance, conveyance, and standard PF and Professional Tax.",
            components: ["HRA", "CONVEYANCE", "PF_EE", "PROF_TAX"]
        },
        {
            code: "INTERN_STIPEND",
            name: "Intern Stipend Structure",
            description: "Simplified stipend structure for interns with basic allowance and TDS deduction only.",
            components: ["TDS"]
        },
        {
            code: "CONTRACTOR_FIXED",
            name: "Contractor Fixed Pay",
            description: "Gross salary package for contract employees with no allowances or statutory deductions.",
            components: []
        }
    ];

    const permissionPackages = [
        {
            name: "Super Admin",
            groupCode: "SUPER_ADMIN",
            description: "Complete unrestricted access to all company modules and operations.",
            permissions: [...permissionMap.keys()]
        },
        {
            name: "HR Admin",
            groupCode: "HR_ADMIN",
            description: "Manages employees, leaves, attendance, invites, shifts, holidays and company HR settings.",
            permissions: [
                ...PROFILE.EMP,
                ...PROFILE.MNG,
                ...AT.EMP,
                ...AT.MNG,
                ...LEAVE_PERM.EMP,
                ...LEAVE_PERM.MNG,
                ...LEAVE_CFG.MNG,
                ...LEAVE_BAL.EMP,
                ...LEAVE_BAL.MNG,
                ...EMP_PERM.MNG,
                ...INV.MNG,
                ...INV_PKG.MNG,
                ...SHIFT.EMP,
                ...SHIFT.MNG,
                ...HOLIDAY.MNG,
                CMP.MNG.find(p => p === "company_view"),
                PERM_PKG.MNG.find(p => p === "permission_package_view")
            ].filter(Boolean)
        },
        {
            name: "Payroll Admin",
            groupCode: "PAYROLL_ADMIN",
            description: "Handles salary structures, payroll processing, adjustments, and financial operations.",
            permissions: [
                ...PROFILE.EMP,
                ...SAL.EMP,
                ...SAL.MNG,
                ...SAL_COMP.MNG,
                ...SAL_PKG.MNG,
                ...PAY.EMP,
                ...PAY.MNG,
                ...PAY_ADJ.MNG,
                ...CMP_BANK.MNG,
                ...EMP_BANK.MNG,
                ...TXN.MNG,
                CMP.MNG.find(p => p === "company_view")
            ].filter(Boolean)
        },
        {
            name: "Manager",
            groupCode: "MANAGER",
            description: "Handles team attendance, leave approvals, and supervisor tasks.",
            permissions: [
                ...PROFILE.EMP,
                ...AT.EMP,
                ...LEAVE_PERM.EMP,
                ...LEAVE_BAL.EMP,
                ...SHIFT.EMP,
                ...SAL.EMP,
                ...PAY.EMP,
                ...PROFILE.MNG,
                ...AT.MNG,
                ...LEAVE_PERM.MNG,
                LEAVE_BAL.MNG.find(p => p === "leave_balance_view_all"),
                EMP_PERM.MNG.find(p => p === "employee_view"),
                EMP_PERM.MNG.find(p => p === "employee_view_all"),
                SHIFT.MNG.find(p => p === "shift_view_all"),
                HOLIDAY.MNG.find(p => p === "holiday_view"),
                CMP.MNG.find(p => p === "company_view")
            ].filter(Boolean)
        },
        {
            name: "Employee",
            groupCode: "EMPLOYEE",
            description: "Standard self-service employee portal access.",
            permissions: [
                ...PROFILE.EMP,
                ...AT.EMP,
                ...LEAVE_PERM.EMP,
                ...LEAVE_BAL.EMP,
                ...SHIFT.EMP,
                ...SAL.EMP,
                ...PAY.EMP,
                HOLIDAY.MNG.find(p => p === "holiday_view")
            ].filter(Boolean)
        }
    ];

    const leaveConfigs = [
        {
            code: LEAVE.SICK.value,
            name: LEAVE.SICK.label,
            isPaid: 1,
            allowHalfDay: 1,
            maxBalance: 12.00,
            carryForwardLimit: 6.00,
            excludeWeekends: 1
        },
        {
            code: LEAVE.CASUAL.value,
            name: LEAVE.CASUAL.label,
            isPaid: 1,
            allowHalfDay: 1,
            maxBalance: 12.00,
            carryForwardLimit: 0.00,
            excludeWeekends: 1
        },
        {
            code: LEAVE.EARNED.value,
            name: LEAVE.EARNED.label,
            isPaid: 1,
            allowHalfDay: 0,
            maxBalance: 24.00,
            carryForwardLimit: 10.00,
            excludeWeekends: 1
        },
        {
            code: LEAVE.UNPAID.value,
            name: LEAVE.UNPAID.label,
            isPaid: 0,
            allowHalfDay: 1,
            maxBalance: null,
            carryForwardLimit: 0.00,
            excludeWeekends: 0
        },
        {
            code: LEAVE.MATERNITY.value,
            name: LEAVE.MATERNITY.label,
            isPaid: 1,
            allowHalfDay: 0,
            maxBalance: 90.00,
            carryForwardLimit: 0.00,
            excludeWeekends: 0
        }
    ];

    const invitePackages = [
        {
            code: "FT_OFFICE",
            name: "Full-time Office Employee",
            designation: DESIGNATION.SENIOR_EMPLOYEE.value,
            salaryType: SALARY.MONTHLY.value,
            employmentType: EMPLOYMENT.FULL_TIME.value,
            shiftStart: "09:00:00",
            shiftEnd: "18:00:00",
            breakMinutes: 60,
            graceMinutes: 15,
            weekends: ["saturday", "sunday"],
            attendanceMethods: [ATTENDANCE.MANUAL.value],
            autoApprove: 0,
            permissionPackage: "Employee",
            componentPackage: "STAFF_STANDARD"
        },
        {
            code: "TEAM_MANAGER",
            name: "Team Manager",
            designation: DESIGNATION.MANAGER.value,
            salaryType: SALARY.MONTHLY.value,
            employmentType: EMPLOYMENT.FULL_TIME.value,
            shiftStart: "09:00:00",
            shiftEnd: "18:30:00",
            breakMinutes: 60,
            graceMinutes: 15,
            weekends: ["saturday", "sunday"],
            attendanceMethods: [ATTENDANCE.MANUAL.value],
            autoApprove: 1,
            permissionPackage: "Manager",
            componentPackage: "EXEC_CTC"
        },
        {
            code: "HR_ADMIN",
            name: "HR Admin",
            designation: DESIGNATION.HR_MANAGER.value,
            salaryType: SALARY.MONTHLY.value,
            employmentType: EMPLOYMENT.FULL_TIME.value,
            shiftStart: "09:30:00",
            shiftEnd: "18:30:00",
            breakMinutes: 60,
            graceMinutes: 15,
            weekends: ["saturday", "sunday"],
            attendanceMethods: [ATTENDANCE.MANUAL.value],
            autoApprove: 1,
            permissionPackage: "HR Admin",
            componentPackage: "EXEC_CTC"
        },
        {
            code: "OFFICE_INTERN",
            name: "Office Intern",
            designation: DESIGNATION.JUNIOR_EMPLOYEE.value,
            salaryType: SALARY.MONTHLY.value,
            employmentType: EMPLOYMENT.INTERN.value,
            shiftStart: "10:00:00",
            shiftEnd: "17:00:00",
            breakMinutes: 45,
            graceMinutes: 15,
            weekends: ["saturday", "sunday"],
            attendanceMethods: [ATTENDANCE.MANUAL.value],
            autoApprove: 0,
            permissionPackage: "Employee",
            componentPackage: "INTERN_STIPEND"
        }
    ];

    try {
        await conn.beginTransaction();

        const salaryComponentMap = {};

        for (const component of salaryComponents) {
            const [result] = await conn.query(`
                INSERT INTO salary_components (
                    company_id,
                    code,
                    name,
                    type,
                    calc_type,
                    calc_value,
                    is_taxable,
                    is_statutory,
                    is_active,
                    created_by,
                    updated_by,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(), NOW())
            `, [
                companyId,
                component.code,
                component.name,
                component.type,
                component.calcType,
                component.calcValue,
                component.isTaxable,
                component.isStatutory,
                userId,
                userId
            ]);

            salaryComponentMap[component.code] = result.insertId;
        }

        const salaryPackageMap = {};

        for (const pkg of salaryPackages) {
            const [pkgResult] = await conn.query(`
                INSERT INTO salary_component_packages (
                    company_id,
                    name,
                    code,
                    description,
                    is_active,
                    created_by,
                    updated_by,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, 1, ?, ?, NOW(), NOW())
            `, [
                companyId,
                pkg.name,
                pkg.code,
                pkg.description,
                userId,
                userId
            ]);

            const packageId = pkgResult.insertId;
            salaryPackageMap[pkg.code] = packageId;

            const packageItemsValues = [];
            for (const componentCode of pkg.components) {
                const componentId = salaryComponentMap[componentCode];
                if (!componentId) {
                    console.warn(`Salary component '${componentCode}' not found — skipping association.`);
                    continue;
                }
                packageItemsValues.push([
                    packageId,
                    componentId,
                    userId,
                    userId
                ]);
            }

            if (packageItemsValues.length) {
                const placeholders = packageItemsValues
                    .map(() => "(?, ?, 1, ?, ?, NOW(), NOW())")
                    .join(",");

                await conn.query(`
                    INSERT INTO salary_component_package_items (
                        package_id,
                        component_id,
                        is_active,
                        created_by,
                        updated_by,
                        created_at,
                        updated_at
                    )
                    VALUES ${placeholders}
                `, packageItemsValues.flat());
            }
        }

        const permissionPackageMap = {};

        for (const pkg of permissionPackages) {
            const [result] = await conn.query(`
                INSERT INTO permission_packages (
                    company_id,
                    package_name,
                    group_code,
                    description,
                    is_active,
                    created_by,
                    updated_by,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, 1, ?, ?, NOW(), NOW())
            `, [
                companyId,
                pkg.name,
                pkg.groupCode,
                pkg.description,
                userId,
                userId
            ]);

            const packageId = result.insertId;
            permissionPackageMap[pkg.name] = packageId;

            const permissionValues = [];
            for (const permissionCode of pkg.permissions) {
                const permissionId = permissionMap.get(permissionCode);
                if (!permissionId) {
                    console.warn(`Permission '${permissionCode}' not found in DB — skipping association.`);
                    continue;
                }
                permissionValues.push([
                    packageId,
                    permissionId,
                    userId,
                    userId
                ]);
            }

            if (permissionValues.length) {
                const placeholders = permissionValues
                    .map(() => "(?, ?, 1, NOW(), NOW(), ?, ?)")
                    .join(",");

                await conn.query(`
                    INSERT INTO permission_package_items (
                        package_id,
                        permission_id,
                        is_active,
                        created_at,
                        updated_at,
                        created_by,
                        updated_by
                    )
                    VALUES ${placeholders}
                `, permissionValues.flat());
            }
        }

        const invitePackageIds = [];

        for (const pkg of invitePackages) {
            const permissionPackageId = permissionPackageMap[pkg.permissionPackage];
            const salaryPackageId = salaryPackageMap[pkg.componentPackage];

            if (!permissionPackageId) {
                throw new Error(`Failed to resolve permission package '${pkg.permissionPackage}' for invite package '${pkg.code}'.`);
            }
            if (!salaryPackageId) {
                throw new Error(`Failed to resolve salary component package '${pkg.componentPackage}' for invite package '${pkg.code}'.`);
            }

            const [result] = await conn.query(`
                INSERT INTO invite_packages (
                    company_id,
                    code,
                    name,
                    designation,
                    salary_type,
                    employment_type,
                    shift_start,
                    shift_end,
                    break_minutes,
                    grace_minutes,
                    permission_package_id,
                    weekends,
                    attendance_methods,
                    auto_approve,
                    component_package,
                    is_active,
                    created_by,
                    updated_by,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(), NOW())
            `, [
                companyId,
                pkg.code,
                pkg.name,
                pkg.designation,
                pkg.salaryType,
                pkg.employmentType,
                pkg.shiftStart,
                pkg.shiftEnd,
                pkg.breakMinutes,
                pkg.graceMinutes,
                permissionPackageId,
                JSON.stringify(pkg.weekends),
                JSON.stringify(pkg.attendanceMethods),
                pkg.autoApprove,
                salaryPackageId,
                userId,
                userId
            ]);

            invitePackageIds.push(result.insertId);
        }

        for (const leave of leaveConfigs) {
            await conn.query(`
                INSERT INTO leave_configs (
                    company_id,
                    code,
                    name,
                    is_paid,
                    allow_half_day,
                    max_balance,
                    carry_forward_limit,
                    exclude_weekends,
                    is_active,
                    created_by,
                    updated_by,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(), NOW())
            `, [
                companyId,
                leave.code,
                leave.name,
                leave.isPaid,
                leave.allowHalfDay,
                leave.maxBalance,
                leave.carryForwardLimit,
                leave.excludeWeekends,
                userId,
                userId
            ]);
        }

        await conn.commit();

        return {
            success: true,
            message: "Default company setup created successfully.",
            data: {
                permissionPackages: permissionPackageMap,
                invitePackageIds
            }
        };

    } catch (error) {
        await conn.rollback();
        console.error("DEFAULT PACKAGE CREATION ERROR:", error);
        throw error;
    }
}