from pydantic import BaseModel
from typing import List

class SectionFeedback(BaseModel):
    section: str
    present: bool
    feedback: str

class ResumeAnalysis(BaseModel):
    ats_score : int
    missing_sections : List[str]
    weak_action_verbs : List[str]
    suggested_replacements : dict
    section_feedback : List[SectionFeedback]
    overall_summary : str
