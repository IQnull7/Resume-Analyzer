from fastapi import APIRouter, UploadFile, File, HTTPException
from services.pdf_parser import extract_text
from services.llm import run_analysis
from models.schemas import ResumeAnalysis #To validate the model

router = APIRouter()

@router.post("/analyse", response_model=ResumeAnalysis)
async def analyze_resume(file : UploadFile=File(...)):
    if file.content_type != 'application/pdf':
        raise HTTPException(status_code=400,detail="Only PDF files are accepted.")
    contents = await file.read()

    if len(contents) == 0:
        raise HTTPException(status_code = 400, detail="Uploaded file is empty.")
    resume_text = extract_text(contents)

    if not resume_text.strip():
        raise HTTPException(status_code = 400, detail="Could not extract text from the PDF.")
    analysis = await run_analysis(resume_text)
    return analysis

    
