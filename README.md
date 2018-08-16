# Circuit Support Bot framework

# End user flow

## Matching question found
1. User asks a question. E.g. "What headsets are supported by circuit?"
1. Bot replies with best matching questions for user to choose one (uses new Circuit forms feature)
1. User chooses question
1. Bot replies with answer for that question. Bot also teaches AI service to add asked question with matching answer

## No matching question found
1. > same first two steps as above
1. User chooses "None of the above". The bot replies to the user indicating that support personal will get back to him. At the same time the bot post the question in a predefined support personal conversation, including a form to provide an answer.
1. A support person answers the question, or assigns the question to an existing answer.
1. The bot will teach the AI service with that information and reply to the user with the provided answer.
