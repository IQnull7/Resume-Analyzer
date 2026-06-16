import os #read my env for api key
import json #convert the pydantic schema to json string (for the prompt)
from dotenv import load_dotenv # reading .env and loading values into os.environ
from google import genai 
from models.schemas import ResumeAnalysis 

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

SYSTEM_PROMPT = """
You are a professional resume reviewer and ATS (Applicant Tracking System) expert.
Analyze the provided resume text and return ONLY a valid JSON object.
No markdown. No explanation. No backticks. Just the raw JSON.

Your response must match this exact schema:
{schema}

For ats_score: 0-100 where 100 is perfect ATS optimization.
For weak_action_verbs: only include verbs actually found in the resume that are weak/passive.
For suggested_replacements: keys are the weak phrases found, values are stronger alternatives.
""".format(schema=json.dumps(ResumeAnalysis.model_json_schema(), indent=2))

async def run_analysis(resume_text: str) -> ResumeAnalysis:
    response = client.models.generate_content(
        model="gemini-3.5-flash",
        contents=f"Analyze this resume:\n\n{resume_text}",
        config=genai.types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
        )
    )

    raw_json = response.text

    return ResumeAnalysis.model_validate_json(raw_json) #no json_load() as it wont give validation for the schema. this returns a valid resumeAnalysis object
