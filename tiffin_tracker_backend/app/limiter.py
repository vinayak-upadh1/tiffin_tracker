from slowapi import Limiter
from slowapi.util import get_remote_address

# Shared rate limiter instance. Attach to app.state.limiter in main.py.
# Routes import this and use @limiter.limit("N/period") decorators.
limiter = Limiter(key_func=get_remote_address)
