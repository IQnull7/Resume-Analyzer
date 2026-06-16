# Resume Analyzer — Complete Build Guide

---

## 0. Mental Model First — Read This Before Touching Code

Before writing a single line, understand what actually happens when a user drops a PDF:

```
User drops PDF
     ↓
React packages it as FormData (like an HTML form file upload)
     ↓
fetch() POSTs it to FastAPI at /api/resume/analyze
     ↓
FastAPI receives it as raw bytes (UploadFile)
     ↓
pdf_parser.py converts bytes → plain text string
     ↓
llm.py sends that text to Azure OpenAI with a structured prompt
     ↓
OpenAI returns a JSON string
     ↓
Pydantic validates + parses that JSON into a Python object
     ↓
FastAPI serializes that object back to JSON and sends it to React
     ↓
React renders the results in ResultsPanel
```

Every file you'll write exists to handle exactly one step in this chain.
That's the whole philosophy of the directory structure.

---

## 1. Directory Structure — Full Tree + Why

```
resume-analyzer/
│
├── backend/
│   ├── main.py                  ← Entry point. Wires everything together.
│   ├── .env                     ← API keys. NEVER commit this.
│   ├── requirements.txt         ← Python dependencies list.
│   │
│   ├── models/
│   │   └── schemas.py           ← Data shapes. What does a "ResumeAnalysis" look like?
│   │
│   ├── services/
│   │   ├── pdf_parser.py        ← PDF bytes → plain text. One job.
│   │   └── llm.py               ← Text → LLM → structured response. One job.
│   │
│   └── router/
│       └── resume.py            ← URL routes. Connects HTTP requests to services.
│
└── frontend/
    ├── index.html               ← Vite's HTML shell. You barely touch this.
    ├── package.json             ← JS dependencies list.
    ├── .env                     ← Frontend env vars (e.g. API URL).
    │
    └── src/
        ├── App.jsx              ← Root component. Owns all state. Orchestrates.
        │
        ├── api/
        │   └── resumeService.js ← All fetch() calls live here. Nothing else.
        │
        └── components/
            ├── DropZone.jsx     ← Only handles drag/drop UI.
            └── ResultsPanel.jsx ← Only handles rendering results.
```

### Why This Structure?

Think of it like a company org chart. Each person (file) has exactly one responsibility.
If your PDF parsing breaks, you go to `pdf_parser.py`. If the LLM prompt needs tweaking, you go to `llm.py`.
If you want to add a new route later, you go to the `router/` folder.

**The alternative (bad):** dumping everything in one `app.py` file. It works for day 1, then becomes
a nightmare when you need to debug or extend it. Don't do it.

**models/ vs services/ vs router/:**
- `models/` → data shapes (nouns — what things ARE)
- `services/` → business logic (verbs — what things DO)
- `router/` → HTTP layer (how requests GET to the services)

---

## 2. Setup

### 2.1 Python Environment

```bash
cd resume-analyzer/backend

# Create a virtual environment (isolated Python install for this project)
python -m venv venv

# Activate it (do this every time you open a new terminal for the backend)
source venv/bin/activate        # Mac/Linux
venv\Scripts\activate           # Windows

# Install dependencies
pip install fastapi uvicorn pymupdf python-dotenv openai python-multipart

# Save them to requirements.txt (so others/you can reinstall later)
pip freeze > requirements.txt
```

**Why virtual environment?** Without it, packages install globally and version conflicts
across projects will destroy you. venv keeps this project's packages isolated.

**Why `python-multipart`?** FastAPI needs it to handle file uploads. It's not optional.
If you skip it, `UploadFile` silently fails.

### 2.2 React + Vite Environment

```bash
cd resume-analyzer/frontend    # or wherever you want the frontend

npm create vite@latest . -- --template react
npm install
npm install react-dropzone
```

**Why Vite over Create React App?** Faster dev server, faster hot reload, better defaults.
CRA is basically abandoned now. Everyone uses Vite.

**Why react-dropzone?** Writing drag-and-drop from scratch with raw browser events
is surprisingly painful. react-dropzone handles all of it and gives you a clean hook API.

### 2.3 .env Files

**backend/.env**
```
AZURE_OPENAI_KEY=your_key_here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_DEPLOYMENT_NAME=your_deployment_name
```

**frontend/.env**
```
VITE_API_URL=http://localhost:8000
```

**Why two .env files?** Backend env vars are for secret keys (never exposed to browser).
Frontend env vars are for config like API URL (these DO get bundled into the JS, so never
put secrets here). In Vite, only vars starting with `VITE_` are exposed to the frontend code.

