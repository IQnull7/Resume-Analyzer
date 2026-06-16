from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from router.resume import router as resume_router

app = FastAPI(title="Resume Analyzer API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(resume_router, prefix="/api/resume", tags=["resume"]) #the prefix is getting added in the beginning of the route to /analysis, so now its /api/resume/analysis.

@app.get("/")
def root():
    return {"Status" : "Resume Analyzer API is running"}
