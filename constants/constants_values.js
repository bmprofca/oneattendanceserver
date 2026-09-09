const EMPLOYMENT_TYPES = {
  FULL_TIME: {
    value: "full_time",
    label: "Full Time",
    description: "Employee works full-time with fixed hours and benefits"
  },
  PART_TIME: {
    value: "part_time",
    label: "Part Time",
    description: "Employee works limited hours compared to full-time"
  },
  CONTRACT: {
    value: "contract",
    label: "Contract",
    description: "Employee hired for a specific contract duration"
  },
  INTERN: {
    value: "intern",
    label: "Intern",
    description: "Temporary employee for training or learning purposes"
  },
  FREELANCER: {
    value: "freelancer",
    label: "Freelancer",
    description: "Independent worker not permanently employed"
  }
};

const SALARY_TYPES = {
    // HOURLY: {
  //   value: "hourly",
  //   label: "Hourly",
  //   description: "Salary is calculated based on hours worked"
  // },
  // DAILY: {
  //   value: "daily",
  //   label: "Daily",
  //   description: "Salary is calculated based on days worked"
  // },
  
  MONTHLY: {
    value: "monthly",
    label: "Monthly",
    description: "Fixed monthly salary regardless of hours"
  }
};

const DESIGNATIONS = {
  HR_MANAGER: {
    value: "hr_manager",
    label: "HR Manager",
    description: "Handles HR operations and decision making"
  },
  HR_EXECUTIVE: {
    value: "hr_executive",
    label: "HR Executive",
    description: "Supports HR tasks like recruitment and attendance"
  },

  MANAGER: {
    value: "manager",
    label: "Manager",
    description: "Manages teams and oversees operations"
  },
  SUPERVISOR: {
    value: "supervisor",
    label: "Supervisor",
    description: "Supervises daily tasks and team performance"
  },
  TEAM_LEAD: {
    value: "team_lead",
    label: "Team Lead",
    description: "Leads a team and coordinates tasks"
  },
  SENIOR_EMPLOYEE: {
    value: "senior_employee",
    label: "Senior Employee",
    description: "Experienced employee with advanced responsibilities"
  },
  JUNIOR_EMPLOYEE: {
    value: "junior_employee",
    label: "Junior Employee",
    description: "Entry-level employee with basic responsibilities"
  }
};

const INVITE_STATUSES = {
  PENDING: {
    value: "pending",
    label: "Pending",
    description: "Invitation sent but not yet responded"
  },
  ACCEPTED: {
    value: "accepted",
    label: "Accepted",
    description: "Invitation accepted by the user"
  },
  REJECTED: {
    value: "rejected",
    label: "Rejected",
    description: "Invitation declined by the user"
  },
  CANCELLED: {
    value: "cancelled",
    label: "Cancelled",
    description: "Invitation cancelled by the sender"
  },
  EXPIRED: {
    value: "expired",
    label: "Expired",
    description: "Invitation expired due to time limit"
  }
};

const EMPLOYEE_STATUSES = {
  ACTIVE: {
    value: "active",
    label: "Active",
    description: "Currently working employee"
  },
  INACTIVE: {
    value: "inactive",
    label: "Inactive",
    description: "Temporarily not working"
  },
  RESIGNED: {
    value: "resigned",
    label: "Resigned",
    description: "Employee has left the organization"
  }
};

const PUNCH_TYPES = {
  IN: {
    value: "in",
    label: "Punch In",
    description: "Marks the start of work"
  },
  OUT: {
    value: "out",
    label: "Punch Out",
    description: "Marks the end of work"
  },
  BREAK_START: {
    value: "break_start",
    label: "Break Start",
    description: "Marks the beginning of a break"
  },
  BREAK_END: {
    value: "break_end",
    label: "Break End",
    description: "Marks the end of a break"
  }
};

const ATTENDANCE_METHODS = {
  MANUAL: {
    value: "manual",
    label: "Manual Entry",
    description: "Marked manually",
    requiresDevice: false,
    requiresLocation: false,
    is_available: true
  },

  GPS: {
    value: "gps",
    label: "GPS Location",
    description: "Location based attendance",
    requiresDevice: true,
    requiresLocation: true,
    is_available: true
  },

  IP: {
    value: "ip",
    label: "IP Address",
    description: "Attendance based on IP address",
    requiresDevice: false,
    requiresLocation: true,
    is_available: true
  },

  FACE: {
    value: "face",
    label: "Face Recognition",
    description: "AI-based face scan",
    requiresDevice: true,
    requiresCamera: true,
    is_available: true
  },

  QR: {
    value: "qr",
    label: "QR Code",
    description: "Scan QR code to mark attendance",
    requiresDevice: true,
    requiresCamera: true,
    is_available: false 
  },

  FINGERPRINT: {
    value: "fingerprint",
    label: "Fingerprint",
    description: "Fingerprint-based attendance",
    requiresDevice: true,
    requiresCamera: false,
    is_available: false 
  },

};

