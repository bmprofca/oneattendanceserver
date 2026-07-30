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


const validateConstant = (value, constantObj, fieldName) => {
  if (value === undefined || value === null || value === "") {
    return `${fieldName} is required`;
  }

  const validValues = Object.values(constantObj).map((entry) => entry.value);

  if (!validValues.includes(value)) {
    return `${fieldName} must be one of: ${validValues.join(", ")}`;
  }

  return null;
};

const createValidator = (constantObj, fieldName, extraCheck = null) => {
  return (value) => {
    const error = validateConstant(value, constantObj, fieldName);
    if (error) return error;
    if (extraCheck) return extraCheck(value, constantObj);
    return null;
  };
};


const employmentValidation = createValidator(EMPLOYMENT_TYPES, "employment_type");
const salaryValidation = createValidator(SALARY_TYPES, "salary_type");
const designationValidation = createValidator(DESIGNATIONS, "designation");
const inviteStatusValidation = createValidator(INVITE_STATUSES, "status");
const employeeStatusValidation = createValidator(EMPLOYEE_STATUSES, "status");
const punchTypeValidation = createValidator(PUNCH_TYPES, "punch_type");
const leaveTypeValidation = createValidator(LEAVE_TYPES, "leave_type");
const halfDayTypeValidation = createValidator(HALF_DAY_TYPES, "half_day_type");
const leaveStatusValidation = createValidator(LEAVE_STATUSES, "leave_status");
const accrualTypeValidation = createValidator(ACCRUAL_TYPES, "accrual_type");
const payrollStatusValidation = createValidator(PAY_ROLL_STATUSES, "payroll_status");
const paymentMethodValidation = createValidator(PAYMENT_METHODS, "payment_method");
const currencyTypeValidation = createValidator(CURRENCY_TYPES, "currency");

const attendanceMethodValidation = (value) => {
  if (!value) return "attendance_methods is required";
  const methods = Array.isArray(value) ? value : [value];
  for (const m of methods) {
    const error = validateConstant(m, ATTENDANCE_METHODS, "attendance_methods");
    if (error) return error;
  }
  return null;
};

const validateFields = (rules) => {
  return rules.reduce((errors, { field, value, validator }) => {
    const message = validator(value);
    if (message) errors.push({ field, message });
    return errors;
  }, []);
};

export {
  validateFields,
  createValidator,
  validateConstant,
  employmentValidation,
  salaryValidation,
  designationValidation,
  inviteStatusValidation,
  employeeStatusValidation,
  punchTypeValidation,
  attendanceMethodValidation,
  leaveTypeValidation,
  halfDayTypeValidation,
  leaveStatusValidation,
  accrualTypeValidation,
  payrollStatusValidation,
  paymentMethodValidation,
  currencyTypeValidation
};

export const getEnumObject = (enumObject, value, options = {}) => {
  const {
    fallbackLabel = null,
    includeDescription = false,
    includeExtra = false
  } = options;

  if (!value) {
    return {
      value: null,
      label: fallbackLabel
    };
  }

  const item = Object.values(enumObject).find(
    e => e.value === value
  );

  if (!item) {
    return {
      value,
      label: fallbackLabel || value
    };
  }

  const result = {
    value: item.value,
    label: item.label
  };

  if (includeDescription && item.description) {
    result.description = item.description;
  }

  if (includeExtra) {
    for (const [key, val] of Object.entries(item)) {
      if (!(key in result)) {
        result[key] = val;
      }
    }
  }

  return result;
};