import fitz #weird name

def extract_text(pdf_bytes : bytes) -> str: #go through each page and get its text
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()
    doc.close()
    return text



    