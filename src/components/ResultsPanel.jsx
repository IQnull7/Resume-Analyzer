function ScoreDisplay({ score }) {
    const color = score >= 70 ? "text-emerald-500" : score >= 40 ? "text-amber-500" : "text-red-500";
    const bgRing = score >= 70 ? "border-emerald-200 bg-emerald-50" : score >= 40 ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50";
    const label = score >= 70 ? "Good" : score >= 40 ? "Needs Work" : "Poor";

    return (
        <div className={`text-center py-8 px-6 rounded-2xl border-2 ${bgRing}`}>
            <div className={`text-7xl font-extrabold ${color}`}>
                {score}
            </div>
            <div className={`text-xl font-semibold mt-2 ${color}`}>
                ATS Score — {label}
            </div>
            <div className="text-sm text-slate-400 mt-1">Out of 100</div>
        </div>
    );
}

function ResultsPanel({ analysis }) {
    if (!analysis) return null;

    return (
        <div className="mt-8 space-y-6">

            {/* ATS Score */}
            <ScoreDisplay score={analysis.ats_score} />

            {/* Missing Sections */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Missing Sections</h3>
                {analysis.missing_sections.length === 0 ? (
                    <p className="text-emerald-600 font-medium">✅ All major sections are present</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {analysis.missing_sections.map((section, index) => (
                            <span
                                key={index}
                                className="px-3 py-1.5 text-sm font-medium bg-red-50 text-red-600 border border-red-200 rounded-full"
                            >
                                ❌ {section}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Weak Action Verbs */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Weak Action Verbs</h3>
                {Object.keys(analysis.suggested_replacements).length === 0 ? (
                    <p className="text-emerald-600 font-medium">✅ No weak verbs found</p>
                ) : (
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50">
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600 border-b border-slate-200">
                                        Found in Resume
                                    </th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600 border-b border-slate-200">
                                        Better Alternative
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(analysis.suggested_replacements).map(
                                    ([weak, strong], index) => (
                                        <tr key={index} className="border-b border-slate-100 last:border-0">
                                            <td className="px-4 py-3 text-red-500 font-medium">{weak}</td>
                                            <td className="px-4 py-3 text-emerald-600 font-medium">{strong}</td>
                                        </tr>
                                    )
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Section Feedback */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Section Feedback</h3>
                <div className="space-y-3">
                    {analysis.section_feedback.map((item, index) => (
                        <div
                            key={index}
                            className={`p-4 rounded-xl border border-slate-100 border-l-4 ${
                                item.present ? "border-l-emerald-400 bg-emerald-50/30" : "border-l-red-400 bg-red-50/30"
                            }`}
                        >
                            <div className="font-semibold text-slate-800 mb-1">
                                {item.present ? "✅" : "❌"} {item.section}
                            </div>
                            <p className="text-sm text-slate-600 leading-relaxed">{item.feedback}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Overall Summary */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Overall Summary</h3>
                <p className="text-slate-600 leading-relaxed bg-slate-50 p-5 rounded-xl">
                    {analysis.overall_summary}
                </p>
            </div>
        </div>
    );
}

export default ResultsPanel;