---

## 3. Backend — File by File

### BUILD ORDER FOR BACKEND: schemas.py → pdf_parser.py → llm.py → router/resume.py → main.py

---

### 3.1 `models/schemas.py` — Start Here

**What it is:** Pydantic models. They define the *shape* of your data.

**Why build this first?** Because every other file depends on knowing what a `ResumeAnalysis`
looks like. Define the nouns before the verbs.

**What is Pydantic?** Think of it as Python dataclasses but with superpowers:
- It validates that data matches the schema (throws an error if not)
- It converts JSON strings into Python objects automatically
- It generates JSON schemas that you can send to the LLM as instructions

```python
# models/schemas.py

# ─── Imports ─────────────────────────────────────────────────────────────────
from pydantic import BaseModel      # The base class all your models inherit from
from typing import List             # For type hints like List[str]
# ─────────────────────────────────────────────────────────────────────────────

# This is a nested model — it describes feedback on ONE section of the resume
class SectionFeedback(BaseModel):
    section: str        # e.g. "Work Experience"
    present: bool       # True if section exists in resume
    feedback: str       # What's good/bad about this section

# This is the main model — the full analysis returned by the LLM
class ResumeAnalysis(BaseModel):
    ats_score: int                          # 0–100 score
    missing_sections: List[str]             # e.g. ["Skills", "Summary"]
    weak_action_verbs: List[str]            # e.g. ["responsible for", "helped with"]
    suggested_replacements: dict            # {"responsible for": "led", "helped": "executed"}
    section_feedback: List[SectionFeedback] # List of SectionFeedback objects (nested!)
    overall_summary: str                    # Paragraph of overall feedback
```

**What to type yourself:** The entire file. It's short and you need to internalize what
`BaseModel` means. Every field is `name: type`. That's all Pydantic models are.

**Key concept — nested models:** `List[SectionFeedback]` means a list where every item
must match the `SectionFeedback` shape. Pydantic validates this automatically.
If the LLM returns a section_feedback item without a `present` field, Pydantic throws
an error immediately rather than letting a corrupt object travel through your app.

---

### 3.2 `services/pdf_parser.py`

**What it is:** One function. Takes PDF bytes, returns a plain text string.

**Why its own file?** Isolation. If you switch PDF libraries later (say from PyMuPDF to
pdfplumber), you change only this file. Nothing else knows or cares.

**What is PyMuPDF / fitz?** A C-based PDF rendering library with a Python wrapper.
You import it as `fitz` even though you install it as `pymupdf` — historical quirk, just
remember it.

```python
# services/pdf_parser.py

# ─── Imports ─────────────────────────────────────────────────────────────────
import fitz     # PyMuPDF — installed as 'pymupdf', imported as 'fitz'. Just how it is.
# ─────────────────────────────────────────────────────────────────────────────

def extract_text(pdf_bytes: bytes) -> str:
    """
    Takes raw PDF bytes, returns all text content as a single string.
    bytes → str
    """
    # fitz.open() can take a file path OR raw bytes.
    # stream=pdf_bytes means "open from memory, not from disk"
    # filetype="pdf" tells fitz what format the bytes are in
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    full_text = ""
    for page in doc:              # iterate over every page
        full_text += page.get_text()  # extract text from that page, append to result

    doc.close()                   # good practice to close the document
    return full_text
```

**What to type yourself:** The whole function. Test it immediately:

```python
# Test in a quick test_parser.py file in the backend root
from services.pdf_parser import extract_text

with open("test_resume.pdf", "rb") as f:   # "rb" = read bytes
    text = extract_text(f.read())
    print(text[:500])   # Print first 500 chars to verify it's working
```

Run `python test_parser.py` before moving on. If you see garbled text, the PDF might be
image-based (scanned) — that needs OCR, a different problem. Most modern resumes are
text-based and will work fine.

**Why bytes and not a file path?** Because in the router, FastAPI gives you the file
as bytes in memory (you never write it to disk). Keeping the parser decoupled from
"how the bytes arrived" makes it reusable and testable.

---

### 3.3 `services/llm.py`

**What it is:** The most important new concept in this project.
It sends resume text to the LLM and gets back a validated Python object.

**The key idea — structured output:** Normally LLMs return free-form text.
For an API, you need predictable JSON. Two things enforce this:
1. `response_format={"type": "json_object"}` — tells the LLM "return ONLY valid JSON"
2. Pydantic's `model_validate_json()` — parses that JSON and validates it against your schema

