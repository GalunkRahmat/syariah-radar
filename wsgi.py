"""
WSGI Entrypoint for PythonAnywhere & standard WSGI servers.
Wraps the FastAPI ASGI app into WSGI using a2wsgi.
"""
import os
import sys
from pathlib import Path

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from a2wsgi import ASGIMiddleware
from api.app import app

# Standard WSGI callable for PythonAnywhere
application = ASGIMiddleware(app)
