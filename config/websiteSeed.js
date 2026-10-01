export const DEFAULT_CONTACT = {
  company_name: "OneSaaS Technologies Private Limited",
  email: "support@onesaas.in",
  phone: "+91 9826000001",
  sales_email: "sales@onesaas.in",
  sales_phone: "+91 9826000000",
  address: "123 Business Park, Sector 62\nNoida, Uttar Pradesh 201301\nIndia",
  footer_text: "Attendance, leave, and payroll for teams that need a clear record of the workday.",
};

const page = (slug, title, description, updated_label, sections) => ({
  slug,
  title,
  description,
  updated_label,
  sections,
});

export const DEFAULT_PAGES = [
  page("privacy-policy", "Privacy Policy", "How {{company}} handles information in OneAttendance.", "October 1, 2026", [
    { heading: "1. Scope", body: "This policy applies to the OneAttendance web portal, mobile applications, and related services operated by {{company}}. OneAttendance helps companies manage employees, attendance, leave, payroll, permissions, subscriptions, and related workforce records." },
    { heading: "2. Information we collect", body: "**Account and profile information.** We store the name, email address, phone number, profile image, profession, WhatsApp number, authentication provider, and account status that you provide or that is returned by an enabled sign-in provider.\n\n**Authentication and device information.** Login sessions record the session token, sign-in provider, platform, device name, IP address, optional sign-in coordinates, expiry, and activity timestamps so sessions can be secured and managed.\n\n**Company and workforce records.** Company owners and authorized users may enter company details, employee profiles, roles, permissions, invitations, shift settings, leave records, salary and payroll information, ledger transactions, and bank-account details.\n\n**Attendance and device signals.** Depending on a company's configured attendance methods, the service may process attendance times, method information, IP address, GPS coordinates, QR or face and fingerprint enrollment data, and other attendance metadata.\n\n**Files and communications.** Uploaded profile images, company logos, and leave attachments are sent through the configured upload service. We use email, SMS, and WhatsApp providers for OTPs, account security, invitations, and service notifications where enabled." },
    { heading: "3. How we use information", body: "We use information to authenticate users, maintain sessions, provide attendance and workforce features, calculate and display leave and payroll records, enforce company permissions, send requested security or service messages, process subscriptions, prevent misuse, troubleshoot the service, and respond to support requests." },
    { heading: "4. Service providers and sharing", body: "We share information only as needed to operate the features you use: with configured authentication providers such as Google, Facebook, or Truecaller; communications providers that deliver OTPs and notifications; file-upload and media services; and payment or subscription services used for company plans. We may also disclose information when required by law, to protect the service and its users, or at your direction. We do not sell personal information." },
    { heading: "5. Retention and deletion", body: "We retain records while an account or company workspace needs them to provide the service. You can submit a deletion request from the [Data Deletion](/data-deletion) page with your mobile number. We review that request before deleting account access. An account that owns an active company must transfer ownership first, because other members depend on that workspace." },
    { heading: "6. Security", body: "OneAttendance uses bearer sessions, expiry and forced-logout controls, rate-limited OTP flows, hashed OTP values, role-based company permissions, and database deletion markers. No internet transmission or storage system can be guaranteed completely secure, so keep your sign-in codes private and report suspicious activity promptly." },
    { heading: "7. Contact us", body: "For privacy questions or a request about your information, contact [{{email}}](mailto:{{email}}). Please do not send OTPs or passwords by email." },
  ]),
  page("terms", "Terms of Service", "The terms that govern access to OneAttendance workforce tools.", "October 1, 2026", [
    { heading: "1. Acceptance and scope", body: "These Terms of Service form an agreement between you and {{company}} for use of OneAttendance. By creating an account, accepting an invitation, or using the service, you agree to these terms and the [Privacy Policy](/privacy-policy). If you use OneAttendance for a company, you confirm that you are authorized to accept these terms for that company." },
    { heading: "2. Accounts and access", body: "Accounts may be authenticated with email or phone OTP and supported sign-in providers. You are responsible for providing accurate information, protecting OTPs and session access, and promptly reporting unauthorized use. Company owners and administrators are responsible for inviting the right people and assigning permissions appropriate to their roles." },
    { heading: "3. Workforce features", body: "OneAttendance provides company and employee management, invitations, role-based permissions, shifts, attendance and break records, leave workflows, calendars, salary and payroll tools, ledgers, bank-account records, reports, and subscriptions. Attendance may use manual, GPS, QR, face, fingerprint, or IP-based methods when configured by the company. The company and its authorized users remain responsible for configuring policies, obtaining any required employee permissions, and checking records before relying on them." },
    { heading: "4. Acceptable use and responsibilities", body: "You may use the service only for lawful workforce and business operations. Do not misuse access controls, submit malicious or unlawful content, impersonate another person, interfere with the service, attempt unauthorized access, or use the service to violate another person's privacy or rights. You are responsible for the accuracy and lawfulness of company, employee, attendance, payroll, bank, and uploaded information you submit." },
    { heading: "5. Subscriptions and payments", body: "Company subscriptions may be offered in monthly, quarterly, half-yearly, or yearly periods and may include employee limits and custom packages. Plan availability, pricing, payment status, and expiry are shown in the service at the time of purchase. Cancellation and refund handling are described in the [Refund Policy](/refund-policy). Keep billing and payment information accurate, and do not use the service to submit payment details that you are not authorized to use." },
    { heading: "6. Suspension, termination, and deletion", body: "We may restrict or suspend access when necessary to protect the service, users, or company data, or when these terms are violated. You may submit an account deletion request from the [Data Deletion](/data-deletion) page. Because company ownership affects other users and workspace records, an account that owns an active company must transfer ownership before deletion." },
    { heading: "7. Changes and contact", body: "We may update these terms when the service or applicable requirements change. The updated version will be posted on this page with a new date. Questions about these terms can be sent to [{{email}}](mailto:{{email}})." },
  ]),
  page("disclaimer", "Disclaimer", "Limits on how OneAttendance records and outputs should be used.", "October 1, 2026", [
    { heading: "1. Workforce records", body: "OneAttendance helps a company record attendance, leave, shifts, payroll, and related workforce information. Those records depend on the methods the company enables, the devices employees use, network availability, and the information people enter. GPS, IP, QR, face, and fingerprint checks are attendance aids. They are not a guarantee of a person's identity, location, or hours worked." },
    { heading: "2. Business decisions", body: "Payroll totals, leave balances, ledgers, and reports are tools for the company to review. Authorized users should check them before paying wages, filing returns, or taking an employment decision. OneAttendance does not provide legal, tax, accounting, or employment-law advice." },
    { heading: "3. Availability and third parties", body: "The service is provided as available. Sign-in providers, payment providers, email, SMS, WhatsApp, and file storage may be interrupted or changed by those providers. {{company}} is not responsible for decisions a company makes from exported or displayed records, or for content a company or its users upload." },
    { heading: "4. Related policies", body: "Use of the service is also covered by the [Terms of Service](/terms) and [Privacy Policy](/privacy-policy). Questions can be sent to [{{email}}](mailto:{{email}})." },
  ]),
  page("refund-policy", "Refund Policy", "How company subscription payments and cancellations are handled.", "October 1, 2026", [
    { heading: "1. Digital subscriptions", body: "OneAttendance subscriptions are digital. A plan can be monthly, quarterly, half-yearly, or yearly, and it can include an employee limit. The price and billing period shown on the [pricing page](/pricing) or in the panel at checkout are the prices that apply to that purchase. Access is enabled after the payment provider confirms the payment." },
    { heading: "2. Cancellation", body: "A company can stop renewing a plan. Access for a paid period continues until that period ends, unless the subscription could not be activated. Unused time in a period that was successfully activated is not refunded in cash, except where the law requires a refund." },
    { heading: "3. Failed or duplicate payments", body: "If a payment fails, is charged twice, or is taken without the subscription being activated, contact [{{email}}](mailto:{{email}}) with the registered mobile number or email, company name, and payment reference. We will check the payment status with the payment provider and correct an activation failure or a duplicate charge." },
    { heading: "4. Custom plans", body: "Enterprise or custom plans are agreed separately with the sales team. Card or bank details should be entered only in the payment provider's checkout. Do not send card numbers, OTPs, or passwords by email." },
  ]),
  page("cookie-policy", "Cookie Policy", "How OneAttendance uses cookies and similar storage.", "October 1, 2026", [
    { heading: "1. Public website", body: "The public website can be read without an account. It does not use advertising cookies and it does not sell personal information. A page may store only what the browser needs to load the site." },
    { heading: "2. Panel session", body: "The client panel stores a session token in the browser so you can stay signed in and so the selected company can be sent with requests. Clearing site data for the panel signs you out. That storage is used to operate the account, not to build an advertising profile." },
    { heading: "3. Sign-in providers", body: "If you choose Google, Facebook, or Truecaller sign-in, that provider may set its own cookies while the sign-in window is open. Those cookies are controlled by the provider. Details of the account data we store after sign-in are in the [Privacy Policy](/privacy-policy)." },
  ]),
  page("shipping-policy", "Shipping Policy", "OneAttendance is a digital service and does not ship physical goods.", "October 1, 2026", [
    { heading: "1. No physical delivery", body: "OneAttendance does not sell or ship physical products. There is no courier, warehouse dispatch, or delivery address for an order." },
    { heading: "2. How access is delivered", body: "After an account is created and a subscription payment is confirmed, access is provided online in the web panel and the mobile app. Plan limits, such as the employee range and billing period, are the limits shown at purchase. If access does not appear after a successful payment, contact [{{email}}](mailto:{{email}}) with the payment reference." },
    { heading: "3. Billing questions", body: "Cancellation and refund rules are in the [Refund Policy](/refund-policy). Current plan prices are on the [pricing page](/pricing)." },
  ]),
  page("data-deletion", "Data Deletion", "Submit a request to delete your OneAttendance account data.", "October 1, 2026", [
    { heading: "What happens next", body: "We review the mobile number, email, and description you submit. If the account can be deleted, we deactivate the user account and active sessions and mark employee memberships deleted. An account that owns an active company must transfer ownership first, because other members depend on that workspace." },
    { heading: "Need help?", body: "Contact [{{email}}](mailto:{{email}}) from your registered email. Do not include a password in your message." },
  ]),
  page("grievance", "Grievance", "How to raise a complaint about OneAttendance or your account data.", "October 1, 2026", [
    { heading: "1. How to raise a grievance", body: "Complaints about the service, a payment, or the handling of personal information can be sent to [{{email}}](mailto:{{email}}). Include the registered mobile number or email, the company name, and a short description of the issue. Do not include a password, OTP, or card number." },
    { heading: "2. Privacy and deletion", body: "Privacy questions are covered by the [Privacy Policy](/privacy-policy). An account deletion request can be submitted on the [Data Deletion](/data-deletion) page. We review the mobile number and description before changing or removing account access." },
    { heading: "3. Where to write", body: "{{company}}\n{{address}}\n\nPhone: [{{phone}}](tel:{{phone}})" },
  ]),
  page("contact", "Contact", "How to reach {{company}} about OneAttendance.", "October 1, 2026", [
    { heading: "Support", body: "Email [{{email}}](mailto:{{email}}) or call [{{phone}}](tel:{{phone}}) for account, billing, privacy, or product questions. Include the registered mobile number or email and the company name so the request can be matched. Do not send passwords, OTPs, or card numbers." },
    { heading: "Sales", body: "For enterprise and custom plans, email the sales team at [{{sales_email}}](mailto:{{sales_email}}) or call [{{sales_phone}}](tel:{{sales_phone}})." },
    { heading: "Policies", body: "Related pages: [Privacy Policy](/privacy-policy), [Terms of Service](/terms), [Refund Policy](/refund-policy), [Disclaimer](/disclaimer), and [Grievance](/grievance)." },
  ]),
];
