import express from "express";
import {
  DESIGNATIONS,
  EMPLOYMENT_TYPES,
  SALARY_TYPES,
  INVITE_STATUSES,
  EMPLOYEE_STATUSES,
  PUNCH_TYPES,
  ATTENDANCE_METHODS,
  ATTENDANCE_MODES,
  LEAVE_TYPES,
  HALF_DAY_TYPES,
  LEAVE_STATUSES,
  ACCRUAL_TYPES,
  PAY_ROLL_STATUSES,
  PAYMENT_METHODS,
  CURRENCY_TYPES
} from "../constants/constants_values.js";

const router = express.Router();


const objectToArray = (obj) =>
  Object.entries(obj).map(([key, value]) => ({
    key,
    value,
  }));


const CONSTANT_MAP = {
  employment: { key: "employment_types", value: EMPLOYMENT_TYPES },
  salary: { key: "salary_types", value: SALARY_TYPES },
  designation: { key: "designations", value: DESIGNATIONS },
  employment_status: { key: "employment_status", value: EMPLOYEE_STATUSES },
  punch_type: { key: "punch_types", value: PUNCH_TYPES },
  attendance_method: { key: "attendance_methods", value: ATTENDANCE_METHODS },
  attendance_mode: { key: "attendance_modes", value: ATTENDANCE_MODES },
  leave_type: { key: "leave_types", value: LEAVE_TYPES },
  invite_status: { key: "invite_statuses", value: INVITE_STATUSES },
  half_day_type: { key: "half_day_types", value: HALF_DAY_TYPES },
  leave_status: { key: "leave_statuses", value: LEAVE_STATUSES },
  accrual_type: { key: "accrual_types", value: ACCRUAL_TYPES },
  payroll_status: { key: "payroll_statuses", value: PAY_ROLL_STATUSES },
  payment_method: { key: "payment_methods", value: PAYMENT_METHODS },
  currency: { key: "currency_types", value: CURRENCY_TYPES }
};


router.get("/", (req, res) => {
  try {
    const { type, search } = req.query;

    let data = {};

    
    if (type) {
      const config = CONSTANT_MAP[type.toLowerCase()];

      if (!config) {
        return res.status(400).json({
          success: false,
          message: "Invalid type parameter",
        });
      }

      data[config.key] = objectToArray(config.value);
    } else {
      
      Object.values(CONSTANT_MAP).forEach(({ key, value }) => {
        data[key] = objectToArray(value);
      });
    }

    
    if (search) {
      const searchLower = search.toLowerCase();

      Object.keys(data).forEach((key) => {
        data[key] = data[key].filter(
          (item) =>
            item.key.toLowerCase().includes(searchLower) ||
            item.value.toLowerCase().includes(searchLower)
        );
      });
    }

    
    return res.json({
      success: true,
      count: Object.keys(data).length,
      data,
    });
  } catch (error) {
    console.error("Error fetching constants:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch constants",
    });
  }
});

export default router;