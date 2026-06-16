function ScoreDisplay({ score }) {
    const color = score >= 80 ? "#22c55e" : score >= 50 ? "#f97316" : "#ef4444";
    const label = score >= 80 ? "Good" : score >= 50 ? "Needs Work" : "Poor";

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
function ResultsPanel({ analysis }) {
    if (!analysis) return null;

    return (
        <div style={{ marginTop: "32px" }}>

            {/* ATS Score */}
            <ScoreDisplay score={analysis.ats_score} />

            {/*Missing Sections */}
            <section style={{ marginBottom: "24px" }}>
                <h3>Missing Sections</h3>
                {analysis.missing_sections.length === 0 ? (
                    <p style={{ color: "#22c55e" }}>
                        ✅ All major sections are present
                    </p>
                ) : (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {analysis.missing_sections.map((section, index) => (
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

            {/* Verb Replacements */}
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

            {/* Section Feedback */}
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

            {/*Overall Summary */}
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
