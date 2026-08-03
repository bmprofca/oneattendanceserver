export default {
  "template_id": "519q8oqx146571iu6jlnib465lfo8h0lfft6f667oaw",
  "waba_template_id": "1439548131345401",
  "category": "MARKETING",
  "language_code": "en",
  "create_date": "2026-08-02 16:01:22",
  "template_name": "oa_subscription_expire_alert",
  "status": "APPROVED",
  "reject_reason": "NONE",
  "template": {
    "name": "oa_subscription_expire_alert",
    "category": "UTILITY",
    "language": "en",
    "components": [
      {
        "type": "BODY",
        "text": "Hello {{1}},\n\nYour *{{2}}* subscription will expire in *{{3}}* day(s) (*{{4}}*).\n\nPlease renew your subscription before the expiry date to avoid service interruption.",
        "example": {
          "body_text": [
            [
              "John",
              "OneAttendance",
              "3",
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
