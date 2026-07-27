export default {
  "template_id": "q5388ih9ii48x7l155758u4w20sd2g3q6q6fb4qzu7i",
  "waba_template_id": "1661489905122996",
  "category": "UTILITY",
  "language_code": "en",
  "create_date": "2026-06-27T12:14:25.000Z",
  "template_name": "payment_received",
  "status": "APPROVED",
  "reject_reason": "NONE",
  "template": {
    "name": "payment_received",
    "category": "UTILITY",
    "language": "en",
    "components": [
      {
        "type": "HEADER",
        "format": "IMAGE",
        "example": {
          "header_handle": [
            "https://f003.backblazeb2.com/file/OneChatting/templates/6a3d7870f3d48336b7114a4f/q5388ih9ii48x7l155758u4w20sd2g3q6q6fb4qzu7i/2d5ac09f-04a2-4b46-9a5d-af972ab7567d.jpeg?Authorization=3_20260720092448_9bfadcca6ba5c9442fd6d203_2dc07ecd3b0e549c79843f9976c04543044024cb_003_20260721092448_0120_dnld"
          ]
        }
      },
      {
        "type": "BODY",
        "text": "Dear *{{1}}*,\n\nThank your for paying *Rs. {{2}}*, anagainst the Service *{{3}}*, Receipt Number *{{4}}*.\n\nThank and Regards \nTeam *Finfiler*.",
        "example": {
          "body_text": [
            [
              "Mubarak",
              "2900",
              "GST ",
              "12345/trt"
            ]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Please Visit",
            "url": "https://finfiler.com/"
          }
        ]
      }
    ]
  }
};
