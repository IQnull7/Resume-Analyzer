import { useDropzone } from "react-dropzone";

function DropZone({ onFileSelected, isLoading}){
    const{ getRootProps, getInputProps, isDragActive } = useDropzone({
        accept: { "application/pdf": [".pdf"] },
        maxFiles: 1,
        disabled: isLoading,
        onDrop: (acceptedFiles)=> {
            if (acceptedFiles.length > 0) {
                onFileSelected(acceptedFiles[0]);
            }
        }
    });
    return (
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
        > <input {...getInputProps()} />
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
                    <p style={{ fontSize: "18px" }}>📎 Drag & drop your PDF resume here</p>
                    <p style={{ color: "#888", fontSize: "14px" }}>or click to select a file</p>
                </div>
            )}
        </div>
    );
}

export default DropZone;