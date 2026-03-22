#!/bin/sh

# Collect static (ensures share volume is filled at container start)
uv run python manage.py collectstatic --noinput
uv run gunicorn portfolio.wsgi:application --bind 0.0.0.0:8080 --workers 2 --threads 2
