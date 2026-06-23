from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {
        "message": "Voice Agent Backend Running"
    }