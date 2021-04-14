#!/usr/bin/env python
import os
import debugpy
import sys
debugpy.listen(("0.0.0.0", 3000))
debugpy.wait_for_client()

if __name__ == "__main__":
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "recipes.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)
