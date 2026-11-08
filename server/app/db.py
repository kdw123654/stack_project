from supabase import Client, ClientOptions, create_client

from app.config import SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, SUPABASE_URL

_NO_SESSION = ClientOptions(auto_refresh_token=False, persist_session=False)

db: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY, options=_NO_SESSION)


def auth_client() -> Client: 
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY, options=_NO_SESSION)
