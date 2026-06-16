import { useDropzone } from "react-dropzone";

function DropZone({ onFileSelected, isLoading }) {
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        accept: { "application/pdf": [".pdf"] },
        maxFiles: 1,
        disabled: isLoading,
        onDrop: (acceptedFiles) => {
            if (acceptedFiles.length > 0) {
                onFileSelected(acceptedFiles[0]);
            }
        }
    });

    return (
        <div
            {...getRootProps()}
            className={`
                relative border-2 border-dashed rounded-2xl p-14 text-center
                transition-all duration-300 ease-in-out
                ${isDragActive
                    ? "border-indigo-400 bg-indigo-50 scale-[1.02] shadow-lg"
                    : "border-slate-300 bg-white hover:border-indigo-300 hover:bg-slate-50 shadow-sm"
                }
                ${isLoading ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}
            `}
        >
            <input {...getInputProps()} />

            {isLoading ? (
                <div className="space-y-3">
                    {/* Spinner */}
                    <div className="mx-auto w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                    <p className="text-lg font-medium text-slate-700">
                        Analyzing your resume...
                    </p>
                    <p className="text-sm text-slate-400">
                        This usually takes 10–20 seconds
                    </p>
                </div>
            ) : isDragActive ? (
                <div className="space-y-2">
                    <p className="text-4xl">📄</p>
                    <p className="text-lg font-medium text-indigo-600">
                        Drop it here!
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="mx-auto w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-3xl">
                        📎
                    </div>
                    <p className="text-lg font-medium text-slate-700">
                        Drag & drop your PDF resume here
                    </p>
                    <p className="text-sm text-slate-400">
                        or click to select a file
                    </p>
                </div>
            )}
        </div>
    );
}

export default DropZone;