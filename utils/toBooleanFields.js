const toBool = (value) => {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  return false;
};

const toBooleanField = (obj, field) => {
  if (obj?.[field] !== undefined) {
    obj[field] = toBool(obj[field]);
  }
  return obj;
};

const toBooleanFields = (obj, fields = []) => {
  for (const field of fields) {
    toBooleanField(obj, field);
  }
  return obj;
};

export { toBool, toBooleanField, toBooleanFields };