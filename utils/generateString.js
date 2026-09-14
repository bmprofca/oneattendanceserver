import crypto from 'crypto';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CHARSET = `0123456789${LETTERS}`;

const generateString = (length = 6) => {
  const bytes = crypto.randomBytes(length);
  let result = LETTERS[bytes[0] % LETTERS.length];

  for (let i = 1; i < length; i += 1) {
    result += CHARSET[bytes[i] % CHARSET.length];
  }

  return result;
};

export default generateString;
