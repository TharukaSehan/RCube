FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Install OS-level deps needed by some Python packages (OpenCV, etc.)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       build-essential \
       ca-certificates \
       libgl1 \
       libglib2.0-0 \
       libsm6 \
       libxrender1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy backend source
COPY backend /app/backend

EXPOSE 8000

# Run the FastAPI app with Uvicorn
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