If the LLM returns something that doesn't match your schema, Pydantic throws an error.
You catch it and return a 500. This is way better than silently serving broken data.

```python
# services/llm.py

# ─── Imports ─────────────────────────────────────────────────────────────────
import os                           # To read environment variables
import json                         # To convert Python dict → JSON string for the prompt
from openai import AzureOpenAI      # Azure OpenAI client
from dotenv import load_dotenv      # Reads your .env file into os.environ
from models.schemas import ResumeAnalysis   # Your Pydantic model from schemas.py
# ─────────────────────────────────────────────────────────────────────────────

load_dotenv()   # Call this ONCE at module level. It loads .env into environment variables.

# ─── Client Setup ─────────────────────────────────────────────────────────────
# This is the same client pattern you used in Notus.
# os.getenv("KEY_NAME") reads from the .env file (after load_dotenv() runs).
client = AzureOpenAI(
    api_key=os.getenv("AZURE_OPENAI_KEY"),
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
    api_version="2024-02-01"
)
# ──────────────────────────────────────────────────────────────────────────────

# ─── System Prompt ─────────────────────────────────────────────────────────────
# model_json_schema() generates a JSON schema dict from your Pydantic model.
# json.dumps(..., indent=2) converts that dict to a formatted JSON string.
# This tells the LLM EXACTLY what fields to return and what types they should be.
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
# ──────────────────────────────────────────────────────────────────────────────

async def run_analysis(resume_text: str) -> ResumeAnalysis:
    """
    Sends resume text to LLM, returns a validated ResumeAnalysis object.
    str → ResumeAnalysis
    """
    response = client.chat.completions.create(
        model=os.getenv("AZURE_DEPLOYMENT_NAME"),

        # response_format json_object = LLM MUST return valid JSON. No exceptions.
        # This is an OpenAI feature. Without it, the LLM might add markdown or text.
        response_format={"type": "json_object"},

        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Analyze this resume:\n\n{resume_text}"}
        ]
    )

    # Extract the text content from the response
    raw_json = response.choices[0].message.content

    # model_validate_json() does TWO things:
    # 1. Parses the JSON string into a Python dict
    # 2. Validates it against ResumeAnalysis schema and builds the object
    # If the JSON doesn't match the schema → raises ValidationError → you catch it upstream
    return ResumeAnalysis.model_validate_json(raw_json)
```

**What to type yourself:** The `run_analysis` function body. Understand every line before typing.
Pay special attention to why `model_validate_json()` is used instead of `json.loads()`.
The difference: `json.loads()` gives you a raw dict. `model_validate_json()` gives you a
typed, validated Python object. The router can then return it directly as JSON.

