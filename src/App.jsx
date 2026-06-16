import { useState } from "react";
import DropZone from "./components/DropZone";
import ResultsPanel from "./components/ResultsPanel";
import { analyzeResume } from "./api/resumeService";

function App() {
    const [status, setStatus] = useState("idle");
    const [analysis, setAnalysis] = useState(null);
    const [error, setError] = useState(null);

    async function handleFile(file) {
        setStatus("loading");
        setError(null);
        setAnalysis(null);

        try {
            const data = await analyzeResume(file);
            setAnalysis(data);
            setStatus("done");
        } catch (err) {
            setError(err.message);
            setStatus("error");
        }
    }

    function handleReset() {
        setStatus("idle");
        setAnalysis(null);
        setError(null);
    }

    return (
        <div className="min-h-screen">
            {/* Header */}
            <header className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white py-8 px-6 shadow-lg">
                <div className="max-w-3xl mx-auto">
                    <h1 className="text-3xl font-bold tracking-tight">
                        📄 Resume Analyzer
                    </h1>
                    <p className="mt-2 text-indigo-100 text-lg">
                        Upload your PDF resume to get ATS feedback and improvement suggestions.
                    </p>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-3xl mx-auto px-6 py-10">
                <DropZone
                    onFileSelected={handleFile}
                    isLoading={status === "loading"}
                />

                {/* Error State */}
                {status === "error" && (
                    <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-5 text-red-700">
                        <p className="font-semibold">⚠️ Something went wrong</p>
                        <p className="mt-1 text-sm">{error}</p>
                        <button
                            onClick={handleReset}
                            className="mt-4 px-4 py-2 text-sm font-medium bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
                        >
                            Try Again
                        </button>
                    </div>
                )}

                {/* Results State */}
                {status === "done" && (
                    <div className="mt-8">
                        <button
                            onClick={handleReset}
                            className="px-5 py-2.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
                        >
                            ↩ Analyze Another Resume
                        </button>
                        <ResultsPanel analysis={analysis} />
                    </div>
                )}
            </main>
        </div>
    );
}

export default App;
