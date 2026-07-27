export default {
  "template_id": "qvmr163w9og4o3308ao6hg1b3w1y74o1xdnb61s6821",
  "waba_template_id": "1732262828096138",
  "category": "UTILITY",
  "language_code": "en",
  "create_date": "2026-06-26T00:36:37.000Z",
  "template_name": "task_create",
  "status": "APPROVED",
  "reject_reason": "NONE",
  "template": {
    "name": "task_create",
    "category": "UTILITY",
    "language": "en",
    "components": [
      {
        "type": "HEADER",
        "format": "IMAGE",
        "example": {
          "header_handle": [
            "https://f003.backblazeb2.com/file/OneChatting/templates/6a3d7870f3d48336b7114a4f/qvmr163w9og4o3308ao6hg1b3w1y74o1xdnb61s6821/4c9315b8-5687-444b-b443-60356bc0064a.jpeg?Authorization=3_20260720092448_85bbde5f7bf2377ddd2a80ab_d9c06e7f373cbbad1472c36fee7bf0bee9860ba3_003_20260721092448_0120_dnld"
          ]
        }
      },
      {
        "type": "BODY",
        "text": "Dear *{{1}}*,\n\nYour Task for *{{2}}* Created Successfully with *Finfiler Private Limitd*\n\nThanks and Regards\nTeam *Finfiler*",
        "example": {
          "body_text": [
            [
              "Mubarak",
              "GST Registration"
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
