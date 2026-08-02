// WhatsApp template for subscription renewal request (after expiry)
// Params: {{1}} = company name, {{2}} = package name, {{3}} = start date, {{4}} = expired on date
export default {
  "template_id": "subscription_renewal",
  "category": "UTILITY",
  "language_code": "en",
  "template_name": "subscription_renewal",
  "status": "APPROVED",
  "template": {
    "name": "subscription_renewal",
    "category": "UTILITY",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Dear *{{1}}*,\n\n🔴 *Subscription Expired*\n\nYour subscription for *{{2}}* has expired.\n\n📅 *Started On:* {{3}}\n📅 *Expired On:* {{4}}\n\nTo continue using *OneAttendance* without interruption, please renew your subscription at the earliest.\n\nContact our support team or visit our portal to renew.\n\nThank you,\nTeam *OneAttendance*.",
        "example": {
          "body_text": [
            [
              "ABC Pvt Ltd",
              "Premium Plan",
              "01 Jun 2026",
              "01 Jul 2026"
            ]
          ]
        }
      }
    ]
  }
};