**Why `async def`?** The OpenAI API call is I/O bound (you're waiting for a network response).
`async` lets FastAPI handle other requests while waiting. You'll notice the router uses
`await run_analysis(...)` — `await` is how you call an `async` function.

---

### 3.4 `router/resume.py`

**What it is:** The HTTP layer. Defines what URL does what.
It doesn't DO anything itself — it just receives requests, calls services, returns responses.

**Why separate from main.py?** As your app grows, you'd have multiple routers
(e.g. `/api/user`, `/api/resume`, `/api/jobs`). Keeping them separate keeps `main.py` clean.
It uses `APIRouter` which is basically a mini-FastAPI app that gets "mounted" in main.py.

**New concept — UploadFile:** When someone sends a file via an HTML form or FormData,
FastAPI receives it as an `UploadFile` object. It has:
- `file.content_type` → MIME type (e.g. "application/pdf")
- `file.filename` → original filename
- `await file.read()` → the actual bytes

```python
# router/resume.py

# ─── Imports ─────────────────────────────────────────────────────────────────
from fastapi import APIRouter, UploadFile, File, HTTPException
# APIRouter    → mini-app for grouping routes
# UploadFile   → type hint for file uploads
# File         → used as a default value marker: File(...) means "required file param"
# HTTPException → raise this to return HTTP error codes (400, 422, 500, etc.)

from services.pdf_parser import extract_text    # Your pdf_parser function
from services.llm import run_analysis           # Your llm function
from models.schemas import ResumeAnalysis       # For response_model type hint
# ─────────────────────────────────────────────────────────────────────────────

router = APIRouter()    # Create the router. main.py will register this.

@router.post("/analyze", response_model=ResumeAnalysis)
async def analyze_resume(file: UploadFile = File(...)):
    """
    POST /analyze
    Accepts a PDF file, returns a ResumeAnalysis JSON object.
    
    File(...) means: "this is a required file upload parameter"
    The '...' is Python's Ellipsis — FastAPI uses it to mean "required"
    """

    # ── Validation 1: File type check ──────────────────────────────────────
    # content_type is the MIME type sent by the browser.
    # application/pdf is the standard MIME type for PDFs.
    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are accepted. Please upload a .pdf file."
        )

    # ── Read the file bytes ─────────────────────────────────────────────────
    # await is needed because file.read() is async (it's reading from a stream)
    contents = await file.read()

    # ── Validation 2: Empty file check ──────────────────────────────────────
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    # ── Extract text from PDF ───────────────────────────────────────────────
    # extract_text is sync (not async), so no await needed
    resume_text = extract_text(contents)

    # ── Validation 3: Extracted text check ──────────────────────────────────
    # .strip() removes whitespace. If the result is empty after stripping,
    # the PDF is probably scanned/image-based — we can't extract text from it.
    if not resume_text.strip():
        raise HTTPException(
            status_code=422,
            detail="Could not extract text from this PDF. It may be a scanned image."
        )

    # ── Call LLM ────────────────────────────────────────────────────────────
    # run_analysis is async, so we need await.
    # Returns a ResumeAnalysis Pydantic object.
    analysis = await run_analysis(resume_text)

    # FastAPI automatically serializes the Pydantic object to JSON.
    # response_model=ResumeAnalysis tells FastAPI the expected output shape.
    return analysis
```

**What to type yourself:** The entire route function. The pattern is always the same:
validate input → call service → return result. Understand why each validation exists.

**Why three validations?** Defense in depth.
1. Wrong file type → tell user immediately (400 Bad Request)
2. Empty file → user accidentally uploaded empty file (400)
3. No text extracted → PDF is image-based, can't process (422 Unprocessable Entity)

These prevent confusing LLM errors and give users actionable error messages.

---

### 3.5 `main.py`

**What it is:** The entry point. Wires the router into the app. Sets up CORS. That's it.

```python
# main.py

# ─── Imports ─────────────────────────────────────────────────────────────────
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
# CORSMiddleware → handles Cross-Origin Resource Sharing
# Without this, your React app (localhost:5173) can't talk to FastAPI (localhost:8000)
# because they're on different ports = different "origins" by browser rules

from router.resume import router as resume_router
# Import your router and alias it to avoid naming conflicts
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(title="Resume Analyzer API", version="1.0.0")

# ── CORS Setup ────────────────────────────────────────────────────────────────
# Same pattern as Notus. No credentials needed here, so wildcards are fine for methods/headers.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",    # Vite default port
        "http://localhost:5174",    # Vite fallback port
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)
# ─────────────────────────────────────────────────────────────────────────────

# ── Register Routers ──────────────────────────────────────────────────────────
# prefix="/api/resume" means all routes in resume_router get this prefix.
# So @router.post("/analyze") becomes POST /api/resume/analyze
app.include_router(resume_router, prefix="/api/resume", tags=["resume"])
# ─────────────────────────────────────────────────────────────────────────────

# Health check route — useful for testing if the server is alive
@app.get("/")
def root():
    return {"status": "Resume Analyzer API is running"}
```

**Run it:**
```bash
uvicorn main:app --reload
# main = filename (main.py), app = the FastAPI instance, --reload = auto-restart on save
```

Then open `http://localhost:8000/docs` — FastAPI auto-generates interactive API docs.
You can test your `/api/resume/analyze` endpoint here before touching the frontend.

---

## 4. Frontend — File by File

### BUILD ORDER FOR FRONTEND: resumeService.js → DropZone.jsx → App.jsx (partial) → ResultsPanel.jsx → App.jsx (complete)

---

### 4.1 `api/resumeService.js` — Start Here

**What it is:** All communication with the backend lives here. No fetch() calls anywhere else.

**Why its own file?** If your API URL changes (local → deployed), or you add auth headers later,
you change one file. Components shouldn't know or care how data is fetched.

**New concept — FormData:** When you upload a file, you can't just send the raw bytes as JSON.
You send it as `multipart/form-data` — the same format HTML `<form enctype="multipart/form-data">`
uses. `FormData` is the browser API for building this.

```javascript
// api/resumeService.js

// import.meta.env is Vite's way of accessing .env variables.
// The || fallback means "use localhost if the env var isn't set"
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function analyzeResume(file) {
    // FormData is like a key-value store for form fields and files.
    // It handles the multipart encoding automatically.
    const formData = new FormData();

    // formData.append(key, value)
    // key "file" MUST match the FastAPI parameter name: file: UploadFile = File(...)
    formData.append("file", file);

    const response = await fetch(`${BASE_URL}/api/resume/analyze`, {
        method: "POST",
        body: formData,
        // ⚠️ DO NOT set "Content-Type": "multipart/form-data" manually here.
        // When you use FormData as the body, the browser sets Content-Type automatically
        // AND includes the "boundary" string that separates form fields.
        // If you set it manually, you break the boundary and FastAPI can't parse the file.
    });

    // response.ok is true for 200-299 status codes.
    if (!response.ok) {
        // FastAPI's HTTPException returns JSON like: { "detail": "error message" }
        const errorData = await response.json();
        throw new Error(errorData.detail || "Analysis failed. Please try again.");
    }

    // response.json() parses the JSON body of the response.
    // Returns the ResumeAnalysis object as a plain JavaScript object.
    return response.json();
}
```

**What to type yourself:** The entire file. The FormData + fetch pattern is fundamental
to file uploads on the web. The `Content-Type` gotcha is important to internalize.

**Test it before connecting to UI:**
Open browser console on any page, paste this, drop a PDF on your system and find its path,
or better — test via FastAPI's `/docs` interactive UI first.

---

### 4.2 `components/DropZone.jsx`

**What it is:** A React component that handles drag-and-drop file selection.
Its only responsibility: accept a file → call `onFileSelected(file)`. Nothing else.

**Props it receives:**
- `onFileSelected` → function to call when user picks a file (comes from App.jsx)
- `isLoading` → boolean, disables the zone while analysis is running (comes from App.jsx)

**Key concept — props:** Think of props as function arguments for components.
The parent (App.jsx) owns the logic; this component just renders UI and calls
the prop-function when something happens.

```jsx
// components/DropZone.jsx

// ─── Imports ──────────────────────────────────────────────────────────────────
import { useDropzone } from "react-dropzone";
// useDropzone is a React hook that gives you:
// - getRootProps() → props to spread on the container div (click, keyboard events)
// - getInputProps() → props to spread on a hidden <input type="file"> 
// - isDragActive → boolean, true when a file is being dragged over the zone
// ─────────────────────────────────────────────────────────────────────────────

function DropZone({ onFileSelected, isLoading }) {
    // Destructure the hook's return value
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        accept: { "application/pdf": [".pdf"] },    // Only PDFs
        maxFiles: 1,                                 // One file at a time
        disabled: isLoading,                         // Disable while uploading

        // onDrop fires when files are dropped OR selected via file dialog
        // acceptedFiles = array of File objects that passed the accept filter
        onDrop: (acceptedFiles) => {
            if (acceptedFiles.length > 0) {
                // Call the parent's handler with the single File object
                onFileSelected(acceptedFiles[0]);
            }
        }
    });

    return (
        // {...getRootProps()} spreads all the event handlers onto this div
        // This makes the div clickable (opens file dialog) and droppable
        <div
            {...getRootProps()}
            style={{
                border: `2px dashed ${isDragActive ? "#4a90e2" : "#ccc"}`,
                borderRadius: "12px",
                padding: "60px 40px",
                textAlign: "center",
                cursor: isLoading ? "not-allowed" : "pointer",
                backgroundColor: isDragActive ? "#f0f7ff" : "#fafafa",
                transition: "all 0.2s ease",
                opacity: isLoading ? 0.6 : 1,
            }}
        >
            {/* Hidden file input — getRootProps handles click → opens this */}
            <input {...getInputProps()} />

            {/* Conditional rendering based on state */}
            {isLoading ? (
                <div>
                    <p style={{ fontSize: "18px" }}>⏳ Analyzing your resume...</p>
                    <p style={{ color: "#666", fontSize: "14px" }}>
                        This usually takes 10–20 seconds
                    </p>
                </div>
            ) : isDragActive ? (
                <p style={{ fontSize: "18px" }}>📄 Drop it here!</p>
            ) : (
                <div>
                    <p style={{ fontSize: "18px" }}>
                        📎 Drag & drop your PDF resume here
                    </p>
                    <p style={{ color: "#888", fontSize: "14px" }}>
                        or click to select a file
                    </p>
                </div>
            )}
        </div>
    );
}

export default DropZone;
```

**What to type yourself:** The useDropzone hook config and the conditional rendering.
The spread syntax (`{...getRootProps()}`) is a common React pattern — understand that
it's just spreading an object of props onto the element.

---

### 4.3 `components/ResultsPanel.jsx`

**What it is:** Renders the analysis results. Receives the `analysis` object as a prop.
It's a dumb display component — no logic, no state, just rendering.

**Props it receives:**
- `analysis` → a ResumeAnalysis object matching your Pydantic schema

```jsx
// components/ResultsPanel.jsx

// ─── Sub-component: ATS Score display ─────────────────────────────────────────
// Breaking into sub-components keeps the code readable.
// This is a component inside a component file — totally fine for small helpers.
function ScoreDisplay({ score }) {
    // Ternary chaining: if score >= 70 → green, else if >= 40 → orange, else → red
    const color = score >= 70 ? "#22c55e" : score >= 40 ? "#f97316" : "#ef4444";
    const label = score >= 70 ? "Good" : score >= 40 ? "Needs Work" : "Poor";

    return (
        <div style={{ textAlign: "center", margin: "24px 0", padding: "24px",
                      background: "#f9fafb", borderRadius: "12px" }}>
            <div style={{ fontSize: "64px", fontWeight: "bold", color }}>
                {score}
            </div>
            <div style={{ fontSize: "20px", fontWeight: "600", color }}>
                ATS Score — {label}
            </div>
            <div style={{ color: "#6b7280", fontSize: "14px", marginTop: "8px" }}>
                Out of 100
            </div>
        </div>
    );
}
// ─────────────────────────────────────────────────────────────────────────────

function ResultsPanel({ analysis }) {
    // Guard clause — don't render if no analysis data
    if (!analysis) return null;

    return (
        <div style={{ marginTop: "32px" }}>

            {/* ── ATS Score ─────────────────────────────────────────────── */}
            <ScoreDisplay score={analysis.ats_score} />

            {/* ── Missing Sections ──────────────────────────────────────── */}
            <section style={{ marginBottom: "24px" }}>
                <h3>Missing Sections</h3>
                {analysis.missing_sections.length === 0 ? (
                    <p style={{ color: "#22c55e" }}>
                        ✅ All major sections are present
                    </p>
                ) : (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {analysis.missing_sections.map((section, index) => (
                            // key={index} is required when rendering lists in React
                            // It helps React track which items changed
                            <span key={index} style={{
                                background: "#fef2f2", color: "#dc2626",
                                padding: "4px 12px", borderRadius: "99px",
                                fontSize: "14px", border: "1px solid #fecaca"
                            }}>
                                ❌ {section}
                            </span>
                        ))}
                    </div>
                )}
            </section>

            {/* ── Verb Replacements ─────────────────────────────────────── */}
            <section style={{ marginBottom: "24px" }}>
                <h3>Weak Action Verbs</h3>
                {Object.keys(analysis.suggested_replacements).length === 0 ? (
                    <p style={{ color: "#22c55e" }}>✅ No weak verbs found</p>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ background: "#f3f4f6" }}>
                                <th style={{ padding: "10px", textAlign: "left",
                                             border: "1px solid #e5e7eb" }}>
                                    Found in Resume
                                </th>
                                <th style={{ padding: "10px", textAlign: "left",
                                             border: "1px solid #e5e7eb" }}>
                                    Better Alternative
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Object.entries() converts {key: val} to [[key, val], ...]
                                so you can .map() over it */}
                            {Object.entries(analysis.suggested_replacements).map(
                                ([weak, strong], index) => (
                                    <tr key={index}>
                                        <td style={{ padding: "10px", color: "#ef4444",
                                                     border: "1px solid #e5e7eb" }}>
                                            {weak}
                                        </td>
                                        <td style={{ padding: "10px", color: "#22c55e",
                                                     border: "1px solid #e5e7eb" }}>
                                            {strong}
                                        </td>
                                    </tr>
                                )
                            )}
                        </tbody>
                    </table>
                )}
            </section>

            {/* ── Section Feedback ──────────────────────────────────────── */}
            <section style={{ marginBottom: "24px" }}>
                <h3>Section Feedback</h3>
                {analysis.section_feedback.map((item, index) => (
                    <div key={index} style={{
                        marginBottom: "12px", padding: "16px",
                        border: "1px solid #e5e7eb", borderRadius: "8px",
                        borderLeft: `4px solid ${item.present ? "#22c55e" : "#ef4444"}`
                    }}>
                        <div style={{ fontWeight: "600", marginBottom: "6px" }}>
                            {item.present ? "✅" : "❌"} {item.section}
                        </div>
                        <p style={{ color: "#374151", margin: 0 }}>{item.feedback}</p>
                    </div>
                ))}
            </section>

            {/* ── Overall Summary ───────────────────────────────────────── */}
            <section>
                <h3>Overall Summary</h3>
                <p style={{ lineHeight: "1.7", color: "#374151",
                            padding: "16px", background: "#f9fafb",
                            borderRadius: "8px" }}>
                    {analysis.overall_summary}
                </p>
            </section>
        </div>
    );
}

export default ResultsPanel;
```

**What to type yourself:** The section-feedback mapping and the Object.entries() table.
These two patterns (`.map()` for arrays, `Object.entries()` for objects) are the most
common React rendering patterns you'll use forever.

---

### 4.4 `App.jsx`

**What it is:** The root component. Owns all state. Orchestrates everything.
Think of it as the `main.py` of the frontend.

**State machine:** This component has 4 possible states:
```
"idle"    → show only the DropZone
"loading" → show DropZone (disabled) with spinner text
"done"    → show results + "Analyze Another" button
"error"   → show error message + "Try Again" button
```

One `status` string drives all of this. Clean and predictable.

```jsx
// App.jsx

// ─── Imports ──────────────────────────────────────────────────────────────────
import { useState } from "react";
// useState is a React hook that gives a component memory.
// When you call setStatus("loading"), React re-renders the component
// with the new value of status.

import DropZone from "./components/DropZone";
import ResultsPanel from "./components/ResultsPanel";
import { analyzeResume } from "./api/resumeService";
// ─────────────────────────────────────────────────────────────────────────────

function App() {
    // useState(initialValue) returns [currentValue, setterFunction]
    // Convention: name the setter "set" + the variable name
    const [status, setStatus] = useState("idle");       // "idle" | "loading" | "done" | "error"
    const [analysis, setAnalysis] = useState(null);     // null | ResumeAnalysis object
    const [error, setError] = useState(null);           // null | error message string

    // ── handleFile: called when user drops/selects a file ─────────────────────
    async function handleFile(file) {
        // Reset everything and go to loading state
        setStatus("loading");
        setError(null);
        setAnalysis(null);

        try {
            // analyzeResume returns the analysis object on success,
            // or throws an Error on failure
            const data = await analyzeResume(file);
            setAnalysis(data);
            setStatus("done");
        } catch (err) {
            // err.message comes from the "throw new Error(...)" in resumeService.js
            setError(err.message);
            setStatus("error");
        }
    }

    // ── handleReset: go back to idle ──────────────────────────────────────────
    function handleReset() {
        setStatus("idle");
        setAnalysis(null);
        setError(null);
    }

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div style={{
            maxWidth: "800px",
            margin: "0 auto",
            padding: "40px 20px",
            fontFamily: "system-ui, sans-serif"
        }}>
            <h1 style={{ marginBottom: "8px" }}>Resume Analyzer</h1>
            <p style={{ color: "#6b7280", marginBottom: "32px" }}>
                Upload your PDF resume to get ATS feedback and suggestions.
            </p>

            {/* DropZone is always visible. isLoading prop disables it during analysis. */}
            <DropZone
                onFileSelected={handleFile}
                isLoading={status === "loading"}
            />

            {/* Error state: only renders when status === "error" */}
            {status === "error" && (
                <div style={{
                    marginTop: "20px", padding: "16px",
                    background: "#fef2f2", border: "1px solid #fecaca",
                    borderRadius: "8px", color: "#dc2626"
                }}>
                    <strong>Something went wrong:</strong> {error}
                    <br />
                    <button
                        onClick={handleReset}
                        style={{ marginTop: "12px", cursor: "pointer" }}
                    >
                        Try Again
                    </button>
                </div>
            )}

            {/* Results: only renders when status === "done" */}
            {status === "done" && (
                <>
                    <button
                        onClick={handleReset}
                        style={{
                            marginTop: "24px", padding: "10px 20px",
                            cursor: "pointer", borderRadius: "8px",
                            background: "#f3f4f6", border: "1px solid #d1d5db"
                        }}
                    >
                        ↩ Analyze Another Resume
                    </button>
                    <ResultsPanel analysis={analysis} />
                </>
            )}
        </div>
    );
}

export default App;
```

**What to type yourself:** The three `useState` declarations and the `handleFile` function.
Understanding state transitions is the core React concept. Trace through manually:
1. `status` starts as `"idle"` → DropZone renders normally
2. User drops file → `handleFile` sets `status` to `"loading"` → React re-renders → DropZone is disabled
3. API returns → `status` becomes `"done"` → React re-renders → ResultsPanel appears

---

## 5. How Everything Connects — End to End

```
App.jsx (status = "idle")
  └── renders DropZone

User drops PDF
  └── DropZone.onDrop fires
      └── calls onFileSelected(file)     ← App.jsx's handleFile()
          └── setStatus("loading")
              └── analyzeResume(file)    ← resumeService.js
                  └── FormData.append("file", file)
                      └── fetch POST to /api/resume/analyze
                          ↓
                      FastAPI router/resume.py
                          └── await file.read()       → bytes
                              └── extract_text(bytes) → string  [pdf_parser.py]
                                  └── run_analysis(text)        [llm.py]
                                      └── OpenAI API call
                                          └── model_validate_json()
                                              └── returns ResumeAnalysis object
                          ↑
                      FastAPI serializes → JSON response
                          └── response.json() in resumeService.js
                              └── data returned to handleFile()
                                  └── setAnalysis(data)
                                      └── setStatus("done")
                                          └── React re-renders
                                              └── ResultsPanel renders with analysis data
```

---

## 6. Build & Test Order

Do this strictly. Don't skip ahead.

```
Step 1: schemas.py
        → Just define the models. No testing needed. This is your contract.

Step 2: pdf_parser.py  
        → Write it, then test with a real PDF in a standalone script.
          python test_parser.py → should print resume text.

Step 3: llm.py
        → Test in isolation: hardcode a resume text string, call run_analysis(),
          print the result. Fix any JSON/schema issues here before connecting to router.

Step 4: router/resume.py + main.py
        → Run uvicorn, open /docs, upload a PDF through the interactive docs.
          Does it return a JSON analysis? Good. If not, debug here.

Step 5: resumeService.js
        → Implement it. Test by calling it from the browser console or a temp button.

Step 6: DropZone.jsx
        → Just console.log the file on drop. No API call yet.
          Verify the File object looks right.

Step 7: Connect DropZone to resumeService in App.jsx
        → Log the result, don't render anything yet.
          Verify the analysis object in console.

Step 8: ResultsPanel.jsx
        → Hardcode a mock analysis object as a prop and style it.
          Don't connect real data until the rendering looks right.

Step 9: Connect everything in App.jsx
        → Real file → real API → real results rendered.
```

---

## 7. What to Type Yourself (Your 30–40%)

These are the things that will stick if you actually type them:

| File | Type Yourself |
|------|--------------|
| schemas.py | All of it — it's 25 lines of pure learning |
| pdf_parser.py | The `extract_text` function body |
| llm.py | The `run_analysis` function body |
| router/resume.py | The route function — all the validation logic |
| main.py | The router registration + CORS setup |
| resumeService.js | The FormData construction + fetch call |
| DropZone.jsx | The useDropzone config + conditional JSX |
| App.jsx | The three useState lines + handleFile function |
| ResultsPanel.jsx | The two .map() sections |

Everything else (imports, boilerplate, styling) you can copy. But the above is where
the actual learning happens.

---

## 8. Quick Reference — Imports Cheat Sheet

### Backend

| Import | Why |
|--------|-----|
| `from pydantic import BaseModel` | Base class for all data models |
| `from typing import List` | For type hints like `List[str]` |
| `import fitz` | PyMuPDF — PDF parsing |
| `from openai import AzureOpenAI` | Azure OpenAI client |
| `from dotenv import load_dotenv` | Read .env file into environment |
| `import os` | `os.getenv()` to read env vars |
| `import json` | `json.dumps()` to convert schema to string |
| `from fastapi import APIRouter, UploadFile, File, HTTPException` | Core FastAPI primitives |
| `from fastapi.middleware.cors import CORSMiddleware` | CORS headers for browser requests |

### Frontend

| Import | Why |
|--------|-----|
| `import { useState } from "react"` | State management hook |
| `import { useDropzone } from "react-dropzone"` | Drag-and-drop file handling |

---

## 9. Common Bugs You Will Hit

**Backend:**
- `ModuleNotFoundError` → You forgot to activate venv, or forgot to `pip install` something
- `422 Unprocessable Entity` from FastAPI on file upload → Missing `python-multipart`
- `ValidationError` from Pydantic → LLM returned JSON that doesn't match your schema → refine the prompt
- `KeyError` in os.getenv → .env file not found or load_dotenv() not called

**Frontend:**
- CORS error in browser → Backend not running, or wrong port in allow_origins
- File upload 422 from FastAPI → You manually set `Content-Type` header (don't)
- `analysis.missing_sections is not iterable` → analysis is null, check your guard clauses
- Vite env var not working → Must start with `VITE_`, must restart dev server after .env change
