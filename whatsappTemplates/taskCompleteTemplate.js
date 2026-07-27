export default {
  "template_id": "8umz442v72w8k69668vhc3q0of7y2umm5pni2677q11",
  "waba_template_id": "1680601856500335",
  "category": "UTILITY",
  "language_code": "en",
  "create_date": "2026-06-28T22:02:12.000Z",
  "template_name": "task_complete",
  "status": "APPROVED",
  "reject_reason": "NONE",
  "template": {
    "name": "task_complete",
    "category": "UTILITY",
    "language": "en",
    "components": [
      {
        "type": "HEADER",
        "format": "IMAGE",
        "example": {
          "header_handle": [
            "https://f003.backblazeb2.com/file/OneChatting/templates/6a3d7870f3d48336b7114a4f/8umz442v72w8k69668vhc3q0of7y2umm5pni2677q11/f114f130-606d-4e7c-9af7-3b52f3969bd6.jpeg?Authorization=3_20260720092448_4ec3e874c97dd24647ecd45e_72ef6e0c1ab01b231fa49fd56bc39ca83769fc59_003_20260721092448_0120_dnld"
          ]
        }
      },
      {
        "type": "BODY",
        "text": "Dear *{{1}}*,\n\nYour order for *{{2}}* has been completed successfully.\n\nIf any payment is pending, kindly clear the outstanding amount.\n\nThank you for choosing FinFiler.\n\nTeam *FinFiler*",
        "example": {
          "body_text": [
            [
              "Mubarak",
              "GSt"
            ]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Visit Us",
            "url": "https://finfiler.com/"
          }
        ]
      }
    ]
  }
};
