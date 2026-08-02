export default {
  "template_id": "rwbq144grjey46n49c29q668uctv713b9556cw873nn",
  "waba_template_id": "2221667191901791",
  "category": "MARKETING",
  "language_code": "en",
  "create_date": "2026-08-02 16:04:12",
  "template_name": "oa_subscription_expired_notice",
  "status": "APPROVED",
  "reject_reason": "NONE",
  "template": {
    "name": "oa_subscription_expired_notice",
    "category": "UTILITY",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hello *{{1}}*,\n\nYour *OneAttendance* subscription expired on *{{2}}*.\n\nPlease renew your subscription to restore uninterrupted access to your account.",
        "example": {
          "body_text": [
            [
              "John",
              "02 Aug 2026"
            ]
          ]
        }
      },
      {
        "type": "FOOTER",
        "text": "Team OneAttendance"
      }
    ]
  }
};
