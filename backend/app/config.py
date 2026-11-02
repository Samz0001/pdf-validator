from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./data/app.db"  # postgresql+psycopg://user:pass@host/db in prod
    redis_url: str = "redis://localhost:6379/0"
    use_celery: bool = False  # False -> FastAPI BackgroundTasks (handy for local dev)
    storage_dir: str = "./data/storage"
    s3_bucket: str | None = None  # set to switch to S3-compatible storage
    s3_endpoint: str | None = None  # e.g. http://minio:9000
    s3_region: str = "us-east-1"
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:8080"]
    max_upload_mb: int = 50


settings = Settings()
