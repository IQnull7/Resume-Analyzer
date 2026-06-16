const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function analyzeResume(file){
    const formData = new FormData();
    formData.append("file", file); /*file name must match the para-name in fastapi route (async def analyze_resume(file: UploadFile))                           
                                    ^^^^ */
    const response = await fetch(`${BASE_URL}/api/resume/analyse`,{
        method: "POST",
        body: formData,
    });
    
    if(!response.ok){
        const errorData = await response.json();
        throw new Error(errorData.detail || "Analysis Failed.");
    }

    return response.json();
    

}