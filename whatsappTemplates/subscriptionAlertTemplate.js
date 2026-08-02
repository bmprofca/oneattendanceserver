// WhatsApp template for subscription expiry pre-notification alert
// Params: {{1}} = company name, {{2}} = package name, {{3}} = start date, {{4}} = expiry date, {{5}} = days remaining
export default {
  "template_id": "subscription_alert",
  "category": "UTILITY",
  "language_code": "en",
  "template_name": "subscription_alert",
  "status": "APPROVED",
  "template": {
    "name": "subscription_alert",
    "category": "UTILITY",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Dear *{{1}}*,\n\n⚠️ *Subscription Expiry Alert*\n\nYour subscription for *{{2}}* is about to expire.\n\n📅 *Start Date:* {{3}}\n📅 *Expiry Date:* {{4}}\n⏳ *Days Remaining:* {{5}} day(s)\n\nPlease renew your subscription before it expires to continue using our services uninterrupted.\n\nThank you,\nTeam *OneAttendance*.",
        "example": {
          "body_text": [
            [
              "ABC Pvt Ltd",
              "Premium Plan",
              "01 Jul 2026",
              "01 Aug 2026",
              "5"
            ]
          ]
        }
      }
    ]
  }
};
