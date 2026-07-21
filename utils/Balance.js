import db from "../config/db.js";

const OpeningBalance = async ({ party_id, party_type, date }) => {
    const [plus_row] = await db.query(`SELECT SUM(amount) AS total_amount FROM transactions WHERE party2_id = ? AND party2_type = ? AND transaction_date < ?`, [party_id, party_type, date]);
    const [minus_row] = await db.query(`SELECT SUM(amount) AS total_amount FROM transactions WHERE party1_id = ? AND party1_type = ? AND transaction_date < ?`, [party_id, party_type, date]);

    const plus_amount = Number(plus_row[0].total_amount || 0);
    const minus_amount = Number(minus_row[0].total_amount || 0);

    let credit = 0;
    let debit = 0;
    let balance = 0;

    if (plus_amount > minus_amount) {
        credit = plus_amount - minus_amount;
    } else {
        debit = minus_amount - plus_amount;
    }

    balance = credit - debit;

    return { credit, debit, balance };
}


const Balance = async ({ party_id, party_type }) => {
    const [plus_row] = await db.query(`SELECT SUM(amount) AS total_amount FROM transactions WHERE party2_id = ? AND party2_type = ?`, [party_id, party_type]);
    const [minus_row] = await db.query(`SELECT SUM(amount) AS total_amount FROM transactions WHERE party1_id = ? AND party1_type = ?`, [party_id, party_type]);

    const plus_amount = Number(plus_row[0].total_amount || 0);
    const minus_amount = Number(minus_row[0].total_amount || 0);

    return plus_amount - minus_amount;
}

export { OpeningBalance, Balance };