import db from "./db.js";
import { DEFAULT_CONTACT, DEFAULT_PAGES } from "./websiteSeed.js";

let ready = null;

const parseSections = (value) => {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const mapPage = (row) => ({
  slug: row.slug,
  title: row.title,
  description: row.description || "",
  updated_label: row.updated_label || "",
  sections: parseSections(row.sections_json),
  updated_at: row.updated_at,
});

const mapContact = (row) => ({
  company_name: row?.company_name || DEFAULT_CONTACT.company_name,
  email: row?.email || DEFAULT_CONTACT.email,
  phone: row?.phone || DEFAULT_CONTACT.phone,
  sales_email: row?.sales_email || DEFAULT_CONTACT.sales_email,
  sales_phone: row?.sales_phone || DEFAULT_CONTACT.sales_phone,
  address: row?.address || DEFAULT_CONTACT.address,
  footer_text: row?.footer_text || DEFAULT_CONTACT.footer_text,
});

export async function ensureWebsiteContent() {
  if (!ready) {
    ready = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS website_contact (
          id TINYINT UNSIGNED NOT NULL,
          company_name VARCHAR(200) NOT NULL,
          email VARCHAR(200) NOT NULL,
          phone VARCHAR(40) NOT NULL,
          address TEXT NOT NULL,
          footer_text TEXT NOT NULL,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS website_pages (
          slug VARCHAR(80) NOT NULL,
          title VARCHAR(200) NOT NULL,
          description VARCHAR(500) NULL,
          updated_label VARCHAR(40) NULL,
          sections_json MEDIUMTEXT NOT NULL,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (slug)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      const [contactColumns] = await db.query("SHOW COLUMNS FROM website_contact");
      const contactFields = new Set(contactColumns.map((column) => column.Field));
      if (!contactFields.has("sales_email")) {
        await db.query("ALTER TABLE website_contact ADD COLUMN sales_email VARCHAR(200) NULL AFTER phone");
      }
      if (!contactFields.has("sales_phone")) {
        await db.query("ALTER TABLE website_contact ADD COLUMN sales_phone VARCHAR(40) NULL AFTER sales_email");
      }
      await db.query(
        `INSERT INTO website_contact (id, company_name, email, phone, sales_email, sales_phone, address, footer_text)
         SELECT 1, ?, ?, ?, ?, ?, ?, ? FROM DUAL
         WHERE NOT EXISTS (SELECT 1 FROM website_contact WHERE id = 1)`,
        [
          DEFAULT_CONTACT.company_name,
          DEFAULT_CONTACT.email,
          DEFAULT_CONTACT.phone,
          DEFAULT_CONTACT.sales_email,
          DEFAULT_CONTACT.sales_phone,
          DEFAULT_CONTACT.address,
          DEFAULT_CONTACT.footer_text,
        ],
      );
      await db.query(
        `UPDATE website_contact
         SET sales_email = IF(sales_email IS NULL OR sales_email = '', ?, sales_email),
             sales_phone = IF(sales_phone IS NULL OR sales_phone = '', ?, sales_phone)
         WHERE id = 1`,
        [DEFAULT_CONTACT.sales_email, DEFAULT_CONTACT.sales_phone],
      );
      for (const item of DEFAULT_PAGES) {
        await db.query(
          `INSERT IGNORE INTO website_pages (slug, title, description, updated_label, sections_json)
           VALUES (?, ?, ?, ?, ?)`,
          [item.slug, item.title, item.description, item.updated_label, JSON.stringify(item.sections)],
        );
      }
      const salesSection = DEFAULT_PAGES.find((item) => item.slug === "contact")?.sections.find((section) => section.heading === "Sales");
      const [[contactPage]] = await db.query("SELECT sections_json FROM website_pages WHERE slug = 'contact'");
      if (salesSection && contactPage) {
        const sections = parseSections(contactPage.sections_json);
        if (!sections.some((section) => section.heading === "Sales")) {
          const supportIndex = sections.findIndex((section) => section.heading === "Support");
          sections.splice(supportIndex >= 0 ? supportIndex + 1 : sections.length, 0, salesSection);
          await db.query("UPDATE website_pages SET sections_json = ? WHERE slug = 'contact'", [JSON.stringify(sections)]);
        }
      }
    })().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

export async function getWebsiteContent() {
  await ensureWebsiteContent();
  const [[contact]] = await db.query("SELECT company_name, email, phone, sales_email, sales_phone, address, footer_text, updated_at FROM website_contact WHERE id = 1");
  const [pages] = await db.query("SELECT slug, title, description, updated_label, sections_json, updated_at FROM website_pages ORDER BY title ASC");
  return { contact: mapContact(contact), pages: pages.map(mapPage) };
}

const cleanText = (value, max) => String(value ?? "").trim().slice(0, max);

export async function updateWebsiteContact(input = {}) {
  await ensureWebsiteContent();
  const company_name = cleanText(input.company_name, 200);
  const email = cleanText(input.email, 200);
  const phone = cleanText(input.phone, 40);
  const sales_email = cleanText(input.sales_email, 200);
  const sales_phone = cleanText(input.sales_phone, 40);
  const address = cleanText(input.address, 1000);
  const footer_text = cleanText(input.footer_text, 500);
  if (!company_name || !email || !phone || !sales_email || !sales_phone || !address) {
    throw new Error("Company name, email, phone, sales email, sales phone, and address are required");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sales_email)) {
    throw new Error("Enter a valid email address");
  }
  await db.query(
    `UPDATE website_contact
     SET company_name = ?, email = ?, phone = ?, sales_email = ?, sales_phone = ?, address = ?, footer_text = ?
     WHERE id = 1`,
    [company_name, email, phone, sales_email, sales_phone, address, footer_text],
  );
  return getWebsiteContent();
}

export async function updateWebsitePage(slug, input = {}) {
  await ensureWebsiteContent();
  const known = DEFAULT_PAGES.some((item) => item.slug === slug);
  if (!known) throw new Error("Unknown page");
  const title = cleanText(input.title, 200);
  const description = cleanText(input.description, 500);
  const updated_label = cleanText(input.updated_label, 40);
  if (!title) throw new Error("Title is required");
  if (!Array.isArray(input.sections) || input.sections.length === 0) {
    throw new Error("Add at least one section");
  }
  if (input.sections.length > 30) throw new Error("A page can have at most 30 sections");
  const sections = input.sections.map((section) => {
    const heading = cleanText(section?.heading, 200);
    const body = String(section?.body ?? "").trim().slice(0, 8000);
    if (!heading || !body) throw new Error("Each section needs a heading and body");
    return { heading, body };
  });
  await db.query(
    `UPDATE website_pages SET title = ?, description = ?, updated_label = ?, sections_json = ? WHERE slug = ?`,
    [title, description, updated_label, JSON.stringify(sections), slug],
  );
  return getWebsiteContent();
}
