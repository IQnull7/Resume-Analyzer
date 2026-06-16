import { useState } from "react";
import DropZone from "./components/DropZone";
import ResultsPanel from "./components/ResultsPanel";
import { analyzeResume } from "./api/resumeService";

function App() {
    // Three pieces of state that drive the entire UI
    const [status, setStatus] = useState("idle");       // "idle" | "loading" | "done" | "error"
    const [analysis, setAnalysis] = useState(null);     // null | ResumeAnalysis object
    const [error, setError] = useState(null);           // null | error message string

    // Called when user drops/selects a file in the DropZone
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

    // Go back to idle state
    function handleReset() {
        setStatus("idle");
        setAnalysis(null);
        setError(null);
    }

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
