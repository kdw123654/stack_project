import os

from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"] 
ALLOWED_EMAIL_DOMAIN = os.getenv("ALLOWED_EMAIL_DOMAIN", "suwon.ac.kr")
STORAGE_BUCKET = os.getenv("STORAGE_BUCKET", "files")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")
SOFFICE_PATH = os.getenv("SOFFICE_PATH", "soffice")
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
GEMINI_MODEL = os.getenv("GEMINI_MODEL", 'gemini-3.1-flash-lite')
CRON_SECRET = os.getenv("CRON_SECRET","")
DATA_GO_KR_API_KEY = os.getenv("DATA_GO_KR_API_KEY", "").strip()
