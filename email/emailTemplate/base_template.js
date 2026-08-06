import { getEnumObject } from "../../utils/constantsValidator.js";
import {
  DESIGNATIONS, EMPLOYMENT_TYPES, SALARY_TYPES, HALF_DAY_TYPES,
  ATTENDANCE_METHODS, LEAVE_TYPES, LEAVE_STATUSES
} from "../../constants/constants_values.js";

const ALL_ENUM_MAPS = [
  DESIGNATIONS, EMPLOYMENT_TYPES, SALARY_TYPES, HALF_DAY_TYPES,
  ATTENDANCE_METHODS, LEAVE_TYPES, LEAVE_STATUSES
];

export const formatEnumValue = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") {
    if (value.label) return value.label;
    if (value.name) return value.name;
    if (value.title) return value.title;
    if (value.value) return formatEnumValue(value.value);
  }
  const str = String(value).trim();
  if (!str) return "-";

  for (const enumMap of ALL_ENUM_MAPS) {
    const enumObj = getEnumObject(enumMap, str);
    if (enumObj && enumObj.label && enumObj.label !== str) {
      return enumObj.label;
    }
  }

  if (str.includes("_") || str === str.toLowerCase()) {
    return str
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  return str;
};

export const valueOrDash = (value) => formatEnumValue(value);

export const getBaseEmailTemplate = ({
    title = "OneAttendance",
    headerColor = "#2563eb",
    headerHtml = "",
    contentHtml = "",
    footerHtml = "",
}) => {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f7f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7f6; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);">
                    <tr>
                        <td style="background-color: ${headerColor}; padding: 30px 40px; text-align: center;">
                            ${headerHtml}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px;">
                            ${contentHtml}
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
                            ${footerHtml || `
                            <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                                &copy; ${new Date().getFullYear()} OneAttendance. All rights reserved.
                            </p>
                            `}
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;
};
