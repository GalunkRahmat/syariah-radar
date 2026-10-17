FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod -R 777 /app

EXPOSE 7860

CMD ["sh", "-c", "uvicorn api.app:app --host 0.0.0.0 --port ${PORT:-7860}"]
