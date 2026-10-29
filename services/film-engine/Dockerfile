FROM python:3.12-slim
WORKDIR /workspace/services/film-engine
COPY services/film-engine/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/film-engine/app ./app
COPY src /workspace/src
COPY configs /workspace/configs
ENV CINEMESH_ENGINE_DB=/data/film-engine.db
EXPOSE 8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
