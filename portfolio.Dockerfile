# Dockerfile for production Django app with uv
FROM python:3.12-slim


# Dependencies
# Update apt, make sure to include curl to request uv installer
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates
# Download the latest uv installer
ADD https://astral.sh/uv/install.sh /uv-installer.sh
# Run the installer then remove it
RUN sh /uv-installer.sh && rm /uv-installer.sh
# Ensure the installed binary is on the `PATH`
ENV PATH="/root/.local/bin/:$PATH"


# Install app
WORKDIR  /app
# Copy (dockerignore is a whitelist)
# Install dependencies via uv
COPY pyproject.toml uv.lock /app/
RUN uv venv
RUN uv sync

# Copy the rest
COPY . /app/

# Expose port (Django/gunicorn)
EXPOSE 8080
# Start gunicorn
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT [ "/app/entrypoint.sh" ]
