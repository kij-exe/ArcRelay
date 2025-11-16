from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
import uuid
from fastapi.responses import JSONResponse

app = FastAPI(title="Encode London Hack")

origins = [
    "http://localhost:7654",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/hello")
async def read_hello():
    return {"message": "Hello from FastAPI server"}

@app.get("/public/health")
async def read_health():
    return {"status": "ok"}