const ATTENDANCE_MODES = {
  AUTO: {
    value: "auto",
    label: "Automatic",
    description: "Automatically marked based on rules"
  },
  MANUAL: {
    value: "manual",
    label: "Manual",
    description: "Manually marked by Supervisors or Admin"
  }
};

const LEAVE_TYPES = {
  SICK: {
    value: "SL",
    label: "Sick Leave",
    description: "Leave taken due to illness"
  },
  CASUAL: {
    value: "CL",
    label: "Casual Leave",
    description: "Leave taken for personal reasons"
  },
  EARNED: {
    value: "EL",
    label: "Earned Leave",
    description: "Leave accrued based on work duration"
  },
  MATERNITY: {
    value: "ML",
    label: "Maternity Leave",
    description: "Leave for childbirth and recovery"
  },
  PATERNITY: {
    value: "PL",
    label: "Paternity Leave",
    description: "Leave for new fathers"
  },
  UNPAID: {
    value: "UL",
    label: "Unpaid Leave",
    description: "Leave without pay for any reason"
  },
  COMPENSATORY: {
    value: "CO",
    label: "Compensatory Off",
    description: "Leave given in lieu of overtime work"
  }
};

const HALF_DAY_TYPES = {
  FIRST_HALF: {
    value: "first_half",
    label: "First Half",
    description: "Leave taken for the first half of the day"
  },
  SECOND_HALF: {
    value: "second_half",
    label: "Second Half",
    description: "Leave taken for the second half of the day"
  }
};

const LEAVE_STATUSES = {
  PENDING: {
    value: "pending",
    label: "Pending",
    description: "Leave request is awaiting approval"
  },
  APPROVED: {
    value: "approved",
    label: "Approved",
    description: "Leave request has been approved"
  },
  REJECTED: {
    value: "rejected",
    label: "Rejected",
    description: "Leave request has been rejected"
  },
  CANCELLED: {
    value: "cancelled",
    label: "Cancelled",
    description: "Leave request has been cancelled by the employee"
  }
};

const ACCRUAL_TYPES = {
  MONTHLY: {
    value: "monthly",
    label: "Monthly",
    description: "Leave accrues on a monthly basis"
  },
  ANNUAL: {
    value: "annual",
    label: "Annual",
    description: "Leave accrues on an annual basis"
  },
  PRO_RATA: {
    value: "pro_rata",
    label: "Pro Rata",
    description: "Leave accrues based on the proportion of time worked"
  },
  NONE: {
    value: "none",
    label: "None",
    description: "No leave accrual"
  }
};

const PAY_ROLL_STATUSES = {
  DRAFT: {
    value: "draft",
    label: "Draft",
    description: "Payroll is in draft mode"
  },
  REVIEWED: {
    value: "reviewed",
    label: "Reviewed",
    description: "Payroll has been reviewed and is ready for processing"
  },
  APPROVED: {
    value: "approved",
    label: "Approved",
    description: "Payroll has been approved for payment"
  },
  PAID: {
    value: "paid",
    label: "Paid",
    description: "Payroll has been paid to employees"
  },
  HELD: {
    value: "held",
    label: "Held",
    description: "Payroll is on hold due to an issue"
  }
};

const PAYMENT_METHODS = {
  BANK_TRANSFER: {
    value: "bank_transfer",
    label: "Bank Transfer",
    description: "Payment made directly to employee's bank account"
  },
  CHECK: {
    value: "check",
    label: "Check",
    description: "Payment made via physical check"
  },
  CASH: {
    value: "cash",
    label: "Cash",
    description: "Payment made in cash"
  },
  UPI: {
    value: "upi",
    label: "UPI",
    description: "Payment made through UPI platform"
  },
  OTHER: {
    value: "other",
    label: "Other",
    description: "Any other payment method not listed"
  }
};

const CURRENCY_TYPES = {
  USD: {
    value: "usd",
    label: "US Dollar",
    symbol: "$"
  },
  EUR: {
    value: "eur",
    label: "Euro",
    symbol: "€"
  },
  INR: {
    value: "inr",
    label: "Indian Rupee",
    symbol: "₹"
  },
  JPY: {
    value: "jpy",
    label: "Japanese Yen",
    symbol: "¥"
  }
};



export {
  EMPLOYMENT_TYPES,
  SALARY_TYPES,
  DESIGNATIONS,
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
};